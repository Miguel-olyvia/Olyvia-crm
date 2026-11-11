// 11/11 (Rúben: «isto devem ser perguntas feitas dentro do Estúdio»): no passo «Fechar» do Estúdio, as perguntas da visita que faltam,
// em botões grandes, uma a seguir à outra (as respondidas ficam numa linha, com «Mudar»). As respostas vão para o negócio ao voltar.
import { useState } from "react";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Projeto } from "./necessidadesEstudio";
import { faltamPerguntas, perguntasDe, type Pergunta } from "./perguntasDaVisita";

const CHIP = (on: boolean) => cn("min-h-12 rounded-xl border px-4 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
  on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");

function Resposta({ q, mudar }: { q: Pergunta; mudar: (v: string) => void }) {
  const { c, v } = q;
  if (c.t === "sim_nao") return <div className="flex flex-wrap gap-2">{["Sim", "Não"].map((x) => <button key={x} type="button" aria-pressed={v === x} onClick={() => mudar(x)} className={CHIP(v === x)}>{x}</button>)}</div>;
  if ((c.t === "escolha" || c.t === "varios") && c.op) {
    const sel = c.t === "varios" ? v.split(",").map((x) => x.trim()).filter(Boolean) : [v];
    const tocar = (x: string) => {
      if (c.t !== "varios") return mudar(x);
      mudar((sel.includes(x) ? sel.filter((y) => y !== x) : [...sel, x]).join(", "));
    };
    return <div className="flex flex-wrap gap-2">{c.op.map((x) => <button key={x} type="button" aria-pressed={sel.includes(x)} onClick={() => tocar(x)} className={CHIP(sel.includes(x))}>{x}</button>)}</div>;
  }
  if (c.t === "contador") {
    const n = Number(v || 0) || 0, min = c.min ?? 0, max = c.max ?? 99;
    return (
      <div className="inline-flex items-center rounded-xl border border-input bg-card">
        <button type="button" aria-label={`Menos: ${c.l}`} disabled={n <= min} onClick={() => mudar(String(Math.max(min, n - 1)))} className="grid h-12 w-12 place-items-center hover:bg-muted disabled:opacity-30"><Minus className="h-4 w-4" /></button>
        <output aria-label={c.l} className="min-w-[3rem] text-center text-lg font-semibold tabular-nums">{v === "" ? "—" : n}</output>
        <button type="button" aria-label={`Mais: ${c.l}`} disabled={n >= max} onClick={() => mudar(String(Math.min(max, (v === "" ? min - 1 : n) + 1)))} className="grid h-12 w-12 place-items-center hover:bg-muted disabled:opacity-30"><Plus className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <textarea aria-label={c.l} defaultValue={v} placeholder={c.ph} rows={c.t === "texto_longo" ? 3 : 1} onBlur={(e) => { if (e.target.value !== v) mudar(e.target.value.trim()); }}
      className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
  );
}

export function PerguntasNoEstudio({ p, setP }: { p: Projeto; setP: (f: (x: Projeto) => Projeto) => void }) {
  const todas = perguntasDe(p), faltam = faltamPerguntas(p);
  const [verRespondidas, setVer] = useState(false);
  const [aMudar, setAMudar] = useState<string | null>(null);
  if (!todas.length) return null;
  const mudar = (k: string, v: string) => { setP((x) => ({ ...x, perguntas: { ...(x.perguntas ?? {}), [k]: v } })); setAMudar(null); };
  const respondidas = todas.filter((q) => q.v.trim() && q.k !== aMudar);
  const porResponder = todas.filter((q) => !q.v.trim() || q.k === aMudar);
  return (
    <section aria-labelledby="perguntas-estudio" className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="perguntas-estudio" className="text-lg font-semibold">Para fechar a visita</h2>
        <p role="status" className={cn("text-sm font-medium", faltam.length ? "text-amber-800 dark:text-amber-300" : "text-success")}>
          {faltam.length ? `Faltam ${faltam.length} ${faltam.length === 1 ? "resposta" : "respostas"}` : <span className="inline-flex items-center gap-1"><Check className="h-4 w-4" aria-hidden="true" />Tudo respondido</span>}
        </p>
      </div>
      <p className="text-[15px] text-muted-foreground">O que o Estúdio não sabe sozinho. O pé-direito, a janela e o toalheiro já vêm da planta e das alturas.</p>
      {porResponder.length > 0 && (
        <ol className="space-y-5">
          {porResponder.map((q) => (
            <li key={q.k} className="space-y-2">
              <p className="text-[15px] font-medium">{q.c.l}{!q.obrigatoria && <span className="font-normal text-muted-foreground"> (opcional)</span>}</p>
              {q.c.ajuda && <p className="-mt-1 text-sm text-muted-foreground">{q.c.ajuda}</p>}
              <Resposta q={q} mudar={(v) => mudar(q.k, v)} />
            </li>
          ))}
        </ol>
      )}
      {respondidas.length > 0 && (
        <div className="rounded-xl border border-border">
          <button type="button" aria-expanded={verRespondidas} onClick={() => setVer((x) => !x)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-[15px]">
            <span><b className="font-medium">{respondidas.length} já respondidas</b><span className="text-muted-foreground"> · {respondidas.slice(0, 3).map((q) => q.v).join(" · ")}{respondidas.length > 3 ? "…" : ""}</span></span>
            <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", verRespondidas && "rotate-180")} aria-hidden="true" />
          </button>
          {verRespondidas && (
            <ul className="divide-y divide-border border-t border-border">
              {respondidas.map((q) => (
                <li key={q.k} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[15px]">
                  <span><span className="text-muted-foreground">{q.c.l}:</span> <b className="font-medium">{q.v}</b></span>
                  <button type="button" onClick={() => setAMudar(q.k)} className="min-h-10 rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary/[0.06]">Mudar</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
