/**
 * O separador «Pessoas»: a lista dos ativos do grupo (que chega por `children`, com os seus estados vazios). A lista «atribuídos no RH
 * sem ativo registado» saiu: o equipamento atribuído no RH passa a ser um ativo sozinho (só a farda fica de fora, e continua no RH).
 * Sem `hr.pessoas.retribuicao.view` (`rhOculto`) não há nomes: só o aviso «Sem permissão para ver a quem estão atribuídos».
 */
import type { ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  rhOculto: boolean;
  children: ReactNode;
}

export function GrupoPessoas({ rhOculto, children }: Props) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {rhOculto && <p className="text-sm text-muted-foreground">{t("ativos.pessoa.rhOcultoAviso")}</p>}
      {children}
    </div>
  );
}
