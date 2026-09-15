/**
 * Assiduidade e Ausencias -- ecra de topo que junta dois itens de menu que
 * ate agora eram separados:
 *   - "Ausencias" -- o ecra ja fundido `AusenciasGestao` (separadores
 *     "Aprovacoes"/"Organizacao" por permissao, nao tocados aqui).
 *   - "Mapa de assiduidade" -- o ecra `AssiduidadeOrganizacao`
 *     (separadores internos "Mapa do mes"/"Fila de trabalho", tambem nao
 *     tocados).
 *
 * Este ecra so acrescenta um NIVEL DE CIMA: o separador de dominio. Os dois
 * componentes existentes entram como conteudo, tal como ja funcionavam --
 * cada um continua a gerir a sua propria navegacao interna
 * (`?tab=`/`?subtab=` dentro de AusenciasGestao; nenhum parametro dentro de
 * AssiduidadeOrganizacao, que usa `Tabs` nao-controlado). O separador de
 * DOMINIO vive num parametro proprio, `?dominio=`, para nao colidir com
 * nenhum dos dois.
 *
 * Por omissao entra em "Ausencias" se a pessoa tiver alguma permissao desse
 * lado (aprovar OU ver a organizacao), senao em "Mapa de assiduidade" se
 * tiver `hr.assiduidade.view` -- a mesma logica de prioridade que
 * `AusenciasGestao` ja usa dentro do seu proprio nivel, aplicada agora
 * tambem aqui.
 */
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import AusenciasGestao from "@/pages/AusenciasGestao";
import AssiduidadeOrganizacao from "@/pages/AssiduidadeOrganizacao";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";

const DOMINIO_AUSENCIAS = "ausencias";
const DOMINIO_ASSIDUIDADE = "assiduidade";

export default function AssiduidadeEAusencias() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasAnyPermission, hasPermission, loading: permissionsLoading } = usePermissions();

  const podeAusencias = hasAnyPermission([
    "hr.ausencias.view",
    "hr.ausencias.aprovar.chefia",
    "hr.ausencias.aprovar.rh",
  ]);
  const podeAssiduidade = hasPermission("hr.assiduidade.view");

  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (!podeAusencias && !podeAssiduidade) return <SemAcessoCard className="m-6" />;

  const dominioPedido = searchParams.get("dominio");
  const dominioPedidoPermitido =
    (dominioPedido === DOMINIO_AUSENCIAS && podeAusencias) ||
    (dominioPedido === DOMINIO_ASSIDUIDADE && podeAssiduidade);
  const activeDominio = dominioPedidoPermitido
    ? dominioPedido
    : podeAusencias
      ? DOMINIO_AUSENCIAS
      : DOMINIO_ASSIDUIDADE;

  const mudarDominio = (valor: string) =>
    setSearchParams(
      (anterior) => {
        const proximos = new URLSearchParams(anterior);
        proximos.set("dominio", valor);
        return proximos;
      },
      { replace: true },
    );

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">{t("hr.assiduidadeEAusencias.titulo")}</h1>
      </div>

      <Tabs value={activeDominio} onValueChange={mudarDominio} className="space-y-4">
        <TabsList>
          {podeAusencias && (
            <TabsTrigger value={DOMINIO_AUSENCIAS}>
              {t("hr.assiduidadeEAusencias.tabAusencias")}
            </TabsTrigger>
          )}
          {podeAssiduidade && (
            <TabsTrigger value={DOMINIO_ASSIDUIDADE}>
              {t("hr.assiduidadeEAusencias.tabAssiduidade")}
            </TabsTrigger>
          )}
        </TabsList>

        {podeAusencias && (
          <TabsContent value={DOMINIO_AUSENCIAS} className="-mx-6 -mt-4">
            <AusenciasGestao />
          </TabsContent>
        )}

        {podeAssiduidade && (
          <TabsContent value={DOMINIO_ASSIDUIDADE} className="-mx-6 -mt-4">
            <AssiduidadeOrganizacao />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
