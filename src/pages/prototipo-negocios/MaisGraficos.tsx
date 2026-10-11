// O botão "Mais gráficos" dos dois dashboards: por defeito só se vêem os cartões e quatro gráficos; o resto fica atrás deste botão (aria-expanded).
// O estado vive em quem o usa (numa variável de módulo, para sobreviver a mudar de ecrã e voltar); aqui só se desenha.
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const memoria = new Map<string, boolean>();
/** Esquece quais os "Mais gráficos" abertos (quando a demonstração é reposta). */
export function esquecerMaisGraficos(): void { memoria.clear(); }
/** Se os "Mais gráficos" de um dashboard estão abertos, lembrado numa variável de módulo (a chave é o dashboard). */
export function useMaisGraficos(chave: string): [boolean, () => void] {
  const [aberto, definir] = useState(memoria.get(chave) ?? false);
  return [aberto, () => { memoria.set(chave, !aberto); definir(!aberto); }];
}

interface MaisProps { aberto: boolean; aoAlternar: () => void; children: ReactNode }

export function MaisGraficos({ aberto, aoAlternar, children }: MaisProps) {
  const id = useId();
  return (
    <div className="grid gap-4">
      <div>
        <button type="button" aria-expanded={aberto} aria-controls={id} onClick={aoAlternar}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-4 text-[15px] font-medium hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          Mais gráficos
          <ChevronDown className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", aberto && "rotate-180")} aria-hidden="true" />
        </button>
      </div>
      <div id={id} hidden={!aberto} className="grid gap-4 lg:grid-cols-2">{aberto && children}</div>
    </div>
  );
}
