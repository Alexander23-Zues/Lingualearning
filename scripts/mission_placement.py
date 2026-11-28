"""English evidence supports a teacher decision; it never creates an activity grade."""
import re
from datetime import date,datetime,timezone,timedelta
DIFFICULTIES=('beginner','intermediate','advanced')
RECOMMENDATIONS={'Low Emerging Reader':'beginner','High Emerging Reader':'beginner','Developing Reader':'intermediate','Transitioning Reader':'advanced','Reading At Grade Level':'advanced','Other / teacher review':None}
def mission_difficulty(index,count):return DIFFICULTIES[min(2,max(0,index*3//max(1,count)))]
def validate_english_assessment(data):
 def require(ok,message):
  if not ok:raise ValueError(message)
 require(isinstance(data,dict) and not set(data)-{'source_key','source_title','language','assessment_date','reading_profile','notes'},'Use only English assessment evidence fields.')
 require(isinstance(data.get('source_key'),str) and re.fullmatch(r'[a-zA-Z0-9:_-]{1,100}',data['source_key']),'Enter a source key.')
 require(isinstance(data.get('source_title'),str) and 3<=len(data['source_title'].strip())<=180,'Enter the actual English assessment source.')
 require(data.get('language')=='en' and data.get('reading_profile') in RECOMMENDATIONS,'Use the separate English assessment category.')
 require(isinstance(data.get('notes',''),str) and len(data.get('notes',''))<=1000,'Notes are too long.')
 require(isinstance(data.get('assessment_date'),str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',data['assessment_date']),'Enter an assessment date.')
 require(date.fromisoformat(data['assessment_date'])<=datetime.now(timezone(timedelta(hours=8))).date(),'Use the date the assessment was actually taken.')
 return {**data,'schema_version':1,'recommended_difficulty':RECOMMENDATIONS[data['reading_profile']],'requires_teacher_confirmation':True}
