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
            {/* 25/11: a checklist da tarefa no Infraspeak e quem a faz */}
            {D.det.length > 0 && !editar && (
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
