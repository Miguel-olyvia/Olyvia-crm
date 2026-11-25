import { describe, expect, it } from "vitest";
import { composeEntityDisplayName } from "@/lib/entityDisplayName";

// Regra do ECRA (src/lib/entityDisplayName.ts), que ainda aceita a empresa.
// Ja NAO e o espelho da base: o de public.fn_entity_display_name (sem empresa)
// e entityDisplayNameRule em src/lib/entityNameSync.ts.
describe("composeEntityDisplayName (regra unica do nome da ficha)", () => {
  it.each([
    ["empresa ganha a nome + apelido", "person", "Rui", "Silva", "EVOLAR MOVEIS LDA", "EVOLAR MOVEIS LDA"],
    ["empresa com espacos e limpa", "person", "Rui", "Silva", "  EVOLAR   MOVEIS ", "EVOLAR MOVEIS"],
    ["empresa so de espacos conta como vazia", "person", "  Rui ", " Silva  ", "   ", "Rui Silva"],
    ["NBSP conta como espaco", "person", "Rui\u00a0\u00a0Pedro", "Silva", null, "Rui Pedro Silva"],
    ["nome e apelido repetidos", "person", "Rui Silva", "Rui Silva", null, "Rui Silva"],
    ["apelido ja comeca pelo nome", "person", "Rui", "Rui Silva", null, "Rui Silva"],
    ["nome ja acaba no apelido", "person", "Rui Silva", "silva", null, "Rui Silva"],
    ["so nome", "person", "Rui", null, null, "Rui"],
    ["so apelido", "person", null, "Silva", null, "Silva"],
    ["organizacao com empresa", "organization", null, null, "Mudar Lda", "Mudar Lda"],
  ])("%s", (_label, type, first, last, company, expected) => {
    expect(composeEntityDisplayName(type, first, last, company)).toBe(expected);
  });

  it.each([
    ["organizacao sem empresa fica como esta", "organization", null, null, null],
    ["organizacao sem empresa nao compoe nome + apelido", "organization", "Ana", "Costa", null],
    ["pessoa sem nada fica como esta", "person", "", null, ""],
    ["tipo desconhecido sem empresa fica como esta", null, "Ana", "Costa", null],
  ])("%s", (_label, type, first, last, company) => {
    expect(composeEntityDisplayName(type, first, last, company)).toBeNull();
  });
});
