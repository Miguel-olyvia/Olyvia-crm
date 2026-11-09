// 6/11: as escolhas do Estúdio respondem ao passo «Peças da casa de banho».
import { describe, expect, it } from "vitest";
import { PLANTA_VAZIA, type Planta } from "@/emylia/planta";
import { PECAS_WC } from "@/emylia/campos";
import type { Projeto } from "./necessidadesEstudio";
import { respostasDoEstudio } from "./respostasDoEstudio";

const depois: Planta = {
  ...PLANTA_VAZIA,
  pecas: [
    { id: "b", tipo: "base", x: 0, y: 0, w: 120, h: 70 }, { id: "m", tipo: "movel", x: 0, y: 100, w: 80, h: 46 },
    { id: "s", tipo: "sanita", x: 100, y: 100, w: 36, h: 52 }, { id: "e", tipo: "espelho", x: 0, y: 96, w: 80, h: 4 },
  ],
};
const projeto: Projeto = {
  antes: PLANTA_VAZIA, depois,
  escolhas: { b: "bas-ard-p", m: "mov-axis-80", s: "san-nexo-s", e: "esp-led-80" },
  acompanha: { b: { coluna_duche: "col-circ-p", resguardo: "res-meio-p" }, m: { torneira: "tor-alto-p" } },
  revestimento: "rev-tela-c", pavimento: "pav-tela-a",
  alturas: { peDireito: 260, tetoFalso: 240 },
  estilo: { cores: ["cinza"], porCategoria: {} }, ajustes: {},
  servicos: [{ id: "sv-ventilador", q: 1 }, { id: "sv-tomada", q: 2 }],
};

describe("o Estúdio responde às Peças da casa de banho", () => {
  const r = respostasDoEstudio(projeto);
  it("peça a peça, pelo produto escolhido e pela planta", () => {
    expect(r).toMatchObject({
      pc_base_medida: "120 x 70", pc_base_cor: "Preto", pc_base_textura: "Rugosa",
      pc_coluna_tipo: "Termostática", pc_coluna_forma: "Circular", pc_coluna_cor: "Preto",
      pc_resg_abertura: "Dois fixos, entrada no meio", pc_resg_perfil: "Preto", pc_resg_vidro: "Transparente", pc_resg_medida: "120 x 200",
      pc_rev_modelo: "Tela Cinza 120 x 60 retificado, mate", pc_rev_acabamento: "Mate", pc_rev_formato: "120 x 60",
      pc_pav_igual: "Não", pc_pav_modelo: "Tela Antracite 120 x 60, antiderrapante", pc_pav_formato: "120 x 60",
      pc_torn_lavatorio: "De pé alto", pc_torn_cor: "Preto",
      pc_movel_montagem: "Suspenso", pc_movel_abertura: "Gavetas", pc_movel_largura: "80", pc_movel_frentes: "Axis Oak", pc_movel_tampo: "Cerâmico", pc_movel_coluna: "Não",
      pc_espelho_luz: "LED direto", pc_espelho_medida: "80 x 70",
      pc_sanita_tipo: "Suspensa", pc_sanita_descarga: "Sem aro", pc_sanita_tampa: "Amortecida", pc_bide: "Não",
      pc_teto: "Teto falso", pc_ventilacao: "Ventilador", pc_tomadas: "2",
    });
  });
  it("só responde com valores que o passo aceita", () => {
    const defs = new Map(PECAS_WC.campos.map((c) => [c.k, c]));
    for (const [k, v] of Object.entries(r)) {
      if (k.endsWith("_detalhe")) continue;
      const def = defs.get(k);
      expect(def, k).toBeDefined();
      if (def!.t === "escolha") expect(def!.op, `${k} = ${v}`).toContain(v);
      if (def!.t === "sim_nao") expect(["Sim", "Não"]).toContain(v);
    }
  });
  it("sem nada escolhido, não responde a nada", () => {
    expect(respostasDoEstudio({ ...projeto, depois: PLANTA_VAZIA, escolhas: {}, acompanha: {}, revestimento: undefined, pavimento: undefined, alturas: { peDireito: 260, tetoFalso: null }, servicos: [] })).toEqual({});
  });
});
