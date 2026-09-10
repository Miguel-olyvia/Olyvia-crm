/**
 * "Os meus documentos" -- o ecra onde qualquer pessoa com ficha em RH ve e
 * assina os seus proprios documentos, sem precisar de `hr.pessoas.documentos.view`.
 *
 * Segue o MESMO padrao de `Ausencias.tsx`: abre sempre na ficha ligada a
 * conta de quem esta a usar a aplicacao, e o conteudo e o mesmo componente do
 * separador da ficha -- nao uma segunda copia que diverge ao primeiro ajuste.
 *
 * As permissoes de RH (`view`, `emitir`, `anular`, ...) vao explicitamente a
 * `false`: quem abre este ecra pode nao ter nenhuma delas, e ainda assim ve os
 * SEUS documentos por `souAPessoa` + `hr.pessoas.documentos.view.own`.
 */
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Card, CardContent } from "@/components/ui/card";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { PessoaDocumentosTab } from "@/components/hr/PessoaDocumentosTab";
import { useCompany } from "@/contexts/CompanyContext";
import { useMinhaPessoa } from "@/hooks/useMinhaPessoa";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";

export default function MeusDocumentosHR() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const minha = useMinhaPessoa();

  if (companyLoading || permissionsLoading || minha.loading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;

  if (minha.semFicha || !minha.pessoaId) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-xl font-semibold">{t("hr.documentos.minhas.titulo")}</h1>
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {t("hr.documentos.minhas.semFicha")}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">{t("hr.documentos.minhas.titulo")}</h1>
      <PessoaDocumentosTab
        pessoaId={minha.pessoaId}
        souAPessoa
        permissoes={{
          view: false,
          viewOwn: hasPermission("hr.pessoas.documentos.view.own"),
          edit: false,
          emitir: false,
          anular: false,
          conteudoView: false,
          modelosView: false,
        }}
      />
    </div>
  );
}
