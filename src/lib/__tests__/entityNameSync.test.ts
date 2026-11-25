import { describe, expect, it } from "vitest";
import {
  displayNameOnInsert,
  displayNameOnUpdate,
  entityDisplayNameRule,
  type EntityNameRow,
} from "@/lib/entityNameSync";

// Espelho do gatilho de 20261229910000_nome_unico_da_ficha.sql. Os casos da
// regra sao os mesmos do bloco CONFERIR da migration.

const person = (over: Partial<EntityNameRow> = {}): EntityNameRow => ({
  type: "person",
  display_name: "Rui Silva",
  first_name: "Rui",
  last_name: "Silva",
  ...over,
});

describe("entityDisplayNameRule (fn_entity_display_name)", () => {
  it.each([
    ["pessoa: nome + apelido, ignora o nome guardado", person({ display_name: "qualquer" }), "Rui Silva"],
    ["espacos a mais", person({ first_name: "  Rui ", last_name: " Silva  " }), "Rui Silva"],
    ["NBSP conta como espaco", person({ first_name: "Rui\u00a0\u00a0Pedro" }), "Rui Pedro Silva"],
    ["nome e apelido repetidos", person({ first_name: "Rui Silva", last_name: "Rui Silva" }), "Rui Silva"],
    ["apelido ja comeca pelo nome", person({ last_name: "Rui Silva" }), "Rui Silva"],
    ["nome ja acaba no apelido", person({ first_name: "Rui Silva", last_name: "silva" }), "Rui Silva"],
    ["organizacao: o proprio nome", { type: "organization", display_name: " Mudar  Lda ", first_name: "Ana", last_name: "Costa" }, "Mudar Lda"],
  ])("%s", (_label, row, expected) => {
    expect(entityDisplayNameRule(row)).toBe(expected);
  });

  it("sem nada com que compor: null", () => {
    expect(entityDisplayNameRule(person({ first_name: "", last_name: null, display_name: "EVOLAR LDA" }))).toBeNull();
    expect(entityDisplayNameRule({ type: "organization", display_name: "  ", first_name: null, last_name: null })).toBeNull();
  });
});

describe("gatilho da ficha: casos da revisao", () => {
  it("(a) pessoa importada 'EVOLAR LDA' e nova submissao so com nome 'Rui': NAO muda", () => {
    const old = person({ display_name: "EVOLAR LDA", first_name: null, last_name: null });
    expect(displayNameOnUpdate(old, { ...old, first_name: "Rui" })).toBe("EVOLAR LDA");
  });

  it("(b) gravar sem tocar no nome, com espacos a mais: NAO muda", () => {
    const old = person();
    expect(displayNameOnUpdate(old, { ...old, first_name: " Rui  ", last_name: "Silva\u00a0" })).toBe("Rui Silva");
  });

  it("(c) ficha com nome de empresa e um fluxo so de nome/apelido: NAO muda", () => {
    const old = person({ display_name: "EVOLAR LDA" });
    expect(displayNameOnUpdate(old, { ...old, first_name: "Ana" })).toBe("EVOLAR LDA");
  });

  it("(d) ficha em sincronia e o apelido muda para Costa: troca para 'Rui Costa'", () => {
    const old = person();
    expect(displayNameOnUpdate(old, { ...old, last_name: "Costa" })).toBe("Rui Costa");
  });

  it("(e) UPDATE com display_name explicito: respeitado", () => {
    const old = person();
    expect(displayNameOnUpdate(old, { ...old, last_name: "Costa", display_name: "Sr. Rui" })).toBe("Sr. Rui");
  });

  it("(f) nome concatenado ou editado a mao (fora de sincronia): NAO muda", () => {
    const old = person({ display_name: "Rui Silva EVOLAR LDA" });
    expect(displayNameOnUpdate(old, { ...old, last_name: "Costa" })).toBe("Rui Silva EVOLAR LDA");
  });

  it("organizacao: mudar nome/apelido nunca muda o nome", () => {
    const old: EntityNameRow = { type: "organization", display_name: "Mudar Lda", first_name: "Ana", last_name: "Costa" };
    expect(displayNameOnUpdate(old, { ...old, last_name: "Silva" })).toBe("Mudar Lda");
  });

  it("UPDATE so de type nao recompoe", () => {
    const old = person();
    expect(displayNameOnUpdate(old, { ...old, type: "organization" })).toBe("Rui Silva");
  });

  it("INSERT: um display_name fornecido nunca e sobrescrito; vazio e composto", () => {
    expect(displayNameOnInsert(person({ display_name: "Rui Silva EVOLAR" }))).toBe("Rui Silva EVOLAR");
    expect(displayNameOnInsert(person({ display_name: "  " }))).toBe("Rui Silva");
    expect(displayNameOnInsert({ type: "organization", display_name: "", first_name: null, last_name: null })).toBe("");
  });
});
