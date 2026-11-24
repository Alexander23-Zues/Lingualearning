import {useApp} from './context';
import {Select} from './ui';
import {assignedGrades} from './grade-scope';
export function GradeSelect(props) {
  const {user}=useApp();const allowed=assignedGrades(user);
  if(user?.role!=='educator')return <Select {...props}/>;
  const {defaultValue,value,values,...rest}=props;
  const fixed=allowed.length===1;
  const filtered=(values||[]).filter(v=>{const key=Array.isArray(v)?v[0]:v;return key==='' || allowed.includes(Number(key));});
  return <Select {...rest} {...(value!==undefined?{value:fixed?allowed[0]:value}:{defaultValue:fixed?allowed[0]:defaultValue})}
    values={fixed?[[allowed[0],`Grade ${allowed[0]}`]]:filtered}/>;
}
