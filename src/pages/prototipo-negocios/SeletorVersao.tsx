// O seletor de versão do protótipo (só no aspeto simples): três botões, Atual, V2 e V2 funcional, com aria-pressed, e por baixo a versão ativa.
import { useId } from "react";
import { cn } from "@/lib/utils";
import { VERSOES, nomeVersao, type VersaoProto } from "./versaoPrototipo";

export function SeletorVersao({ versao, mudar }: { versao: VersaoProto; mudar: (v: VersaoProto) => void }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <span id={id} className="text-[15px] text-foreground">Versão</span>
      <div role="group" aria-labelledby={id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.4fr)] overflow-hidden rounded-lg border border-[hsl(220_10%_45%)]">
        {VERSOES.map((v, i) => (
          <button key={v.id} type="button" aria-pressed={versao === v.id} onClick={() => { if (v.id !== versao) mudar(v.id); }}
            className={cn("min-h-11 px-1 text-[15px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
              i > 0 && "border-l border-[hsl(220_10%_45%)]",
              versao === v.id ? "bg-foreground font-semibold text-background" : "bg-card text-foreground hover:bg-muted")}>
            {v.nome}
          </button>
        ))}
      </div>
      <p className="text-[15px] text-muted-foreground" aria-live="polite">A comparar: {nomeVersao(versao)}</p>
    </div>
  );
}
