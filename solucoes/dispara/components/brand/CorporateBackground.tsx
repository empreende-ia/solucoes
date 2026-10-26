/**
 * Fundo do install wizard — visual corporativo, sóbrio e on-brand.
 *
 * Substitui a antiga "chuva matrix" (RainEffect). Composição 100% CSS
 * (sem canvas/JS, sem random → zero risco de hydration mismatch):
 *   - grade técnica discreta com fade radial nas bordas;
 *   - auroras emerald desfocadas que derivam devagar (respiração);
 *   - vinheta suave para dar foco ao card central.
 *
 * A animação respeita `prefers-reduced-motion` (ver globals.css).
 */
export function CorporateBackground() {
  return (
    <div className="corp-bg" aria-hidden="true">
      <div className="corp-grid" />
      <div className="corp-aurora corp-aurora-1" />
      <div className="corp-aurora corp-aurora-2" />
      <div className="corp-aurora corp-aurora-3" />
      <div className="corp-vignette" />
    </div>
  );
}
