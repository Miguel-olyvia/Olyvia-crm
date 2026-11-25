// A ficha do fornecedor (SupplierSheet) dentro da moldura do novo Inventário — o painel `p.k==='sup'` do artefacto
// vault/inventario-redesenho-completo.html: subtítulo "código · cidade", pílulas de estado no cabeçalho, separadores
// em pílula (.ptabs) e, no Resumo, os números do SLA em quadrados `muted` e as linhas em cartões `muted` arredondados.
// Só apresentação: o SupplierSheet decide o conteúdo, as permissões e as ações (iguais dentro e fora da moldura).
import type { Database } from "@/integrations/supabase/types";
import type { SupplierPortalState } from "../useSupplierListStats";
import type { SupplierContractListState } from "../contract/useSupplierContracts";
import { FornPilula, contratoPilula, portalPilula } from "./fornPilulas";

type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];

/** "FOR-0012 · Leiria" (pnHead do artefacto). */
export function FornFichaSubtitulo({ supplier }: { supplier: Supplier }) {
  return (
    <div className="mt-0.5 font-mono text-[12.5px] text-muted-foreground" data-testid="forn-ficha-subtitulo">
      {[supplier.code || "—", supplier.city || "—"].join(" · ")}
    </div>
  );
}

/** Ativo/Inativo · Portal: … · Contrato: … · Eliminado — os mesmos estados dos distintivos do cabeçalho clássico. */
export function FornFichaPilulas({
  supplier,
  portal,
  contrato,
}: {
  supplier: Supplier;
  /** null = sem dados (não se mostra, como o distintivo clássico). */
  portal: SupplierPortalState | null;
  /** undefined = sem dados (não se mostra). */
  contrato: SupplierContractListState | null | undefined;
}) {
  const p = portal ? portalPilula(portal) : null;
  const c = contrato !== undefined ? contratoPilula(contrato) : null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" data-testid="forn-ficha-pilulas">
      <FornPilula tom={supplier.is_active ? "ok" : "neutral"}>{supplier.is_active ? "Ativo" : "Inativo"}</FornPilula>
      {p ? <FornPilula tom={p.tom}>{p.texto}</FornPilula> : null}
      {c ? <FornPilula tom={c.tom}>{c.texto}</FornPilula> : null}
      {supplier.deleted_at ? <FornPilula tom="bad">Eliminado</FornPilula> : null}
    </div>
  );
}

/** .ptabs do artefacto: a faixa e cada separador. */
export const PTABS_LISTA = "mt-3 mb-3 flex gap-1 overflow-x-auto rounded-full bg-muted p-1";
export const ptabsBotao = (on: boolean): string =>
  [
    "inline-flex min-h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full px-[11px] text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  ].join(" ");

/**
 * Corpo da ficha embebida. No Resumo (SupplierSummaryTab: KpiTile + tabelas de POs) muda só o aspeto, por CSS a partir
 * daqui — os números do SLA em quadrados `muted` arredondados e as listas de POs em cartões `muted` `rounded-2xl`.
 * Os outros separadores (formulário, catálogo, preços, portal, contrato) ficam com o seu conteúdo tal como está.
 */
export const RESUMO_EMBEBIDO = [
  // quadrados do SLA (KpiTile: "rounded-lg border bg-card p-4 shadow-sm")
  "[&_.bg-card.shadow-sm]:rounded-2xl [&_.bg-card.shadow-sm]:border-0 [&_.bg-card.shadow-sm]:bg-muted [&_.bg-card.shadow-sm]:px-3 [&_.bg-card.shadow-sm]:py-2.5 [&_.bg-card.shadow-sm]:shadow-none",
  // listas de POs (o contorno da tabela: "overflow-x-auto rounded-lg border")
  "[&_.overflow-x-auto.rounded-lg.border]:rounded-2xl [&_.overflow-x-auto.rounded-lg.border]:border-0 [&_.overflow-x-auto.rounded-lg.border]:bg-muted",
  "[&_h3]:text-[12.5px] [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.12em] [&_h3]:text-muted-foreground",
].join(" ");
