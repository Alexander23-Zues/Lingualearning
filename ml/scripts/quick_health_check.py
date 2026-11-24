"""Quick health check for the backend."""
import requests
import time

def check_health():
    """Check if backend is running and reading model is loaded."""
    url = "http://127.0.0.1:8000/health"
    
    print("Checking backend health...\n")
    
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        
        data = response.json()
        
        print("=" * 60)
        print("Backend Health Status")
        print("=" * 60)
        print(f"Translation ready: {data.get('ready', False)}")
        print(f"Model version: {data.get('model_version', 'N/A')}")
        print(f"Reading ready: {data.get('reading_ready', False)}")
        print("=" * 60)
        
        if data.get('reading_ready'):
            print("\n✓ Reading practice is WORKING!")
            print("  The /v1/ai/reading endpoint is ready to use.")
            return True
        else:
            print("\n✗ Reading practice is NOT working")
            print("  The reading model failed to load.")
            return False
            
    except requests.exceptions.ConnectionError:
        print("✗ Cannot connect to backend at http://127.0.0.1:8000")
        print("  Make sure the backend is running:")
        print("  cd services/inference && uvicorn app.main:app --port 8000")
        return False
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

if __name__ == "__main__":
    import sys
    success = check_health()
    sys.exit(0 if success else 1)
