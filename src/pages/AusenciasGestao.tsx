/**
 * Ausencias -- ecra unico de gestao, com dois separadores por PERMISSAO.
 *
 * Antes havia dois itens de menu separados ("Aprovacoes" e "Ausencias da
 * organizacao"), que pareciam dois modulos quando sao o mesmo dominio --
 * so com autorizacoes diferentes por accao:
 *   - "Aprovacoes": quem tem `hr.ausencias.aprovar.chefia` OU
 *     `hr.ausencias.aprovar.rh` (chefia e RH, no MESMO ecra -- ver
 *     `AprovacoesConteudo` em `AusenciasAprovacoes.tsx`).
 *   - "Organizacao": quem tem `hr.ausencias.view`.
 *
 * As permissoes por separador NAO MUDAM aqui -- e so reorganizacao visual.
 * `ProtectedRoute` ja bloqueia quem nao tem nenhuma das tres antes disto
 * renderizar; o `SemAcessoCard` abaixo e so defesa a mais (nunca devia
 * aparecer na pratica).
 *
 * O separador activo vive na URL (`?tab=aprovacoes` / `?tab=organizacao`),
 * para que um link directo continue a funcionar e o botao de recuar do
 * browser va para o separador anterior. Por omissao entra em "Aprovacoes"
 * se a pessoa tiver essa permissao (e a accao mais urgente), senao em
 * "Organizacao".
 */
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import { AprovacoesConteudo } from "@/pages/AusenciasAprovacoes";
import { OrganizacaoConteudo } from "@/pages/AusenciasOrganizacao";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";

const TAB_APROVACOES = "aprovacoes";
const TAB_ORGANIZACAO = "organizacao";

export default function AusenciasGestao() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasAnyPermission, hasPermission, loading: permissionsLoading } = usePermissions();

  const podeAprovar = hasAnyPermission([
    "hr.ausencias.aprovar.chefia",
    "hr.ausencias.aprovar.rh",
  ]);
  const podeOrganizacao = hasPermission("hr.ausencias.view");

  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (!podeAprovar && !podeOrganizacao) return <SemAcessoCard className="m-6" />;

  const tabPedido = searchParams.get("tab");
  const tabPedidoPermitido =
    (tabPedido === TAB_APROVACOES && podeAprovar) ||
    (tabPedido === TAB_ORGANIZACAO && podeOrganizacao);
  const activeTab = tabPedidoPermitido ? tabPedido : podeAprovar ? TAB_APROVACOES : TAB_ORGANIZACAO;

  const mudarTab = (valor: string) =>
    setSearchParams(
      (anterior) => {
        const proximos = new URLSearchParams(anterior);
        proximos.set("tab", valor);
        return proximos;
      },
      { replace: true },
    );

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">{t("hr.ausencias.gestao.titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("hr.ausencias.gestao.descricao")}</p>
      </div>

      <Tabs value={activeTab} onValueChange={mudarTab} className="space-y-4">
        <TabsList>
          {podeAprovar && (
            <TabsTrigger value={TAB_APROVACOES}>
              {t("hr.ausencias.gestao.tabAprovacoes")}
            </TabsTrigger>
          )}
          {podeOrganizacao && (
            <TabsTrigger value={TAB_ORGANIZACAO}>
              {t("hr.ausencias.gestao.tabOrganizacao")}
            </TabsTrigger>
          )}
        </TabsList>

        {podeAprovar && (
          <TabsContent value={TAB_APROVACOES}>
            <AprovacoesConteudo tabParam="subtab" />
          </TabsContent>
        )}

        {podeOrganizacao && (
          <TabsContent value={TAB_ORGANIZACAO}>
            <OrganizacaoConteudo tabParam="subtab" />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
