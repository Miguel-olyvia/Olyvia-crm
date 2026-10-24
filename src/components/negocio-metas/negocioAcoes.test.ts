// As ações que mudam um negócio em memória (orçamento novo, ganhar ou perder um passo) e o store que as guarda.
import { afterEach, describe, expect, it } from "vitest";
import {
  acrescentarOrcamento, aplicarEvento, aceitaOrcamentos, escolhasDaPergunta, lerValor, validarOrcamento,
} from "./negocioAcoes";
import {
  alteracoesAtuais, anularPerda, detalheDoNegocio, gravarAplicacao, guardarNegocio, negociosComPerdidos, negociosDoQuadro, perdaDoNegocio, perderNegocio,
  proximaSequenciaOrcamento, repor,
} from "./negociosAlterados";
import { faseDoNegocio, isNegocioGanho, valorDoNegocio, type NegocioMes } from "./negocioMetas";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "./negocioMetasExemplo";
import { copiarConfig, PREDEFINICAO } from "./workflowNegocio";

const HOJE = HOJE_EXEMPLO;
const negocios = DADOS_EXEMPLO.negocios;
const semEscolha = negocios.find((n) => faseDoNegocio(n) === "orcamento" && n.orcamentos.length >= 2)!;
/** Um negócio em Orçamento com o primeiro orçamento escolhido (nos dados de exemplo nenhum tem escolhido). */
const emOrcamento: NegocioMes = { ...semEscolha, orcamentos: semEscolha.orcamentos.map((o, i) => ({ ...o, escolhido: i === 0 })) };
const emProposta = negocios.find((n) => faseDoNegocio(n) === "proposta" && n.proposta?.estado === "enviada")!;
const emContrato = negocios.find((n) => faseDoNegocio(n) === "contrato")!;
const ganho = negocios.find(isNegocioGanho)!;
const vazio: NegocioMes = { ...emOrcamento, id: "n-vazio", orcamentos: [], proposta: null, contrato: null };

afterEach(repor);

describe("lerValor e validarOrcamento", () => {
  it("aceita espaços, vírgula e ponto decimal, até duas casas", () => {
    expect(lerValor("1 500,50")).toBe(1500.5);
    expect(lerValor("1500.5")).toBe(1500.5);
    expect(lerValor("80")).toBe(80);
  });

  it.each(["", "  ", "abc", "-5", "1,234", "1e3", "0x10"])("recusa %j como valor", (texto) => {
    expect(Number.isNaN(lerValor(texto))).toBe(true);
  });

  it("diz o primeiro erro: vazio, inválido, zero, enorme, descrição comprida; válido dá null", () => {
    expect(validarOrcamento({ valor: "", descricao: "" })).toBe("valorVazio");
    expect(validarOrcamento({ valor: "dez", descricao: "" })).toBe("valorInvalido");
    expect(validarOrcamento({ valor: "0", descricao: "" })).toBe("valorInvalido");
    expect(validarOrcamento({ valor: "10000000,01", descricao: "" })).toBe("valorGrande");
    expect(validarOrcamento({ valor: "10 000 000", descricao: "" })).toBeNull();
    expect(validarOrcamento({ valor: "5", descricao: "x".repeat(81) })).toBe("descricaoComprida");
    expect(validarOrcamento({ valor: "5", descricao: "x".repeat(80) })).toBeNull();
  });
});

describe("acrescentarOrcamento", () => {
  it("o primeiro orçamento fica escolhido e dá valor ao negócio; o detalhe leva a data, o estado e a linha", () => {
    const r = acrescentarOrcamento(vazio, { valor: "1 200,5", descricao: " Pintura ", estado: "rascunho" }, 7, HOJE)!;
    expect(r.orcamentoId).toBe("o-novo-7");
    expect(r.negocio.orcamentos).toEqual([{ id: "o-novo-7", valor: 1200.5, escolhido: true }]);
    expect(valorDoNegocio(r.negocio)).toBe(1200.5);
    expect(r.detalhe).toEqual({ data: HOJE, estado: "rascunho", linhas: [{ descricao: "Pintura", valor: 1200.5 }] });
    expect(vazio.orcamentos).toEqual([]);
  });

  it("um orçamento rascunho não tira a escolha ao que já estava; um aceite passa a ser o escolhido", () => {
    const escolhido = emOrcamento.orcamentos.find((o) => o.escolhido)!;
    const rascunho = acrescentarOrcamento(emOrcamento, { valor: "10", descricao: "", estado: "enviado" }, 1, HOJE)!;
    expect(rascunho.negocio.orcamentos.filter((o) => o.escolhido).map((o) => o.id)).toEqual([escolhido.id]);
    expect(rascunho.detalhe.linhas).toBeUndefined();
    const aceite = acrescentarOrcamento(emOrcamento, { valor: "10", descricao: "", estado: "aceite" }, 1, HOJE)!;
    expect(aceite.negocio.orcamentos.filter((o) => o.escolhido).map((o) => o.id)).toEqual(["o-novo-1"]);
    expect(aceite.negocio.orcamentos).toHaveLength(emOrcamento.orcamentos.length + 1);
  });

  it("um negócio ganho ou um valor inválido ficam como estão (null)", () => {
    expect(aceitaOrcamentos(ganho)).toBe(false);
    expect(acrescentarOrcamento(ganho, { valor: "10", descricao: "", estado: "rascunho" }, 1, HOJE)).toBeNull();
    expect(acrescentarOrcamento(vazio, { valor: "", descricao: "", estado: "rascunho" }, 1, HOJE)).toBeNull();
  });
});

describe("aplicarEvento", () => {
  const opcoes = { hoje: HOJE };

  it("orçamento aceite cria a proposta em rascunho e passa a fase, com prazo novo", () => {
    const r = aplicarEvento(PREDEFINICAO, "aceitarOrcamento", emOrcamento, opcoes)!;
    expect(r.tipo).toBe("curso");
    expect(faseDoNegocio(r.negocio)).toBe("proposta");
    expect(r.negocio.proposta).toEqual({ estado: "rascunho" });
    expect(r.negocio.proximoPrazo).toBe("2026-10-16");
    expect(r.negocio.parado).toBe(0);
    expect(emOrcamento.proposta).toBeNull();
  });

  it("o contrato assinado fecha o negócio como ganho, sem prazo", () => {
    const r = aplicarEvento(PREDEFINICAO, "assinarContrato", emContrato, opcoes)!;
    expect(r.tipo).toBe("ganho");
    expect(isNegocioGanho(r.negocio)).toBe(true);
    expect(r.negocio.proximoPrazo).toBeNull();
  });

  it("orçamento perdido: se é o último perde o negócio, com o primeiro motivo da lista; com outros, só sai esse", () => {
    const sozinho = { ...emOrcamento, orcamentos: [emOrcamento.orcamentos.find((o) => o.escolhido)!] };
    const perdido = aplicarEvento(PREDEFINICAO, "perderOrcamento", sozinho, opcoes)!;
    expect(perdido).toMatchObject({ tipo: "perdido", motivo: PREDEFINICAO.motivosPerda[0] });
    expect(aplicarEvento(PREDEFINICAO, "perderOrcamento", sozinho, { ...opcoes, motivo: " Preço alto " })).toMatchObject({ motivo: "Preço alto" });
    const dois = { ...emOrcamento, orcamentos: [...sozinho.orcamentos, { id: "extra", valor: 5, escolhido: false }] };
    const curso = aplicarEvento(PREDEFINICAO, "perderOrcamento", dois, opcoes)!;
    expect(curso.tipo).toBe("curso");
    expect(curso.negocio.orcamentos.map((o) => o.id)).toEqual(["extra"]);
  });

  it("quando a configuração pergunta, sem escolha não aplica; com escolha aplica essa", () => {
    // A predefinição pergunta se cria o contrato quando a proposta é aceite.
    expect(aplicarEvento(PREDEFINICAO, "aceitarProposta", emProposta, opcoes)).toBeNull();
    const valores = escolhasDaPergunta(PREDEFINICAO, "aceitarProposta").map((e) => e.valor);
    expect(valores).toEqual(["criarContrato", "fecharSemContrato"]);
    const contrato = aplicarEvento(PREDEFINICAO, "aceitarProposta", emProposta, { ...opcoes, escolha: "criarContrato" })!;
    expect(faseDoNegocio(contrato.negocio)).toBe("contrato");
    expect(contrato.negocio.contrato).toEqual({ estado: "pendente" });
    const fecha = aplicarEvento(PREDEFINICAO, "aceitarProposta", emProposta, { ...opcoes, escolha: "fecharSemContrato" })!;
    expect(fecha.tipo).toBe("ganho");
  });

  it("escolhasDaPergunta só dá o que a configuração admite (sem contrato, só fechar)", () => {
    const semContrato = copiarConfig(PREDEFINICAO);
    semContrato.fases = { proposta: true, contrato: false };
    expect(escolhasDaPergunta(semContrato, "aceitarProposta").map((e) => e.valor)).toEqual(["fecharSemContrato"]);
    expect(escolhasDaPergunta(PREDEFINICAO, "assinarContrato")).toEqual([]);
  });

  it("um evento que não se aplica (negócio já ganho, ou passo que já passou) devolve null", () => {
    expect(aplicarEvento(PREDEFINICAO, "assinarContrato", ganho, opcoes)).toBeNull();
    expect(aplicarEvento(PREDEFINICAO, "aceitarOrcamento", emContrato, opcoes)).toBeNull();
  });
});

describe("negociosAlterados", () => {
  it("sem nada mudado, o quadro e a ficha veem exatamente os mesmos negócios", () => {
    expect(negociosDoQuadro(negocios, alteracoesAtuais())).toEqual(negocios);
    expect(negociosComPerdidos(negocios, alteracoesAtuais())).toEqual(negocios);
    expect(detalheDoNegocio("nao-existe")).toBeNull();
  });

  it("guardar um negócio mostra a versão nova no quadro e na ficha; um orçamento novo leva o detalhe", () => {
    const r = acrescentarOrcamento(emOrcamento, { valor: "99", descricao: "Extra", estado: "enviado" }, proximaSequenciaOrcamento(), HOJE)!;
    guardarNegocio(r.negocio, { id: r.orcamentoId, detalhe: r.detalhe });
    expect(negociosDoQuadro(negocios, alteracoesAtuais()).find((n) => n.id === emOrcamento.id)).toBe(r.negocio);
    expect(negociosComPerdidos(negocios, alteracoesAtuais()).find((n) => n.id === emOrcamento.id)).toBe(r.negocio);
    expect(detalheDoNegocio(emOrcamento.id)?.orcamentos?.[r.orcamentoId]).toEqual(r.detalhe);
    expect(proximaSequenciaOrcamento()).toBe(2);
  });

  it("um negócio perdido sai do quadro e fica na ficha como terminado do mês, com o motivo", () => {
    perderNegocio(emOrcamento, "Preço", HOJE);
    expect(negociosDoQuadro(negocios, alteracoesAtuais()).some((n) => n.id === emOrcamento.id)).toBe(false);
    const naFicha = negociosComPerdidos(negocios, alteracoesAtuais()).find((n) => n.id === emOrcamento.id);
    expect(naFicha).toMatchObject({ resultado: "perdido", mes: "2026-10", motivoPerda: "Preço" });
  });

  it("repor esquece tudo e recomeça a numeração", () => {
    guardarNegocio(emOrcamento, { id: "o-novo-1", detalhe: { data: HOJE, estado: "rascunho" } });
    repor();
    expect(alteracoesAtuais().editados).toEqual({});
    expect(proximaSequenciaOrcamento()).toBe(1);
  });
});

describe("gravarAplicacao e anularPerda", () => {
  it("um evento em curso ou ganho grava a nova versão do negócio; um perdido grava a perda com a fase e o motivo", () => {
    const curso = aplicarEvento(PREDEFINICAO, "aceitarOrcamento", emOrcamento, { hoje: HOJE })!;
    gravarAplicacao(curso, HOJE);
    expect(alteracoesAtuais().editados[emOrcamento.id]).toBe(curso.negocio);
    expect(perdaDoNegocio(emOrcamento.id)).toBeUndefined();

    gravarAplicacao({ tipo: "perdido", negocio: curso.negocio, motivo: "Preço" }, HOJE);
    expect(perdaDoNegocio(emOrcamento.id)).toEqual({ motivo: "Preço", mes: "2026-10", data: HOJE, fase: "proposta" });
    expect(negociosDoQuadro(negocios, alteracoesAtuais()).some((n) => n.id === emOrcamento.id)).toBe(false);
  });

  it("anular a perda devolve o negócio ao quadro, na fase em que estava, e não mexe noutros negócios", () => {
    perderNegocio(emProposta, "Adiou", HOJE);
    perderNegocio(emContrato, "Preço", HOJE);
    anularPerda(emProposta.id);
    expect(perdaDoNegocio(emProposta.id)).toBeUndefined();
    expect(perdaDoNegocio(emContrato.id)).toMatchObject({ fase: "contrato" });
    const noQuadro = negociosDoQuadro(negocios, alteracoesAtuais()).find((n) => n.id === emProposta.id);
    expect(noQuadro && faseDoNegocio(noQuadro)).toBe("proposta");
    expect(() => anularPerda("nao-existe")).not.toThrow();
  });
});
