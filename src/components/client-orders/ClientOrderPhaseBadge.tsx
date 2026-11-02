// A fase da obra de uma linha da Encomenda de Cliente: um distintivo pequeno com a cor da fase (a rampa do plano da obra, COR_FASE).
// Uma fase: "F3 · Revestimentos"; várias (um serviço que atravessa fases): "F2 · F3", com os nomes no title.
// O texto fica na cor normal (a rampa só na borda e no ponto): o roxo claro da fase 1 não tem contraste para texto pequeno.
import { COR_FASE, FASES_OBRA, type FaseObra } from "@/emylia/fasesObra";

export function ClientOrderPhaseBadge({ fases }: { fases: readonly FaseObra[] }) {
  if (!fases.length) return <span className="text-muted-foreground">—</span>;
  const nomes = fases.map((f) => `Fase ${f} · ${FASES_OBRA[f - 1]?.curto ?? ""}`).join(", ");
  const texto = fases.length === 1 ? `F${fases[0]} · ${FASES_OBRA[fases[0] - 1]?.curto ?? ""}` : fases.map((f) => `F${f}`).join(" · ");
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-card px-2 py-0.5 text-[11.5px] font-medium text-foreground"
      style={{ borderColor: COR_FASE[fases[0]] }}
      title={nomes}
    >
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {fases.map((f) => (
          <span key={f} className="h-2 w-2 rounded-full" style={{ backgroundColor: COR_FASE[f] }} />
        ))}
      </span>
      <span>{texto}</span>
      {fases.length > 1 ? <span className="sr-only">{nomes}</span> : null}
    </span>
  );
}
