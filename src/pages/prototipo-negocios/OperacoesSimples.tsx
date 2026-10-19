// Operações e Inventário na proposta simples. 16/10: o Inventário daqui (InventarioSimples) só fica na V2 funcional; a Atual e a V2 usam o Inventário novo (inventario/). Cada ecrã diz numa frase em que
// ponto está, mostra só o que é preciso e tem um botão principal, de quem tem
// de agir. Os outros papéis veem o mesmo, com "Mudar para…".
// 19/10: sem as encomendas a fornecedor do motor (obra.enc): as do que falta nascem no Inventário, onde se aprovam e recebem.
import { useState } from "react";
import { PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { LINHAS, aberto, eur, nfmt, r2, type StockKey } from "./motor";
import type { Ctx } from "./pecas";
import { ListaObras, PaginaObra } from "./ObraOperacoes";
import { useInventario } from "./inventario/loja";
import { estadoLinhaNegocio, linhaDoResumo, resumoEcNegocio } from "./inventario/ponteNegocios";

/** As Operações (15/10: refeitas em ObraOperacoes.tsx): a lista de obras, ou a página da obra aberta. */
export function OperacoesSimples(ctx: Ctx) {
  const d = ctx.S.op ? ctx.S.deals.find((x) => x.id === ctx.S.op) : null;
  if (d && d.obra.plano) return <PaginaObra ctx={ctx} d={d} />;
  return <ListaObras {...ctx} />;
}

/** O nome de cada material de stock (pela chave), a partir dos modelos. */
const NOME_STOCK: Record<string, { n: string; un: string }> = Object.fromEntries(
  Object.values(LINHAS).flatMap((L) => L.mats.map(([n, un, , k]) => [k, { n, un }] as const)),
);
type AbaInvS = "ec" | "stock";

export function InventarioSimples(ctx: Ctx) {
  const { S, A, go } = ctx;
  const db = useInventario();
  const [aba, setAba] = useState<AbaInvS>("ec");
  const ecs = aberto(S).filter((d) => d.obra.ec);
  // o stock: em armazém (S.stock já sem o reservado), reservado para obras e a chegar (o que as encomendas a fornecedor do Inventário ainda trazem)
  const reservado: Record<string, number> = {}, aChegar: Record<string, number> = {};
  for (const d of aberto(S)) {
    if (d.obra.plano?.estado === "concluída") continue;
    const linhas = d.obra.ec ? d.obra.ec.linhas : d.obra.mats ?? [];
    for (const x of linhas) if ("k" in x && x.k) reservado[x.k] = r2((reservado[x.k] ?? 0) + x.res);
    const inv = d.obra.ec?.ref ? resumoEcNegocio(db, d.obra.ec.ref) : null;
    for (const l of inv?.linhas ?? []) {
      if (!(l.aChegar > 0)) continue;
      const k = Object.keys(NOME_STOCK).find((c) => NOME_STOCK[c].n === l.n);
      if (k) aChegar[k] = r2((aChegar[k] ?? 0) + l.aChegar);
    }
  }
  const ABAS: [AbaInvS, string][] = [["ec", "Encomendas de cliente"], ["stock", "Stock"]];
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Inventário</h1>
      <p className="mt-2 text-lg text-muted-foreground">As encomendas de cliente nascem do pagamento validado, no Inventário; o que falta em stock vai ao fornecedor (aprova-se e recebe-se no Inventário).</p>
      <div role="tablist" aria-label="Inventário" className="mt-6 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] sm:[mask-image:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]">
        {ABAS.map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={(ev) => { setAba(k); ev.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }}
            className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[15px] font-medium transition-colors", aba === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>

      {aba === "ec" && (
        <ul className="mt-8 space-y-4 animate-in fade-in-0 duration-200">
          {ecs.map((d) => {
            const ec = d.obra.ec!, inv = resumoEcNegocio(db, ec.ref);
            return (
              <li key={d.id} className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-base font-semibold"><PackageCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{ec.n} · {d.nome}</p>
                    <p className="text-[15px] text-muted-foreground">{d.servico} · {ec.ref ?? "do contrato CT 2026/" + d.id} · {ec.criada}</p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-medium", !ec.ref || inv?.pronta ? "bg-success/15" : "bg-warning/15")}>{inv ? inv.rotulo.toLowerCase() : ec.ref ? "emitida" : "servida"}</span>
                </div>
                <ul className="mt-3 divide-y divide-border">
                  {ec.linhas.map((x) => (
                    <li key={x.n} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-[15px]">
                      <span className="min-w-[10rem] flex-1">{x.n}<span className="block text-sm tabular-nums text-muted-foreground">{nfmt(x.q)} {x.un} × {eur(x.custo ?? 0)} €</span></span>
                      {(() => { const l = linhaDoResumo(inv, x.n), st = l ? estadoLinhaNegocio(l) : { t: ec.ref ? "a preparar" : "na obra", ok: !ec.ref }; return <span className={cn("text-sm", st.ok ? "text-success" : "text-warning")}>{st.t}</span>; })()}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-[15px]">
                  <span className="text-muted-foreground">Custo {eur(ec.custo ?? 0)} € · na proposta {eur(ec.valor)} €</span>
                  {ec.ref && <button type="button" onClick={go(() => A.abrirInv(d.id))} className="text-sm font-medium text-primary underline-offset-4 hover:underline">Lida do Inventário</button>}
                </p>
              </li>
            );
          })}
          {!ecs.length && <li className="text-[15px] text-muted-foreground">Ainda não há encomendas de cliente. Nascem quando o Financeiro valida o pagamento.</li>}
        </ul>
      )}

      {aba === "stock" && (
        <div className="mt-8 animate-in fade-in-0 duration-200">
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">
            {(Object.keys(S.stock) as StockKey[]).map((k) => {
              const m = NOME_STOCK[k] ?? { n: k, un: "" }, v = S.stock[k];
              return (
                <li key={k} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-[15px]">
                  <span className="min-w-[10rem] flex-1 font-medium">{m.n}</span>
                  <span className="flex flex-wrap gap-x-4 text-sm tabular-nums">
                    <span className={cn(v <= 0 ? "text-warning" : "")}>{nfmt(Math.max(0, v))} {m.un} livres</span>
                    {reservado[k] ? <span className="text-muted-foreground">{nfmt(reservado[k])} {reservado[k] === 1 ? "reservado" : "reservados"}</span> : null}
                    {aChegar[k] ? <span className="text-primary">{nfmt(aChegar[k])} a chegar</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[15px] text-muted-foreground">Livres: em armazém e sem obra. Reservados: para obras com a encomenda de cliente emitida. A chegar: encomendados ao fornecedor (no Inventário).</p>
        </div>
      )}
    </div>
  );
}
