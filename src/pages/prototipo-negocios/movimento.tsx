// O movimento da seleção guiada das Necessidades (14/10/2026), com framer-motion.
// Regras: só se anima transform e opacity (60 fps no telemóvel); uma mola curta (cerca de 300 ms); listas com mais de
// ANIMAR_ATE itens entram sem animação; com prefers-reduced-motion não há deslizes nem cascatas, só um fade de 100 ms.
// · MOLA, deslize(): a passagem entre passos (avançar para a esquerda, voltar para a direita).
// · VistoDesenho: o visto que se desenha (pathLength) dentro de um círculo que enche (scale).
// · Contagem: o número que conta até ao valor novo (300–400 ms, tabular-nums), com um realce breve quando muda.
// · Progresso: a barra de passos que se enche, com o indicador do passo atual a deslizar (layoutId) e o "Feito".
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MotionGlobalConfig, animate, motion, useReducedMotion, type Transition, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

/** Até quantos itens uma lista entra em cascata e se reorganiza com animação (o resto entra sem animação). */
export const ANIMAR_ATE = 40;
/** O intervalo da cascata (30–40 ms). */
export const CASCATA = 0.035;
/** A mola curta da passagem entre passos (assenta em cerca de 300 ms). */
export const MOLA: Transition = { type: "spring", stiffness: 560, damping: 44, mass: 0.9 };
/** A mola dos cartões (o "press" e o realce). */
export const MOLA_CARTAO: Transition = { type: "spring", stiffness: 700, damping: 38 };
/** A curva das entradas e dos números (sai rápido e assenta devagar). */
export const SAIDA: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const FADE: Transition = { duration: 0.1, ease: "linear" };

/** Reduzir o movimento: a preferência do sistema ou os testes (MotionGlobalConfig.skipAnimations). */
export function useReduzir(): boolean {
  const r = useReducedMotion();
  return !!r || !!MotionGlobalConfig.skipAnimations;
}

/** A passagem entre passos: `dir` 1 avança (entra da direita, sai para a esquerda), -1 volta (o inverso). */
export function deslize(reduzir: boolean): Variants {
  if (reduzir) return { entra: { opacity: 0 }, fica: { opacity: 1, transition: FADE }, sai: { opacity: 0, transition: FADE } };
  return {
    entra: (dir: number) => ({ x: dir * 56, opacity: 0 }),
    fica: { x: 0, opacity: 1, transition: { x: MOLA, opacity: { duration: 0.2, ease: SAIDA } } },
    sai: (dir: number) => ({ x: dir * -56, opacity: 0, transition: { x: MOLA, opacity: { duration: 0.14, ease: "easeIn" } } }),
  };
}

/** A entrada em cascata de um item de lista (o i-ésimo); sem animação depois de ANIMAR_ATE ou com o movimento reduzido. */
export function cascata(i: number, reduzir: boolean, atraso = 0) {
  if (reduzir || i >= ANIMAR_ATE) return { initial: false as const };
  return {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.28, ease: SAIDA, delay: atraso + i * CASCATA },
  };
}

/* ------------------------------------------------------------------ o visto que se desenha */
/** O visto: o círculo enche (scale) e o traço desenha-se (pathLength); ao desligar, o inverso. */
export function VistoDesenho({ on, className, grande }: { on: boolean; className?: string; grande?: boolean }) {
  const reduzir = useReduzir();
  const t = reduzir ? { duration: 0 } : undefined;
  return (
    <span aria-hidden="true" className={cn("relative grid shrink-0 place-items-center rounded-full", grande ? "h-16 w-16" : "h-6 w-6", className)}>
      {/* o anel vazio, sempre lá (some quando o círculo enche) */}
      <motion.span className="absolute inset-0 rounded-full border border-input bg-card" initial={false}
        animate={{ opacity: on ? 0 : 1 }} transition={t ?? { duration: 0.15 }} />
      <motion.span className="absolute inset-0 rounded-full bg-primary" initial={false}
        animate={{ scale: on ? 1 : 0.4, opacity: on ? 1 : 0 }} transition={t ?? { ...MOLA_CARTAO, opacity: { duration: 0.12 } }} />
      <svg viewBox="0 0 24 24" className={cn("relative", grande ? "h-9 w-9" : "h-3.5 w-3.5")} fill="none">
        <motion.path d="M5 12.5l4.5 4.5L19 7.5" stroke="hsl(var(--primary-foreground))" strokeWidth={grande ? 2.5 : 3.4} strokeLinecap="round" strokeLinejoin="round"
          initial={false} animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
          transition={t ?? { pathLength: { duration: on ? 0.26 : 0.12, ease: SAIDA, delay: on ? 0.05 : 0 }, opacity: { duration: 0.05 } }} />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ o número que conta */
/**
 * Um número que conta até ao valor novo (380 ms), em tabular-nums, com um realce breve (um pulo de 7 % e um traço
 * do acento que se estende e some). O texto é escrito pelo próprio componente (sem filhos React), para não haver
 * re-renders a cada frame; é aria-hidden: quem o usa dá o valor final ao leitor de ecrã (aria-label ou sr-only).
 */
export function Contagem({ valor, fmt, className, de, realce = true }: {
  valor: number; fmt: (n: number) => string; className?: string;
  /** O valor de onde se parte na primeira vez (ex.: 0 no resumo); sem ele, a primeira vez mostra logo o valor. */
  de?: number; realce?: boolean;
}) {
  const reduzir = useReduzir();
  const el = useRef<HTMLSpanElement>(null);
  const risco = useRef<HTMLSpanElement>(null);
  const atual = useRef<number>(de ?? valor);
  const fmtRef = useRef(fmt);
  fmtRef.current = fmt;
  const primeira = useRef(true);

  useLayoutEffect(() => {
    const e = el.current;
    if (!e) return;
    const desde = atual.current;
    if (reduzir || desde === valor) { atual.current = valor; e.textContent = fmtRef.current(valor); primeira.current = false; return; }
    e.textContent = fmtRef.current(desde);
    const ctls = [animate(desde, valor, {
      duration: 0.38, ease: SAIDA,
      onUpdate: (x) => { atual.current = x; e.textContent = fmtRef.current(x); },
      onComplete: () => { atual.current = valor; e.textContent = fmtRef.current(valor); },
    })];
    if (!primeira.current && realce) {
      ctls.push(animate(e, { scale: [1.07, 1] }, { duration: 0.4, ease: SAIDA }));
      if (risco.current) ctls.push(animate(risco.current, { opacity: [1, 0], scaleX: [0, 1] }, { duration: 0.7, ease: SAIDA }));
    }
    primeira.current = false;
    return () => ctls.forEach((c) => c.stop());
  }, [valor, reduzir, realce]);

  return (
    <span className={cn("relative inline-block tabular-nums", className)}>
      <span ref={el} className="inline-block origin-left" aria-hidden="true" />
      {realce && <span ref={risco} aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-0.5 h-0.5 origin-left rounded-full bg-primary opacity-0" />}
    </span>
  );
}

/* ------------------------------------------------------------------ a barra de progresso */
/**
 * A barra de passos: os feitos enchem-se (scaleX, da esquerda), o atual tem um indicador que desliza (layoutId).
 * Com `feito`, o passo atual fica cheio e o "3 de 7" dá lugar ao visto e a "Feito" (o avanço automático).
 */
export function Progresso({ total, atual, feito, rotulo }: { total: number; atual: number; feito?: boolean; rotulo: string }) {
  const reduzir = useReduzir();
  const t = reduzir ? { duration: 0 } : { duration: 0.32, ease: SAIDA };
  return (
    <div className="flex h-7 items-center gap-3">
      <div className="flex flex-1 gap-1" role="progressbar" aria-label={rotulo} aria-valuemin={1} aria-valuemax={total} aria-valuenow={atual + 1}
        aria-valuetext={`${atual + 1} de ${total}`}>
        {Array.from({ length: total }, (_, j) => (
          <span key={j} className="relative h-1.5 flex-1 rounded-full bg-muted">
            <motion.span className="absolute inset-0 origin-left rounded-full bg-primary" initial={false}
              animate={{ scaleX: j < atual || (j === atual && feito) ? 1 : 0 }} transition={t} />
            {j === atual && (
              <motion.span layoutId="passo-atual" className="absolute -inset-y-[3px] inset-x-0 rounded-full bg-primary ring-2 ring-background"
                transition={reduzir ? { duration: 0 } : MOLA} />
            )}
          </span>
        ))}
      </div>
      {/* "3 de 7" ou, no avanço automático, o visto e "Feito" (os dois sempre lá; muda só a opacidade e o y) */}
      <span className="relative grid h-7 min-w-[4.5rem] shrink-0 items-center justify-items-end text-sm tabular-nums text-muted-foreground">
        <motion.span className="col-start-1 row-start-1 flex items-center" aria-hidden={feito || undefined} initial={false}
          animate={{ opacity: feito ? 0 : 1, y: feito && !reduzir ? -8 : 0 }} transition={reduzir ? FADE : { duration: 0.18, ease: SAIDA }}>
          {atual + 1} de {total}
        </motion.span>
        <motion.span className="col-start-1 row-start-1 flex items-center gap-1.5 font-medium text-foreground" aria-hidden={!feito || undefined} initial={false}
          animate={{ opacity: feito ? 1 : 0, y: feito || reduzir ? 0 : 8 }} transition={reduzir ? FADE : { duration: 0.18, ease: SAIDA }}>
          <VistoDesenho on={!!feito} className="h-5 w-5" />{feito ? "Feito" : ""}
        </motion.span>
      </span>
    </div>
  );
}

/** Um "brilho" suave por trás do visto grande do resumo: aparece e esvai-se uma vez (opacity e scale). */
export function Brilho({ ativo }: { ativo: boolean }) {
  const reduzir = useReduzir();
  if (!ativo || reduzir) return null;
  return (
    <motion.span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.28) 0%, hsl(var(--primary) / 0.08) 45%, transparent 70%)" }}
      initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: [0, 1, 0.35], scale: [0.5, 1.1, 1] }} transition={{ duration: 1.1, ease: SAIDA, times: [0, 0.45, 1] }} />
  );
}

/** Para efeitos que só correm uma vez por montagem (a celebração do resumo). */
export function useUmaVez(): boolean {
  const [v, setV] = useState(true);
  useEffect(() => { const t = window.setTimeout(() => setV(false), 1400); return () => window.clearTimeout(t); }, []);
  return v;
}
