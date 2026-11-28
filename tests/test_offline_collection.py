import io,json,hashlib,sys,tempfile,wave,zipfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent if (Path(__file__).parent/'offline_collection_server.py').exists() else Path(__file__).resolve().parents[1]/'scripts'))
from offline_collection_server import Store,CollectionError

class CollectionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'collection.sqlite3';self.store=Store(self.path)
        self.profile={'id':'teacher','email':'collector@example.org','role':'educator','status':'active','name':'Collector','grade_levels':[1,2,3,4,5,6]}
        self.material={'id':'quiz','kind':'quiz','title':'A word quiz','grade_level':1,'version':1,'status':'published','body':{'questions':[{'id':'q','prompt':'Book?','options':[{'id':'a','text':'aklat'},{'id':'b','text':'tubig'}]}]}}
        state={'materials':[self.material],'children':[],'records':[],'attempts':[],'favorites':[],'educators':[],'models':[]}
        self.store.initialize(self.profile,'Test!Password123',state,{'quiz':{'q':'a'}});self.adult,_=self.store.login(self.profile['email'],'Test!Password123')
    def tearDown(self):self.temp.cleanup()
    def learner(self):
        child=self.store.rpc('save_child_profile',{'p_id':None,'p_data':{'nickname':'Learner code 01','grade_level':1,'gender':'female','learning_level':'beginner','avatar_key':'owl'}},self.adult)
        token=self.store.rpc('open_child_session',{'p_child_id':child},self.adult)['token'];return child,token
    def audio(self):
        out=io.BytesIO()
        with wave.open(out,'wb') as w:w.setparams((1,2,16000,0,'NONE','not compressed'));w.writeframes(b'\x10\x00'*16000)
        return out.getvalue()
    def test_rejects_wrong_login_and_unauthenticated_writes(self):
        with self.assertRaises(CollectionError):self.store.login(self.profile['email'],'wrong')
        with self.assertRaises(CollectionError):self.store.rpc('workspace_snapshot',{},None)
    def test_profile_and_typed_drafts_survive_database_reopen(self):
        self.store.rpc('save_child_profile',{'p_data':{'nickname':'Learner 1','grade_level':1}},self.adult)
        self.store.capture('draft',{'id':'draft1','revision':2,'fields':{'answer':'A complete typed answer'}},self.adult)
        other=Store(self.path);self.assertEqual(other.snapshot()['children'][0]['nickname'],'Learner 1');self.assertEqual(other.stats()['draft_records'][0]['fields']['answer'],'A complete typed answer')
    def test_newer_draft_is_not_overwritten_by_a_late_request(self):
        for rev,text in [(5,'final answer'),(4,'older answer')]:self.store.capture('draft',{'id':'d','revision':rev,'fields':{'text':text}},self.adult)
        self.assertEqual(self.store.stats()['draft_records'][0]['fields']['text'],'final answer')
    def test_student_cannot_load_adult_records_or_private_answer_key(self):
        _,token=self.learner()
        with self.assertRaises(CollectionError):self.store.rpc('workspace_snapshot',{},self.adult)
        result=self.store.student_rpc('student_learning_state',{'p_token':token});self.assertNotIn('correct_option_id',json.dumps(result));self.assertNotIn('collector@example',json.dumps(result))
    def test_actual_quiz_scoring_retakes_and_replay_are_durable(self):
        child,token=self.learner();p={'p_token':token,'p_material_id':'quiz','p_version':1,'p_submission_id':'submission1','p_answers':{'q':'b'}}
        result=self.store.student_rpc('student_complete_material',p);self.assertEqual(result['correct_count'],0)
        self.assertEqual(result['question_responses'][0]['selected_option_text'],'tubig');self.assertEqual(result['question_responses'][0]['prompt'],'Book?');self.assertEqual(result['material_snapshot']['version'],1)
        self.assertEqual(self.store.student_rpc('student_complete_material',p)['id'],result['id']);self.assertEqual(len(Store(self.path).snapshot()['attempts']),1)
        with self.assertRaises(CollectionError):self.store.student_rpc('student_complete_material',{**p,'p_answers':{'q':'a'}})
        correct=self.store.student_rpc('student_complete_material',{**p,'p_submission_id':'submission2','p_answers':{'q':'a'}});self.assertEqual(correct['correct_count'],1);self.assertEqual(correct['stars'],0)
    def test_completion_rewards_match_cloud_and_retakes_do_not_farm_stars(self):
        ids={}
        for kind,body in [('lesson',{'english':'Read a book.'}),('game',{'pairs':[{'en':'book','fil':'aklat'}]})]:
            ids[kind]=self.store.rpc('save_learning_material',{'p_id':None,'p_data':{'kind':kind,'title':'Demo '+kind,'grade_level':1,'status':'classroom','body':body}},self.adult)
        _,token=self.learner()
        for kind,stars in [('lesson',1),('game',2)]:
            p={'p_token':token,'p_material_id':ids[kind],'p_version':1,'p_submission_id':kind+'1','p_answers':{'book':'aklat'} if kind=='game' else {}}
            self.assertEqual(self.store.student_rpc('student_complete_material',p)['stars'],stars)
            self.assertEqual(self.store.student_rpc('student_complete_material',{**p,'p_submission_id':kind+'2'})['stars'],0)
    def test_wrong_grade_or_version_never_creates_a_result(self):
        _,token=self.learner()
        with self.assertRaises(CollectionError):self.store.student_rpc('student_complete_material',{'p_token':token,'p_material_id':'quiz','p_version':99,'p_submission_id':'x','p_answers':{'q':'a'}})
        self.assertEqual(self.store.snapshot()['attempts'],[])
    def test_audio_checkpoint_final_revision_and_export_checksums(self):
        audio=self.audio()
        for revision,complete in [(32000,False),(32001,True),(32000,False)]:self.store.capture('recording',{'id':'recording1','revision':revision,'expected_text':'The book.','language':'en','complete':complete},self.adult,audio=audio)
        self.assertEqual(Store(self.path).stats()['recordings'],1)
        raw,_=self.store.export()
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            manifest=json.loads(z.read('manifest.json'))
            for name,entry in manifest.items():self.assertEqual(hashlib.sha256(z.read(name)).hexdigest(),entry['sha256'])
            self.assertEqual(z.read('audio/recording1.wav'),audio);value=json.loads(z.read('collection.json'));self.assertTrue(value['recordings'][0]['complete']);self.assertNotIn('password',value);self.assertNotIn('sessions',value)
        self.assertTrue((self.path.parent/'backups/latest.sqlite3').exists())
    def test_corrupt_audio_is_rejected_without_fake_save(self):
        with self.assertRaises(CollectionError):self.store.capture('recording',{'id':'r','revision':1},self.adult,audio=b'not a wave')
        self.assertEqual(self.store.stats()['recordings'],0)
    def test_private_recording_list_and_playback_require_unlocked_teacher(self):
        import threading,urllib.request,urllib.error
        from http.server import ThreadingHTTPServer
        from offline_collection_server import handler_for
        child,_=self.learner()
        # Opening student mode locks adult controls until verification.
        self.adult,_=self.store.login(self.profile['email'],'Test!Password123')
        self.store.capture('recording',{'id':'recording1','revision':1,'child_id':child,'expected_text':'The bird.','language':'en','complete':True},self.adult,audio=self.audio())
        server=ThreadingHTTPServer(('127.0.0.1',0),handler_for(self.store,self.temp.name));thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        base='http://127.0.0.1:'+str(server.server_port)
        def get(path,teacher=True):return urllib.request.urlopen(urllib.request.Request(base+path,headers={'Cookie':'lk_collection='+self.adult} if teacher else {}))
        try:
            with self.assertRaises(urllib.error.HTTPError) as denied:get('/v1/offline/recordings?child_id='+child,False)
            self.assertEqual(denied.exception.code,401)
            with get('/v1/offline/recordings?child_id='+child) as response:rows=json.load(response)
            self.assertEqual(len(rows['items']),1);self.assertEqual(rows['items'][0]['child_id'],child)
            with get('/collection/audio/recording1') as response:self.assertEqual(response.read(),self.audio())
            with self.assertRaises(urllib.error.HTTPError) as denied:get('/v1/offline/recordings?child_id=foreign-child')
            self.assertEqual(denied.exception.code,403)
        finally:server.shutdown();server.server_close();thread.join(timeout=2)
    def test_child_recording_cannot_be_assigned_to_another_learner(self):
        _,token=self.learner()
        with self.assertRaises(CollectionError):self.store.capture('recording',{'id':'r','revision':1,'child_id':'someone-else'},self.adult,token,self.audio())
    def test_local_materials_can_be_edited_but_shared_content_is_read_only(self):
        with self.assertRaises(CollectionError):self.store.rpc('learning_material_editor',{'p_id':'quiz'},self.adult)
        material={'kind':'quiz','title':'Local quiz','grade_level':1,'learning_level':'beginner','status':'classroom','body':{'questions':[{'id':'q','prompt':'Read?','options':[{'id':'a','text':'yes'}],'correct_option_id':'a'}]}}
        key=self.store.rpc('save_learning_material',{'p_id':None,'p_data':material},self.adult)
        self.assertEqual(self.store.rpc('learning_material_editor',{'p_id':key},self.adult)['body']['questions'][0]['correct_option_id'],'a')
        self.assertNotIn('correct_option_id',json.dumps(self.store.snapshot()))
    def test_uncached_cloud_quiz_answers_are_saved_without_invented_scores(self):
        with self.store.connect() as db:db.execute("update settings set value='{}' where key='answer_keys'")
        child,token=self.learner()
        result=self.store.student_rpc('student_complete_material',{'p_token':token,'p_material_id':'quiz','p_version':1,'p_submission_id':'pending1','p_answers':{'q':'a'}})
        self.assertEqual(result['assessment_type'],'pending_online_scoring');self.assertIsNone(result['correct_count']);self.assertEqual(result['stars'],0)
        self.assertEqual(result['question_responses'][0]['selected_option_text'],'aklat');self.assertIsNone(result['question_responses'][0]['correct'])
        self.assertEqual(Store(self.path).snapshot()['attempts'][0]['answers'],{'q':'a'})
    def test_no_cloud_administrator_actions_and_revoked_child_session(self):
        with self.assertRaises(CollectionError):self.store.rpc('admin_update_educator',{},self.adult)
        _,token=self.learner();self.store.student_rpc('close_child_session',{'p_token':token})
        with self.assertRaises(CollectionError):self.store.student_rpc('student_learning_state',{'p_token':token})

if __name__=='__main__':unittest.main()

