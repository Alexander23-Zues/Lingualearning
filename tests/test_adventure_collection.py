import io,json,sys,tempfile,unittest,uuid,zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from offline_collection_server import Store,CollectionError

class AdventureCollectionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'collection.sqlite3';self.store=Store(self.path)
        self.profile={'id':'teacher','email':'fixture@example.invalid','role':'educator','status':'active','grade_levels':[1]}
        materials=[]
        for kind,body in [('lesson',{'english':'Read the words.'}),('game',{'pairs':[{'en':'cat','fil':'pusa'}]}),('story',{'pages':[{'english':'We read a story.','filipino':'Magbasa tayo.'}]}),('quiz',{'questions':[{'id':f'q{i}','prompt':f'Question {i}','options':[{'id':'a','text':'Correct fixture'},{'id':'b','text':'Other fixture'}]} for i in range(5)]})]:
            materials.append({'id':kind,'kind':kind,'title':'Fixture '+kind,'version':1,'grade_level':1,'status':'published','body':body})
        self.store.initialize(self.profile,'Fixture password 1!',{'materials':materials,'children':[],'records':[],'attempts':[],'favorites':[]}, {'quiz':{f'q{i}':'a' for i in range(5)}})
        self.adult,_=self.store.login(self.profile['email'],'Fixture password 1!')
        self.child=self.store.rpc('save_child_profile',{'p_data':{'nickname':'Fictional learner','grade_level':1}},self.adult)
        self.token=self.store.rpc('open_child_session',{'p_child_id':self.child},self.adult)['token']
    def tearDown(self):self.temp.cleanup()
    def state(self):return self.store.student_rpc('student_adventure_state',{'p_token':self.token})
    def finish(self,step=None,answers=None,submission=None):
        state=self.state()['adventure'];return self.store.student_rpc('student_adventure_complete',{'p_token':self.token,'p_step_id':step or state['current_step_id'],'p_revision':state['revision'],'p_submission_id':submission or str(uuid.uuid4()),'p_answers':answers or {}})
    def get_to_story(self):
        self.finish();self.finish(answers={'cat':'pusa'});self.finish(answers={'cat':'pusa'})
        self.assertEqual(self.state()['adventure']['current_step_id'],'story:1:read')
    def pass_story(self):
        self.store.adventure_rpc('adventure_record_reading',{'step_id':'story:1:read','page':0,'part':0,'result':{'speech_detected':True,'recognition_status':'recognized','expected_word_count':4,'matched_words':['we','read','a','story'],'extra_words':[]}},student=self.token)
        self.finish()
    def test_skip_and_legacy_bypass_are_rejected_without_losing_data(self):
        state=self.state();self.assertEqual(len(state['adventure']['stages']),1)
        with self.assertRaises(CollectionError):self.finish('quiz:1:read',{'q0':'a'})
        with self.assertRaises(CollectionError):self.store.student_rpc('student_complete_material',{'p_token':self.token,'p_material_id':'quiz','p_version':1,'p_submission_id':'bypass','p_answers':{f'q{i}':'a' for i in range(5)}})
        self.assertEqual(self.store.snapshot()['attempts'],[])
    def test_every_mode_reading_and_80_percent_are_required_and_retries_are_retained(self):
        self.get_to_story()
        with self.assertRaises(CollectionError):self.finish()
        self.pass_story()
        failed=self.finish(answers={f'q{i}':'b' for i in range(5)});self.assertFalse(failed['adventure_passed'])
        self.assertEqual(self.state()['adventure']['current_step_id'],'quiz:1:read')
        sid=str(uuid.uuid4());passed=self.finish(answers={f'q{i}':'a' if i<4 else 'b' for i in range(5)},submission=sid)
        self.assertTrue(passed['adventure_passed']);self.assertIsNone(passed['adventure']['current_step_id'])
        repeated=self.finish('quiz:1:read',{f'q{i}':'a' if i<4 else 'b' for i in range(5)},sid)
        self.assertEqual(repeated['id'],passed['id'])
        self.assertEqual(len([a for a in Store(self.path).snapshot()['attempts'] if a['activity_kind']=='quiz']),2)
    def test_silence_has_no_evidence_and_uncertain_voice_needs_teacher_review(self):
        self.get_to_story();p={'step_id':'story:1:read','page':0,'part':0}
        result=self.store.adventure_rpc('adventure_record_reading',{**p,'result':{'speech_detected':False,'recognition_status':'no_speech'}},student=self.token)
        self.assertFalse(result['recorded'])
        self.adult,_=self.store.login(self.profile['email'],'Fixture password 1!')
        with self.assertRaises(CollectionError):self.store.rpc('approve_adventure_reading',{'p_child_id':self.child,'p_step_id':p['step_id'],'p_reason':'I observed the whole story.'},self.adult)
        self.store.adventure_rpc('adventure_record_reading',{**p,'result':{'speech_detected':True,'recognition_status':'unclear','expected_word_count':4,'matched_words':[]}},student=self.token)
        self.store.rpc('approve_adventure_reading',{'p_child_id':self.child,'p_step_id':p['step_id'],'p_reason':'I observed the learner read the full story correctly.'},self.adult)
        self.assertTrue(self.finish()['adventure_passed'])
    def test_unverified_offline_quiz_saves_answers_but_never_unlocks(self):
        self.get_to_story();self.pass_story()
        with self.store.connect() as db:db.execute("update settings set value='{}' where key='answer_keys'")
        result=self.finish(answers={f'q{i}':'a' for i in range(5)})
        self.assertEqual(result['assessment_type'],'pending_online_scoring');self.assertFalse(result['adventure_passed'])
        with self.assertRaises(CollectionError):self.finish(answers={f'q{i}':'a' for i in range(5)})
        self.assertEqual(self.state()['adventure']['stages'][0]['steps'][-1]['status'],'pending_online_scoring')
    def test_local_approval_progress_and_path_survive_backup_and_export(self):
        self.get_to_story();self.pass_story()
        self.assertEqual(Store(self.path).student_rpc('student_adventure_state',{'p_token':self.token})['adventure']['current_step_id'],'quiz:1:read')
        raw,_=self.store.export()
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            data=json.loads(archive.read('collection.json'));self.assertIn('adventure',data)
            self.assertTrue(any(a.get('adventure_step_id')=='story:1:read' for a in data['attempts']))

if __name__=='__main__':unittest.main()
