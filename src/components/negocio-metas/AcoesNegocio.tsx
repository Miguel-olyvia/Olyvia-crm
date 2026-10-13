import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { Copy, FilePlus2, UserRound } from "lucide-react";
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
  copiarContacto: (negocio: NegocioMes) => void;
}

interface BotoesAcoesNegocioProps {
  negocio: NegocioMes;
  acoes: AcoesNegocio;
  /** Para o cartão esconder os botões até ao foco e mostrá-los sempre no toque. */
  className?: string;
}

const temContacto = (n: NegocioMes): boolean => n.contacto.telefone !== null || n.contacto.email !== null;

/**
 * Três botões de ícone de 44 px (abrir pessoa, criar orçamento, copiar contacto),
 * cada um com nome para leitores de ecrã e dica. São irmãos do botão principal do
 * cartão ou da linha, nunca filhos dele.
 */
export function BotoesAcoesNegocio({ negocio, acoes, className }: BotoesAcoesNegocioProps) {
  const { t } = useTranslation();
  const idMotivo = useId();
  const semContacto = !temContacto(negocio);
  const botoes: readonly { chave: string; Icone: LucideIcon; acao: () => void; desligado?: boolean }[] = [
    { chave: "openPerson", Icone: UserRound, acao: () => acoes.abrirPessoa(negocio) },
    { chave: "createQuote", Icone: FilePlus2, acao: () => acoes.criarOrcamento(negocio) },
    { chave: "copyContact", Icone: Copy, acao: () => acoes.copiarContacto(negocio), desligado: semContacto },
  ];
  return (
    <TooltipProvider delayDuration={300}>
      <div role="group" aria-label={t("businessGoals.actions.label")} className={cn("flex items-center gap-1", className)}>
        {botoes.map(({ chave, Icone, acao, desligado }) => {
          const nome = t(`businessGoals.actions.${chave}`);
          const rotulo = t("businessGoals.actions.forName", { action: nome, name: negocio.pessoa });
          return (
            <Tooltip key={chave}>
              <TooltipTrigger asChild>
                <Button
                  type="button" variant="ghost" size="icon" aria-label={rotulo}
                  aria-disabled={desligado || undefined} aria-describedby={desligado ? idMotivo : undefined}
                  className={cn("h-11 w-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO)}
                  onClick={() => { if (!desligado) acao(); }}
                >
                  <Icone className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{desligado ? `${nome} — ${t("businessGoals.actions.noContact")}` : nome}</TooltipContent>
            </Tooltip>
          );
        })}
        {semContacto && <span id={idMotivo} className="sr-only">{t("businessGoals.actions.noContact")}</span>}
      </div>
    </TooltipProvider>
  );
}
