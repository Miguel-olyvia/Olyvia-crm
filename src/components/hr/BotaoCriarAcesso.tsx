/**
 * "Criar acesso" na ficha da pessoa -- ou "Reenviar credenciais", se ja tem
 * conta.
 *
 * Com pendencias na ficha o botao fica BLOQUEADO, mas nao `disabled`: um botao
 * desactivado nao recebe foco, e envolve-lo num `<span tabIndex=0>` dava uma
 * paragem de tabulacao sem nome nem papel. Aqui continua focavel, com
 * `aria-disabled` e `aria-describedby` a apontar para o texto visivel que diz
 * porque; o clique e ignorado. Reenviar credenciais a quem ja tem conta nunca
 * e travado.
 */
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

/** Liga o botao ao texto que explica o bloqueio. */
const ID_RAZAO = "hr-acesso-bloqueado-ficha";

interface BotaoCriarAcessoProps {
  /** A pessoa ja tem conta: o botao reenvia credenciais e nunca e travado. */
  reenviar: boolean;
  /** Quantos campos faltam. Zero (ou nao saber) deixa o botao activo. */
  pendencias: number;
  onClick: () => void;
}

export function BotaoCriarAcesso({ reenviar, pendencias, onClick }: BotaoCriarAcessoProps) {
  const { t } = useTranslation();
  const bloqueado = !reenviar && pendencias > 0;

  const botao = (
    <Button
      variant="outline"
      className={cn("gap-2", bloqueado && "cursor-not-allowed opacity-50")}
      aria-disabled={bloqueado || undefined}
      aria-describedby={bloqueado ? ID_RAZAO : undefined}
      onClick={() => {
        if (!bloqueado) onClick();
      }}
    >
      <KeyRound className="h-4 w-4" aria-hidden="true" />
      {t(reenviar ? "hr.acesso.reenviar" : "hr.acesso.criar")}
    </Button>
  );

  if (!bloqueado) return botao;

  return (
    <div className="flex flex-col items-start gap-1">
      {botao}
      <p id={ID_RAZAO} className="max-w-xs text-xs text-muted-foreground">
        {t("hr.acesso.bloqueadoPendencias", { n: pendencias })}
      </p>
    </div>
  );
}
