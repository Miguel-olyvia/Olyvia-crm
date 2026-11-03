// Os problemas que o cliente reporta na conversa (3/11/2026, Rúben), na página da obra (a lógica está em problemasCliente.ts e no motor):
// · Por tratar: as mensagens do cliente com fotografias (e as que o gestor abriu com «Tratar como problema»), com UM próximo passo:
//   criar as tarefas que o resolvem, ou dizer que não é um problema.
// · TratarProblema: as tarefas (o trabalho, as horas, o técnico) e se gera orçamento. Sem orçamento (garantia, erro nosso, oferta) entram já
//   no plano; com orçamento vai ao cliente uma adenda (o percurso de sempre). A resposta segue na conversa, para o cliente ver o decidido.
// · Os tratados que ainda esperam por alguém: a proposta com o cliente, a proposta recusada (o gestor decide) e a resposta por enviar.
import { useMemo, useState } from "react";
import { AlertTriangle, Check, MessageCircle, Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECS, eur, nfmt, type MensagemObra, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { FotoMensagem } from "./ConversaObra";
import { AcoesAdenda } from "./TrabalhosAMais";
import { diasAdenda, estadoAdenda, precoSugeridoLivre, totaisAdenda, totaisLinhas, type LinhaAdenda } from "./adendas";
import {
  DECISOES_PROBLEMA, MOTIVOS_SEM_CUSTO, erroTarefas, fotosDe, mensagensPorTratar, problemaDaMensagem, problemasAbertos, respostaPorEnviar,
  type ProblemaCliente, type TarefaProblema,
} from "./problemasCliente";

const ENTRADA = "h-12 w-full rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const chip = (on: boolean) => cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");
const num = (v: string) => Math.max(0, Number(v.replace(",", ".")) || 0);

/** A conversa da obra, como a página a tem (a base ou o protótipo): as mensagens, ler cada fotografia e escrever ao cliente. */
export interface ConversaDaObra {
  msgs: MensagemObra[];
  fotoDe?: (id: string) => Promise<string>;
  /** Escreve ao cliente; devolve se seguiu. */
  responder: (t: string) => Promise<boolean>;
}
/** A mensagem que o problema trata: a chave, o texto e as fotografias. */
type Origem = { msg: string; texto: string; fotos: string[] };

export function ProblemasDoCliente({ ctx, d, conversa, abrir, setAbrir }: { ctx: Ctx; d: Negocio; conversa: ConversaDaObra; abrir: string | null; setAbrir: (k: string | null) => void }) {
  const p = d.obra.plano;
  const porTratar = mensagensPorTratar(d, conversa.msgs);
  // a mensagem só com texto que o gestor abriu na conversa («Tratar como problema»)
  const k = abrir ? conversa.msgs.findIndex((m, i) => (m.id ?? `local-${i}`) === abrir) : -1;
  const aberta = k >= 0 && !problemaDaMensagem(d, abrir!) && !porTratar.some((x) => x.chave === abrir) ? { m: conversa.msgs[k], chave: abrir! } : null;
  const novos = aberta ? [aberta, ...porTratar] : porTratar;
  const tratados = problemasAbertos(d);
  if (!p || (!novos.length && !tratados.length)) return null;
  return (
    <section id="obra-problemas" aria-labelledby="obra-problemas-t" className="mt-4 scroll-mt-16 rounded-2xl border border-destructive/30 bg-card p-5 shadow-[var(--shadow-sm)]">
      <h2 id="obra-problemas-t" className="flex items-center gap-2 text-xl font-semibold tracking-tight"><AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />Problemas reportados pelo cliente</h2>
      <div className="mt-3 space-y-3">
        {novos.map(({ m, chave }) => <PorTratar key={chave} ctx={ctx} d={d} conversa={conversa} m={m} chave={chave} fechar={() => { if (abrir === chave) setAbrir(null); }} />)}
        {tratados.map((pr) => <CartaoProblema key={pr.id} ctx={ctx} d={d} conversa={conversa} pr={pr} />)}
      </div>
    </section>
  );
}

/** As fotografias do problema, pequenas. */
function Fotos({ fotos, fotoDe }: { fotos: string[]; fotoDe?: (id: string) => Promise<string> }) {
  if (!fotos.length) return null;
  return <div className="flex flex-wrap gap-1.5">{fotos.map((id, k) => <FotoMensagem key={id + k} id={id} fotoDe={fotoDe} tam="h-16 w-20" rotulo={`Fotografia ${k + 1} do problema`} />)}</div>;
}

/** Escreve a resposta ao cliente e, se seguiu, marca-a (sem isso, o cartão fica com «Enviar a resposta»). */
function useResponder(ctx: Ctx, d: Negocio, conversa: ConversaDaObra) {
  return async (pid: string, texto: string | null) => {
    if (!texto) return;
    if (await conversa.responder(texto)) ctx.run(() => ctx.A.problemaRespondido(d.id, pid));
  };
}

/* ================================================================== por tratar: criar as tarefas ou não é um problema */
function PorTratar({ ctx, d, conversa, m, chave, fechar }: { ctx: Ctx; d: Negocio; conversa: ConversaDaObra; m: MensagemObra; chave: string; fechar: () => void }) {
  const { S, A, run } = ctx;
  const [tratar, setTratar] = useState(false);
  const [nota, setNota] = useState<string | null>(null);
  // 3/11: também com a obra concluída (a assistência depois da obra, ex.: garantia: a obra reabre quando as tarefas entram)
  const pode = S.role === "operacoes";
  const origem: Origem = { msg: chave, texto: m.t, fotos: fotosDe(m) };
  return (
    <article aria-label={`Problema por tratar: ${m.t}`} className="rounded-xl border border-destructive/40 bg-destructive/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="text-base font-semibold">«{m.t}»</p>
          <p className="text-sm text-muted-foreground">{m.quem} · {m.q}</p>
          <Fotos fotos={origem.fotos} fotoDe={conversa.fotoDe} />
        </div>
        <span className="shrink-0 rounded-full bg-destructive/10 px-2.5 py-0.5 text-sm font-medium text-destructive">por tratar</span>
      </div>
      {!pode ? <p className="mt-3 text-sm text-muted-foreground">O gestor da obra cria as tarefas e decide se gera orçamento.</p>
        : tratar ? <TratarProblema ctx={ctx} d={d} conversa={conversa} origem={origem} fechar={() => { setTratar(false); fechar(); }} />
        : nota != null ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Porquê (opcional)" aria-label="Porque não é um problema" className={ENTRADA} />
            <Button variant="outline" className="min-h-12 shrink-0" onClick={() => { run(() => A.descartarProblema(d.id, origem, nota)); fechar(); }}>Não é um problema</Button>
            <Button variant="ghost" className="min-h-12 shrink-0" onClick={() => setNota(null)}>Cancelar</Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button className="min-h-11" onClick={() => setTratar(true)}><Wrench className="mr-1.5 h-4 w-4" aria-hidden="true" />Criar tarefas</Button>
            <button type="button" onClick={() => setNota("")} className="min-h-11 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Não é um problema</button>
          </div>
        )}
    </article>
  );
}

/* ================================================================== as tarefas e o orçamento */
const tarefaVazia = (texto: string): TarefaProblema => ({ n: texto.trim().replace(/^./, (c) => c.toUpperCase()).slice(0, 80), h: 2, tec: null });

function TratarProblema({ ctx, d, conversa, origem, inicial, fechar }: { ctx: Ctx; d: Negocio; conversa: ConversaDaObra; origem: Origem; inicial?: ProblemaCliente; fechar: () => void }) {
  const { S, A, run } = ctx;
  const responder = useResponder(ctx, d, conversa);
  const [T, setT] = useState<TarefaProblema[]>(inicial?.tarefas.length ? inicial.tarefas.map((x) => ({ ...x })) : [tarefaVazia(origem.texto)]);
  const [cobrar, setCobrar] = useState<boolean | null>(inicial ? inicial.cobrar : null);
  const [motivo, setMotivo] = useState<string>(inicial?.motivo ?? MOTIVOS_SEM_CUSTO[0]);
  const tecs = useMemo(() => [...TECS].sort((a, b) => a.sk.localeCompare(b.sk, "pt") || a.n.localeCompare(b.n, "pt")), [TECS.length]); // eslint-disable-line react-hooks/exhaustive-deps -- TECS é o registo vivo
  const mudar = (i: number, m: Partial<TarefaProblema>) => setT((L) => L.map((x, j) => (j === i ? { ...x, ...m } : x)));
  // com orçamento, o preço sugerido de cada tarefa (a margem alvo, pelo ofício do técnico); mexe-se à mão
  const sugerir = (x: TarefaProblema): number => precoSugeridoLivre(S, x.h || 1, TECS.find((t) => t.id === x.tec)?.sk || "Canalização");
  const escolherCobrar = (c: boolean) => { setCobrar(c); if (c) setT((L) => L.map((x) => (x.preco ? x : { ...x, preco: sugerir(x) }))); };
  const linhas: LinhaAdenda[] = T.map((x) => ({ sid: "livre", n: x.n, un: "vg", q: 1, pu: x.preco ?? 0, h: x.h, perfil: "", livre: true, mats: [] }));
  const Tot = totaisLinhas(linhas), dd = diasAdenda(linhas);
  const erro = cobrar == null ? "Escolha se gera orçamento." : erroTarefas(T, cobrar);
  const decidir = () => {
    let resp = null as string | null;
    run(() => { resp = A.tratarProblema(d.id, origem, { tarefas: T, cobrar: !!cobrar, motivo: cobrar ? undefined : motivo }); });
    const pr = problemaDaMensagem(d, origem.msg);
    if (pr && resp) void responder(pr.id, resp);
    if (resp) fechar();
  };
  return (
    <div role="group" aria-label="Tratar o problema" className="mt-4 space-y-5 border-t border-border pt-4 animate-in fade-in-0 slide-in-from-top-1">
      <fieldset>
        <legend className="text-[15px] font-medium">Que tarefas o resolvem?</legend>
        <ul className="mt-2 space-y-3">
          {T.map((x, i) => (
            <li key={i} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_7rem_14rem_auto] sm:items-end">
              <label className="block space-y-1"><span className="text-sm text-muted-foreground">O trabalho</span>
                <input value={x.n} onChange={(e) => mudar(i, { n: e.target.value })} placeholder="Ex.: refazer a junta do duche" className={ENTRADA} /></label>
              <label className="block space-y-1"><span className="text-sm text-muted-foreground">Horas</span>
                <input type="number" inputMode="decimal" min={0.5} step={0.5} value={x.h || ""} onChange={(e) => mudar(i, { h: num(e.target.value) })} className={ENTRADA} /></label>
              <label className="block space-y-1"><span className="text-sm text-muted-foreground">Técnico</span>
                <select value={x.tec ?? ""} onChange={(e) => mudar(i, { tec: e.target.value || null })} className={ENTRADA}>
                  <option value="">Escolher…</option>
                  {tecs.map((t) => <option key={t.id} value={t.id}>{t.n} · {t.sk}</option>)}
                </select></label>
              <button type="button" aria-label={`Tirar a tarefa ${i + 1}`} disabled={T.length === 1} onClick={() => setT((L) => L.filter((_, j) => j !== i))}
                className="grid h-12 w-12 place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
              {cobrar && (
                <label className="block space-y-1 sm:col-span-4 sm:max-w-[14rem]"><span className="text-sm text-muted-foreground">Preço sem IVA (€)</span>
                  <input type="number" inputMode="decimal" min={0} step={1} value={x.preco || ""} onChange={(e) => mudar(i, { preco: num(e.target.value) })} className={ENTRADA} /></label>
              )}
            </li>
          ))}
        </ul>
        {!tecs.length && <p className="mt-2 text-sm text-destructive">Não há técnicos no RH. Crie-os primeiro (cargo técnico de obra).</p>}
        <button type="button" onClick={() => setT((L) => [...L, { n: "", h: 2, tec: null, ...(cobrar ? { preco: 0 } : {}) }])}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 px-1 text-[15px] font-medium text-primary"><Plus className="h-4 w-4" aria-hidden="true" />Juntar outra tarefa</button>
      </fieldset>

      <fieldset>
        <legend className="text-[15px] font-medium">Gera orçamento?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {([[false, "Sem orçamento", "As tarefas entram já no plano. O cliente não paga."], [true, "Com orçamento", "Vai ao cliente uma adenda ao contrato, para aceitar e assinar no portal."]] as const).map(([c, t, sub]) => (
            <button key={t} type="button" aria-pressed={cobrar === c} onClick={() => escolherCobrar(c)}
              className={cn("min-h-11 rounded-xl border p-3 text-left transition-colors", cobrar === c ? "border-primary bg-primary/[0.06] ring-1 ring-primary" : "border-input hover:border-foreground/40")}>
              <span className="block text-[15px] font-medium">{t}</span><span className="block text-sm text-muted-foreground">{sub}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {cobrar === false && (
        <fieldset>
          <legend className="text-sm text-muted-foreground">Porquê sem custo?</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">{MOTIVOS_SEM_CUSTO.map((o) => <button key={o} type="button" aria-pressed={motivo === o} onClick={() => setMotivo(o)} className={chip(motivo === o)}>{motivo === o && <Check className="h-4 w-4" aria-hidden="true" />}{o}</button>)}</div>
        </fieldset>
      )}
      {cobrar && (
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-sm">
          <div><p className="text-muted-foreground">Sem IVA</p><p className="text-[15px] font-semibold tabular-nums">+{eur(Tot.base)} €</p></div>
          <div><p className="text-muted-foreground">Com IVA (6%)</p><p className="text-[15px] font-semibold tabular-nums">+{eur(Tot.total)} €</p></div>
          <div><p className="text-muted-foreground">Prazo</p><p className="text-[15px] font-semibold tabular-nums">+{nfmt(dd)} {dd === 1 ? "dia" : "dias"}</p></div>
        </div>
      )}
      <p className="flex items-start gap-2 text-sm text-muted-foreground"><MessageCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />O cliente recebe a decisão na conversa e fica tudo no histórico do negócio.</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {erro && <p className="text-sm text-muted-foreground sm:mr-auto">{erro}</p>}
        <Button variant="ghost" size="lg" onClick={fechar}>Cancelar</Button>
        <Button size="lg" disabled={!!erro} onClick={decidir}>{cobrar ? "Enviar a proposta ao cliente" : "Juntar ao plano"}</Button>
      </div>
    </div>
  );
}

/* ================================================================== os tratados que ainda esperam por alguém */
const ESTADO: Record<ProblemaCliente["estado"], [string, string]> = {
  aberto: ["por propor de novo", "bg-destructive/10 text-destructive"], proposta: ["à espera do cliente", "bg-warning/15"],
  recusado: ["o cliente não aceitou", "bg-destructive/10 text-destructive"], aprovado: ["aprovado pelo cliente", "bg-success/15"],
  resolvido: ["sem custo, no plano", "bg-success/15"], fechado: ["não se faz", "bg-muted text-muted-foreground"], descartado: ["não é um problema", "bg-muted text-muted-foreground"],
};

function CartaoProblema({ ctx, d, conversa, pr }: { ctx: Ctx; d: Negocio; conversa: ConversaDaObra; pr: ProblemaCliente }) {
  const { S, A, run } = ctx;
  const responder = useResponder(ctx, d, conversa);
  const [motivo, setMotivo] = useState<string>(MOTIVOS_SEM_CUSTO[0]);
  const pode = S.role === "operacoes";
  const a = pr.adenda ? d.adendas?.find((x) => x.n === pr.adenda) : undefined;
  const nomes = pr.tarefas.map((x) => `${x.n} (${TECS.find((t) => t.id === x.tec)?.n.split(" ")[0] ?? "por atribuir"})`).join(", ");
  return (
    <article aria-label={`Problema ${pr.id}`} className={cn("rounded-xl border p-4", pr.estado === "recusado" || pr.estado === "aberto" || respostaPorEnviar(pr) ? "border-destructive/40 bg-destructive/[0.04]" : "border-border")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="text-base font-semibold">«{pr.texto}»</p>
          <p className="text-sm text-muted-foreground">{pr.id} · {pr.q}{nomes ? ` · ${nomes}` : ""}</p>
          <Fotos fotos={pr.fotos} fotoDe={conversa.fotoDe} />
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-sm font-medium", ESTADO[pr.estado][1])}>{ESTADO[pr.estado][0]}</span>
      </div>

      {respostaPorEnviar(pr) && (
        <div className="mt-3 space-y-2 rounded-xl border border-warning/40 bg-warning/[0.06] p-3">
          <p className="text-[15px]">A resposta ao cliente ainda não seguiu:</p>
          <p className="text-sm text-muted-foreground">«{pr.resposta}»</p>
          <Button variant="outline" className="min-h-11" onClick={() => void responder(pr.id, pr.resposta ?? null)}><MessageCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />Enviar a resposta</Button>
        </div>
      )}
      {d.obra.plano?.estado === "concluída" && (pr.estado === "aberto" || pr.estado === "recusado") && pode && (
        <p className="mt-3 text-sm text-muted-foreground">A obra está concluída: quando as tarefas entrarem no plano, reabre para a assistência.</p>
      )}
      {pr.estado === "proposta" && a && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[15px]">
          <span>Adenda {a.n} · {eur(totaisAdenda(a).total)} € · +{diasAdenda(a.linhas)} {diasAdenda(a.linhas) === 1 ? "dia" : "dias"}{a.estado === "rascunho" ? ` · ${estadoAdenda(a).t}` : ""}</span>
          <div className="w-full"><AcoesAdenda ctx={ctx} d={d} a={a} /></div>
        </div>
      )}
      {pr.estado === "aberto" && (pode
        ? <TratarProblema ctx={ctx} d={d} conversa={conversa} origem={{ msg: pr.msg, texto: pr.texto, fotos: pr.fotos }} inicial={pr} fechar={() => undefined} />
        : <p className="mt-3 text-sm text-muted-foreground">O gestor da obra faz outra proposta.</p>)}
      {pr.estado === "recusado" && (
        <div className="mt-3 space-y-3">
          <p className="text-[15px]">{a?.recusa ? <>O cliente: «{a.recusa}». </> : null}O que fazer?</p>
          {pode ? <>
            <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-muted-foreground">Sem custo, porquê:</span>
              {MOTIVOS_SEM_CUSTO.map((o) => <button key={o} type="button" aria-pressed={motivo === o} onClick={() => setMotivo(o)} className={chip(motivo === o)}>{o}</button>)}</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {DECISOES_PROBLEMA.map((x) => (
                <button key={x.k} type="button" className="min-h-11 rounded-xl border border-input p-3 text-left hover:border-foreground/40" onClick={() => {
                  let resp = null as string | null;
                  run(() => { resp = A.decidirProblema(d.id, pr.id, x.k, x.k === "sem_custo" ? motivo : ""); });
                  void responder(pr.id, resp);
                }}>
                  <span className="block text-[15px] font-medium">{x.t}</span><span className="block text-sm text-muted-foreground">{x.sub}</span>
                </button>
              ))}
            </div>
          </> : <p className="text-sm text-muted-foreground">O gestor da obra decide.</p>}
        </div>
      )}
      {pr.decisao && pr.estado !== "recusado" && <p className="mt-2 text-sm text-muted-foreground">Decisão: {pr.decisao}</p>}
    </article>
  );
}

/** Por baixo de uma mensagem do cliente, nas Operações: o estado do problema dela, ou «Tratar como problema». */
export function AcaoMensagemCliente({ ctx, d, m, chave, abrir }: { ctx: Ctx; d: Negocio; m: MensagemObra; chave: string; abrir: (k: string) => void }) {
  if (m.de !== "cliente") return null;
  const pr = problemaDaMensagem(d, chave);
  if (pr) return <span className="text-xs text-muted-foreground">Problema {pr.id} · {ESTADO[pr.estado][0]}</span>;
  if (fotosDe(m).length) return <button type="button" onClick={() => abrir(chave)} className="text-xs font-medium text-destructive underline-offset-4 hover:underline">Problema por tratar</button>;
  if (ctx.S.role !== "operacoes" || !d.obra.plano) return null;
  return <button type="button" onClick={() => abrir(chave)} className="text-xs font-medium text-primary underline-offset-4 hover:underline">Tratar como problema</button>;
}
