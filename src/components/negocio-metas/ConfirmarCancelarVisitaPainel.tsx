import { useRef } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { N } from "./PecasNovoNegocio";
import { FOCO } from "./estilos";
import { formatarData } from "./negocioPainel";

const BOTAO = cn("min-h-11", FOCO);

/** A visita que se vai cancelar: o id e o dia (AAAA-MM-DD; vazio sem dia). */
export interface PedidoCancelarVisita {
  id: string;
  data: string;
}

interface Props {
  pedido: PedidoCancelarVisita | null;
  /** Marca a visita como cancelada no painel (a base só a cancela quando o painel guarda). */
  aoConfirmar: (id: string) => void;
  aoFechar: () => void;
  /**
   * Depois de confirmar, o botão que abriu a confirmação já não existe (a visita ficou só para ler) e o Radix não tem para onde devolver o foco:
   * quem usa diz onde o pôr. Com «Voltar» o foco volta ao botão, como sempre.
   */
  aoDevolverFocoDepoisDeConfirmar?: (id: string) => void;
}

/**
 * «Cancelar visita» de uma visita que já existe na base, no painel «Visita e levantamento»: pede confirmação antes de a marcar como cancelada.
 * É local ao painel (a base cancela quando o painel guarda), por isso não espera por nada: confirma e fecha.
 */
export function ConfirmarCancelarVisitaPainel({ pedido, aoConfirmar, aoFechar, aoDevolverFocoDepoisDeConfirmar }: Props) {
  const { t } = useTranslation();
  const confirmada = useRef<string | null>(null);
  // O último pedido, para o texto não desaparecer na animação de saída.
  const ultimo = useRef<PedidoCancelarVisita | null>(pedido);
  if (pedido) ultimo.current = pedido;
  const p = ultimo.current;
  const dia = p ? formatarData(p.data) || t(`${N}visits.noDate`) : "";
  return (
    <AlertDialog open={pedido !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <AlertDialogContent
        className="motion-reduce:!animate-none motion-reduce:!duration-0"
        onCloseAutoFocus={(e) => {
          const id = confirmada.current;
          confirmada.current = null;
          if (id === null || !aoDevolverFocoDepoisDeConfirmar) return;
          e.preventDefault();
          aoDevolverFocoDepoisDeConfirmar(id);
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t(`${N}visits.cancel.title`)}</AlertDialogTitle>
          <AlertDialogDescription>{t(`${N}visits.cancel.description`, { data: dia })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={BOTAO}>{t(`${N}visits.cancel.back`)}</AlertDialogCancel>
          <AlertDialogAction className={BOTAO} onClick={() => { if (p) { confirmada.current = p.id; aoConfirmar(p.id); } }}>{t(`${N}visits.cancel.confirm`)}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
