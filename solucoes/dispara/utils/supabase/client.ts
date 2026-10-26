
import { getSupabaseBrowser } from '@/lib/supabase';

export const createClient = () => {
    const client = getSupabaseBrowser();
    if (!client) throw new Error('Supabase not configured');
    return client;
};
