// O diálogo de apoio da ficha real: um painel por cima da ficha (mesmo padrão do diálogo do resultado da visita, que já vive dentro do Sheet) onde abre,
// a pedido, o que já não está à vista: os registos e dados, as visitas, os negócios, as submissões e a atividade; e os detalhes do negócio aberto.
// Foco inicial no título; o Esc fecha só o diálogo (o Radix trata a camada de cima primeiro) e o foco volta ao botão que o abriu. Em ecrã estreito ocupa o ecrã todo.
import type { MutableRefObject, ReactNode, RefObject } from "react";
import { useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/negocio-metas/estilos";

interface FichaApoioDialogoProps {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  /** Uma linha por baixo do título (o nome da pessoa, ou o serviço do negócio). */
  descricao?: string;
  /** O botão a que o foco regressa ao fechar (guardado por quem abriu); se já não existe, deixa-se o foco por conta do Radix. */
  origem: MutableRefObject<HTMLElement | null>;
  /**
   * Um sítio para onde o foco vai ao fechar, em vez do botão que abriu o diálogo (por exemplo o título do negócio que o diálogo acabou de abrir):
   * se devolver um elemento, é ele o único dono do foco. Sem isto, ou sem elemento, vale `origem`.
   */
  destinoFoco?: () => HTMLElement | null;
  /** O título do diálogo, para quem precisa de lhe devolver o foco (o botão que estava lá dentro desapareceu). Sem isto o diálogo guarda o seu. */
  tituloRef?: RefObject<HTMLHeadingElement>;
  children: ReactNode;
}

export function FichaApoioDialogo({ aberto, aoFechar, titulo, descricao, origem, destinoFoco, tituloRef: tituloDeFora, children }: FichaApoioDialogoProps) {
  const { t } = useTranslation();
  const tituloProprio = useRef<HTMLHeadingElement>(null);
  const tituloRef = tituloDeFora ?? tituloProprio;
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      {/*
        O fundo e o conteúdo vão juntos no mesmo portal, ambos com o z-index 610 (por cima do conteúdo da página, onde a ficha real vive, e do painel lateral da ficha, Sheet): depois dele no documento, por isso ficam POR CIMA
        dele, e o fundo escurece a ficha. O `DialogContent` partilhado deixava o fundo a 600, por baixo do painel. Os diálogos que abrem a partir daqui
        (resultado da visita, confirmações) montam depois e ficam por cima.
      */}
      <DialogPortal>
        <DialogOverlay data-ficha-apoio-fundo="" className="z-[610]" />
        <DialogPrimitive.Content
          data-ficha-apoio=""
          className={cn(
            "fixed left-[50%] top-[50%] z-[610] flex translate-x-[-50%] translate-y-[-50%] flex-col gap-0 overflow-hidden border shadow-lg duration-200",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl rounded-xl border-border bg-background p-0",
            "max-sm:h-[100dvh] max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-none motion-reduce:!animate-none",
          )}
          onOpenAutoFocus={(e) => { e.preventDefault(); tituloRef.current?.focus(); }}
          onCloseAutoFocus={(e) => {
            const alvo = destinoFoco?.() ?? origem.current;
            if (!alvo || !alvo.isConnected) return;
            e.preventDefault();
            alvo.focus();
          }}
        >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <DialogHeader className="min-w-0 space-y-1 text-left">
            <DialogTitle ref={tituloRef} tabIndex={-1} className="break-words text-xl font-bold leading-tight outline-none">{titulo}</DialogTitle>
            {descricao ? <DialogDescription className="break-words text-base">{descricao}</DialogDescription> : <DialogDescription className="sr-only">{titulo}</DialogDescription>}
          </DialogHeader>
          <DialogClose asChild>
            <Button type="button" variant="ghost" className={cn("h-11 w-11 shrink-0 p-0", FOCO)} aria-label={t("pessoasPagina.apoio.fechar")}>
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
