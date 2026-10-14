// As peças da seleção guiada (14/10/2026): cartões que ligam e desligam ao toque (sem "+"), com o nome em 2 linhas no máximo,
// o ajuste discreto da quantidade (1 · 2 · 3 · outro), os cartões grandes de resposta e a fila de filtros por baixo da pesquisa.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Link2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, nfmt } from "./motor";
import { numero } from "./pecas";
import { IconeServico, Ilustracao, type IconeServicoKey, type IlustracaoKey } from "./ilustracoes";

/** O visto do cartão escolhido (o círculo vazio quando não está). */
function Visto({ on, so }: { on: boolean; so?: boolean }) {
  return (
    <span aria-hidden="true" className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors duration-150",
      so ? "border-transparent text-primary" : on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>
      {so ? <Link2 className="h-4 w-4" /> : on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </span>
  );
}

const CAIXA = (on: boolean) => cn("relative flex flex-col rounded-xl border bg-card transition-colors duration-150",
  on ? "border-primary bg-primary/[0.06] ring-1 ring-primary" : "border-border");
const TOQUE = "flex w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed";

/* ------------------------------------------------------------------ serviço */
export function CartaoServico({ nome, nomeCompleto, linha2, icone, figura, on, so, desativado, onTocar, children, falta }: {
  nome: string; nomeCompleto: string; linha2?: string | null; icone: IconeServicoKey; figura?: ReactNode; on: boolean; so?: boolean; desativado?: boolean;
  onTocar: () => void; children?: ReactNode; falta?: boolean;
}) {
  const corpo = (
    <>
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg transition-colors", on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
        {figura ?? <IconeServico k={icone} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] font-medium leading-snug text-foreground">{nome}</span>
        {linha2 && <span className="mt-0.5 block truncate text-sm leading-snug text-muted-foreground">{linha2}</span>}
      </span>
      <Visto on={on} so={so} />
    </>
  );
  const rotulo = [nomeCompleto, linha2].filter(Boolean).join(". ");
  return (
    <li className={cn(CAIXA(on), falta && "border-destructive")} title={nomeCompleto}>
      {so ? (
        <div className="flex min-h-[64px] items-center gap-3 p-3" aria-label={rotulo} role="group">{corpo}</div>
      ) : (
        <button type="button" aria-pressed={on} disabled={desativado} onClick={onTocar} aria-label={rotulo}
          className={cn(TOQUE, "min-h-[64px] items-center gap-3 p-3")}>{corpo}</button>
      )}
      {children}
    </li>
  );
}

/* ------------------------------------------------------------------ produto */
export function CartaoProduto({ nome, nomeCompleto, detalhe, preco, un, img, on, trazInstalacao, onTocar, children }: {
  nome: string; nomeCompleto: string; detalhe?: string | null; preco: number; un: string; img: IlustracaoKey; on: boolean; trazInstalacao?: boolean;
  onTocar: () => void; children?: ReactNode;
}) {
  const rotulo = [nomeCompleto, detalhe, `${eur(preco)} € por ${un}`, trazInstalacao ? "traz a instalação" : null].filter(Boolean).join(". ");
  return (
    <li className={CAIXA(on)} title={nomeCompleto}>
      <button type="button" aria-pressed={on} onClick={onTocar} aria-label={rotulo} className={cn(TOQUE, "h-full flex-col gap-2 p-2.5")}>
        <span className="flex w-full items-start justify-between gap-2">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-muted/70"><Ilustracao k={img} className="h-11 w-11" /></span>
          <Visto on={on} />
        </span>
        <span className="line-clamp-2 w-full text-[15px] font-medium leading-snug text-foreground">{nome}</span>
        {detalhe && <span className="-mt-1.5 block w-full truncate text-sm text-muted-foreground">{detalhe}</span>}
        <span className="mt-auto flex w-full items-center justify-between gap-1 whitespace-nowrap text-[15px] tabular-nums text-foreground">
          <span>{eur(preco)} €<span className="text-sm text-muted-foreground"> / {un}</span></span>
          {trazInstalacao && <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        </span>
      </button>
      {children}
    </li>
  );
}

/* ------------------------------------------------------------------ a quantidade */
/** O ajuste discreto: 1 · 2 · 3 · outro (escreve-se só no "outro"). Em 4 colunas nos cartões largos, 2 × 2 nos estreitos. */
export function AjusteQtd({ id, valor, un, nome, onMudar, estreito }: { id: string; valor: number; un: string; nome: string; onMudar: (n: number) => void; estreito?: boolean }) {
  const rapido = [1, 2, 3].includes(valor);
  const [outro, setOutro] = useState(!rapido);
  const ref = useRef<HTMLInputElement>(null);
  const [focar, setFocar] = useState(false);
  useEffect(() => { if (focar) { ref.current?.focus(); setFocar(false); } }, [focar]);
  const btn = (on: boolean) => cn("min-h-11 rounded-lg border text-[15px] tabular-nums transition-colors duration-150",
    on ? "border-primary bg-primary text-primary-foreground font-medium" : "border-input bg-card text-foreground hover:border-foreground/40");
  return (
    <div className="border-t border-primary/15 px-2.5 pb-2.5 pt-2 animate-in fade-in-0 duration-150">
      <div role="group" aria-label={`Quantidade de ${nome} (${un})`} className={cn("grid gap-1.5", estreito ? "grid-cols-2" : "grid-cols-4")}>
        {[1, 2, 3].map((n) => (
          <button key={n} type="button" aria-pressed={!outro && valor === n} className={btn(!outro && valor === n)}
            onClick={() => { setOutro(false); if (valor !== n) onMudar(n); }}>{n}</button>
        ))}
        <button type="button" aria-pressed={outro} aria-controls={id} className={btn(outro)} onClick={() => { setOutro(true); setFocar(true); }}>
          {outro && !rapido ? nfmt(valor) : "Outro"}
        </button>
      </div>
      {outro && (
        <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="sr-only">Quantidade de {nome}</span>
          <input id={id} ref={ref} key={id + valor} inputMode="decimal" defaultValue={nfmt(valor)}
            className="h-11 w-24 rounded-lg border border-input bg-card px-3 text-center text-[15px] tabular-nums text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
            onBlur={(e) => { const n = numero(e.target.value); if (!isNaN(n) && n > 0 && n !== valor) onMudar(Math.round(n * 100) / 100); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          {un}
        </label>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ respostas grandes */
export function CartaoResposta({ on, onTocar, titulo, sub, disabled }: { on: boolean; onTocar: () => void; titulo: string; sub?: string; disabled?: boolean }) {
  return (
    <button type="button" aria-pressed={on} onClick={onTocar} disabled={disabled}
      className={cn("flex min-h-16 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:opacity-70",
        on ? "border-primary bg-primary/[0.06] ring-1 ring-primary" : "border-input bg-card hover:border-foreground/40")}>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-foreground">{titulo}</span>
        {sub && <span className="block text-sm text-muted-foreground">{sub}</span>}
      </span>
      <Visto on={on} />
    </button>
  );
}

/* ------------------------------------------------------------------ pesquisa e filtros */
export function Pesquisa({ valor, onMudar, rotulo, ph }: { valor: string; onMudar: (v: string) => void; rotulo: string; ph: string }) {
  return (
    <label className="relative block">
      <span className="sr-only">{rotulo}</span>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input type="search" value={valor} onChange={(e) => onMudar(e.target.value)} placeholder={ph}
        className="h-12 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
    </label>
  );
}

/**
 * A fila de filtros por baixo da pesquisa: "Todos" e as opções, um ativo de cada vez (o ativo com o acento cheio).
 * Tocar no ativo volta a "Todos". No telemóvel desliza na horizontal, numa só linha, sem scroll na página.
 */
export function FiltrosFila({ opcoes, ativo, onMudar, rotulo }: { opcoes: string[]; ativo: string | null; onMudar: (v: string | null) => void; rotulo: string }) {
  if (opcoes.length < 2) return null;
  const b = (on: boolean) => cn("inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[15px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
    on ? "border-primary bg-primary font-medium text-primary-foreground" : "border-input bg-card text-foreground hover:border-foreground/40");
  return (
    <div role="group" aria-label={rotulo} className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button type="button" aria-pressed={!ativo} onClick={() => onMudar(null)} className={b(!ativo)}>Todos</button>
      {opcoes.map((o) => (
        <button key={o} type="button" aria-pressed={ativo === o} onClick={() => onMudar(ativo === o ? null : o)} className={b(ativo === o)}>{o}</button>
      ))}
    </div>
  );
}
