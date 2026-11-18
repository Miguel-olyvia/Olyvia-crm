// Os filtros do passo «Escolher produtos»: só os tipos e utilitários puros (a pesquisa sobre o catálogo é no servidor).
import { describe, expect, it } from "vitest";
import { familiaPorEixos, type FamiliaCfg, type ItemEixos } from "./nucleo";
import { filtrosIniciais, idsEmFamilias, type FiltrosCatalogo } from "./filtrosFamilia";

const item = (id: string, medida: string): ItemEixos => ({ ref: { id, n: id, sku: id, preco: 10, semPvp: false }, atributos: { Medida: medida } });
const fam = (nome: string, ids: string[]): FamiliaCfg => familiaPorEixos(nome, ids.map((id, i) => item(id, `${40 + i}×40 cm`)), { cor: null, medida: ["Medida"] }).familia;

describe("filtrosIniciais", () => {
  it("sem filtros ativos, e as listas não são partilhadas entre chamadas", () => {
    expect(filtrosIniciais()).toEqual({ q: "", marcas: [], categorias: [], soComPreco: false, semFamilia: false, soEscolhidos: false });
    const a = filtrosIniciais(), b = filtrosIniciais();
    (a.marcas as string[]).push("x");
    expect(b.marcas).toEqual([]);
  });
  it("um FiltrosCatalogo preenchido a partir dos iniciais mantém o resto por omissão", () => {
    const f: FiltrosCatalogo = { ...filtrosIniciais(), q: "velar", marcas: ["frasa"] };
    expect(f).toEqual({ ...filtrosIniciais(), q: "velar", marcas: ["frasa"] });
  });
});

describe("idsEmFamilias: os produtos que já estão noutras famílias da sessão", () => {
  const lista = [fam("Alfa", ["a1", "a2"]), fam("Beta", ["b1"])];
  it("junta os produtos das variantes de todas as famílias", () => {
    expect([...idsEmFamilias(lista)].sort()).toEqual(["a1", "a2", "b1"]);
  });
  it("deixa de fora a família que se está a editar (pelo id)", () => {
    expect([...idsEmFamilias(lista, lista[0].id)]).toEqual(["b1"]);
    expect([...idsEmFamilias(lista, "fam:nao-existe")].sort()).toEqual(["a1", "a2", "b1"]);
    expect([...idsEmFamilias(lista, null)].sort()).toEqual(["a1", "a2", "b1"]);
  });
  it("lista vazia: conjunto vazio; um produto repetido conta uma vez; produtos excluídos não contam", () => {
    expect(idsEmFamilias([]).size).toBe(0);
    expect(idsEmFamilias([fam("A", ["x"]), fam("B", ["x"])]).size).toBe(1);
    const comExcluido = familiaPorEixos("C", [item("ok", "40×40 cm"), item("ok2", "40×40 cm")], { cor: null, medida: ["Medida"] }).familia;
    expect([...idsEmFamilias([comExcluido])]).toEqual(["ok"]);
  });
});
