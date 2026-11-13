// 13/11: o dropdown com pesquisa em texto do Catálogo (marca, categoria, subcategoria). Nunca uma lista solta: um campo onde se escreve para
// procurar e se escolhe com o toque ou o teclado. Mesmo desenho e comportamento do combobox das opções dos atributos (AtributosProduto.tsx),
// mas genérico: itens {id, nome}, «Nova …» opcional no fim, opção desativada atual mostrada mas não escolhível.
import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CAMPO, Campo } from "./pecasForm";

/** Um item do dropdown. `inativo`: desativado na base; mostra-se só se for o escolhido, e não se pode escolher de novo. */
export interface ItemCombo { id: string; nome: string; inativo?: boolean }

/** Escreve-se sem acentos nem maiúsculas. */
export const semAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Item = { k: "item"; i: ItemCombo } | { k: "nova" } | { k: "limpar" };

interface Props {
  /** O nome acessível do campo (também o da lista). */
  rotulo: string;
  /** O id do campo, para um <label> (Campo) o ligar. */
  id?: string;
  itens: readonly ItemCombo[];
  atual: ItemCombo | null;
  onEscolher: (i: ItemCombo) => void;
  /** Com ele, o último item é «Nova …» e leva o que se escreveu. */
  onNova?: (nomeEscrito: string) => void;
  textoNova?: string;
  /** Com ele, o primeiro item («Sem marca») limpa a escolha: onEscolher recebe {id: "", nome: ""}. Some quando se escreve para procurar. */
  semValor?: string;
  placeholder?: string;
  vazio?: string;
  desativado?: boolean;
  /** Para devolver o foco ao campo depois de fechar um formulário. */
  registar?: (el: HTMLInputElement | null) => void;
}

/** Dropdown com pesquisa em texto (combobox, padrão ARIA 1.2: input role=combobox, listbox de options, aria-activedescendant). Setas, Home, End,
 *  Enter, Esc e Tab. */
export function ComboPesquisa({ rotulo, id, itens, atual, onEscolher, onNova, textoNova = "Nova opção…", semValor, placeholder = "Escolher ou escrever para procurar", vazio = "Nenhuma opção encontrada", desativado, registar }: Props) {
  const lid = useId();
  const entradaRef = useCallback((el: HTMLInputElement | null) => registar?.(el), [registar]);
  const [q, setQ] = useState<string | null>(null); // o que se está a escrever; null = mostra a escolhida
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  // as desativadas não se escolhem: só aparecem no campo quando são a atual
  const escolhiveis = useMemo(() => itens.filter((x) => !x.inativo), [itens]);
  const filtradas = useMemo(() => {
    const t = semAcentos((q ?? "").trim());
    return t ? escolhiveis.filter((x) => semAcentos(x.nome).includes(t)) : [...escolhiveis];
  }, [escolhiveis, q]);
  const procura = !!(q ?? "").trim();
  const lista: Item[] = [...(semValor && !procura ? [{ k: "limpar" } as Item] : []), ...filtradas.map((i): Item => ({ k: "item", i })), ...(onNova ? [{ k: "nova" } as Item] : [])];
  const fechar = () => { setAberto(false); setQ(null); };
  const escolher = (it: Item) => { const escrito = (q ?? "").trim(); fechar(); if (it.k === "nova") onNova?.(escrito); else if (it.k === "limpar") onEscolher({ id: "", nome: "" }); else onEscolher(it.i); };
  const daEscolhida = lista.findIndex((x) => x.k === "item" && x.i.id === atual?.id);
  const abrir = (el?: HTMLInputElement) => { if (!aberto) { setAberto(true); setAtivo(Math.max(0, daEscolhida)); } el?.select(); };
  // ao abrir, a lista rola até à escolhida (a única vez que rola sem teclado)
  useEffect(() => {
    if (aberto && daEscolhida >= 0) document.getElementById(`${lid}-${daEscolhida}`)?.scrollIntoView?.({ block: "nearest" });
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  const valor = q ?? (atual ? `${atual.nome}${atual.inativo ? " (desativada)" : ""}` : "");
  const ativoId = aberto && lista[ativo] ? `${lid}-${ativo}` : undefined;
  /** Move a opção ativa (gesto de teclado) e traz-a à vista. O rato só marca, nunca rola. */
  const vai = (i: number) => {
    const n = Math.max(0, Math.min(lista.length - 1, i));
    setAtivo(n);
    document.getElementById(`${lid}-${n}`)?.scrollIntoView?.({ block: "nearest" });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Home e End movem o cursor enquanto se escreve: só são da lista com ela aberta e sem texto de pesquisa (ou com Ctrl)
    const daLista = aberto && (!q || e.ctrlKey);
    if (e.key === "ArrowDown") { e.preventDefault(); if (aberto) vai(ativo + 1); else abrir(e.currentTarget); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (aberto) vai(ativo - 1); else abrir(e.currentTarget); }
    else if (e.key === "Home" && daLista) { e.preventDefault(); vai(0); }
    else if (e.key === "End" && daLista) { e.preventDefault(); vai(lista.length - 1); }
    else if (e.key === "Enter" && aberto) { e.preventDefault(); if (lista[ativo]) escolher(lista[ativo]); }
    else if (e.key === "Escape" && aberto) { e.preventDefault(); e.stopPropagation(); fechar(); }
    else if (e.key === "Tab") fechar();
  };
  const contagem = filtradas.length === 0 ? vazio : filtradas.length === 1 ? "1 opção" : `${filtradas.length} opções`;
  const estado = !aberto ? "" : `${contagem}${onNova ? `, e ${textoNova}` : ""}`;
  return (
    <div className="relative">
      <input id={id} ref={entradaRef} type="text" role="combobox" aria-label={rotulo} aria-expanded={aberto} aria-controls={aberto && lista.length > 0 ? lid : undefined} aria-autocomplete="list"
        aria-activedescendant={ativoId} autoComplete="off" spellCheck={false} value={valor} placeholder={placeholder} disabled={desativado}
        onClick={(e) => { if (!aberto) abrir(e.currentTarget); else if (!q) fechar(); }} onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => { setQ(e.target.value); setAberto(true); setAtivo(0); }} onBlur={fechar} onKeyDown={onKeyDown}
        className={cn(CAMPO, "pr-10 disabled:cursor-not-allowed disabled:opacity-60")} />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      {/* a região de estado está sempre montada (só muda o texto), para os leitores de ecrã a anunciarem */}
      <span role="status" className="sr-only">{estado}</span>
      {aberto && (
        <div onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 top-full z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-popover p-1 shadow-lg motion-safe:animate-in motion-safe:fade-in-0">
          {!filtradas.length && <p className="px-3 py-2.5 text-[15px] text-muted-foreground">{vazio}</p>}
          {lista.length > 0 && (
        <ul id={lid} role="listbox" aria-label={rotulo}>
          {lista.map((it, k) => (
            <li key={it.k === "item" ? it.i.id : it.k} id={`${lid}-${k}`} role="option" aria-selected={it.k === "item" ? atual?.id === it.i.id : it.k === "limpar" ? !atual : false}
              onClick={() => escolher(it)} onMouseEnter={() => setAtivo(k)}
              className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-[15px]", k === ativo && "bg-muted")}>
              {it.k === "nova"
                ? <><Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{textoNova}</>
                : it.k === "limpar"
                ? <span className="min-w-0 flex-1 text-muted-foreground">{semValor}</span>
                : <>
                  <span className="min-w-0 flex-1 break-words">{it.i.nome}</span>
                  {atual?.id === it.i.id && <><Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span className="sr-only"> (escolhida)</span></>}
                </>}
            </li>
          ))}
        </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** O formulário curto de «Nova …»: um nome, e Criar / Cancelar. `aCriar` mostra o relógio e bloqueia; `erro` fica ao lado do botão. */
export function NovoNome({ rotulo, rotuloCampo, inicial = "", botao = "Criar", aCriar = false, erro, onCriar, onCancelar }: {
  rotulo: string; rotuloCampo?: string; inicial?: string; botao?: string; aCriar?: boolean; erro?: string | null; onCriar: (nome: string) => void; onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial);
  const pode = !!nome.trim() && !aCriar;
  const rz = useId();
  const razao = aCriar ? "A criar…" : !nome.trim() ? "Escreva o nome." : null;
  const enviar = () => { if (pode) onCriar(nome.trim()); };
  return (
    <div role="group" aria-label={rotulo} className="grid gap-3 rounded-xl border border-border bg-card p-3 motion-safe:animate-in motion-safe:fade-in-0">
      <Campo rot={rotuloCampo ?? rotulo}>{(i) => (
        <input id={i} value={nome} aria-invalid={!!erro} onChange={(e) => setNome(e.target.value)} className={CAMPO} autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (!aCriar) onCancelar(); } }} />
      )}</Campo>
      {erro && <p className="text-[15px] text-destructive" role="alert">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11 text-[15px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50" aria-disabled={razao ? true : undefined} aria-describedby={razao ? rz : undefined} onClick={enviar}>
          {aCriar && <Loader2 className="mr-1 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{botao}
        </Button>
        {razao && <span id={rz} className="sr-only">{razao}</span>}
        <Button type="button" variant="outline" className="min-h-11 text-[15px]" disabled={aCriar} onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  );
}
