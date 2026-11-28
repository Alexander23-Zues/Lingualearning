"""Create test audio file for reading practice."""
import wave
import array
import math

def create_test_wav(filename: str, text: str = "Hello world", duration: float = 2.0):
    """Create a simple test WAV file (silence with header)."""
    sample_rate = 16000  # 16 kHz
    n_channels = 1       # Mono
    sample_width = 2     # 16-bit
    
    n_frames = int(sample_rate * duration)
    
    # Create silence (zeros)
    # In a real test, you'd record actual speech
    audio_data = array.array('h', [0] * n_frames)
    
    with wave.open(filename, 'wb') as wav_file:
        wav_file.setnchannels(n_channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_data.tobytes())
    
    print(f"✓ Created test WAV file: {filename}")
    print(f"  - Sample rate: {sample_rate} Hz")
    print(f"  - Channels: {n_channels} (mono)")
    print(f"  - Sample width: {sample_width} bytes (16-bit)")
    print(f"  - Duration: {duration} seconds")
    print(f"  - Size: {len(audio_data.tobytes())} bytes")
    print(f"\nNote: This is a silent audio file for testing the endpoint.")
    print(f"For real testing, record actual speech: \"{text}\"")

if __name__ == "__main__":
    import os
    from pathlib import Path
    
    # Create test directory
    test_dir = Path(__file__).parent.parent / "test_data"
    test_dir.mkdir(exist_ok=True)
    
    # Create test files
    test_file_en = test_dir / "test_reading_en.wav"
    create_test_wav(str(test_file_en), "Hello world", 2.0)
    
    print(f"\n✓ Test audio file created at: {test_file_en}")
