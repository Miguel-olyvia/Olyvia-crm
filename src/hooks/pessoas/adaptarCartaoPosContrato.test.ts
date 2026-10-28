import { describe, expect, it } from "vitest";
import { seed, type Negocio } from "@/emylia/motor";
import { cartaoPosContratoDe, filtrarCartoesPosContrato, type CartaoPosContrato } from "./adaptarCartaoPosContrato";

const S = seed();
const deal = (fase: number, extra: Partial<Negocio> = {}): Negocio => ({ ...structuredClone(seed().deals[0]), fase, perdido: false, anulado: undefined, ...extra });
const lido = (d: Negocio, id = "uuid-1", entityId = "ent-1") => ({ id, entityId, d });

describe("cartaoPosContratoDe (um negócio lido por neg_ler_negocios vira cartão de Financeiro ou de Obra)", () => {
  it("fase 4 é Financeiro e fase 5 é Obra, com o id do negócio na base e a pessoa (entity) para abrir a ficha", () => {
    expect(cartaoPosContratoDe(lido(deal(4)), S)).toMatchObject({ id: "uuid-1", pessoaId: "ent-1", coluna: "financeiro" });
    expect(cartaoPosContratoDe(lido(deal(5)), S)?.coluna).toBe("obra");
  });
  it("fora das fases 4 e 5, perdido ou anulado não é cartão destas colunas", () => {
    for (const f of [0, 1, 2, 3, 6]) expect(cartaoPosContratoDe(lido(deal(f)), S)).toBeNull();
    expect(cartaoPosContratoDe(lido(deal(4, { perdido: true })), S)).toBeNull();
    expect(cartaoPosContratoDe(lido(deal(4, { anulado: { q: "x", por: "y", motivo: "z", origem: "negocio" } })), S)).toBeNull();
  });
  it("mostra o nome, o serviço e o passo seguinte que a Emylia diz (texto dela, não inventado)", () => {
    const c = cartaoPosContratoDe(lido(deal(4, { nome: "Ana Lopes", servico: "WC social" })), S);
    expect(c?.nome).toBe("Ana Lopes");
    expect(c?.trabalho).toBe("WC social");
    expect(typeof c?.passo).toBe("string");
    expect(c?.passo.length).toBeGreaterThan(0);
  });
  it("na Obra sem plano o passo diz-o em vez de rebentar", () => {
    const d = deal(5);
    d.obra.plano = null;
    expect(cartaoPosContratoDe(lido(d), S)?.passo).toMatch(/plano/i);
  });
  it("sem orçamento o valor é nulo (nada de valor de exemplo)", () => {
    expect(cartaoPosContratoDe(lido(deal(4, { orc: null })), S)?.valor).toBeNull();
  });
});

const c = (id: string, nome: string, trabalho: string | null = null, papel: CartaoPosContrato["papel"] = "cliente"): CartaoPosContrato =>
  ({ id, pessoaId: `p-${id}`, nome, papel, coluna: "financeiro", trabalho, valor: null, passo: "x" });

describe("filtrarCartoesPosContrato (o mesmo filtro do Pipeline)", () => {
  const todos = [c("1", "Ana Lopes", "WC social"), c("2", "Bruno Dias", "Cozinha"), c("3", "Ângela Reis", "Cozinha")];
  it("sem filtros devolve todos, por mais recentes (a ordem de entrada)", () => {
    expect(filtrarCartoesPosContrato(todos, { papel: null, pesquisa: "", ordem: "recentes" }).map((x) => x.id)).toEqual(["1", "2", "3"]);
  });
  it("a pesquisa vale pelo nome ou pelo serviço, sem maiúsculas nem acentos, e só a partir de 2 letras", () => {
    const f = (pesquisa: string) => filtrarCartoesPosContrato(todos, { papel: null, pesquisa, ordem: "recentes" }).map((x) => x.id);
    expect(f("ana")).toEqual(["1"]);
    expect(f("angela")).toEqual(["3"]);
    expect(f("COZINHA")).toEqual(["2", "3"]);
    expect(f("a")).toEqual(["1", "2", "3"]);
  });
  it("o papel «lead» não tem cartões aqui (um negócio com contrato é de cliente); «cliente» tem todos", () => {
    expect(filtrarCartoesPosContrato(todos, { papel: "lead", pesquisa: "", ordem: "recentes" })).toEqual([]);
    expect(filtrarCartoesPosContrato(todos, { papel: "cliente", pesquisa: "", ordem: "recentes" })).toHaveLength(3);
  });
  it("ordenar por nome", () => {
    expect(filtrarCartoesPosContrato(todos, { papel: null, pesquisa: "", ordem: "nome" }).map((x) => x.id)).toEqual(["1", "3", "2"]);
  });
});
