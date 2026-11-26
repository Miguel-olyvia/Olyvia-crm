// 26/11: a camada «Superfície desta zona» (Tonalidade, Brilho) do painel «Aspeto 3D». As funções são as irmãs das da cor (escolherZona.ts) e conferem-se com as funções REAIS do 3D
// (ligacoesDaConfig e zonasDosAtributos), em várias ordens de definições, e não só com a forma da lista.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { aplicarEscolhaNaZona, aplicarSuperficieNaZona, escolhaDeSuperficieDaZona } from "./escolherZona";
import { ligacoesDaConfig, type Ligacao } from "./config3dDados";
import { zonasDosAtributos, type ZonaGlb } from "./planta3d/zonasGlb";
import type { AtributoDef, AtributoProduto, Superficie } from "./v2/catalogoModelo";

const CORPO = "aaaaaaaa-0000-4000-a000-000000000002", FRENTE = "aaaaaaaa-0000-4000-a000-000000000001", TONAL = "aaaaaaaa-0000-4000-a000-000000000007",BRILHO = "aaaaaaaa-0000-4000-a000-000000000008";
const L = (atributo: string, zona: Ligacao["zona"], aplicar = true): Ligacao => ({ atributo, zona, aplicar });
const cor = (id: string, nome: string, codigo: string, hex: string): AtributoDef => ({ id, codigo, nome, tipo: "lista", temHex: true, ordem: 1, opcoes: [{ id: `${id}-o`, valor: nome, nome: `${nome} X`, hex, ordem: 1 }] });
const superficie = (id: string, nome: string, s: Superficie): AtributoDef => ({
  id, codigo: nome.toLowerCase(), nome, tipo: "lista", temHex: false, temAspeto: true, ordem: 2, opcoes: [{ id: `${id}-o`, valor: nome, nome: `${nome} X`, hex: null, ordem: 1, superficie: s }],
});
const D_CORPO = cor(CORPO, "Cor do corpo", "cor_corpo", "#111111"), D_FRENTE = cor(FRENTE, "Cor da frente", "cor_frente", "#eeeeee");
const D_TONAL = superficie(TONAL, "Tonalidade", "mate"), D_BRILHO = superficie(BRILHO, "Brilho", "polida");
const SUPERFICIES = [TONAL, BRILHO];
const attrs = (...ids: string[]): AtributoProduto[] => ids.map((id) => ({ atributoId: id, opcaoId: `${id}-o`, valor: id }));
const ATTRS = attrs(CORPO, FRENTE, TONAL, BRILHO);
const ZONAS_TESTE = ["frente", "corpo", "tampo"] as const;

/** A superfície que cada zona leva com estas ligações e esta ordem de definições, pelas funções reais do 3D. */
const superficiePorZona = (lig: readonly Ligacao[], defs: AtributoDef[]): Partial<Record<ZonaGlb, string | null>> => {
  const { ligacoes, excluidos } = ligacoesDaConfig(lig);
  const z = zonasDosAtributos(ATTRS, defs, ligacoes, excluidos);
  return Object.fromEntries(ZONAS_TESTE.map((k) => [k, z?.zonas[k]?.superficie ?? null]));
};
const ORDENS: Record<string, AtributoDef[]> = {
  "Tonalidade antes do Brilho": [D_CORPO, D_FRENTE, D_TONAL, D_BRILHO],
  "Brilho antes da Tonalidade": [D_CORPO, D_FRENTE, D_BRILHO, D_TONAL],
};

describe("escolhaDeSuperficieDaZona: o que a superfície da zona tem escolhido hoje", () => {
  it("sem regras: automático (os atributos de superfície actuam em todas as zonas)", () => {
    expect(escolhaDeSuperficieDaZona([], "frente", SUPERFICIES)).toEqual({ tipo: "nome" });
  });
  it("uma regra (explícita ou «Todas as zonas») a um atributo de superfície: esse atributo", () => {
    expect(escolhaDeSuperficieDaZona([L(TONAL, "tudo")], "corpo", SUPERFICIES)).toEqual({ tipo: "atributo", id: TONAL });
    expect(escolhaDeSuperficieDaZona([L(BRILHO, "frente")], "frente", SUPERFICIES)).toEqual({ tipo: "atributo", id: BRILHO });
    expect(escolhaDeSuperficieDaZona([L(BRILHO, "frente")], "corpo", SUPERFICIES)).toEqual({ tipo: "nome" });
  });
  it("todos os atributos de superfície com «não pinta» nessa zona: nenhum; só alguns: continua automático", () => {
    expect(escolhaDeSuperficieDaZona([L(TONAL, "frente", false), L(BRILHO, "frente", false)], "frente", SUPERFICIES)).toEqual({ tipo: "nenhum" });
    expect(escolhaDeSuperficieDaZona([L(TONAL, "frente", false)], "frente", SUPERFICIES)).toEqual({ tipo: "nome" });
  });
  it("com vários ligados à zona vale o que pinta hoje; sem esse nome, o primeiro da lista", () => {
    const lig = [L(TONAL, "tudo"), L(BRILHO, "frente")];
    const nomeDe = (id: string) => (id === TONAL ? "Tonalidade" : "Brilho");
    expect(escolhaDeSuperficieDaZona(lig, "frente", SUPERFICIES, "Brilho", nomeDe)).toEqual({ tipo: "atributo", id: BRILHO });
    expect(escolhaDeSuperficieDaZona(lig, "frente", SUPERFICIES)).toEqual({ tipo: "atributo", id: TONAL });
  });
  it("sem atributos de superfície: automático", () => {
    expect(escolhaDeSuperficieDaZona([], "frente", [])).toEqual({ tipo: "nome" });
  });
});

describe.each(Object.entries(ORDENS))("aplicarSuperficieNaZona (%s)", (_nome, defs) => {
  const ctx = { atributosDeSuperficie: SUPERFICIES };
  it("escolher um atributo sem regras fá-lo «Todas as zonas»: as outras zonas ficam como estavam", () => {
    const antes = superficiePorZona([], defs.filter((d) => d.id !== BRILHO));
    const depois = aplicarSuperficieNaZona([], "frente", { tipo: "atributo", id: TONAL }, { atributosDeSuperficie: [TONAL] });
    expect(depois).toContainEqual(L(TONAL, "tudo"));
    expect(superficiePorZona(depois, defs.filter((d) => d.id !== BRILHO))).toEqual(antes);
  });
  it("com Brilho e Tonalidade, escolher um na frente fá-lo ganhar nessa zona, seja qual for a ordem das definições", () => {
    const lig = aplicarSuperficieNaZona([], "frente", { tipo: "atributo", id: BRILHO }, ctx);
    expect(escolhaDeSuperficieDaZona(lig, "frente", SUPERFICIES)).toEqual({ tipo: "atributo", id: BRILHO });
    expect(superficiePorZona(lig, defs).frente).toBe("polida");
    const lig2 = aplicarSuperficieNaZona([], "frente", { tipo: "atributo", id: TONAL }, ctx);
    expect(superficiePorZona(lig2, defs).frente).toBe("mate");
  });
  it("só mexe na zona pedida: nas outras o resultado é o de antes", () => {
    const antes = superficiePorZona([], defs);
    const lig = aplicarSuperficieNaZona([], "frente", { tipo: "atributo", id: BRILHO }, ctx);
    const depois = superficiePorZona(lig, defs);
    expect(depois.corpo).toBe(antes.corpo);
    expect(depois.tampo).toBe(antes.tampo);
  });
  it("trocar de atributo na mesma zona substitui a escolha anterior (um par atributo/zona só uma vez)", () => {
    const um = aplicarSuperficieNaZona([], "frente", { tipo: "atributo", id: TONAL }, ctx);
    const dois = aplicarSuperficieNaZona(um, "frente", { tipo: "atributo", id: BRILHO }, ctx);
    const chaves = dois.map((l) => `${l.atributo}|${l.zona}`);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(superficiePorZona(dois, defs).frente).toBe("polida");
  });
  it("a regra «Todas as zonas» de outro atributo fica excluída só dessa zona (a zona explícita vence «Todas as zonas»)", () => {
    const base = [L(TONAL, "tudo")];
    const depois = aplicarSuperficieNaZona(base, "frente", { tipo: "atributo", id: BRILHO }, ctx);
    expect(depois).toContainEqual(L(TONAL, "frente", false));
    expect(depois).toContainEqual(L(TONAL, "tudo"));
    const porZona = superficiePorZona(depois, defs);
    expect(porZona.frente).toBe("polida");
    expect(porZona.corpo).toBe(superficiePorZona(base, defs).corpo);
  });
  it("«Sem superfície» exclui todos os de superfície nessa zona; as outras zonas ficam", () => {
    const base = [L(TONAL, "tudo")];
    const depois = aplicarSuperficieNaZona(base, "frente", { tipo: "nenhum" }, ctx);
    expect(depois).toContainEqual(L(TONAL, "frente", false));
    expect(depois).toContainEqual(L(BRILHO, "frente", false));
    expect(superficiePorZona(depois, defs).frente).toBeNull();
    expect(superficiePorZona(depois, defs).corpo).toBe(superficiePorZona(base, defs).corpo);
    expect(escolhaDeSuperficieDaZona(depois, "frente", SUPERFICIES)).toEqual({ tipo: "nenhum" });
  });
  it("«Automático» tira as regras de superfície dessa zona (a regra «Todas as zonas» passa a não a cobrir)", () => {
    const base = [L(TONAL, "tudo"), L(BRILHO, "frente")];
    const depois = aplicarSuperficieNaZona(base, "frente", { tipo: "nome" }, ctx);
    expect(depois).not.toContainEqual(L(BRILHO, "frente"));
    expect(depois).toContainEqual(L(TONAL, "frente", false));
  });
  it("nunca altera a lista recebida", () => {
    const base = Object.freeze([Object.freeze(L(TONAL, "tudo"))]) as readonly Ligacao[];
    expect(() => aplicarSuperficieNaZona(base, "frente", { tipo: "atributo", id: BRILHO }, ctx)).not.toThrow();
    expect(base).toEqual([L(TONAL, "tudo")]);
  });
  it("não toca nas regras de COR da zona", () => {
    const base = [L(CORPO, "frente"), L(FRENTE, "frente", false)];
    const depois = aplicarSuperficieNaZona(base, "frente", { tipo: "atributo", id: BRILHO }, ctx);
    expect(depois).toContainEqual(L(CORPO, "frente"));
    expect(depois).toContainEqual(L(FRENTE, "frente", false));
  });
});

describe("aplicarEscolhaNaZona (cor) com atributos de superfície na lista", () => {
  const ctxCor = { atributosDaCor: [CORPO, FRENTE], pintaHoje: () => [] as ZonaGlb[], atributosDeSuperficie: SUPERFICIES };
  it("escolher uma cor não desfaz a superfície: a regra «Todas as zonas» da Tonalidade não leva uma exclusão nessa zona", () => {
    const base = [L(TONAL, "tudo")];
    const depois = aplicarEscolhaNaZona(base, "frente", { tipo: "atributo", id: CORPO }, ctxCor);
    expect(depois).not.toContainEqual(L(TONAL, "frente", false));
    expect(depois).toContainEqual(L(TONAL, "tudo"));
  });
  it("escolher uma cor não apaga a excepção de superfície que a zona já tinha", () => {
    const base = [L(TONAL, "tudo"), L(TONAL, "frente", false)];
    const depois = aplicarEscolhaNaZona(base, "frente", { tipo: "atributo", id: CORPO }, ctxCor);
    expect(depois).toContainEqual(L(TONAL, "frente", false));
  });
  it("sem `atributosDeSuperficie` o comportamento é o de sempre (compatibilidade)", () => {
    const base = [L(TONAL, "tudo")];
    const depois = aplicarEscolhaNaZona(base, "frente", { tipo: "atributo", id: CORPO }, { atributosDaCor: [CORPO, FRENTE], pintaHoje: () => [] });
    expect(depois).toContainEqual(L(TONAL, "frente", false));
  });
});
