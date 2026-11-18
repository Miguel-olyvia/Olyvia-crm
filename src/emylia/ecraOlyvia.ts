// 18/11 (Rúben: «quero controlar tudo por voz»): o ecrã inteiro para a IA da Olyvia. Antes ela só via as perguntas dos formulários e meia
// dúzia de páginas; agora vê tudo o que se pode tocar (botões, ligações, separadores, caixas, listas, interruptores), numerado, com a zona
// onde está (a janela aberta, a linha da lista, a secção) e o texto que se lê na página — e faz as ações por esses números. Assim
// qualquer ecrã da app se controla por voz sem regras novas para cada um. Só lógica de DOM, sem React, para testar à parte.
import { normal } from "./comandoOlyvia";
import { escrever } from "./preencherOlyvia";

export type TipoElemento = "botao" | "ligacao" | "separador" | "caixa" | "lista" | "interruptor";
export interface ElementoEcra {
  tipo: TipoElemento;
  texto: string;
  valor?: string;
  opcoes?: string[];
  estado?: string;
  zona?: string;
  /** Existe, mas não se vê sem andar na página. */
  fora?: boolean;
}
export interface Ecra { elementos: ElementoEcra[]; nos: HTMLElement[]; texto: string }

const SELETOR = [
  "button", "a[href]", "[role='button']", "[role='tab']", "[role='menuitem']", "[role='menuitemcheckbox']", "[role='menuitemradio']",
  "[role='option']", "[role='switch']", "[role='checkbox']", "[role='radio']", "[role='combobox']", "[role='link']", "input", "textarea", "select",
].join(",");
export const MAX_ELEMENTOS = 220;
const MAX_TEXTO = 6000;

const JSDOM = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
const textoDe = (el: Element | null | undefined): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const corta = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** Visível e não é da própria Olyvia (nem de uma parte escondida, nem do que fica por trás de uma janela aberta: o Radix põe-no aria-hidden). */
export function visivel(el: Element): boolean {
  if (el.closest("[data-olyvia],[hidden],[aria-hidden='true'],[inert]")) return false;
  if (JSDOM) return true;
  const h = el as HTMLElement;
  if (!h.getClientRects().length) return false;
  const st = getComputedStyle(h);
  return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05;
}

const desligado = (el: HTMLElement): boolean =>
  (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";

/** O nome que uma pessoa usaria para o elemento (o que se lê nele, o rótulo, o aria-label). */
export function nomeDe(el: HTMLElement): string {
  const lb = el.getAttribute("aria-labelledby");
  if (lb) {
    const t = lb.split(/\s+/).map((id) => textoDe(document.getElementById(id))).join(" ").trim();
    if (t) return t;
  }
  const aria = el.getAttribute("aria-label")?.trim() ?? "";
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const lab = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
    const daLabel = textoDe(lab) || (el.closest("label") ? textoDe(el.closest("label")).replace(el instanceof HTMLSelectElement ? textoDe(el) : "", "").trim() : "");
    return daLabel || aria || el.getAttribute("placeholder") || el.title || el.name || "";
  }
  const t = textoDe(el);
  if (aria && (!t || t.length > 70)) return aria;
  return t || aria || el.title || "";
}

function tipoDe(el: HTMLElement): TipoElemento | null {
  const role = el.getAttribute("role");
  if (el instanceof HTMLSelectElement || role === "combobox") return "lista";
  if (el instanceof HTMLTextAreaElement) return "caixa";
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    if (["hidden", "password", "file", "submit", "reset", "image", "button"].includes(t)) return t === "submit" || t === "button" ? "botao" : null;
    if (t === "checkbox" || t === "radio") return "interruptor";
    return "caixa";
  }
  if (role === "switch" || role === "checkbox" || role === "radio" || role === "menuitemcheckbox" || role === "menuitemradio") return "interruptor";
  if (role === "tab") return "separador";
  if (el instanceof HTMLAnchorElement || role === "link") return "ligacao";
  return "botao";
}

function estadoDe(el: HTMLElement): string | undefined {
  const marcado = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? el.checked
    : el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-pressed") === "true" ? true
      : el.getAttribute("aria-checked") === "false" || el.getAttribute("aria-pressed") === "false" ? false : null;
  const e: string[] = [];
  if (marcado === true) e.push("ligado"); else if (marcado === false) e.push("desligado");
  if (el.getAttribute("aria-selected") === "true" || el.getAttribute("data-state") === "active") e.push("escolhido");
  if (el.getAttribute("aria-expanded") === "true") e.push("aberto");
  if (el.getAttribute("aria-current") && el.getAttribute("aria-current") !== "false") e.push("atual");
  // 18/11: o «Enviar» da conversa só acende depois de escrever; a IA tem de saber que existe
  if (desligado(el)) e.push("inativo");
  return e.length ? e.join(", ") : undefined;
}

/** Onde o elemento está: a janela aberta, a linha da lista (o texto dela), ou a secção (o título). Ajuda a IA a escolher entre três «Abrir». */
export function zonaDe(el: HTMLElement): string | undefined {
  const dlg = el.closest<HTMLElement>("[role='dialog'],[role='alertdialog']");
  const tituloDe = (c: HTMLElement): string => {
    const lb = c.getAttribute("aria-labelledby");
    return (lb ? textoDe(document.getElementById(lb.split(/\s+/)[0])) : "") || c.getAttribute("aria-label") || textoDe(c.querySelector("h1,h2,h3,h4,legend"));
  };
  const proprio = textoDe(el);
  let p: HTMLElement | null = el.parentElement, nivel = 0;
  let linha = "";
  while (p && nivel < 8 && p !== dlg) {
    if (p.matches("li,tr,[role='row'],[role='listitem'],article")) {
      linha = textoDe(p).replace(proprio, "").replace(/\s+/g, " ").trim();
      if (linha) break;
    }
    if (p.matches("section,form,nav,aside,header,fieldset,[role='region'],[role='group'],[role='tabpanel'],[role='menu'],[role='listbox']")) {
      const t = tituloDe(p);
      if (t && t !== proprio) { linha = t; break; }
    }
    p = p.parentElement; nivel++;
  }
  const partes = [dlg ? `janela «${corta(tituloDe(dlg) || "aberta", 50)}»` : "", linha ? corta(linha, 70) : ""].filter(Boolean);
  return partes.length ? partes.join(" › ") : undefined;
}

const foraDeVista = (el: HTMLElement): boolean => {
  if (JSDOM) return false;
  const r = el.getBoundingClientRect();
  return r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth;
};

/**
 * O ecrã: os elementos que se podem tocar (os que se veem primeiro; os de fora de vista a seguir, até MAX_ELEMENTOS) e o texto da página.
 * `excluir`: os que já vão à IA como perguntas do formulário (as respostas «Sim/Não», os contadores, as caixas com rótulo).
 */
export function lerEcra(excluir: ReadonlySet<Element> = new Set()): Ecra {
  const aVista: { el: HTMLElement; e: ElementoEcra }[] = [], fora: { el: HTMLElement; e: ElementoEcra }[] = [];
  const vistos = new Set<string>();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(SELETOR))) {
    if (excluir.has(el) || !visivel(el)) continue;
    // um botão dentro de outro (o cartão inteiro é um botão, com «Abrir» lá dentro): fica o de dentro, que é o que se diz
    const tipo = tipoDe(el);
    if (!tipo) continue;
    const texto = corta(nomeDe(el), 120);
    if (!texto && tipo !== "caixa") continue;
    const e: ElementoEcra = { tipo, texto: texto || "(sem nome)" };
    if (el instanceof HTMLSelectElement) {
      e.opcoes = Array.from(el.options).map((o) => corta(o.text.trim(), 80)).filter(Boolean).slice(0, 40);
      const sel = el.selectedOptions[0]?.text.trim();
      if (sel) e.valor = corta(sel, 120);
    } else if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && tipo === "caixa") {
      if (el.value) e.valor = corta(el.value, 160);
      if ((el as HTMLInputElement).type && !["text", "search", "textarea"].includes((el as HTMLInputElement).type)) e.estado = (el as HTMLInputElement).type;
    } else if (el.getAttribute("role") === "combobox") {
      const v = textoDe(el);
      if (v && v !== texto) e.valor = corta(v, 120);
    }
    const est = estadoDe(el);
    if (est) e.estado = e.estado ? `${e.estado}, ${est}` : est;
    const z = zonaDe(el);
    if (z) e.zona = z;
    // o mesmo botão repetido na mesma zona (ícones duplicados no telemóvel e no computador) conta uma vez
    const chave = `${e.tipo}|${e.texto}|${e.zona ?? ""}|${e.valor ?? ""}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    if (foraDeVista(el)) { e.fora = true; fora.push({ el, e }); } else aVista.push({ el, e });
  }
  const todos = [...aVista, ...fora].slice(0, MAX_ELEMENTOS);
  return { elementos: todos.map((x) => x.e), nos: todos.map((x) => x.el), texto: textoDaPagina() };
}

/** O que se lê na página (a janela aberta primeiro), para a IA responder a perguntas («quanto custa a proposta?»). */
export function textoDaPagina(): string {
  const partes: string[] = [];
  const ler = (el: Element) => {
    const h = el as HTMLElement;
    const t = (JSDOM ? h.textContent : h.innerText ?? h.textContent) ?? "";
    return t.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  };
  for (const d of Array.from(document.querySelectorAll("[role='dialog'],[role='alertdialog']"))) if (visivel(d)) partes.push(`[Janela aberta]\n${ler(d)}`);
  const main = document.querySelector("main") ?? document.body;
  const copia = main.cloneNode(true) as HTMLElement;
  copia.querySelectorAll("[data-olyvia],script,style,svg,[aria-hidden='true']").forEach((x) => x.remove());
  partes.push(JSDOM ? ler(copia) : ler(main));
  return corta(partes.join("\n\n"), MAX_TEXTO);
}

// ------------------------------------------------------------------ fazer: carregar, escrever, escolher

/** Carregar como um dedo: os botões do Radix (menus, listas de escolha, separadores) abrem no «pointerdown», não no «click». */
export function carregar(el: HTMLElement): void {
  el.scrollIntoView?.({ block: "center" });
  const base = { bubbles: true, cancelable: true, composed: true, button: 0 };
  // o que o browser não deixar construir não impede o clique
  const enviar = (tipo: string, init: MouseEventInit & { pointerType?: string; isPrimary?: boolean }) => {
    try {
      const P = tipo.startsWith("pointer") && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
      el.dispatchEvent(new P(tipo, init));
    } catch { /* ignore */ }
  };
  enviar("pointerdown", { ...base, buttons: 1, pointerType: "mouse", isPrimary: true });
  enviar("mousedown", { ...base, buttons: 1 });
  el.focus?.({ preventScroll: true });
  enviar("pointerup", { ...base, buttons: 0, pointerType: "mouse", isPrimary: true });
  enviar("mouseup", { ...base, buttons: 0 });
  el.click();
}

/** Escreve numa caixa (substitui o que lá está). */
export function escreverEm(el: HTMLElement, texto: string): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.scrollIntoView?.({ block: "center" });
    escrever(el, texto);
    return true;
  }
  return false;
}

/** Escolhe a opção pelo texto numa lista nativa (<select>). Numa lista do Radix, abre-a (a opção escolhe-se no ecrã seguinte). */
export function escolherEm(el: HTMLElement, texto: string): boolean {
  if (!(el instanceof HTMLSelectElement)) { carregar(el); return false; }
  const alvo = normal(texto);
  const ops = Array.from(el.options);
  const o = ops.find((x) => normal(x.text) === alvo) ?? ops.find((x) => normal(x.text).includes(alvo)) ?? ops.find((x) => alvo.includes(normal(x.text)) && normal(x.text).length > 2);
  if (!o) return false;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, o.value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/** O que não se desfaz: pede sempre confirmação («Vou carregar em "Enviar proposta". Confirmas?»). */
export const IRREVERSIVEL = /\b(?:enviar|envia|reenviar|eliminar|elimina|apagar|apaga|excluir|remover|remove|assinar|assina|aceitar|aceita|pagar|paga|registar|regista|emitir|emite|cancelar|anular|perdid[oa]|descartar|arquivar|terminar sess|sair|logout|revogar|repor password|submeter|confirmar|aprovar|aprova|rejeitar|recusar|concluir|finalizar|fechar (?:o )?(?:negocio|obra|fatura)|marcar como (?:paga|pago|perdido|ganho)|dar (?:baixa|entrada))/i;
/** 18/11: o que mexe na obra ou nas compras, só quando o botão COMEÇA assim (o cartão «TESTE · … Arrancar a obra · qua» abre-se sem perguntar). */
const IRREVERSIVEL_INICIO = /^(?:arrancar|iniciar|comecar) (?:a )?obra|^(?:encomendar|adjudicar|faturar|gerar (?:a )?fatura|emitir)/i;
export const eIrreversivel = (nome: string): boolean => { const n = normal(nome); return IRREVERSIVEL.test(n) || IRREVERSIVEL_INICIO.test(n); };

/** Espera que o ecrã assente depois de uma ação (a página nova a carregar, a janela a abrir): sem mudanças por `calma` ms, ou `max`. */
export function assentar(max = 2500, calma = 350): Promise<void> {
  return new Promise((ok) => {
    if (typeof MutationObserver === "undefined") { setTimeout(ok, calma); return; }
    let t: ReturnType<typeof setTimeout> | null = null;
    const acabar = () => { obs.disconnect(); if (t) clearTimeout(t); clearTimeout(fim); ok(); };
    const obs = new MutationObserver(() => { if (t) clearTimeout(t); t = setTimeout(acabar, calma); });
    const fim = setTimeout(acabar, max);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    t = setTimeout(acabar, calma);
  });
}
