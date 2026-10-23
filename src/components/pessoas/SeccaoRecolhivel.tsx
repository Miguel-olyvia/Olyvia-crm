// Uma secção da ficha que se abre e fecha: o título (h4) com uma linha de resumo ao lado, e o conteúdo por baixo. Fechada, só se vê o título e o
// resumo: é o que deixa o negócio legível (o estado e o que fazer em cima, os detalhes à mão, um de cada vez). O botão do título abre e fecha
// (aria-expanded); o conteúdo só existe aberto.
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FOCO } from "@/components/negocio-metas/estilos";

interface SeccaoRecolhivelProps {
  titulo: string;
  /** Uma linha que diz o essencial com a secção fechada ("1 orçamento · 17 500 €"). */
  resumo?: string;
  /** Aberta ao entrar; depois é quem usa que decide. */
  aberta?: boolean;
  children: ReactNode;
}

export function SeccaoRecolhivel({ titulo, resumo, aberta = false, children }: SeccaoRecolhivelProps) {
  const [aberto, setAberto] = useState(aberta);
  return (
    <Collapsible open={aberto} onOpenChange={setAberto} className="rounded-lg border border-border bg-card">
      <h4 className="m-0 text-base font-semibold text-foreground">
        <CollapsibleTrigger className={cn("flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left", FOCO)}>
          <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-3">
            <span>{titulo}</span>
            {resumo && <span className="text-sm font-normal text-muted-foreground">{resumo}</span>}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", aberto && "rotate-180")}
          />
        </CollapsibleTrigger>
      </h4>
      <CollapsibleContent className="border-t border-border px-4 py-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
