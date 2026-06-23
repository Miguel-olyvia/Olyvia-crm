import Layout from "@/components/Layout";
import { ExportAuditLog } from "@/components/audit/ExportAuditLog";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/contexts/CompanyContext";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";

export default function ExportAudit() {
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  const isLoading = companyLoading || permissionsLoading;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <OlyviaLoader />
        </div>
      </Layout>
    );
  }

  if (!activeCompany) {
    return (
      <Layout>
        <NoOrganizationState />
      </Layout>
    );
  }

  if (!hasPermission("exports.audit.view")) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">
          <p className="text-sm">Não tem permissão para consultar este registo.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Auditoria de Exportações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Consulta o histórico de exportações de dados sensíveis da organização.
          </p>
        </div>
        <ExportAuditLog />
      </div>
    </Layout>
  );
}
