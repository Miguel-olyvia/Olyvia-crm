import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Loader2, LogOut, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSupplierPortal } from "@/contexts/SupplierPortalContext";
import { isNoSupplierAccess, isSpFunctionMissing, spErrorMessage } from "@/lib/supplierPortal/spRpc";
import { SupplierDataForm } from "@/components/supplier-portal/SupplierDataForm";
import { useSpMySupplierData } from "@/components/supplier-portal/useSpMySupplierData";

interface SupplierConfirmDataModalProps {
  open: boolean;
}

/**
 * Passo obrigatório depois de definir a password: o fornecedor revê os dados
 * da empresa (pré-preenchidos com a ficha do CRM) e confirma. Ao gravar, a
 * ficha do fornecedor fica atualizada em todas as empresas ligadas.
 * Não fechável. Utilizadores de consulta nunca o veem (o servidor devolve
 * profile_confirmed=true); se mesmo assim vier can_edit=false, dispensa-se.
 */
export function SupplierConfirmDataModal({ open }: SupplierConfirmDataModalProps) {
  const { markProfileConfirmed, refresh } = useSupplierPortal();
  const { toast } = useToast();
  const { data, error, isLoading, isError, refetch, isFetching, invalidate } = useSpMySupplierData(open);
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  // Saída para não ficar preso se o servidor recusar ou falhar sempre (igual ao "Sair" do layout).
  const logout = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      navigate("/auth", { replace: true });
    }
  };

  // Casos em que o passo não se aplica: não bloquear o portal.
  const notApplicable = open && ((!!data && !data.can_edit) || (isError && isSpFunctionMissing(error)));
  useEffect(() => {
    if (notApplicable) markProfileConfirmed();
  }, [notApplicable, markProfileConfirmed]);

  useEffect(() => {
    if (open && isError && isNoSupplierAccess(error)) void refresh();
  }, [open, isError, error, refresh]);

  if (!open || notApplicable) return null;

  return (
    <Dialog open>
      <DialogContent
        className="sm:max-w-2xl max-h-[92dvh] overflow-y-auto"
        hideClose
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
            <DialogTitle>Confirme os seus dados</DialogTitle>
          </div>
          <DialogDescription>
            Reveja os dados da sua empresa e corrija o que for preciso. As empresas com que trabalha passam a usar
            estes dados nas encomendas.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="py-10 flex justify-center" role="status" aria-live="polite">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">A carregar os dados…</span>
          </div>
        )}

        {isError && !isNoSupplierAccess(error) && (
          <div className="py-6 text-center space-y-3" role="alert">
            <p className="text-sm text-destructive">{spErrorMessage(error)}</p>
            <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
              Tentar de novo
            </Button>
          </div>
        )}

        {data && data.can_edit && (
          <SupplierDataForm
            initial={data}
            idPrefix="sp-confirm-data"
            submitLabel="Confirmar dados"
            onSaved={() => {
              toast({ title: "Dados confirmados", description: "Obrigado. Os dados da sua empresa estão atualizados." });
              void invalidate();
              markProfileConfirmed();
            }}
            onNoAccess={() => void refresh()}
          />
        )}

        <div className="flex justify-center border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            className="h-11 min-w-11 gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => void logout()}
            disabled={signingOut}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sair
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
