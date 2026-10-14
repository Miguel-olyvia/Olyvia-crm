// O painel lateral dos dois formulários, no estilo de "Novo negócio": cabeçalho com migalhas, título e selo, aviso de que é
// só exemplo, e (nos filhos) rodapé fixo. Meio ecrã (mínimo 640 px; em ecrã estreito, todo). O foco inicial vai para o campo
// marcado com `data-foco-inicial`; Esc e Cancelar fecham e o foco volta a quem abriu. Com alterações por gravar, um clique
// fora não fecha (para não perder o que se escreveu).
import { useState, type ReactNode } from "react";
import { ChevronRight, Sparkles, X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FOCO } from "@/components/negocio-metas/estilos";

interface PainelFormularioProps {
  aberto: boolean;
  aoFechar: () => void;
  /** A migalha anterior ("Utilizadores e perfis"). */
  pai: string;
  titulo: string;
  selo: string;
  /** Enquanto houver alterações por gravar, clicar fora não fecha. */
  sujo: boolean;
  children: ReactNode;
}

/** Migalhas, título, selo e Fechar, mais o aviso de que é só exemplo. */
function CabecalhoPainel({ pai, titulo, selo }: { pai: string; titulo: string; selo: string }) {
  const { t } = useTranslation();
  return (
    <SheetHeader className="space-y-2 border-b border-border p-6 text-left">
      <div className="flex items-start justify-between gap-3">
        <nav aria-label={t("usersProfiles.form.breadcrumb")}>
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <li>{pai}</li>
            <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
            <li aria-current="page" className="font-medium text-foreground">{titulo}</li>
          </ol>
        </nav>
        <SheetClose asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={t("usersProfiles.form.close")} className={cn("-mr-2 -mt-2 h-11 w-11", FOCO)}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </SheetClose>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SheetTitle className="text-lg">{titulo}</SheetTitle>
        <span className="inline-flex items-center gap-1 rounded-sm border border-primary px-1.5 py-0.5 text-xs font-semibold text-primary dark:text-violet-300">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {selo}
        </span>
      </div>
      <SheetDescription>{t("usersProfiles.form.sample")}</SheetDescription>
    </SheetHeader>
  );
}

export function PainelFormulario({ aberto, aoFechar, pai, titulo, selo, sujo, children }: PainelFormularioProps) {
  const [origem] = useState<{ el: HTMLElement | null }>({ el: null });
  return (
    <Sheet open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:w-1/2 sm:min-w-[640px] sm:max-w-none motion-reduce:!animate-none [&>button:last-child]:hidden"
        onOpenAutoFocus={(e) => {
          origem.el = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          e.preventDefault();
          const alvo = document.querySelector<HTMLElement>('[role="dialog"] [data-foco-inicial]') ?? document.querySelector<HTMLElement>('[role="dialog"] h2');
          alvo?.focus();
        }}
        onInteractOutside={(e) => { if (sujo) e.preventDefault(); }}
        onCloseAutoFocus={(e) => {
          const alvo = origem.el && origem.el.isConnected ? origem.el : document.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
          if (!alvo) return;
          e.preventDefault();
          alvo.focus();
        }}
      >
        <CabecalhoPainel pai={pai} titulo={titulo} selo={selo} />
        {children}
      </SheetContent>
    </Sheet>
  );
}
