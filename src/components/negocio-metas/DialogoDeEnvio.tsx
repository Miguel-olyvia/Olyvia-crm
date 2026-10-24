// A casca dos diálogos do negócio que esperam pela base (perder, anular a perda, dar como ganho): título e descrição, o corpo, a região
// «A guardar…» sempre montada (para o leitor de ecrã a anunciar) e o erro em role="alert" DENTRO do diálogo (o toast e a região da ficha
// ficam fora do modal e o leitor de ecrã não os lê). Enquanto guarda, nem o Esc, nem o clique fora, nem «Cancelar», nem «Fechar» fecham: a
// gravação já seguiu. O «Fechar» é o nosso (traduzido, de 44 px, aria-disabled a guardar) e não o do componente partilhado `ui/dialog.tsx`
// (em inglês, de 16 px, sempre ativo), que aqui se esconde com `hideClose`.
//
// Foco: o diálogo não tem `DialogTrigger`, por isso o Radix não devolve o foco a lado nenhum (caía no corpo da página). Cancelar, Esc ou Fechar
// devolvem-no a quem abriu o diálogo. Depois de gravar não: o botão que o abriu desaparece (o negócio mudou de estado) e o foco fica onde quem
// monta o pôs (o título do detalhe).
import { X } from "lucide-react";
import { useEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO, PISTA_DESATIVADO } from "./estilos";
import { useAoNegocioIndisponivel } from "./useAoNegocioIndisponivel";
import { useEnvioAssincrono, type EnvioAssincrono } from "./useEnvioAssincrono";

const CHAVE_A_GUARDAR = "pessoasPagina.neg.saving";

/** O erro de uma gravação, traduzido pela chave, numa região de alerta. Sem erro não desenha nada. */
export function ErroDeEnvio({ chave }: { chave: string | null }) {
  const { t } = useTranslation();
  if (chave === null) return null;
  return <p role="alert" className="text-sm font-medium text-destructive">{t(chave)}</p>;
}

interface CorpoProps {
  ocupado: MutableRefObject<boolean>;
  /** Passa a true quando a gravação acabou bem: o foco já não volta a quem abriu o diálogo. */
  concluiu: MutableRefObject<boolean>;
  aoFechar: () => void;
  children: (envio: EnvioAssincrono) => ReactNode;
}

/** Tem o estado da gravação: monta-se de novo a cada abertura (o conteúdo do diálogo desmonta ao fechar), por isso começa sempre limpo. */
function Corpo({ ocupado, concluiu, aoFechar, children }: CorpoProps) {
  const { t } = useTranslation();
  // NG001 (o negócio já não existe): o diálogo fecha-se e volta-se à ficha, com o aviso por toast e por anúncio.
  const envio = useEnvioAssincrono(useAoNegocioIndisponivel(aoFechar));
  useEffect(() => {
    ocupado.current = envio.aGuardar;
  }, [ocupado, envio.aGuardar]);
  const enviar: EnvioAssincrono["enviar"] = (acao, aoOk) => envio.enviar(acao, () => { aoOk(); concluiu.current = true; });
  return (
    <>
      {children({ ...envio, enviar })}
      <Button
        type="button" variant="ghost" size="icon" aria-label={t("businessGoals.new.close")} aria-disabled={envio.aGuardar || undefined}
        className={cn("absolute right-2 top-2 h-11 w-11", FOCO, PISTA_DESATIVADO)} onClick={() => { if (!envio.aGuardar) aoFechar(); }}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
      <p role="status" aria-live="polite" className="sr-only">{envio.aGuardar ? t(CHAVE_A_GUARDAR) : ""}</p>
    </>
  );
}

interface DialogoDeEnvioProps {
  aberto: boolean;
  titulo: string;
  descricao: string;
  aoFechar: () => void;
  /** O corpo: recebe o estado da gravação (a guardar e erro) e a função que a corre. */
  children: (envio: EnvioAssincrono) => ReactNode;
}

export function DialogoDeEnvio({ aberto, titulo, descricao, aoFechar, children }: DialogoDeEnvioProps) {
  const ocupado = useRef(false);
  const concluiu = useRef(false);
  const abridor = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={aberto} onOpenChange={(abrir) => { if (!abrir && !ocupado.current) aoFechar(); }}>
      <DialogContent
        hideClose className="motion-reduce:!animate-none"
        // Ao abrir, ainda antes de o foco entrar no diálogo, guarda-se quem o abriu.
        onOpenAutoFocus={() => { concluiu.current = false; abridor.current = document.activeElement as HTMLElement | null; }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (concluiu.current) { concluiu.current = false; return; }
          const quem = abridor.current;
          if (quem && quem.isConnected) quem.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <Corpo ocupado={ocupado} concluiu={concluiu} aoFechar={aoFechar}>{children}</Corpo>
      </DialogContent>
    </Dialog>
  );
}
