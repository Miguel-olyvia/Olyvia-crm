// 25/11: escolher no 3D que atributo pinta uma zona. A escolha («Pintar com: …») vira uma lista de ligações atributo → zona (a mesma que o painel «Ligações» edita e que se guarda por produto).
// Três escolhas: um atributo, «Pelo nome» (como por omissão) e «Nenhum». Escolher um atributo NÃO pode tirar a cor às outras zonas que ele já pintava pelo nome. Confere-se com as funções
// reais do 3D (ligacoesDaConfig e zonasDosAtributos), e não só com a forma da lista.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { aplicarEscolhaNaZona, escolhaAtualDaZona } from "./escolherZona";
import { ligacoesDaConfig, type Ligacao } from "./config3dDados";
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
