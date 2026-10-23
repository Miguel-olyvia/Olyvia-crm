// «Cancelar visita»: a confirmação antes de cancelar. Assíncrona, como os outros diálogos que escrevem na base: só fecha (e avisa) quando a base
// respondeu bem, aguenta o duplo clique, não se deixa fechar a meio (Escape, «Voltar», clique fora) e um erro fica dentro do diálogo, traduzido,
// com a possibilidade de repetir. Cancelar não leva motivo: a função da base só pede a visita.
import { useRef, type MouseEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FOCO } from "@/components/negocio-metas/estilos";
import { ErroAcao } from "./ErroAcao";
import { focarLinhaVisita } from "./focoVisita";
import { useExecutarAcao } from "./useExecutarAcao";

const X = "pessoasPagina.real.visit.cancelar.";
const BOTAO = cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO);

/** A visita a cancelar e o texto que a identifica («terça-feira, 20/10/2026 · 10:00»). */
export interface PedidoCancelar {
  visitaId: string;
  nome: string;
  quando: string;
}

interface ConfirmarCancelarVisitaProps {
  pedido: PedidoCancelar | null;
  /** Cancela a visita na base; lança se falhar (o erro traz a chave a traduzir). */
  aoCancelar: (visitaId: string) => void | Promise<void>;
  aoFechar: () => void;
}

interface CorpoProps {
  pedido: PedidoCancelar;
  correr: (visitaId: string) => Promise<void>;
  aoConcluir: () => void;
  aoFechar: () => void;
}

/** O corpo vive dentro do diálogo: fechar o diálogo desmonta-o e o erro de uma tentativa não passa para a seguinte. */
function Corpo({ pedido, correr, aoConcluir, aoFechar }: CorpoProps) {
  const { t } = useTranslation();
  const acao = useExecutarAcao();
  const mensagem = t(`${X}done`, { name: pedido.nome });
  const confirmar = (e: MouseEvent) => {
    // O botão de ação do Radix fecha o diálogo sozinho: aqui só fecha quando a base respondeu bem.
    e.preventDefault();
    if (acao.aGuardar) return;
    acao.executar(() => correr(pedido.visitaId), () => {
      aoConcluir();
      toast.success(mensagem);
      aoFechar();
    }, mensagem);
  };
  const voltar = (e: MouseEvent) => {
    e.preventDefault();
    if (!acao.aGuardar) aoFechar();
  };
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{t(`${X}title`)}</AlertDialogTitle>
        <AlertDialogDescription>{t(`${X}description`, { name: pedido.nome, when: pedido.quando })}</AlertDialogDescription>
      </AlertDialogHeader>
      <ErroAcao chave={acao.erro} chaveExtra={acao.erroExtra} />
      <AlertDialogFooter>
        <AlertDialogCancel className={BOTAO} aria-disabled={acao.aGuardar || undefined} onClick={voltar}>{t(`${X}back`)}</AlertDialogCancel>
        <AlertDialogAction className={BOTAO} aria-disabled={acao.aGuardar || undefined} aria-busy={acao.aGuardar || undefined} onClick={confirmar}>
          {acao.aGuardar ? t("pessoasPagina.real.ficha.saving") : t(`${X}confirm`)}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}

export function ConfirmarCancelarVisita({ pedido, aoCancelar, aoFechar }: ConfirmarCancelarVisitaProps) {
  // O último pedido, para o texto não desaparecer na animação de saída.
  const ultimo = useRef<PedidoCancelar | null>(pedido);
  if (pedido) ultimo.current = pedido;
  const p = ultimo.current;
  // Há uma gravação em curso (lê-se no mesmo instante do clique, antes de qualquer render) e a visita ficou mesmo cancelada.
  const ocupado = useRef(false);
  const concluiu = useRef(false);
  const correr = async (visitaId: string): Promise<void> => {
    ocupado.current = true;
    try {
      await aoCancelar(visitaId);
    } finally {
      ocupado.current = false;
    }
  };
  return (
    <AlertDialog open={pedido !== null} onOpenChange={(aberto) => { if (!aberto && !ocupado.current) aoFechar(); }}>
      <AlertDialogContent
        className="motion-reduce:!animate-none motion-reduce:!duration-0"
        onEscapeKeyDown={(e) => { if (ocupado.current) e.preventDefault(); }}
        onCloseAutoFocus={(e) => {
          // Cancelada a visita, o botão que abriu o diálogo já não existe: o foco vai para a linha da visita.
          const feito = concluiu.current;
          concluiu.current = false;
          if (feito && p && focarLinhaVisita(p.visitaId)) e.preventDefault();
        }}
      >
        {p && <Corpo key={p.visitaId} pedido={p} correr={correr} aoConcluir={() => { concluiu.current = true; }} aoFechar={aoFechar} />}
      </AlertDialogContent>
    </AlertDialog>
  );
}
