// @ts-nocheck
/**
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// T7 (guarda, verde desde o inicio): o codigo de uma proposta vai SEMPRE para o telefone
// principal mais recente da ficha, lido na hora e sem copia na proposta. E a ordem do portal
// (`is_primary desc, created_at desc, id desc`) que o Editar e o Info passam a seguir. Se
// alguem a mudar aqui, o Editar, o Info e o portal voltam a poder discordar. E uma rede
// contra regressoes de FORMA lida do codigo-fonte, como as das migrations: a funcao corre em
// Deno e nao se executa no vitest.

const raw = readFileSync(resolve(process.cwd(), "supabase/functions/sms-otp/index.ts"), "utf8");

const code = raw
  .split(/\r?\n/)
  .map((line) => line.replace(/\/\/.*$/, ""))
  .join("\n")
  .replace(/\s+/g, " ");

// Cada leitura de anew_entity_phones, da tabela ate ao fim da cadeia.
const reads = [...code.matchAll(/\.from\("anew_entity_phones"\)(.*?)\.maybeSingle\(\)/g)].map((m) => m[1]);

const position = (chain: string, needle: string) => {
  const index = chain.indexOf(needle);
  expect(index, `em falta: ${needle}`).toBeGreaterThanOrEqual(0);
  return index;
};

describe("sms-otp: o telefone sai da ficha, o principal mais recente", () => {
  it("le o telefone da ficha em duas situacoes (o comercial e o cliente do documento)", () => {
    expect(reads).toHaveLength(2);
  });

  it("em todas as leituras: created_at desc e depois id desc, com um so resultado", () => {
    for (const chain of reads) {
      const byCreated = position(chain, '.order("created_at", { ascending: false })');
      const byId = position(chain, '.order("id", { ascending: false })');
      expect(byCreated).toBeLessThan(byId);
      position(chain, ".limit(1)");
    }
  });

  it("a do cliente do documento pede is_primary desc primeiro (sem principal, o mais recente de todos)", () => {
    const documentRead = reads.find((chain) => chain.includes('.order("is_primary"'));
    expect(documentRead, "leitura do documento").toBeDefined();
    expect(position(documentRead, '.order("is_primary", { ascending: false')).toBeLessThan(
      position(documentRead, '.order("created_at", { ascending: false })'),
    );
  });

  it("nao copia o telefone para a proposta: o numero e lido na hora e nao se grava", () => {
    expect(code).not.toMatch(/\.from\("proposals"\)\s*\.update\([^)]*phone/);
  });
});
