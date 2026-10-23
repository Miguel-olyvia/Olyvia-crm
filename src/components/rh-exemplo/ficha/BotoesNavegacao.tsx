// Anterior, "n de N", seguinte e Fechar (44 px), à direita do cabeçalho da ficha. Os botões respondem também a [ e ].
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { TeclaNavegacao, Vizinhas } from "./navegacao";

interface BotoesNavegacaoProps {
  vizinhas: Vizinhas;
  /** Passa à pessoa `id`; `qual` diz que botão (ou tecla) foi usado, para o foco voltar a ele. */
  aoIr: (id: string, qual: TeclaNavegacao) => void;
}

const BOTAO = cn("h-11 w-11 shrink-0 p-0", FOCO);

export function BotoesNavegacao({ vizinhas: v, aoIr }: BotoesNavegacaoProps) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("rhForm.nav.label")} className="ml-auto flex shrink-0 items-center gap-1">
      <Button
        type="button" variant="ghost" data-seta="anterior" disabled={v.anterior === null} className={BOTAO}
        aria-label={t("rhForm.nav.prev")} aria-keyshortcuts="[" title={t("rhForm.nav.hint")}
        onClick={() => v.anterior && aoIr(v.anterior, "anterior")}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span className="min-w-14 shrink-0 whitespace-nowrap px-1 text-center text-sm tabular-nums text-muted-foreground">
        {v.posicao > 0
          ? t("rhForm.nav.position", { n: v.posicao, total: v.total })
          : <span className="sr-only">{t("rhForm.nav.positionNone")}</span>}
      </span>
      <Button
        type="button" variant="ghost" data-seta="seguinte" disabled={v.seguinte === null} className={BOTAO}
        aria-label={t("rhForm.nav.next")} aria-keyshortcuts="]" title={t("rhForm.nav.hint")}
        onClick={() => v.seguinte && aoIr(v.seguinte, "seguinte")}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
      <SheetClose asChild>
        <Button type="button" variant="ghost" className={BOTAO} aria-label={t("rhForm.nav.close")}>
          <X aria-hidden="true" />
        </Button>
      </SheetClose>
    </div>
  );
}
