// 5/11 (Rúben: «linkar as necessidades do cliente… isto são as medidas atuais, que é nas medidas da área»). O Estúdio abre a partir da
// Visita de um negócio: a planta desenhada (f.planta) é o antes, o pé-direito e o teto falso vêm das respostas da visita, e o estilo sai das
// cores ditas nas «Peças da casa de banho» (o revestimento, a base, as torneiras, o perfil; o móvel à parte).
import { lerPlanta, type Planta } from "@/emylia/planta";
import type { Cor, Estilo } from "./catalogoFake";
import { copiaPlanta } from "./exemploEstudio";
import type { Projeto } from "./necessidadesEstudio";

export const CHAVE_ESTUDIO = "olyvia.estudio.v1";

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

/** O projeto do Estúdio de um negócio na Visita (sem planta desenhada, null: desenha-se primeiro na Visita). */
export function projetoDaVisita(nome: string, f: Record<string, string>): Projeto | null {
  const antes: Planta | null = lerPlanta(f.planta);
  if (!antes || antes.paredes.length < 3) return null;
  const pe = peDireitoCm(f.diag_pe_direito_m);
  return {
    nome, antes, depois: copiaPlanta(antes), escolhas: {}, acompanha: {}, ajustes: {},
    alturas: { peDireito: pe, tetoFalso: f.pc_teto === "Teto falso" ? (pe >= 250 ? 240 : pe - 10) : null },
    estilo: estiloDasRespostas(f),
  };
}

/** Guarda o projeto para o Estúdio o abrir (o Estúdio lê-o deste browser). */
export function guardarParaEstudio(p: Projeto): boolean {
  try { localStorage.setItem(CHAVE_ESTUDIO, JSON.stringify(p)); return true; } catch { return false; }
}
