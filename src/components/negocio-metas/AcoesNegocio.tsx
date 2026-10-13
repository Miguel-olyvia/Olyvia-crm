import type { LucideIcon } from "lucide-react";
import { FilePlus2, UserRound } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FOCO } from "./estilos";
import type { NegocioMes } from "./negocioMetas";

/** As ações que se fazem a partir de um negócio. Quem usa a peça decide o que cada uma faz (na página de exemplo, só um aviso). */
export interface AcoesNegocio {
  abrirNegocio: (negocio: NegocioMes) => void;
  abrirPessoa: (negocio: NegocioMes) => void;
  criarOrcamento: (negocio: NegocioMes) => void;
}

interface BotoesAcoesNegocioProps {
  negocio: NegocioMes;
  acoes: AcoesNegocio;
  /** Para o cartão esconder os botões até ao foco e mostrá-los sempre no toque. */
  className?: string;
}

/**
 * Dois botões de ícone de 44 px (abrir pessoa e criar orçamento),
 * cada um com nome para leitores de ecrã e dica. São irmãos do botão principal do
 * cartão ou da linha, nunca filhos dele.
 */
export function BotoesAcoesNegocio({ negocio, acoes, className }: BotoesAcoesNegocioProps) {
  const { t } = useTranslation();
  const botoes: readonly { chave: string; Icone: LucideIcon; acao: () => void }[] = [
    { chave: "openPerson", Icone: UserRound, acao: () => acoes.abrirPessoa(negocio) },
    { chave: "createQuote", Icone: FilePlus2, acao: () => acoes.criarOrcamento(negocio) },
  ];
  return (
    <TooltipProvider delayDuration={300}>
      <div role="group" aria-label={t("businessGoals.actions.label")} className={cn("flex items-center gap-1", className)}>
        {botoes.map(({ chave, Icone, acao }) => {
          const nome = t(`businessGoals.actions.${chave}`);
          const rotulo = t("businessGoals.actions.forName", { action: nome, name: negocio.pessoa });
          return (
            <Tooltip key={chave}>
              <TooltipTrigger asChild>
                <Button
                  type="button" variant="ghost" size="icon" aria-label={rotulo}
                  className={cn("h-11 w-11", FOCO)} onClick={acao}
                >
                  <Icone className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{nome}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
