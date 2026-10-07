import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { poPortalErrorMessage, poSendToSupplier, type PoSendResult } from "@/components/purchase-orders/poSupplierPortalApi";
import { usePoSendToast } from "@/components/purchase-orders/usePoSendToast";

interface Props {
  orderId: string;
  orderNumber: string;
  supplierName?: string | null;
  /** Depois de encomendar (recarregar a lista / estado). */
  onDone: (res: PoSendResult) => void;
  variant?: "icon" | "button";
  /** Texto extra no diálogo (ex.: alterações por gravar no formulário). */
  extraWarning?: string | null;
  /** Bloqueia o botão (ex.: formulário com alterações por gravar). */
  disabled?: boolean;
  /** Dica do botão bloqueado (title/aria). */
  disabledHint?: string | null;
}

/**
 * "Encomendar": rpc_po_send_to_supplier (pending → ordered; com portal, publica
 * e envia email). Quem usa deve mostrar só com purchase_orders.approve.
 */
export function PoSendToSupplierButton({
  orderId,
  orderNumber,
  supplierName,
  onDone,
  variant = "icon",
  extraWarning,
  disabled = false,
  disabledHint,
}: Props) {
  const { toast } = useToast();
  const showResult = usePoSendToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const res = await poSendToSupplier(orderId);
      setConfirmOpen(false);
      showResult(res);
      onDone(res);
    } catch (err) {
      toast({ title: "Não foi possível encomendar", description: poPortalErrorMessage(err), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {variant === "icon" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setConfirmOpen(true)}
          title={disabled && disabledHint ? disabledHint : "Encomendar"}
          aria-label={`Encomendar ${orderNumber}`}
          disabled={sending || disabled}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={sending || disabled}
          title={disabled && disabledHint ? disabledHint : undefined}
          className="gap-2"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Encomendar
        </Button>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !sending && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encomendar {orderNumber}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  A encomenda passa a <strong>Encomendado</strong>
                  {supplierName ? ` a ${supplierName}` : ""}. Se o fornecedor tiver acesso ao portal, recebe-a no portal e
                  por email, e as linhas deixam de poder ser alteradas até a retirar.
                </p>
                {extraWarning && <p className="text-amber-700 dark:text-amber-400">{extraWarning}</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending}
              onClick={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {sending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Encomendar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
