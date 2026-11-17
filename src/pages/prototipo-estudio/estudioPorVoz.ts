// 17/11 (Rúben: «depois no Estúdio falta ele trabalhar também»): a Olyvia por voz dentro do Estúdio. Uma frase dita (ou escrita na
// caixa da Olyvia) faz o que se pede no projeto, em qualquer passo:
//  · os passos: «vai para o estilo», «3D», «a proposta», «próximo passo», «volta ao negócio», «mostra ao cliente»;
//  · as alturas: «o pé-direito é 2,60», «pé direito de 255», «teto falso a 2,40», «sem teto falso»;
//  · a divisão: «é uma cozinha»;
//  · as peças e os serviços, com o leitor das conversas (pedidosDaConversa.ts): «tira o bidé», «troca a banheira por uma base de
//    duche», «põe um toalheiro», «quero um nicho no duche»;
//  · o estilo, com o leitor das cores (estiloDaConversa.ts): «quero tudo em preto», «o móvel em madeira».
// Só lógica (o EstudioProjeto aplica o resultado), para testar à parte.
import type { Fala } from "@/emylia/chamadaMotor";
import { PECAS, PLANTA_VAZIA, faltaFechar, juntarPeca, mudarComprimento, mudarComprimentoFechada, retangulo, type Planta, type TipoPeca } from "@/emylia/planta";
import { aplicarEstilo, colocar, juntarServico, tirarServico, type Projeto } from "./necessidadesEstudio";
import { melhorPara } from "./catalogoFake";
import { mudarODepois, seguirOAntes } from "./posicoesDepois";
import { tipoPecaDeTexto } from "./pedidosDaConversa";
import { recusarSugestao } from "./sugestoesServicos";
import { ditosDaConversa, estiloDosDitos, juntarEstilo, nomeCor } from "./estiloDaConversa";
import { pedidosDaConversa, resumoPedidos } from "./pedidosDaConversa";
import { aplicarPeca, comEstilo } from "./EstiloOuvido";

export const PASSOS_ESTUDIO = ["Antes", "Estilo", "Depois", "3D", "Proposta", "Fechar"] as const;

/** Minúsculas e sem acentos, mas com os números inteiros («2,60» fica «2,60»). */
const simples = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9,.\s-]/g, " ").replace(/-/g, " ").replace(/\s+/g, " ").trim();
/** Sem pontuação nenhuma, para comparar nomes. */
const nome = (s: string) => simples(s).replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();

const NOMES_PASSO: [RegExp, number][] = [
  [/^(?:o |a )?(?:antes|como esta hoje|planta de antes|a planta|planta)$/, 0],
  [/^(?:o |os )?(?:estilo|estilos|cores|as cores)$/, 1],
  [/^(?:o )?(?:depois|como vai ficar)$/, 2],
  [/^(?:o )?(?:3d|3 d|tres d|tridimensional|em 3d|ver em 3d)$/, 3],
  [/^(?:a )?(?:proposta|orcamento|o orcamento|necessidades|as necessidades)$/, 4],
  [/^(?:o )?(?:fechar|fecho|plano|plano da obra|o plano da obra|fechar a visita|fim|final|ultimo passo)$/, 5],
  [/^(?:o )?(?:inicio|primeiro passo|comeco)$/, 0],
];
const VERBO_IR = /^(?:(?:vai|vamos|ir|passa|passar|salta|abre|abrir|mostra|mostrar|ve|ver|entra|volta|voltar)\s+)?(?:(?:para|pra|pro|ao|a|o|as|os|no|na|ate)\s+)*(?:(?:o )?passo\s+(?:do |da |de )?)?/;

export type RespostaEstudio = { passo?: number; voltar?: boolean; mostrar?: boolean; p?: Projeto; partes: string[] };

/** O passo pedido (índice), ou voltar ao negócio / mostrar ao cliente. */
export function passoNoEstudio(frase: string, atual: number): Omit<RespostaEstudio, "p" | "partes"> | null {
  const n = nome(frase).replace(/^(?:ok|pronto|entao|agora|olyvia|olivia)\s+/g, "");
  if (/\b(?:volta|voltar|regressa|sai|sair)\b.*\bnegocio\b|\bsair do estudio\b/.test(n)) return { voltar: true };
  if (/\b(?:mostra|mostrar|apresenta|apresentar)\b.*\bcliente\b/.test(n)) return { mostrar: true };
  if (/^(?:proximo|seguinte|avanca|avancar|proximo passo|passo seguinte|continua|continuar)$/.test(n)) return { passo: Math.min(PASSOS_ESTUDIO.length - 1, atual + 1) };
  if (/^(?:anterior|passo anterior|volta atras|volta para tras|recua)$/.test(n)) return { passo: Math.max(0, atual - 1) };
  const alvo = n.replace(VERBO_IR, "").trim();
  for (const [rx, i] of NOMES_PASSO) if (rx.test(alvo)) return { passo: i };
  return null;
}

/** Um número em centímetros: «2,60», «2.6», «2 metros e 60» → 260; «255» → 255. */
function cm(texto: string): number | null {
  const m = texto.match(/(\d+)(?:[.,](\d{1,2}))?\s*(metros?|centimetros?|cm|m)?(?:\s+e\s+(\d{1,2}))?/);
  if (!m) return null;
  const int = Number(m[1]);
  const dec = m[2] ?? m[4];
  if (int <= 9 || m[3]?.startsWith("m")) return Math.round((int + (dec ? Number(dec.padEnd(2, "0")) / 100 : 0)) * 100);
  return int;
}

/** As alturas ditas: o pé-direito e o teto falso (null = sem teto falso). */
export function alturasNoEstudio(frase: string): { peDireito?: number; tetoFalso?: number | null } | null {
  const s = simples(frase);
  const r: { peDireito?: number; tetoFalso?: number | null } = {};
  const pd = s.match(/\bpe direito\b(.*)/);
  if (pd) { const v = cm(pd[1].split(/\bteto\b/)[0]); if (v && v >= 150 && v <= 600) r.peDireito = v; }
  if (/\b(?:sem|nao (?:tem|ha|leva|vai ter)|tira(?:r)? o) teto falso\b/.test(s)) r.tetoFalso = null;
  else {
    const tf = s.match(/\bteto falso\b(.*)/);
    if (tf) { const v = cm(tf[1]); r.tetoFalso = v && v >= 150 && v <= 600 ? v : /\b(?:tem|com|ha|leva|vai ter|poe|mete|sim)\b/.test(s) ? 240 : undefined; if (r.tetoFalso === undefined) delete r.tetoFalso; }
  }
  return Object.keys(r).length ? r : null;
}

/** «é uma cozinha», «muda para casa de banho». */
export function divisaoNoEstudio(frase: string): "Casa de banho" | "Cozinha" | null {
  const n = nome(frase);
  const m = n.match(/^(?:(?:e|isto e|muda para|passa a|passa para|a divisao e|divisao)\s+)?(?:uma |a )?(cozinha|casa de banho|wc)$/);
  return m ? (m[1] === "cozinha" ? "Cozinha" : "Casa de banho") : null;
}

// ------------------------------------------------------------------ 17/11 (Rúben: «o Estúdio super dinâmico: limpa paredes ele remove
// tudo, adiciona banheira ele adiciona…», «tudo por voz»): a planta por voz

/** «desfaz», «anula», «volta como estava». */
export const pedeDesfazer = (frase: string): boolean => /^(?:desfaz|desfazer|desfaz isso|anula|anular|anula isso|volta como estava|nao era isso|enganei me)$/.test(nome(frase));

const PECA_EXTRA: [RegExp, TipoPeca][] = [[/^portas?$/, "porta"], [/^janelas?$/, "janela"], [/^colunas?$/, "coluna"]];
/** As peças ditas, por ordem («põe uma sanita e um bidé» → sanita, bidé). */
export function pecasDitas(frase: string): TipoPeca[] {
  const out: TipoPeca[] = [];
  for (const w of frase.toLowerCase().match(/[\p{L}\d-]+/gu) ?? []) {
    const t = w === "movel" || w === "móvel" ? "movel" : (PECA_EXTRA.find(([rx]) => rx.test(w.normalize("NFD").replace(/[̀-ͯ]/g, "")))?.[1] ?? tipoPecaDeTexto(w));
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Os dois números de «2,50 por 1,80», «250 x 180», «1,70 por 70», em cm. */
function porMedidas(s: string): [number, number] | null {
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:m|metros?|cm)?\s*(?:por|x|vezes)\s*(\d+(?:[.,]\d+)?)\s*(m|metros?|cm)?/);
  if (!m) return null;
  const a = cm(m[1]), b = cm(m[2]);
  return a && b ? [a, b] : null;
}

/** Que parede: «parede 2», «a segunda parede», «a parede de cima / da direita / de baixo / da esquerda». */
function paredeDita(n: string, pl: Planta): number | null {
  const ord = ["primeira", "segunda", "terceira", "quarta", "quinta", "sexta", "setima", "oitava"];
  const num = n.match(/\bparede (\d)\b/);
  if (num) { const i = Number(num[1]) - 1; return i >= 0 && i < pl.paredes.length ? i : null; }
  const o = ord.findIndex((w) => new RegExp(`\\b${w} parede\\b|\\bparede ${w}\\b`).test(n));
  if (o >= 0) return o < pl.paredes.length ? o : null;
  const lado: [RegExp, string][] = [[/\bparede (?:de|do|la de) (?:cima|topo|fundo)\b/, "E"], [/\bparede da direita\b/, "S"], [/\bparede (?:de|la de) baixo\b/, "W"], [/\bparede da esquerda\b/, "N"]];
  for (const [rx, r] of lado) if (rx.test(n)) {
    // o lado com mais de uma parede (em L): a mais comprida
    let melhor = -1;
    pl.paredes.forEach((w, i) => { if (w.r === r && (melhor < 0 || w.c > pl.paredes[melhor].c)) melhor = i; });
    return melhor >= 0 ? melhor : null;
  }
  return null;
}

const ADICIONA = /\b(?:adiciona|adicionar|acrescenta|acrescentar|poe|por|pomos|ponha|mete|meter|coloca|colocar|junta|juntar|desenha|desenhar|insere|inserir|ha|tem|existe|mais)\b/;
const TIRA = /\b(?:tira|tirar|retira|retirar|remove|remover|apaga|apagar|elimina|eliminar|sai|sem)\b/;
const RODA = /\b(?:roda|rodar|vira|virar|gira|girar)\b/;
const MOVE = /\b(?:move|mover|mexe|mexer|passa|chega|encosta|desloca|empurra|leva|anda com)\b.*\b(esquerda|direita|cima|baixo)\b/;

let seq = Date.now() % 100000;
const novoId = () => `vz${++seq}`;

/** A planta mudada pela frase (paredes e peças), com o que se fez. Null se a frase não é sobre a planta. */
export function plantaPorVoz(frase: string, pl: Planta, comParedes: boolean): { planta: Planta; partes: string[] } | null {
  const s = simples(frase), n = nome(frase);
  if (comParedes && /\b(?:apaga|apagar|limpa|limpar)\b\s+(?:tudo|a planta(?: toda)?)\b|\b(?:comeca|comecar|recomeca|recomecar) do zero\b|\bplanta nova\b/.test(n))
    return { planta: { ...PLANTA_VAZIA }, partes: ["Planta limpa"] };
  if (comParedes && /\b(?:apaga|apagar|limpa|limpar|tira|tirar|remove|remover|elimina)\b.*\bparedes?\b/.test(n))
    return { planta: { ...PLANTA_VAZIA, pecas: pl.pecas }, partes: ["Paredes apagadas"] };
  const tipos = pecasDitas(frase);
  const medidas = porMedidas(s);
  // uma peça com medidas: o tamanho dela («a banheira tem 1,70 por 70»)
  if (tipos.length === 1 && medidas) {
    const alvo = [...pl.pecas].reverse().find((pc) => pc.tipo === tipos[0]);
    if (alvo) return { planta: { ...pl, pecas: pl.pecas.map((pc) => (pc.id === alvo.id ? { ...pc, w: medidas[0], h: medidas[1] } : pc)) }, partes: [`${PECAS[tipos[0]].n}: ${medidas[0]} × ${medidas[1]} cm`] };
  }
  // sem peça, com medidas: a divisão é um retângulo («a casa de banho tem 2,50 por 1,80»)
  if (comParedes && !tipos.length && medidas) return { planta: { ...pl, o: { x: 0, y: 0 }, paredes: retangulo(medidas[0], medidas[1]) }, partes: [`Retângulo de ${medidas[0]} × ${medidas[1]} cm`] };
  // uma parede: «a parede de cima tem 3 metros», «parede 2 com 180»
  if (comParedes && /\bparede\b/.test(n)) {
    const i = paredeDita(n, pl);
    const resto = s.replace(/.*?\bparede\b(?:\s+(?:\d|de cima|do topo|do fundo|da direita|de baixo|da esquerda|primeira|segunda|terceira|quarta|quinta|sexta))?/, "");
    const c = cm(resto);
    if (i !== null && c && c >= 20 && c <= 2000) {
      const fechada = faltaFechar(pl.paredes) <= 1;
      const r = fechada ? mudarComprimentoFechada(pl, i, c) : null;
      return { planta: r ? { ...pl, ...r } : { ...pl, paredes: mudarComprimento(pl.paredes, i, c) }, partes: [`Parede ${i + 1}: ${c} cm`] };
    }
  }
  if (!tipos.length) return null;
  const ultima = (t: TipoPeca) => [...pl.pecas].reverse().find((pc) => pc.tipo === t);
  if (RODA.test(n)) {
    const alvos = tipos.map(ultima).filter((x): x is NonNullable<typeof x> => !!x);
    if (alvos.length) return { planta: { ...pl, pecas: pl.pecas.map((pc) => (alvos.some((a) => a.id === pc.id) ? { ...pc, w: pc.h, h: pc.w, rot: undefined } : pc)) }, partes: alvos.map((a) => `${PECAS[a.tipo].n} rodada`) };
  }
  const mv = n.match(MOVE);
  if (mv) {
    // «50 para baixo» ou «para baixo 50 cm»: o número onde estiver; sem número, um passo de 25 cm
    const passo = cm(s) ?? 25;
    const d = { esquerda: [-passo, 0], direita: [passo, 0], cima: [0, -passo], baixo: [0, passo] }[mv[1] as "esquerda"] ?? [0, 0];
    const alvos = tipos.map(ultima).filter((x): x is NonNullable<typeof x> => !!x);
    if (alvos.length) return { planta: { ...pl, pecas: pl.pecas.map((pc) => (alvos.some((a) => a.id === pc.id) ? { ...pc, x: pc.x + d[0], y: pc.y + d[1] } : pc)) }, partes: alvos.map((a) => `${PECAS[a.tipo].n} para a ${mv[1]}`) };
  }
  if (TIRA.test(n)) {
    const fora = new Set(tipos);
    const ficam = pl.pecas.filter((pc) => !fora.has(pc.tipo));
    if (ficam.length !== pl.pecas.length) return { planta: { ...pl, pecas: ficam }, partes: tipos.map((t) => `${PECAS[t].n}: tirada`) };
    return null;
  }
  if (ADICIONA.test(n) || n.split(" ").length <= 3) {
    let np = pl;
    for (const t of tipos) np = juntarPeca(np, t, novoId());
    return { planta: np, partes: tipos.map((t) => `${PECAS[t].n} na planta`) };
  }
  return null;
}

/** O que a frase faz no projeto `p`, estando no passo `atual`. Null se não é nada que o Estúdio saiba fazer. */
export function vozNoEstudio(frase: string, p: Projeto, atual: number): RespostaEstudio | null {
  const ir = passoNoEstudio(frase, atual);
  if (ir) return { ...ir, partes: [ir.voltar ? "A voltar ao negócio" : ir.mostrar ? "A mostrar ao cliente" : `Passo: ${PASSOS_ESTUDIO[ir.passo!]}`] };
  // a planta: no «Antes», as paredes e as peças de hoje; no «Depois», mexer nas peças (as paredes são as do antes)
  if (atual === 0) {
    const r = plantaPorVoz(frase, p.antes, true);
    if (r) return { p: seguirOAntes(p, r.planta), partes: r.partes };
  }
  if (atual === 2) {
    const n = nome(frase), tipos = pecasDitas(frase);
    // rodar, mover e o tamanho mexem na planta do depois; juntar e tirar são decisões (o orçamento acompanha)
    if (tipos.length && (RODA.test(n) || MOVE.test(n) || (tipos.length === 1 && porMedidas(simples(frase))))) {
      const r = plantaPorVoz(frase, p.depois, false);
      if (r) return { p: mudarODepois(p, r.planta), partes: r.partes };
    }
    if (tipos.length && ADICIONA.test(n) && !TIRA.test(n) && !/\b(?:troca|trocar|substitui|muda)\b/.test(n)) {
      let x = p;
      const partes: string[] = [];
      for (const t of tipos) {
        const antes = new Set((x.porColocar ?? []).map((c) => c.id));
        x = aplicarPeca(x, t, "junta");
        // a peça nova (com o produto escolhido no estilo) vai logo para a planta, ao meio
        const nova = (x.porColocar ?? []).find((c) => !antes.has(c.id) && c.tipo === t);
        if (nova) { x = colocar(x, nova.id); partes.push(`${PECAS[t].n} nova na planta`); }
        else partes.push(p.antes.pecas.some((pc) => pc.tipo === t) ? `${PECAS[t].n}: trocar por uma nova` : `${PECAS[t].n}: já está`);
      }
      return { p: x, partes };
    }
  }
  let x = p;
  const partes: string[] = [];
  if (/\baplica(?:r)? (?:o |os )?estilos?\b/.test(nome(frase))) {
    x = aplicarEstilo(x, (cat) => melhorPara(cat, x.estilo)?.id);
    partes.push("Estilo aplicado às peças novas e trocadas");
  }
  const dv = divisaoNoEstudio(frase);
  if (dv) { x = { ...x, divisao: dv }; partes.push(dv); }
  const alt = alturasNoEstudio(frase);
  if (alt) {
    x = { ...x, alturas: { ...x.alturas, ...alt } };
    if (alt.peDireito) partes.push(`Pé-direito: ${alt.peDireito} cm`);
    if (alt.tetoFalso === null) partes.push("Sem teto falso");
    else if (alt.tetoFalso) partes.push(`Teto falso a ${alt.tetoFalso} cm`);
  }
  // as peças, os serviços e as cores, como numa conversa (uma fala só, do comercial)
  const falas: Fala[] = [{ inicio: 0, fim: 1, texto: frase.trim().replace(/[^.!?]$/, "$&."), falante: "comercial", confianca_falante: 1 }];
  const ped = pedidosDaConversa(falas, "visita");
  for (const d of ped.pecas) x = aplicarPeca(x, d.tipo, d.acao);
  for (const d of ped.servicos) x = d.quer ? juntarServico(x, d.id) : recusarSugestao(tirarServico(x, d.id), d.id);
  partes.push(...resumoPedidos(ped));
  const ditos = ditosDaConversa(falas, "visita");
  const o = ditos.length ? estiloDosDitos(ditos) : null;
  if (o) {
    const global = ditos.some((d) => !d.evitar && !d.cats.length);
    x = comEstilo(x, juntarEstilo(x.estilo, o), true, global);
    partes.push(...ditos.map((d) => `${d.evitar ? "Sem " : ""}${nomeCor(d.cor)}${d.cats.length ? ` (${d.cats.map((c) => (c in PECAS ? PECAS[c as keyof typeof PECAS].n : c)).join(", ")})` : ""}`));
  }
  return partes.length ? { p: x, partes } : null;
}
