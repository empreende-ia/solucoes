import {describe,it,expect} from 'vitest';
import {validCrmBackend} from './backend-config';
const jwt=(role:string)=>'eyJhbGciOiJIUzI1NiJ9.'+btoa(JSON.stringify({role}))+'.signature';
describe('dedicated backend guard',()=>{
 it('requires explicit dedicated configuration',()=>{expect(validCrmBackend('https://example.supabase.co','sb_publishable_test',undefined)).toBe(false);});
 it('accepts only public keys',()=>{expect(validCrmBackend('https://example.supabase.co','sb_publishable_test','dedicated')).toBe(true);expect(validCrmBackend('https://example.supabase.co',jwt('anon'),'dedicated')).toBe(true);for(const key of ['sb_secret_test',jwt('service_role'),jwt('authenticated'),'broken'])expect(validCrmBackend('https://example.supabase.co',key,'dedicated')).toBe(false);});
 it('validates URLs and permits isolated loopback tests',()=>{expect(validCrmBackend('http://127.0.0.1:54329','sb_publishable_test','dedicated')).toBe(true);for(const url of ['not a url','javascript:alert(1)','http://remote.example','https://user:password@example.test'])expect(validCrmBackend(url,'sb_publishable_test','dedicated')).toBe(false);});
});
