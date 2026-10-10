// O painel lateral com a ficha da pessoa (shadcn Sheet): desliza da direita, tem largura min(760px, 100vw) (ecrã inteiro no telemóvel),
// fecha com Esc ou com o botão Fechar e devolve o foco à linha da pessoa. As setas passam à pessoa vizinha da lista sem fechar.
import { useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PessoaApp } from "./pessoasDocs";
import { posicaoTexto, vizinhasDe } from "./listaDocs";
import { classePortal } from "./ListaTopo";
import { BORDA_CTRL } from "./PessoaLinha";
import { PessoaFicha, type FichaProps, type SepFicha } from "./PessoaFicha";

export interface PainelProps extends Pick<FichaProps, "S" | "A" | "go"> {
  /** A pessoa aberta; `undefined` com o painel fechado. */
  p: PessoaApp | undefined;
  /** Os nomes da lista como se vê, pela ordem: dão a pessoa anterior, a seguinte e a posição. */
  nomes: string[];
  leitura: boolean;
  sep: SepFicha;
  aoMudarSep: (s: SepFicha) => void;
  abrir: (nome: string) => void;
  fechar: () => void;
  /** Recebe o elemento do painel onde ficam os avisos enquanto ele está aberto (e `null` quando fecha). */
  alvoAvisos?: (el: HTMLElement | null) => void;
}

const SETA = cn("min-h-11 min-w-11 cursor-pointer px-0", BORDA_CTRL);

export function PessoaPainel({ S, A, go, p, nomes, leitura, sep, aoMudarSep, abrir, fechar, alvoAvisos }: PainelProps) {
  const conteudo = useRef<HTMLDivElement>(null);
  // Durante a animação de saída o conteúdo mantém-se: guarda-se a última pessoa mostrada.
  const ultima = useRef<PessoaApp | undefined>(p);
  if (p) ultima.current = p;
  const mostrada = p ?? ultima.current;
  const v = vizinhasDe(nomes, mostrada?.nome ?? ""), pos = posicaoTexto(v);
  const voltarFoco = (e: Event) => {
    e.preventDefault();
    const nome = ultima.current?.nome;
    [...document.querySelectorAll<HTMLElement>("[data-pessoa]")].find((el) => el.dataset.pessoa === nome)?.focus();
  };
  // O foco entra no nome da pessoa (o título do painel) e não no primeiro botão: o leitor de ecrã começa por aí.
  const focarTitulo = (e: Event) => {
    const titulo = conteudo.current?.querySelector<HTMLElement>("h2[tabindex='-1']");
    if (!titulo) return;
    e.preventDefault();
    titulo.focus();
  };
  const topo = (
    <div className="flex shrink-0 items-center gap-1">
      <Button type="button" variant="outline" className={SETA} disabled={!v.anterior} aria-label={v.anterior ? `Anterior: ${v.anterior}` : "Anterior"} onClick={() => v.anterior && abrir(v.anterior)}>
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </Button>
      <span className="min-w-14 text-center text-[15px] tabular-nums text-muted-foreground">{pos}</span>
      <Button type="button" variant="outline" className={SETA} disabled={!v.seguinte} aria-label={v.seguinte ? `Seguinte: ${v.seguinte}` : "Seguinte"} onClick={() => v.seguinte && abrir(v.seguinte)}>
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </Button>
      <Button type="button" variant="outline" className={cn("ml-1 min-h-11 cursor-pointer text-[15px]", BORDA_CTRL)} onClick={fechar}>
        <X className="mr-1.5 h-4 w-4" aria-hidden="true" />Fechar
      </Button>
    </div>
  );
  return (
    <Sheet open={!!p} onOpenChange={(aberto) => { if (!aberto) fechar(); }}>
      <SheetContent ref={conteudo} side="right" onOpenAutoFocus={focarTitulo} onCloseAutoFocus={voltarFoco}
        className={cn("flex w-[min(760px,100vw)] flex-col gap-0 p-0 text-foreground sm:max-w-none motion-reduce:!animate-none [&>button.absolute]:hidden", classePortal(leitura))}>
        <TooltipProvider>
          <p className="sr-only" aria-live="polite">{mostrada ? `Ficha de ${mostrada.nome}${pos ? `, ${pos}` : ""}` : ""}</p>
          <div ref={alvoAvisos} className="pn" />
          {mostrada && <PessoaFicha key={mostrada.nome} S={S} A={A} go={go} p={mostrada} sep={sep} aoMudarSep={aoMudarSep} fechar={fechar} topo={topo} />}
        </TooltipProvider>
      </SheetContent>
    </Sheet>
  );
}
