import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ensureEdgeSecrets } from '../_shared/system-config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate a unique verify token
function generateVerifyToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'empreende-ia-';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Default pipeline stages — cores em tokens Empreende.IA (mesmo vocabulário
// do picker em src/lib/stageColors.ts; nunca usar classes de cor cruas)
const DEFAULT_PIPELINE_STAGES = [
  { position: 0, title: 'Novos Leads', color: 'border-muted-foreground', is_system: false, is_ai_managed: false },
  { position: 1, title: 'Em Qualificação', color: 'border-chart-2', is_system: false, is_ai_managed: true },
  { position: 2, title: 'Oportunidade', color: 'border-chart-3', is_system: false, is_ai_managed: true },
  { position: 3, title: 'Fechamento', color: 'border-primary', is_system: false, is_ai_managed: false },
  { position: 100, title: 'Ganho', color: 'border-success', is_system: true, is_ai_managed: false },
  { position: 101, title: 'Perdido', color: 'border-destructive', is_system: true, is_ai_managed: false },
];

// Default tag definitions
const DEFAULT_TAG_DEFINITIONS = [
  { key: 'hot_lead', label: 'Lead Quente', color: '#ef4444', category: 'status' },
  { key: 'warm_lead', label: 'Lead Morno', color: '#f97316', category: 'status' },
  { key: 'cold_lead', label: 'Lead Frio', color: '#3b82f6', category: 'status' },
  { key: 'qualified', label: 'Qualificado', color: '#22c55e', category: 'qualification' },
  { key: 'unqualified', label: 'Não Qualificado', color: '#6b7280', category: 'qualification' },
  { key: 'interested', label: 'Interessado', color: '#8b5cf6', category: 'interest' },
  { key: 'follow_up', label: 'Follow-up', color: '#eab308', category: 'action' },
  { key: 'demo_requested', label: 'Demo Solicitada', color: '#06b6d4', category: 'action' },
];

// Default teams
const DEFAULT_TEAMS = [
  { name: 'Vendas', description: 'Equipe de vendas', color: '#3b82f6', is_active: true },
  { name: 'Suporte', description: 'Equipe de suporte ao cliente', color: '#22c55e', is_active: true },
];

// Default team functions
const DEFAULT_TEAM_FUNCTIONS = [
  { name: 'SDR', description: 'Sales Development Representative', is_active: true },
  { name: 'Closer', description: 'Responsável por fechar vendas', is_active: true },
  { name: 'CS', description: 'Customer Success', is_active: true },
];


// Default lara_settings values for a fresh system
const DEFAULT_LARA_SETTINGS = {
  is_active: true,
  auto_response_enabled: true,
  ai_provider: 'openai',
  ai_model: 'gpt-5.6-terra',
  ai_model_mode: 'flash',
  timezone: 'America/Sao_Paulo',
  business_hours_start: '09:00:00',
  business_hours_end: '18:00:00',
  business_days: [1, 2, 3, 4, 5],
  audio_response_enabled: false,
  response_delay_min: 1000,
  response_delay_max: 3000,
  message_breaking_enabled: true,
  adaptive_response_enabled: true,
  ai_scheduling_enabled: true,
  route_all_to_receiver_enabled: false,
  company_name: 'Empreende.IA',
  sdr_name: 'Lara',
  // O comportamento é criado em agent_drafts e só entra em produção por
  // agent_versions. O campo legado permanece nulo apenas por compatibilidade
  // com bancos ainda não migrados.
  system_prompt_override: null,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Seed dos secrets no Vault (URL + service role deste projeto) — é o que
    // liga os cron sweeps num projeto recém-remixado, sem nada hardcoded
    await ensureEdgeSecrets(supabase);

    let userId: string | null = null;
    try {
      const body = await req.json();
      userId = body.user_id || null;
    } catch {
      // Body might be empty
    }

    if (!userId) {
      console.error('[initialize-system] No user_id provided');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'user_id is required in request body',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    console.log('[initialize-system] Initializing for user:', userId);

    const results = {
      profile: { initialized: false, existed: false },
      user_role: { assigned: false, role: '', existed: false },
      lara_settings: { initialized: false, existed: false, isFirstUser: false },
      pipeline_stages: { initialized: false, existed: false, count: 0 },
      tag_definitions: { initialized: false, existed: false, count: 0 },
      teams: { initialized: false, existed: false, count: 0 },
      team_functions: { initialized: false, existed: false, count: 0 },
      verify_token: { generated: false, token: '' },
    };

    // 0. Ensure profile exists for this user
    console.log('[initialize-system] Checking profile for user...');
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingProfile) {
      console.log('[initialize-system] Profile already exists for user');
      results.profile.existed = true;
    } else {
      console.log('[initialize-system] Creating profile for user...');
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      const fullName = userData?.user?.user_metadata?.full_name || 
                       userData?.user?.email?.split('@')[0] || 
                       'Usuário';
      
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: userId,
          full_name: fullName,
        });

      if (profileError) {
        if (profileError.code === '23505') {
          console.log('[initialize-system] Profile already exists (race condition)');
          results.profile.existed = true;
        } else {
          console.error('[initialize-system] Error creating profile:', profileError);
        }
      } else {
        results.profile.initialized = true;
        console.log('[initialize-system] Profile created successfully');
      }
    }

    // Check if this is the FIRST user (no existing global settings)
    console.log('[initialize-system] Checking if global lara_settings exist...');
    const { data: existingGlobalSettings } = await supabase
      .from('lara_settings')
      .select('id, whatsapp_verify_token')
      .limit(1)
      .maybeSingle();

    if (existingGlobalSettings) {
      // System already configured - this is NOT the first user
      console.log('[initialize-system] Global settings already exist - not first user');
      results.lara_settings.existed = true;
      results.lara_settings.isFirstUser = false;
      
      // Just return the existing verify token
      results.verify_token.token = existingGlobalSettings.whatsapp_verify_token || '';
      
      // Don't create any more default data - system is already configured
      console.log('[initialize-system] System already initialized, skipping default data creation');

      // Assign 'user' role if user doesn't have any role yet
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id, role')
        .eq('user_id', userId)
        .maybeSingle();

      if (existingRole) {
        console.log('[initialize-system] User already has role:', existingRole.role);
        results.user_role.existed = true;
        results.user_role.role = existingRole.role;
      } else {
        console.log('[initialize-system] Assigning user role to subsequent user...');
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: userId,
            role: 'user',
          });

        if (roleError) {
          if (roleError.code === '23505') {
            console.log('[initialize-system] User already has role (race condition)');
            results.user_role.existed = true;
          } else {
            console.error('[initialize-system] Error assigning user role:', roleError);
          }
        } else {
          results.user_role.assigned = true;
          results.user_role.role = 'user';
          console.log('[initialize-system] User role assigned');
        }
      }
      
    } else {
      // This IS the first user - create all default data (globally, without user_id)
      console.log('[initialize-system] No global settings found - this is the FIRST user!');
      results.lara_settings.isFirstUser = true;

      // Assign 'admin' role to the first user
      console.log('[initialize-system] Assigning admin role to first user...');
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: 'admin',
        });

      if (roleError) {
        if (roleError.code === '23505') {
          console.log('[initialize-system] User already has admin role (race condition)');
          results.user_role.existed = true;
          results.user_role.role = 'admin';
        } else {
          console.error('[initialize-system] Error assigning admin role:', roleError);
        }
      } else {
        results.user_role.assigned = true;
        results.user_role.role = 'admin';
        console.log('[initialize-system] Admin role assigned to first user');
      }

      // Create global lara_settings (user_id = NULL for global access)
      const newToken = generateVerifyToken();
      const { error: settingsError } = await supabase
        .from('lara_settings')
        .insert({
          ...DEFAULT_LARA_SETTINGS,
          whatsapp_verify_token: newToken,
          user_id: null, // Global settings - no user_id
        });

      if (settingsError) {
        if (settingsError.code === '23505') {
          console.log('[initialize-system] Settings already exist (race condition)');
          results.lara_settings.existed = true;
        } else {
          console.error('[initialize-system] Error creating lara_settings:', settingsError);
          throw settingsError;
        }
      } else {
        results.lara_settings.initialized = true;
        results.verify_token.generated = true;
        results.verify_token.token = newToken;
        console.log('[initialize-system] Global lara_settings created');
      }

      // Create global pipeline_stages (user_id = NULL)
      console.log('[initialize-system] Creating global pipeline_stages...');
      const stagesWithoutUserId = DEFAULT_PIPELINE_STAGES.map(stage => ({
        ...stage,
        user_id: null,
      }));
      
      const { error: stagesError } = await supabase
        .from('pipeline_stages')
        .insert(stagesWithoutUserId);

      if (stagesError) {
        if (stagesError.code === '23505') {
          console.log('[initialize-system] pipeline_stages already exist (race condition)');
          results.pipeline_stages.existed = true;
        } else {
          console.error('[initialize-system] Error creating pipeline_stages:', stagesError);
        }
      } else {
        results.pipeline_stages.initialized = true;
        results.pipeline_stages.count = DEFAULT_PIPELINE_STAGES.length;
        console.log(`[initialize-system] Created ${DEFAULT_PIPELINE_STAGES.length} global pipeline stages`);
      }

      // Create global tag_definitions (user_id = NULL)
      console.log('[initialize-system] Creating global tag_definitions...');
      const tagsWithoutUserId = DEFAULT_TAG_DEFINITIONS.map(tag => ({
        ...tag,
        user_id: null,
      }));
      
      const { error: tagsError } = await supabase
        .from('tag_definitions')
        .insert(tagsWithoutUserId);

      if (tagsError) {
        if (tagsError.code === '23505') {
          console.log('[initialize-system] tag_definitions already exist (race condition)');
          results.tag_definitions.existed = true;
        } else {
          console.error('[initialize-system] Error creating tag_definitions:', tagsError);
        }
      } else {
        results.tag_definitions.initialized = true;
        results.tag_definitions.count = DEFAULT_TAG_DEFINITIONS.length;
        console.log(`[initialize-system] Created ${DEFAULT_TAG_DEFINITIONS.length} global tag definitions`);
      }

      // Create global teams (user_id = NULL)
      console.log('[initialize-system] Creating global teams...');
      const teamsWithoutUserId = DEFAULT_TEAMS.map(team => ({
        ...team,
        user_id: null,
      }));
      
      const { error: teamsError } = await supabase
        .from('teams')
        .insert(teamsWithoutUserId);

      if (teamsError) {
        if (teamsError.code === '23505') {
          console.log('[initialize-system] teams already exist (race condition)');
          results.teams.existed = true;
        } else {
          console.error('[initialize-system] Error creating teams:', teamsError);
        }
      } else {
        results.teams.initialized = true;
        results.teams.count = DEFAULT_TEAMS.length;
        console.log(`[initialize-system] Created ${DEFAULT_TEAMS.length} global teams`);
      }

      // Create global team_functions (user_id = NULL)
      console.log('[initialize-system] Creating global team_functions...');
      const functionsWithoutUserId = DEFAULT_TEAM_FUNCTIONS.map(func => ({
        ...func,
        user_id: null,
      }));
      
      const { error: functionsError } = await supabase
        .from('team_functions')
        .insert(functionsWithoutUserId);

      if (functionsError) {
        if (functionsError.code === '23505') {
          console.log('[initialize-system] team_functions already exist (race condition)');
          results.team_functions.existed = true;
        } else {
          console.error('[initialize-system] Error creating team_functions:', functionsError);
        }
      } else {
        results.team_functions.initialized = true;
        results.team_functions.count = DEFAULT_TEAM_FUNCTIONS.length;
        console.log(`[initialize-system] Created ${DEFAULT_TEAM_FUNCTIONS.length} global team functions`);
      }
    }

    console.log('[initialize-system] Initialization complete:', results);

    return new Response(
      JSON.stringify({
        success: true,
        message: results.lara_settings.isFirstUser 
          ? 'System initialized successfully (first user)' 
          : 'User profile initialized (system already configured)',
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[initialize-system] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
