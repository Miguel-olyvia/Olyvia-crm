import { describe, expect, it } from "vitest";
import {
  composeEntityName,
  displayNameOnInsert,
  displayNameOnUpdate,
  entityDisplayNameRule,
  setEntityKind,
  type EntityNameRow,
} from "@/lib/entityNameSync";

// Espelho de 20261229910000_nome_unico_da_ficha.sql: as funcoes puras, o
// gatilho e a decisao de rpc_set_entity_kind. Os casos da regra sao os mesmos
// do bloco CONFERIR da migration.

const person = (over: Partial<EntityNameRow> = {}): EntityNameRow => ({
  type: "person",
  display_name: "Rui Silva",
  first_name: "Rui",
  last_name: "Silva",
  company_name: null,
  ...over,
});

const company = (over: Partial<EntityNameRow> = {}): EntityNameRow => ({
  type: "organization",
  display_name: "EVOLAR LDA",
  first_name: "Rui",
  last_name: "Silva",
  company_name: "EVOLAR LDA",
  ...over,
});

describe("regra do nome por tipo (fn_entity_compose_name / fn_entity_display_name)", () => {
  it.each([
    ["pessoa: nome + apelido, ignora a empresa", person({ company_name: "EVOLAR LDA" }), "Rui Silva"],
    ["empresa: o nome da empresa, aparado", company({ company_name: "  EVOLAR   LDA " }), "EVOLAR LDA"],
    ["NBSP conta como espaco", person({ first_name: "Rui\u00a0\u00a0Pedro" }), "Rui Pedro Silva"],
    ["nome e apelido repetidos", person({ first_name: "Rui Silva", last_name: "Rui Silva" }), "Rui Silva"],
    ["apelido ja comeca pelo nome", person({ last_name: "Rui Silva" }), "Rui Silva"],
    ["nome ja acaba no apelido", person({ first_name: "Rui Silva", last_name: "silva" }), "Rui Silva"],
  ])("%s", (_label, row, expected) => {
    expect(composeEntityName(row)).toBe(expected);
  });

  it("sem com que compor: a composicao estrita e null e a regra devolve o nome actual", () => {
    const imported = person({ display_name: "EVOLAR LDA", first_name: null, last_name: null });
    expect(composeEntityName(imported)).toBeNull();
    expect(entityDisplayNameRule(imported)).toBe("EVOLAR LDA");
    const orgWithoutCompany = company({ display_name: "Mudar Lda", company_name: null });
    expect(composeEntityName(orgWithoutCompany)).toBeNull();
    expect(entityDisplayNameRule(orgWithoutCompany)).toBe("Mudar Lda");
  });
});

describe("gatilho da ficha", () => {
  it("(a) 'EVOLAR LDA' importado como pessoa recebe so um first_name: NAO muda", () => {
    const old = person({ display_name: "EVOLAR LDA", first_name: null, last_name: null });
    expect(displayNameOnUpdate(old, { ...old, first_name: "Rui" })).toBe("EVOLAR LDA");
  });

  it("(b) gravar com espacos a mais sem alterar o nome: NAO muda", () => {
    const old = person();
    expect(displayNameOnUpdate(old, { ...old, first_name: " Rui  ", last_name: "Silva\u00a0" })).toBe("Rui Silva");
  });

  it("(e) 'Rui Silva' em sincronia e o apelido muda por um fluxo so de first/last: 'Rui Costa'", () => {
    const old = person();
    expect(displayNameOnUpdate(old, { ...old, last_name: "Costa" })).toBe("Rui Costa");
  });

  it("'Rui' sem apelido, e uma lead nova ou o update-lead preenche o apelido 'Silva': NAO muda", () => {
    const old = person({ display_name: "Rui", last_name: null });
    expect(displayNameOnUpdate(old, { ...old, last_name: "Silva" })).toBe("Rui");
    const blank = person({ display_name: "Rui", last_name: "  " });
    expect(displayNameOnUpdate(blank, { ...blank, last_name: "Silva" })).toBe("Rui");
  });

  it("'Silva' so com apelido, e preenche-se o nome: NAO muda", () => {
    const old = person({ display_name: "Silva", first_name: null });
    expect(displayNameOnUpdate(old, { ...old, first_name: "Rui" })).toBe("Silva");
  });

  it("nome e apelido vazios, e preenchem-se ambos: NAO muda", () => {
    const old = person({ display_name: "Rui Silva", first_name: null, last_name: "" });
    expect(displayNameOnUpdate(old, { ...old, first_name: "Ana", last_name: "Costa" })).toBe("Rui Silva");
  });

  it("'Rui Silva' -> 'Rui Costa' e depois mantem-se (gravar de novo sem mudar nada)", () => {
    const old = person();
    const renamed = { ...old, last_name: "Costa", display_name: displayNameOnUpdate(old, { ...old, last_name: "Costa" }) };
    expect(renamed.display_name).toBe("Rui Costa");
    expect(displayNameOnUpdate(renamed, { ...renamed })).toBe("Rui Costa");
  });

  it("so a capitalizacao muda ('Rui Silva' -> 'rui silva'): NAO renomeia", () => {
    const old = person();
    expect(displayNameOnUpdate(old, { ...old, first_name: "rui", last_name: "silva" })).toBe("Rui Silva");
    const org = company();
    expect(displayNameOnUpdate(org, { ...org, company_name: "evolar lda" })).toBe("EVOLAR LDA");
  });

  it("os mesmos casos do bloco CONFERIR da parte 2 (tabela temporaria)", () => {
    const run = (row: EntityNameRow, change: Partial<EntityNameRow>) => {
      const inserted = { ...row, display_name: displayNameOnInsert(row) };
      return displayNameOnUpdate(inserted, { ...inserted, ...change });
    };
    expect([
      run(person({ display_name: "  " }), { last_name: "Costa" }),
      run(person({ display_name: "Sr. Rui" }), {}),
      run(person({ display_name: "Rui", last_name: null }), { last_name: "Silva" }),
      run(person({ company_name: "EVOLAR LDA" }), { type: "organization" }),
      run(company(), { company_name: "NOVA LDA" }),
      run(person({ display_name: "EVOLAR LDA" }), { last_name: "Costa" }),
      run(company({ display_name: "Mudar Lda", first_name: null, last_name: null, company_name: null }), { company_name: "Outra" }),
      run(person(), { first_name: "rui", last_name: "silva" }),
      run(person(), { last_name: "Lopes", display_name: "Sr. Rui" }),
    ]).toEqual(["Rui Costa", "Sr. Rui", "Rui", "Rui Silva", "NOVA LDA", "EVOLAR LDA", "Mudar Lda", "Rui Silva", "Sr. Rui"]);
  });

  it("empresa sem company_name que recebe uma (preenchimento): NAO muda", () => {
    const old = company({ display_name: "EVOLAR LDA", company_name: null });
    expect(displayNameOnUpdate(old, { ...old, company_name: "OUTRA LDA" })).toBe("EVOLAR LDA");
  });

  it("mudar o tipo por UPDATE directo nao recompoe (so a RPC muda o tipo)", () => {
    const old = person({ company_name: "EVOLAR LDA" });
    expect(displayNameOnUpdate(old, { ...old, type: "organization" })).toBe("Rui Silva");
  });

  it("(f) display_name explicito: respeitado", () => {
    const old = person();
    expect(displayNameOnUpdate(old, { ...old, last_name: "Costa", display_name: "Sr. Rui" })).toBe("Sr. Rui");
  });

  it("(g) organizacao em sincronia cuja empresa muda por UPDATE directo: recompoe", () => {
    const old = company();
    expect(displayNameOnUpdate(old, { ...old, company_name: "EVOLAR MOVEIS LDA" })).toBe("EVOLAR MOVEIS LDA");
  });

  it("organizacao sem empresa registada (fichas existentes): NAO esta em sincronia, NAO muda", () => {
    const old = company({ display_name: "Mudar Lda", company_name: null });
    expect(displayNameOnUpdate(old, { ...old, company_name: "Outra" })).toBe("Mudar Lda");
  });

  it("empresa: mudar a pessoa de contacto nao muda o nome", () => {
    const old = company();
    expect(displayNameOnUpdate(old, { ...old, first_name: "Ana" })).toBe("EVOLAR LDA");
  });

  it("nome concatenado (fora de sincronia): NAO muda", () => {
    const old = person({ display_name: "Rui Silva EVOLAR LDA" });
    expect(displayNameOnUpdate(old, { ...old, last_name: "Costa" })).toBe("Rui Silva EVOLAR LDA");
  });

  it("INSERT: um display_name fornecido nunca e sobrescrito; vazio e composto", () => {
    expect(displayNameOnInsert(person({ display_name: "Rui Silva EVOLAR" }))).toBe("Rui Silva EVOLAR");
    expect(displayNameOnInsert(person({ display_name: "  " }))).toBe("Rui Silva");
    expect(displayNameOnInsert(company({ display_name: "" }))).toBe("EVOLAR LDA");
  });
});

describe("rpc_set_entity_kind (decisao)", () => {
  it("(c) pessoa passa a Empresa: nome = empresa, company_name preenchido, nome/apelido ficam", () => {
    const result = setEntityKind(person(), { type: "organization", company_name: " EVOLAR  LDA " });
    expect(result).toEqual({
      ok: true,
      row: { type: "organization", display_name: "EVOLAR LDA", first_name: "Rui", last_name: "Silva", company_name: "EVOLAR LDA" },
    });
  });

  it("(d) Empresa passa a Pessoa: nome = nome + apelido", () => {
    const result = setEntityKind(company(), { type: "person", first_name: "Ana", last_name: "Costa" });
    expect(result.ok && result.row.display_name).toBe("Ana Costa");
    expect(result.ok && result.row.type).toBe("person");
  });

  it("(h) tipo invalido, Empresa sem nome ou Pessoa sem nome: recusa", () => {
    expect(setEntityKind(person(), { type: "company", company_name: "X" })).toEqual({ ok: false, error: "tipo_invalido" });
    expect(setEntityKind(person(), { type: "organization", company_name: "  " })).toEqual({ ok: false, error: "empresa_obrigatoria" });
    expect(setEntityKind(company(), { type: "person", first_name: "", last_name: null })).toEqual({ ok: false, error: "nome_obrigatorio" });
  });

  it("Empresa: nome e apelido existentes ficam (nao passam a NULL)", () => {
    const result = setEntityKind(person(), { type: "organization", company_name: "EVOLAR LDA", first_name: null, last_name: "" });
    expect(result.ok && [result.row.first_name, result.row.last_name]).toEqual(["Rui", "Silva"]);
  });

  it("limites e caracteres de controlo: empresa ate 200, nome e apelido ate 100", () => {
    expect(setEntityKind(person(), { type: "organization", company_name: "A".repeat(200) }).ok).toBe(true);
    expect(setEntityKind(person(), { type: "organization", company_name: "A".repeat(201) })).toEqual({ ok: false, error: "valor_invalido" });
    expect(setEntityKind(person(), { type: "person", first_name: "R".repeat(101) })).toEqual({ ok: false, error: "valor_invalido" });
    expect(setEntityKind(person(), { type: "person", first_name: "Rui", last_name: "S".repeat(101) })).toEqual({ ok: false, error: "valor_invalido" });
    expect(setEntityKind(person(), { type: "organization", company_name: "EVOLAR\u0000LDA" })).toEqual({ ok: false, error: "valor_invalido" });
    expect(setEntityKind(person(), { type: "person", first_name: "Rui\u007f" })).toEqual({ ok: false, error: "valor_invalido" });
    // tabulacoes e quebras de linha sao espaco: juntam-se antes de validar
    expect(setEntityKind(person(), { type: "person", first_name: "Rui\tPedro", last_name: "Silva" })).toMatchObject({ ok: true, row: { display_name: "Rui Pedro Silva" } });
  });

  it("o resultado da RPC fica em sincronia (o gatilho volta a acompanhar edicoes)", () => {
    const result = setEntityKind(person(), { type: "organization", company_name: "EVOLAR LDA" });
    if (!result.ok) throw new Error("esperava ok");
    expect(displayNameOnUpdate(result.row, { ...result.row, company_name: "NOVA LDA" })).toBe("NOVA LDA");
  });
});
