import { useCrmSnapshot } from '@/hooks/useCrmSnapshot';
import { Button } from '@/components/ds/button';
import { copilotAnswer } from '@/lib/copilot-evidence';
import { Link } from 'react-router-dom';
export function AIInsightsPanel(){const query=useCrmSnapshot();if(query.isPending)return <p role="status">Consultando registros…</p>;if(query.isError)return <div role="alert"><p>Não foi possível gerar a análise dos registros.</p><Button variant="outline" onClick={()=>void query.refetch()}>Tentar novamente</Button></div>;const answer=copilotAnswer('O que priorizar hoje?',query.data);return <div className="space-y-3"><p className="text-sm">{answer.summary}</p>{answer.evidence.map(e=><Link key={e.id} to={e.path} className="block text-sm text-primary underline">{e.title}</Link>)}</div>;}
