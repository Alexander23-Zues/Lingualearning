"""Verify the inference backend can start and reading model loads."""
import os
import sys
import time
import subprocess
import requests
from pathlib import Path

def wait_for_backend(url: str, timeout: int = 30):
    """Wait for backend to be ready."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            response = requests.get(url, timeout=2)
            if response.status_code == 200:
                return True
        except requests.exceptions.RequestException:
            pass
        time.sleep(1)
    return False

def verify_backend():
    """Start backend and verify reading model loads."""
    print("Starting inference backend...\n")
    
    # Start backend
    backend_dir = Path(__file__).parent.parent.parent / "services" / "inference"
    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", 
         "--host", "127.0.0.1", "--port", "8000"],
        cwd=str(backend_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    try:
        # Wait for startup and check logs
        print("Waiting for backend to start...")
        print("\nBackend logs:")
        print("-" * 60)
        
        # Read initial logs
        import select
        for _ in range(100):  # Read up to 100 lines or 5 seconds
            time.sleep(0.05)
            if process.poll() is not None:
                break
            line = process.stdout.readline()
            if line:
                print(line.rstrip())
        
        print("-" * 60)
        
        # Check if process is still running
        if process.poll() is not None:
            print("\n✗ Backend process exited unexpectedly")
            return False
        
        # Check health endpoint
        print("Checking health endpoint...")
        if not wait_for_backend("http://127.0.0.1:8000/health", timeout=10):
            print("✗ Backend health check failed")
            process.terminate()
            return False
        
        response = requests.get("http://127.0.0.1:8000/health")
        health_data = response.json()
        
        print("\n" + "=" * 60)
        print("✓ Backend started successfully!")
        print("=" * 60)
        print(f"\nHealth Check Results:")
        print(f"  Translation ready: {health_data.get('ready', False)}")
        print(f"  Model version: {health_data.get('model_version', 'N/A')}")
        print(f"  Reading ready: {health_data.get('reading_ready', False)}")
        
        if health_data.get('reading_ready'):
            print("\n✓ Reading practice model loaded successfully!")
            print("\nThe /v1/ai/reading endpoint is ready to use.")
        else:
            print("\n✗ Reading practice model failed to load")
            return False
        
        return True
        
    finally:
        # Cleanup
        print("\n\nStopping backend...")
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        print("Backend stopped.")

if __name__ == "__main__":
    try:
        success = verify_backend()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(1)
