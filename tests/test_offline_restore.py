import hashlib,io,json,sys,tempfile,unittest,wave
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from offline_collection_server import Store
from restore_offline_collection import restore
class RestoreTests(unittest.TestCase):
 def test_full_restore_preserves_profiles_answers_audio_and_original(self):
  with tempfile.TemporaryDirectory() as tmp:
   prepared=Path(tmp)/'prepared';prepared.mkdir();(prepared/'web').mkdir();(prepared/'web/index.html').write_text('app')
   store=Store(prepared/'data/collection.sqlite3');profile={'id':'teacher','email':'t@school.test','name':'Teacher','role':'educator','status':'active','grade_levels':[1]}
   store.initialize(profile,'Private!Password',{'children':[],'attempts':[],'materials':[],'records':[]},{});token,_=store.login(profile['email'],'Private!Password')
   child=store.rpc('save_child_profile',{'p_data':{'nickname':'Demo child','grade_level':1}},token)
   store.capture('draft',{'id':'draft','revision':1,'fields':{'answer':'Original typed response'}},token)
   audio=io.BytesIO()
   with wave.open(audio,'wb') as w:w.setparams((1,2,16000,0,'NONE','not compressed'));w.writeframes(b'\x01\x00'*16000)
   store.capture('recording',{'id':'rec','revision':1,'child_id':child,'expected_text':'Read slowly.','language':'en','complete':True},token,audio=audio.getvalue());store.backup()
   (prepared/'preparation.json').write_text(json.dumps({'cloud_account_id':'teacher'}))
   backup=prepared/'data/backups/latest.sqlite3';before=hashlib.sha256(backup.read_bytes()).hexdigest();target=Path(tmp)/'restored'
   self.assertTrue(restore(backup,prepared,target)['original_untouched']);other=Store(target/'data/collection.sqlite3')
   self.assertEqual(other.snapshot()['children'][0]['id'],child);self.assertEqual(other.stats()['recordings'],1);self.assertEqual(other.stats()['draft_records'][0]['fields']['answer'],'Original typed response')
   with other.connect() as db:self.assertEqual(db.execute('select audio from recordings').fetchone()[0],audio.getvalue());self.assertEqual(db.execute('select count(*) from sessions').fetchone()[0],0)
   self.assertEqual(before,hashlib.sha256(backup.read_bytes()).hexdigest())
   with self.assertRaises(ValueError):restore(backup,prepared,target)
 def test_wrong_prepared_account_refuses_restore(self):
  with tempfile.TemporaryDirectory() as tmp:
   prepared=Path(tmp);s=Store(prepared/'source.sqlite3');s.initialize({'id':'owner'},'Private!',{'children':[]},{});(prepared/'preparation.json').write_text('{"cloud_account_id":"someone-else"}')
   with self.assertRaises(ValueError):restore(prepared/'source.sqlite3',prepared,prepared/'new')
if __name__=='__main__':unittest.main()
