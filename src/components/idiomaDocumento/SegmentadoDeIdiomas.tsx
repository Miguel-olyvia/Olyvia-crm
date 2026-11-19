import { useRef } from "react";
import { cn } from "@/lib/utils";
import { ALVO_DO_SELETOR, nomeNativoDoIdioma } from "./apoioDoSeletor";

export interface SegmentadoDeIdiomasProps {
  /** Cada opção é um ou mais códigos («pt», ou «pt»+«en» para «Português + English»). */
  opcoes: string[][];
  /** A opção escolhida (os mesmos códigos de uma das `opcoes`). */
  escolha: string[];
  rotulo: string;
  className?: string;
  onChange: (escolha: string[]) => void;
}

/**
 * Controlo segmentado acessível: um radiogroup com um botão por opção, setas/Home/End a mover e a escolher, só a
 * opção atual na ordem do Tab, alvos de 44px, cores do tema (claro e escuro). Só chama `onChange` quando a escolha muda.
 */
export function SegmentadoDeIdiomas({ opcoes, escolha, rotulo, className, onChange }: SegmentadoDeIdiomasProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const chave = escolha.join("+");
  const atual = Math.max(0, opcoes.findIndex((o) => o.join("+") === chave));

  const escolher = (indice: number, mover: boolean) => {
    if (mover) refs.current[indice]?.focus();
    if (indice !== atual) onChange(opcoes[indice]);
  };

  const aoTeclar = (e: React.KeyboardEvent, indice: number) => {
    const n = opcoes.length;
    const destino =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? (indice + 1) % n
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (indice + n - 1) % n
      : e.key === "Home" ? 0
      : e.key === "End" ? n - 1
      : null;
    if (destino === null) return;
    e.preventDefault();
    escolher(destino, true);
  };

  return (
    <div role="radiogroup" aria-label={rotulo} className={cn("inline-flex flex-wrap gap-1 rounded-lg border bg-muted p-1", className)}>
      {opcoes.map((opcao, i) => {
        const marcada = i === atual;
        return (
          <button
            key={opcao.join("+")}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={marcada}
            tabIndex={marcada ? 0 : -1}
            lang={opcao.length === 1 ? opcao[0] : undefined}
            onClick={() => escolher(i, false)}
            onKeyDown={(e) => aoTeclar(e, i)}
            className={cn(
              ALVO_DO_SELETOR,
              "rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
              marcada ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            {opcao.map(nomeNativoDoIdioma).join(" + ")}
          </button>
        );
      })}
    </div>
  );
}
