// Os erros de neg_guardar_questionario e neg_questionario_levantamento, com mensagem própria do separador «Levantamento»:
// NG008, NG009 (com a mensagem da base quando é a regra do tipo), NG021 (alguém gravou entretanto) e 42501.
import { describe, expect, it, vi } from "vitest";
import { ErroNeg } from "../chamarNeg";
import { CHAVE_ERRO_GENERICO, CHAVES_ERRO_NEG } from "../errosNeg";
import { chaveErroLeitura, chaveErroQuestionario, detalheDaBase, ehConflitoDeVersao } from "./errosQuestionario";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const L = "pessoasPagina.real.workflow.lev.error.";
const erro = (codigo: string | null, mensagem = "texto da base") =>
  new ErroNeg(new Error(mensagem), codigo, codigo ? CHAVES_ERRO_NEG[codigo] : CHAVE_ERRO_GENERICO);
const REGRA_TIPO = "Questionário inválido: a pergunta «Tipo de imóvel» já tem respostas e não muda de tipo; crie uma pergunta nova.";

describe("chaveErroQuestionario", () => {
  it.each([
    ["NG008", `${L}ng008`],
    ["NG021", `${L}ng021`],
    ["42501", `${L}permission`],
  ])("%s tem a mensagem do levantamento", (codigo, chave) => {
    expect(chaveErroQuestionario(erro(codigo))).toBe(chave);
  });

  it("NG009 dá a mensagem de valor inválido, e a da regra do tipo quando a base diz que a pergunta já tem respostas", () => {
    expect(chaveErroQuestionario(erro("NG009", "Questionário inválido: falta texto da pergunta."))).toBe(`${L}ng009`);
    expect(chaveErroQuestionario(erro("NG009", REGRA_TIPO))).toBe(`${L}ng009Tipo`);
  });

  it.each(["secção", "pergunta", "opção"])("NG009 «%s desconhecida» (a base já não tem o item, porque outra pessoa o apagou) tem mensagem própria", (item) => {
    expect(chaveErroQuestionario(erro("NG009", `Questionário inválido: ${item} desconhecida.`))).toBe(`${L}ng009Desaparecido`);
  });

  it("a mensagem própria só vale para NG009, e não apanha «tipo de pergunta desconhecido» nem «opções desconhecidas ou repetidas»", () => {
    expect(chaveErroQuestionario(erro("NG009", "Questionário inválido: tipo de pergunta desconhecido."))).toBe(`${L}ng009`);
    expect(chaveErroQuestionario(erro("NG009", "Questionário inválido: a condição tem opções desconhecidas ou repetidas."))).toBe(`${L}ng009`);
    expect(chaveErroQuestionario(erro("NG021", "Questionário inválido: pergunta desconhecida."))).toBe(`${L}ng021`);
    expect(detalheDaBase(erro("NG009", "Questionário inválido: pergunta desconhecida."))).toBeNull();
  });

  it("outro código conhecido (NG005) fica com a mensagem de código; sem código, a genérica", () => {
    expect(chaveErroQuestionario(erro("NG005"))).toBe(CHAVES_ERRO_NEG.NG005);
    expect(chaveErroQuestionario(erro(null))).toBe(CHAVE_ERRO_GENERICO);
  });

  it("o que não é um ErroNeg dá a mensagem genérica", () => {
    for (const lixo of [new Error("x"), "NG021", null, undefined, { codigo: "NG021" }]) expect(chaveErroQuestionario(lixo)).toBe(CHAVE_ERRO_GENERICO);
  });
});

describe("chaveErroLeitura", () => {
  const LEITURA = "pessoasPagina.real.workflow.lev.loadError.";
  it("NG008 e 42501 têm motivo próprio na leitura", () => {
    expect(chaveErroLeitura(erro("NG008"))).toBe(`${LEITURA}ng008`);
    expect(chaveErroLeitura(erro("42501"))).toBe(`${LEITURA}permission`);
  });
  it("outros erros, avarias e o que não é um ErroNeg não dão motivo", () => {
    for (const outro of [erro("NG009"), erro("NG021"), erro(null), new Error("x"), null, undefined, "NG008"]) expect(chaveErroLeitura(outro)).toBeNull();
  });
});

describe("detalheDaBase", () => {
  it("só devolve a mensagem da base na regra do tipo, sem o prefixo «Questionário inválido:»", () => {
    expect(detalheDaBase(erro("NG009", REGRA_TIPO))).toBe("a pergunta «Tipo de imóvel» já tem respostas e não muda de tipo; crie uma pergunta nova.");
  });
  it("não mostra a mensagem da base em mais nenhum caso (a UI traduz pelo código)", () => {
    expect(detalheDaBase(erro("NG009", "Questionário inválido: tipo de pergunta desconhecido."))).toBeNull();
    expect(detalheDaBase(erro("NG021", "já tem respostas"))).toBeNull();
    expect(detalheDaBase(erro(null, "já tem respostas"))).toBeNull();
    expect(detalheDaBase("já tem respostas")).toBeNull();
  });
});

describe("ehConflitoDeVersao", () => {
  it("é só NG021", () => {
    expect(ehConflitoDeVersao(erro("NG021"))).toBe(true);
    for (const outro of [erro("NG009"), erro("NG008"), erro(null), new Error("NG021"), null]) expect(ehConflitoDeVersao(outro)).toBe(false);
  });
});
