"""Share identical in-flight translations and keep a small, short-lived result cache."""
import asyncio,time
from collections import OrderedDict
class TranslationBusy(Exception):pass
class TranslationRequests:
 def __init__(self,max_entries=64,ttl=60,max_pending=32,clock=time.monotonic):
  self.max_entries=max_entries;self.ttl=ttl;self.max_pending=max_pending;self.clock=clock;self.cache=OrderedDict();self.pending={}
 async def get(self,key,factory):
  now=self.clock()
  for old,(at,_) in list(self.cache.items()):
   if now-at>=self.ttl:self.cache.pop(old,None)
  if key in self.cache:return self.cache[key][1]
  task=self.pending.get(key)
  if task is None:
   if len(self.pending)>=self.max_pending:raise TranslationBusy('Translation queue is full.')
   task=asyncio.create_task(factory());self.pending[key]=task
   task.add_done_callback(lambda done:self.completed(key,done))
  return await asyncio.shield(task)
 def completed(self,key,task):
  if self.pending.get(key) is task:self.pending.pop(key,None)
  if task.cancelled():return
  try:result=task.result()
  except Exception:return
  self.cache[key]=(self.clock(),result);self.cache.move_to_end(key)
  while len(self.cache)>self.max_entries:self.cache.popitem(last=False)
