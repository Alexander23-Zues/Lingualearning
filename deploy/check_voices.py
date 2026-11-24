"""Smoke-test both pronunciation voices without saving audio."""
import asyncio
import edge_tts

async def main():
    for text, voice in [('Magandang umaga. Aklat at araw.', 'fil-PH-AngeloNeural'),
                        ('Good morning. Book and sun.', 'en-US-AriaNeural')]:
        size = 0
        async for chunk in edge_tts.Communicate(text, voice).stream():
            if chunk['type'] == 'audio':
                size += len(chunk['data'])
        assert size > 0
        print(f'{voice}: audio generated ({size} bytes)')

if __name__ == '__main__':
    asyncio.run(main())
