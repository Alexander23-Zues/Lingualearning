"""Build the React browser frontend with an explicit public-config allowlist."""
import argparse
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'apps' / 'linguakids_web'


def public_config(values: dict, hosted: bool = True) -> dict:
    url = values.get('SUPABASE_URL', '').strip()
    key = values.get('SUPABASE_PUBLISHABLE_KEY', '').strip()
    if not url or not key:
        raise ValueError('Supply SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the public app configuration.')
    allowed = key.startswith('sb_publishable_')
    if key.count('.') == 2:
        try:
            payload = key.split('.')[1]
            allowed = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4))).get('role') == 'anon'
        except (ValueError, TypeError):
            allowed = False
    if not allowed:
        raise ValueError('The browser requires a publishable or legacy anon key. Secret/service-role keys are server-only.')
    config = {'SUPABASE_URL': url, 'SUPABASE_PUBLISHABLE_KEY': key,
              'API_BASE_URL': values.get('API_BASE_URL', '').strip(),
              'AUTH_REDIRECT_URL': values.get('AUTH_REDIRECT_URL', '').strip(),
              'ADMIN_SETUP_EMAIL': values.get('ADMIN_SETUP_EMAIL', '').strip()}
    for name in ('SUPABASE_URL', 'API_BASE_URL', 'AUTH_REDIRECT_URL'):
        value = config[name]
        if not value:
            continue
        parsed = urlparse(value)
        local = parsed.hostname in {'localhost', '127.0.0.1', '::1'}
        if not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError(f'{name} must be a public URL without credentials, query, or fragment.')
        if parsed.scheme != 'https' and not (not hosted and local and parsed.scheme == 'http'):
            raise ValueError(f'{name} must use HTTPS, or loopback HTTP for a local build.')
        if hosted and local:
            raise ValueError(f'{name} cannot use a local computer address in a hosted build.')
        config[name] = value.rstrip('/')
    return config


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, default=ROOT / '.preview/live-config.json')
    parser.add_argument('--hosted', action='store_true')
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.preview:
        config = {'PREVIEW': True}
    else:
        values = dict(os.environ) if args.hosted else json.loads(args.config.read_text(encoding='utf-8-sig'))
        config = public_config(values, hosted=args.hosted)
    if args.check:
        print('React client configuration is valid; private environment fields are excluded.')
        return
    public = APP / 'public'
    public.mkdir(parents=True, exist_ok=True)
    (public / 'config.json').write_text(json.dumps(config, indent=2), encoding='utf-8')
    if args.prepare_only:
        print('React public configuration prepared.')
        return
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if not npm:
        raise ValueError('Install Node.js 22.12 or newer, then open LinguaKids again.')
    environment = dict(os.environ)
    environment['CI'] = 'true'
    if args.hosted or not (APP / 'node_modules').is_dir():
        subprocess.run([npm, 'ci', '--include=dev', '--no-audit', '--no-fund'], cwd=APP, env=environment, check=True)
    subprocess.run([npm, 'run', 'build'], cwd=APP, env=environment, check=True)
    built = APP / 'dist'
    if not (built / 'index.html').is_file():
        raise ValueError('React did not produce its browser entry page.')
    if args.output:
        output = args.output.resolve()
        # Only replace generated directories inside this workspace.
        allowed = {ROOT / 'public', ROOT / '.preview/react-preview', ROOT / '.preview/react-live'}
        if output not in {p.resolve() for p in allowed}:
            raise ValueError('Output must be public/, .preview/react-live/, or .preview/react-preview/.')
        if output.exists():
            shutil.rmtree(output)
        shutil.copytree(built, output)
    print('React browser app built successfully. Existing Supabase data and the Python API are retained.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from error
