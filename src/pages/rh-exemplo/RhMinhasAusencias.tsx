/**
 * "As minhas ausencias" -- o ecra que quase toda a organizacao ve.
 *
 * O EIXO DO MENU E A AUDIENCIA
 * ----------------------------
 * "As minhas ausencias" e "as ausencias de toda a gente" sao entradas
 * diferentes, com permissoes diferentes, como no Factorial. Este ecra abre
 * SEMPRE na ficha ligada a conta de quem esta a usar a aplicacao.
 *
 * SEM FICHA NAO E UM ERRO
 * -----------------------
 * Ha contas sem ficha de RH nenhuma. Quando e o caso, o que se mostra e um
 * estado vazio que explica porque -- e nao um ecra em branco nem um erro.
 *
 * O conteudo e o MESMO componente do separador da ficha: sao a mesma coisa
 * vista de dois sitios, e duas copias divergiriam ao segundo ajuste.
 */
import { useMemo } from "react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Card, CardContent } from "@/components/ui/card";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { PessoaAusenciasTab } from "@/components/rh-exemplo/PessoaAusenciasTab";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useMinhaPessoa } from "@/components/rh-exemplo/hooks/useMinhaPessoa";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import { usePessoas } from "@/components/rh-exemplo/hooks/usePessoas";
import { useTranslation } from "@/hooks/useTranslation";

export default function RhMinhasAusencias() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const minha = useMinhaPessoa();
  const { pessoas: colegas } = usePessoas();

  // Os mesmos dois nomes que a ficha dá à aba (useContextoFicha): quem aprova pela chefia, e quem decidiu cada passo do
  // histórico. Vêm de pessoas (reporta_a_pessoa_id e nome_completo), nunca em branco quando a pessoa existe.
  const nomePorPessoaId = useMemo(() => new Map(colegas.map((c) => [c.id, c.nome_completo])), [colegas]);
  const aprovadorChefiaNome = useMemo(() => {
    const chefiaId = colegas.find((c) => c.id === minha.pessoaId)?.reporta_a_pessoa_id ?? null;
    return chefiaId ? nomePorPessoaId.get(chefiaId) ?? null : null;
  }, [colegas, minha.pessoaId, nomePorPessoaId]);

  if (companyLoading || permissionsLoading || minha.loading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;

  if (minha.semFicha || !minha.pessoaId) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-xl font-semibold">{t("hr.ausencias.minhas.titulo")}</h1>
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {t("hr.ausencias.minhas.semFicha")}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">{t("hr.ausencias.minhas.titulo")}</h1>
      <PessoaAusenciasTab
        pessoaId={minha.pessoaId}
        pessoaNome={minha.nome ?? t("hr.ausencias.minhas.eu")}
        souAPessoa
        aprovadorChefiaNome={aprovadorChefiaNome}
        nomePorPessoaId={nomePorPessoaId}
        permissoes={{
          view: hasPermission("hr.ausencias.view"),
          pedir: hasPermission("hr.ausencias.pedir"),
          pedirOutros: false,
          aprovarChefia: false,
          aprovarRh: false,
          direitosView: hasPermission("hr.ausencias.direitos.view"),
          ajustar: false,
          historicoEditar: hasPermission("hr.ausencias.historico.editar"),
          justificacaoView: hasPermission("hr.ausencias.justificacao.view"),
        }}
      />
    </div>
  );
}
