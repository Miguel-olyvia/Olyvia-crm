/**
 * O que o formulario do portal manda a Edge: o rascunho (nunca com NISS, numero da conta nem declaracao)
 * e o payload da submissao (em `devolvida`, so as chaves devolvidas). Pecas puras.
 */
import { describe, expect, it } from "vitest";
import { RASCUNHO_CONVITE_VAZIO, type RascunhoConvite } from "@/lib/hr/conviteAdmissaoPayload";
import type { PortalLer } from "@/lib/hr/portalAdmissao";
import { payloadDaSubmissao, rascunhoAEnviar, rascunhoLido, rascunhoParaGravar, rascunhosIguais } from "@/lib/hr/portalRascunho";

const dados = (estado: string, editaveis: string[], rascunho: Record<string, unknown> | null = null): PortalLer => ({
  estado,
  rascunho,
  campos_obrigatorios: [],
  campos_editaveis: editaveis,
  documentos_editaveis: [],
  niss_ultimos4: null,
  iban_ultimos4: null,
  devolucao: null,
  anexos: [],
  rejeicao_mensagem: null,
});

const formulario = (extra: Partial<RascunhoConvite> = {}): RascunhoConvite => ({ ...RASCUNHO_CONVITE_VAZIO, ...extra });

describe("rascunhoParaGravar", () => {
  it("tira o NISS, o numero da conta e a declaracao, e deixa o resto", () => {
    const r = rascunhoParaGravar(formulario({ niss: "12345678902", conta_numero: "PT50000201231234567890154", aceite: true, genero: "f" }));
    expect(r).not.toHaveProperty("niss");
    expect(r).not.toHaveProperty("conta_numero");
    expect(r).not.toHaveProperty("aceite");
    expect(r.genero).toBe("f");
    expect(r.assinatura_nome).toBe("");
  });

  it("nao altera o rascunho recebido", () => {
    const original = formulario({ niss: "12345678902" });
    rascunhoParaGravar(original);
    expect(original.niss).toBe("12345678902");
  });
});

describe("rascunhosIguais", () => {
  it("compara pelo conteudo, sem olhar para a ordem das chaves", () => {
    expect(rascunhosIguais({ a: "1", b: "2" }, { b: "2", a: "1" })).toBe(true);
    expect(rascunhosIguais({ a: "1" }, { a: "2" })).toBe(false);
    expect(rascunhosIguais({ a: "1" }, { a: "1", b: "" })).toBe(false);
  });
});

describe("rascunhoAEnviar", () => {
  it("fora de devolvida e o rascunho todo", () => {
    const d = dados("em_preenchimento", ["genero"], { genero: "m" });
    const lido = rascunhoLido(d);
    const r = rascunhoAEnviar(d, { ...lido, genero: "f", telefone_pessoal: "913000000" }, lido);
    expect(r.genero).toBe("f");
    expect(r.telefone_pessoal).toBe("913000000");
    expect(Object.keys(r)).toContain("linha1");
  });

  it("um rascunho igual ao lido produz o mesmo conteudo que o lido (nada de novo a gravar)", () => {
    const d = dados("em_preenchimento", ["genero"], { genero: "m", morada_linha1: "Rua A" });
    const lido = rascunhoLido(d);
    expect(rascunhosIguais(rascunhoAEnviar(d, lido, lido), rascunhoParaGravar(lido))).toBe(true);
  });

  it("em devolvida parte do que o servidor tem e so muda as chaves devolvidas que foram alteradas", () => {
    const d = dados("devolvida", ["genero"], { genero: "m", telefone_pessoal: "912345678", morada_linha1: "Rua A" });
    const lido = rascunhoLido(d);
    // `telefone_pessoal` nao e editavel: mesmo alterado no ecra, nao muda.
    const r = rascunhoAEnviar(d, { ...lido, genero: "f", telefone_pessoal: "999999999" }, lido);
    expect(r.genero).toBe("f");
    expect(r.telefone_pessoal).toBe("912345678");
    expect(r.morada_linha1).toBe("Rua A");
  });

  it("em devolvida nunca leva NISS, conta nem declaracao, nem os que o servidor tivesse", () => {
    const d = dados("devolvida", ["genero"], { genero: "m", niss: "x", conta_numero: "y", aceite: true });
    const lido = rascunhoLido(d);
    const r = rascunhoAEnviar(d, { ...lido, genero: "f" }, lido);
    expect(r).not.toHaveProperty("niss");
    expect(r).not.toHaveProperty("conta_numero");
    expect(r).not.toHaveProperty("aceite");
  });
});

describe("payloadDaSubmissao", () => {
  it("em preenchimento leva todas as chaves do contrato", () => {
    const p = payloadDaSubmissao(dados("em_preenchimento", []), formulario({ genero: "f", linha1: "Rua A" }));
    expect(p.genero).toBe("f");
    expect(p.morada_linha1).toBe("Rua A");
    expect(p).toHaveProperty("niss");
    expect(p).toHaveProperty("iban");
  });

  it("em devolvida leva so as chaves editaveis, com o nome do contrato (morada_*, iban, conta_swift)", () => {
    const d = dados("devolvida", ["genero", "linha1", "iban", "conta_bic"]);
    const p = payloadDaSubmissao(d, formulario({ genero: "f", linha1: "Rua A", conta_numero: "pt50 0002 0123 1234 5678 9015 4", conta_bic: "bcompt" }));
    expect(Object.keys(p).sort()).toEqual(["conta_swift", "genero", "iban", "morada_linha1"]);
    expect(p.iban).toBe("PT50000201231234567890154");
  });
});
