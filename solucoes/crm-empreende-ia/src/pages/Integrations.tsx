import { useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Calendar,FileSpreadsheet,Mail,MessageCircle } from 'lucide-react';
import { crmDb } from '@/integrations/supabase/crm-client';
import { useAuth } from '@/contexts/AuthContext';
import { useCrmPermissions } from '@/hooks/useCrmPermissions';
import { allCrmRows } from '@/lib/crm-pagination';
import { calendarText,csvCell,downloadText,parseContactCsv,type ContactImportRow } from '@/lib/crm-import';
import { PageScaffold } from '@/components/shell/PageScaffold';
import { Button } from '@/components/ds/button';
import { Input } from '@/components/ds/input';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ds/dialog';
export default function Integrations(){
 const {profile}=useAuth();const orgId=profile?.org_id;const {canManage,canWrite}=useCrmPermissions();const qc=useQueryClient();
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[preview,setPreview]=useState<(ContactImportRow & {id:string})[]|null>(null),[parseErrors,setParseErrors]=useState<string[]>([]),[duplicates,setDuplicates]=useState(0);
 const query=useQuery({queryKey:['crm',orgId,'integrations'],enabled:!!orgId,queryFn:async()=>{const {data,error}=await crmDb.from('integration_configs').select('*').eq('org_id',orgId!);if(error)throw error;return data;}});
 const enabled=(provider:string)=>query.data?.some(c=>c.provider===provider&&c.enabled)??false;
 async function configure(provider:string,next:boolean){setBusy(provider);setError('');try{const {error:failure}=await crmDb.from('integration_configs').upsert({org_id:orgId!,provider,enabled:next,last_checked_at:new Date().toISOString()},{onConflict:'org_id,provider'});if(failure)throw failure;await qc.invalidateQueries({queryKey:['crm']});toast.success(next?'Recurso habilitado':'Recurso desabilitado');}catch{setError('Não foi possível salvar a configuração. Tente novamente.');}finally{setBusy('');}}
 async function loadFile(file:File){setBusy('file');setError('');setParseErrors([]);setPreview(null);try{
  if(file.size>2_000_000)throw new Error('O arquivo deve ter até 2 MB.');const parsed=parseContactCsv(await file.text());setParseErrors(parsed.errors);if(parsed.errors.length)return;
  const contacts=await allCrmRows((from,to)=>crmDb.from('contacts').select('email').eq('org_id',orgId!).order('id').range(from,to));
  const known=new Set(contacts.map(c=>c.email?.trim().toLowerCase()).filter(Boolean));const rows=parsed.rows.filter(r=>!r.email||!known.has(r.email));setDuplicates(parsed.rows.length-rows.length);setPreview(rows.map(row=>({...row,id:crypto.randomUUID()})));
 }catch(failure){setError(failure instanceof Error?failure.message:'Não foi possível ler o arquivo ou consultar duplicidades.');}finally{setBusy('');}}
 async function importRows(){
  if(!preview?.length||!canWrite||!orgId)return;
  setBusy('import');setError('');
  try{
   const contacts=await allCrmRows((from,to)=>crmDb.from('contacts').select('id,email').eq('org_id',orgId).order('id').range(from,to));
   const knownIds=new Set(contacts.map(c=>c.id));
   const knownEmails=new Set(contacts.map(c=>c.email?.trim().toLowerCase()).filter(Boolean));
   const pending=preview.filter(row=>!knownIds.has(row.id)&&(!row.email||!knownEmails.has(row.email.trim().toLowerCase())));
   if(pending.length!==preview.length){
    setDuplicates(count=>count+preview.length-pending.length);setPreview(pending);
    await qc.invalidateQueries({queryKey:['crm']});
    setError(pending.length?'A prévia foi atualizada: alguns contatos já foram cadastrados. Confira os contatos restantes e confirme novamente.':'Todos os contatos desta prévia já estão cadastrados. Você pode fechar esta janela.');
    return;
   }
   const {error:failure}=await crmDb.from('contacts').upsert(pending.map(row=>({...row,org_id:orgId,owner_id:profile!.id,status:'lead'})),{onConflict:'id',ignoreDuplicates:true});
   if(failure)throw failure;
   await qc.invalidateQueries({queryKey:['crm']});toast.success(`${pending.length} contatos importados`);setPreview(null);
  }catch(failure){
   setError(failure&&typeof failure==='object'&&'code' in failure&&failure.code==='23505'
    ?'Outro cadastro passou a usar um e-mail desta prévia. Tente novamente para atualizar a lista de contatos restantes.'
    :'A importação não foi confirmada. A prévia foi preservada; ao tentar novamente, conferiremos quais contatos ainda precisam ser importados.');
  }finally{setBusy('');}
 }
 async function exportData(provider:'csv'|'calendar'){setBusy('export');setError('');try{if(provider==='csv'){
  const rows=await allCrmRows((from,to)=>crmDb.from('contacts').select('first_name,last_name,email,phone').eq('org_id',orgId!).order('id').range(from,to));downloadText('contatos-empreende-ia.csv','first_name,last_name,email,phone\r\n'+rows.map(row=>[row.first_name,row.last_name,row.email,row.phone].map(csvCell).join(',')).join('\r\n'));
 }else{const rows=await allCrmRows((from,to)=>crmDb.from('activities').select('id,title,body,due_date,end_date').eq('org_id',orgId!).eq('type','meeting').is('completed_at',null).not('due_date','is',null).order('id').range(from,to));downloadText('agenda-empreende-ia.ics',calendarText(rows),'text/calendar;charset=utf-8');}toast.success('Arquivo exportado');}catch{setError('Não foi possível exportar os registros. Verifique a conexão e tente novamente.');}finally{setBusy('');}}
 return <div data-product-tour="integrations" className="h-full"><PageScaffold title="Integrações"><div className="mx-auto max-w-5xl space-y-6"><p className="text-sm text-muted-foreground">Importe dados e leve compromissos para outras ferramentas. Cada recurso informa o que está disponível e como funciona.</p>
 {error&&<p role="alert" className="rounded-xl border border-destructive p-4 text-sm">{error}</p>}{query.isPending&&<p role="status">Carregando configurações…</p>}{query.isError&&<div role="alert"><p>Não foi possível consultar o estado das integrações.</p><Button onClick={()=>void query.refetch()}>Tentar novamente</Button></div>}
 {query.isSuccess&&<div data-tour="integrations-catalog" className="grid gap-4 md:grid-cols-2">{([{id:'csv',title:'Contatos por CSV',icon:FileSpreadsheet,description:'Importação com prévia, validação e identificação de e-mails existentes. Exportação dos contatos da organização.'},{id:'calendar',title:'Agenda por arquivo ICS',icon:Calendar,description:'Exporte reuniões pendentes para importar no Google Calendar, Outlook ou Apple Calendar. A atualização é manual.'}] as const).map(item=><section key={item.id} className="space-y-4 rounded-2xl border border-border p-5"><item.icon className="h-6 w-6 text-primary"/><h2 className="text-lg font-semibold">{item.title}</h2><p className="text-sm text-muted-foreground">{item.description}</p><p data-tour={item.id==='csv'?'integrations-status':undefined} className="text-sm font-medium">{enabled(item.id)?'Habilitado':'Desabilitado pela organização'}</p>
 {canManage&&<Button data-tour={item.id==='csv'?'integrations-configure':undefined} variant="outline" disabled={!!busy} onClick={()=>void configure(item.id,!enabled(item.id))}>{enabled(item.id)?'Desabilitar':'Habilitar recurso'}</Button>}
 {!canManage&&!enabled(item.id)&&<p className="text-xs text-muted-foreground">Peça a um administrador para habilitar este recurso.</p>}
 {enabled(item.id)&&<div className="space-y-3"><Button variant="outline" disabled={!!busy} onClick={()=>void exportData(item.id)}>{item.id==='csv'?'Exportar contatos':'Exportar reuniões'}</Button>{item.id==='csv'&&canWrite&&<><Button variant="ghost" onClick={()=>downloadText('modelo-contatos.csv','first_name,last_name,email,phone\r\n')}>Baixar modelo CSV</Button><label className="block space-y-2 text-sm"><span>Importar arquivo CSV (até 500 contatos)</span><Input type="file" accept=".csv,text/csv" disabled={!!busy} onChange={e=>{const file=e.target.files?.[0];if(file)void loadFile(file);e.target.value='';}}/></label></>}</div>}
 </section>)}</div>}
 {parseErrors.length>0&&<div role="alert" className="rounded-xl border border-destructive p-4"><p className="font-medium">Revise o arquivo antes de importar</p><ul className="mt-2 list-inside list-disc text-sm">{parseErrors.slice(0,10).map((msg,index)=><li key={index}>{msg}</li>)}</ul>{parseErrors.length>10&&<p className="mt-2 text-sm">Mais {parseErrors.length-10} linhas precisam de correção.</p>}</div>}
 <section data-tour="integrations-help" className="space-y-3 rounded-2xl border border-border p-5"><h2 className="font-semibold">Como usar</h2><p className="text-sm text-muted-foreground">CSV: use first_name, last_name, email e phone no cabeçalho. Nomes não serão unidos automaticamente. E-mails já existentes são ignorados e informados na prévia.</p><p className="text-sm text-muted-foreground">Calendário: importe o arquivo ICS na sua ferramenta. Ele contém os compromissos do momento da exportação; alterações posteriores exigem nova exportação.</p><Link className="text-sm text-primary underline" to="/agenda">Abrir agenda</Link></section>
 <section className="space-y-3 rounded-2xl border border-dashed border-border p-5"><h2 className="font-semibold">Canais externos</h2><p className="text-sm text-muted-foreground"><Mail className="mr-2 inline h-4 w-4"/>Envio de e-mail e <MessageCircle className="mx-1 inline h-4 w-4"/>WhatsApp precisam de provedores e credenciais próprios. Não há conexão ou envio ativo nesta versão.</p><Link to="/templates" className="text-sm text-primary underline">Preparar templates para a equipe</Link></section>
 </div><Dialog open={preview!==null} onOpenChange={open=>{if(!open&&!busy)setPreview(null);}}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Revisar importação</DialogTitle><DialogDescription>{preview?.length} novos contatos. {duplicates} linhas já cadastradas foram ignoradas. Os contatos terão você como responsável.</DialogDescription></DialogHeader><div className="max-h-[40dvh] overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Nome</th><th className="p-2">E-mail</th></tr></thead><tbody>{preview?.slice(0,20).map((row,i)=><tr key={i}><td className="p-2">{row.first_name} {row.last_name}</td><td className="break-all p-2">{row.email??'Sem e-mail'}</td></tr>)}</tbody></table>{(preview?.length??0)>20&&<p className="p-2 text-xs text-muted-foreground">Prévia dos primeiros 20 contatos.</p>}</div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={!!busy||!preview?.length} onClick={()=>void importRows()}>{busy==='import'?'Importando…':`Confirmar importação de ${preview?.length??0} contatos`}</Button></DialogContent></Dialog></PageScaffold></div>;
}
