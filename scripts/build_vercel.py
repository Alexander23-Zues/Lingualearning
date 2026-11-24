"""Build the React frontend for the existing Vercel/FastAPI project."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_react import main as build_react, public_config


def main():
    output = Path(__file__).resolve().parents[1] / 'public'
    sys.argv = [sys.argv[0], '--hosted', '--output', str(output), *sys.argv[1:]]
    build_react()


if __name__ == '__main__':
    main()
