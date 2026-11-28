"""Run API and private inference together; terminate both when either fails."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def main():
    from scripts.build_react import public_config
    public_environment = dict(os.environ)
    if public_environment.get('PUBLIC_SUPABASE_URL'):
        public_environment['SUPABASE_URL'] = public_environment['PUBLIC_SUPABASE_URL']
    public_config(public_environment, hosted=True)
    if not os.environ.get('INFERENCE_SHARED_SECRET'):
        raise SystemExit('Set a private INFERENCE_SHARED_SECRET before starting cloud services.')
    storage = Path(os.environ.get('MODEL_STORAGE_PATH', '/data/models'))
    storage.mkdir(parents=True, exist_ok=True)
    bundled = Path('/app/services/inference/models')
    os.environ.setdefault('MODEL_PACKAGE_PATH', str(bundled / 'opus-baseline-v1'))
    os.environ.setdefault('READING_MODEL_PATH', str(bundled / 'whisper-tiny'))
    os.environ.setdefault('TRAINING_BASE_PACKAGE_PATH', str(bundled / 'opus-baseline-v1'))
    os.environ.setdefault('MODEL_PACKAGE_ROOT', str(storage / 'releases'))
    if (bundled / 'voices').is_dir():
        os.environ.setdefault('TTS_MODEL_ROOT', str(bundled / 'voices'))
    os.environ.setdefault('MALLOC_ARENA_MAX', '2')
    os.environ.setdefault('ONEDNN_PRIMITIVE_CACHE_CAPACITY', '0')
    os.environ.setdefault('DNNL_PRIMITIVE_CACHE_CAPACITY', '0')
    os.environ.setdefault('SPEECH_NEURAL_ENABLED', 'true')
    os.environ.setdefault('SPEECH_CACHE_PATH', str(storage.parent / 'speech'))
    os.environ.setdefault('SPEECH_LIBRARY_PATH', '/app/public/voices')
    os.environ['INFERENCE_BASE_URL'] = 'http://127.0.0.1:8001'
    memory_limit = Path('/sys/fs/cgroup/memory.max')
    if memory_limit.is_file():
        print('Container memory limit: ' + memory_limit.read_text().strip())
    processes = []
    def stop(*_):
        for process in processes:
            process.terminate()
        for process in processes:
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        for module, host, port in [('services.inference.app.main:app', '127.0.0.1', '8001'), ('deploy.web:app', '0.0.0.0', os.environ.get('PORT', '8080'))]:
            processes.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', module, '--host', host, '--port', port]))
        if os.environ.get('ENABLE_TRAINING_WORKER', '').lower() == 'true':
            if not os.environ.get('SUPABASE_SECRET_KEY'):
                raise RuntimeError('Training requires the server-only SUPABASE_SECRET_KEY.')
            processes.append(subprocess.Popen([sys.executable, '-m', 'ml.scripts.training_worker', '--output', '/data/training/jobs']))
        while all(process.poll() is None for process in processes):
            time.sleep(1)
        failed = next(process for process in processes if process.poll() is not None)
        memory_events = Path('/sys/fs/cgroup/memory.events')
        if failed.returncode == -signal.SIGKILL and memory_events.is_file():
            print('Container memory counters: ' + ', '.join(memory_events.read_text().splitlines()))
        raise RuntimeError(f'A cloud service exited with code {failed.returncode}; restarting the service group.')
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()


if __name__ == '__main__':
    main()
