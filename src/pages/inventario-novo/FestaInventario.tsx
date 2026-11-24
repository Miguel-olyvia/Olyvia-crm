// A festa do novo Inventário (fatia 4; mockup: festa()): quando o livro da sessão (useLivroDaSessao) traz uma receção de PO
// ou uma saída de EC NOVA desde a leitura anterior, uma celebração curta — o visto que se desenha com o brilho do Estúdio
// (VistoDesenho / Brilho de movimento.tsx) e uns papelinhos leves — e o toque físico (vibrar).
//  · Nunca na primeira leitura: os movimentos que já lá estavam ao abrir (os da margem do relógio, ou feitos noutro
//    dispositivo antes de abrir) ficam como "já vistos". O mesmo ao trocar de organização (outra base).
//  · Os estornos (reversal_of_movement_id) não são festa.
//  · Com prefers-reduced-motion (useReduzir) não há festa nem vibração: fica só o toast.
// Só leitura: não grava nada, não muda o livro.
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Brilho, SAIDA, VistoDesenho, useReduzir, vibrar } from "@/emylia/movimento";
import { tipoDoMovimento, type MovimentoLivro } from "./anularInventario";

export const DURACAO_FESTA_MS = 1400;

/** O que é festa: receções de PO e saídas de EC, que não sejam estornos. */
export const eFesta = (m: MovimentoLivro): boolean => {
  if (m.reversal_of_movement_id) return false;
  const t = tipoDoMovimento(m);
  return t === "rececao" || t === "saida";
};

/**
 * Os movimentos de festa que não estavam em `vistos` (a leitura anterior). Com `vistos` null (a primeira leitura) nunca há.
 */
export function novosDeFesta(vistos: ReadonlySet<string> | null, movimentos: readonly MovimentoLivro[]): MovimentoLivro[] {
  if (!vistos) return [];
  return movimentos.filter((m) => !vistos.has(m.id) && eFesta(m));
}

/**
 * Vigia o livro e devolve o número da festa a mostrar (muda a cada festa) ou null.
 * @param base muda quando o livro passa a ser outro (a organização): volta a "primeira leitura".
 */
export function useFestaDoLivro(movimentos: readonly MovimentoLivro[] | undefined, base: string | null): number | null {
  const reduzir = useReduzir();
  const vistos = useRef<Set<string> | null>(null);
  const baseAtual = useRef(base);
  const [festa, setFesta] = useState<number | null>(null);

  useEffect(() => {
    if (baseAtual.current !== base) { baseAtual.current = base; vistos.current = null; }
    if (!movimentos) return;
    const novos = novosDeFesta(vistos.current, movimentos);
    const v = vistos.current ?? new Set<string>();
    for (const m of movimentos) v.add(m.id);
    vistos.current = v;
    if (!novos.length || reduzir) return;
    setFesta(Date.now());
    vibrar([10, 30, 10], reduzir);
  }, [movimentos, base]); // eslint-disable-line react-hooks/exhaustive-deps

  // Desaparece sozinha.
  useEffect(() => {
    if (festa === null) return;
    const t = window.setTimeout(() => setFesta(null), DURACAO_FESTA_MS);
    return () => window.clearTimeout(t);
  }, [festa]);

  return festa;
}

const CORES = ["hsl(var(--primary))", "#a78bfa", "#22c55e", "#f59e0b", "#3b82f6"];
/** Os papelinhos: poucos (14), só transform e opacity, posições fixas (sem Math.random: o mesmo desenho sempre). */
const PAPELINHOS = Array.from({ length: 14 }, (_, i) => {
  const ang = (i / 14) * Math.PI * 2;
  const r = 90 + (i % 3) * 30;
  return { x: Math.cos(ang) * r, y: Math.sin(ang) * r * 0.7 + 60, rot: (i % 2 ? 1 : -1) * (120 + i * 15), cor: CORES[i % CORES.length] };
});

/** A celebração (decorativa, aria-hidden, sem cliques). Com o movimento reduzido não aparece. */
export function FestaInventario({ festa }: { festa: number | null }) {
  const reduzir = useReduzir();
  if (festa === null || reduzir) return null;
  return <Celebracao key={festa} />;
}

function Celebracao() {
  // O VistoDesenho anima a mudança de `on` (initial={false}): monta desligado e liga no frame seguinte, para se desenhar.
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = window.requestAnimationFrame(() => setOn(true));
    return () => window.cancelAnimationFrame(f);
  }, []);
  return (
    <div data-testid="festa" aria-hidden="true" className="pointer-events-none fixed inset-0 z-[65] grid place-items-center">
      <motion.div className="relative grid place-items-center" initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.8, 1, 1, 0.96] }} transition={{ duration: DURACAO_FESTA_MS / 1000, ease: SAIDA, times: [0, 0.15, 0.75, 1] }}>
        <Brilho ativo />
        <VistoDesenho on={on} grande />
        {PAPELINHOS.map((p, i) => (
          <motion.span key={i} className="absolute left-1/2 top-1/2 h-2 w-3 rounded-[2px]" style={{ background: p.cor }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }} animate={{ x: p.x, y: p.y, rotate: p.rot, opacity: 0 }}
            transition={{ duration: 1.1, ease: SAIDA }} />
        ))}
      </motion.div>
    </div>
  );
}
