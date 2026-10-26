import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { describe,it,expect,vi,beforeEach } from 'vitest';
import { AuthProvider,useAuth } from './AuthContext';
const mock=vi.hoisted(()=>({listener:null as null|((event:string,session:unknown)=>void),profile:vi.fn(),initial:vi.fn(),signOut:vi.fn(),toastError:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({backendConfigured:true,supabase:{auth:{onAuthStateChange:(listener:typeof mock.listener)=>{mock.listener=listener;return {data:{subscription:{unsubscribe:vi.fn()}}};},getSession:()=>mock.initial(),signOut:()=>mock.signOut()}}}));
vi.mock('@/integrations/supabase/crm-client',()=>({crmDb:{from:()=>({select:()=>({eq:()=>({single:()=>mock.profile()})})})}}));
vi.mock('sonner',()=>({toast:{error:mock.toastError}}));
const session={user:{id:'user-a'},access_token:'test'};
function Consumer(){const {loading,profile,profileError,signOut}=useAuth();return <div>{loading?<span>Loading auth</span>:profileError?<span>{profileError}</span>:profile?<input aria-label="Unsaved form" defaultValue="Keep this draft"/>:<span>No profile</span>}<button onClick={()=>void signOut()}>Sair</button></div>;}
function setup(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AuthProvider><Consumer/></AuthProvider></QueryClientProvider>);}
beforeEach(()=>{mock.listener=null;mock.profile.mockReset().mockResolvedValue({data:{id:'user-a',org_id:'org-a',name:'A'},error:null});mock.initial.mockResolvedValue({data:{session},error:null});mock.signOut.mockReset().mockResolvedValue({error:null});mock.toastError.mockReset();});
describe('authentication lifecycle',()=>{
 it('reports logout failure without discarding the session and allows retry',async()=>{setup();const input=await screen.findByLabelText('Unsaved form');mock.signOut.mockResolvedValueOnce({error:{message:'offline'}});fireEvent.click(screen.getByRole('button',{name:'Sair'}));await waitFor(()=>expect(mock.toastError).toHaveBeenCalledWith(expect.stringContaining('Não foi possível sair')));expect(screen.getByLabelText('Unsaved form')).toBe(input);fireEvent.click(screen.getByRole('button',{name:'Sair'}));expect(await screen.findByText('No profile')).toBeInTheDocument();});
 it('keeps the same mounted form when the same user token is refreshed',async()=>{setup();const input=await screen.findByLabelText('Unsaved form');await act(async()=>{mock.listener?.('TOKEN_REFRESHED',{...session,access_token:'new-test-token'});});expect(screen.getByLabelText('Unsaved form')).toBe(input);expect(mock.profile).toHaveBeenCalledTimes(1);});
 it('reports profile fetch failures instead of starting onboarding with missing access',async()=>{mock.profile.mockResolvedValue({data:null,error:{message:'offline'}});setup();expect(await screen.findByText(/Não foi possível carregar seu acesso/)).toBeInTheDocument();expect(screen.queryByLabelText('Unsaved form')).not.toBeInTheDocument();});
 it('ignores a profile response that arrives after logout',async()=>{let resolve!:(result:unknown)=>void;mock.profile.mockReturnValue(new Promise(r=>{resolve=r;}));setup();await waitFor(()=>expect(mock.profile).toHaveBeenCalled());await act(async()=>{mock.listener?.('SIGNED_OUT',null);resolve({data:{id:'user-a',org_id:'org-a',name:'A'},error:null});});expect(screen.getByText('No profile')).toBeInTheDocument();expect(screen.queryByLabelText('Unsaved form')).not.toBeInTheDocument();});
});
