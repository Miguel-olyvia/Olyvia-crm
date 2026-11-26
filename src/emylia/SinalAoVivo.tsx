// 26/11 (Rúben, com uma imagem de barras a subir: «quero muito ter animações assim na plataforma, para mostrar mesmo que está live»).
// O sinal «ao vivo»: barras que crescem da esquerda para a direita e ondulam, na cor da marca. Aparece onde a plataforma está a trabalhar
// sozinha: a fita dos agentes, as Operações, a Olyvia a ouvir ou a pensar. Com «menos movimento» no sistema, fica parado.
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const ALTURAS = [0.32, 0.4, 0.46, 0.56, 0.68, 0.84, 1];

export function SinalAoVivo({ rotulo = "Ao vivo", tamanho = 16, className, intenso = false }: {
  /** o que se lê no leitor de ecrã (e na dica) */ rotulo?: string;
  /** a altura em px (a barra mais alta) */ tamanho?: number;
  className?: string;
  /** mais rápido (a Olyvia a ouvir ou a pensar) */ intenso?: boolean;
}) {
  const parado = useReducedMotion();
  const largura = Math.max(2, Math.round(tamanho / 8));
  return (
    <span role="img" aria-label={rotulo} title={rotulo} className={cn("inline-flex shrink-0 items-end", className)} style={{ height: tamanho, gap: largura }}>
      {ALTURAS.map((a, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          className="block rounded-full bg-primary/80"
          style={{ width: largura, height: tamanho * a, originY: 1 }}
          animate={parado ? undefined : { scaleY: [1, 0.45, 1] }}
          transition={parado ? undefined : { duration: intenso ? 0.7 : 1.3, repeat: Infinity, ease: "easeInOut", delay: i * (intenso ? 0.06 : 0.11) }}
        />
      ))}
    </span>
  );
}
