import { Check } from "lucide-react";
import Wordmark from "./Wordmark";

export function AuthBrandPanel({ recovery = false }: { recovery?: boolean }) {
  return <aside className="eia-auth-brand relative hidden flex-col justify-between overflow-hidden lg:flex">
    <img src="/materials/empreende-glass-hero.jpg" alt="" className="eia-auth-art" aria-hidden="true" />
    <div className="relative z-10"><Wordmark variant="wordmark" onDark /><p className="mt-3 text-sm text-white/60">CRM</p></div>
    <div className="eia-auth-story relative z-10">
      <span className="eia-auth-label">Seu próximo passo começa aqui</span>
      <h1>{recovery ? "Volte a cuidar dos seus relacionamentos." : "Mais clareza em cada relacionamento."}</h1>
      {!recovery && <ul className="mt-8 space-y-4">
        {["Acompanhe cada oportunidade", "Organize a agenda e os próximos passos", "Mantenha sua equipe no mesmo contexto"].map((item) => (
          <li key={item} className="flex items-center gap-3 text-base text-white/80"><Check className="h-4 w-4 shrink-0 text-[#8de7bb]" aria-hidden="true" />{item}</li>
        ))}
      </ul>}
    </div>
    <p className="relative z-10 text-sm text-white/55">Empreende.IA · Relacionamentos que fazem o negócio crescer.</p>
  </aside>;
}
