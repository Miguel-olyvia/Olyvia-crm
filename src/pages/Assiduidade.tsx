/**
 * "O meu ponto" -- o ecra que quase toda a gente ve, e para muitos o unico.
 *
 * Abre SEMPRE na ficha ligada a conta de quem esta a usar a aplicacao. Sem
 * ficha de RH nao e um erro: e um estado vazio proprio, que diz porque e que
 * nao ha nada e a quem falar.
 *
 * Quem tem `hr.assiduidade.picar` ve o botao de picar; quem nao tem ve o mes
 * em leitura -- e isso e legitimo para quem pica no quiosque e so quer
 * conferir.
 *
 * O conteudo e O MESMO componente do separador da ficha: sao a mesma coisa
 * vista de dois sitios, e duas copias divergiriam ao segundo ajuste.
 */
import { Card, CardContent } from "@/components/ui/card";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { PessoaAssiduidadeTab } from "@/components/hr/PessoaAssiduidadeTab";
import { useCompany } from "@/contexts/CompanyContext";
import { useMinhaPessoa } from "@/hooks/useMinhaPessoa";
import { usePermissoesAssiduidade } from "@/hooks/usePermissoesAssiduidade";
import { useTranslation } from "@/hooks/useTranslation";

export default function Assiduidade() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { permissoes, loading: permissoesALoad } = usePermissoesAssiduidade();
  const minha = useMinhaPessoa();

  // Nunca decidir o que mostrar com as permissoes ainda a carregar: o ecra
  // piscava entre "sem acesso" e o conteudo.
  if (companyLoading || permissoesALoad || minha.loading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;

  if (minha.semFicha || !minha.pessoaId) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-xl font-semibold">{t("hr.assiduidade.meuPonto.titulo")}</h1>
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {t("hr.assiduidade.meuPonto.semFicha")}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">{t("hr.assiduidade.meuPonto.titulo")}</h1>
      <PessoaAssiduidadeTab
        pessoaId={minha.pessoaId}
        pessoaNome={minha.nome ?? t("hr.assiduidade.meuPonto.eu")}
        souAPessoa
        permissoes={permissoes}
      />
    </div>
  );
}
