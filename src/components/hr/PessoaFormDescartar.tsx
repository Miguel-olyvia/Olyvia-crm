/**
 * A confirmacao de descartar o rascunho de "Nova pessoa" (fechar com dados, ou
 * com ficheiros escolhidos, pede confirmacao: um Escape distraido nao pode
 * apagar tudo em silencio).
 *
 * Extraida de `PessoaFormDialog` (que passava das 800 linhas): so apresentacao.
 */
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
import { useTranslation } from "@/hooks/useTranslation";

interface PessoaFormDescartarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDescartar: () => void;
}

export function PessoaFormDescartar({ open, onOpenChange, onDescartar }: PessoaFormDescartarProps) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("hr.form.descartar.titulo")}</AlertDialogTitle>
          <AlertDialogDescription>{t("hr.form.descartar.descricao")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("hr.form.descartar.continuar")}</AlertDialogCancel>
          <AlertDialogAction onClick={onDescartar}>{t("hr.form.descartar.confirmar")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
