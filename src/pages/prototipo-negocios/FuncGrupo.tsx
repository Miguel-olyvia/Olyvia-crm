// Peças comuns da V2 funcional: a lista recolhível do Hoje (o cabeçalho é um botão com aria-expanded, com a contagem) e a ajuda "Atalhos"
// (o diálogo com a lista das teclas e a dica discreta "Prima ? para ver atalhos").
import { useId, type ReactNode } from "react";
import { ChevronDown, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ATALHOS } from "./funcAtalhos";
import { SEM_ATALHOS } from "./useAtalhos";

interface GrupoProps {
  titulo: string;
  n: number;
  /** O que se diz com a lista vazia ("Nada por contactar hoje."). */
  vazio: string;
  aberto: boolean;
  alternar: () => void;
  /** Botões ao lado do título (por exemplo, ordenar). */
  extra?: ReactNode;
  children: ReactNode;
}

export function GrupoRecolhivel({ titulo, n, vazio, aberto, alternar, extra, children }: GrupoProps) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-t`} className="border-t border-border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-t`} className="min-w-0 flex-1 text-[16px] font-semibold">
          <button type="button" aria-expanded={aberto} aria-controls={`${id}-c`} onClick={alternar}
            className="flex min-h-11 w-full items-center gap-2 rounded-md px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform motion-reduce:transition-none", !aberto && "-rotate-90")} aria-hidden="true" />
            <span>{titulo}</span>
            <span className="tabular-nums font-normal text-muted-foreground">{n}</span>
          </button>
        </h2>
        {aberto && n > 0 && extra}
      </div>
      <div id={`${id}-c`} hidden={!aberto} className="pb-3">
        {n > 0 ? children : <p className="px-1 py-2 text-[15px] text-muted-foreground">{vazio}</p>}
      </div>
    </section>
  );
}

/** A dica discreta, que também abre a ajuda. */
export function DicaAtalhos({ abrir }: { abrir: () => void }) {
  return (
    <button type="button" onClick={abrir} className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-[15px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <Keyboard className="h-4 w-4" aria-hidden="true" />Prima <kbd className="rounded border border-border px-1.5 font-sans">?</kbd> para ver atalhos
    </button>
  );
}

export function AjudaAtalhos({ aberta, mudar, leitura }: { aberta: boolean; mudar: (v: boolean) => void; leitura: boolean }) {
  return (
    <Dialog open={aberta} onOpenChange={mudar}>
      <DialogContent hideClose className={cn("calma max-w-md text-[15px]", leitura && "leitura pessoas-leitura")} {...{ [SEM_ATALHOS]: "" }}>
        <DialogTitle className="text-lg font-semibold">Atalhos</DialogTitle>
        <DialogDescription className="text-[15px] text-muted-foreground">Não funcionam enquanto se escreve num campo.</DialogDescription>
        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2">
          {ATALHOS.map((a) => (
            <div key={a.teclas} className="contents"><dt><kbd className="rounded border border-border px-1.5 font-sans">{a.teclas}</kbd></dt><dd>{a.o}</dd></div>
          ))}
        </dl>
        <div className="flex justify-end">
          <DialogClose asChild><Button type="button" variant="outline" className="min-h-11 text-[15px]">Fechar</Button></DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
