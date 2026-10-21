// O cliente pediu alterações à proposta (21/10/2026): a versão nova faz-se toda aqui, sem voltar à visita nem ao orçamento.
// · Com o pedido por tratar: um cartão no topo do negócio, com o que o cliente pediu no portal, e "Fazer a versão N" (um toque:
//   a versão atual fica guardada e o editor abre já).
// · O editor da versão nova: os produtos e as partes da estimativa do modelo, em cartões (TrocarProdutos.tsx: trocar, tirar,
//   repor, juntar, pela janela do Catálogo), o preço (desconto ou "baixar X € com IVA"), as datas e o pagamento. Cada mudança nos produtos atualiza a visita
//   e refaz o orçamento sozinha (A.refazerOrcamento); o total da versão anterior está sempre ao lado do de agora, com IVA e margem.
// · Um só botão no fim: "Enviar a versão N" (verifica e envia; chega ao mesmo link do portal).
import { useState } from "react";
import { Check, MessageSquareText, Minus, Plus, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LINHAS, MOTIVOS_VERSAO, alertas, bloqueado, eur, nfmt, pct, tot, versaoAtual, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { PROPOSTA, efetivo, emFalta } from "./campos";
import { totais } from "./DocsCliente";
import { PREFIXO_CLIENTE, PREFIXO_PROD } from "./produtosVisita";
import { ProdutosDaVersao } from "./TrocarProdutos";
import { PREFIXO_LEV } from "./efeitosLevantamento";
import { LINHA_DEMOLICAO } from "./entulho";
import { dataCurta, iniciosRapidos, isoDia, proximoUtil } from "./planoObra";

const ehPedido = (motivos: string[], m: string) => motivos.includes(m);

export function PedidoDoCliente({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { A, run } = ctx;
  const o = d.orc;
  if (!o || d.perdido || o.contrato === "assinado") return null;
  const nome = d.nome.split(" ")[0];

  // 1. o pedido chegou do portal e ainda não se começou a versão nova
  if (o.pedidoCliente && o.enviada && !o.aceite && d.fase === 3) {
    const pc = o.pedidoCliente;
    const motivos = pc.motivos.filter((m) => (MOTIVOS_VERSAO as readonly string[]).includes(m));
    return (
      <section aria-label="O cliente pediu alterações" className="mt-6 rounded-2xl border border-warning/40 bg-warning/[0.06] p-5 shadow-[var(--shadow-sm)] animate-in fade-in-0 slide-in-from-top-2 duration-500">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning text-white" aria-hidden="true"><MessageSquareText className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">{nome} pediu alterações à proposta</p>
            <p className="text-sm text-muted-foreground">No portal, {pc.q} · a versão {versaoAtual(o)} fica guardada</p>
            {pc.motivos.length > 0 && <ul className="mt-3 flex flex-wrap gap-2">{pc.motivos.map((m) => <li key={m} className="rounded-full bg-card px-3 py-1 text-[15px] font-medium shadow-sm">{m}</li>)}</ul>}
            {pc.nota && <p className="mt-3 rounded-xl bg-card px-3 py-2 text-[15px] shadow-sm">«{pc.nota}»</p>}
          </div>
        </div>
        <Button size="lg" className="mt-4 w-full sm:w-auto" onClick={() => run(() => A.novaVersao(d.id, motivos, pc.nota ?? "", "orcamento"))}>
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />Fazer a versão {versaoAtual(o) + 1} aqui
        </Button>
      </section>
    );
  }

  // 2. a versão nova está em preparação (a anterior foi substituída e ainda não se enviou a nova)
  const ant = o.versoes?.[o.versoes.length - 1];
  if (!ant || o.enviada || d.fase !== 3) return null;
  return <EditorVersao ctx={ctx} d={d} />;
}

/** O editor da versão nova, num só sítio. */
function EditorVersao({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S, A, run } = ctx;
  const o = d.orc!, ant = o.versoes![o.versoes!.length - 1], nome = d.nome.split(" ")[0], v = versaoAtual(o);
  const T = tot(d, S), TI = totais(d, S), razao = T.pf > 0 ? TI.total / T.pf : 1.23;
  const antIva = ant.totalIva ?? ant.total * razao, dif = TI.total - antIva;
  const pedidos = ant.motivos;
  // os materiais do modelo e as linhas à mão (não vêm dos produtos nem do levantamento): muda-se o preço
  const geradas = (dl: string) => [PREFIXO_LEV, PREFIXO_PROD, PREFIXO_CLIENTE].some((p) => dl.startsWith(p)) || dl === LINHA_DEMOLICAO;
  const matModelo = LINHAS[d.linha].mat.d;
  const mats = o.linhas.map((l, i) => ({ l, i })).filter(({ l }) => l.t === "mat" && !geradas(l.d) && l.d !== matModelo);
  // os campos da proposta que faltam (o início sai do plano ao enviar): pedem-se aqui, sem ir ao passo Proposta
  const faltam = emFalta([efetivo(S.campos, PROPOSTA[0])], d.f).filter((c) => c.k !== "inicio_prev");
  const baixo = T.m < S.cfg.min / 100, bloq = bloqueado(d, S);

  return (
    <section aria-label={`A versão ${v} da proposta`} className="mt-6 overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-[var(--shadow-md)] animate-in fade-in-0 slide-in-from-top-2 duration-500">
      <header className="flex flex-wrap items-start justify-between gap-3 bg-primary/[0.05] p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground" aria-hidden="true"><RotateCcw className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-lg font-semibold">Versão {v} para {nome}</p>
            <p className="text-sm text-muted-foreground">Mude aqui o que for preciso: a visita e o orçamento atualizam-se sozinhos.</p>
            {(pedidos.length > 0 || ant.nota) && (
              <p className="mt-2 text-[15px]"><span className="text-muted-foreground">{nome} pediu:</span> <b className="font-medium">{pedidos.join(" · ")}</b>{ant.nota ? <> · «{ant.nota}»</> : null}</p>
            )}
          </div>
        </div>
      </header>

      <div className="divide-y divide-border">
        {/* os produtos e os materiais */}
        <Bloco titulo="Produtos e materiais" pedido={ehPedido(pedidos, "Outros materiais") || ehPedido(pedidos, "Juntar ou tirar trabalhos")}>
          <ProdutosDaVersao ctx={ctx} d={d} ant={ant} />
          {mats.length > 0 && (
            <ul className="mt-4 space-y-2" aria-label="Linhas de materiais postas à mão">
              {mats.map(({ l, i }) => l.t === "mat" && (
                <li key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
                  <span className="min-w-0 text-[15px] first-letter:uppercase">{l.d}<span className="block text-sm text-muted-foreground">posto à mão · custo {eur(l.custo)} €</span></span>
                  <PrecoInput valor={l.preco} mudar={(x) => run(() => A.precoLinha(d.id, i, x))} rotulo={`Preço de ${l.d}`} />
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        {/* o preço */}
        <Bloco titulo="Preço" pedido={ehPedido(pedidos, "Baixar o preço")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] text-muted-foreground">Desconto</span>
            {[0, 3, 5, 8, 10].map((x) => (
              <button key={x} type="button" aria-pressed={o.desconto === x} onClick={() => run(() => { o.desconto = x; o.aprov = null; })}
                className={cn("min-h-10 rounded-full border px-3.5 text-[15px] transition-colors", o.desconto === x ? "border-primary bg-primary text-primary-foreground" : "border-input hover:border-foreground/40")}>{x}%</button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[15px] text-muted-foreground">Ou baixar, com IVA,</span>
            {[250, 500, 1000].map((x) => (
              <button key={x} type="button" onClick={() => run(() => {
                // o desconto que deixa o total com IVA em (v anterior − x), sobre o preço sem desconto
                const alvoPf = Math.max(0, (antIva - x) / razao), semDesc = T.preco || 1;
                o.desconto = Math.max(0, Math.min(30, Math.round((1 - alvoPf / semDesc) * 1000) / 10)); o.aprov = null;
              })} className="min-h-10 rounded-full border border-input px-3.5 text-[15px] hover:border-foreground/40">{x} €</button>
            ))}
          </div>
          <p className={cn("mt-2 text-sm", baixo ? "text-destructive" : "text-muted-foreground")}>Margem {pct(T.m)}{baixo ? ` · abaixo do mínimo de ${S.cfg.min}%: precisa da aprovação da Direção` : ` · mínimo ${S.cfg.min}%`}</p>
        </Bloco>

        {/* as datas e o pagamento */}
        <Bloco titulo="Datas e pagamento" pedido={ehPedido(pedidos, "Outras datas") || ehPedido(pedidos, "Outra forma de pagamento")}>
          <DatasPagamento ctx={ctx} d={d} />
        </Bloco>
      </div>

      {/* o que impede o envio, com a correção num toque quando a há */}
      {bloq && (
        <ul className="space-y-2 border-t border-border bg-destructive/[0.04] p-4 sm:px-5" aria-label="O que impede o envio">
          {alertas(d, S).filter((a) => a.k === "x").map((a, k) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
              <span className="min-w-0"><b className="font-medium">{a.t}</b><span className="block text-sm text-muted-foreground">{a.d}</span></span>
              {a.fix && a.i != null && a.sug != null && <Button variant="outline" className="min-h-10" onClick={() => run(() => A.sugerido(d.id, a.i!, a.sug!))}>Corrigir para {eur(a.sug)} €</Button>}
            </li>
          ))}
        </ul>
      )}

      {faltam.length > 0 && (
        <div className="space-y-3 border-t border-border bg-warning/[0.05] p-4 sm:px-5" aria-label="Falta na proposta">
          <p className="text-sm font-medium text-muted-foreground">Falta na proposta</p>
          {faltam.map((c) => (
            <div key={c.k}>
              <p className="text-[15px] font-medium">{c.l}</p>
              {c.op ? (
                <div className="mt-1.5 flex flex-wrap gap-2">{c.op.map((x) => <button key={x} type="button" onClick={() => run(() => A.campo(d.id, c.k, x))} className="min-h-10 rounded-full border border-input px-3.5 text-[15px] hover:border-foreground/40">{x}</button>)}</div>
              ) : (
                <TextoCampo rotulo={c.l} guardar={(t) => run(() => A.campo(d.id, c.k, t))} sugestao={c.k === "notas_cliente" ? `Olá, ${nome}. Esta é a versão ${v}, com o que nos pediu: ${pedidos.join(", ").toLowerCase() || "as alterações"}.` : ""} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* o total e o único botão */}
      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/95 p-4 backdrop-blur sm:px-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">v{ant.n}: {eur(antIva)} € → v{v}, com IVA</p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">{eur(TI.total)} € <span className={cn("text-base font-medium", dif < -0.005 ? "text-success" : dif > 0.005 ? "text-warning" : "text-muted-foreground")}>{Math.abs(dif) < 0.005 ? "igual" : `${dif < 0 ? "−" : "+"}${eur(Math.abs(dif))} €`}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          {bloq && <Button variant="outline" size="lg" onClick={() => run(() => A.pedirAprov(d.id))} disabled={o.aprov === "pedida"}>{o.aprov === "pedida" ? "Aprovação pedida" : "Pedir aprovação"}</Button>}
          <Button size="lg" disabled={bloq || faltam.length > 0} onClick={() => run(() => { A.enviarVersao(d.id); })}><Send className="mr-2 h-4 w-4" aria-hidden="true" />Enviar a versão {v} a {nome}</Button>
        </div>
      </footer>
    </section>
  );
}

function Bloco({ titulo, pedido, children }: { titulo: string; pedido?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("p-5", pedido && "bg-warning/[0.04]")}>
      <p className="mb-3 flex items-center gap-2 text-base font-semibold">{titulo}{pedido && <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-foreground">pedido pelo cliente</span>}</p>
      {children}
    </div>
  );
}

function PrecoInput({ valor, mudar, rotulo }: { valor: number; mudar: (v: number) => void; rotulo: string }) {
  const [t, setT] = useState<string | null>(null);
  const fim = () => { if (t == null) return; const n = Number(t.replace(/\s/g, "").replace(".", "").replace(",", ".")); if (n >= 0) mudar(n); setT(null); };
  return (
    <label className="inline-flex items-center gap-1 rounded-lg border border-input bg-background px-2">
      <input aria-label={rotulo} inputMode="decimal" value={t ?? eur(valor)} onChange={(e) => setT(e.target.value)} onBlur={fim} onKeyDown={(e) => { if (e.key === "Enter") fim(); }}
        className="h-10 w-24 bg-transparent text-right text-[15px] tabular-nums outline-none" />€
    </label>
  );
}

/** O início previsto, o prazo e as condições de pagamento, em toques. */
function DatasPagamento({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { A, run } = ctx;
  // o início é o do plano da proposta (o mesmo do documento); sem ele, o primeiro início rápido
  const base0 = d.orc?.inicioObra ? new Date(d.orc.inicioObra + "T12:00:00") : iniciosRapidos(new Date())[0].data;
  const prazo = Number(d.f.prazo_exec || 0) || 0, pag = d.f.pagamento || "";
  const mais = (dias: number) => { const b = new Date(base0); b.setDate(b.getDate() + dias); return isoDia(proximoUtil(b)); };
  const rot = dataCurta(base0);
  const chip = (on: boolean) => cn("min-h-10 rounded-full border px-3.5 text-[15px] transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input hover:border-foreground/40");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] text-muted-foreground">Começa <b className="font-medium text-foreground">{rot}</b></span>
        {[[-7, "1 semana antes"], [7, "+1 semana"], [14, "+2 semanas"]].map(([n, t]) => <button key={t} type="button" onClick={() => run(() => A.inicioObra(d.id, mais(n as number)))} className={chip(false)}>{t}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] text-muted-foreground">Prazo</span>
        <span className="inline-flex items-center rounded-lg border border-input">
          <button type="button" aria-label="Menos um dia" disabled={prazo <= 1} onClick={() => run(() => A.campo(d.id, "prazo_exec", String(prazo - 1)))} className="grid h-10 w-10 place-items-center hover:bg-muted disabled:opacity-30"><Minus className="h-4 w-4" /></button>
          <span className="min-w-[6.5rem] text-center text-[15px] tabular-nums">{prazo} dias úteis</span>
          <button type="button" aria-label="Mais um dia" onClick={() => run(() => A.campo(d.id, "prazo_exec", String(prazo + 1)))} className="grid h-10 w-10 place-items-center hover:bg-muted"><Plus className="h-4 w-4" /></button>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] text-muted-foreground">Pagamento</span>
        {["100% na adjudicação", "50% + 50% no fim", "30% + 40% + 30%", "Por fases"].map((x) => (
          <button key={x} type="button" aria-pressed={pag === x} onClick={() => run(() => A.campo(d.id, "pagamento", x))} className={chip(pag === x)}>{pag === x && <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}{x}</button>
        ))}
      </div>
    </div>
  );
}

function TextoCampo({ rotulo, guardar, sugestao }: { rotulo: string; guardar: (t: string) => void; sugestao: string }) {
  const [t, setT] = useState(sugestao);
  return (
    <div className="mt-1.5 flex gap-2">
      <input aria-label={rotulo} value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && t.trim()) guardar(t.trim()); }}
        className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <Button variant="outline" className="min-h-11" disabled={!t.trim()} onClick={() => guardar(t.trim())}>Guardar</Button>
    </div>
  );
}
