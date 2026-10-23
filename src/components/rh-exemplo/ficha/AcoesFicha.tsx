// Os botões de ação do cabeçalho da ficha de RH: Criar acesso (o único primário, só a quem ainda não tem conta), Enviar
// convite e Mais. RH é a pessoa como trabalhadora: o acesso à plataforma é uma ação à parte, nunca obrigatória.
import { MoreHorizontal, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { BotaoCriarAcesso } from "@/components/rh-exemplo/BotaoCriarAcesso";
import { PermissionGate } from "@/components/rh-exemplo/PermissionGate";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

/** As abas a que o menu "Mais" salta (as que não cabem em botões). */
const SALTOS = ["contratos", "planeamento", "documentos", "ausencias"] as const;

interface AcoesFichaProps {
  temConta: boolean;
  /** Em admissão, criar acesso e convidar são passos do cartão «Admissão» (o acesso só depois de o contrato estar assinado). */
  emAdmissao?: boolean;
  /** Quantos campos faltam na admissão (bloqueia "Criar acesso"); 0 deixa o botão ativo. */
  pendencias: number;
  aoCriarAcesso: () => void;
  aoEnviarConvite: () => void;
  aoAbrirAba: (aba: string) => void;
}

export function AcoesFicha({ temConta, emAdmissao = false, pendencias, aoCriarAcesso, aoEnviarConvite, aoAbrirAba }: AcoesFichaProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-start gap-2 px-6 pb-4">
      {!emAdmissao && (
        <PermissionGate permission="hr.pessoas.conta.criar">
          <BotaoCriarAcesso reenviar={temConta} pendencias={pendencias} principal={!temConta} onClick={aoCriarAcesso} />
        </PermissionGate>
      )}
      {!temConta && !emAdmissao && (
        <PermissionGate permission="hr.pessoas.convite.enviar">
          <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)} onClick={aoEnviarConvite}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {t("hr.convite.enviar")}
          </Button>
        </PermissionGate>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)} aria-label={t("rhForm.ficha.maisAjuda")}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            {t("rhForm.ficha.mais")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {SALTOS.map((aba) => (
            <DropdownMenuItem key={aba} className="min-h-11" onSelect={() => aoAbrirAba(aba)}>
              {t("rhForm.ficha.irPara", { aba: t(`hr.pessoa.tabs.${aba}`) })}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
