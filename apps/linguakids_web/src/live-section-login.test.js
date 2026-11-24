// Explicit opt-in: retired accounts must fail before sending credentials to Auth.
import {expect,it} from 'vitest';
import {educatorLoginEmail} from './section-logins';
it.skipIf(process.env.LINGUAKIDS_SECTION_LOGIN_CHECK !== '1')('blocks every retired grade login',()=>{
  for(let grade=1;grade<=6;grade++)expect(()=>educatorLoginEmail(`teacher${grade}`)).toThrow(/removed/);
});
