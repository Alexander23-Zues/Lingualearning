import argparse
import getpass
import os
import sys

import httpx


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the first LinguaKids administrator securely.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()

    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    secret_key = os.environ.get("SUPABASE_SECRET_KEY", "")
    if not supabase_url or not secret_key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SECRET_KEY in this terminal. Do not put them in source code.")
    password = getpass.getpass("Initial administrator password (12+ characters): ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        sys.exit("Passwords do not match.")
    if len(password) < 12:
        sys.exit("Use at least 12 characters.")

    headers = {"apikey": secret_key, "Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"}
    created_user_id = None
    with httpx.Client(timeout=20) as client:
        response = client.post(
            f"{supabase_url}/auth/v1/admin/users",
            headers=headers,
            json={
                "email": args.email.strip(),
                "password": password,
                "email_confirm": True,
                "user_metadata": {"name": args.name.strip(), "grade_levels": []},
            },
        )
        if response.status_code >= 400:
            sys.exit(f"Auth user creation failed ({response.status_code}): {response.text}")
        created_user_id = response.json()["id"]
        bootstrap = client.post(
            f"{supabase_url}/rest/v1/rpc/bootstrap_administrator",
            headers=headers,
            json={"p_user_id": created_user_id},
        )
        if bootstrap.status_code >= 400:
            client.delete(f"{supabase_url}/auth/v1/admin/users/{created_user_id}", headers=headers)
            sys.exit(f"Administrator bootstrap failed and the new auth user was removed: {bootstrap.text}")
    print(f"Administrator created for {args.email.strip()}. Remove SUPABASE_SECRET_KEY from the terminal environment now.")


if __name__ == "__main__":
    main()
