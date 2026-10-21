// Os textos de editar, lixo e condições da proposta (pessoasNegocioEdicao.ts): pt e en com as mesmas chaves e marcadores, nenhum vazio, todas as
// chaves que o código usa existem nas duas línguas e chegam à página (pessoasPagina junta-as).
import { describe, expect, it, vi } from "vitest";
import { pessoasNegocioEdicaoTranslations } from "./pessoasNegocioEdicao";
import { pessoasPaginaTranslations } from "./pessoasPagina";
import { CHAVES_ESCRITA, CHAVE_ESCRITA_GENERICA } from "@/hooks/pessoas/escritasNegocio";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { en, pt } = pessoasNegocioEdicaoTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();
const N = "pessoasPagina.neg.";

// As chaves que o código usa (diretas ou montadas por um sufixo).
const CHAVES_USADAS = [
  "edit.button", "edit.title", "edit.description", "edit.name", "edit.name.error.empty", "edit.name.error.tooLong", "edit.notes", "edit.notes.count",
  "edit.notes.error.tooLong", "edit.rep", "edit.rep.none", "edit.rep.loading", "edit.rep.error", "edit.rep.retry", "edit.submit", "edit.cancel", "edit.done", "edit.unchanged",
  "closed.won", "closed.lost", "trash.button", "trash.title", "trash.description", "trash.confirm", "trash.cancel", "trash.done",
  "restore.button", "restore.title", "restore.description", "restore.confirm", "restore.cancel", "restore.done", "restore.sr",
  "bin.filter.label", "bin.filter.active", "bin.filter.bin", "bin.title", "bin.empty", "bin.loading", "bin.error", "bin.retry", "bin.deletedAt",
  "bin.event.apagado", "bin.event.restaurado", "bin.noEdit", "bin.state.aberto", "bin.state.ganho", "bin.state.perdido", "bin.list.label",
  "terms.title", "terms.empty", "terms.unreadable", "terms.edit", "terms.add", "terms.locked", "terms.dialog.title", "terms.dialog.description",
  "terms.dialog.unreadable", "terms.dialog.republish", "terms.submit", "terms.cancel", "terms.done", "terms.show.duration", "terms.show.durationValue", "terms.show.start",
  "terms.show.payment", "terms.show.warranty",
  "write.error.permission", "write.error.title", "write.error.notes", "write.error.rep", "write.error.trashed", "write.error.invalid", "write.error.unavailable", "write.error.proposalClosed",
].map((c) => `${N}${c}`);

describe("traduções de editar, lixo e condições", () => {
  it("pt e en têm as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas têm o prefixo certo e nenhuma está vazia", () => {
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave.startsWith(N), chave).toBe(true);
      expect(texto.trim(), chave).not.toBe("");
    }
  });

  it("todas as chaves usadas existem em pt e en, e não há chaves a mais", () => {
    for (const chave of CHAVES_USADAS) {
      expect(pt[chave], chave).toBeTruthy();
      expect(en[chave], chave).toBeTruthy();
    }
    expect(Object.keys(pt).sort()).toEqual([...CHAVES_USADAS].sort());
  });

  it("as chaves de erro das escritas diretas existem (e a genérica já existia na página)", () => {
    for (const chave of Object.values(CHAVES_ESCRITA)) {
      expect(pt[chave], chave).toBeTruthy();
      expect(en[chave], chave).toBeTruthy();
    }
    expect(pessoasPaginaTranslations.pt[CHAVE_ESCRITA_GENERICA]).toBeTruthy();
    expect(pessoasPaginaTranslations.en[CHAVE_ESCRITA_GENERICA]).toBeTruthy();
  });

  it("chegam à página nas duas línguas", () => {
    for (const chave of Object.keys(pt)) {
      expect(pessoasPaginaTranslations.pt[chave], chave).toBe(pt[chave]);
      expect(pessoasPaginaTranslations.en[chave], chave).toBe(en[chave]);
    }
  });

  it("os textos com marcadores têm os marcadores certos", () => {
    expect(marcas(pt[`${N}edit.description`])).toEqual(["{name}", "{work}"]);
    expect(marcas(pt[`${N}edit.done`])).toEqual(["{name}", "{work}"]);
    expect(marcas(pt[`${N}edit.notes.count`])).toEqual(["{count}", "{max}"]);
    expect(marcas(pt[`${N}trash.description`])).toEqual(["{name}", "{work}"]);
    expect(marcas(pt[`${N}trash.done`])).toEqual(["{name}", "{work}"]);
    expect(marcas(pt[`${N}restore.description`])).toEqual(["{name}", "{work}"]);
    expect(marcas(pt[`${N}restore.done`])).toEqual(["{name}", "{work}"]);
    expect(marcas(pt[`${N}restore.sr`])).toEqual(["{work}"]);
    expect(marcas(pt[`${N}bin.deletedAt`])).toEqual(["{date}"]);
    expect(marcas(pt[`${N}bin.event.apagado`])).toEqual(["{date}"]);
    expect(marcas(pt[`${N}terms.dialog.description`])).toEqual(["{name}", "{work}"]);
    expect(marcas(pt[`${N}terms.done`])).toEqual(["{name}"]);
    expect(marcas(pt[`${N}terms.show.durationValue`])).toEqual(["{days}"]);
  });

  it("o texto que mostra «Restaurar» a quem usa o leitor de ecrã começa pelo texto visível (WCAG 2.5.3)", () => {
    expect(pt[`${N}restore.sr`].startsWith(pt[`${N}restore.button`])).toBe(true);
    expect(en[`${N}restore.sr`].startsWith(en[`${N}restore.button`])).toBe(true);
  });
});
