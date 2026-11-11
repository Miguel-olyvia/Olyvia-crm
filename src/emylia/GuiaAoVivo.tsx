// 11/11 (Rúben: «melhorar ainda mais a transcrição e os insights»): o guia ao vivo, ao lado da transcrição enquanto se grava. Em cima, a
// próxima pergunta (pronta a dizer); por baixo, os temas-chave, que se vão marcando à medida que o cliente responde. Tocar num tema com
// resposta leva à frase em que foi dita. A lógica (quando pedir, juntar, contas) está em guiaConversa.ts.
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, CircleDashed, Compass, Loader2, MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { contasGuia, type GuiaConversa, type TemaGuia } from "./guiaConversa";
import { useReduzir } from "./movimento";

export function GuiaAoVivo({ guia, temas, aPensar, erro, tempoDaLinha, onIrPara }: {
  guia: GuiaConversa | null; temas: TemaGuia[]; aPensar: boolean; erro?: string | null;
  /** O segundo da conversa em que começa uma linha (o índice das falas enviadas ao guia). */
  tempoDaLinha: (linha: number) => number | undefined;
  onIrPara?: (segundos: number) => void;
}) {
  const reduzir = useReduzir();
  const porChave = new Map((guia?.temas ?? []).map((t) => [t.chave, t]));
  // as contas são sempre sobre os temas pedidos (um tema que não veio conta como por falar)
  const c = contasGuia({ temas: temas.map((t) => porChave.get(t.k) ?? { chave: t.k, estado: "por_falar", resposta: null, linha: null }), proxima: { pergunta: null, porque: null }, alerta: null });
  const pct = c.total ? Math.round(((c.feitos + c.meio * 0.5) / c.total) * 100) : 0;
  return (
    <section aria-label="Guia da conversa" className="mt-4 overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.03]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold"><Compass className="h-4 w-4 text-primary" aria-hidden="true" />Guia da conversa</h3>
        <span className="text-sm tabular-nums text-muted-foreground" aria-live="polite">{c.feitos} de {c.total} temas com resposta</span>
        {aPensar ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />a atualizar</span> : null}
      </div>
      <div className="mx-4 mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]" role="progressbar" aria-label="Temas cobertos" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <motion.div className="h-full rounded-full bg-primary" initial={false} animate={{ width: `${pct}%` }} transition={reduzir ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
      </div>

      {/* a próxima pergunta */}
      <div className="px-4 pt-3">
        <AnimatePresence mode="wait" initial={false}>
          {guia?.proxima.pergunta ? (
            <motion.div key={guia.proxima.pergunta} initial={reduzir ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
              className="rounded-xl bg-card px-4 py-3 shadow-sm ring-1 ring-primary/20">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary"><MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden="true" />Pergunte agora</p>
              <p className="mt-1 text-[17px] font-medium leading-snug" aria-live="polite">{guia.proxima.pergunta}</p>
              {guia.proxima.porque ? <p className="mt-0.5 text-sm text-muted-foreground">{guia.proxima.porque}</p> : null}
            </motion.div>
          ) : (
            <motion.p key="espera" initial={false} animate={{ opacity: 1 }} className="rounded-xl bg-card px-4 py-3 text-sm text-muted-foreground ring-1 ring-border">
              {erro ? `O guia não respondeu agora (${erro}). Tenta outra vez no próximo minuto.` : "Ao primeiro minuto revisto, a Olyvia diz aqui a próxima pergunta e marca os temas já respondidos."}
            </motion.p>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {guia?.alerta ? (
            <motion.p key={guia.alerta} initial={reduzir ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{guia.alerta}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      {/* os temas */}
      <ul className="grid gap-1.5 p-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Temas">
        {temas.map((t) => {
          const v = porChave.get(t.k);
          const estado = v?.estado ?? "por_falar";
          const s = v?.linha != null ? tempoDaLinha(v.linha) : undefined;
          const conteudo = (
            <>
              <motion.span key={estado} aria-hidden="true" initial={reduzir || estado === "por_falar" ? false : { scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 22 }}
                className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", estado === "respondido" ? "bg-success text-white" : estado === "parcial" ? "bg-amber-400 text-white" : "text-muted-foreground")}>
                {estado === "respondido" ? <Check className="h-3.5 w-3.5" /> : estado === "parcial" ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : <CircleDashed className="h-4 w-4" />}
              </motion.span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-medium", estado === "por_falar" && "text-muted-foreground")}>{t.l}
                  <span className="sr-only">: {estado === "respondido" ? "respondido" : estado === "parcial" ? "a meio" : "por falar"}</span></span>
                {v?.resposta ? <span className="line-clamp-2 block text-xs text-muted-foreground">{v.resposta}</span> : null}
              </span>
            </>
          );
          return (
            <li key={t.k}>
              {s !== undefined && onIrPara ? (
                <button type="button" onClick={() => onIrPara(s)} className={cn("flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-card", estado === "respondido" && "bg-success/[0.06]")}>{conteudo}</button>
              ) : (
                <div className={cn("flex items-start gap-2 rounded-xl px-2.5 py-2", estado === "respondido" && "bg-success/[0.06]", estado === "parcial" && "bg-amber-50/60 dark:bg-amber-950/20")}>{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
