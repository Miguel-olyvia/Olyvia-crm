// Peças da ficha do serviço no V1 (14/10/2026), para não haver <select> nativos:
// · Segmentos: poucas opções (até 6), em botões de rádio com alvos de 44 px;
// · SeletorPesquisa: muitas opções, num painel (popover) com pesquisa, lista filtrável, ícone e o valor
//   principal à direita (€/h, €/un). Teclado: ↑ ↓ para andar, Enter para escolher, Esc para fechar.
// · NumeroInline: um campo pequeno para números, que grava ao sair ou com Enter.
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { normal } from "./catalogo";
import { numero } from "./pecas";

/* ------------------------------------------------------------------ segmentos */
export function Segmentos<T extends string>({ rotulo, v, opcoes, onSet, nome, oculto, desativado }: {
  rotulo: string; v: T; opcoes: { k: T; t: string; d?: string }[]; onSet: (k: T) => void; nome: string;
  /** O rótulo fica só para os leitores de ecrã (quando a secção já diz o que é). */
  oculto?: boolean; desativado?: boolean;
}) {
  const comDesc = opcoes.some((o) => o.d);
  return (
    <fieldset className="mt-4" disabled={desativado}>
      <legend className={cn("text-[15px] font-medium", oculto && "sr-only")}>{rotulo}</legend>
      <div className={cn("mt-2 gap-2", comDesc ? "grid sm:grid-cols-2" : "flex flex-wrap")}>
        {opcoes.map((o) => (
          <label key={o.k} className={cn("flex min-h-11 cursor-pointer rounded-xl border px-4 text-[15px] transition-colors focus-within:ring-2 focus-within:ring-primary/30",
            comDesc ? "flex-col justify-center py-2.5" : "items-center",
            v === o.k ? "border-primary bg-primary/[0.06]" : "border-input bg-card hover:bg-muted/60")}>
            <input type="radio" name={nome} checked={v === o.k} onChange={() => onSet(o.k)} className="sr-only" />
            <span className={cn(v === o.k && "font-medium")}>{o.t}</span>
            {o.d && <span className="text-[14px] text-muted-foreground">{o.d}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------------ seletor com pesquisa */
export interface OpcaoSeletor { v: string; t: string; sub?: string; valor?: string; icone?: ReactNode; procura?: string }

export function SeletorPesquisa({ rotulo, opcoes, onEscolher, gatilho, atual, max = 8, placeholder = "Procurar…", vazio = "Nenhum resultado.", className }: {
  rotulo: string; opcoes: OpcaoSeletor[]; onEscolher: (v: string) => void;
  /** O conteúdo do botão que abre o painel. */
  gatilho: ReactNode; atual?: string; max?: number; placeholder?: string; vazio?: string; className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [ativo, setAtivo] = useState(0);
  const id = useId(), lista = useRef<HTMLUListElement>(null);
  const filtradas = useMemo(() => {
    const qq = normal(q.trim());
    const L = qq ? opcoes.filter((o) => normal(`${o.t} ${o.sub ?? ""} ${o.procura ?? ""}`).includes(qq)) : opcoes;
    return L.slice(0, max);
  }, [opcoes, q, max]);
  const total = q.trim() ? opcoes.filter((o) => normal(`${o.t} ${o.sub ?? ""} ${o.procura ?? ""}`).includes(normal(q.trim()))).length : opcoes.length;
  const escolher = (v: string) => { onEscolher(v); setAberto(false); setQ(""); };
  const mover = (d: number) => {
    const n = filtradas.length;
    if (!n) return;
    const i = (ativo + d + n) % n;
    setAtivo(i);
    lista.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView?.({ block: "nearest" });
  };
  return (
    <Popover open={aberto} onOpenChange={(o) => { setAberto(o); if (!o) setQ(""); setAtivo(0); }}>
      <PopoverTrigger asChild>
        <button type="button" aria-haspopup="dialog" aria-label={rotulo}
          className={cn("inline-flex min-h-11 items-center gap-2 rounded-lg text-left text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30", className)}>
          {gatilho}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-0" aria-label={rotulo}>
        <div className="relative border-b border-border">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input autoFocus type="search" role="combobox" aria-expanded="true" aria-controls={id} aria-label={`Procurar: ${rotulo}`}
            aria-activedescendant={filtradas[ativo] ? `${id}-${ativo}` : undefined}
            value={q} placeholder={placeholder} onChange={(e) => { setQ(e.target.value); setAtivo(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); mover(1); }
              else if (e.key === "ArrowUp") { e.preventDefault(); mover(-1); }
              else if (e.key === "Enter") { e.preventDefault(); const o = filtradas[ativo]; if (o) escolher(o.v); }
            }}
            className="h-12 w-full bg-transparent pl-10 pr-3 text-[15px] outline-none" />
        </div>
        <ul ref={lista} id={id} role="listbox" aria-label={rotulo} className="max-h-80 overflow-y-auto py-1">
          {filtradas.map((o, i) => (
            <li key={o.v} id={`${id}-${i}`} data-i={i} role="option" aria-selected={o.v === atual}
              onMouseEnter={() => setAtivo(i)} onClick={() => escolher(o.v)}
              className={cn("flex min-h-12 cursor-pointer items-center gap-3 px-3 py-1.5", i === ativo && "bg-muted")}>
              {o.icone && <span className="grid h-9 w-9 shrink-0 place-items-center text-muted-foreground" aria-hidden="true">{o.icone}</span>}
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[15px]", o.v === atual && "font-medium")}>{o.t}</span>
                {o.sub && <span className="block truncate text-[14px] text-muted-foreground">{o.sub}</span>}
              </span>
              {o.valor && <span className="shrink-0 text-[15px] tabular-nums">{o.valor}</span>}
            </li>
          ))}
          {!filtradas.length && <li className="px-3 py-3 text-[15px] text-muted-foreground">{vazio}</li>}
        </ul>
        {total > filtradas.length && <p className="border-t border-border px-3 py-2 text-[14px] text-muted-foreground">Mais {total - filtradas.length}: escreva para encontrar.</p>}
      </PopoverContent>
    </Popover>
  );
}

/** O gatilho com o aspeto de um campo (o valor escolhido e a seta). */
export function GatilhoCampo({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3">
      <span className="min-w-0 truncate">{children}</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </span>
  );
}

/* ------------------------------------------------------------------ número inline */
export function NumeroInline({ rotulo, v, onSet, w = "w-16", min = 0 }: { rotulo: string; v: number; onSet: (n: number) => void; w?: string; min?: number }) {
  return (
    <input key={v} type="text" inputMode="decimal" aria-label={rotulo} defaultValue={String(v).replace(".", ",")}
      className={cn("h-11 rounded-md border border-transparent bg-muted/60 px-2 text-right text-[15px] tabular-nums outline-none transition-colors hover:border-input focus-visible:border-primary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/25", w)}
      onBlur={(e) => { const n = numero(e.target.value); if (!isNaN(n) && n >= min && n !== v) onSet(n); else e.target.value = String(v).replace(".", ","); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}

/** Um nome que se lê como texto e se edita no sítio (sem caixa até se tocar); grava ao sair ou com Enter. */
export function NomeInline({ rotulo, v, onSet }: { rotulo: string; v: string; onSet: (s: string) => void }) {
  return (
    <input key={v} type="text" aria-label={rotulo} defaultValue={v}
      className="h-11 w-full min-w-0 truncate rounded-md border border-transparent bg-transparent px-1.5 text-[15px] outline-none transition-colors hover:border-input focus-visible:border-primary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/25"
      onBlur={(e) => { const s = e.target.value.trim(); if (s && s !== v) onSet(s); else e.target.value = v; }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}
