// As regras MQL/SQL de Pessoas: o que se mostra (só o que o editor sabe editar), o que se envia à função da base (só o que ela aceita)
// e como se lê o que ela devolve. O catálogo é o de Leads (conditionCatalog.ts); aqui vigia-se que continua a bater certo com a função.
import { describe, expect, it } from "vitest";
import { CONDITION_CATALOG, QUALIFICATION_LEGACY_KEYS } from "@/components/leads/workflow/conditionCatalog";
import { lerRegras, lerResultadoGuardar, limparRegra, paraEnvio, TIPOS_ACEITES } from "./regrasQualificacao";

/** Os 11 tipos que neg_guardar_regras_qualificacao aceita (migration 20261226030000, lista c_tipos). */
const TIPOS_DA_FUNCAO = [
  "has_assignee", "has_source", "has_contact_logged", "has_scheduled_visit", "has_active_deal", "has_active_quote",
  "has_active_proposal", "has_signed_contract", "qualification_is", "last_contact_is_negative", "last_contact_is_positive",
];

describe("o catálogo editável bate certo com a função da base", () => {
  it("as condições que o editor oferece são exatamente os 11 tipos que a função aceita", () => {
    const oferecidos = CONDITION_CATALOG.filter((r) => QUALIFICATION_LEGACY_KEYS.includes(r.key)).map((r) => r.build().type);
    expect([...new Set(oferecidos)].sort()).toEqual([...TIPOS_DA_FUNCAO].sort());
    expect([...TIPOS_ACEITES].sort()).toEqual([...TIPOS_DA_FUNCAO].sort());
  });
});

describe("limparRegra", () => {
  it("sem regra, ou vazia, devolve null e nada descartado", () => {
    expect(limparRegra(null)).toEqual({ regra: null, descartadas: 0 });
    expect(limparRegra(undefined)).toEqual({ regra: null, descartadas: 0 });
    expect(limparRegra({ all: [], any: [] })).toEqual({ regra: null, descartadas: 0 });
    expect(limparRegra({})).toEqual({ regra: null, descartadas: 0 });
  });

  it("uma entrada que não é objeto (texto, lista, número) vale como sem regra", () => {
    for (const lixo of ["has_source", ["has_source"], 7, true]) expect(limparRegra(lixo)).toEqual({ regra: null, descartadas: 0 });
  });

  it("devolve sempre as duas listas, mesmo que só uma venha preenchida", () => {
    expect(limparRegra({ any: [{ type: "has_active_quote" }] }).regra).toEqual({ all: [], any: [{ type: "has_active_quote" }] });
  });

  it("deixa a condição na forma canónica: sem chaves a mais nem valor onde não há", () => {
    const { regra } = limparRegra({ all: [{ type: "has_source", value: 1, extra: true }], any: [] });
    expect(regra).toEqual({ all: [{ type: "has_source" }], any: [] });
  });

  it("qualification_is mantém o valor mql ou sql e descarta qualquer outro", () => {
    const { regra, descartadas } = limparRegra({
      all: [{ type: "qualification_is", value: "mql" }, { type: "qualification_is", value: "xyz" }, { type: "qualification_is" }],
      any: [{ type: "qualification_is", value: "sql" }],
    });
    expect(regra).toEqual({ all: [{ type: "qualification_is", value: "mql" }], any: [{ type: "qualification_is", value: "sql" }] });
    expect(descartadas).toBe(2);
  });

  it("descarta e conta o que o editor não mostra: tipos de fora, texto solto, números e objetos sem tipo", () => {
    const { regra, descartadas } = limparRegra({
      all: [{ type: "has_deal_won" }, "has_assignee", { type: "has_source" }, 5, null, { nome: "x" }],
      any: [{ type: "days_since_created_gt", value: 7 }],
    });
    expect(regra).toEqual({ all: [{ type: "has_source" }], any: [] });
    expect(descartadas).toBe(6);
  });

  it("tira duplicados exatos sem os contar como descartados, e mantém a ordem da primeira ocorrência", () => {
    const { regra, descartadas } = limparRegra({
      all: [{ type: "has_source" }, { type: "has_assignee" }, { type: "has_source", value: 3 }],
      any: [],
    });
    expect(regra).toEqual({ all: [{ type: "has_source" }, { type: "has_assignee" }], any: [] });
    expect(descartadas).toBe(0);
  });

  it("se só sobram condições descartadas, a regra fica null", () => {
    expect(limparRegra({ all: [{ type: "has_deal_won" }], any: [] })).toEqual({ regra: null, descartadas: 1 });
  });

  it("listas que não são listas contam como vazias", () => {
    expect(limparRegra({ all: { type: "has_source" }, any: "x" })).toEqual({ regra: null, descartadas: 0 });
  });

  it("não muda o que recebe", () => {
    const entrada = { all: [{ type: "has_source", value: 1 }], any: [] };
    const copia = JSON.parse(JSON.stringify(entrada));
    limparRegra(entrada);
    expect(entrada).toEqual(copia);
  });
});

describe("paraEnvio", () => {
  it("é a regra limpa: null quando não sobra nada", () => {
    expect(paraEnvio(null)).toBeNull();
    expect(paraEnvio({ all: [], any: [] })).toBeNull();
    expect(paraEnvio({ all: [{ type: "has_source" }], any: [] })).toEqual({ all: [{ type: "has_source" }], any: [] });
  });
});

describe("lerRegras", () => {
  it("sem linha (a organização nunca gravou regras) não há regras nem descartadas", () => {
    expect(lerRegras(null)).toEqual({ mql: null, sql: null, descartadas: 0 });
    expect(lerRegras(undefined)).toEqual({ mql: null, sql: null, descartadas: 0 });
    expect(lerRegras("x")).toEqual({ mql: null, sql: null, descartadas: 0 });
  });

  it("lê mql_when e sql_when, limpos, e soma o que descartou das duas", () => {
    const r = lerRegras({
      mql_when: { all: [{ type: "has_source" }], any: [] },
      sql_when: { any: [{ type: "has_deal_won" }, { type: "has_signed_contract" }] },
    });
    expect(r.mql).toEqual({ all: [{ type: "has_source" }], any: [] });
    expect(r.sql).toEqual({ all: [], any: [{ type: "has_signed_contract" }] });
    expect(r.descartadas).toBe(1);
  });
});

describe("lerResultadoGuardar", () => {
  it("lê mudou e as regras de depois", () => {
    const r = lerResultadoGuardar({
      antes: { mql_when: null, sql_when: null },
      depois: { mql_when: { all: [{ type: "has_source" }], any: [] }, sql_when: null },
      mudou: true,
    });
    expect(r).toEqual({ mudou: true, depois: { mql: { all: [{ type: "has_source" }], any: [] }, sql: null } });
  });

  it("mudou:false mantém as regras de depois", () => {
    const r = lerResultadoGuardar({ antes: {}, depois: { mql_when: null, sql_when: null }, mudou: false });
    expect(r).toEqual({ mudou: false, depois: { mql: null, sql: null } });
  });

  it("só mudou === true conta como alteração (texto ou 1 não)", () => {
    for (const mudou of ["true", 1, "sim", null, undefined]) {
      expect(lerResultadoGuardar({ depois: { mql_when: null, sql_when: null }, mudou }).mudou).toBe(false);
    }
  });

  it("uma resposta que não se reconhece dá mudou:false e depois null (quem chama relê da base)", () => {
    for (const lixo of [null, undefined, "x", 3, [], {}]) {
      expect(lerResultadoGuardar(lixo)).toEqual({ mudou: false, depois: null });
    }
  });

  it("se a base diz que mudou mas as regras de depois não se reconhecem, mantém mudou:true (gravou) e depois null", () => {
    expect(lerResultadoGuardar({ mudou: true })).toEqual({ mudou: true, depois: null });
    expect(lerResultadoGuardar({ depois: "x", mudou: true })).toEqual({ mudou: true, depois: null });
  });
});
