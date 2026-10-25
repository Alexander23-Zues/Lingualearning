# Windows 11 development setup

## Lightweight prerequisites

1. Install Git, Python 3.11, Flutter stable, Android SDK platform tools, and a code editor.
2. Run `flutter doctor` and resolve Android toolchain issues. A local emulator and container stack are not required.
3. Create a hosted Supabase project. Enable email verification and set the application redirect URLs.
4. Install Supabase CLI only when applying/testing migrations locally or against a linked project.

## Backend

```powershell
cd services/api
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e ".[test]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Copy the root `.env.example` to a local `.env` and supply real project values. Never commit it. Use the current Supabase publishable key in Flutter and keep the secret key server-side only.

## First administrator

After applying migrations, set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` only in the current terminal, then run:

```powershell
python scripts/create_admin.py --email admin@example.org --name "System Administrator"
```

The script prompts for the password, refuses a second administrator bootstrap, and removes the new auth user if promotion fails. All later public registrations remain educators.

## Physical Android device over USB

1. Enable Developer options and USB debugging on the Android phone.
2. Connect by USB, approve the computer, and run `adb devices`.
3. Start FastAPI on port 8000.
4. Run `adb reverse tcp:8000 tcp:8000`.
5. From `apps/linguakids_app`, run Flutter with `--dart-define=API_BASE_URL=http://127.0.0.1:8000` plus Supabase values.
6. If using LAN instead, bind FastAPI to `0.0.0.0`, use the computer's private IPv4 address, allow only the needed Windows Firewall port, and keep both devices on the same trusted network.

No wireless casting guarantee is made. Use Android/desktop screen mirroring or a projector only where the actual device and environment support it.
