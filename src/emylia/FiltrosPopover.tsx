// O botão "Filtros" e o painel onde cabem todos os filtros, partilhados pelas páginas Pessoas e Negócios V2. Selects nativos com etiqueta visível,
// e interruptores em forma de chip (aria-pressed). Os menus que abrem num portal ficam fora de .calma: levam as mesmas classes (ver classePortal).
import { useId, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { BORDA_CTRL } from "./PessoaLinha";

export const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
export const CHIP = (ativo: boolean): string =>
  cn("min-h-11 shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-4 text-[15px] transition-colors duration-150 motion-reduce:transition-none", FOCO,
    ativo ? "border-foreground bg-foreground text-background" : cn(BORDA_CTRL, "bg-card hover:border-foreground"));
/** Os menus que abrem num portal ficam fora de .calma: levam as mesmas classes para herdar variáveis, fonte, leitura fácil e foco. */
export const classePortal = (leitura: boolean): string => cn("calma text-[15px] motion-reduce:!animate-none", leitura && "leitura pessoas-leitura");

interface EscolherProps { rotulo: string; valor: string; aoMudar: (v: string) => void; todas: string; opcoes: readonly (string | { valor: string; nome: string })[] }

/** Um select nativo com a etiqueta por cima. A primeira opção (valor vazio) é "sem este filtro". */
export function Escolher({ rotulo, valor, aoMudar, todas, opcoes }: EscolherProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[15px] text-muted-foreground">{rotulo}</label>
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} className={cn("h-11 w-full cursor-pointer rounded-md border bg-card px-3 text-[15px]", BORDA_CTRL, FOCO)}>
        <option value="">{todas}</option>
        {opcoes.map((o) => (typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.valor} value={o.valor}>{o.nome}</option>))}
      </select>
    </div>
  );
}

/** Um filtro de sim ou não, em forma de chip. */
export function Interruptor({ nome, ativo, aoMudar }: { nome: string; ativo: boolean; aoMudar: () => void }) {
  return <button type="button" aria-pressed={ativo} onClick={aoMudar} className={CHIP(ativo)}>{nome}</button>;
}

interface PopoverProps { ativos: number; leitura: boolean; children: ReactNode }

/** O painel dos filtros: duas colunas a partir de 640 px, uma no telemóvel, com a altura limitada (rola por dentro, nunca a página). */
export function FiltrosPopover({ ativos, leitura, children }: PopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={cn("min-h-11 cursor-pointer text-[15px]", BORDA_CTRL)}>
          <SlidersHorizontal className="h-4 w-4 sm:mr-2" aria-hidden="true" /><span className="sr-only sm:not-sr-only">Filtros</span>{ativos > 0 && <span className="ml-1 tabular-nums">({ativos})</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className={cn("max-h-[min(34rem,calc(100vh-8rem))] w-[min(38rem,calc(100vw-2rem))] overflow-y-auto p-4", classePortal(leitura))}>
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
