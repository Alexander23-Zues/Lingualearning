"""Check staged/tracked source without printing credential values."""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    'private Supabase key': re.compile(rb'sb_secret_[A-Za-z0-9_-]{12,}'),
    'GitHub credential': re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})'),
    'private signing key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
}
EXCLUDED = {'.tools', '.preview', '.vercel', '.cache', 'node_modules', '.dart_tool', '.venv', '.aws'}


def main():
    output = subprocess.check_output(['git', 'ls-files', '--cached', '-z'], cwd=ROOT)
    names = [name.decode('utf-8') for name in output.split(b'\0') if name]
    if not names:
        raise SystemExit('No staged/tracked source files to check. Stage the intended files first.')
    failures = []
    total = 0
    for name in names:
        path = ROOT / name
        parts = Path(name).parts
        if set(parts) & EXCLUDED or parts[0].startswith('flutter_windows_'):
            failures.append(f'{name}: local runtime/cache must not be tracked')
        if path.name == '.env' or (path.name.startswith('.env.') and path.name != '.env.example'):
            failures.append(f'{name}: private environment file must not be tracked')
        if path.name in {'local.properties', 'key.properties'} or path.suffix in {'.jks', '.keystore'}:
            failures.append(f'{name}: local machine/signing configuration must not be tracked')
        data = path.read_bytes()
        total += len(data)
        if len(data) > 50 * 1024 * 1024:
            failures.append(f'{name}: large binary should be stored outside this source repository')
        for label, pattern in PATTERNS.items():
            match = pattern.search(data)
            if match:
                line = data[:match.start()].count(b'\n') + 1
                failures.append(f'{name}:{line}: possible {label}; value omitted')
    if failures:
        raise SystemExit('\n'.join(failures))
    print(f'Checked {len(names)} source files ({total / 1048576:.2f} MiB). No credential patterns or excluded local files found.')


if __name__ == '__main__':
    main()
