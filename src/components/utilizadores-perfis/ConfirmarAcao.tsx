// Pergunta de confirmação (AlertDialog): Esc e "Cancelar" não fazem nada; só o botão de confirmar avança.
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FOCO } from "@/components/negocio-metas/estilos";

interface ConfirmarAcaoProps {
  aberto: boolean;
  titulo: string;
  texto: string;
  confirmar: string;
  /** Texto do botão que recusa; por omissão "Cancelar". */
  recusar?: string;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}

export function ConfirmarAcao({ aberto, titulo, texto, confirmar, recusar, aoConfirmar, aoCancelar }: ConfirmarAcaoProps) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={aberto} onOpenChange={(a) => { if (!a) aoCancelar(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{texto}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={cn("min-h-11", FOCO)}>{recusar ?? t("usersProfiles.form.confirm.cancel")}</AlertDialogCancel>
          <AlertDialogAction className={cn("min-h-11", FOCO)} onClick={aoConfirmar}>{confirmar}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
