// 5/11 (Rúben: «linkar as necessidades do cliente… isto são as medidas atuais, que é nas medidas da área»). O Estúdio abre a partir da
// Visita de um negócio: a planta desenhada (f.planta) é o antes, o pé-direito e o teto falso vêm das respostas da visita, e o estilo sai das
// cores ditas nas «Peças da casa de banho» (o revestimento, a base, as torneiras, o perfil; o móvel à parte).
import { PLANTA_VAZIA, lerPlanta, type Planta } from "@/emylia/planta";
import type { Cor, Estilo } from "./catalogoFake";
import { copiaPlanta } from "./exemploEstudio";
import type { Projeto } from "./necessidadesEstudio";

export const CHAVE_ESTUDIO = "olyvia.estudio.v1";
/** 5/11: o que o Estúdio devolve ao negócio quando se carrega em «Voltar ao negócio» (a Visita lê-o e grava a planta). */
export const CHAVE_VOLTA = "olyvia.estudio.volta";
export interface Volta { negocio: number; antes: Planta; em: number }

const PALAVRAS: [RegExp, Cor][] = [
  [/cinz|antracite|gris|cromad|inox/i, "cinza"], [/pret|black|negr/i, "preto"], [/branc|white/i, "branco"],
  [/madeira|oak|carvalho|nogueira|wood/i, "madeira"], [/bege|creme|areia|marfim|dourad/i, "bege"],
];
/** As cores ditas num texto, pela ordem em que aparecem («Cinza 120 x 60» dá cinza; «Axis Oak» dá madeira). */
export function coresDoTexto(t: string | undefined): Cor[] {
  if (!t) return [];
  const achadas = PALAVRAS.map(([rx, c]) => ({ c, i: t.search(rx) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
  return [...new Set(achadas.map((x) => x.c))];
}

export function estiloDasRespostas(f: Record<string, string>): Estilo {
  const gerais = ["pc_rev_modelo", "pc_pav_modelo", "pc_base_cor", "pc_base_cor_detalhe", "pc_torn_cor", "pc_resg_perfil", "pc_coluna_cor"]
    .flatMap((k) => coresDoTexto(f[k]));
  const movel = coresDoTexto(f.pc_movel_frentes);
  return { cores: [...new Set(gerais)], porCategoria: movel.length ? { movel, coluna: movel } : {} };
}

/** O pé-direito da visita («2,6 m») em cm; sem resposta, 250. */
const peDireitoCm = (v: string | undefined) => { const m = (v ?? "").replace(",", ".").match(/(\d+(?:\.\d+)?)/); return m ? Math.round(Number(m[1]) * 100) : 250; };

/** O projeto do Estúdio de um negócio na Visita. Sem planta desenhada, o Estúdio abre com a planta vazia (desenha-se lá). */
export function projetoDaVisita(nome: string, f: Record<string, string>, negocio?: number, origem?: string): Projeto {
  const antes: Planta = lerPlanta(f.planta) ?? copiaPlanta(PLANTA_VAZIA);
  const pe = peDireitoCm(f.diag_pe_direito_m);
  return {
    nome, negocio, origem, antes, depois: copiaPlanta(antes), escolhas: {}, acompanha: {}, ajustes: {},
    alturas: { peDireito: pe, tetoFalso: f.pc_teto === "Teto falso" ? (pe >= 250 ? 240 : pe - 10) : null },
    estilo: estiloDasRespostas(f),
  };
}

/** Guarda o projeto para o Estúdio o abrir (o Estúdio lê-o deste browser). */
export function guardarParaEstudio(p: Projeto): boolean {
  try { localStorage.setItem(CHAVE_ESTUDIO, JSON.stringify(p)); return true; } catch { return false; }
}

/** Abrir o Estúdio de um negócio: se o projeto guardado é deste negócio, continua-se (não se perde o depois); senão começa um novo. */
export function abrirEstudio(nome: string, f: Record<string, string>, negocio: number, origem: string): boolean {
  try {
    const t = localStorage.getItem(CHAVE_ESTUDIO);
    const guardado = t ? (JSON.parse(t) as Projeto) : null;
    if (guardado?.negocio === negocio) return guardarParaEstudio({ ...guardado, nome, origem });
  } catch { /* sem projeto guardado que sirva: um novo */ }
  return guardarParaEstudio(projetoDaVisita(nome, f, negocio, origem));
}

/** O Estúdio devolve a planta do antes ao negócio de onde veio. */
export function devolverAoNegocio(p: Projeto): boolean {
  if (p.negocio === undefined) return false;
  try { localStorage.setItem(CHAVE_VOLTA, JSON.stringify({ negocio: p.negocio, antes: p.antes, em: Date.now() } satisfies Volta)); return true; } catch { return false; }
}

/** A volta pendente para este negócio (recente: menos de 30 min), ou null. Ler apaga-a. */
export function lerVolta(negocio: number): Volta | null {
  try {
    const t = localStorage.getItem(CHAVE_VOLTA);
    if (!t) return null;
    const v = JSON.parse(t) as Volta;
    if (v.negocio !== negocio || Date.now() - v.em > 30 * 60_000) return null;
    localStorage.removeItem(CHAVE_VOLTA);
    return v;
  } catch { return null; }
}
