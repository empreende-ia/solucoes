import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ds/dialog';
import { Input } from '@/components/ds/input';
import { Button } from '@/components/ds/button';
import { crmDb } from '@/integrations/supabase/crm-client';
import { useOrg } from '@/hooks/useOrg';
import { useDebounce } from '@/hooks/useDebounce';

const pages=[['Hoje','/dashboard'],['Contatos','/contacts'],['Empresas','/companies'],['Pipeline','/pipeline'],['Agenda','/agenda'],['Tarefas','/tasks'],['Atividades','/activities'],['Financeiro','/financeiro'],['Relatórios','/reports'],['Automações','/automations'],['Templates','/templates'],['Equipe','/team'],['Configurações','/settings'],['Integrações','/settings/integrations']];
export function CommandPalette({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void}) {
 const [search,setSearch]=useState(''); const q=useDebounce(search.trim(),250); const {orgId}=useOrg(); const navigate=useNavigate(); const location=useLocation();
 const query=useQuery({queryKey:['crm',orgId,'search',q],enabled:open&&!!orgId&&q.length>=2,queryFn:async({signal})=>{
  const {data,error}=await crmDb.rpc('search_crm',{p_query:q,p_limit:30}).abortSignal(signal); if(error) throw error; return data;
 }});
 useEffect(()=>{ if(!open) setSearch(''); },[open,orgId]);
 function select(path:string) { onOpenChange(false); navigate(path,{state:{from:location.pathname+location.search}}); }
 const filteredPages=pages.filter(([label])=>label.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
 const current=q===search.trim();
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Buscar no CRM</DialogTitle><DialogDescription>Encontre contatos, empresas, oportunidades e atividades pelo nome.</DialogDescription></DialogHeader>
  <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input autoFocus aria-label="Buscar registros e páginas" value={search} onChange={e=>setSearch(e.target.value)} maxLength={120} className="pl-9" placeholder="Digite pelo menos 2 caracteres"/></div>
  <div className="max-h-[55dvh] space-y-4 overflow-y-auto" aria-live="polite">
   {search.trim().length>=2&&<section aria-label="Registros"><h2 className="mb-2 text-xs text-muted-foreground">Registros da organização</h2>
    {(!current||query.isPending)&&<p className="py-3 text-sm">Buscando…</p>}
    {current&&query.isError&&<div role="alert"><p className="text-sm">Não foi possível buscar os registros.</p><Button variant="outline" onClick={()=>void query.refetch()}>Tentar novamente</Button></div>}
    {current&&query.isSuccess&&query.data.length===0&&<p className="py-3 text-sm text-muted-foreground">Nenhum registro encontrado. Tente outro nome.</p>}
    {current&&query.isSuccess&&query.data.map(item=><button key={item.entity+item.id} onClick={()=>select(item.path)} className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><span className="min-w-0 break-words font-medium">{item.title}</span><span className="max-w-[45%] break-words text-xs text-muted-foreground">{item.subtitle}</span></button>)}
    {query.data?.length===30&&<p className="text-xs text-muted-foreground">Mostrando os 30 registros mais recentes. Refine a busca para encontrar outros.</p>}
   </section>}
   {filteredPages.length>0&&<section aria-label="Páginas"><h2 className="mb-2 text-xs text-muted-foreground">Ir para</h2>{filteredPages.map(([label,path])=><button key={path} onClick={()=>select(path)} className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">{label}</button>)}</section>}
  </div>
 </DialogContent></Dialog>;
}
