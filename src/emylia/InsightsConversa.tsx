// 11/11 (Rúben: «precisamos de retirar muitos mais insights»): o que a Olyvia percebeu de uma conversa (a chamada de qualificação ou a
// visita). Em cima, só o que se usa já: o resumo, quão perto está de comprar, os próximos passos, o que falta perguntar, o orçamento e o
// prazo, as objeções. O resto (necessidades, quem decide, concorrência, sinais de compra, preferências, riscos, compromissos,
// oportunidades, momentos e o que melhorar) fica em «Ver tudo». Cada ponto com o tempo da conversa leva à frase na transcrição.
import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, Check, CircleHelp, Euro, Flame, ListChecks, MessageSquareWarning, Ruler, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InsightsGuardados } from "./chamadaMotor";

const tempo = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const ESCALA: Record<string, string> = { alta: "alta", media: "média", baixa: "baixa", desconhecida: "por saber" };
const HUMOR: Record<string, string> = { positivo: "positivo", neutro: "neutro", negativo: "negativo", misto: "misto" };
const TEMP = {
  quente: { nome: "Quente", cor: "bg-success/15 text-success" },
  morno: { nome: "Morno", cor: "bg-warning/15 text-amber-800" },
  frio: { nome: "Frio", cor: "bg-muted text-muted-foreground" },
} as const;

export function InsightsConversa({ dados, tipo, compacto = false, onIrPara }: {
  dados: InsightsGuardados; tipo: "chamada" | "visita"; compacto?: boolean;
  /** Leva à frase da transcrição que começa nesse segundo (sem ele, os tempos só se mostram). */
  onIrPara?: (segundos: number) => void;
}) {
  const { insights: x, metricas: m, tempos } = dados;
  const t = TEMP[x.temperatura] ?? TEMP.morno;
  /** O tempo de uma linha da transcrição, como botão (ou texto) pequeno. */
  const quando = (linha?: number | null) => {
    if (linha === null || linha === undefined || tempos[linha] === undefined) return null;
    const s = tempos[linha];
    return onIrPara
      ? <button type="button" onClick={() => onIrPara(s)} className="ml-1.5 rounded px-1 text-xs tabular-nums text-primary underline-offset-2 hover:underline" aria-label={`Ir ao minuto ${tempo(s)} da conversa`}>{tempo(s)}</button>
      : <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{tempo(s)}</span>;
  };
  // frases juntas, cada uma com maiúscula e ponto final
  const frases = (xs: (string | null | undefined)[]) => xs.filter((s): s is string => !!s && !!s.trim())
    .map((s) => { const t = s.trim().replace(/[.;,]+$/, ""); return t[0].toUpperCase() + t.slice(1) + "."; }).join(" ");
  const orcamento = frases([x.orcamento.valor, x.orcamento.sensibilidade !== "desconhecida" ? `sensibilidade ao preço ${ESCALA[x.orcamento.sensibilidade]}` : null, x.orcamento.notas]);
  const prazo = frases([x.prazo.quando, x.prazo.urgencia !== "desconhecida" ? `urgência ${ESCALA[x.prazo.urgencia]}` : null,
    x.prazo.data_decisao ? `decide até ${x.prazo.data_decisao}` : null, x.prazo.notas]);
  const titulo = tipo === "chamada" ? (compacto ? "O que se soube na chamada" : "O que a Olyvia percebeu da chamada") : "O que a Olyvia percebeu da visita";

  return (
    <section aria-label={titulo} className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />{titulo}</h3>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", t.cor)}>
          <Flame className="h-3.5 w-3.5" aria-hidden="true" />{t.nome} · {x.pontuacao}
        </span>
        {m.falas ? (
          <span className="text-xs text-muted-foreground">
            {tempo(m.duracaoS)} de conversa · o cliente falou {m.pctCliente}% · {m.perguntasComercial} {m.perguntasComercial === 1 ? "pergunta" : "perguntas"} do comercial
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[15px] leading-snug">{x.resumo}</p>
      {x.porque_temperatura ? <p className="mt-1 text-sm text-muted-foreground">{x.porque_temperatura}</p> : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {compacto ? (
          <>
            <Bloco titulo="O que quer" icone={<ListChecks className="h-4 w-4" aria-hidden="true" />} vazio={!x.necessidades.length}>
              <Lista itens={x.necessidades.map((n) => <>{n.texto}{quando(n.linha)}</>)} />
            </Bloco>
            <Bloco titulo="Perguntar na visita" icone={<CircleHelp className="h-4 w-4" aria-hidden="true" />} vazio={!x.por_perguntar.length}>
              <Lista itens={x.por_perguntar} />
            </Bloco>
          </>
        ) : (
          <>
            <Bloco titulo="Próximos passos" icone={<ArrowRight className="h-4 w-4" aria-hidden="true" />} vazio={!x.proximos_passos.length}>
              <Lista itens={x.proximos_passos.map((p) => <><b className="font-medium">{p.responsavel}:</b> {p.texto}{p.quando ? <span className="text-muted-foreground"> · {p.quando}</span> : null}</>)} />
            </Bloco>
            <Bloco titulo={tipo === "chamada" ? "Perguntar na visita" : "Falta saber"} icone={<CircleHelp className="h-4 w-4" aria-hidden="true" />} vazio={!x.por_perguntar.length}>
              <Lista itens={x.por_perguntar} />
            </Bloco>
          </>
        )}
        <Bloco titulo="Orçamento e prazo" vazio={!orcamento && !prazo}>
          <dl className="space-y-1 text-[15px]">
            <div><dt className="inline text-muted-foreground">Orçamento: </dt><dd className="inline">{orcamento || "não se falou"}</dd></div>
            <div><dt className="inline text-muted-foreground">Prazo: </dt><dd className="inline">{prazo || "não se falou"}</dd></div>
          </dl>
        </Bloco>
        {compacto ? (
          <Bloco titulo="Riscos e cuidados" icone={<AlertTriangle className="h-4 w-4" aria-hidden="true" />} vazio={!x.riscos.length}>
            <Lista itens={x.riscos.map((r) => <><Gravidade g={r.gravidade} />{r.texto}{quando(r.linha)}</>)} />
          </Bloco>
        ) : (
          <Bloco titulo="Objeções" icone={<MessageSquareWarning className="h-4 w-4" aria-hidden="true" />} vazio={!x.objecoes.length} textoVazio="Nenhuma objeção.">
            <Lista itens={x.objecoes.map((o) => (
              <>
                {o.texto}{quando(o.linha)}
                <span className={cn("block text-sm", o.resolvida ? "text-muted-foreground" : "text-amber-800")}>
                  {o.resposta ? `${o.resolvida ? "Respondida" : "Ficou em aberto"}: ${o.resposta}` : "Ficou sem resposta."}
                </span>
              </>
            ))} />
          </Bloco>
        )}
      </div>

      {/* 11/11: na visita, o levantamento à parte (o que vai para o orçamento e para a obra): escolhas peça a peça, medidas e valores */}
      {!compacto && (x.escolhas?.length || x.medidas?.length || x.valores?.length) ? (
        <div className="mt-4 rounded-xl border border-border bg-card p-3">
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"><ListChecks className="h-4 w-4" aria-hidden="true" />O levantamento</h4>
          {x.escolhas?.length ? (
            <ul className="divide-y divide-border" aria-label="Escolhas peça a peça">
              {x.escolhas.map((e, i) => (
                <li key={i} className="flex items-start gap-2.5 py-2 text-[15px]">
                  <span aria-hidden="true" className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", e.decidida ? "bg-success text-white" : "bg-amber-400 text-white")}>
                    {e.decidida ? <Check className="h-3.5 w-3.5" /> : <span className="text-[11px] font-bold">?</span>}
                  </span>
                  <span className="min-w-0 flex-1"><b className="font-medium">{e.peca}</b>: {e.escolha}{quando(e.linha)}</span>
                  {!e.decidida ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">por decidir</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {x.medidas?.length ? (
            <div className="mt-2">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Ruler className="h-3.5 w-3.5" aria-hidden="true" />Medidas ditas</p>
              <ul className="flex flex-wrap gap-1.5">
                {x.medidas.map((m, i) => <li key={i} className="rounded-lg bg-muted/70 px-2.5 py-1 text-sm">{m.o_que}: <b className="font-semibold tabular-nums">{m.valor}</b>{quando(m.linha)}</li>)}
              </ul>
            </div>
          ) : null}
          {x.valores?.length ? (
            <div className="mt-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Euro className="h-3.5 w-3.5" aria-hidden="true" />Valores e condições falados</p>
              <Lista itens={x.valores.map((v) => <>{v.texto}{quando(v.linha)}</>)} />
            </div>
          ) : null}
        </div>
      ) : null}

      <details className="group mt-4">
        <summary className="cursor-pointer select-none text-sm font-medium text-primary underline-offset-4 hover:underline">Ver tudo</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {compacto ? (
            <Bloco titulo="Próximos passos" vazio={!x.proximos_passos.length}>
              <Lista itens={x.proximos_passos.map((p) => <><b className="font-medium">{p.responsavel}:</b> {p.texto}{p.quando ? <span className="text-muted-foreground"> · {p.quando}</span> : null}</>)} />
            </Bloco>
          ) : (
            <Bloco titulo="O que quer" vazio={!x.necessidades.length}>
              <Lista itens={x.necessidades.map((n) => <>{n.texto}{quando(n.linha)}</>)} />
            </Bloco>
          )}
          {x.motivacao ? <Bloco titulo="Porquê agora"><p className="text-[15px]">{x.motivacao}</p></Bloco> : null}
          <Bloco titulo="Quem decide" vazio={!x.decisores.length}>
            <Lista itens={x.decisores.map((d) => <><b className="font-medium">{d.quem}</b>: {d.papel}</>)} />
          </Bloco>
          <Bloco titulo="Concorrência">
            <p className="text-[15px]">{x.concorrencia.outros_orcamentos === "sim" ? "Tem ou vai pedir outros orçamentos." : x.concorrencia.outros_orcamentos === "nao" ? "Não pediu outros orçamentos." : "Não se sabe se pediu outros orçamentos."}
              {x.concorrencia.notas ? ` ${x.concorrencia.notas}` : ""}</p>
          </Bloco>
          <Bloco titulo="Sinais de compra" vazio={!x.sinais_compra.length}>
            <Lista itens={x.sinais_compra.map((s) => <>{s.texto}{quando(s.linha)}</>)} />
          </Bloco>
          <Bloco titulo="Gostos e escolhas" vazio={!x.preferencias.length}>
            <Lista itens={x.preferencias.map((p) => <><b className="font-medium">{p.tema}:</b> {p.texto}{quando(p.linha)}</>)} />
          </Bloco>
          {compacto ? (
            <Bloco titulo="Objeções" vazio={!x.objecoes.length} textoVazio="Nenhuma objeção.">
              <Lista itens={x.objecoes.map((o) => <>{o.texto}{quando(o.linha)}{o.resposta ? <span className="block text-sm text-muted-foreground">{o.resposta}</span> : null}</>)} />
            </Bloco>
          ) : (
            <Bloco titulo="Riscos e cuidados" vazio={!x.riscos.length}>
              <Lista itens={x.riscos.map((r) => <><Gravidade g={r.gravidade} />{r.texto}{quando(r.linha)}</>)} />
            </Bloco>
          )}
          <Bloco titulo="O que ficou prometido" vazio={!x.compromissos.length}>
            <Lista itens={x.compromissos.map((c) => <><b className="font-medium">{c.quem === "comercial" ? "Comercial" : "Cliente"}:</b> {c.texto}{c.quando ? <span className="text-muted-foreground"> · {c.quando}</span> : null}</>)} />
          </Bloco>
          <Bloco titulo="Outras oportunidades" vazio={!x.oportunidades.length}>
            <Lista itens={x.oportunidades.map((o) => <>{o.texto}{quando(o.linha)}</>)} />
          </Bloco>
          <Bloco titulo="Como reagiu o cliente">
            <p className="text-[15px]">No início {HUMOR[x.sentimento.inicio] ?? x.sentimento.inicio}, no fim {HUMOR[x.sentimento.fim] ?? x.sentimento.fim}.{x.sentimento.notas ? ` ${x.sentimento.notas}` : ""}</p>
          </Bloco>
          {x.momentos.length ? (
            <Bloco titulo="Momentos da conversa" className="sm:col-span-2">
              <ol className="space-y-1 text-[15px]">
                {x.momentos.map((mo, i) => <li key={i} className="flex gap-1">{quando(mo.linha) ?? null}<span className="ml-1">{mo.titulo}</span></li>)}
              </ol>
            </Bloco>
          ) : null}
          {x.coaching.correu_bem.length || x.coaching.a_melhorar.length ? (
            <Bloco titulo="Para o comercial" className="sm:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><p className="text-sm font-medium text-success">Correu bem</p><Lista itens={x.coaching.correu_bem} /></div>
                <div><p className="text-sm font-medium text-amber-800">A melhorar</p><Lista itens={x.coaching.a_melhorar} /></div>
              </div>
            </Bloco>
          ) : null}
        </div>
      </details>
    </section>
  );
}

function Bloco({ titulo, icone, vazio, textoVazio = "Não se falou disto.", className, children }: { titulo: string; icone?: ReactNode; vazio?: boolean; textoVazio?: string; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("min-w-0", className)}>
      <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">{icone}{titulo}</h4>
      {vazio ? <p className="text-sm text-muted-foreground">{textoVazio}</p> : children}
    </div>
  );
}

function Lista({ itens }: { itens: ReactNode[] }) {
  return <ul className="list-disc space-y-1 pl-5 text-[15px] leading-snug marker:text-muted-foreground">{itens.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

function Gravidade({ g }: { g: "alta" | "media" | "baixa" }) {
  if (g !== "alta") return null;
  return <span className="mr-1.5 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold text-destructive">importante</span>;
}
