import { describe, expect, it } from "vitest";
import {
  companyNameFromLead,
  companyNameToBackfill,
  displayNameOnInsert,
  displayNameOnUpdate,
  type EntityNameRow,
} from "@/lib/entityNameSync";

// Espelho dos gatilhos de 20261229920000_nome_unico_da_ficha_gatilhos.sql.
// Casos (a)-(f) dos HIGH da revisao: nenhum nome existente muda pela base.

const person = (over: Partial<EntityNameRow> = {}): EntityNameRow => ({
  type: "person",
  display_name: "Rui Silva",
  first_name: "Rui",
  last_name: "Silva",
  company_name: null,
  ...over,
});

describe("gatilho da ficha (guarda-livros)", () => {
  it("(a) pessoa importada 'EVOLAR LDA' e nova submissao so com nome 'Rui': NAO muda", () => {
    const old = person({ display_name: "EVOLAR LDA", first_name: null, last_name: null });
    expect(displayNameOnUpdate(old, { ...old, first_name: "Rui" })).toBe("EVOLAR LDA");
  });

  it("(b) gravar sem tocar no nome, com espacos a mais: NAO muda", () => {
    const old = person();
    expect(displayNameOnUpdate(old, { ...old, first_name: " Rui  ", last_name: "Silva\u00a0" })).toBe("Rui Silva");
  });

  it("(d) ficha em sincronia e o apelido muda para Costa: recompoe 'Rui Costa'", () => {
    const old = person();
    expect(displayNameOnUpdate(old, { ...old, last_name: "Costa" })).toBe("Rui Costa");
  });

  it("(e) UPDATE com display_name explicito: respeitado", () => {
    const old = person();
    expect(displayNameOnUpdate(old, { ...old, last_name: "Costa", display_name: "Sr. Rui" })).toBe("Sr. Rui");
  });

  it("ficha fora de sincronia (nome concatenado): NAO muda", () => {
    const old = person({ display_name: "Rui Silva EVOLAR LDA" });
    expect(displayNameOnUpdate(old, { ...old, last_name: "Costa" })).toBe("Rui Silva EVOLAR LDA");
  });

  it("ficha com empresa em sincronia: mudar o nome deixa a empresa", () => {
    const old = person({ display_name: "EVOLAR LDA", company_name: "EVOLAR LDA" });
    expect(displayNameOnUpdate(old, { ...old, first_name: "Ana" })).toBe("EVOLAR LDA");
  });

  it("UPDATE so de company_name ou type nao recompoe", () => {
    const old = person();
    expect(displayNameOnUpdate(old, { ...old, company_name: "EVOLAR LDA" })).toBe("Rui Silva");
    expect(displayNameOnUpdate(old, { ...old, type: "organization" })).toBe("Rui Silva");
  });

  it("INSERT: um display_name fornecido nunca e sobrescrito; vazio e composto", () => {
    expect(displayNameOnInsert(person({ display_name: "Rui Silva EVOLAR" }))).toBe("Rui Silva EVOLAR");
    expect(displayNameOnInsert(person({ display_name: "  " }))).toBe("Rui Silva");
    expect(displayNameOnInsert(person({ display_name: "", company_name: "EVOLAR" }))).toBe("EVOLAR");
  });
});

describe("gatilho da lead (so regista a empresa)", () => {
  it("(c) lead nova do formulario publico com empresa diferente numa ficha existente: NAO mexe", () => {
    expect(
      companyNameFromLead({
        entity: { display_name: "Rui Silva", company_name: null },
        leadCompany: "OUTRA LDA",
        sharedOutsideRoot: false,
      }),
    ).toBeNull();
  });

  it("lead nova: so regista quando o nome ja e a empresa", () => {
    expect(
      companyNameFromLead({
        entity: { display_name: "EVOLAR LDA", company_name: null },
        leadCompany: " EVOLAR  LDA ",
        sharedOutsideRoot: false,
      }),
    ).toBe("EVOLAR LDA");
  });

  it("lead nova nunca troca uma empresa ja registada", () => {
    expect(
      companyNameFromLead({
        entity: { display_name: "EVOLAR LDA", company_name: "ANTIGA" },
        leadCompany: "EVOLAR LDA",
        sharedOutsideRoot: false,
      }),
    ).toBeNull();
  });

  it("editar a lead: a empresa nova e registada; vazio nunca apaga; partilhada nao", () => {
    const entity = { display_name: "EVOLAR LDA", company_name: "EVOLAR LDA" };
    expect(companyNameFromLead({ entity, leadCompany: "NOVA", oldLeadCompany: "EVOLAR LDA", sharedOutsideRoot: false })).toBe("NOVA");
    expect(companyNameFromLead({ entity, leadCompany: "", oldLeadCompany: "EVOLAR LDA", sharedOutsideRoot: false })).toBeNull();
    expect(companyNameFromLead({ entity, leadCompany: "NOVA", oldLeadCompany: "EVOLAR LDA", sharedOutsideRoot: true })).toBeNull();
  });
});

describe("gatilho da lead: lead que ja existia (formulario em varios passos)", () => {
  it("passo 2 traz OUTRA numa lead criada sem empresa: NAO troca a empresa do cliente", () => {
    expect(
      companyNameFromLead({
        entity: { display_name: "EVOLAR LDA", company_name: "EVOLAR LDA" },
        leadCompany: "OUTRA",
        oldLeadCompany: null,
        sharedOutsideRoot: false,
      }),
    ).toBeNull();
  });

  it("empresa por registar na ficha: regista", () => {
    expect(
      companyNameFromLead({
        entity: { display_name: "Rui Silva", company_name: null },
        leadCompany: "OUTRA",
        oldLeadCompany: null,
        sharedOutsideRoot: false,
      }),
    ).toBe("OUTRA");
  });

  it("a empresa da ficha veio desta lead: a correccao e registada", () => {
    expect(
      companyNameFromLead({
        entity: { display_name: "EVOLAR LDA", company_name: "EVOLAR LDA" },
        leadCompany: "EVOLAR MOVEIS LDA",
        oldLeadCompany: " EVOLAR  LDA",
        sharedOutsideRoot: false,
      }),
    ).toBe("EVOLAR MOVEIS LDA");
  });

  it("a empresa da ficha veio de outro lado: NAO troca", () => {
    expect(
      companyNameFromLead({
        entity: { display_name: "EVOLAR LDA", company_name: "EVOLAR LDA" },
        leadCompany: "NOVA",
        oldLeadCompany: "ANTIGA",
        sharedOutsideRoot: false,
      }),
    ).toBeNull();
  });
});

describe("(f) preenchimento da migration", () => {
  it("so onde o display_name ja e exactamente a empresa", () => {
    expect(companyNameToBackfill({ display_name: "EVOLAR LDA", company_name: null }, ["EVOLAR LDA", null], false)).toBe("EVOLAR LDA");
    expect(companyNameToBackfill({ display_name: "Rui Silva", company_name: null }, ["EVOLAR LDA"], false)).toBeNull();
    expect(companyNameToBackfill({ display_name: "Rui Silva EVOLAR LDA", company_name: null }, ["EVOLAR LDA"], false)).toBeNull();
  });

  it("leads que discordam, empresa ja registada ou ficha partilhada: nada", () => {
    expect(companyNameToBackfill({ display_name: "A", company_name: null }, ["A", "B"], false)).toBeNull();
    expect(companyNameToBackfill({ display_name: "A", company_name: "A" }, ["A"], false)).toBeNull();
    expect(companyNameToBackfill({ display_name: "A", company_name: null }, ["A"], true)).toBeNull();
  });
});
