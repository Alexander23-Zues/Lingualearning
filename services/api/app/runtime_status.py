"""A manifest on disk is installation evidence, not proof of a responding model."""
import httpx
async def checked_model_status(settings,configured):
    health={}
    try:
        async with httpx.AsyncClient(timeout=4) as client:
            response=await client.get(settings.inference_base_url.rstrip('/')+'/health')
            response.raise_for_status();health=response.json()
    except (httpx.HTTPError,ValueError):pass
    return {**configured,'installed':bool(configured.get('available')),'available':health.get('ready') is True,
      'version':health.get('model_version') or configured.get('version'),
      'runtime_checked':True,'reading_ready':health.get('reading_ready') is True,'tts_runtime_ready':health.get('tts_ready') is True,
      'pronunciation_grading_validated':False,'translation_teacher_evaluation_verified':False,
      'reading_assessment':'word recognition/comparison; teacher pronunciation review required'}
