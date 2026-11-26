// 13/11: o dropdown com pesquisa em texto do Catálogo (marca, categoria, subcategoria). Genérico: itens {id, nome}, «Nova …» opcional no fim,
// opção desativada atual mostrada mas não escolhível.
// 18/11: passou ao padrão «botão + painel com pesquisa». Antes o campo era ao mesmo tempo o botão e a caixa de pesquisa, e o que se escrevia ficava
// colado ao valor atual («Todas as marcas» + «aaaa»). Agora o campo fechado é só um botão com a escolha atual; ao abrir, o painel (portal, por cima
// de tudo) tem o campo de pesquisa no topo (só em listas com mais de 7 opções) e as opções por baixo. O que se escreve vai para a pesquisa.
// RISCO conhecido: dentro de um Dialog Radix (focus trap) o painel em portal, fora do diálogo, pode perder o foco para o diálogo e deixar de se poder escrever
// na pesquisa. Hoje nenhum chamador está dentro de um Dialog; quem o puser lá tem de testar o painel ao vivo (foco, Esc e clique fora).
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { Check, ChevronDown, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CAMPO, Campo } from "./pecasForm";
import { ListaFlutuante } from "./listaFlutuante";

/** Um item do dropdown. `inativo`: desativado na base; mostra-se só se for o escolhido, e não se pode escolher de novo. */
export interface ItemCombo {
  id: string; nome: string; inativo?: boolean;
  /** 24/11: a lista agrupada (o «Modelo 3D», com 45 modelos): um cabeçalho (só visual) antes do primeiro item de cada grupo; os itens do mesmo grupo vêm juntos. */
  grupo?: string;
}

/** Escreve-se sem acentos nem maiúsculas. */
export const semAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A partir de quantas opções o painel mostra o campo de pesquisa (nas listas curtas é ruído). */
const OPCOES_PARA_PESQUISAR = 7;

type Item = { k: "item"; i: ItemCombo } | { k: "nova" } | { k: "limpar" };

interface Props {
  /** O nome acessível do campo (também o da lista). */
  rotulo: string;
  /** O id do botão, para um <label> (Campo) o ligar. */
  id?: string;
  itens: readonly ItemCombo[];
  atual: ItemCombo | null;
  onEscolher: (i: ItemCombo) => void;
  /** Com ele, o último item é «Nova …» e leva o que se escreveu na pesquisa. */
  onNova?: (nomeEscrito: string) => void;
  textoNova?: string;
  /** Com ele, o primeiro item («Sem marca») limpa a escolha: onEscolher recebe {id: "", nome: ""}. Some quando se escreve para procurar. */
  semValor?: string;
  /** O que o botão mostra (em cor suave) quando não há escolha. */
  placeholder?: string;
  vazio?: string;
  desativado?: boolean;
  /** Sem escolha, o botão mostra o texto de `semValor` como valor (um filtro «Todas as categorias»), e não o placeholder. */
  semValorComoValor?: boolean;
  obrigatorio?: boolean;
  /** Classes a juntar às do botão (só os ecrãs de gestão pedem uma borda mais forte). */
  classeCampo?: string;
  /** Para devolver o foco ao botão depois de fechar um formulário. */
  registar?: (el: HTMLButtonElement | null) => void;
  /** Força o campo de pesquisa ligado (true) ou desligado (false); por omissão aparece com mais de 7 opções. */
  pesquisavel?: boolean;
  /** 24/11: o campo está a gravar. Ao contrário de `desativado`, o botão fica focável (aria-disabled): não abre nem escolhe, mas o foco não se perde. */
  ocupado?: boolean;
  /** 24/11: ids (separados por espaço) do texto que descreve o campo (uma ajuda, um erro): vão para aria-describedby do botão. */
  descr?: string;
}

const rotuloDe = (it: Item, semValor?: string, textoNova?: string) => it.k === "item" ? it.i.nome : it.k === "limpar" ? (semValor ?? "") : (textoNova ?? "");

/** Dropdown com pesquisa: botão (combobox select-only, ARIA 1.2) + painel com campo de pesquisa e listbox de options (aria-activedescendant).
 *  Setas, Home, End, Enter, Esc e Tab; sem campo de pesquisa, a primeira letra salta para a opção. */
export function ComboPesquisa({ rotulo, id, itens, atual, onEscolher, onNova, textoNova = "Nova opção…", semValor, placeholder = "Escolher…", vazio = "Nenhuma opção encontrada", desativado, semValorComoValor, obrigatorio, classeCampo, registar, pesquisavel, ocupado, descr }: Props) {
  const lid = useId();
  const idValor = `${lid}-valor`;
  const caixa = useRef<HTMLDivElement>(null); // a lista flutuante (portal) acompanha este wrapper
  const botao = useRef<HTMLButtonElement | null>(null);
  const painel = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const ul = useRef<HTMLUListElement>(null);
  const rotuloEl = useRef<HTMLLabelElement | null>(null);
  const botaoRef = useCallback((el: HTMLButtonElement | null) => { botao.current = el; registar?.(el); }, [registar]);
  const [q, setQ] = useState(""); // o que se escreve na pesquisa (nunca no botão)
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [pesq, setPesq] = useState(false); // o campo de pesquisa fixa-se ao abrir: não aparece a meio se a lista crescer
  const [idRotulo, setIdRotulo] = useState<string | null>(null); // o <label for> visível do campo, se houver
  // com rótulo visível o nome vem dele (e o valor junta-se por aria-labelledby); sem ele, fica o aria-label
  useEffect(() => {
    const l = id ? Array.from(document.getElementsByTagName("label")).find((x) => x.htmlFor === id) ?? null : null;
    rotuloEl.current = l;
    if (l && !l.id) l.id = `${lid}-rotulo`;
    setIdRotulo(l ? l.id : null);
  }, [id, lid]);
  // as desativadas não se escolhem: só aparecem no botão quando são a atual
  const escolhiveis = useMemo(() => itens.filter((x) => !x.inativo), [itens]);
  const comPesquisa = aberto ? pesq : (pesquisavel ?? escolhiveis.length > OPCOES_PARA_PESQUISAR);
  const filtradas = useMemo(() => {
    const t = semAcentos(comPesquisa ? q.trim() : "");
    return t ? escolhiveis.filter((x) => semAcentos(x.nome).includes(t)) : [...escolhiveis];
  }, [escolhiveis, q, comPesquisa]);
  const procura = comPesquisa && !!q.trim();
  const lista: Item[] = [...(semValor && !procura ? [{ k: "limpar" } as Item] : []), ...filtradas.map((i): Item => ({ k: "item", i })), ...(onNova ? [{ k: "nova" } as Item] : [])];
  const dentroDoPainel = (n: Node | null) => !!n && !!painel.current?.parentElement?.contains(n);
  /** Fecha. Com `devolver`, o foco volta ao botão se estava dentro do painel ou perdido no <body>. */
  const fechar = (devolver = true) => {
    if (devolver) {
      const a = document.activeElement;
      if (!a || a === document.body || dentroDoPainel(a)) botao.current?.focus();
    }
    setAberto(false);
    setQ("");
  };
  const fecharEFocar = () => { fechar(false); botao.current?.focus(); };
  const escolher = (it: Item) => {
    const escrito = q.trim();
    fecharEFocar();
    if (it.k === "nova") onNova?.(escrito); else if (it.k === "limpar") onEscolher({ id: "", nome: "" }); else onEscolher(it.i);
  };
  const daEscolhida = lista.findIndex((x) => x.k === "item" && x.i.id === atual?.id);
  const abrir = () => {
    if (aberto || ocupado) return;
    setPesq(pesquisavel ?? escolhiveis.length > OPCOES_PARA_PESQUISAR);
    setAberto(true);
    setAtivo(Math.max(0, daEscolhida));
  };
  // ao abrir: o foco vai para o campo de pesquisa (ou para a lista, se não há) e a lista rola até à escolhida (a única vez que rola sem teclado)
  useEffect(() => {
    if (!aberto) return;
    (comPesquisa ? entrada.current : ul.current)?.focus();
    if (daEscolhida >= 0) document.getElementById(`${lid}-${daEscolhida}`)?.scrollIntoView?.({ block: "nearest" });
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  // clicar fora (nem no botão, nem no painel, nem no rótulo, que passa o clique ao botão) fecha
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (caixa.current?.contains(alvo) || dentroDoPainel(alvo) || rotuloEl.current?.contains(alvo)) return;
      fechar(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  /** O campo saiu da vista. Com o teclado virtual aberto (a área visível encolhe) e o foco no painel não se fecha: o teclado é que o empurrou. */
  const sairDaVista = () => {
    const vv = window.visualViewport;
    if (vv && vv.height < window.innerHeight * 0.85 && dentroDoPainel(document.activeElement)) return;
    fechar();
  };
  /** O foco saiu do botão e do painel para outro sítio (Tab, sobretudo com a lista vazia, onde não há painel focável): fecha. */
  const aoPerderFoco = (e: FocusEvent<HTMLElement>) => {
    const r = e.relatedTarget as Node | null;
    if (!r || caixa.current?.contains(r) || dentroDoPainel(r)) return;
    fechar(false);
  };
  const valor = atual ? `${atual.nome}${atual.inativo ? " (desativada)" : ""}` : semValorComoValor ? (semValor ?? "") : "";
  const ativoId = aberto && lista[ativo] ? `${lid}-${ativo}` : undefined;
  /** Move a opção ativa (gesto de teclado) e traz-a à vista. O rato só marca, nunca rola. */
  const vai = (i: number) => {
    const n = Math.max(0, Math.min(lista.length - 1, i));
    setAtivo(n);
    document.getElementById(`${lid}-${n}`)?.scrollIntoView?.({ block: "nearest" });
  };
  /** Type-ahead simples (listas sem pesquisa): salta para a próxima opção que começa pela letra. */
  const salta = (letra: string) => {
    const t = semAcentos(letra);
    for (let d = 1; d <= lista.length; d++) {
      const k = (ativo + d) % lista.length;
      if (semAcentos(rotuloDe(lista[k], semValor, textoNova)).startsWith(t)) { vai(k); return; }
    }
  };
  /** Esc fecha e não sobe a ninguém (um Dialog por cima não o deve ver). */
  const escape = (e: KeyboardEvent<HTMLElement>) => { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); fecharEFocar(); };
  const noBotao = (e: KeyboardEvent<HTMLButtonElement>) => {
    // Enter e Espaço são o clique nativo do botão
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); abrir(); }
    else if (e.key === "Escape" && aberto) escape(e); // com a lista vazia não há painel focável: o Esc é tratado aqui
  };
  const noPainel = (e: KeyboardEvent<HTMLElement>) => {
    // com pesquisa, Home e End movem o cursor enquanto se escreve: só são da lista sem texto de pesquisa (ou com Ctrl)
    const daLista = !comPesquisa || !q || e.ctrlKey;
    if (e.key === "ArrowDown") { e.preventDefault(); vai(ativo + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); vai(ativo - 1); }
    else if (e.key === "Home" && daLista) { e.preventDefault(); vai(0); }
    else if (e.key === "End" && daLista) { e.preventDefault(); vai(lista.length - 1); }
    else if (e.key === "Enter" || (e.key === " " && !comPesquisa)) { e.preventDefault(); if (lista[ativo]) escolher(lista[ativo]); }
    else if (e.key === "Escape") escape(e);
    else if (e.key === "Tab") fecharEFocar(); // o foco volta ao botão e o Tab segue dele
    else if (!comPesquisa && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) salta(e.key);
  };
  // anuncia-se o que o listbox tem (todas as opções, a «Nova …» e a «sem valor» incluídas)
  const contagem = filtradas.length === 0 ? `${vazio}${onNova ? `, e ${textoNova}` : ""}` : lista.length === 1 ? "1 opção" : `${lista.length} opções`;
  const estado = aberto ? contagem : "";
  return (
    <div ref={caixa} className="relative">
      <button id={id} ref={botaoRef} type="button" role="combobox" {...(idRotulo ? { "aria-labelledby": `${idRotulo} ${idValor}` } : { "aria-label": rotulo })}
        aria-haspopup="listbox" aria-expanded={aberto} aria-controls={aberto && lista.length > 0 ? lid : undefined}
        aria-required={obrigatorio ? true : undefined} aria-disabled={ocupado ? true : undefined} aria-describedby={descr || undefined} disabled={desativado} onClick={() => (aberto ? fechar() : abrir())} onKeyDown={noBotao} onBlur={aberto ? aoPerderFoco : undefined}
        className={cn(CAMPO, "flex min-h-11 items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60", classeCampo)}>
        <span id={idValor} title={valor || undefined} className={cn("min-w-0 flex-1 truncate", !valor && "text-muted-foreground")}>{valor || placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {/* a região de estado está sempre montada (só muda o texto), para os leitores de ecrã a anunciarem */}
      <span role="status" className="sr-only">{estado}</span>
      {aberto && (
        <ListaFlutuante ancora={caixa} aoSairDaVista={sairDaVista} className="flex flex-col overflow-hidden">
          <div ref={painel} onBlur={aoPerderFoco} className="flex min-h-0 flex-1 flex-col">
            {comPesquisa && (
              <div className="relative shrink-0 p-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input ref={entrada} type="text" role="combobox" aria-expanded="true" aria-haspopup="listbox" aria-autocomplete="list" aria-label={`Pesquisar ${rotulo}`}
                  aria-controls={lista.length > 0 ? lid : undefined} aria-activedescendant={ativoId} autoComplete="off" spellCheck={false}
                  value={q} placeholder="Pesquisar…" onChange={(e) => { setQ(e.target.value); setAtivo(0); }} onKeyDown={noPainel} className={cn(CAMPO, "pl-9")} />
              </div>
            )}
            {!filtradas.length && <p className="px-3 py-2.5 text-[15px] text-muted-foreground">{vazio}</p>}
            {lista.length > 0 && (
              <ul id={lid} ref={ul} role="listbox" aria-label={rotulo} tabIndex={comPesquisa ? -1 : 0} aria-activedescendant={comPesquisa ? undefined : ativoId}
                onKeyDown={noPainel} className="min-h-0 flex-1 overflow-auto outline-none">
                {lista.map((it, k) => {
                  const grupo = it.k === "item" ? it.i.grupo : undefined;
                  const antes = lista[k - 1], novoGrupo = !!grupo && !(antes?.k === "item" && antes.i.grupo === grupo);
                  return (
                    <Fragment key={it.k === "item" ? it.i.id : it.k}>
                      {/* o cabeçalho do grupo é só visual: os leitores de ecrã ouvem as opções, que já dizem o que são */}
                      {novoGrupo && <li role="presentation" aria-hidden="true" className="px-3 pb-1 pt-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{grupo}</li>}
                      <li id={`${lid}-${k}`} role="option" aria-selected={it.k === "item" ? atual?.id === it.i.id : it.k === "limpar" ? !atual : false}
                        onClick={() => escolher(it)} onMouseEnter={() => setAtivo(k)}
                        className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-[15px]", k === ativo && "bg-muted ring-2 ring-inset ring-ring")}>
                        {it.k === "nova"
                          ? <><Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{textoNova}</>
                          : it.k === "limpar"
                          ? <span className={cn("min-w-0 flex-1", k === ativo ? "text-foreground" : "text-muted-foreground")}>{semValor}</span>
                          : <>
                            <span className="min-w-0 flex-1 break-words">{it.i.nome}</span>
                            {atual?.id === it.i.id && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                          </>}
                      </li>
                    </Fragment>
                  );
                })}
              </ul>
            )}
          </div>
        </ListaFlutuante>
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
