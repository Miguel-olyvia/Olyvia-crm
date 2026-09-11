import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import ItemSuppliersTable from "@/components/inventory/ItemSuppliersTable";

interface ServiceSuppliersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceId: string;
  serviceName: string;
  organizationId: string;
}

// Serviços não têm stock físico — só o sub-painel "Fornecedores deste
// serviço" (secção 4 do plano de fornecedores múltiplos), sem as tabs de
// stock que o equivalente em Products.tsx tem.
export default function ServiceSuppliersDialog({ open, onOpenChange, serviceId, serviceName, organizationId }: ServiceSuppliersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{serviceName}</DialogTitle>
          <DialogDescription>Fornecedores deste serviço</DialogDescription>
        </DialogHeader>
        <ItemSuppliersTable itemType="service" itemId={serviceId} organizationId={organizationId} />
      </DialogContent>
    </Dialog>
  );
}
