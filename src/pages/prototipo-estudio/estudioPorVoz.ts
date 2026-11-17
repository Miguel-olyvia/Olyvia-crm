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
import { PECAS } from "@/emylia/planta";
import { juntarServico, tirarServico, type Projeto } from "./necessidadesEstudio";
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

/** O que a frase faz no projeto `p`, estando no passo `atual`. Null se não é nada que o Estúdio saiba fazer. */
export function vozNoEstudio(frase: string, p: Projeto, atual: number): RespostaEstudio | null {
  const ir = passoNoEstudio(frase, atual);
  if (ir) return { ...ir, partes: [ir.voltar ? "A voltar ao negócio" : ir.mostrar ? "A mostrar ao cliente" : `Passo: ${PASSOS_ESTUDIO[ir.passo!]}`] };
  let x = p;
  const partes: string[] = [];
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
