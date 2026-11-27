// 24/11 (Rúben: «cada tarefa do plano pode e deve ter microtarefas»). As microtarefas no painel da tarefa (Estúdio do plano e Estúdio da
// obra): a lista que o técnico marca no Hoje dele, com o que já marcou. O gestor junta, muda o texto, muda a ordem e tira, só nesta obra
// (a ficha do serviço no Catálogo não muda). As contas e as mudanças estão em microtarefas.ts; gravam pelo motor (A.microtarefas).
import { useState, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, Check, ListChecks, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { nfmt, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { detalheMicro, microFeitas, microtarefasDe, type MudancaMicro } from "../microtarefas";

const ORIGEM = {
  obra: "Lista desta obra. A ficha do serviço no Catálogo não muda.",
  servico: "Vêm da ficha do serviço no Catálogo. Mudar aqui só muda esta obra.",
  infraspeak: "Vêm das tarefas da Mudelar no Infraspeak. Mudar aqui só muda esta obra.",
  catalogo: "Vêm da ficha do serviço no Catálogo. Mudar aqui só muda esta obra.",
  instrucoes: "Vêm das instruções do trabalho. Mudar aqui só muda esta obra.",
} as const;

export function MicrotarefasTarefa({ ctx, d, ti, mexe, cor }: { ctx: Ctx; d: Negocio; ti: number; /** o gestor pode mudar a lista */ mexe: boolean; cor: string }) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!, t = p.tasks[ti];
  const { L, origem } = microtarefasDe(t, S, p);
  const feitas = t.exec?.estado === "validada" ? new Set(L.map((m) => m.id)) : microFeitas(t, L);
  const [nova, setNova] = useState("");
  const [aEditar, setAEditar] = useState<{ id: number; n: string } | null>(null);
  const mudar = (m: MudancaMicro) => run(() => { A.microtarefas(d.id, ti, m); });
  const juntar = () => { if (!nova.trim()) return; mudar({ k: "juntar", n: nova }); setNova(""); };
  const gravarTexto = () => { if (aEditar) mudar({ k: "mudar", id: aEditar.id, n: aEditar.n }); setAEditar(null); };
  const teclaTexto = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); gravarTexto(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setAEditar(null); }
  };
  const pct = L.length ? (feitas.size / L.length) * 100 : 0;
  const iconeBtn = "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <section aria-labelledby={`micro-${ti}`} className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`micro-${ti}`} className="flex items-center gap-1.5 text-sm font-medium"><ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />Microtarefas</h3>
        {L.length > 0 && <span className="text-sm tabular-nums text-muted-foreground">{feitas.size} de {L.length} feitas</span>}
      </div>
      {L.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Microtarefas feitas" aria-valuemin={0} aria-valuemax={L.length} aria-valuenow={feitas.size}>
          <div className="h-full rounded-full motion-safe:transition-[width] duration-500" style={{ width: `${pct}%`, background: cor }} />
        </div>
      )}
      <ol className="space-y-1">
        {L.map((m, k) => {
          const on = feitas.has(m.id), editar = aEditar?.id === m.id, D = detalheMicro(m);
          return (
            <li key={m.id} className={cn("rounded-lg px-2 py-1", on ? "bg-success/[0.07]" : "bg-muted/50")}>
            <div className="flex min-h-11 items-center gap-2">
              <span aria-hidden="true" className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border-2", on ? "border-success bg-success text-white" : "border-input bg-card")}>{on && <Check className="h-3.5 w-3.5" />}</span>
              <span className="sr-only">{on ? "Feita pelo técnico:" : "Por fazer:"}</span>
              {editar ? (
                <input autoFocus value={aEditar.n} aria-label="Texto da microtarefa" onChange={(e) => setAEditar({ id: m.id, n: e.target.value })} onBlur={gravarTexto} onKeyDown={teclaTexto}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm" />
              ) : mexe ? (
                <button type="button" onClick={() => setAEditar({ id: m.id, n: m.n })} title="Mudar o texto"
                  className={cn("min-w-0 flex-1 rounded-md py-1 text-left text-sm hover:underline", on && "text-muted-foreground")}>{k + 1}. {m.n}</button>
              ) : (
                <span className={cn("min-w-0 flex-1 text-sm", on && "text-muted-foreground")}>{k + 1}. {m.n}</span>
              )}
              {m.h != null && !editar && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{nfmt(m.h)} h</span>}
              {m.dias != null && !editar && <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title="Espera (secagem): conta nos dias, não nas horas">{m.dias} {m.dias === 1 ? "dia" : "dias"} de espera</span>}
              {mexe && !editar && (
                <span className="flex shrink-0 items-center">
                  <button type="button" className={iconeBtn} disabled={k === 0} aria-label={`Subir «${m.n}»`} onClick={() => mudar({ k: "mover", id: m.id, para: k - 1 })}><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" className={iconeBtn} disabled={k === L.length - 1} aria-label={`Descer «${m.n}»`} onClick={() => mudar({ k: "mover", id: m.id, para: k + 1 })}><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" className={cn(iconeBtn, "hover:text-destructive")} aria-label={`Tirar «${m.n}»`} onClick={() => mudar({ k: "tirar", id: m.id })}><X className="h-4 w-4" /></button>
                </span>
              )}
            </div>
            {/* 27/11 (Rúben: «ao editar as tasks também devemos poder editar os pontos»): quem planeia muda, tira e junta pontos */}
            {mexe && !editar && <PontosEditaveis key={`${m.id}-${D.det.join("|")}`} nome={m.n} det={D.det} quem={D.quem} gravar={(det) => mudar({ k: "pontos", id: m.id, det })} />}
            {/* 25/11: a checklist da tarefa no Infraspeak e quem a faz */}
            {!mexe && D.det.length > 0 && !editar && (
              <details className="pb-1 pl-7 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none py-0.5">{D.det.length} {D.det.length === 1 ? "ponto" : "pontos"}{D.quem ? ` · ${D.quem}` : ""}</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">{D.det.map((x, j) => <li key={j}>{x}</li>)}</ul>
              </details>
            )}
            </li>
          );
        })}
      </ol>
      {!L.length && <p className="text-sm text-muted-foreground">Sem microtarefas.{mexe ? " Junte a primeira em baixo." : ""}</p>}
      {mexe && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); juntar(); }}>
          <input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Ex.: Proteger a base com cartão" aria-label="Nova microtarefa"
            className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm" />
          <Button type="submit" variant="outline" className="min-h-10" disabled={!nova.trim()}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />Juntar</Button>
        </form>
      )}
      <p className="text-xs text-muted-foreground">{ORIGEM[origem]} O técnico marca-as no Hoje dele.</p>
    </section>
  );
}

/** 27/11: os pontos (o detalhe por bullets) de uma microtarefa, editáveis: o texto de cada um (grava ao sair do campo ou com Enter),
 *  tirar um, juntar outro. Fechados por omissão, como antes. */
function PontosEditaveis({ nome, det, quem, gravar }: { nome: string; det: string[]; quem?: string; gravar: (det: string[]) => void }) {
  const [L, setL] = useState<string[]>(det);
  const [novo, setNovo] = useState("");
  const guardar = (x: string[]) => { setL(x); gravar(x); };
  return (
    <details className="pb-1 pl-7 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none py-0.5">{L.length ? `${L.length} ${L.length === 1 ? "ponto" : "pontos"}` : "Juntar pontos"}{quem ? ` · ${quem}` : ""}</summary>
      <ul className="mt-1 space-y-1">
        {L.map((x, j) => (
          <li key={j} className="flex items-start gap-1.5">
            <span aria-hidden="true" className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/70" />
            <textarea rows={Math.min(4, Math.max(1, Math.ceil(x.length / 60)))} value={x} aria-label={`Ponto ${j + 1} de «${nome}»`}
              onChange={(e) => setL((a) => a.map((y, k) => (k === j ? e.target.value : y)))}
              onBlur={() => guardar(L)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
              className="min-h-8 min-w-0 flex-1 resize-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs text-foreground hover:border-input focus:border-input focus:bg-background focus:outline-none" />
            <button type="button" aria-label={`Tirar o ponto ${j + 1}`} onClick={() => guardar(L.filter((_, k) => k !== j))}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-muted hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
      <form className="mt-1 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (!novo.trim()) return; guardar([...L, novo.trim()]); setNovo(""); }}>
        <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo ponto" aria-label={`Novo ponto de «${nome}»`}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs" />
        <Button type="submit" size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={!novo.trim()} aria-label={`Acrescentar o ponto a «${nome}»`}><Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Ponto</Button>
      </form>
    </details>
  );
}
