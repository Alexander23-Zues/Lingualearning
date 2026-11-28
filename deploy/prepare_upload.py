"""Prepare a fresh, allowlisted cloud upload without local secrets or data."""

import argparse
from pathlib import Path
import shutil
from tempfile import mkdtemp


ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = ("Dockerfile", ".dockerignore", "requirements.txt")
DIRECTORIES = (
    "apps/linguakids_web",
    "services/api/app",
    "services/inference/app",
    "ml/scripts",
    "deploy",
)
EXTRA_FILES = (
    "services/inference/pyproject.toml",
    "scripts/build_react.py",
    "ml/requirements-training.txt",
    ".railway/railway.ts",
    ".railway/package.json",
    ".railway/package-lock.json",
    ".railway/README.txt",
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="New directory for the release")
    parser.add_argument("--include-school-voices", action="store_true",
                        help="Bundle the noncommercial English and Tagalog voice models")
    parser.add_argument("--after-iac-cutover", action="store_true",
                        help="Omit the legacy Railway file only after its configured path has been cleared")
    args = parser.parse_args()
    if args.output is None:
        target = Path(mkdtemp(prefix="linguakids-release-"))
    else:
        target = args.output.resolve()
        if target.is_relative_to(ROOT):
            parser.error("--output must be outside the source tree")
        try:
            target.mkdir(parents=True)
        except FileExistsError:
            parser.error("--output must be a new directory")

    # New releases have no active legacy file. Retain compatibility when this
    # helper is used with an older checkout before its service is cut over.
    legacy_files = ('railway.json',) if (ROOT / 'railway.json').is_file() and not args.after_iac_cutover else ()
    for name in ROOT_FILES + legacy_files:
        shutil.copy2(ROOT / name, target / name)
    for name in DIRECTORIES:
        patterns = ["node_modules", "dist", "__pycache__", ".env", ".env.*"]
        if name == "apps/linguakids_web":
            patterns.append("config.json")
        shutil.copytree(ROOT / name, target / name, ignore=shutil.ignore_patterns(*patterns))
    for name in EXTRA_FILES:
        destination = target / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, destination)
    shutil.copy2(ROOT/'deploy/release.gitignore',target/'.gitignore')
    if args.include_school_voices:
        dockerfile = target / "Dockerfile"
        source = dockerfile.read_text(encoding="utf-8")
        arguments = [line.strip() for line in source.splitlines()
                     if line.strip().startswith('ARG INCLUDE_SCHOOL_VOICES=')]
        default = 'ARG INCLUDE_SCHOOL_VOICES=false'
        enabled = 'ARG INCLUDE_SCHOOL_VOICES=true'
        if len(arguments) != 1 or arguments[0] not in {default, enabled}:
            raise RuntimeError("The Dockerfile school voice build argument changed.")
        if arguments[0] == default:
            dockerfile.write_text(source.replace(default, enabled, 1), encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
