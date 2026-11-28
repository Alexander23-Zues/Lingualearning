"""Prepare and operate a new school installation with no cloud dependencies."""
import argparse
import base64
import hashlib
import hmac
import json
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import time
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[2]
SUPABASE_URL = "https://github.com/supabase/supabase.git"
SUPABASE_REVISION = "189adda99d1b56da55fc5a6ee3f849354aaea92a"


def run(args, **options):
    return subprocess.run([str(arg) for arg in args], check=True, **options)


def setup_credentials(target, site, bind):
    jwt_secret = secrets.token_urlsafe(48)
    header = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"

    def base64url(value):
        return base64.urlsafe_b64encode(value).decode().rstrip("=")

    def token(role):
        now = int(time.time())
        payload = base64url(json.dumps({"role": role, "iss": "supabase", "iat": now,
                                        "exp": now + 5 * 365 * 86400}).encode())
        message = f"{header}.{payload}"
        signature = base64url(hmac.digest(jwt_secret.encode(), message.encode(), "sha256"))
        return f"{message}.{signature}"

    values = {
        "JWT_SECRET": jwt_secret, "ANON_KEY": token("anon"),
        "SERVICE_ROLE_KEY": token("service_role"), "SUPABASE_PUBLISHABLE_KEY": "",
        "SUPABASE_SECRET_KEY": "", "JWT_KEYS": "", "JWT_JWKS": "",
        "DASHBOARD_PASSWORD": secrets.token_hex(24), "POSTGRES_PASSWORD": secrets.token_hex(24),
        "SECRET_KEY_BASE": secrets.token_hex(48), "REALTIME_DB_ENC_KEY": secrets.token_hex(8),
        "VAULT_ENC_KEY": secrets.token_hex(16), "PG_META_CRYPTO_KEY": secrets.token_hex(24),
        "S3_PROTOCOL_ACCESS_KEY_ID": secrets.token_hex(16), "S3_PROTOCOL_ACCESS_KEY_SECRET": secrets.token_hex(32),
        "LOGFLARE_PUBLIC_ACCESS_TOKEN": secrets.token_hex(24), "LOGFLARE_PRIVATE_ACCESS_TOKEN": secrets.token_hex(24),
        "MINIO_ROOT_PASSWORD": secrets.token_hex(24), "LINGUAKIDS_INFERENCE_SECRET": secrets.token_hex(32),
        "SITE_URL": site.geturl(), "SUPABASE_PUBLIC_URL": site.geturl(),
        "API_EXTERNAL_URL": site.geturl() + "/auth/v1",
        "ENABLE_EMAIL_AUTOCONFIRM": "true", "DISABLE_SIGNUP": "true",
        "LINGUAKIDS_BIND": bind, "LINGUAKIDS_HTTPS_PORT": str(site.port or 443),
    }
    lines = (target / ".env.example").read_text(encoding="utf-8").splitlines()
    present = set()
    with (target / ".env").open("x", encoding="utf-8", newline="\n") as env:
        for line in lines:
            key = line.split("=", 1)[0]
            if key in values:
                present.add(key)
                line = f"{key}={values[key]}"
            env.write(line + "\n")
        for key in values.keys() - present:
            env.write(f"{key}={values[key]}\n")


def compose(target, *args, **options):
    return run(["docker", "compose", "--project-directory", target,
                "-p", "linguakids-school", "-f", target / "docker-compose.yml",
                "-f", target / "linguakids.compose.yml", *args], **options)


def stage(target, site, bind, upstream):
    if target.exists():
        raise SystemExit("Choose a new empty path for the school installation.")
    if upstream is None:
        import tempfile

        with tempfile.TemporaryDirectory() as directory:
            upstream = Path(directory) / "supabase"
            run(["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", SUPABASE_URL, upstream])
            run(["git", "-C", upstream, "fetch", "--depth", "1", "origin", SUPABASE_REVISION])
            run(["git", "-C", upstream, "checkout", "--detach", SUPABASE_REVISION])
            run(["git", "-C", upstream, "sparse-checkout", "set", "docker"])
            stage(target, site, bind, upstream)
        return
    revision = run(["git", "-C", upstream, "rev-parse", "HEAD"], stdout=subprocess.PIPE).stdout.decode().strip()
    if revision != SUPABASE_REVISION:
        raise SystemExit("The provided Supabase checkout is at the wrong revision.")
    shutil.copytree(upstream / "docker", target, ignore=shutil.ignore_patterns(".env"))
    local = Path(__file__).resolve().parent
    shutil.copyfile(local / "compose.yml", target / "linguakids.compose.yml")
    shutil.copyfile(local / "Caddyfile", target / "Caddyfile")
    shutil.copytree(ROOT / "supabase/migrations", target / "migrations")
    shutil.copytree(ROOT / "supabase/seed", target / "seed")
    shutil.copyfile(ROOT / "content/lessons/deped-topic-lessons.json", target / "deped-topic-lessons.json")
    shutil.copyfile(Path(__file__), target / "school.py")
    shutil.copyfile(ROOT / "scripts/create_admin.py", target / "create_admin.py")
    setup_credentials(target, site, bind)


def psql(target, sql):
    return compose(target, "exec", "-T", "db", "psql", "-Xq", "-v", "ON_ERROR_STOP=1",
                   "-U", "postgres", "-d", "postgres", "-At", input=sql.encode("utf-8"),
                   stdout=subprocess.PIPE).stdout.decode("utf-8-sig").strip()


def initialize(target):
    psql(target, "create schema if not exists linguakids_install; "
                 "create table if not exists linguakids_install.applied (name text primary key, sha256 text);")
    existing = dict(row.split("|", 1) for row in psql(target,
        "select name,sha256 from linguakids_install.applied;").splitlines())
    files = sorted((target / "migrations").glob("*.sql")) + sorted((target / "seed").glob("*.sql"))
    for path in files:
        name = path.parent.name + "/" + path.name
        if not re.fullmatch(r"[a-zA-Z0-9_./-]+", name):
            raise SystemExit(f"Unexpected SQL filename {name}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if name in existing:
            if existing[name] != digest:
                raise SystemExit(f"Applied SQL changed: {name}")
            continue
        source = path.read_text(encoding="utf-8-sig")
        psql(target, f"begin;\n{source}\ninsert into linguakids_install.applied values ('{name}', '{digest}');\ncommit;")
        print(f"Applied {name}")
    catalog = (target / "deped-topic-lessons.json").read_text(encoding="utf-8")
    quoted = "'" + catalog.replace("'", "''") + "'"
    psql(target, f"""
        insert into public.learning_materials
            (id, kind, title, grade_level, learning_level, summary, status, source_label, body, curriculum)
        select (item->>'id')::uuid, item->>'kind',
            item->>'title', (item->>'grade_level')::smallint,
            item->>'learning_level', item->>'summary',
            item->>'status', item->>'source_label', item->'body', item->'curriculum'
        from jsonb_array_elements({quoted}::jsonb) item
        on conflict (id) do nothing;
        notify pgrst, 'reload schema';
    """)
    print("Loaded the bilingual lesson catalog.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prepare = sub.add_parser("stage")
    prepare.add_argument("target", type=Path)
    prepare.add_argument("--site", required=True)
    prepare.add_argument("--bind", default="0.0.0.0")
    prepare.add_argument("--upstream", type=Path)
    for name in ("start", "initialize", "images", "certificate"):
        sub.add_parser(name).add_argument("target", type=Path)
    args = parser.parse_args()
    target = args.target.resolve()
    if args.command == "stage":
        site = urlsplit(args.site.rstrip("/"))
        if (site.scheme != "https" or not site.hostname or site.username or site.password
                or site.path or site.query or site.fragment):
            parser.error("Use an HTTPS origin, for example https://linguakids.school")
        stage(target, site, args.bind, args.upstream)
    elif args.command == "start":
        compose(target, "up", "-d", "--pull", "never")
    elif args.command == "initialize":
        initialize(target)
    elif args.command == "images":
        compose(target, "config", "--images")
    else:
        compose(target, "cp", "https:/data/caddy/pki/authorities/local/root.crt", target / "linguakids-root.crt")


if __name__ == "__main__":
    main()
