"""Generate database types from the isolated PostgreSQL schema, without credentials in output."""
import json,subprocess,pathlib,sys
cmd=['psql','-X','-At','-v','ON_ERROR_STOP=1',*sys.argv[1:]]
def query(sql): return json.loads(subprocess.check_output(cmd+['-c',sql],text=True))
cols=query("select json_agg(x) from (select table_name,column_name,data_type,is_nullable,column_default,is_generated from information_schema.columns where table_schema='public' order by table_name,ordinal_position)x")
tables={}
for c in cols: tables.setdefault(c['table_name'],[]).append(c)
def typ(c):
 t='string[]' if c['data_type']=='ARRAY' else 'number' if c['data_type'] in ('integer','numeric','bigint','double precision','smallint') else 'boolean' if c['data_type']=='boolean' else 'Json' if c['data_type'] in ('json','jsonb') else 'string'
 return t+(' | null' if c['is_nullable']=='YES' else '')
lines=['// Generated from the commercial PostgreSQL schema by scripts/generate-commercial-types.py.','export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];','export type CommercialDatabase = { public: { Tables: {']
for t,cs in tables.items():
 lines.append(f'  {t}: {{')
 for kind in ('Row','Insert','Update'):
  lines.append(f'    {kind}: {{')
  for c in cs:
   if kind!='Row' and c['is_generated']!='NEVER': continue
   opt=kind=='Update' or (kind=='Insert' and (c['is_nullable']=='YES' or c['column_default'] is not None))
   lines.append(f'      {c["column_name"]}{"?" if opt else ""}: {typ(c)};')
  lines.append('    };')
 lines.append('    Relationships: [];\n  };')
lines+=['}; Views: { [_ in never]: never }; Functions: {',
 'create_workspace: { Args: { p_name: string }; Returns: string };',
 'set_member_role: { Args: { p_user_id: string; p_role: string }; Returns: undefined };',
 'accept_invitation: { Args: { p_invitation_id: string }; Returns: string };',
 'move_deal: { Args: { p_deal_id: string; p_stage_id: string; p_status?: string; p_lost_reason?: string }; Returns: Json };',
 'search_crm: { Args: { p_query: string; p_limit?: number }; Returns: {entity:string;id:string;title:string;subtitle:string;path:string}[] };',
 '}; Enums: { [_ in never]: never }; CompositeTypes: { [_ in never]: never }; } };',
 'export type CrmRow<T extends keyof CommercialDatabase["public"]["Tables"]> = CommercialDatabase["public"]["Tables"][T]["Row"];']
pathlib.Path('src/integrations/supabase/commercial-types.ts').write_text('\n'.join(lines)+'\n')
