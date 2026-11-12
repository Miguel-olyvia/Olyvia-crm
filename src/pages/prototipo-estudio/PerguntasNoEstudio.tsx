// 11/11 (Rúben: «isto devem ser perguntas feitas dentro do Estúdio»): no passo «Fechar» do Estúdio, as perguntas da visita que faltam,
// em botões grandes, uma a seguir à outra. As respostas vão para o negócio ao voltar.
// 12/11 (Rúben: «melhora também isto; e tem um erro: nos pontos elétricos clico no "+", atribui 1 mas esconde o campo»): a pergunta
// respondida já não sai da lista (saía logo, e o contador desaparecia ao primeiro «+»). Só as que já vinham respondidas do negócio ficam
// dobradas em baixo. Cada bloco com o título dele, cada pergunta com o número (um visto quando tem resposta), e o progresso em cima.
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Projeto } from "./necessidadesEstudio";
import { faltamPerguntas, perguntasDe, type Pergunta } from "./perguntasDaVisita";

const CHIP = (on: boolean) => cn("inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
  on ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-input bg-background hover:border-primary/50 hover:bg-primary/[0.04]");

function Resposta({ q, mudar }: { q: Pergunta; mudar: (v: string) => void }) {
  const { c, v } = q;
  if (c.t === "sim_nao" || ((c.t === "escolha" || c.t === "varios") && c.op)) {
    const ops = c.t === "sim_nao" ? ["Sim", "Não"] : c.op!;
    const sel = c.t === "varios" ? v.split(",").map((x) => x.trim()).filter(Boolean) : [v];
    const tocar = (x: string) => {
      if (c.t !== "varios") return mudar(x);
      mudar((sel.includes(x) ? sel.filter((y) => y !== x) : [...sel, x]).join(", "));
    };
    return (
      <div role="group" aria-label={c.l} className="flex flex-wrap gap-2">
        {ops.map((x) => (
          <button key={x} type="button" aria-pressed={sel.includes(x)} onClick={() => tocar(x)} className={CHIP(sel.includes(x))}>
            {sel.includes(x) && <Check className="h-4 w-4" aria-hidden="true" />}{x}
          </button>
        ))}
      </div>
    );
  }
  if (c.t === "contador") {
    const n = Number(v || 0) || 0, min = c.min ?? 0, max = c.max ?? 99, vazio = v === "";
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-2xl border border-input bg-background p-1">
          <button type="button" aria-label={`Menos: ${c.l}`} disabled={vazio || n <= min} onClick={() => mudar(String(Math.max(min, n - 1)))}
            className="grid h-11 w-11 place-items-center rounded-xl hover:bg-muted disabled:opacity-30"><Minus className="h-4 w-4" aria-hidden="true" /></button>
          <output aria-label={c.l} className={cn("min-w-[3.5rem] text-center text-xl font-semibold tabular-nums", vazio && "text-muted-foreground")}>{vazio ? "—" : n}</output>
          <button type="button" aria-label={`Mais: ${c.l}`} disabled={n >= max} onClick={() => mudar(String(vazio ? Math.min(max, Math.max(min, 1)) : Math.min(max, n + 1)))}
            className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary hover:bg-primary/15 disabled:opacity-30"><Plus className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        {vazio && <button type="button" onClick={() => mudar(String(min))} className="min-h-11 rounded-xl px-3 text-sm text-muted-foreground hover:bg-muted">Nenhum</button>}
      </div>
    );
  }
  return (
    <textarea aria-label={c.l} defaultValue={v} placeholder={c.ph} rows={c.t === "texto_longo" ? 3 : 2} onBlur={(e) => { if (e.target.value.trim() !== v) mudar(e.target.value.trim()); }}
      className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
  );
}

export function PerguntasNoEstudio({ p, setP }: { p: Projeto; setP: (f: (x: Projeto) => Projeto) => void }) {
  const reduzir = useReducedMotion();
  const todas = perguntasDe(p), faltam = faltamPerguntas(p);
  // as que já vinham respondidas quando o passo abriu ficam dobradas em baixo; as que se respondem aqui ficam no sítio
  const [jaVinham] = useState(() => new Set(todas.filter((q) => q.v.trim()).map((q) => q.k)));
  const [verRespondidas, setVer] = useState(false);
  const [aMudar, setAMudar] = useState<ReadonlySet<string>>(new Set());
  if (!todas.length) return null;
  const aqui = todas.filter((q) => !jaVinham.has(q.k) || aMudar.has(q.k));
  const dobradas = todas.filter((q) => jaVinham.has(q.k) && !aMudar.has(q.k));
  const blocos = new Map<string, Pergunta[]>();
  for (const q of aqui) { const b = q.c.bloco ?? "As escolhas do cliente"; blocos.set(b, [...(blocos.get(b) ?? []), q]); }
  const mudar = (k: string, v: string) => setP((x) => ({ ...x, perguntas: { ...(x.perguntas ?? {}), [k]: v } }));
  const obrig = todas.filter((q) => q.obrigatoria), feitas = obrig.length - faltam.length;
  const naLista = new Set(aqui.map((q) => q.k));
  const proxima = faltam.find((q) => naLista.has(q.k))?.k;
  let n = 0;
  return (
    <section aria-labelledby="perguntas-estudio" className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
      <header className="space-y-3 border-b border-border bg-muted/30 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="perguntas-estudio" className="text-xl font-semibold tracking-tight">Para fechar a visita</h2>
          <p role="status" className={cn("text-sm font-medium", faltam.length ? "text-amber-800 dark:text-amber-300" : "text-success")}>
            {faltam.length ? `Faltam ${faltam.length} ${faltam.length === 1 ? "resposta" : "respostas"}` : <span className="inline-flex items-center gap-1"><Check className="h-4 w-4" aria-hidden="true" />Tudo respondido</span>}
          </p>
        </div>
        <p className="text-[15px] text-muted-foreground">O que o Estúdio não sabe sozinho. O pé-direito, a janela e o toalheiro já vêm da planta e das alturas.</p>
        {obrig.length > 0 && (
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Respostas" aria-valuemin={0} aria-valuemax={obrig.length} aria-valuenow={feitas}>
            <motion.div className="h-full rounded-full bg-primary" initial={false} animate={{ width: `${(feitas / obrig.length) * 100}%` }} transition={{ duration: reduzir ? 0 : 0.35 }} />
          </div>
        )}
      </header>

      <div className="space-y-8 p-5 sm:p-6">
        {[...blocos].map(([bloco, qs]) => (
          <div key={bloco} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{bloco}</h3>
            <ol className="space-y-3">
              {qs.map((q) => {
                n++;
                const feita = !!q.v.trim(), aSeguir = q.k === proxima;
                return (
                  <li key={q.k} className={cn("flex gap-4 rounded-2xl border p-4 transition-colors", aSeguir ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-background")}>
                    <span aria-hidden="true" className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors",
                      feita ? "bg-success text-white" : aSeguir ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      {feita ? <Check className="h-4 w-4" /> : n}
                    </span>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="text-[15px] font-semibold">{q.c.l}{!q.obrigatoria && <span className="font-normal text-muted-foreground"> (opcional)</span>}</p>
                        {q.c.ajuda && <p className="text-sm text-muted-foreground">{q.c.ajuda}</p>}
                      </div>
                      <Resposta q={q} mudar={(v) => mudar(q.k, v)} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}

        {dobradas.length > 0 && (
          <div className="rounded-2xl border border-border">
            <button type="button" aria-expanded={verRespondidas} onClick={() => setVer((x) => !x)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-[15px]">
              <span><b className="font-medium">{dobradas.length} já vinham respondidas</b><span className="text-muted-foreground"> · {dobradas.slice(0, 3).map((q) => q.v).join(" · ")}{dobradas.length > 3 ? "…" : ""}</span></span>
              <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", verRespondidas && "rotate-180")} aria-hidden="true" />
            </button>
            {verRespondidas && (
              <ul className="divide-y divide-border border-t border-border">
                {dobradas.map((q) => (
                  <li key={q.k} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[15px]">
                    <span><span className="text-muted-foreground">{q.c.l}:</span> <b className="font-medium">{q.v}</b></span>
                    <button type="button" onClick={() => setAMudar((s) => new Set([...s, q.k]))} className="min-h-10 rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary/[0.06]">Mudar</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
