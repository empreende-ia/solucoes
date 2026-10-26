import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase, backendConfigured } from '@/integrations/supabase/client';
import { crmDb } from '@/integrations/supabase/crm-client';
import type { CrmRow } from '@/integrations/supabase/commercial-types';

type Profile = CrmRow<'profiles'>;
interface AuthContextType {
  user: User | null; session: Session | null; profile: Profile | null; loading: boolean;
  profileError: string | null; signOut: () => Promise<boolean>; refreshProfile: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType>({ user: null, session: null, profile: null, loading: true, profileError: null, signOut: async () => false, refreshProfile: async () => {} });
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,setUser] = useState<User | null>(null), [session,setSession] = useState<Session | null>(null);
  const [profile,setProfile] = useState<Profile | null>(null), [loading,setLoading] = useState(true);
  const [profileError,setProfileError] = useState<string | null>(null);
  const activeUser = useRef<string | null>(null), request = useRef(0);
  const queryClient = useQueryClient();
  const loadProfile = useCallback(async (userId: string) => {
    const ticket = ++request.current;
    setProfileError(null);
    try {
      const { data,error } = await crmDb.from('profiles').select('*').eq('id',userId).single();
      if (error) throw error;
      if (ticket !== request.current || activeUser.current !== userId) return;
      setProfile(data);
    } catch {
      if (ticket !== request.current || activeUser.current !== userId) return;
      setProfile(null); setProfileError('Não foi possível carregar seu acesso. Verifique a conexão e tente novamente.');
    } finally { if (ticket === request.current && activeUser.current === userId) setLoading(false); }
  },[]);
  const invalidateProfile = useCallback(() => { request.current++; }, []);
  useEffect(() => {
    if (!backendConfigured) { setLoading(false); return; }
    let mounted = true;
    const acceptSession = (next: Session | null) => {
      if (!mounted) return;
      const id = next?.user.id ?? null;
      const changed = activeUser.current !== id;
      if (changed) { request.current++; queryClient.clear(); setProfile(null); setProfileError(null); }
      activeUser.current = id; setSession(next); setUser(next?.user ?? null);
      if (id && changed) { setLoading(true); setTimeout(() => { if (mounted && activeUser.current === id) void loadProfile(id); },0); }
      else if (!id) setLoading(false);
    };
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((_event,next) => acceptSession(next));
    supabase.auth.getSession().then(({data,error}) => { if (error) throw error; acceptSession(data.session); }).catch(() => { if (mounted) { setLoading(false); setProfileError('Não foi possível recuperar sua sessão. Entre novamente.'); } });
    return () => { mounted=false; invalidateProfile(); subscription.unsubscribe(); };
  },[loadProfile,queryClient,invalidateProfile]);
  const refreshProfile = useCallback(async () => { if (activeUser.current) await loadProfile(activeUser.current); },[loadProfile]);
  const signOut = useCallback(async () => {
    try {
      const {error} = await supabase.auth.signOut({scope:'local'});
      if (error) throw error;
      request.current++; activeUser.current=null; queryClient.clear(); setUser(null); setSession(null); setProfile(null); setProfileError(null);
      return true;
    } catch {
      toast.error('Não foi possível sair da conta. Verifique a conexão e tente novamente.');
      return false;
    }
  },[queryClient]);
  return <AuthContext.Provider value={{user,session,profile,loading,profileError,signOut,refreshProfile}}>{children}</AuthContext.Provider>;
}
