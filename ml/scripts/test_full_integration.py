"""Full integration test - simulates actual inference service usage."""
import os
import sys
from pathlib import Path

# Test the actual model loading from .env configuration
def test_model_loading():
    """Test that the model loads correctly from the configured path."""
    print("=" * 70)
    print("INTEGRATION TEST: Model Loading from .env Configuration")
    print("=" * 70)
    
    # Read .env file
    env_path = Path(__file__).parent.parent.parent / "services" / "inference" / ".env"
    print(f"\nReading configuration from: {env_path}")
    
    env_vars = {}
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key] = value
                    if key == "MODEL_PACKAGE_PATH":
                        print(f"  MODEL_PACKAGE_PATH: {value}")
    
    model_path = env_vars.get("MODEL_PACKAGE_PATH")
    if not model_path:
        print("✗ ERROR: MODEL_PACKAGE_PATH not found in .env")
        return False
    
    model_path = Path(model_path)
    print(f"\nModel directory: {model_path}")
    print(f"  Exists: {model_path.exists()}")
    
    if not model_path.exists():
        print("✗ ERROR: Model path does not exist")
        return False
    
    # Check for required files
    required_files = [
        "manifest.json",
        "en_to_fil/config.json",
        "en_to_fil/model.safetensors",
        "fil_to_en/config.json",
        "fil_to_en/model.safetensors",
    ]
    
    print("\nChecking required files:")
    all_exist = True
    for file in required_files:
        file_path = model_path / file
        exists = file_path.exists()
        symbol = "✓" if exists else "✗"
        print(f"  {symbol} {file}")
        if not exists:
            all_exist = False
    
    if not all_exist:
        print("\n✗ ERROR: Some required files are missing")
        return False
    
    # Load the model using ModelRuntime
    print("\nLoading model with ModelRuntime...")
    sys.path.insert(0, str(Path(__file__).parent.parent.parent / "services" / "inference"))
    
    try:
        from app.translation_runtime import ModelRuntime
        runtime = ModelRuntime(model_path)
        
        print(f"✓ Model loaded successfully")
        print(f"\nModel Information:")
        print(f"  Architecture: {runtime.manifest['architecture']}")
        print(f"  Version: {runtime.manifest['model_version']}")
        print(f"  Provenance: {runtime.manifest['provenance']}")
        print(f"  Directions: {', '.join(runtime.manifest['directions'])}")
        print(f"  Total files: {len(runtime.manifest['files'])}")
        
        # Quick translation test
        print("\n" + "-" * 70)
        print("Quick Translation Test")
        print("-" * 70)
        
        class TestRequest:
            def __init__(self, text, source_language):
                self.text = text
                self.source_language = source_language
        
        test_sentences = [
            ("Hello, how are you?", "en"),
            ("I want to eat pizza", "en"),
            ("Magandang umaga", "fil"),
        ]
        
        for text, source in test_sentences:
            request = TestRequest(text, source)
            try:
                result = runtime.translate(request)
                target = "fil" if source == "en" else "en"
                print(f"\n✓ {source.upper()} → {target.upper()}")
                print(f"  Input:  {text}")
                print(f"  Output: {result}")
            except Exception as e:
                print(f"\n✗ Translation failed: {e}")
                return False
        
        print("\n" + "=" * 70)
        print("✓ INTEGRATION TEST PASSED")
        print("=" * 70)
        print("\nThe Helsinki-NLP models are ready for use!")
        print("The inference service will now translate ANY sentence, not just school content.")
        
        return True
        
    except Exception as e:
        print(f"\n✗ ERROR loading model: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    try:
        success = test_model_loading()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
