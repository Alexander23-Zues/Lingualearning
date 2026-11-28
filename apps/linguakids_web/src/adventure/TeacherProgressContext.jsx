import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {useApp} from '../context';
import {assignedGrades} from '../grade-scope';
import {errorText} from '../domain';

const Context=createContext(null);

export function TeacherProgressProvider({children}) {
  const {repository,user,data,locked}=useApp();
  const {pathname}=useLocation();
  const allowed=assignedGrades(user);
  const grades=[...new Set((data?.children||[]).filter(child=>child.active&&allowed.includes(Number(child.grade_level))).map(child=>Number(child.grade_level)))].sort();
  const gradeKey=grades.join(',');
  const enabled=user?.role==='educator'&&!locked&&!!data;
  const scope=enabled?`${user.id}:${gradeKey}`:'';
  const [result,setResult]=useState({scope:'',byGrade:{},errors:{},updatedAt:null});
  const [loading,setLoading]=useState(false);
  const version=useRef(0),lastLoad=useRef(0);
  const refresh=useCallback(async()=>{
    const request=++version.current;
    if(!enabled){setResult({scope:'',byGrade:{},errors:{},updatedAt:null});setLoading(false);return;}
    setLoading(true);
    const responses=await Promise.allSettled(gradeKey.split(',').filter(Boolean).map(async grade=>{
      const value=await repository.rpc('educator_adventure_progress',{p_grade:Number(grade)});
      if(!Array.isArray(value))throw new Error('Mission progress could not be read. Try refreshing.');
      return [grade,value];
    }));
    if(request!==version.current)return;
    const byGrade={},errors={};
    responses.forEach((response,index)=>{
      const grade=gradeKey.split(',')[index];
      if(response.status==='fulfilled')byGrade[grade]=response.value[1];
      else errors[grade]=errorText(response.reason);
    });
    setResult({scope,byGrade,errors,updatedAt:new Date().toISOString()});
    lastLoad.current=Date.now();setLoading(false);
  },[repository,user?.id,enabled,gradeKey,scope]);
  useEffect(()=>{void refresh();return()=>{version.current++;};},[refresh,data]);
  useEffect(()=>{
    if(!enabled)return;
    const retry=()=>{if(document.visibilityState!=='hidden'&&Date.now()-lastLoad.current>10000)void refresh();};
    window.addEventListener('focus',retry);window.addEventListener('online',retry);
    document.addEventListener('visibilitychange',retry);
    return()=>{window.removeEventListener('focus',retry);window.removeEventListener('online',retry);document.removeEventListener('visibilitychange',retry);};
  },[enabled,refresh]);
  useEffect(()=>{
    if(!enabled||!['home','students','journey','reports'].some(section=>pathname===`/workspace/${section}`))return;
    const timer=window.setInterval(()=>{if(document.visibilityState!=='hidden'&&Date.now()-lastLoad.current>=45000)void refresh();},60000);
    return()=>window.clearInterval(timer);
  },[enabled,pathname,refresh]);
  const current=result.scope===scope?result:{byGrade:{},errors:{},updatedAt:null};
  const learners=Object.values(current.byGrade).flat();
  return <Context.Provider value={{...current,learners,byChild:new Map(learners.map(item=>[item.child_id,item])),loading,refresh}}>{children}</Context.Provider>;
}

export function useTeacherProgress(){
  return useContext(Context)||{learners:[],byChild:new Map(),byGrade:{},errors:{},updatedAt:null,loading:false,refresh:async()=>{}};
}
