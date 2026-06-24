import { useState } from "react";
import Layout from "@/components/Layout";
import { SupportAccessRequests } from "@/components/platform/SupportAccessRequests";
import { SupportAccessModal } from "@/components/platform/SupportAccessModal";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/contexts/CompanyContext";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Plus } from "lucide-react";

export default function SupportAccess() {
  const { isSystemAdmin, loading: permissionsLoading } = usePermissions();
  const { isLoading: companyLoading } = useCompany();
  const [modalOpen, setModalOpen] = useState(false);

  const isLoading = permissionsLoading || companyLoading;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <OlyviaLoader />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Acesso de Suporte</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isSystemAdmin
                ? "Gere os pedidos de acesso temporário a organizações para fins de suporte."
                : "Pedidos de acesso de suporte à sua organização."}
            </p>
          </div>
          {isSystemAdmin && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Pedido
            </Button>
          )}
        </div>

        <SupportAccessRequests />

        {isSystemAdmin && (
          <SupportAccessModal open={modalOpen} onOpenChange={setModalOpen} />
        )}
      </div>
    </Layout>
  );
}
