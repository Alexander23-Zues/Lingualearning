import json,sys,uuid,zipfile,io
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from adventure_learning import Adventure
from mission_placement import validate_english_assessment
from offline_collection_server import Store,CollectionError

def evidence():return {'source_key':'test:english:1','source_title':'Synthetic English assessment','language':'en','assessment_date':'2026-01-01','reading_profile':'Developing Reader','notes':'Synthetic test only.'}
def install(tmp_path):
 owner={'id':'owner','email':'owner@fixture.invalid','role':'educator','status':'active','grade_levels':[1],'account_kind':'review'}
 materials=[];stages=[]
 for index in range(6):
  steps=[]
  for kind in ['lesson','game','story','quiz']:
   mid=f'{kind}-{index}';m={'id':mid,'kind':kind,'title':mid,'grade_level':1,'owner_id':'owner','status':'classroom','version':1,'body':{'english':'We read.'}}
   if kind=='story':m['body']={'pages':[{'english':'We read.'}]}
   if kind=='game':m['body']={'pairs':[{'en':'cat','fil':'pusa'}]}
   materials.append(m);steps.append({'material_id':mid,**({'mode':'matching'} if kind=='game' else {})})
  stages.append({'id':f'mission-{index+1}','title':f'Synthetic mission {index+1}','difficulty':['beginner','intermediate','advanced'][index//2],'steps':steps})
 child={'id':'child','adult_id':'owner','nickname':'Synthetic learner','grade_level':1,'active':True,'is_demo':True}
 store=Store(tmp_path/'collection.sqlite3');store.initialize(owner,'Synthetic password 1!',{'children':[child],'materials':materials,'records':[],'attempts':[],'favorites':[]},{})
 token,_=store.login(owner['email'],'Synthetic password 1!');path=store.rpc('educator_adventure',{'p_grade':1},token)
 store.rpc('save_adventure',{'p_grade':1,'p_revision':path['revision'],'p_stages':stages},token)
 return store,token

def test_english_evidence_cannot_use_mother_tongue_or_client_recommendation():
 assert validate_english_assessment(evidence())['recommended_difficulty']=='intermediate'
 with pytest.raises(ValueError):validate_english_assessment({**evidence(),'language':'fil'})
 with pytest.raises(ValueError):validate_english_assessment({**evidence(),'recommended_difficulty':'advanced'})

def test_placement_survives_restart_and_backup_without_fake_credit(tmp_path):
 store,adult=install(tmp_path);source=store.rpc('save_english_assessment',{'p_child_id':'child','p_data':evidence()},adult)
 assert store.rpc('save_english_assessment',{'p_child_id':'child','p_data':evidence()},adult)==source
 result=store.rpc('confirm_adventure_placement',{'p_child_id':'child','p_evidence_id':source,'p_stage_id':'mission-3','p_revision':2,'p_reason':'Teacher observed and confirmed this English starting point.'},adult)
 assert result['stages'][0]['status']=='not-assigned' and result['stages'][0]['completed']==0
 assert result['current_step_id']=='lesson-2:1:read' and store.snapshot()['attempts']==[]
 child=store.rpc('open_child_session',{'p_child_id':'child'},adult)['token']
 chosen=store.student_rpc('student_choose_adventure_start',{'p_token':child,'p_stage_id':'mission-1','p_revision':2})
 assert chosen['current_step_id']=='lesson-0:1:read'
 with pytest.raises(CollectionError):store.student_rpc('student_choose_adventure_start',{'p_token':child,'p_stage_id':'mission-4','p_revision':2})
 store.student_rpc('student_adventure_complete',{'p_token':child,'p_step_id':'lesson-0:1:read','p_revision':2,'p_submission_id':str(uuid.uuid4()),'p_answers':{}})
 adult,_=store.login('owner@fixture.invalid','Synthetic password 1!')
 edited=store.rpc('educator_adventure',{'p_grade':1},adult);edited['stages'][0]['id']='replacement-id'
 with pytest.raises(CollectionError,match='Keep the starting mission IDs'):
  store.rpc('save_adventure',{'p_grade':1,'p_revision':2,'p_stages':edited['stages']},adult)
 with pytest.raises(CollectionError):store.student_rpc('student_choose_adventure_start',{'p_token':child,'p_stage_id':'mission-3','p_revision':2})
 reopened=Store(store.path);assert reopened.snapshot()['adventure']['placements']['child']['selected_stage_id']=='mission-1'
 raw,_=reopened.export()
 with zipfile.ZipFile(io.BytesIO(raw)) as z:assert json.loads(z.read('collection.json'))['adventure']['placements']['child']['approved_stage_id']=='mission-3'

def test_difficulty_order_and_stable_ids_are_enforced(tmp_path):
 store,adult=install(tmp_path);path=store.rpc('educator_adventure',{'p_grade':1},adult)
 assert len(path['stages'])==6 and path['stages'][2]['id']=='mission-3'
 path['stages'][0]['difficulty']='advanced'
 with pytest.raises(CollectionError):store.rpc('save_adventure',{'p_grade':1,'p_revision':2,'p_stages':path['stages']},adult)

def test_cloud_started_flag_survives_preparation_without_local_attempt_metadata(tmp_path):
 store,adult=install(tmp_path)
 with store.connect() as db:
  state=store.snapshot();state['adventure']['started']={'child':True};db.execute('update state set value=? where id=1',(json.dumps(state),))
 status=store.rpc('educator_placement',{'p_child_id':'child'},adult)
 assert status['has_started'] is True and store.snapshot()['attempts']==[]
 source=store.rpc('save_english_assessment',{'p_child_id':'child','p_data':evidence()},adult)
 with pytest.raises(CollectionError,match='already started'):
  store.rpc('confirm_adventure_placement',{'p_child_id':'child','p_evidence_id':source,'p_stage_id':'mission-3','p_revision':2,'p_reason':'Must not skip work already started online.'},adult)
