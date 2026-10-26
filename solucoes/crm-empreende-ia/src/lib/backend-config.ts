/** Only public frontend keys may configure a dedicated CRM environment. */
export function validCrmBackend(url:unknown,key:unknown,environment:unknown):boolean {
 if(environment!=='dedicated'||typeof url!=='string'||typeof key!=='string')return false;
 try {const parsed=new URL(url);if(parsed.username||parsed.password||parsed.search||parsed.hash)return false;
  if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))return false;
 }catch{return false;}
 if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))return true;
 try {const segments=key.split('.');if(segments.length!==3)return false;const encoded=segments[1].replace(/-/g,'+').replace(/_/g,'/');const payload=JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'='))) as {role?:unknown};return payload.role==='anon';}catch{return false;}
}
