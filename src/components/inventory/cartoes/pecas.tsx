// Peças comuns dos cartões do novo Inventário (Movimentos, Contagens, Armazéns), tiradas do artefacto aprovado
// vault/inventario-redesenho-completo.html: .bar, .search, .chips/.chip, .grid, .card (.top/.t/.s/.big/.mono), .prog,
// .pill e .note — nos tokens do tema (claro e escuro). Só apresentação; sem dados nem consultas.
import { useId, type ReactNode } from "react";
import { Filter, LayoutGrid, Search, Table2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toneBadge, type InventoryTone } from "@/components/inventory/ui/tones";

export type ModoVista = "cartoes" | "tabela";

/** .grid do artefacto (300px mínimo; num ecrã estreito, uma coluna). */
export const GRELHA = "grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-2.5";

/** .card do artefacto (sem o hover de cartão clicável). */
export const CARTAO =
  "relative flex flex-col gap-2.5 rounded-[20px] border border-border bg-card px-4 py-[15px] text-card-foreground shadow-sm";

/** O hover/foco do .card clicável. */
export const CARTAO_CLICAVEL =
  "transition-[transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-primary focus-within:border-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/** .card .t / .s / .mono / .big */
export const TITULO = "text-[15.5px] font-bold leading-[1.3] text-foreground";
export const SUB = "text-[13px] text-muted-foreground";
export const MONO = "font-mono text-[12.5px] text-muted-foreground";
export const GRANDE = "text-[1.9rem] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-foreground";
export const GRANDE_SMALL = "ml-1 text-[13px] font-semibold tracking-normal text-muted-foreground";

/** .btn.g / .btn.p do artefacto (min-height 44px). */
export const BOTAO_FANTASMA = "min-h-11 rounded-[14px] font-semibold";
export const BOTAO_PRIMARIO = "min-h-11 rounded-[14px] font-semibold shadow-[0_6px_18px_-6px_hsl(var(--primary)/0.55)]";

/** O .pill do artefacto (bolinha + texto). */
export function Pilula({ tom, children, className }: { tom: InventoryTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-semibold",
        toneBadge[tom],
        className,
      )}
    >
      <span className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

/** O .chip do artefacto: pressionado fica invertido (fundo = texto), com a contagem a negrito. */
export function Chip({
  pressionado,
  contagem,
  onClick,
  children,
}: {
  pressionado: boolean;
  contagem?: number | string | null;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressionado}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        pressionado ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
      {contagem != null ? (
        <b className={cn("tabular-nums", pressionado ? "text-background" : "text-foreground")}>{contagem}</b>
      ) : null}
    </button>
  );
}

/** A .search do artefacto. */
export function Pesquisa({
  valor,
  aoMudar,
  placeholder,
  rotulo,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder: string;
  rotulo: string;
}) {
  return (
    <label className="flex min-h-11 flex-[1_1_240px] items-center gap-2 rounded-[14px] border border-border bg-card px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-primary">
      <Search className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <input
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        aria-label={rotulo}
        className="h-10 min-w-0 flex-1 border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

/** O botão "Filtros" (fantasma) com o nº de filtros ativos e o painel por baixo. */
export function BotaoFiltros({ ativos, children }: { ativos: number; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" className={BOTAO_FANTASMA}>
          <Filter className="mr-2 h-4 w-4" aria-hidden="true" /> Filtros
          {ativos > 0 ? (
            <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground">
              {ativos}
              <span className="sr-only"> ativos</span>
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Filtros" className="w-[min(22rem,calc(100vw-1.5rem))] space-y-4">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Um campo do painel de Filtros: rótulo em maiúsculas pequenas (.sect) por cima. */
export function CampoFiltro({ rotulo, children, htmlFor }: { rotulo: string; children: ReactNode; htmlFor?: string }) {
  const id = useId();
  return (
    <div className="space-y-1.5" role={htmlFor ? undefined : "group"} aria-labelledby={htmlFor ? undefined : id}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {rotulo}
        </label>
      ) : (
        <span id={id} className="block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {rotulo}
        </span>
      )}
      {children}
    </div>
  );
}

/** Alternador Cartões / Tabela (o segundo rótulo pode mudar: Armazéns não tem tabela, tem o "Detalhe"). */
export function AlternadorVista({
  modo,
  aoMudar,
  rotuloTabela = "Tabela",
  IconeTabela = Table2,
}: {
  modo: ModoVista;
  aoMudar: (m: ModoVista) => void;
  rotuloTabela?: string;
  IconeTabela?: LucideIcon;
}) {
  const opcoes: [ModoVista, string, LucideIcon][] = [
    ["cartoes", "Cartões", LayoutGrid],
    ["tabela", rotuloTabela, IconeTabela],
  ];
  return (
    <div role="group" aria-label="Mostrar como" className="inline-flex min-h-11 items-center rounded-[14px] border border-border bg-card p-1">
      {opcoes.map(([m, l, Icone]) => (
        <button
          key={m}
          type="button"
          aria-pressed={modo === m}
          onClick={() => aoMudar(m)}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13.5px] font-semibold transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            modo === m ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
          )}
        >
          <Icone className="h-4 w-4" aria-hidden="true" /> {l}
        </button>
      ))}
    </div>
  );
}

/** A .prog do artefacto, com o progresso anunciado (e o texto visível ao lado, no cartão). */
export function BarraProgresso({ feito, total, rotulo }: { feito: number; total: number; rotulo: string }) {
  const pct = total > 0 ? Math.min(100, (feito / total) * 100) : 0;
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={feito}
      aria-label={rotulo}
      className="block h-2 overflow-hidden rounded-full bg-muted"
    >
      <i className="block h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </span>
  );
}
