// 25/11 (Rúben: «a versão desktop das screens de todo o fluxo, permite ter muito mais informação e não apenas 3 colunas»).
// Num ecrã largo, à direita do passo: o que vem a seguir e com quem, os valores, os documentos, as seis fases (as feitas abrem-se
// só para ler) e o histórico todo (antes, os 5 últimos). Só se lê: o botão principal continua no passo. As contas: resumoDoNegocio.ts.
// No portátil fica só a parte dos documentos, por baixo dos passos (`compacto`).
import { useState } from "react";
import { Check, Circle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAPEIS, eur0, proximo, quandoEQuem, tot, totaisIva, nfmt, type Estado, type Negocio } from "./motor";
import { documentosDoNegocio, fasesDoNegocio, type EstadoDoc } from "./resumoDoNegocio";

const TITULO = "text-sm font-semibold tracking-tight text-foreground";
const HIST_INICIO = 8;

function IconeEstado({ e }: { e: EstadoDoc }) {
  return e === "ok" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="feito" />
    : e === "espera" ? <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-label="à espera" />
    : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="por fazer" />;
}

/** Os documentos do negócio, um por linha, com o estado. */
export function DocumentosDoNegocio({ d, className }: { d: Negocio; className?: string }) {
  const docs = documentosDoNegocio(d);
  if (!docs.length) return null;
  return (
    <section aria-labelledby={`docs-${d.id}`} className={className}>
      <h3 id={`docs-${d.id}`} className={TITULO}>Documentos</h3>
      <ul className="mt-2 space-y-2">
        {docs.map((x) => (
          <li key={x.id} className="flex items-start gap-2 text-[15px] leading-snug">
            <IconeEstado e={x.estado} />
            <span className="min-w-0"><span className="text-foreground">{x.l}</span><span className="block text-sm text-muted-foreground">{x.v}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** O histórico do negócio, o mais recente primeiro: os primeiros `inicio` e «Ver os N acontecimentos». `cartao`: numa coluna própria. */
export function HistoricoNegocio({ d, inicio = HIST_INICIO, cartao }: { d: Negocio; inicio?: number; cartao?: boolean }) {
  const [todo, setTodo] = useState(false);
  if (!d.hist.length) return null;
  const hist = todo ? d.hist : d.hist.slice(0, inicio);
  const corpo = (
    <section aria-labelledby={`hist-${d.id}`}>
      <h3 id={`hist-${d.id}`} className={TITULO}>Histórico</h3>
      <ol className="mt-2 space-y-3">
        {hist.map((h, i) => (
          <li key={d.hist.length - i} className="text-[15px] leading-snug">
            {h.t}<span className="block text-sm text-muted-foreground">{quandoEQuem(h)}</span>
          </li>
        ))}
      </ol>
      {d.hist.length > inicio && (
        <button type="button" onClick={() => setTodo(!todo)} aria-expanded={todo}
          className="mt-3 inline-flex min-h-10 items-center text-[15px] font-medium text-primary underline-offset-4 hover:underline">
          {todo ? "Ver menos" : `Ver os ${d.hist.length} acontecimentos`}
        </button>
      )}
    </section>
  );
  return cartao ? <aside aria-label="Histórico do negócio" className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">{corpo}</aside> : corpo;
}

export function ResumoNegocio({ d, S, passos, ver, irFase, semHistorico }: {
  d: Negocio; S: Estado;
  /** os passos da fase aberta (feitos e respostas em falta); sem eles, a fase de agora só diz «agora» */
  passos?: { feito: boolean; falta: number }[];
  /** a fase feita aberta só para ler (null: a de agora) */
  ver: number | null;
  irFase: (i: number | null) => void;
  /** num ecrã muito largo, o histórico vai para uma coluna própria (HistoricoNegocio) */
  semHistorico?: boolean;
}) {
  const p = proximo(d, S);
  const quem = p.who === "cliente" ? "o cliente" : p.who ? PAPEIS[p.who].n : null;
  const T = d.orc ? tot(d, S) : null;
  const iva = d.orc ? totaisIva(d, S) : null;
  const fases = fasesDoNegocio(d, passos);
  return (
    <aside aria-label="Resumo do negócio" className="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
      <section aria-labelledby={`seguir-${d.id}`}>
        <h3 id={`seguir-${d.id}`} className={TITULO}>A seguir</h3>
        <p className="mt-2 text-[15px] font-medium leading-snug text-foreground">{p.done ? "Negócio fechado" : p.t}</p>
        {p.sub && <p className="mt-1 text-sm leading-snug text-muted-foreground">{p.sub}</p>}
        {quem && !p.done && <p className="mt-1 text-sm text-muted-foreground">É de {quem}</p>}
      </section>

      {T && iva && (
        <section aria-labelledby={`valores-${d.id}`}>
          <h3 id={`valores-${d.id}`} className={TITULO}>Valores</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[15px]">
            <div><dt className="text-sm text-muted-foreground">Sem IVA</dt><dd className="font-semibold tabular-nums">{eur0(T.pf)} €</dd></div>
            <div><dt className="text-sm text-muted-foreground">Com IVA</dt><dd className="tabular-nums">{eur0(iva.total)} €</dd></div>
            {T.h > 0 && <div><dt className="text-sm text-muted-foreground">Horas de trabalho</dt><dd className="tabular-nums">{nfmt(Math.round(T.h))} h</dd></div>}
            {!!d.orc?.desconto && <div><dt className="text-sm text-muted-foreground">Desconto</dt><dd className="tabular-nums">{nfmt(d.orc.desconto)}%</dd></div>}
          </dl>
        </section>
      )}

      <DocumentosDoNegocio d={d} />

      <section aria-labelledby={`fases-${d.id}`}>
        <h3 id={`fases-${d.id}`} className={TITULO}>Fases</h3>
        <ol className="mt-1 -mx-2">
          {fases.map((f) => {
            const aberta = ver === f.i || (ver === null && f.estado === "agora");
            const corpo = (
              <>
                <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px]",
                  f.estado === "feita" ? "border-primary bg-primary text-primary-foreground" : f.estado === "agora" ? "border-foreground" : "border-input")} aria-hidden="true">
                  {f.estado === "feita" && <Check className="h-3 w-3" />}
                </span>
                <span className={cn("min-w-0 flex-1", f.estado === "depois" ? "text-muted-foreground" : "text-foreground", aberta && "font-semibold")}>{f.nome}</span>
                {f.v && <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{f.v}</span>}
              </>
            );
            return (
              <li key={f.nome} aria-current={f.estado === "agora" ? "step" : undefined}>
                {f.estado === "depois"
                  ? <div className="flex min-h-10 items-center gap-3 px-2 text-[15px]">{corpo}</div>
                  : <button type="button" onClick={() => irFase(f.estado === "agora" ? null : f.i)} aria-pressed={f.estado === "feita" ? ver === f.i : undefined}
                      aria-label={f.estado === "feita" ? `Ver a fase ${f.nome} (feita)` : `Voltar à fase ${f.nome}`}
                      className={cn("flex min-h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-[15px] transition-colors hover:bg-muted/60", aberta && "bg-muted")}>
                      {corpo}
                    </button>}
              </li>
            );
          })}
        </ol>
      </section>

      {!semHistorico && <HistoricoNegocio d={d} />}
    </aside>
  );
}
