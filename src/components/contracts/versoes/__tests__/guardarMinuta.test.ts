import { describe, expect, it, vi } from "vitest";
import {
  COLUNAS_DA_MINUTA,
  ConflitoDeEdicaoError,
  atualizarMinutaComGuarda,
  verificarSemConflito,
  payloadDeAtualizar,
  payloadDeCriar,
  payloadDeDuplicar,
} from "../guardarMinuta";

const FORM = {
  name: "Minuta",
  body_html: "<p>texto</p>",
  is_active: true,
  is_default: false,
  signatory_user_id: null,
  signatory_role_id: null,
  language: "pt" as string | null | undefined,
  doc_settings: { primary_color: "#112233", chave_desconhecida: 1 } as Record<string, unknown> | null,
};

describe("COLUNAS_DA_MINUTA", () => {
  it("pede também a coluna language (idioma do texto base)", () => {
    expect(COLUNAS_DA_MINUTA.split(",").map((c) => c.trim())).toContain("language");
    expect(COLUNAS_DA_MINUTA).toContain("updated_at");
    expect(COLUNAS_DA_MINUTA).toContain("doc_settings");
  });
});

describe("payloadDeCriar", () => {
  it("o insert de uma minuta em português é o de sempre: sem a chave language (a base põe 'pt')", () => {
    const p = payloadDeCriar(FORM, "org-1", "user-1");
    expect(p).toEqual({
      name: "Minuta", body_html: "<p>texto</p>", is_active: true, is_default: false,
      organization_id: "org-1", created_by: "user-1",
      signatory_user_id: null, signatory_role_id: null,
      doc_settings: FORM.doc_settings,
    });
    expect(p).not.toHaveProperty("language");
    expect(payloadDeCriar({ ...FORM, language: undefined }, "o", "u")).not.toHaveProperty("language");
    expect(payloadDeCriar({ ...FORM, language: null }, "o", "u")).not.toHaveProperty("language");
  });

  it("só escreve language quando o idioma base não é o português", () => {
    expect(payloadDeCriar({ ...FORM, language: "en" }, "o", "u")).toHaveProperty("language", "en");
  });

  it("não acrescenta a chave versions a um template sem versões", () => {
    expect(payloadDeCriar(FORM, "o", "u").doc_settings).not.toHaveProperty("versions");
    expect(payloadDeCriar({ ...FORM, doc_settings: null }, "o", "u").doc_settings).toBeNull();
  });

  it("leva as versões quando existem", () => {
    const ds = { ...FORM.doc_settings, versions: { en: { body_html: "<p>x</p>" } } };
    expect(payloadDeCriar({ ...FORM, doc_settings: ds }, "o", "u").doc_settings).toBe(ds);
  });
});

describe("payloadDeAtualizar", () => {
  it("é o de sempre (sem language, sem organização) quando o idioma base não mudou", () => {
    const p = payloadDeAtualizar(FORM, "pt");
    expect(Object.keys(p).sort()).toEqual(["body_html", "doc_settings", "is_active", "is_default", "name", "signatory_role_id", "signatory_user_id"]);
    expect(p.doc_settings).toBe(FORM.doc_settings);
  });

  it("só escreve language se o idioma base mudou", () => {
    expect(payloadDeAtualizar({ ...FORM, language: "en" }, "pt")).toHaveProperty("language", "en");
    expect(payloadDeAtualizar({ ...FORM, language: undefined }, "pt")).not.toHaveProperty("language");
    expect(payloadDeAtualizar({ ...FORM, language: "pt" }, undefined)).not.toHaveProperty("language");
  });
});

describe("payloadDeDuplicar", () => {
  it("copia o idioma base e o doc_settings inteiro (versões incluídas)", () => {
    const ds = { a: 1, versions: { en: { body_html: "<p>x</p>" } } };
    const p = payloadDeDuplicar({ ...FORM, doc_settings: ds, language: "en", signatory_user_id: "s1", signatory_role_id: "r1" }, "org-1", "user-1");
    expect(p).toMatchObject({
      name: "Minuta (cópia)", body_html: "<p>texto</p>", is_active: false, is_default: false,
      organization_id: "org-1", created_by: "user-1", signatory_user_id: "s1", signatory_role_id: "r1",
      language: "en",
    });
    expect(p.doc_settings).toBe(ds);
  });

  it("sem language na origem, a cópia fica em pt", () => {
    expect(payloadDeDuplicar({ ...FORM, language: undefined }, "o", "u").language).toBe("pt");
  });
});

/** Um cliente Supabase simulado: regista os filtros e devolve o que lhe mandarem. */
function clienteSimulado(opts: { atualizadas: Array<{ id: string }> | null; erro?: unknown; existente?: { id: string; updated_at: string } | null }) {
  const eqs: Array<[string, unknown]> = [];
  const updates: unknown[] = [];
  const leituras: string[] = [];
  const client = {
    from: vi.fn(() => ({
      update: (payload: unknown) => {
        updates.push(payload);
        const cadeia = {
          eq: (c: string, v: unknown) => { eqs.push([c, v]); return cadeia; },
          select: () => Promise.resolve({ data: opts.atualizadas, error: opts.erro ?? null }),
        };
        return cadeia;
      },
      select: (cols: string) => {
        leituras.push(cols);
        const cadeia = {
          eq: () => cadeia,
          maybeSingle: () => Promise.resolve({ data: opts.existente ?? null, error: null }),
        };
        return cadeia;
      },
    })),
  };
  return { client, eqs, updates, leituras };
}

describe("atualizarMinutaComGuarda", () => {
  const PAYLOAD = { name: "N" };

  it("atualiza só se o updated_at ainda for o que foi carregado", async () => {
    const s = clienteSimulado({ atualizadas: [{ id: "m1" }] });
    await atualizarMinutaComGuarda(s.client, { id: "m1", carregadoEm: "2026-11-18T10:00:00.123456+00:00", payload: PAYLOAD });
    expect(s.eqs).toEqual([["id", "m1"], ["updated_at", "2026-11-18T10:00:00.123456+00:00"]]);
    expect(s.updates).toEqual([PAYLOAD]);
    expect(s.leituras).toEqual([]);
  });

  it("zero linhas atualizadas e a minuta existe com outro updated_at: conflito, com a versão atual", async () => {
    const s = clienteSimulado({ atualizadas: [], existente: { id: "m1", updated_at: "2026-11-18T11:00:00+00:00" } });
    const erro = await atualizarMinutaComGuarda(s.client, { id: "m1", carregadoEm: "2026-11-18T10:00:00+00:00", payload: PAYLOAD }).catch((e) => e);
    expect(erro).toBeInstanceOf(ConflitoDeEdicaoError);
    expect(erro.atualizadoEm).toBe("2026-11-18T11:00:00+00:00");
  });

  it("zero linhas e a minuta não se vê (RLS): continua a ser o erro de permissão de sempre", async () => {
    const s = clienteSimulado({ atualizadas: [], existente: null });
    const erro = await atualizarMinutaComGuarda(s.client, { id: "m1", carregadoEm: "2026-11-18T10:00:00+00:00", payload: PAYLOAD }).catch((e) => e);
    expect(erro).not.toBeInstanceOf(ConflitoDeEdicaoError);
    expect(erro.message).toBe("Sem permissão para guardar esta minuta");
  });

  it("zero linhas, a minuta existe com o MESMO updated_at: é permissão, não conflito", async () => {
    const s = clienteSimulado({ atualizadas: [], existente: { id: "m1", updated_at: "2026-11-18T10:00:00+00:00" } });
    const erro = await atualizarMinutaComGuarda(s.client, { id: "m1", carregadoEm: "2026-11-18T10:00:00+00:00", payload: PAYLOAD }).catch((e) => e);
    expect(erro).not.toBeInstanceOf(ConflitoDeEdicaoError);
    expect(erro.message).toBe("Sem permissão para guardar esta minuta");
  });

  it("um erro da base passa tal como veio", async () => {
    const falha = new Error("boom");
    const s = clienteSimulado({ atualizadas: null, erro: falha });
    await expect(atualizarMinutaComGuarda(s.client, { id: "m1", carregadoEm: "x", payload: PAYLOAD })).rejects.toBe(falha);
  });

  it("sem updated_at carregado, atualiza só pelo id (como antes)", async () => {
    const s = clienteSimulado({ atualizadas: [{ id: "m1" }] });
    await atualizarMinutaComGuarda(s.client, { id: "m1", carregadoEm: null, payload: PAYLOAD });
    expect(s.eqs).toEqual([["id", "m1"]]);
  });
});

describe("verificarSemConflito", () => {
  it("não faz nada sem updated_at carregado (nem sequer lê)", async () => {
    const s = clienteSimulado({ atualizadas: [] });
    await verificarSemConflito(s.client, { id: "m1", carregadoEm: null });
    expect(s.leituras).toEqual([]);
  });

  it("passa quando o updated_at é o mesmo ou a minuta não se vê", async () => {
    const igual = clienteSimulado({ atualizadas: [], existente: { id: "m1", updated_at: "2026-11-18T10:00:00+00:00" } });
    await expect(verificarSemConflito(igual.client, { id: "m1", carregadoEm: "2026-11-18T10:00:00+00:00" })).resolves.toBeUndefined();
    const invisivel = clienteSimulado({ atualizadas: [], existente: null });
    await expect(verificarSemConflito(invisivel.client, { id: "m1", carregadoEm: "2026-11-18T10:00:00+00:00" })).resolves.toBeUndefined();
  });

  it("falha com conflito quando o updated_at mudou, sem ter escrito nada", async () => {
    const s = clienteSimulado({ atualizadas: [], existente: { id: "m1", updated_at: "2026-11-18T11:00:00+00:00" } });
    await expect(verificarSemConflito(s.client, { id: "m1", carregadoEm: "2026-11-18T10:00:00+00:00" })).rejects.toBeInstanceOf(ConflitoDeEdicaoError);
    expect(s.updates).toEqual([]);
  });
});
