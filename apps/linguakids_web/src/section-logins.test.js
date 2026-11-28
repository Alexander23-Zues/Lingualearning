import {expect,it} from 'vitest';
import {educatorLoginEmail,isSectionLogin,requireMailbox} from './section-logins';
it('rejects all six retired teacher usernames and their former addresses',()=>{
  for(let grade=1;grade<=6;grade++)for(const alias of [`teacher${grade}`,`teacher${grade}@linguakids.example`]){
    expect(isSectionLogin(` ${alias.toUpperCase()} `)).toBe(true);
    expect(()=>educatorLoginEmail(alias)).toThrow(/removed/);
    expect(()=>requireMailbox(alias)).toThrow(/no email inbox/);
  }
  for(const alias of ['mapagmahal@gmail.com','malikhain','MALIKHAIN4@gmail.com','grade6.malikhain@linguakids.example'])expect(()=>educatorLoginEmail(alias)).toThrow(/removed/);
});
it('accepts active email logins without creating aliases',()=>{
  expect(educatorLoginEmail(' teacher@school.edu.ph ')).toBe('teacher@school.edu.ph');
  expect(isSectionLogin('teacher@school.edu.ph')).toBe(false);
  expect(()=>requireMailbox('teacher@school.edu.ph')).not.toThrow();
});
