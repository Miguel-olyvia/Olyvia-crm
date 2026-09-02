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
import { AlertTriangle } from "lucide-react";

/**
 * Confirmação ao guardar um documento sem template escolhido.
 *
 * Sem template não há layout por omissão: `fetchDefaultQuotePdfTemplate` cai no
 * primeiro template activo da organização por ordem alfabética. Foi assim que a
 * proposta P-2026-0616 saiu em PDF com a palavra "Orçamento" no título e o
 * layout de casa de banho, escolhido só por ser o primeiro por ordem alfabética.
 *
 * Avisa e deixa seguir — não bloqueia. A decisão é de quem está a guardar.
 */
export type MissingTemplateKind = "quote" | "proposal" | "contract";

const COPY: Record<MissingTemplateKind, { documento: string; oQueFalta: string }> = {
  quote: { documento: "Este orçamento", oQueFalta: "template" },
  proposal: { documento: "Esta proposta", oQueFalta: "template" },
  contract: { documento: "Este contrato", oQueFalta: "minuta" },
};

interface Props {
  open: boolean;
  kind: MissingTemplateKind;
  /** Fechar sem guardar — volta ao formulário para escolher. */
  onCancel: () => void;
  /** Guardar mesmo assim. */
  onConfirm: () => void;
}

export function MissingTemplateDialog({ open, kind, onCancel, onConfirm }: Props) {
  const { documento, oQueFalta } = COPY[kind];

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Sem {oQueFalta}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {documento} não tem {oQueFalta}. Deseja guardar assim?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Escolher {oQueFalta}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Guardar assim</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
