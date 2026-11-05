// 5/11: o projeto de exemplo do Estúdio, a partir da visita real de 5/11 (a casa de banho do Bruno): a planta do antes como na folha (em L,
// 234 por 226, com o canto da entrada), a banheira, a sanita, o bidé, o móvel e o espelho. O estilo como ele o disse: tudo cinza e preto,
// o móvel em madeira, a sanita branca ou cinza. Teto falso de 2,60 m para 2,40 m.
import type { Planta } from "@/emylia/planta";
import type { Estilo } from "./catalogoFake";
import type { Projeto } from "./necessidadesEstudio";

export const ANTES_EXEMPLO: Planta = {
  o: { x: 40, y: 40 },
  paredes: [{ c: 234, r: "E" }, { c: 226, r: "S" }, { c: 171, r: "W" }, { c: 49, r: "N" }, { c: 63, r: "W" }, { c: 177, r: "N" }],
  pecas: [
    { id: "a-banheira", tipo: "banheira", x: 40, y: 40, w: 170, h: 70 },
    { id: "a-movel", tipo: "movel", x: 228, y: 50, w: 46, h: 80 },
    { id: "a-espelho", tipo: "espelho", x: 270, y: 50, w: 4, h: 80 },
    { id: "a-sanita", tipo: "sanita", x: 219, y: 140, w: 55, h: 36 },
    { id: "a-bide", tipo: "bide", x: 219, y: 190, w: 55, h: 36 },
    { id: "a-porta", tipo: "porta", x: 140, y: 262, w: 80, h: 8 },
    { id: "a-janela", tipo: "janela", x: 36, y: 120, w: 8, h: 80 },
  ],
};

export const ESTILO_EXEMPLO: Estilo = { cores: ["cinza", "preto"], porCategoria: { movel: ["madeira"], coluna: ["madeira"], sanita: ["branco", "cinza"] } };

export const copiaPlanta = (p: Planta): Planta => ({ o: { ...p.o }, paredes: p.paredes.map((x) => ({ ...x })), pecas: p.pecas.map((x) => ({ ...x })) });

export const PROJETO_EXEMPLO: Projeto = {
  antes: ANTES_EXEMPLO,
  depois: copiaPlanta(ANTES_EXEMPLO),
  escolhas: {}, acompanha: {}, ajustes: {},
  alturas: { peDireito: 260, tetoFalso: 240 },
  estilo: ESTILO_EXEMPLO,
};

/** O depois que ficou combinado na visita: sai a banheira e o bidé, entra a base de 1,20 m com coluna e resguardo e um toalheiro; a
 *  sanita, o móvel e o espelho trocam-se. (As escolhas do catálogo saem de «Aplicar o estilo».) */
export function depoisDaVisita(antes: Planta): Planta {
  const fica = antes.pecas.filter((x) => !["a-banheira", "a-bide"].includes(x.id));
  return {
    ...copiaPlanta(antes),
    pecas: [
      ...fica.map((x) => ({ ...x })),
      { id: "d-base", tipo: "base", x: 40, y: 40, w: 120, h: 70 },
      { id: "d-toalheiro", tipo: "toalheiro", x: 175, y: 40, w: 50, h: 6 },
    ],
  };
}
/** Para marcar como «troca» as que ficam no sítio mas mudam de modelo (a sanita, o móvel e o espelho). */
export const TROCAM_NA_VISITA = ["a-sanita", "a-movel", "a-espelho"];
