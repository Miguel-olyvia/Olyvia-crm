import { describe, expect, it, vi } from "vitest";

// errosVisita importa chamarNeg, que importa o cliente da base: aqui nunca se chama.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { CHAVES_ENTRADA_VISITA, CHAVES_ERRO_POR_DIALOGO } from "@/hooks/pessoas/errosVisita";
import { pessoasPaginaTranslations } from "./pessoasPagina";
import { pessoasVisitaErrosTranslations } from "./pessoasVisitaErros";

const { en, pt } = pessoasVisitaErrosTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();
// Emojis e pictogramas: a interface não leva nenhum.
const EMOJI = /\p{Extended_Pictographic}/u;

const usadas = (): string[] => [
  ...Object.values(CHAVES_ENTRADA_VISITA),
  ...Object.values(CHAVES_ERRO_POR_DIALOGO).flatMap((porCodigo) => Object.values(porCodigo)),
];

describe("traduções dos erros dos diálogos de visita", () => {
  it("pt e en têm exatamente as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas as chaves levam o prefixo da visita, nenhum texto está vazio e não há emojis", () => {
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave).toMatch(/^pessoasPagina\.real\.visit\./);
      expect(texto.trim(), chave).not.toBe("");
      expect(texto, chave).not.toMatch(EMOJI);
    }
  });

  it("todas as chaves que errosVisita usa existem nas duas línguas, e o dono não alterável tem mensagem", () => {
    for (const chave of [...usadas(), "pessoasPagina.real.visit.ownerForbidden"]) {
      expect(pt[chave], chave).toBeTruthy();
      expect(en[chave], chave).toBeTruthy();
    }
    expect(pt["pessoasPagina.real.visit.ownerForbidden"]).toMatch(/respons/i);
  });

  it("lê por diálogo os códigos que mudam de sentido; NG016 e NG017 ficam com a mensagem geral (que já existe nas duas línguas)", () => {
    const porCodigo = new Set(Object.values(CHAVES_ERRO_POR_DIALOGO).flatMap((m) => Object.keys(m)));
    for (const c of ["NG004", "NG008", "NG009", "NG010", "NG018"]) expect(porCodigo.has(c), c).toBe(true);
    for (const c of ["NG016", "NG017"]) {
      expect(porCodigo.has(c), c).toBe(false);
      expect(pessoasPaginaTranslations.pt[`pessoasPagina.erroNeg.${c.toLowerCase()}`], c).toBeTruthy();
      expect(pessoasPaginaTranslations.en[`pessoasPagina.erroNeg.${c.toLowerCase()}`], c).toBeTruthy();
    }
  });

  it("a página junta estes textos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });
});
