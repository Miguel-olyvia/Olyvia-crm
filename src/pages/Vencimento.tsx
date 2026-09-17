/**
 * "Processamento Salarial" (nome de apresentacao; dominio interno continua
 * "vencimento" -- ficheiro, permissoes hr.vencimento.* e hooks nao mudam de
 * nome, so o titulo do ecra e o texto do menu, 20260917) e o dominio, nao so
 * a configuracao. Antes disto, o item de menu levava direito a
 * `ConfiguracaoVencimento.tsx` (20261201180000..20261201200000) -- so os
 * codigos de processamento e a regra do subsidio de alimentacao.
 * Estruturalmente errado: este e o ecra principal, e a configuracao e so UMA
 * PARTE dele.
 *
 * Dois separadores: "Visao geral" (FASE 1 do ciclo de vida do periodo --
 * abrir/fechar, resumo por pessoa e lancamentos pontuais; o recibo em si e a
 * exportacao ficam para a FASE 2, ver `ProcessamentoVisaoGeralTab.tsx`) e
 * "Configuracao" (o ecra antigo, importado tal como estava, sem duplicar
 * logica nenhuma -- a gestao de permissoes por seccao continua dentro de
 * `ConfiguracaoVencimento`).
 *
 * O separador activo fica na URL (`?tab=`), tal como
 * `AusenciasOrganizacao.tsx` -- assim um link directo para a configuracao
 * pode continuar a apontar para aqui com o separador certo aberto.
 */
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import { ProcessamentoVisaoGeralTab } from "@/components/hr/processamento/ProcessamentoVisaoGeralTab";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import ConfiguracaoVencimento from "./ConfiguracaoVencimento";

const ABA_PARAM = "tab";
const ABA_OMISSAO = "visao-geral";

export default function Vencimento() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();

  const podeVerCodigos = hasPermission("hr.vencimento.codigos.view");
  const podeVerSubsidio = hasPermission("hr.vencimento.subsidio.view");
  const podeVerPeriodo = hasPermission("hr.processamento.periodo.view");

  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (!podeVerCodigos && !podeVerSubsidio && !podeVerPeriodo) return <SemAcessoCard className="m-6" />;

  const abaActiva = searchParams.get(ABA_PARAM) || ABA_OMISSAO;

  const mudarAba = (valor: string) =>
    setSearchParams((anterior) => {
      const proximos = new URLSearchParams(anterior);
      proximos.set(ABA_PARAM, valor);
      return proximos;
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("hr.vencimento.tituloPagina")}</h1>
        <p className="text-muted-foreground">{t("hr.vencimento.subtituloPagina")}</p>
      </div>

      <Tabs value={abaActiva} onValueChange={mudarAba}>
        <TabsList>
          <TabsTrigger value="visao-geral">{t("hr.vencimento.abaVisaoGeral")}</TabsTrigger>
          <TabsTrigger value="configuracao">{t("hr.vencimento.abaConfiguracao")}</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="mt-4">
          <ProcessamentoVisaoGeralTab />
        </TabsContent>

        <TabsContent value="configuracao" className="mt-4">
          <ConfiguracaoVencimento />
        </TabsContent>
      </Tabs>
    </div>
  );
}
