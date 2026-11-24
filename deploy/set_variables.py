"""Send existing backend configuration through stdin without printing secrets."""
from pathlib import Path
import secrets
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
values = {}
for line in (ROOT / '.env').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('\"').strip("'")
selected = {key: values[key] for key in ('SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY') if values.get(key)}
if not all(selected.get(key) for key in ('SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY')):
    raise SystemExit('Required existing database configuration is missing.')
selected.update(INFERENCE_SHARED_SECRET=secrets.token_urlsafe(48), ENVIRONMENT='production', ENABLE_TRAINING_WORKER='false', PORT='8080')
npx = shutil.which('npx.cmd') or shutil.which('npx')
for key, value in selected.items():
    result = subprocess.run([npx, '--yes', '@railway/cli', 'variable', 'set', key, '--stdin', '--skip-deploys'],
                            input=value, text=True, capture_output=True, cwd=ROOT)
    if result.returncode:
        raise SystemExit(f'Could not configure {key}; secret-bearing output suppressed.')
print('Cloud runtime configuration saved. Secret values were not printed.')
