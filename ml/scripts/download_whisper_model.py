"""Download Whisper model for reading practice speech recognition."""
import os
from pathlib import Path
from faster_whisper import WhisperModel

# Use whisper-base for balance of speed and accuracy
MODEL_SIZE = "base"
MODELS_DIR = Path(__file__).parent.parent / "models"
MODEL_PATH = MODELS_DIR / f"whisper-{MODEL_SIZE}"

def download_model():
    """Download Whisper model using faster-whisper."""
    print(f"Downloading Whisper {MODEL_SIZE} model...")
    print(f"Target directory: {MODEL_PATH}")
    
    # Create models directory if it doesn't exist
    MODEL_PATH.mkdir(parents=True, exist_ok=True)
    
    # Download and cache the model
    # This will download to the specified directory
    model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8", 
                        download_root=str(MODELS_DIR))
    
    print(f"\n✓ Model downloaded successfully to: {MODEL_PATH}")
    print(f"\nAdd this to services/inference/.env:")
    print(f"READING_MODEL_PATH={MODEL_PATH.absolute()}")
    
    return MODEL_PATH

if __name__ == "__main__":
    try:
        model_path = download_model()
        print("\n✓ Setup complete!")
    except Exception as e:
        print(f"\n✗ Error downloading model: {e}")
        raise
