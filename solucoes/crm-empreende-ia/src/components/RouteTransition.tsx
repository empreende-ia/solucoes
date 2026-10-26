import { useEffect, useRef, useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { useIsFetching } from "@tanstack/react-query";

/**
 * Navegação em duas fases: ao trocar de rota, mantemos a página anterior
 * visível enquanto a próxima página é montada "em segundo plano" (com
 * display:none) para disparar suas queries. Quando todas as queries do
 * react-query terminam (ou o limite máximo é atingido), trocamos a tela.
 *
 * Resultado: o usuário nunca vê uma tela vazia "pesquisando" — ele continua
 * vendo o conteúdo anterior até que o próximo esteja pronto.
 */
const MIN_MS = 120;
const MAX_MS = 4000;

export function RouteTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  const isFetching = useIsFetching();

  const [committedPath, setCommittedPath] = useState(location.pathname);
  const previousOutlet = useRef<React.ReactNode>(outlet);
  const pendingSince = useRef<number>(0);
  // Tick para re-avaliar a condição de commit após o tempo mínimo,
  // mesmo que isFetching não tenha mudado.
  const [tick, setTick] = useState(0);

  const pending = committedPath !== location.pathname;

  // Marca o início da transição quando a rota muda.
  useEffect(() => {
    if (committedPath !== location.pathname) {
      pendingSince.current = Date.now();
    }
  }, [location.pathname, committedPath]);

  // Snapshot da página anterior enquanto estamos em "estado estável".
  if (!pending) {
    previousOutlet.current = outlet;
  }

  // Decide quando confirmar a troca para a nova rota.
  useEffect(() => {
    if (!pending) return;
    const elapsed = Date.now() - pendingSince.current;

    if (elapsed >= MAX_MS) {
      setCommittedPath(location.pathname);
      return;
    }

    if (isFetching === 0 && elapsed >= MIN_MS) {
      setCommittedPath(location.pathname);
      return;
    }

    // Reagenda uma re-checagem se ainda não atingimos o mínimo.
    const wait = elapsed < MIN_MS ? MIN_MS - elapsed + 16 : 150;
    const t = window.setTimeout(() => setTick((n) => n + 1), wait);
    return () => window.clearTimeout(t);
  }, [pending, isFetching, location.pathname, tick]);

  if (!pending) {
    return <div className="h-full min-h-0">{outlet}</div>;
  }

  return (
    <>
      {/* Página anterior continua visível para não perder o contexto */}
      <div aria-hidden={false} className="h-full min-h-0">{previousOutlet.current}</div>
      {/* Próxima página montada escondida para disparar suas queries */}
      <div style={{ display: "none" }} aria-hidden>
        {outlet}
      </div>
      {/* Indicador discreto de carregamento no topo */}
      <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/10">
        <div className="h-full w-1/3 animate-[loading_1.2s_ease-in-out_infinite] bg-primary" />
      </div>
      <style>{`@keyframes loading {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(400%); }
      }`}</style>
    </>
  );
}
