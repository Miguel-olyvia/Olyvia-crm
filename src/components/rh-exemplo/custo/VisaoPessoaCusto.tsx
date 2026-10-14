// A «visão da pessoa» do Custo: só os valores avulsos dela (quilómetros, ajudas de custo, equipamento), para conferir, sem
// encargos nem custo da empresa e sem poder registar ou anular. É a mesma que o RH vê ao escolher essa vista na ficha.
import { CustoAvulsos } from "@/components/rh-exemplo/custo/CustoAvulsos";
import type { AvulsoCusto } from "@/components/rh-exemplo/lib/custoMes";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  pessoaId: string;
  nome: string;
  avulsos: AvulsoCusto[];
}

export function VisaoPessoaCusto({ pessoaId, nome, avulsos }: Props) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="rounded-md bg-muted/50 p-3 text-sm" role="status">{t("rhA.custo.visaoPessoaAjuda", { nome })}</p>
      <CustoAvulsos pessoaId={pessoaId} autor={nome} avulsos={avulsos} podeGerir={false} />
    </div>
  );
}
