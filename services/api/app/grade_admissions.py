"""Administrator-only account release through the supported Supabase Auth API."""
from typing import Annotated,Literal
from uuid import UUID
import httpx
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,Field,field_validator
from .security import administrator,get_gateway
from .models import CurrentUser
from .config import Settings,get_settings,supabase_headers
router=APIRouter(prefix='/v1/admin/grades',tags=['admin'])
class GradeRelease(BaseModel):
    expected_user_id:UUID
    mode:Literal['pending','replace']
    reason:str=Field(min_length=3,max_length=500)
    @field_validator('reason')
    @classmethod
    def reason_required(cls,value):
        if len(value.strip())<3:raise ValueError('Enter a reason with at least 3 characters.')
        return value.strip()
@router.post('/{grade}/release')
async def release_grade(grade:int,payload:GradeRelease,user:Annotated[CurrentUser,Depends(administrator)],gateway=Depends(get_gateway),settings:Settings=Depends(get_settings)):
    if grade not in range(1,7):raise HTTPException(422,'Choose Grade 1 to 6.')
    if not settings.supabase_secret_key:raise HTTPException(503,'Account release is not configured. No classroom data was deleted.')
    parameters={'p_grade':grade,'p_user':str(payload.expected_user_id),'p_reason':payload.reason}
    try:
        started=await gateway._request('POST','rpc/admin_begin_grade_release',json={**parameters,'p_mode':payload.mode})
        if not started['already_removed']:
            async with httpx.AsyncClient(timeout=30) as client:
                response=await client.request('DELETE',settings.supabase_url+'/auth/v1/admin/users/'+str(payload.expected_user_id),headers=supabase_headers(settings.supabase_secret_key),json={'should_soft_delete':True})
            response.raise_for_status()
        return await gateway._request('POST','rpc/admin_finish_grade_release',json=parameters)
    except httpx.HTTPStatusError as error:
        if '/rest/v1/' in str(error.request.url) and error.response.status_code in (400,401,403,409):
            message=error.response.json().get('message','The selected grade account changed. Refresh and try again.')
            raise HTTPException(409,message) from error
        raise HTTPException(503,'Account release is not complete. Learner data were retained. Retry the same release.') from error
    except httpx.RequestError as error:
        raise HTTPException(503,'Account release is not complete. Learner data were retained. Retry the same release.') from error
