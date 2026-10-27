// O portal do cliente para quem entrou com a sua conta (2.0, 23/10/2026). Antes abria só o primeiro negócio com documentos: um cliente
// com duas obras nunca chegava à segunda. Agora, com um só negócio, abre-o direto (como sempre); com vários, primeiro "Os seus pedidos"
// (o mais recente primeiro, como a conta os guarda) e, dentro do portal, "Os meus pedidos" volta à lista.
// Também aqui: a encomenda que o link do email do fornecedor leva (?po=), para o portal do fornecedor a abrir logo.
import { useState } from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { PortalCliente, passoPortal } from "./PortalCliente";
import type { Negocio } from "./motor";
import type { Ctx } from "./pecas";

const noPortal = (d: Negocio): boolean => !!d.orc?.enviada || !!d.adendas?.some((a) => !!a.enviada);

/** Os negócios da conta que já têm alguma coisa no portal, sem repetidos, pela ordem da conta (o envio mais recente primeiro). */
export function negociosDoPortal(deals: Negocio[], ids: number[]): Negocio[] {
  const vistos = new Set<number>();
  const r: Negocio[] = [];
  for (const id of ids) {
    if (!Number.isFinite(id) || vistos.has(id)) continue;
    vistos.add(id);
    const d = deals.find((x) => x.id === id);
    if (d && noPortal(d)) r.push(d);
  }
  return r;
}

/** O que espera pelo cliente em cada negócio, numa frase curta (a lista dos pedidos). */
const ESTADO: Record<ReturnType<typeof passoPortal>["estado"], string> = {
  rever: "Proposta para rever", pedido: "Pediu alterações: a nova versão está a ser preparada", recusada: "Proposta recusada",
  preparar: "O contrato está a ser preparado", revisao: "O contrato está a ser revisto", assinar: "Contrato por assinar",
  obra: "Obra", pagar: "Fatura por pagar", auto: "Receber a obra", relatorio: "Obra concluída", sem: "À espera de documentos",
};

/** O código da encomenda que o link do email trouxe (?po=), se tiver o formato de um código; senão null. */
export function lerPoDoLink(): string | null {
  try {
    const po = new URLSearchParams(window.location.search).get("po");
    return po && /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,39}$/.test(po) ? po : null;
  } catch {
    return null;
  }
}

export function PortalClienteConta({ ctx, ids, sair }: { ctx: Ctx; ids: number[]; sair: () => void }) {
  const ds = negociosDoPortal(ctx.S.deals, ids);
  const [aberto, setAberto] = useState<number | null>(null);
  const d = ds.length === 1 ? ds[0] : ds.find((x) => x.id === aberto);
  if (d) return <PortalCliente ctx={ctx} d={d} fechar={sair} outrosPedidos={ds.length > 1 ? () => setAberto(null) : undefined} />;
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur">
        <p className="text-sm font-semibold tracking-[0.18em] text-slate-900">MUDELAR</p>
        <button type="button" onClick={sair} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[15px] font-medium hover:bg-slate-200">
          <LogOut className="h-4 w-4" aria-hidden="true" />Sair
        </button>
      </div>
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <header>
          <h1 className="text-2xl font-semibold">Os seus pedidos</h1>
          <p className="text-[15px] text-slate-600">Escolha o pedido que quer ver.</p>
        </header>
        <ul className="grid gap-3" aria-label="Os seus pedidos">
          {ds.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => setAberto(x.id)}
                className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-slate-300 bg-white p-4 text-left outline-none transition-colors hover:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-900">
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold">{x.servico || "Pedido " + x.id}</span>
                  <span className="block text-[15px] text-slate-600">{[x.f.morada || x.local, ESTADO[passoPortal(x).estado]].filter(Boolean).join(" · ")}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
