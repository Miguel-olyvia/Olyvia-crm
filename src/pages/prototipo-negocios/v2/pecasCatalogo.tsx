// Peças do Catálogo da V2, parte 2: a escolha com "criar ao escrever" (combobox: escreve-se,
// aparecem as que batem e, se não houver igual, "Criar «X»"), o escolhedor com pesquisa e
// chips (para juntar serviços e materiais) e os botões de ícone. Alvos de 44 px, texto a 15 px.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Package, Plus, Search, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHIP } from "../FiltrosPopover";
import { CAMPO } from "./pecasCustos";
import { filtrarCombo, type Opcao } from "./catalogoModelo";

/**
 * Escolha de uma lista, com "criar ao escrever". Grava ao escolher (clique ou Enter);
 * Escape ou sair sem escolher volta ao valor. `onSet(v, novo)`: novo = true quando se criou.
 */
export function Combo({ rotulo, v, lista, onSet, w = "w-36", id, placeholder }: {
  rotulo: string; v: string; lista: string[]; onSet: (v: string, novo: boolean) => void; w?: string; id?: string; placeholder?: string;
}) {
  const [txt, setTxt] = useState(v);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const lid = useId();
  useEffect(() => { setTxt(v); }, [v]);
  const { opcoes, criar } = filtrarCombo(lista, aberto && txt !== v ? txt : "");
  const itens: { v: string; novo: boolean }[] = [...opcoes.slice(0, 8).map((o) => ({ v: o, novo: false })), ...(criar ? [{ v: criar, novo: true }] : [])];
  const escolher = (i: { v: string; novo: boolean }) => { setAberto(false); setTxt(i.v); if (i.v !== v) onSet(i.v, i.novo); };
  return (
    <div className={cn("relative", w)}>
      <input id={id} type="text" role="combobox" aria-label={rotulo} aria-expanded={aberto} aria-controls={lid} aria-autocomplete="list"
        aria-activedescendant={aberto && itens[ativo] ? `${lid}-${ativo}` : undefined} value={txt} placeholder={placeholder}
        className={cn(CAMPO, "w-full")}
        onFocus={() => { setAberto(true); setAtivo(0); }}
        onChange={(e) => { setTxt(e.target.value); setAberto(true); setAtivo(0); }}
        onBlur={() => { setAberto(false); setTxt(v); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setAberto(true); setAtivo((a) => Math.min(itens.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); const i = itens[ativo]; if (aberto && i) escolher(i); }
          else if (e.key === "Escape") { setAberto(false); setTxt(v); }
        }} />
      {aberto && itens.length > 0 && (
        <ul id={lid} role="listbox" aria-label={rotulo} className="absolute left-0 top-full z-20 mt-1 max-h-72 min-w-full overflow-auto rounded-lg border border-border bg-card py-1 shadow-[var(--shadow-sm)]">
          {itens.map((i, k) => (
            <li key={i.v + i.novo} id={`${lid}-${k}`} role="option" aria-selected={k === ativo}
              onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(i)}
              className={cn("flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap px-3 text-[15px]", k === ativo && "bg-muted")}>
              {i.novo ? <><Plus className="h-4 w-4 text-primary" aria-hidden="true" />Criar «{i.v}»</> : i.v}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** O ícone de um tipo de linha (cor só no ícone). */
export const ICONE_TIPO: Record<Opcao["t"], { I: LucideIcon; cor: string; t: string }> = {
  svc: { I: Wrench, cor: "text-primary", t: "Serviço" },
  mat: { I: Package, cor: "text-warning", t: "Material" },
};

/** Escolher de uma lista: pesquisa e chips (um toque junta). Fica aberto para juntar vários. */
export function Escolhedor({ rotulo, q, setQ, opcoes, onEscolher, extra, autoFoco = true }: {
  rotulo: string; q: string; setQ: (q: string) => void; opcoes: (Opcao & { sub?: string })[]; onEscolher: (o: Opcao) => void; extra?: ReactNode; autoFoco?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFoco) ref.current?.focus(); }, [autoFoco]);
  return (
    <div role="group" aria-label={rotulo} className="mt-3 border-l-2 border-border pl-4">
      <label className="relative block max-w-md">
        <span className="sr-only">Procurar para juntar</span>
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input ref={ref} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar serviço ou material"
          className={cn(CAMPO, "w-full pl-10")} />
      </label>
      {extra}
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Para juntar">
        {opcoes.map((o) => {
          const { I, cor, t } = ICONE_TIPO[o.t];
          return (
            <li key={o.t + o.ref}>
              <button type="button" onClick={() => onEscolher(o)} className={cn(CHIP(false), "inline-flex max-w-[22rem] items-center gap-2")}>
                <I className={cn("h-4 w-4 shrink-0", cor)} aria-hidden="true" /><span className="sr-only">{t}: </span>
                <span className="truncate">{o.n}</span><span className="text-muted-foreground">{o.un}</span>
              </button>
            </li>
          );
        })}
        {!opcoes.length && <li className="text-[15px] text-muted-foreground">Nada com esse nome.</li>}
      </ul>
    </div>
  );
}

/** Botão só com ícone, com o nome para o leitor de ecrã. */
export function BotaoIcone({ rotulo, I, onClick, disabled }: { rotulo: string; I: LucideIcon; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={rotulo} title={rotulo} onClick={onClick} disabled={disabled}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">
      <I className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
export function SubirDescer({ nome, onMover, primeiro, ultimo }: { nome: string; onMover: (d: -1 | 1) => void; primeiro: boolean; ultimo: boolean }) {
  return (
    <span className="inline-flex">
      <BotaoIcone rotulo={`Subir ${nome}`} I={ArrowUp} onClick={() => onMover(-1)} disabled={primeiro} />
      <BotaoIcone rotulo={`Descer ${nome}`} I={ArrowDown} onClick={() => onMover(1)} disabled={ultimo} />
    </span>
  );
}

/** As props comuns das secções do Catálogo: um só editor aberto de cada vez (`editor`). */
export interface SecaoCat {
  editor: string | null;
  setEditor: (e: string | null) => void;
  /** Aviso na região aria-live; com `desfazer`, mostra "Anular". */
  anunciar: (msg: string, desfazer?: () => void) => void;
}
