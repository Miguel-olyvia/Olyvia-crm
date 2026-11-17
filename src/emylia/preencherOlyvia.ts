// 17/11 (Rúben, depois de gravar um teste: «não preenche campos ou ajusta, nada»): a Olyvia preenche o que está no ecrã.
// Lê as perguntas visíveis (o rótulo e as respostas possíveis: botões, contadores, caixas de texto) e, da frase dita, tira as
// respostas: «acesso fácil, estacionamento pago, contentor de entulho na via pública, três andares» → carrega nos botões certos.
// Sem modelo e sem custo: o rótulo de cada pergunta dito na frase marca onde começa a resposta dela. Funciona em qualquer passo,
// porque lê o ecrã (CamposFase.tsx: role="group" com aria-labelledby, botões aria-pressed, contador «Menos»/«Mais», <label for>).
import { juntarLetras, normal, VERBO_PREENCHER } from "./comandoOlyvia";

export type TipoCampo = "opcoes" | "contador" | "texto";
export interface CampoEcra {
  rotulo: string;
  tipo: TipoCampo;
  /** As respostas possíveis (opcoes) e se cada uma já está escolhida. */
  opcoes?: { texto: string; ligado: boolean }[];
  /** Para o contador e o texto: o valor que se vê. */
  valor?: string;
}
type Resposta = { tipo: "opcao"; opcao: number } | { tipo: "contador"; n: number } | { tipo: "texto"; texto: string };
export type Acao = Resposta & { campo: number };

const PALAVRAS_VAZIAS = new Set(["o", "a", "os", "as", "do", "da", "dos", "das", "de", "ao", "aos", "e", "em", "no", "na", "para", "pra", "por", "um", "uma", "tem", "ha", "com", "sem", "que", "se"]);
const NUMEROS: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezasseis: 16, dezassete: 17, dezoito: 18, dezanove: 19, vinte: 20, rc: 0,
  // 17/11 (gravação: «no primeiro andar»): os andares dizem-se por ordinais
  primeiro: 1, segundo: 2, terceiro: 3, quarto: 4, quinto: 5, sexto: 6, setimo: 7, oitavo: 8, nono: 9, decimo: 10,
};

/** O rótulo sem «(opcional)» nem «Sugerido», normalizado. */
const rotuloLimpo = (r: string): string => normal(r.replace(/\((?:opcional|obrigatorio)\)/gi, "").replace(/\bsugerido\b/gi, ""));
/** A resposta sem o que vem entre parênteses («Na via pública (licença)» → «na via publica»). */
const opcaoLimpa = (o: string): string => normal(o.replace(/\([^)]*\)/g, ""));
/** Metros e afins como se escrevem nos botões («até 10 metros» → «ate 10 m»). */
const unidades = (s: string): string => s.replace(/\bmetros?\b/g, "m").replace(/\bmetros quadrados\b/g, "m2").replace(/\bcentimetros?\b/g, "cm");

/** As formas por que um rótulo se pode dizer: inteiro, sem «tem/o/a» no início, e a palavra principal (a primeira com ≥ 5 letras). */
export function chavesDoRotulo(rotulo: string): string[] {
  const r = rotuloLimpo(rotulo);
  if (!r) return [];
  const ks = new Set<string>([r]);
  const semInicio = r.replace(/^(?:(?:tem|ha|o|a|os|as|e)\s+)+/, "");
  if (semInicio) ks.add(semInicio);
  const principal = semInicio.split(" ").find((w) => w.length >= 5 && !PALAVRAS_VAZIAS.has(w));
  if (principal) ks.add(principal);
  return [...ks].sort((a, b) => b.length - a.length);
}

const posicoes = (s: string, k: string): number[] => {
  const r: number[] = [], alvo = ` ${k} `, t = ` ${s} `;
  let i = t.indexOf(alvo);
  while (i !== -1) { r.push(i); i = t.indexOf(alvo, i + 1); }
  return r; // índice em `s` (o espaço extra do início compensa o do alvo)
};

/** O número dito («3», «três», «rés-do-chão»). */
export function numeroDito(seg: string): number | null {
  const s = seg.replace(/\bres do chao\b/g, "rc");
  for (const w of s.split(" ")) {
    if (/^\d+$/.test(w)) return Number(w);
    if (w in NUMEROS) return NUMEROS[w];
  }
  return null;
}

/**
 * O plano: que resposta dar a cada pergunta, pela frase. Cada rótulo dito marca onde começa a resposta dele, até ao rótulo seguinte.
 * Respostas sem rótulo («fácil») só contam quando há uma única pergunta com essa resposta no ecrã.
 */
export function planoPreencher(frase: string, campos: readonly CampoEcra[]): Acao[] {
  const s = unidades(juntarLetras(normal(frase)).replace(VERBO_PREENCHER, ""));
  if (!s) return [];
  // 1) onde aparece o rótulo de cada pergunta (as chaves mais longas primeiro; cada pedaço da frase serve uma pergunta só)
  const pares = campos.flatMap((c, i) => chavesDoRotulo(c.rotulo).map((k) => ({ i, k }))).sort((a, b) => b.k.length - a.k.length);
  const usados: [number, number][] = [];
  const achados = new Map<number, { ini: number; fim: number; k: string }>();
  const livre = (a: number, b: number) => usados.every(([x, y]) => b <= x || a >= y);
  for (const { i, k } of pares) {
    if (achados.has(i)) continue;
    const p = posicoes(s, k).find((x) => livre(x, x + k.length));
    if (p == null) continue;
    achados.set(i, { ini: p, fim: p + k.length, k });
    usados.push([p, p + k.length]);
  }
  const ordem = [...achados.entries()].sort((a, b) => a[1].ini - b[1].ini);
  const acoes: Acao[] = [];
  const respondidos = new Set<number>();
  const pedacosUsados: [number, number][] = [...usados];
  ordem.forEach(([i, pos], j) => {
    const fimSeg = j + 1 < ordem.length ? ordem[j + 1][1].ini : s.length;
    const seg = s.slice(pos.fim, fimSeg).trim();
    const antes = s.slice(Math.max(0, pos.ini - 20), pos.ini);
    const a = resposta(campos[i], seg, /^(?:tem|ha|com)\b/.test(pos.k) ? `${antes} tem` : antes, pos.k);
    if (a) { acoes.push({ campo: i, ...a }); respondidos.add(i); pedacosUsados.push([pos.fim, fimSeg]); }
  });
  // 2) respostas ditas sem a pergunta («fácil», «sem estacionamento»): só se forem de uma pergunta só no ecrã
  const resto = (() => {
    let r = s;
    for (const [a, b] of pedacosUsados.sort((x, y) => y[0] - x[0])) r = r.slice(0, a) + " ".repeat(b - a) + r.slice(b);
    return r.replace(/\s+/g, " ").trim();
  })();
  if (resto) {
    const donos = new Map<string, number[]>();
    campos.forEach((c, i) => c.tipo === "opcoes" && c.opcoes!.forEach((o, k) => {
      const t = opcaoLimpa(o.texto);
      if (t.length >= 4 && !["sim", "nao"].includes(t)) donos.set(t, [...(donos.get(t) ?? []), i * 1000 + k]);
    }));
    const porTamanho = [...donos.entries()].sort((a, b) => b[0].length - a[0].length);
    let r = ` ${resto} `;
    for (const [t, ds] of porTamanho) {
      if (ds.length !== 1 || !r.includes(` ${t} `)) continue;
      const i = Math.floor(ds[0] / 1000), k = ds[0] % 1000;
      if (respondidos.has(i)) continue;
      acoes.push({ campo: i, tipo: "opcao", opcao: k });
      respondidos.add(i);
      r = r.replace(` ${t} `, " ");
    }
  }
  return acoes;
}

/** A resposta a uma pergunta, pelo pedaço da frase que vem depois do rótulo (e as palavras logo antes dele: «sem elevador»). */
function resposta(c: CampoEcra, seg: string, antes: string, chave = ""): Resposta | null {
  if (c.tipo === "opcoes") {
    const ops = c.opcoes!.map((o, k) => ({ k, t: opcaoLimpa(o.texto) }));
    const simNao = ops.length === 2 && ops.some((o) => o.t === "sim") && ops.some((o) => o.t === "nao");
    if (simNao) {
      const sim = ops.find((o) => o.t === "sim")!.k, nao = ops.find((o) => o.t === "nao")!.k;
      const primeira = seg.split(" ")[0] ?? "";
      if (/\b(?:sem|nao)\s*(?:tem)?\s*$/.test(antes) || /^(?:nao|sem)$/.test(primeira)) return { tipo: "opcao", opcao: nao };
      if (/^(?:sim|tem|ha|com|existe)$/.test(primeira) || /\b(?:tem|com|ha)\s*$/.test(antes)) return { tipo: "opcao", opcao: sim };
      return null;
    }
    // a resposta mais longa que aparece no pedaço («não pago» antes de «pago»); palavras inteiras
    const porTamanho = [...ops].sort((a, b) => b.t.length - a.t.length);
    const achada = porTamanho.find((o) => o.t && ` ${seg} `.includes(` ${o.t} `))
      // a resposta pode conter o próprio rótulo («sem estacionamento»): procura-se também com a palavra de antes e o rótulo
      ?? porTamanho.find((o) => o.t && ` ${antes.trim().split(" ").pop() ?? ""} ${chave} ${seg} `.includes(` ${o.t} `));
    if (achada) return { tipo: "opcao", opcao: achada.k };
    // ou a primeira palavra do pedaço parecida com a primeira de uma resposta («facil» ~ «fácil» já são iguais; «dificel» ~ «difícil»)
    const w = seg.split(" ")[0];
    if (w && w.length >= 4) {
      const parecida = ops.find((o) => o.t.split(" ")[0] && semelhanca(w, o.t.split(" ")[0]) >= 0.8);
      if (parecida) return { tipo: "opcao", opcao: parecida.k };
    }
    return null;
  }
  if (c.tipo === "contador") {
    // «primeiro andar», «quatro andares»: o número logo antes do rótulo ganha ao que vem depois (que já pode ser de outra pergunta)
    const n = numeroDito(antes.trim().split(" ").pop() ?? "") ?? numeroDito(seg.split(" ").slice(0, 3).join(" "));
    return n == null ? null : { tipo: "contador", n };
  }
  const texto = seg.replace(/^(?:(?:e|é|:|de|do|da|que|o|a|igual a|fica)\s+)+/, "").trim();
  return texto ? { tipo: "texto", texto } : null;
}

function semelhanca(a: string, b: string): number {
  const m = Math.max(a.length, b.length);
  if (!m) return 1;
  const v = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let ant = v[0]; v[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = v[j]; v[j] = Math.min(v[j] + 1, v[j - 1] + 1, ant + (a[i - 1] === b[j - 1] ? 0 : 1)); ant = t; }
  }
  return 1 - v[b.length] / m;
}

// ------------------------------------------------------------------ o ecrã: ler as perguntas e carregar nos botões

interface CampoDom extends CampoEcra { botoes?: HTMLButtonElement[]; menos?: HTMLButtonElement; mais?: HTMLButtonElement; saida?: HTMLElement; entrada?: HTMLInputElement | HTMLTextAreaElement }

const JSDOM = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
/** Está no ecrã (não escondido) e não é da própria Olyvia nem da pesquisa geral do topo. */
const aVista = (el: Element): boolean =>
  !el.closest("[data-olyvia],[hidden],[aria-hidden='true'],header") && (JSDOM || (el as HTMLElement).getClientRects().length > 0);

const textoDe = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** As perguntas que se veem agora no ecrã. */
export function lerCampos(raiz: ParentNode = document): CampoDom[] {
  const r: CampoDom[] = [];
  const vistos = new Set<Element>();
  for (const g of Array.from(raiz.querySelectorAll<HTMLElement>("[role='group']"))) {
    if (!aVista(g)) continue;
    const idRot = g.getAttribute("aria-labelledby");
    const rotulo = idRot ? textoDe(document.getElementById(idRot.split(" ")[0])) : g.getAttribute("aria-label") ?? "";
    if (!rotulo) continue;
    const menos = g.querySelector<HTMLButtonElement>("button[aria-label='Menos']"), mais = g.querySelector<HTMLButtonElement>("button[aria-label='Mais']");
    if (menos && mais) {
      r.push({ rotulo, tipo: "contador", menos, mais, saida: g.querySelector<HTMLElement>("output") ?? undefined, valor: textoDe(g.querySelector("output")) });
      continue;
    }
    const botoes = Array.from(g.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")).filter((b) => !b.disabled);
    if (!botoes.length) continue;
    botoes.forEach((b) => vistos.add(b));
    r.push({ rotulo, tipo: "opcoes", botoes, opcoes: botoes.map((b) => ({ texto: textoDe(b).replace(/\(marque para avançar\)/, "").trim(), ligado: b.getAttribute("aria-pressed") === "true" })) });
  }
  // as caixas de escrever com rótulo (<label for>), fora da pesquisa e da própria Olyvia
  for (const e of Array.from(raiz.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type]),input[type='text'],input[type='number'],textarea"))) {
    if (!aVista(e) || e.readOnly || e.disabled || !e.id) continue;
    const lab = document.querySelector(`label[for="${CSS.escape(e.id)}"]`);
    const rotulo = lab ? textoDe(lab.querySelector("[id$='-rot']") ?? lab).replace(/\s*\(opcional\)\s*$/i, "") : e.getAttribute("aria-label") ?? "";
    if (!rotulo || rotulo.length > 80) continue;
    r.push({ rotulo, tipo: "texto", entrada: e, valor: e.value });
  }
  return r;
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
/** O número que o contador mostra («—» vazio, «R/C» é 0). */
const valorContador = (c: CampoDom): number | null => {
  const t = textoDe(c.saida ?? null);
  if (!t || t === "—") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Escreve numa caixa controlada pelo React (o «value» nativo + input + blur, que é quando a ficha grava). */
function escrever(e: HTMLInputElement | HTMLTextAreaElement, texto: string) {
  const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  e.focus();
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(e, texto);
  e.dispatchEvent(new Event("input", { bubbles: true }));
  e.dispatchEvent(new Event("change", { bubbles: true }));
  e.blur();
}

/** Faz o plano no ecrã e devolve o que fez, para a Olyvia dizer («Acesso: Fácil · Estacionamento: Pago»). */
export async function executarPlano(campos: CampoDom[], plano: readonly Acao[]): Promise<string[]> {
  const feito: string[] = [];
  for (const a of plano) {
    const c = campos[a.campo];
    if (a.tipo === "opcao" && c.botoes) {
      const b = c.botoes[a.opcao], o = c.opcoes![a.opcao];
      if (!o.ligado) b.click();
      feito.push(`${c.rotulo.replace(/\s*\(opcional\)\s*/i, "")}: ${o.texto}`);
      await esperar(60);
    } else if (a.tipo === "contador" && c.menos && c.mais) {
      // carregar em + ou − até o número ser o dito (a ficha grava a cada toque; espera-se que o número mude)
      for (let i = 0; i < 40; i++) {
        const v = valorContador(c);
        if (v === a.n) break;
        const botao = v == null || v < a.n ? c.mais : c.menos;
        if (botao.disabled) break;
        const antes = textoDe(c.saida ?? null);
        botao.click();
        for (let k = 0; k < 30 && textoDe(c.saida ?? null) === antes; k++) await esperar(50);
      }
      feito.push(`${c.rotulo}: ${textoDe(c.saida ?? null) || a.n}`);
    } else if (a.tipo === "texto" && c.entrada) {
      escrever(c.entrada, a.texto);
      feito.push(`${c.rotulo}: ${a.texto}`);
      await esperar(60);
    }
  }
  return feito;
}

/** Tenta preencher o ecrã com a frase. Devolve o que fez (vazio se a frase não responde a nenhuma pergunta à vista). */
export async function preencherPelaFrase(frase: string): Promise<string[]> {
  const campos = lerCampos();
  if (!campos.length) return [];
  const plano = planoPreencher(frase, campos);
  return plano.length ? executarPlano(campos, plano) : [];
}

// ------------------------------------------------------------------ andar na página e limpar a pesquisa

/** O que faz scroll na página: a área principal (a maior caixa com scroll) ou a própria página. */
function areaComScroll(): HTMLElement {
  let melhor: HTMLElement | null = null, area = 0;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("main, [class*='overflow-y-auto'], [class*='overflow-auto'], div"))) {
    if (el.closest("[data-olyvia]") || el.scrollHeight <= el.clientHeight + 20) continue;
    const st = getComputedStyle(el);
    if (!/(auto|scroll)/.test(st.overflowY)) continue;
    const a = el.clientWidth * el.clientHeight;
    if (a > area) { area = a; melhor = el; }
  }
  const pagina = (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
  return melhor && area > pagina.clientWidth * pagina.clientHeight * 0.3 ? melhor : pagina;
}

export function andarNaPagina(para: "baixo" | "cima" | "topo" | "fundo"): void {
  const el = areaComScroll();
  const passo = Math.round(el.clientHeight * 0.75) || 600;
  const top = para === "topo" ? 0 : para === "fundo" ? el.scrollHeight : el.scrollTop + (para === "baixo" ? passo : -passo);
  el.scrollTo({ top, behavior: "smooth" });
}

/** A caixa de pesquisa da página (não a pesquisa geral do topo). */
export function caixaDePesquisa(): HTMLInputElement | null {
  const todas = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='search'], input[placeholder^='Procurar'], input[placeholder^='Pesquisar']"));
  return todas.find((e) => aVista(e) && !/^Procurar PO/.test(e.placeholder)) ?? null;
}

/** Escreve (ou limpa, com "") a pesquisa da página. Devolve false se não há pesquisa à vista. */
export function escreverNaPesquisa(texto: string): boolean {
  const e = caixaDePesquisa();
  if (!e) return false;
  const proto = HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(e, texto);
  e.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
