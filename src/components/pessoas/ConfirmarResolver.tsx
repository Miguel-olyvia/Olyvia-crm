import { useRef } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PedidoResolver } from "./useResolucaoSubmissao";

interface ConfirmarResolverProps {
  pedido: PedidoResolver | null;
  aoConfirmar: () => void;
  aoCancelar: () => void;
  /** Corre quando o diálogo fecha: decide para onde vai o foco. */
  aoFechar: (e: Event) => void;
}

/** O único passo de confirmação: a ação não se desfaz neste ecrã. Guarda o último pedido para o texto não desaparecer na animação de saída. */
export function ConfirmarResolver({ pedido, aoConfirmar, aoCancelar, aoFechar }: ConfirmarResolverProps) {
  const { t } = useTranslation();
  const ultimo = useRef<PedidoResolver | null>(pedido);
  if (pedido) ultimo.current = pedido;
  const p = ultimo.current;
  const chave = p?.conflito ? "pessoasPagina.confirm.bodyConflict" : "pessoasPagina.confirm.body";
  return (
    <AlertDialog open={pedido !== null} onOpenChange={(aberto) => { if (!aberto) aoCancelar(); }}>
      <AlertDialogContent onCloseAutoFocus={aoFechar} className="motion-reduce:!animate-none motion-reduce:!duration-0">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("pessoasPagina.confirm.title", { name: p?.nome ?? "" })}</AlertDialogTitle>
          <AlertDialogDescription>{t(chave, { name: p?.nome ?? "" })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">{t("pessoasPagina.confirm.cancel")}</AlertDialogCancel>
          <AlertDialogAction className="min-h-11" onClick={aoConfirmar}>{t("pessoasPagina.confirm.ok")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
