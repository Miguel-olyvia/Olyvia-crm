// O painel lateral das duas fichas (utilizador e role): metade do ecrã (mínimo 640 px; em ecrã estreito, todo).
// Fica com o último conteúdo enquanto fecha, para o painel não deslizar vazio, e devolve o foco a quem o abriu.
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface FichaLateralProps {
  aberto: boolean;
  aoFechar: () => void;
  children: ReactNode;
}

export function FichaLateral({ aberto, aoFechar, children }: FichaLateralProps) {
  const [origem] = useState<{ el: HTMLElement | null }>({ el: null });
  return (
    <Sheet open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:w-1/2 sm:min-w-[640px] sm:max-w-none motion-reduce:!animate-none [&>button:last-child]:hidden"
        onOpenAutoFocus={(e) => {
          origem.el = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          e.preventDefault();
          document.querySelector<HTMLElement>('[role="dialog"] h2')?.focus();
        }}
        onCloseAutoFocus={(e) => {
          const alvo = origem.el && origem.el.isConnected ? origem.el : document.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
          if (!alvo) return;
          e.preventDefault();
          alvo.focus();
        }}
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}
