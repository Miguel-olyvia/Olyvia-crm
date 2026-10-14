// O portal do fornecedor (14/10/2026): o que o fornecedor vê de uma encomenda, aberto a partir do Inventário.
// Vê as linhas com os preços dele e escolhe o dia da entrega entre os próximos dias úteis, sabendo quando a obra começa
// (o dia que chega depois do arranque aparece a avisar). Confirmar chama A.confirmarEntrega com a data escolhida.
import { useState } from "react";
import { Check, Truck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, nfmt, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { dataCurta, isoDia, proximoUtil } from "./planoObra";
import { inicioDoPlano, totalEf } from "./preparacaoObra";

/** Os próximos `n` dias úteis a partir de amanhã. */
function proximosUteis(n: number): Date[] {
  const out: Date[] = [];
  let x = new Date(); x.setDate(x.getDate() + 1);
  while (out.length < n) { x = proximoUtil(x); out.push(x); x = new Date(x); x.setDate(x.getDate() + 1); }
  return out;
}

export function PortalFornecedor({ ctx, d, fechar }: { ctx: Ctx; d: Negocio; fechar: () => void }) {
  const { A, run } = ctx;
  const e = d.obra.enc!;
  const inicio = d.obra.plano ? inicioDoPlano(d.obra.plano) : null;
  const dias = proximosUteis(8);
  // por omissão, o último dia útil antes do início da obra (ou o primeiro disponível)
  const antes = inicio ? dias.filter((x) => x < inicio) : [];
  const [dia, setDia] = useState<string>(e.entregaIso ?? isoDia(antes.length ? antes[antes.length - 1] : dias[0]));
  const confirmada = !!e.entrega && e.entregaIso === dia;
  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-100 text-slate-900 animate-in fade-in-0 duration-200" role="dialog" aria-modal="true" aria-label={`Portal do fornecedor: ${e.forn ?? ""}`}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <p className="text-sm text-slate-600">Portal do fornecedor · como {(e.forn ?? "o fornecedor").replace(" (exemplo)", "")} vê</p>
        <button type="button" onClick={fechar} aria-label="Fechar o portal" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-slate-200"><X className="h-5 w-5" /></button>
      </div>
      <div className="mx-auto w-full max-w-lg space-y-5 px-4 py-6">
        <header>
          <p className="text-sm font-semibold tracking-wide text-slate-500">{(e.forn ?? "").replace(" (exemplo)", "").toUpperCase()}</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold"><Truck className="h-6 w-6" aria-hidden="true" />Encomenda {e.n}</h1>
          <p className="text-[15px] text-slate-600">Da Mudelar · entregar no Armazém Central{inicio ? ` · a obra começa a ${dataCurta(inicio)}` : ""}</p>
        </header>
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <ul className="divide-y divide-slate-200">
            {e.linhas.map((x) => (
              <li key={x.n} className="flex justify-between gap-3 py-2.5 text-[15px]">
                <span>{x.n}<span className="block text-sm text-slate-500">{nfmt(x.q)} {x.un}{x.custo ? ` × ${eur(x.custo)} €` : ""}</span></span>
                <span className="tabular-nums">{x.custo ? `${eur(x.custo * x.q)} €` : ""}</span>
              </li>
            ))}
          </ul>
          {totalEf(e) > 0 && <p className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-[15px] font-semibold"><span>Total</span><span className="tabular-nums">{eur(totalEf(e))} €</span></p>}
        </section>
        <section className="rounded-2xl bg-white p-4 shadow-sm" aria-labelledby="pf-dia">
          <h2 id="pf-dia" className="text-base font-semibold">Quando entrega?</h2>
          <div role="radiogroup" aria-labelledby="pf-dia" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {dias.map((x) => {
              const iso = isoDia(x), tarde = !!inicio && x >= inicio;
              return (
                <button key={iso} type="button" role="radio" aria-checked={dia === iso} onClick={() => setDia(iso)}
                  className={cn("min-h-14 rounded-xl border px-2 text-left text-[15px] transition-colors", dia === iso ? "border-slate-900 bg-slate-900 text-white" : tarde ? "border-amber-300 bg-amber-50" : "border-slate-300 hover:border-slate-500")}>
                  {dataCurta(x)}
                  {tarde && <span className={cn("block text-xs", dia === iso ? "text-white/80" : "text-amber-800")}>{isoDia(x) === isoDia(inicio!) ? "no dia do início" : "depois do início"}</span>}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => run(() => A.confirmarEntrega(d.id, dia))} disabled={confirmada || e.estado !== "encomendada"}
            className="mt-4 min-h-12 w-full rounded-xl bg-slate-900 px-4 text-[15px] font-semibold text-white transition-colors hover:bg-slate-800 disabled:bg-emerald-700">
            {confirmada ? <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" aria-hidden="true" />Entrega confirmada para {e.entrega}</span> : `Confirmar a entrega para ${dataCurta(new Date(dia + "T12:00:00"))}`}
          </button>
          {e.estado !== "encomendada" && <p className="mt-2 text-sm text-slate-600">{e.estado === "recebida" ? "Já foi recebida. Obrigado." : "Entrada parcial registada: o resto segue com a mesma data."}</p>}
        </section>
        <p className="text-center text-xs text-slate-500">Protótipo: o portal real abre por um link do fornecedor.</p>
      </div>
    </div>
  );
}
