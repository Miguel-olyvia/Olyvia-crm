/**
 * «Os meus custos» (A minha área): a visão da pessoa do separador Custo da ficha. A própria pessoa vê só os seus valores
 * avulsos, para conferir; nunca os encargos nem o custo da empresa. Só memória, sem acesso a dados.
 */
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SeloExemplo } from "@/components/rh-exemplo/SeloExemplo";
import { VisaoPessoaCusto } from "@/components/rh-exemplo/custo/VisaoPessoaCusto";
import { useCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useMinhaPessoa } from "@/components/rh-exemplo/hooks/useMinhaPessoa";
import { useTranslation } from "@/hooks/useTranslation";

export default function RhMeusCustos() {
  const { t } = useTranslation();
  const { activeCompany, isLoading } = useCompany();
  const minha = useMinhaPessoa();
  const todos = useCusto((e) => e.avulsos);
  const meus = useMemo(() => todos.filter((a) => a.pessoaId === minha.pessoaId), [todos, minha.pessoaId]);

  if (isLoading || minha.loading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (minha.semFicha || !minha.pessoaId) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-xl font-semibold">{t("rhAbas.meusCustos.titulo")}</h1>
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">{t("rhAbas.meusCustos.semFicha")}</CardContent>
        </Card>
      </div>
    );
  }
  return (
    <div className="space-y-4 p-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold">{t("rhAbas.meusCustos.titulo")} <SeloExemplo /></h1>
      <VisaoPessoaCusto pessoaId={minha.pessoaId} nome={minha.nome ?? ""} avulsos={meus} />
    </div>
  );
}
