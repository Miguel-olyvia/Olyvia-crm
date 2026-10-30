// 16/10: no negócio e na obra, quando a encomenda de cliente tem encomendas a fornecedor por receber, diz que o próximo passo é a Receção do
// armazém e abre-a já filtrada por este cliente/obra (Inventário › Armazém › Receção). Lê o estado do Inventário novo.
import { Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInventario } from "./inventario/loja";
import { resumoEcNegocio } from "./inventario/ponteNegocios";
import { prontidaoDe, usarProntidao } from "./inventario/prontidaoReal";
import type { Negocio } from "./motor";
import type { Ctx } from "./pecas";

/** As encomendas a fornecedor da EC do negócio que ainda se recebem (por aprovar, no portal/email ou parciais). */
export function posPorReceber(d: Negocio, inv: ReturnType<typeof useInventario>): string[] {
  const r = d.obra.ec?.ref ? resumoEcNegocio(inv, d.obra.ec.ref) : null;
  return r ? r.pos.filter((p) => p.fase !== "recebida" && p.fase !== "cancelada").map((p) => p.id) : [];
}

/** 30/10 (visto no browser): as encomendas a fornecedor ainda por aprovar (pendentes). Enquanto houver, o próximo passo é Compras e
 *  armazém aprová-las, não receber: dizia "receber na Receção" com elas por aprovar. */
export function posPorAprovar(d: Negocio, inv: ReturnType<typeof useInventario>): string[] {
  const r = d.obra.ec?.ref ? resumoEcNegocio(inv, d.obra.ec.ref) : null;
  return r ? r.pos.filter((p) => p.fase === "por aprovar").map((p) => p.id) : [];
}

export function ProximoRececaoNegocio({ d, A, go }: { d: Negocio; A: Ctx["A"]; go: Ctx["go"] }) {
  const inv = useInventario();
  const ids = posPorReceber(d, inv), aprovar = posPorAprovar(d, inv);
  if (aprovar.length) return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3" role="note" aria-label="Próximo passo da encomenda">
      <p className="flex items-start gap-2 text-[15px]"><Warehouse className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span><b className="font-semibold">Próximo passo: Compras e armazém aprova {aprovar.length === 1 ? "a encomenda a fornecedor" : "as encomendas a fornecedor"}.</b> <span className="text-muted-foreground">{aprovar.join(", ")}, no passo Materiais da obra.{ids.length > aprovar.length ? ` Depois recebe-se na Receção do armazém.` : ""}</span></span></p>
    </div>
  );
  // F3 (28/10): a encomenda de cliente real (Encomendas de cliente da Olyvia): o que está a chegar do fornecedor, lido da prontidão
  const real = usarProntidao(d.obra.ec) ? prontidaoDe(d.obra.ec.contrato) : undefined;
  if (usarProntidao(d.obra.ec)) {
    if (!real || real.aChegar <= 0) return null;
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3" role="note" aria-label="Próximo passo da encomenda">
        <p className="flex items-start gap-2 text-[15px]"><Warehouse className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span><b className="font-semibold">Próximo passo: receber na Receção do armazém.</b> <span className="text-muted-foreground">{real.aChegar.toLocaleString("pt-PT")} {real.aChegar === 1 ? "unidade" : "unidades"} a chegar do fornecedor ({d.obra.ec.n}).</span></span></p>
        <Button size="sm" variant="outline" className="min-h-10" onClick={go(() => A.abrirRececao(d.id))}>Abrir Receção</Button>
      </div>
    );
  }
  if (!ids.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3" role="note" aria-label="Próximo passo da encomenda">
      <p className="flex items-start gap-2 text-[15px]"><Warehouse className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span><b className="font-semibold">Próximo passo: receber na Receção do armazém.</b> <span className="text-muted-foreground">{ids.length === 1 ? "1 encomenda a fornecedor" : `${ids.length} encomendas a fornecedor`} por receber ({ids.join(", ")}).</span></span></p>
      <Button size="sm" variant="outline" className="min-h-10" onClick={go(() => A.abrirRececao(d.id))}>Abrir Receção</Button>
    </div>
  );
}
