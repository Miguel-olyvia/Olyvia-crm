// 25/11: escolher no 3D que atributo pinta uma zona. A escolha («Pintar com: …») vira uma lista de ligações atributo → zona (a mesma que o painel «Ligações» edita e que se guarda por produto).
// Três escolhas: um atributo, «Pelo nome» (como por omissão) e «Nenhum». Escolher um atributo NÃO pode tirar a cor às outras zonas que ele já pintava pelo nome. Confere-se com as funções
// reais do 3D (ligacoesDaConfig e zonasDosAtributos), e não só com a forma da lista.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { aplicarEscolhaNaZona, escolhaAtualDaZona } from "./escolherZona";
import { ligacoesDaConfig, type Ligacao } from "./config3dDados";
import { classeDoNomeDe } from "./planta3d/acabamentoCor3d";
import { zonasDosAtributos, type ZonaGlb } from "./planta3d/zonasGlb";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";

const FRENTE = "aaaaaaaa-0000-4000-a000-000000000001", CORPO = "aaaaaaaa-0000-4000-a000-000000000002", COR = "aaaaaaaa-0000-4000-a000-000000000003";
const L = (atributo: string, zona: Ligacao["zona"], aplicar = true): Ligacao => ({ atributo, zona, aplicar });
const cor = (id: string, nome: string, codigo: string, hex: string): AtributoDef => ({ id, codigo, nome, tipo: "lista", temHex: true, ordem: 1, opcoes: [{ id: `${id}-o`, valor: nome, nome: `${nome} X`, hex, ordem: 1 }] });
const DEFS = [cor(CORPO, "Cor do corpo", "cor_corpo", "#111111"), cor(FRENTE, "Cor da frente", "cor_frente", "#eeeeee"), cor(COR, "Cor", "cor", "#cc0000")];
const ATRIBUTOS = [{ id: CORPO, nome: "Cor do corpo" }, { id: FRENTE, nome: "Cor da frente" }, { id: COR, nome: "Cor" }];
const IDS = ATRIBUTOS.map((a) => a.id);
const attrs = (...ids: string[]): AtributoProduto[] => ids.map((id) => ({ atributoId: id, opcaoId: `${id}-o`, valor: id }));
/** O que cada zona leva (o hex) com estas ligações, pelas funções reais do 3D. */
const hexPorZona = (lig: readonly Ligacao[], a: AtributoProduto[] = attrs(CORPO, FRENTE)): Partial<Record<ZonaGlb, string | null>> => {
  const { ligacoes, excluidos } = ligacoesDaConfig(lig);
  const z = zonasDosAtributos(a, DEFS, ligacoes, excluidos);
  return Object.fromEntries((["frente", "corpo", "tampo", "pes"] as const).map((k) => [k, z?.zonas[k]?.hex ?? null]));
};
/** As zonas que um atributo pinta hoje (pelas ligações dadas), como a pré-visualização as sabe. */
const pintaHoje = (lig: readonly Ligacao[], a: AtributoProduto[] = attrs(CORPO, FRENTE)) => (id: string): ZonaGlb[] => {
  const { ligacoes, excluidos } = ligacoesDaConfig(lig);
  const z = zonasDosAtributos(a, DEFS, ligacoes, excluidos), nome = DEFS.find((d) => d.id === id)!.nome;
  return (["frente", "corpo", "tampo", "pes", "estofo", "puxadores"] as const).filter((k) => z?.zonas[k]?.atributo === nome);
};
const ctx = (lig: readonly Ligacao[] = [], a: AtributoProduto[] = attrs(CORPO, FRENTE)) => ({ atributosDaCor: IDS, pintaHoje: pintaHoje(lig, a) });

describe("escolhaAtualDaZona: o que a zona tem escolhido hoje", () => {
  it("sem ligações: pelo nome", () => { expect(escolhaAtualDaZona([], "frente", IDS)).toEqual({ tipo: "nome" }); });
  it("uma ligação explícita (ou «Tudo») a um atributo: esse atributo", () => {
    expect(escolhaAtualDaZona([L(CORPO, "frente")], "frente", IDS)).toEqual({ tipo: "atributo", id: CORPO });
    expect(escolhaAtualDaZona([L(COR, "tudo")], "tampo", IDS)).toEqual({ tipo: "atributo", id: COR });
  });
  it("todos os atributos do produto com «aplicar: não» nessa zona: nenhum; só alguns: continua pelo nome", () => {
    expect(escolhaAtualDaZona(IDS.map((i) => L(i, "frente", false)), "frente", IDS)).toEqual({ tipo: "nenhum" });
    expect(escolhaAtualDaZona([L(FRENTE, "frente", false)], "frente", IDS)).toEqual({ tipo: "nome" });
  });
  it("com vários atributos ligados à zona, vale o que pinta hoje (pelo nome); sem esse nome, o primeiro", () => {
    const lig = [L(COR, "frente"), L(FRENTE, "frente")];
    const nomeDe = (id: string) => ATRIBUTOS.find((a) => a.id === id)?.nome;
    expect(escolhaAtualDaZona(lig, "frente", [COR, FRENTE], "Cor da frente", nomeDe)).toEqual({ tipo: "atributo", id: FRENTE });
    expect(escolhaAtualDaZona(lig, "frente", [COR, FRENTE])).toEqual({ tipo: "atributo", id: COR });
  });
  // 26/11 (verificação ao vivo): a Tonalidade e o Brilho são regras de SUPERFÍCIE; não são regras de cor e não podem mudar a escolha da camada «Cor»
  describe("as regras de superfície não afectam a camada «Cor»", () => {
    const TONAL = "aaaaaaaa-0000-4000-a000-0000000000f1";
    it("«Tonalidade → Todas as zonas» (e uma regra só da zona): a cor continua em «pelo nome», e não em «regra a um atributo que o produto já não tem»", () => {
      expect(escolhaAtualDaZona([L(TONAL, "tudo")], "corpo", IDS, undefined, undefined, [TONAL])).toEqual({ tipo: "nome" });
      expect(escolhaAtualDaZona([L(TONAL, "corpo")], "corpo", IDS, undefined, undefined, [TONAL])).toEqual({ tipo: "nome" });
    });
    it("com uma regra de cor ao lado, vale a de cor", () => {
      expect(escolhaAtualDaZona([L(TONAL, "tudo"), L(CORPO, "corpo")], "corpo", IDS, undefined, undefined, [TONAL])).toEqual({ tipo: "atributo", id: CORPO });
    });
    it("uma regra a um atributo que o produto já não tem continua a ver-se (não é de superfície)", () => {
      const FORA = "aaaaaaaa-0000-4000-a000-0000000000f2";
      expect(escolhaAtualDaZona([L(FORA, "corpo")], "corpo", IDS, undefined, undefined, [TONAL])).toEqual({ tipo: "atributo", id: FORA });
    });
    it("as exclusões de superfície não contam para «nenhum»", () => {
      expect(escolhaAtualDaZona([L(TONAL, "corpo", false)], "corpo", IDS, undefined, undefined, [TONAL])).toEqual({ tipo: "nome" });
    });
  });
});

describe("aplicarEscolhaNaZona: escolher um atributo", () => {
  it("um atributo que só pintava essa zona pelo nome liga-se só a ela", () => {
    expect(aplicarEscolhaNaZona([], "frente", { tipo: "atributo", id: FRENTE }, ctx())).toEqual([L(FRENTE, "frente")]);
  });
  it("«Cor do corpo» na frente: a frente passa a levar a cor do corpo, e o corpo (que ela pintava pelo nome) continua com ela", () => {
    const depois = aplicarEscolhaNaZona([], "frente", { tipo: "atributo", id: CORPO }, ctx());
    expect(depois).toEqual(expect.arrayContaining([L(CORPO, "frente"), L(CORPO, "corpo")]));
    expect(hexPorZona(depois)).toMatchObject({ frente: "#111111", corpo: "#111111" });
  });
  it("REGRESSÃO do que se vê: as outras zonas ficam como estavam (a «Cor» pintava tudo; ligá-la à frente não tira a cor ao corpo nem ao tampo)", () => {
    const a = attrs(COR);
    const antes = hexPorZona([], a);
    expect(antes).toMatchObject({ frente: "#cc0000", corpo: "#cc0000", tampo: "#cc0000" });
    const depois = aplicarEscolhaNaZona([], "frente", { tipo: "atributo", id: COR }, ctx([], a));
    expect(hexPorZona(depois, a)).toEqual(antes);
  });
  it("trocar de atributo numa zona substitui o anterior (cada atributo só uma vez por zona)", () => {
    const depois = aplicarEscolhaNaZona([L(FRENTE, "frente")], "frente", { tipo: "atributo", id: CORPO }, ctx([L(FRENTE, "frente")]));
    expect(depois.filter((l) => l.zona === "frente")).toEqual([L(CORPO, "frente")]);
    expect(hexPorZona(depois)).toMatchObject({ frente: "#111111" });
  });
  it("uma ligação «Tudo» de outro atributo deixa de cobrir a zona escolhida (fica excluído só dessa zona)", () => {
    const depois = aplicarEscolhaNaZona([L(COR, "tudo")], "frente", { tipo: "atributo", id: FRENTE }, ctx([L(COR, "tudo")], attrs(COR, FRENTE)));
    expect(depois).toEqual(expect.arrayContaining([L(COR, "tudo"), L(COR, "frente", false), L(FRENTE, "frente")]));
    expect(hexPorZona(depois, attrs(COR, FRENTE))).toMatchObject({ frente: "#eeeeee", corpo: "#cc0000", tampo: "#cc0000" });
  });
  it("não repete o par atributo/zona e nunca altera a lista que recebe", () => {
    const valor = [L(FRENTE, "frente"), L(CORPO, "corpo")];
    const copia = JSON.parse(JSON.stringify(valor));
    const depois = aplicarEscolhaNaZona(valor, "corpo", { tipo: "atributo", id: FRENTE }, ctx(valor));
    expect(valor).toEqual(copia);
    expect(new Set(depois.map((l) => `${l.atributo}|${l.zona}`)).size).toBe(depois.length);
  });
});

describe("aplicarEscolhaNaZona: «Nenhum» e «Pelo nome»", () => {
  it("«Nenhum»: todos os atributos do produto com «aplicar: não» nessa zona, e ela fica sem cor (as outras não mudam)", () => {
    const depois = aplicarEscolhaNaZona([], "frente", { tipo: "nenhum" }, ctx());
    expect(depois).toEqual(expect.arrayContaining(IDS.map((i) => L(i, "frente", false))));
    expect(hexPorZona(depois)).toMatchObject({ frente: null, corpo: "#111111" });
  });
  it("«Nenhum» também corta uma ligação «Tudo» nessa zona", () => {
    const depois = aplicarEscolhaNaZona([L(COR, "tudo")], "tampo", { tipo: "nenhum" }, ctx([L(COR, "tudo")], attrs(COR)));
    expect(hexPorZona(depois, attrs(COR))).toMatchObject({ tampo: null, frente: "#cc0000" });
  });
  it("«Pelo nome» tira as ligações dessa zona e a zona volta ao que os nomes dão", () => {
    const antes = [L(CORPO, "frente"), L(CORPO, "corpo")];
    const depois = aplicarEscolhaNaZona(antes, "frente", { tipo: "nome" }, ctx(antes));
    expect(depois).toEqual([L(CORPO, "corpo")]);
    expect(hexPorZona(depois)).toMatchObject({ frente: "#eeeeee", corpo: "#111111" });
  });
  it("«Pelo nome» numa zona coberta por «Tudo»: o atributo fica excluído dessa zona e ela volta aos nomes", () => {
    const antes = [L(COR, "tudo")];
    const depois = aplicarEscolhaNaZona(antes, "frente", { tipo: "nome" }, ctx(antes, attrs(COR, FRENTE)));
    expect(depois).toEqual([L(COR, "tudo"), L(COR, "frente", false)]);
    expect(hexPorZona(depois, attrs(COR, FRENTE))).toMatchObject({ frente: "#eeeeee", corpo: "#cc0000" });
  });
  it("«Pelo nome» sem nada ligado não muda nada", () => { expect(aplicarEscolhaNaZona([], "frente", { tipo: "nome" }, ctx())).toEqual([]); });
});

/* ------------------------------------------------------------------ H1 e M2 (revisão do commit d69e7f539): a ligação explícita manda sobre o atributo que pinta a zona só pelo nome */
// um atributo por NOME («Cor do corpo», «Cor da frente») que pinta a zona concorre com o escolhido: o resultado não pode depender da ORDEM das definições
const TODAS: ZonaGlb[] = ["frente", "corpo", "tampo", "pes"];
const pelaNomeDe = (defs: readonly AtributoDef[]) => (zona: ZonaGlb) => defs.flatMap((d) => { const c = classeDoNomeDe(d.nome); return c && c.papel === zona ? [{ id: d.id, lisa: c.nivel === 3 }] : []; });
const hexEm = (defs: readonly AtributoDef[], lig: readonly Ligacao[], a: AtributoProduto[]): Record<string, string | null> => {
  const { ligacoes, excluidos } = ligacoesDaConfig(lig);
  const z = zonasDosAtributos(a, defs, ligacoes, excluidos);
  return Object.fromEntries(TODAS.map((k) => [k, z?.zonas[k]?.hex ?? null]));
};
const ctxEm = (defs: readonly AtributoDef[], lig: readonly Ligacao[], a: AtributoProduto[]) => ({
  atributosDaCor: defs.map((d) => d.id),
  pintaHoje: (id: string): ZonaGlb[] => {
    const { ligacoes, excluidos } = ligacoesDaConfig(lig);
    const z = zonasDosAtributos(a, defs, ligacoes, excluidos), nome = defs.find((d) => d.id === id)!.nome;
    return TODAS.filter((k) => z?.zonas[k]?.atributo === nome);
  },
  pelaNome: pelaNomeDe(defs),
});
const ORDENS: [string, AtributoDef[]][] = [
  ["corpo, frente, cor", [DEFS[0], DEFS[1], DEFS[2]]],
  ["frente, corpo, cor", [DEFS[1], DEFS[0], DEFS[2]]],
  ["cor, frente, corpo", [DEFS[2], DEFS[1], DEFS[0]]],
];

describe.each(ORDENS)("a escolha feita no 3D vê-se, com as definições na ordem %s", (_n, defs) => {
  const a = attrs(CORPO, FRENTE, COR);
  const escolher = (valor: readonly Ligacao[], zona: ZonaGlb, e: Parameters<typeof aplicarEscolhaNaZona>[2]) => aplicarEscolhaNaZona(valor, zona, e, ctxEm(defs, valor, a));
  it("«Cor da frente» no corpo: o corpo leva a cor da frente, e a frente continua com ela", () => {
    const antes = hexEm(defs, [], a);
    expect(antes).toMatchObject({ frente: "#eeeeee", corpo: "#111111" });
    const depois = escolher([], "corpo", { tipo: "atributo", id: FRENTE });
    expect(hexEm(defs, depois, a)).toMatchObject({ frente: "#eeeeee", corpo: "#eeeeee", tampo: antes.tampo, pes: antes.pes });
  });
  it("«Cor do corpo» na frente: a frente leva a cor do corpo, e o corpo continua com ela", () => {
    const antes = hexEm(defs, [], a);
    const depois = escolher([], "frente", { tipo: "atributo", id: CORPO });
    expect(hexEm(defs, depois, a)).toMatchObject({ frente: "#111111", corpo: "#111111", tampo: antes.tampo, pes: antes.pes });
  });
  it("trocar a escolha na mesma zona: a nova manda (a anterior sai e o nome continua a não concorrer)", () => {
    const um = escolher([], "corpo", { tipo: "atributo", id: FRENTE });
    const dois = escolher(um, "corpo", { tipo: "atributo", id: COR });
    expect(hexEm(defs, dois, a)).toMatchObject({ corpo: "#cc0000", frente: "#eeeeee" });
    expect(dois.filter((l) => l.zona === "corpo" && l.aplicar).map((l) => l.atributo)).toEqual([COR]);
  });
  it("escolher para a zona o atributo que a pinta pelo nome não acrescenta exclusões nem ligações a mais", () => {
    expect(escolher([], "corpo", { tipo: "atributo", id: CORPO })).toEqual([L(CORPO, "corpo")]);
  });
  it("respeita o contrato com a base: sem pares atributo+zona repetidos e no máximo 60", () => {
    let valor: Ligacao[] = [];
    for (const [zona, id] of [["corpo", FRENTE], ["frente", CORPO], ["tampo", COR], ["corpo", COR], ["frente", FRENTE]] as const) valor = escolher(valor, zona, { tipo: "atributo", id });
    expect(new Set(valor.map((l) => `${l.atributo}|${l.zona}`)).size).toBe(valor.length);
    expect(valor.length).toBeLessThanOrEqual(60);
  });
  it("«Pelo nome» REPÕE o nome: a «Cor da frente» ligada só ao corpo volta à frente", () => {
    const lig = [L(FRENTE, "corpo")];
    const depois = escolher(lig, "frente", { tipo: "nome" });
    expect(depois).toEqual(expect.arrayContaining([L(FRENTE, "frente"), L(FRENTE, "corpo")]));
    expect(hexEm(defs, depois, a).frente).toBe("#eeeeee");
  });
  it("«Pelo nome» sem ligações do atributo do nome não acrescenta nada", () => {
    expect(escolher([L(COR, "tampo")], "frente", { tipo: "nome" })).toEqual([L(COR, "tampo")]);
  });
});
