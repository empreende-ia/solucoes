import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass,ArrowUpRight } from 'lucide-react';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ds/dialog';
import { Button } from '@/components/ds/button';
import { Input } from '@/components/ds/input';
import { useCrmSnapshot } from '@/hooks/useCrmSnapshot';
import { useCrmPermissions } from '@/hooks/useCrmPermissions';
import { copilotAnswer,type CopilotEvidence } from '@/lib/copilot-evidence';
import { ActivityDialog } from '@/components/workday/ActivityDialog';
import { useAuth } from '@/contexts/AuthContext';
export function AICopilot(){
 const [open,setOpen]=useState(false);const {user,profile}=useAuth();
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('empreende-crm:open-copilot',show);return()=>window.removeEventListener('empreende-crm:open-copilot',show);},[]);
 useEffect(()=>setOpen(false),[user?.id,profile?.org_id]);
 return open?<CopilotSession onClose={()=>setOpen(false)}/>:null;
}
function CopilotSession({onClose}:{onClose:()=>void}){
 const snapshot=useCrmSnapshot();const {canWrite}=useCrmPermissions();
 const [question,setQuestion]=useState(''),[submitted,setSubmitted]=useState('O que priorizar hoje?');
 const [draft,setDraft]=useState<CopilotEvidence['suggestion']|null>(null);
 const answer=snapshot.data?copilotAnswer(submitted,snapshot.data):null;
 if(draft&&snapshot.data)return <ActivityDialog data={snapshot.data} defaults={{...draft,type:'task'}} onClose={onClose}/>;
 return <Dialog open onOpenChange={value=>{if(!value)onClose();}}><DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><Compass className="h-5 w-5 text-primary"/>Copiloto de rotina</DialogTitle><DialogDescription>Análise dos registros e sugestões com fontes. Nenhuma alteração é feita sem sua revisão.</DialogDescription></DialogHeader>
 <p className="text-xs text-muted-foreground">Esta versão usa regras verificáveis do CRM. Não há modelo de IA externo conectado.</p>
 <form onSubmit={e=>{e.preventDefault();if(question.trim())setSubmitted(question.trim());}} className="flex gap-2"><Input aria-label="Pergunta ao copiloto" placeholder="Prioridades ou nome de um registro" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={160}/><Button type="submit" disabled={!question.trim()||!snapshot.data}>Analisar</Button></form>
 <div className="flex flex-wrap gap-2">{['O que priorizar hoje?','Quais oportunidades estão paradas?','O que falta nos contatos?'].map(q=><Button key={q} size="sm" variant="outline" onClick={()=>{setQuestion(q);setSubmitted(q);}}>{q}</Button>)}</div>
 {snapshot.isPending&&<p role="status">Consultando registros…</p>}
 {snapshot.isError&&<div role="alert" className="space-y-3 rounded-xl border border-destructive p-4"><p>Não foi possível consultar os registros. Não há uma análise confiável disponível agora.</p><Button variant="outline" onClick={()=>void snapshot.refetch()}>Tentar novamente</Button></div>}
 {answer&&!snapshot.isError&&<section aria-live="polite" className="space-y-4"><h2 className="text-sm font-semibold">{submitted}</h2><p className="text-sm">{answer.summary}</p>{answer.evidence.map(item=><article key={item.id} className="space-y-3 rounded-2xl border border-border p-4"><h3 className="font-medium">{item.title}</h3><p className="text-sm text-muted-foreground"><strong className="font-medium text-foreground">Registrado:</strong> {item.fact}</p><Link to={item.path} onClick={onClose} className="inline-flex items-center gap-1 text-sm text-primary underline">Ver registro de origem<ArrowUpRight className="h-3 w-3"/></Link>{item.suggestion&&<div className="space-y-2 border-t border-border pt-3"><p className="text-sm"><strong className="font-medium">Sugestão:</strong> registrar uma atividade para definir o próximo passo com a equipe.</p>{canWrite?<Button variant="outline" size="sm" onClick={()=>setDraft(item.suggestion!)}>Revisar atividade sugerida</Button>:<p className="text-xs text-muted-foreground">Seu papel permite consulta. Peça a um colaborador para registrar a ação.</p>}</div>}</article>)}<div className="rounded-xl bg-muted p-4"><h3 className="text-sm font-medium">O que não está confirmado</h3>{answer.unknown.map(line=><p key={line} className="mt-2 text-xs text-muted-foreground">{line}</p>)}</div><p className="text-xs text-muted-foreground">Dados consultados em {new Date(snapshot.dataUpdatedAt).toLocaleTimeString('pt-BR')}. <button className="underline" onClick={()=>void snapshot.refetch()}>Atualizar análise</button></p></section>}
 </DialogContent></Dialog>;
}
