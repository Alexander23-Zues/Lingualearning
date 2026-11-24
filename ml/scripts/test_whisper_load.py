"""Test if Whisper model loads correctly."""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load .env from inference service
inference_path = Path(__file__).parent.parent.parent / "services" / "inference"
env_file = inference_path / ".env"
load_dotenv(env_file)

# Add inference app to path
sys.path.insert(0, str(inference_path))

from app.reading import ReadingRuntime

def test_model_load():
    """Test loading the Whisper model."""
    model_path = os.getenv("READING_MODEL_PATH", "base")
    print("Testing Whisper model load...")
    print(f"Model path: {model_path}")
    
    try:
        runtime = ReadingRuntime(model_path)
        print("✓ Model loaded successfully!")
        print(f"✓ Model type: {type(runtime.model)}")
        return True
    except Exception as e:
        print(f"✗ Error loading model: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_model_load()
    sys.exit(0 if success else 1)
