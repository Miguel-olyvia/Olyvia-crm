/**
 * Confirmação antes de desligar um ativo da pessoa que o tem: «Desligar «Portátil 1» de Ana Silva?». Desligar não mexe na atribuição
 * do RH (valor, conta e estado ficam); só tira a ligação entre o ativo e essa atribuição, e pode refazer-se com «Ligar a pessoa».
 */
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { Ativo } from "./lib/tipos";

interface Props {
  ativo: Ativo | null;
  aoFechar: () => void;
  /** Ao fechar, devolve o foco a quem abriu (a página guarda a origem). */
  aoFecharFoco?: (e: Event) => void;
  aoConfirmar: (a: Ativo) => void;
}

export function DesligarPessoaDialog({ ativo, aoFechar, aoFecharFoco, aoConfirmar }: Props) {
  const { t } = useTranslation();
  const pessoa = ativo?.atribuicao?.pessoaNome ?? "";
  return (
    <AlertDialog open={ativo !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <AlertDialogContent onCloseAutoFocus={aoFecharFoco}>
        <AlertDialogHeader>
          <AlertDialogTitle>{ativo ? t("ativos.desligar.titulo", { nome: ativo.nome, pessoa }) : ""}</AlertDialogTitle>
          <AlertDialogDescription>{t("ativos.desligar.ajuda")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={cn("min-h-11", FOCO)}>{t("ativos.sheet.cancelar")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => ativo && aoConfirmar(ativo)} className={cn("min-h-11", FOCO)}>{t("ativos.desligar.confirmar")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
