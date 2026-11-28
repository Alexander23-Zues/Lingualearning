// Old classroom aliases are retired. Sign in using an active account's email.
const normalize = value => String(value || '').trim().toLowerCase();
const retiredAliases = new Set(['Mapagmahal','Matulungin','Matiyaga','Malikhain','Huwaran','Malikhain'].flatMap((section,index) => {
  const grade=index+1, name=section.toLowerCase();
  const alias=name==='malikhain'?`${name}${grade}`:name;
  return [name,`${name}@gmail.com`,alias,`${alias}@gmail.com`,`grade${grade}.${name}@linguakids.example`,`teacher${grade}`,`teacher${grade}@linguakids.example`];
}));
export function isSectionLogin(value) { return retiredAliases.has(normalize(value)); }
export function educatorLoginEmail(value) {
  if(isSectionLogin(value))throw new Error('This section login has been removed. Use an active educator email address.');
  return String(value || '').trim();
}
export function requireMailbox(value) {
  if(isSectionLogin(value))throw new Error('This section account has been removed and has no email inbox. Use an active educator email address.');
  const email=String(value || '').trim();
  if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
    throw new Error('Enter your complete email address.');
  const domain=email.split('@')[1].toLowerCase();
  if(/(?:^|\.)(?:example|invalid|test|localhost)$/u.test(domain) || /^(?:example\.com|example\.org|example\.net)$/u.test(domain))
    throw new Error('Use a real email inbox you can open to receive verification and password reset links.');
}
