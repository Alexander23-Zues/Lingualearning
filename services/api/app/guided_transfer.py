"""Compare the archived mission contract; the cloud still checks each response."""
def same_mission_sequence(local,cloud):
 def shape(path):
  if not isinstance(path,dict) or type(path.get('revision')) is not int or not isinstance(path.get('stages'),list):return None
  result=[]
  for stage in path['stages']:
   if not isinstance(stage,dict) or not isinstance(stage.get('steps'),list):return None
   steps=[]
   for step in stage['steps']:
    if not isinstance(step,dict):return None
    steps.append((step.get('id'),step.get('material_id'),step.get('material_version'),step.get('mode','read' if step.get('kind')!='game' else 'matching')))
   result.append((stage.get('id'),steps))
  return path['revision'],result
 a,b=shape(local),shape(cloud)
 return a is not None and a==b
