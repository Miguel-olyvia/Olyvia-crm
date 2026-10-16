/**
 * As decisoes do RH sobre uma admissao submetida: Aprovar, Devolver com comentarios por campo e Rejeitar com mensagem
 * obrigatoria. Sao da V3b (`rpc_hr_admissao_aprovar/devolver/rejeitar` ainda nao existem): aqui ficam DESENHADAS e
 * DESATIVADAS, com `aria-disabled` (e nao `disabled`, para continuarem focaveis e a razao se ouvir) e a razao a vista.
 * Clicar nao faz nada: nao chama a base, nao fecha a janela, nao avisa.
 *
 * Quando a V3b chegar, cada botao passa a abrir o seu fluxo (aprovar, comentarios por campo, `MotivoAdmissaoDialog`) e a
 * razao desaparece.
 */
import { useId } from "react";
import { Check, MessageSquarePlus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

export function RevisaoDecisoes() {
  const { t } = useTranslation();
  const idRazao = useId();
  const decisoes = [
    { id: "aprovar", chave: "rhAdm.acao.aprovar", Icone: Check, variante: "default" as const },
    { id: "devolver", chave: "rhAdm.acao.devolver", Icone: MessageSquarePlus, variante: "outline" as const },
    { id: "rejeitar", chave: "rhAdm.acao.rejeitar", Icone: XCircle, variante: "outline" as const },
  ];
  return (
    <div role="group" aria-label={t("rhAdm.acao.grupo")} className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("rhAdm.acao.explicacao")}</p>
      <div className="flex flex-wrap gap-2">
        {decisoes.map(({ id, chave, Icone, variante }) => (
          <Button
            key={id}
            type="button"
            variant={variante}
            className={cn("min-h-11 cursor-not-allowed gap-2 opacity-50", FOCO)}
            aria-disabled="true"
            aria-describedby={idRazao}
            onClick={(evento) => evento.preventDefault()}
          >
            <Icone className="h-4 w-4" aria-hidden="true" />
            {t(chave)}
          </Button>
        ))}
      </div>
      <p id={idRazao} className="text-xs text-muted-foreground">
        {t("rhAdm.acao.proximaFase")}
      </p>
    </div>
  );
}
