// Operações e Inventário na proposta simples. 16/10: o Inventário daqui (InventarioSimples) só fica na V2 funcional; a Atual e a V2 usam o Inventário novo (inventario/). Cada ecrã diz numa frase em que
// ponto está, mostra só o que é preciso e tem um botão principal, de quem tem
// de agir. Os outros papéis veem o mesmo, com "Mudar para…".
import { useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Circle, Minus, PackageCheck, Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LINHAS, PAPEIS, TECS, aberto, conflitos, diaDeFerias, eur, nfmt, r2, type Negocio, type Papel, type StockKey } from "./motor";
import { COR_FASE, dataCurta, iniciosRapidos, isoDia } from "./planoObra";
import { PortalFornecedor } from "./PortalFornecedor";
import { FASES_OBRA } from "./fasesObra";
import { entregaTarde, faltaParaArrancar, inicioDoPlano, rotuloDia, tecnicosPara, totalEf } from "./preparacaoObra";
import type { Ctx } from "./pecas";
import { ListaObras, PaginaObra } from "./ObraOperacoes";
import { useInventario } from "./inventario/loja";
import { estadoLinhaNegocio, linhaDoResumo, resumoEcNegocio } from "./inventario/ponteNegocios";

const ESTADO_PLANO: Record<string, string> = {
  "por aprovar": "à espera de aprovação", aprovado: "aprovado, falta arrancar", "em curso": "em curso", "concluída": "concluída",
};

function Mudar({ ctx, papel }: { ctx: Ctx; papel: Papel }) {
  return (
    <p className="text-[15px] text-muted-foreground">
      Este passo é de {PAPEIS[papel].n}.{" "}
      <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={ctx.go(() => ctx.A.role(papel))}>Mudar para {PAPEIS[papel].n.split(" · ")[0]}</button>
    </p>
  );
}

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
const ESTADO_EF: Record<string, { t: string; tom: string }> = {
  "por confirmar": { t: "por validar", tom: "bg-warning/15 text-foreground" },
  encomendada: { t: "encomendada", tom: "bg-primary/10 text-primary" },
  parcial: { t: "entrada parcial", tom: "bg-warning/15 text-foreground" },
  recebida: { t: "recebida", tom: "bg-success/15 text-foreground" },
};
type AbaInvS = "ef" | "ec" | "stock";

/** Mais e menos, com alvos de 44 px. */
function Passos({ v, max, rot, onSet }: { v: number; max: number; rot: string; onSet: (v: number) => void }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-input bg-card p-0.5" role="group" aria-label={rot}>
      <button type="button" aria-label="Menos" disabled={v <= 0} onClick={() => onSet(Math.max(0, v - 1))} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"><Minus className="h-4 w-4" /></button>
      <output className="w-12 text-center tabular-nums">{nfmt(v)}</output>
      <button type="button" aria-label="Mais" disabled={v >= max} onClick={() => onSet(Math.min(max, v + 1))} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"><Plus className="h-4 w-4" /></button>
    </span>
  );
}

/** Uma encomenda a fornecedor: o fornecedor, a entrega, as linhas com o custo e o que já chegou, e a ação de quem tem a vez. */
function CartaoEf({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S, A, go, run } = ctx;
  const e = d.obra.enc!;
  const [conferir, setConferir] = useState(false);
  const [portal, setPortal] = useState(false);
  const [chegou, setChegou] = useState<number[]>(() => e.linhas.map((x) => r2(x.q - (x.recebido ?? 0))));
  const est = ESTADO_EF[e.estado];
  const acao = (() => {
    if (e.estado === "por confirmar") {
      return S.role === "armazem" ? <Button onClick={go(() => A.confirmarEnc(d.id))}>Confirmar e enviar ao fornecedor</Button> : <Mudar ctx={ctx} papel="armazem" />;
    }
    if (e.estado === "encomendada" || e.estado === "parcial") {
      return (
        <div className="flex flex-wrap items-center gap-3">
          {S.role === "armazem"
            ? <Button onClick={() => { setChegou(e.linhas.map((x) => r2(x.q - (x.recebido ?? 0)))); setConferir(!conferir); }} aria-expanded={conferir}>{e.estado === "parcial" ? "Conferir o resto" : "Conferir a entrega"}</Button>
            : <Mudar ctx={ctx} papel="armazem" />}
          {e.estado === "encomendada" && (
            <button type="button" onClick={() => setPortal(true)} className="inline-flex min-h-11 items-center text-[15px] font-medium text-primary underline-offset-4 hover:underline">{e.entrega ? "Portal do fornecedor" : "Portal do fornecedor: confirmar a entrega"}</button>
          )}
        </div>
      );
    }
    return null;
  })();
  return (
    <li className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] animate-in fade-in-0 duration-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-base font-semibold"><Truck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{e.n} · {e.forn ?? "fornecedor por escolher"}</p>
          <button type="button" onClick={go(() => A.abrir(d.id))} className="text-left text-[15px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Obra de {d.nome} · {d.servico}{d.obra.ec ? ` · da ${d.obra.ec.n}` : ""}
          </button>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-medium", est.tom)}>{est.t}</span>
      </div>
      <p className="mt-2 text-[15px]">
        {e.estado === "por confirmar" ? "O armazém confirma e envia ao fornecedor."
          : e.estado === "recebida" ? "Tudo recebido e reservado para a obra."
          : e.entrega ? `Entrega confirmada pelo fornecedor para ${e.entrega}.` : "Enviada ao fornecedor, à espera da data de entrega."}
        {e.validada && <span className="text-muted-foreground"> Validada por {e.validada.por} · {e.validada.q}.</span>}
        {entregaTarde(d) && <span className="mt-1 flex items-start gap-2 text-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />Chega no dia em que a obra começa (ou depois). As Operações podem passar o início para o dia útil seguinte.</span>}
      </p>
      <ul className="mt-3 divide-y divide-border">
        {e.linhas.map((x, i) => {
          const rec = x.recebido ?? 0;
          return (
            <li key={x.n} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 text-[15px]">
              <span className="min-w-[10rem] flex-1">{x.n}<span className="block text-sm tabular-nums text-muted-foreground">{nfmt(x.q)} {x.un}{x.custo ? ` × ${eur(x.custo)} € = ${eur(x.custo * x.q)} €` : ""}</span></span>
              {conferir && rec < x.q
                ? <span className="flex items-center gap-2 text-sm text-muted-foreground">chegou <Passos v={chegou[i] ?? 0} max={r2(x.q - rec)} rot={`Quanto chegou de ${x.n}`} onSet={(v) => setChegou((c) => c.map((y, j) => (j === i ? v : y)))} /> {x.un}</span>
                : <span className={cn("inline-flex items-center gap-1.5 text-sm tabular-nums", rec >= x.q ? "text-success" : rec > 0 ? "text-warning" : "text-muted-foreground")}>
                    {rec >= x.q ? <><Check className="h-4 w-4" aria-hidden="true" />recebido</> : rec > 0 ? `${nfmt(rec)} de ${nfmt(x.q)} recebidos` : "por receber"}
                  </span>}
            </li>
          );
        })}
      </ul>
      {e.linhas.some((x) => x.custo) && <p className="mt-1 flex justify-between border-t border-border pt-2 text-[15px]"><span className="text-muted-foreground">Total</span><b className="font-semibold tabular-nums">{eur(totalEf(e))} €</b></p>}
      {conferir && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 p-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <p className="flex-1 text-[15px]">{chegou.every((v, i) => v >= r2(e.linhas[i].q - (e.linhas[i].recebido ?? 0))) ? "Chegou tudo: a encomenda fica recebida." : "Chegou menos do que o pedido: fica uma entrada parcial e o resto continua à espera."}</p>
          <Button variant="ghost" onClick={() => setConferir(false)}>Cancelar</Button>
          <Button onClick={() => { run(() => A.receberLinhas(d.id, chegou)); setConferir(false); }}>Dar entrada</Button>
        </div>
      )}
      {acao && !conferir && <div className="mt-4">{acao}</div>}
      {portal && <PortalFornecedor ctx={ctx} d={d} fechar={() => setPortal(false)} />}
    </li>
  );
}

export function InventarioSimples(ctx: Ctx) {
  const { S, A, go } = ctx;
  const db = useInventario();
  const [aba, setAba] = useState<AbaInvS>("ef");
  const comEf = aberto(S).filter((d) => d.obra.enc && (d.obra.enc.linhas.length || d.obra.enc.estado !== "recebida"));
  const aReceber = comEf.filter((d) => d.obra.enc!.estado === "encomendada" || d.obra.enc!.estado === "parcial");
  const porValidar = comEf.filter((d) => d.obra.enc!.estado === "por confirmar");
  const recebidas = comEf.filter((d) => d.obra.enc!.estado === "recebida");
  const ecs = aberto(S).filter((d) => d.obra.ec);
  // o stock: em armazém (S.stock já sem o reservado), reservado para obras e a chegar
  const reservado: Record<string, number> = {}, aChegar: Record<string, number> = {};
  for (const d of aberto(S)) {
    if (d.obra.plano?.estado === "concluída") continue;
    const linhas = d.obra.ec ? d.obra.ec.linhas : d.obra.mats ?? [];
    for (const x of linhas) if ("k" in x && x.k) reservado[x.k] = r2((reservado[x.k] ?? 0) + x.res);
    const e = d.obra.enc;
    if (e && (e.estado === "encomendada" || e.estado === "parcial"))
      for (const x of e.linhas) { const k = Object.keys(NOME_STOCK).find((c) => NOME_STOCK[c].n === x.n); if (k) aChegar[k] = r2((aChegar[k] ?? 0) + x.q - (x.recebido ?? 0)); }
  }
  const ABAS: [AbaInvS, string, number][] = [["ef", "Encomendas a fornecedor", aReceber.length + porValidar.length], ["ec", "Encomendas de cliente", 0], ["stock", "Stock", 0]];
  const frase = [
    aReceber.length && `${aReceber.length} a receber`, porValidar.length && `${porValidar.length} por validar`,
  ].filter(Boolean).join(" · ");
  const grupo = (t: string, L: Negocio[], vazio?: string) => (
    <section aria-label={t} className="mt-8">
      <h2 className="text-lg font-semibold">{t} <span className="font-normal text-muted-foreground">· {L.length}</span></h2>
      {L.length ? <ul className="mt-3 space-y-4">{L.map((d) => <CartaoEf key={d.id} ctx={ctx} d={d} />)}</ul> : vazio ? <p className="mt-2 text-[15px] text-muted-foreground">{vazio}</p> : null}
    </section>
  );
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Inventário</h1>
      <p className="mt-2 text-lg text-muted-foreground">{frase ? frase + "." : "Nada pendente."} As encomendas de cliente nascem do pagamento validado, no Inventário; o que falta em stock vai ao fornecedor.</p>
      <div role="tablist" aria-label="Inventário" className="mt-6 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] sm:[mask-image:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]">
        {ABAS.map(([k, t, n]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={(ev) => { setAba(k); ev.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }}
            className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[15px] font-medium transition-colors", aba === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t}{n > 0 && <span className="rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">{n}</span>}
          </button>
        ))}
      </div>

      {aba === "ef" && (
        <div className="animate-in fade-in-0 duration-200">
          {grupo("A receber", aReceber, "Nada a caminho.")}
          {grupo("Por validar", porValidar, "Nenhuma à espera de validação.")}
          {recebidas.length > 0 && grupo("Recebidas", recebidas)}
        </div>
      )}

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
          <p className="mt-2 text-[15px] text-muted-foreground">Livres: em armazém e sem obra. Reservados: para obras com a encomenda de cliente emitida. A chegar: encomendados ao fornecedor.</p>
        </div>
      )}
    </div>
  );
}
