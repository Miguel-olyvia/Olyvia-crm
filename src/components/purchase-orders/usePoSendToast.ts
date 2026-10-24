import { useToast } from "@/hooks/use-toast";
import type { PoSendResult } from "@/components/purchase-orders/poSupplierPortalApi";

/** Toasts do resultado de "Encomendar" (contrato-f32 5.2.1). Avisos não são erros. */
export function usePoSendToast() {
  const { toast } = useToast();
  return (res: PoSendResult) => {
    if (res.already_published) {
      toast({ title: "A encomenda já estava no portal do fornecedor" });
    } else if (res.published) {
      toast({
        title: "Encomenda enviada ao fornecedor pelo portal",
        description:
          res.emails_queued === 1 ? "1 email posto na fila." : `${res.emails_queued} emails postos na fila.`,
      });
    } else {
      toast({
        title: "Encomenda marcada como encomendada",
        description: "Este fornecedor não tem portal: envie-lhe o PDF como habitualmente.",
      });
    }
    if (res.warning === "no_portal_users") {
      toast({
        title: "Aviso: ninguém recebe o email",
        description: "A encomenda está no portal, mas o fornecedor não tem utilizadores ativos com acesso a esta empresa.",
      });
    } else if (res.warning === "no_smtp") {
      toast({
        title: "Aviso: email não configurado",
        description:
          "A encomenda está no portal, mas não há SMTP ativo (seu nem da organização): o email ao fornecedor vai falhar.",
      });
    }
  };
}
