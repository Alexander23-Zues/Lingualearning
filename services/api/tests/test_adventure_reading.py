"""Only the protected recognition result may grant story-reading evidence."""
import pytest
import httpx
from app.config import get_settings
from app.models import AccountRole
from app import ai_routes
from test_api import client_for


@pytest.fixture
def adventure_client(monkeypatch):
    client,_=client_for(AccountRole.educator)
    calls=[]
    class FakeGateway:
        def __init__(self,settings):self.client=httpx.AsyncClient()
        async def _request(self,method,path,**kwargs):
            calls.append((path,kwargs['json']))
            if path.endswith('adventure_reading_context'):return {'text':'The little bird sings.','language':'en'}
            return {'recorded':True,'part_passed':True,'adventure':{'current_step_id':'story-step'}}
    async def scoped(token,settings):return {'child':{'id':'child'}}
    async def recognize(audio,text,language,settings):
        await audio.close()
        return {'transcript':'The little bird sings.','speech_detected':True,'recognition_status':'recognized','expected_word_count':4,'matched_words':['the','little','bird','sings'],'missing_words':[],'extra_words':[]}
    monkeypatch.setattr(ai_routes,'SupabaseGateway',FakeGateway)
    monkeypatch.setattr(ai_routes,'student_learning_state',scoped)
    monkeypatch.setattr(ai_routes,'recognize_audio',recognize)
    return client,calls


def submit(client,**changes):
    fields={'expected_text':'The little bird sings.','language':'en','student_token':'a'*64,'adventure_step_id':'story-step','page_index':'0','part_index':'0',**changes}
    return client.post('/v1/ai/student-reading',data=fields,files={'audio':('reading.wav',b'controlled mock recognition','audio/wav')})


def test_uses_server_story_text_and_persists_only_server_recognition(adventure_client):
    client,calls=adventure_client
    response=submit(client)
    assert response.status_code==200
    assert response.json()['adventure_evidence']['part_passed'] is True
    assert [path for path,_ in calls]==['rpc/adventure_reading_context','rpc/adventure_record_reading']
    assert calls[1][1]['p_result']['matched_words']==['the','little','bird','sings']


@pytest.mark.parametrize('changes',[{'expected_text':'An easier invented sentence.'},{'language':'fil'},{'page_index':'-1'}])
def test_rejects_substituted_text_language_or_invalid_page(adventure_client,changes):
    client,calls=adventure_client
    assert submit(client,**changes).status_code==422
    assert all(path!='rpc/adventure_record_reading' for path,_ in calls)


def test_reports_save_failure_instead_of_granting_unsaved_reading_credit(adventure_client,monkeypatch):
    client,_=adventure_client
    original=ai_routes.SupabaseGateway._request
    async def interrupted(self,method,path,**kwargs):
        if path.endswith('adventure_record_reading'):raise httpx.ConnectError('fixture interruption')
        return await original(self,method,path,**kwargs)
    monkeypatch.setattr(ai_routes.SupabaseGateway,'_request',interrupted)
    response=submit(client)
    assert response.status_code==503
    assert 'Could not save' in response.json()['detail']
