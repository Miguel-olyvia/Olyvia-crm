/**
 * @vitest-environment node
 *
 * Nome de uma ficha NOVA criada por uma Edge Function publica (create-lead,
 * insert-lead, book-slot): a empresa se a lead a traz, senao nome + apelido --
 * a mesma regra do ecra (resolveLeadNames / composeNameForSave) e da base
 * (fn_entity_display_name). A empresa le-se com as MESMAS chaves, pela mesma
 * ordem, do AnewLeadEditDialog e de fn_lead_company_from_field_values; assim o
 * gatilho da lead regista company_name (o nome ja e a empresa).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEAD_COMPANY_KEYS,
  leadCompanyFromFieldValues,
  newLeadEntityDisplayName,
} from "./leadCompany";

describe("leadCompanyFromFieldValues", () => {
  it("usa as mesmas chaves e a mesma ordem da funcao SQL", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261229910000_nome_unico_da_ficha.sql"),
      "utf8",
    );
    const keys = LEAD_COMPANY_KEYS.map((k) => `'${k}'`).join(", ");
    expect(sql).toContain(`ARRAY[${keys}]`);
  });

  it.each([
    [{ empresa: "EVOLAR LDA" }, undefined, "EVOLAR LDA"],
    [{ company_name: "", empresa: " EVOLAR   LDA " }, undefined, "EVOLAR LDA"],
    [{ company: "A", empresa: "B" }, undefined, "B"],
    [{ nome: "Rui" }, undefined, ""],
    [{ empresa: null }, undefined, ""],
    [{ empresa: { value: "X Lda" } }, undefined, "X Lda"],
    [{ campo_custom: "Mapeada Lda", empresa: "Alias" }, "campo_custom", "Mapeada Lda"],
    [{ campo_custom: "", empresa: "Alias" }, "campo_custom", "Alias"],
  ])("%j (mapeada %s) -> %s", (values, mapped, expected) => {
    expect(leadCompanyFromFieldValues(values as Record<string, unknown>, mapped)).toBe(expected);
  });

  it("sem valores", () => {
    expect(leadCompanyFromFieldValues(null)).toBe("");
    expect(leadCompanyFromFieldValues(undefined)).toBe("");
  });
});

describe("newLeadEntityDisplayName", () => {
  it("empresa ganha a nome + apelido", () => {
    expect(newLeadEntityDisplayName({ company: "EVOLAR LDA", first: "Rui", last: "Silva" })).toBe("EVOLAR LDA");
  });

  it("sem empresa: nome + apelido, com a deduplicacao do composeDisplayName", () => {
    expect(newLeadEntityDisplayName({ company: "", first: "Rui", last: "Silva" })).toBe("Rui Silva");
    expect(newLeadEntityDisplayName({ company: "  ", first: "Rui Silva", last: "Rui Silva" })).toBe("Rui Silva");
  });

  it("nada: vazio (o chamador poe 'Lead')", () => {
    expect(newLeadEntityDisplayName({ company: null, first: "", last: null })).toBe("");
  });
});

// As Edge Functions so usam a regra no ramo que CRIA a ficha; uma ficha
// reaproveitada por email/telefone nunca e renomeada.
describe("Edge Functions: so a ficha NOVA leva a empresa no nome", () => {
  const read = (fn: string) =>
    readFileSync(resolve(process.cwd(), `supabase/functions/${fn}/index.ts`), "utf8");

  it.each([
    ["create-lead", "if (!entityId) {"],
    ["insert-lead", "if (!entityId) {"],
    ["book-slot", "if (!entityId) {"],
  ])("%s", (fn, newBranch) => {
    const src = read(fn);
    expect(src).toContain("from '../_shared/leadCompany.ts'");
    const uses = [...src.matchAll(/newLeadEntityDisplayName\(/g)].map((m) => m.index ?? -1);
    expect(uses.length).toBe(1);
    const branch = src.lastIndexOf(newBranch, uses[0]);
    expect(branch).toBeGreaterThan(-1);
    // A chamada esta no proprio ramo de criacao (poucas linhas depois do if).
    const between = src.slice(branch, uses[0]);
    expect(between.split("\n").length).toBeLessThan(12);
    expect(between).not.toContain("}"); // nada fecha o ramo antes da chamada
  });
});
