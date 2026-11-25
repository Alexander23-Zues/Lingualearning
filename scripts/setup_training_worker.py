"""Native, local credential entry; never serve the secret in a browser or log it."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
from datetime import datetime, timezone

import httpx
from dotenv import dotenv_values

from services.api.app.config import supabase_headers
from ml.scripts.training_readiness import pairs_summary

ROOT = Path(__file__).resolve().parents[1]
PROJECT = 'jdtgakguokulcuirnzkw'
PROJECT_URL = f'https://{PROJECT}.supabase.co'
DATASET_ID = '4b57286e-5edf-473b-8e2f-dab9d1cc2621'
DATASET_SHA256 = '08d9e1588495c5ba3bbe0a640029e1d54876775f99d6c4136e92d264876be1c4'
STATE_FILE = ROOT / '.preview/training-setup-state.json'


class SetupError(Exception):
    """Only fixed, credential-free messages are suitable for the UI."""


def normalize_key(value):
    value = value.strip()
    if len(value) > 4096:
        raise SetupError('Secret key lang ang i-paste; huwag isama ang buong page o configuration.')
    if value.startswith('SUPABASE_SECRET_KEY='):
        value = value.split('=', 1)[1].strip()
    if value[:1] in ('"', "'") and value[-1:] == value[:1]:
        value = value[1:-1]
    if re.fullmatch(r'sb_secret_[A-Za-z0-9_-]{20,}', value):
        return value
    # Legacy service_role JWTs are supported, but not anon/user login tokens.
    if re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', value):
        try:
            payload = value.split('.')[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
            if claims.get('role') == 'service_role' and claims.get('ref') == PROJECT:
                return value
        except (ValueError, UnicodeError, AttributeError):
            pass
    raise SetupError('Gamitin ang secret key ng Linguakids project, hindi publishable key o account password.')


def save_key(env_path, key):
    """Atomically change only this setting, preserving other configuration."""
    key = normalize_key(key)
    original = env_path.read_bytes().decode('utf-8-sig') if env_path.exists() else ''
    newline = '\r\n' if '\r\n' in original else '\n'
    lines, found = [], False
    for line in original.splitlines(keepends=True):
        if re.match(r'^\s*(?:export\s+)?SUPABASE_SECRET_KEY\s*=', line):
            if not found:
                lines.append(f'SUPABASE_SECRET_KEY={key}{newline}')
                found = True
        else:
            lines.append(line)
    if not found:
        if lines and not lines[-1].endswith(('\n', '\r')):
            lines[-1] += newline
        lines.append(f'SUPABASE_SECRET_KEY={key}{newline}')
    temporary = None
    try:
        descriptor, temporary = tempfile.mkstemp(prefix='.env.worker-', suffix='.tmp', dir=env_path.parent)
        with os.fdopen(descriptor, 'w', encoding='utf-8', newline='') as handle:
            handle.write(''.join(lines))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, env_path)
        temporary = None
    finally:
        if temporary:
            Path(temporary).unlink(missing_ok=True)


def request_json(client, method, path, **kwargs):
    try:
        response = client.request(method, path, **kwargs)
        response.raise_for_status()
        return response.json() if response.content else None
    except httpx.HTTPStatusError as error:
        if error.response.status_code in (401, 403):
            raise SetupError('Hindi tinanggap ang key o kulang ang worker access. Kopyahin ang secret key ng tamang project.') from None
        raise SetupError('Hindi natuloy ang Supabase request. Walang key na ipinakita o ipinadala sa ibang host.') from None
    except (httpx.HTTPError, ValueError):
        raise SetupError('Hindi makakonekta sa Supabase. Suriin ang internet at subukan muli.') from None


def training_payload(record):
    data = record['data']
    if record.get('status') != 'published' or data.get('dataset_version') != DATASET_SHA256:
        raise SetupError('Nagbago ang development dataset. Kailangan itong i-review bago mag-train.')
    if data.get('training_scope') != 'development only' or data.get('classroom_approved') is not False:
        raise SetupError('Kailangan ang orihinal na development-only review scope.')
    pairs = [{'english': p.get('en'), 'filipino': p.get('fil')} for p in data.get('pairs', [])]
    try:
        pairs_summary(pairs)
    except (ValueError, AttributeError, TypeError):
        raise SetupError('Hindi pumasa ang dataset validation. Walang training job na ginawa.') from None
    material = json.dumps(pairs, ensure_ascii=False, sort_keys=True).encode()
    if not data.get('source_url') or not data.get('license'):
        raise SetupError('Kulang ang dataset source o lisensiya.')
    return {'created_by': record['owner_id'], 'dataset_record_id': record['id'],
        'dataset_snapshot': {'pairs': pairs, 'source': data['source_url'], 'license': data['license'],
            'checksum': hashlib.sha256(material).hexdigest(),
            'metadata': {name: data[name] for name in ('attribution', 'license_url', 'modifications',
                'review_notes', 'classroom_approved', 'source_archive_sha256', 'dataset_version', 'purpose', 'training_scope') if name in data}},
        'configuration': {'epochs': 1, 'batch_size': 2, 'requested_via': 'local_training_setup'}, 'status': 'queued'}


def inspect_access(client):
    request_json(client, 'GET', 'ai_training_jobs', params={'select': 'id', 'limit': '0'})
    records = request_json(client, 'GET', 'workspace_records', params={'id': f'eq.{DATASET_ID}', 'kind': 'eq.dataset'})
    if not records or len(records) != 1:
        raise SetupError('Hindi makita ang development dataset sa Linguakids project.')
    payload = training_payload(records[0])
    owners = request_json(client, 'GET', 'profiles', params={'id': f"eq.{payload['created_by']}",
        'role': 'eq.administrator', 'status': 'eq.active', 'select': 'id'})
    if not owners:
        raise SetupError('Kailangan ng aktibong administrator na may-ari ng dataset.')
    return payload


def ensure_job(client, payload):
    existing = request_json(client, 'GET', 'ai_training_jobs', params={
        'dataset_record_id': f'eq.{DATASET_ID}', 'order': 'created_at.desc', 'limit': '1', 'select': 'id,status'})
    if existing:
        return {**existing[0], 'reused': True}
    created = request_json(client, 'POST', 'ai_training_jobs', headers={'Prefer': 'return=representation'}, json=payload)
    if not created:
        raise SetupError('Hindi nakumpirma ang bagong job. Suriin ang AI Management bago ulitin.')
    return {'id': created[0]['id'], 'status': created[0]['status'], 'reused': False}


def state(phase, message, **values):
    STATE_FILE.parent.mkdir(exist_ok=True)
    value = {'phase': phase, 'message': message, 'updated_at': datetime.now(timezone.utc).isoformat(), **values}
    temporary = STATE_FILE.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2), encoding='utf-8')
    os.replace(temporary, STATE_FILE)


def configure(key, start_job, update):
    key = normalize_key(key)
    config = dotenv_values(ROOT / '.env')
    if config.get('SUPABASE_URL', '').rstrip('/') != PROJECT_URL:
        raise SetupError('Hindi tumutugma ang local configuration sa Linguakids project.')
    update('checking', 'Chine-check ang key at development dataset...')
    with httpx.Client(base_url=PROJECT_URL + '/rest/v1/', headers=supabase_headers(key),
                      timeout=25, follow_redirects=False) as client:
        payload = inspect_access(client)
        save_key(ROOT / '.env', key)
        update('starting', 'Valid ang key. Sine-save nang lokal at sinisimulan ang worker...', key_saved=True)
        executable = shutil.which('pwsh') or shutil.which('powershell')
        if not executable:
            raise SetupError('Na-save ang valid key; hindi makita ang worker launcher runtime.')
        try:
            outcome = subprocess.run([executable, '-NoProfile', '-File', str(ROOT / 'scripts/start_training_worker.ps1'),
                # A background child can inherit pipe handles after PowerShell
                # exits. Waiting for those pipes would stall setup indefinitely.
                '-Background'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        except (OSError, subprocess.TimeoutExpired):
            raise SetupError('Na-save ang valid key; hindi makumpirma ang worker startup. Suriin ang local worker status bago ulitin.') from None
        if outcome.returncode:
            raise SetupError('Na-save ang valid key; hindi pumasa ang worker readiness check. Suriin ang training setup guide.')
        if start_job:
            job = ensure_job(client, payload)
            update('ready', f"Worker started. Development job: {job['status']}. Tingnan ang AI Management.",
                   key_saved=True, worker_started=True, job=job)
        else:
            update('ready', 'Worker started. Puwede nang mag-queue sa AI Management.', key_saved=True, worker_started=True)


def main():
    import tkinter as tk
    from tkinter import ttk
    import webbrowser
    import queue
    events = queue.Queue()
    window = tk.Tk()
    window.title('LinguaKids - Training Setup')
    window.geometry('650x580')
    window.minsize(620, 560)
    window.configure(background='#f6f3ff')
    style = ttk.Style(window)
    style.theme_use('clam')
    style.configure('TFrame', background='#f6f3ff')
    style.configure('TLabel', background='#f6f3ff', foreground='#2c2053', font=('Segoe UI', 11))
    style.configure('Title.TLabel', font=('Segoe UI', 19, 'bold'))
    style.configure('TButton', font=('Segoe UI', 11), padding=9)
    style.configure('TCheckbutton', font=('Segoe UI', 10), background='#f6f3ff')
    body = ttk.Frame(window, padding=26)
    body.pack(fill='both', expand=True)
    ttk.Label(body, text='I-connect ang training worker', style='Title.TLabel').pack(anchor='w')
    ttk.Label(body, text='Linguakids project: jdtgakguokulcuirnzkw', padding=(0, 6)).pack(anchor='w')
    ttk.Label(body, text='1. Buksan ang Supabase API Keys at kopyahin ang secret key.\n2. I-paste ito dito. Hindi ito ipapakita sa chat o browser app.',
              wraplength=570, padding=(0, 8)).pack(anchor='w')
    ttk.Button(body, text='Buksan ang Supabase API Keys', command=lambda: webbrowser.open(
        f'https://supabase.com/dashboard/project/{PROJECT}/settings/api-keys')).pack(anchor='w', pady=3)
    ttk.Label(body, text='Supabase secret key', padding=(0, 9, 0, 3)).pack(anchor='w')
    entry = ttk.Entry(body, show='*', font=('Segoe UI', 12))
    entry.pack(fill='x', ipady=5)
    start_job = tk.BooleanVar(value=True)
    ttk.Checkbutton(body, text='Simulan ang isang development training run (1 epoch)', variable=start_job).pack(anchor='w', pady=10)
    message = tk.StringVar(value='Lokal na .env lang ang pagse-save-an ng key. Development model lang ang output.')
    ttk.Label(body, textvariable=message, wraplength=570).pack(anchor='w', pady=6)
    running = False

    def update(phase, text, **values):
        state(phase, text, **values)
        events.put((phase, text))

    def work(value, queue_job):
        try:
            configure(value, queue_job, update)
        except SetupError as error:
            update('error', str(error))
        except Exception:
            update('error', 'Hindi natapos ang setup. Walang key na isinulat sa logs. Suriin ang setup guide.')
        finally:
            value = None

    def submit():
        nonlocal running
        if running:
            return
        value = entry.get()
        try:
            value = normalize_key(value)
        except SetupError as error:
            message.set(str(error))
            return
        entry.delete(0, 'end')
        running = True
        button.configure(state='disabled')
        entry.configure(state='disabled')
        threading.Thread(target=work, args=(value, start_job.get()), daemon=True).start()

    def refresh():
        nonlocal running
        try:
            while True:
                phase, text = events.get_nowait()
                message.set(text)
                if phase in ('error', 'ready'):
                    running = False
                    entry.configure(state='normal')
                    button.configure(state='normal')
                    if phase == 'ready':
                        button.configure(text='Tapos - buksan ang LinguaKids', command=lambda: webbrowser.open('http://localhost:3000/'))
        except queue.Empty:
            pass
        window.after(200, refresh)

    button = ttk.Button(body, text='I-save at simulan ang worker', command=submit)
    button.pack(anchor='w', pady=8)
    # Avoid terminating a partially completed setup by closing its input window.
    def close():
        if running:
            message.set('Tinatapos pa ang setup. Hintaying lumabas ang resulta bago isara.')
        else:
            window.destroy()
    window.protocol('WM_DELETE_WINDOW', close)
    state('waiting_for_key', 'Native setup window is waiting for the owner to paste the Supabase secret key.')
    entry.focus_set()
    window.after(200, refresh)
    window.lift()
    window.mainloop()


if __name__ == '__main__':
    main()
