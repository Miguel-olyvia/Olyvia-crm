/**
 * Abreviatura à vista e texto por extenso só para leitores de ecrã ("3 d" / "3 dias").
 * O extenso não é selecionável, para copiar dar um só texto.
 */
export function TextoDual({ curto, longo }: { curto: string; longo: string }) {
  if (curto === longo) return <>{curto}</>;
  return (
    <>
      <span aria-hidden="true">{curto}</span>
      <span className="sr-only select-none">{longo}</span>
    </>
  );
}
