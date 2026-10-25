"""Build Flutter into Vercel's public/ directory using public config only."""
import argparse
import base64
import hashlib
import json
import os
import platform
import subprocess
import tarfile
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'apps' / 'linguakids_app'
FLUTTER_VERSION = '3.44.4'
FLUTTER_ARCHIVE = 'https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.44.4-stable.tar.xz'
FLUTTER_SHA256 = 'c853cda0312a162854c481fe6a1bc286d84fbb74bfab7037c39750061dc9b466'
CACHE = ROOT / '.vercel' / 'cache'


def https_url(value: str, name: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError(f'{name} must be a public HTTPS URL without credentials.')
    if parsed.hostname in {'localhost', '127.0.0.1', '::1'}:
        raise ValueError(f'{name} cannot use a local computer address in a hosted build.')
    if parsed.query or parsed.fragment:
        raise ValueError(f'{name} cannot contain a query or fragment.')
    return value.rstrip('/')


def public_config(environ: dict[str, str]) -> dict[str, str]:
    url = environ.get('SUPABASE_URL', '').strip()
    key = environ.get('SUPABASE_PUBLISHABLE_KEY', '').strip()
    if not url or not key:
        raise ValueError('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the Vercel project before building.')
    https_url(url, 'SUPABASE_URL')
    allowed_key = key.startswith('sb_publishable_')
    if key.count('.') == 2:
        try:
            payload = key.split('.')[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
            allowed_key = claims.get('role') == 'anon'
        except (ValueError, TypeError):
            allowed_key = False
    if not allowed_key:
        raise ValueError('The Flutter client requires a publishable key or legacy anon key. Never use a secret/service-role key.')
    # Only these fields go to Flutter. Server secrets are never copied.
    config = {'SUPABASE_URL': url.rstrip('/'), 'SUPABASE_PUBLISHABLE_KEY': key,
              'API_BASE_URL': '', 'AUTH_REDIRECT_URL': '',
              'ADMIN_SETUP_EMAIL': environ.get('ADMIN_SETUP_EMAIL', '').strip()}
    for name in ('API_BASE_URL', 'AUTH_REDIRECT_URL'):
        if environ.get(name, '').strip():
            config[name] = https_url(environ[name].strip(), name)
    return config


def flutter_sdk(override: str | None = None) -> Path:
    if override:
        executable = Path(override).resolve()
        if not executable.is_file():
            raise ValueError('The requested Flutter executable does not exist.')
        return executable
    if platform.system() != 'Linux' or platform.machine().lower() not in {'x86_64', 'amd64'}:
        raise ValueError('Automatic SDK setup requires Linux x64. For a local build, pass --flutter with your installed executable.')
    sdk_dir = CACHE / f'flutter-{FLUTTER_VERSION}'
    executable = sdk_dir / 'flutter' / 'bin' / 'flutter'
    ready = sdk_dir / '.verified-release'
    if executable.is_file() and ready.is_file() and ready.read_text().strip() == FLUTTER_SHA256:
        return executable
    sdk_dir.mkdir(parents=True, exist_ok=True)
    archive = sdk_dir / 'sdk.tar.xz'
    print(f'Installing the verified Flutter {FLUTTER_VERSION} SDK.', flush=True)
    digest = hashlib.sha256()
    with urlopen(FLUTTER_ARCHIVE, timeout=120) as response, archive.open('wb') as target:
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            target.write(chunk)
    if digest.hexdigest() != FLUTTER_SHA256:
        archive.unlink(missing_ok=True)
        raise ValueError('Flutter archive checksum does not match the pinned release.')
    with tarfile.open(archive, 'r:xz') as bundle:
        bundle.extractall(sdk_dir, filter='data')
    archive.unlink()
    if not executable.is_file():
        raise ValueError('Flutter SDK extraction was incomplete.')
    ready.write_text(FLUTTER_SHA256, encoding='utf-8')
    return executable


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--flutter', help='Existing Flutter executable; avoids downloading another SDK.')
    parser.add_argument('--output', type=Path, default=ROOT / 'public')
    parser.add_argument('--sdk-only', action='store_true')
    parser.add_argument('--check', action='store_true', help='Validate public environment configuration without building.')
    args = parser.parse_args()
    if args.sdk_only:
        print(flutter_sdk(args.flutter))
        return
    config = public_config(dict(os.environ))
    if args.check:
        print('Hosted configuration is valid. Only public client fields will be compiled.')
        return
    executable = flutter_sdk(args.flutter)
    env = dict(os.environ)
    env.setdefault('PUB_CACHE', str(CACHE / 'pub'))
    env['CI'] = 'true'
    CACHE.mkdir(parents=True, exist_ok=True)
    # A file avoids exposing values through command-line interpolation.
    with tempfile.TemporaryDirectory(prefix='client-config-', dir=CACHE) as temp:
        defines = Path(temp) / 'public-config.json'
        defines.write_text(json.dumps(config), encoding='utf-8')
        commands = [
            ['--no-version-check', 'pub', 'get'],
            ['--no-version-check', 'build', 'web', '--release', '--target', 'lib/main.dart',
             '--output', str(args.output.resolve()), '--no-web-resources-cdn', '--no-wasm-dry-run',
             '--dart-define-from-file=' + str(defines)],
        ]
        for command in commands:
            subprocess.run([str(executable), *command], cwd=APP, env=env, check=True)
    if not (args.output / 'index.html').is_file():
        raise ValueError('The Flutter build did not create its index page.')
    print('Connected Flutter app built. The API is exported by index.py.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from error
