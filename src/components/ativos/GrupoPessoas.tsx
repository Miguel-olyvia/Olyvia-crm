/**
 * O separador «Pessoas»: a lista dos ativos do grupo (que chega por `children`, com os seus estados vazios). A lista «atribuídos no RH
 * sem ativo registado» saiu: o equipamento atribuído no RH passa a ser um ativo sozinho (só a farda fica de fora, e continua no RH).
 * Sem `hr.pessoas.retribuicao.view` (`rhOculto`) não há nomes: só o aviso «Sem permissão para ver a quem estão atribuídos».
 */
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  rhOculto: boolean;
  children: ReactNode;
}

export function GrupoPessoas({ rhOculto, children }: Props) {
  const { t } = useTranslation();
  return (
    <div>
      {rhOculto && (
        <p className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3 text-sm text-muted-foreground sm:px-5">
          <Lock aria-hidden="true" className="h-4 w-4 shrink-0" />
          {t("ativos.pessoa.rhOcultoAviso")}
        </p>
      )}
      {children}
    </div>
  );
}
