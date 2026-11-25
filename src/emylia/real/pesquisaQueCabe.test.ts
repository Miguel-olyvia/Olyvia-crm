// 23/11: «A pesquisa tem no máximo 10 palavras» impedia criar produtos com o nome real do fornecedor: o Criar procura o nome para ver se já existe
// (procurarDuplicado → cat_ler_produtos_pagina), e a base recusa pesquisas com mais de 10 palavras ou 200 caracteres (fn_cat_termos_pesquisa).
import { beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => unknown,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }) },
}));

import { PESQUISA_MAX_CARACTERES, PESQUISA_MAX_PALAVRAS, SEM_FILTRO_SERVIDOR, argsPagina, argsPesquisa, pesquisaQueCabe } from "./produtosPaginados";
import { procurarDuplicado } from "./produtosLeves";

const ORG = "3242e925-da26-459a-8258-be04d904e355";
const NOME = "Móvel AXIS Suspenso c/lavatório 60x50x36 - 2 Gav c/ Fundo Reduzido";
/** As palavras como a base as conta: sem acentos, minúsculas, sem repetidas. */
const palavrasDaBase = (q: string) => new Set(q.trim().split(/\s+/).map((w) => w.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()).filter(Boolean));

beforeEach(() => { base.chamadas = []; base.responder = () => ({ data: null, error: null }); });

describe("pesquisaQueCabe", () => {
  it("uma pesquisa curta vai tal como está (sem espaços de fora)", () => {
    expect(pesquisaQueCabe("  sanita  suspensa ")).toBe("sanita  suspensa");
    expect(pesquisaQueCabe("   ")).toBe("");
  });
  it("o nome real de 11 palavras fica com 10 (as mais longas), pela ordem do nome: todas estão no nome, por isso o produto continua a aparecer", () => {
    expect(palavrasDaBase(NOME).size).toBe(11);
    const q = pesquisaQueCabe(NOME);
    expect(palavrasDaBase(q).size).toBe(PESQUISA_MAX_PALAVRAS);
    for (const w of q.split(" ")) expect(NOME.includes(w)).toBe(true);
    expect(q.split(" ")).not.toContain("2"); // sai uma das mais curtas (em empate, a última)
    expect(q.startsWith("Móvel AXIS Suspenso")).toBe(true);
  });
  it("repetidas (com ou sem acentos e maiúsculas) contam uma vez, como na base", () => {
    expect(pesquisaQueCabe("a b c d e f g h i j A á")).toBe("a b c d e f g h i j A á");
  });
  it("nunca passa dos 200 caracteres, nem com uma palavra enorme", () => {
    const longo = Array.from({ length: 30 }, (_, i) => `palavra${i}xxxxxxxxxx`).join(" ");
    expect(pesquisaQueCabe(longo).length).toBeLessThanOrEqual(PESQUISA_MAX_CARACTERES);
    expect(palavrasDaBase(pesquisaQueCabe(longo)).size).toBeLessThanOrEqual(PESQUISA_MAX_PALAVRAS);
    expect(pesquisaQueCabe("x".repeat(300)).length).toBe(PESQUISA_MAX_CARACTERES);
  });
  it("a lista, a pesquisa por serviço e as contagens mandam à base a pesquisa que cabe", () => {
    expect(palavrasDaBase(argsPagina(ORG, { ...SEM_FILTRO_SERVIDOR, q: NOME }, 1).p_q as string).size).toBe(10);
    expect(palavrasDaBase(argsPesquisa(ORG, { ...SEM_FILTRO_SERVIDOR, q: NOME }, 1).p_q as string).size).toBe(10);
  });
});

describe("procurarDuplicado com um nome de mais de 10 palavras", () => {
  it("já não pára na recusa da base: pesquisa com 10 palavras e confirma o nome exato na linha", async () => {
    base.responder = (_f, a) => {
      if (palavrasDaBase(String(a.p_q)).size > 10) return { data: null, error: { code: "CT002", message: "A pesquisa tem no máximo 10 palavras." } };
      return { data: { total: 1, pagina: 1, limite: 50, paginas: 1, produtos: [{ id: "p1", nome: NOME, sku: "MOV-1" }] }, error: null };
    };
    await expect(procurarDuplicado(ORG, { n: NOME, sku: "" })).resolves.toBe(`Já existe «${NOME}».`);
    await expect(procurarDuplicado(ORG, { n: NOME + " Branco", sku: "" })).resolves.toBeNull();
    expect(base.chamadas.every((c) => palavrasDaBase(String(c.a.p_q)).size <= 10)).toBe(true);
  });
});
