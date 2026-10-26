import { describe, expect, it } from "vitest";
import { pessoasSubmissoesTranslations } from "@/translations/pessoasSubmissoes";
import { chaveDoErroSubmissao, interpretarRespostaSubmissao } from "./pendingFormSubmissionsErros";

const { pt, en } = pessoasSubmissoesTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

describe("chaveDoErroSubmissao", () => {
  it.each([
    ["NG002", "pessoasPagina.submissoes.erro.ng002"],
    ["NG003", "pessoasPagina.submissoes.erro.ng003"],
    ["NG029", "pessoasPagina.submissoes.erro.ng029"],
    ["42501", "pessoasPagina.submissoes.erro.permissao"],
  ])("o código %s dá %s", (code, chave) => {
    expect(chaveDoErroSubmissao({ code, message: "x" })).toBe(chave);
  });

  it("lê o código da mensagem quando o PostgREST não o devolve em `code`", () => {
    expect(chaveDoErroSubmissao({ message: "erro NG029: Submissão indisponível." })).toBe("pessoasPagina.submissoes.erro.ng029");
    expect(chaveDoErroSubmissao({ code: "", message: "NG002 A abordagem desta pessoa está encerrada" })).toBe("pessoasPagina.submissoes.erro.ng002");
  });

  it("não confunde NG0029 nem xNG002 com os códigos", () => {
    expect(chaveDoErroSubmissao({ message: "NG0029" })).toBe("pessoasPagina.submissoes.erro.generico");
    expect(chaveDoErroSubmissao({ message: "xNG002" })).toBe("pessoasPagina.submissoes.erro.generico");
  });

  it("um código desconhecido, null, texto ou undefined dão a mensagem genérica", () => {
    for (const erro of [{ code: "NG099" }, { code: "PGRST301", message: "jwt" }, null, undefined, "NG002", 42]) {
      expect(chaveDoErroSubmissao(erro)).toBe("pessoasPagina.submissoes.erro.generico");
    }
  });

  it("todas as chaves de erro existem em pt e en, sem texto vazio", () => {
    for (const code of ["NG002", "NG003", "NG029", "42501", "outro"]) {
      const chave = chaveDoErroSubmissao({ code });
      expect(pt[chave], chave).toBeTruthy();
      expect(en[chave], chave).toBeTruthy();
    }
  });

  it("NG002 manda reabrir a abordagem na página Pessoas, em pt e en", () => {
    expect(pt["pessoasPagina.submissoes.erro.ng002"]).toMatch(/reabr/i);
    expect(pt["pessoasPagina.submissoes.erro.ng002"]).toMatch(/Pessoas/);
    expect(en["pessoasPagina.submissoes.erro.ng002"]).toMatch(/reopen/i);
    expect(en["pessoasPagina.submissoes.erro.ng002"]).toMatch(/People/);
  });
});

describe("interpretarRespostaSubmissao", () => {
  it("acao 'confirmar' pede a confirmação do negócio aberto (e não é sucesso)", () => {
    expect(interpretarRespostaSubmissao({ acao: "confirmar", motivo: "negocio_aberto", negocio_aberto_id: "n1", mudou: false })).toBe("confirmar");
  });

  it("mudou=false sem confirmação é sucesso: já estava resolvida", () => {
    expect(interpretarRespostaSubmissao({ mudou: false, resolution: "ligada", negocio_id: null, entity_id: "e1" })).toBe("jaResolvida");
  });

  it("mudou=true é feito", () => {
    expect(interpretarRespostaSubmissao({ acao: "ligar", mudou: true, resolution: "ligada" })).toBe("feito");
  });

  it("uma resposta vazia ou estranha conta como feito: a base não deu erro", () => {
    for (const r of [null, undefined, {}, "ok", 1, []]) expect(interpretarRespostaSubmissao(r)).toBe("feito");
  });
});

describe("traduções da fila de envios", () => {
  it("pt e en têm as mesmas chaves e os mesmos marcadores, com o prefixo da página e sem texto vazio", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) {
      expect(chave).toMatch(/^pessoasPagina\.submissoes\./);
      expect(pt[chave].trim(), chave).not.toBe("");
      expect(en[chave].trim(), chave).not.toBe("");
      expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
    }
  });

  it("não sobra nenhuma ação antiga (merge, new_lead) nos textos", () => {
    for (const texto of [...Object.values(pt), ...Object.values(en)]) expect(texto).not.toMatch(/new_lead|merge|nota na ficha como/i);
  });
});
