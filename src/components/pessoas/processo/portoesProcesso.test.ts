import { describe, expect, it } from "vitest";
import { novaLinha, type LinhaForm } from "@/components/negocio-metas/levantamento";
import { novaLinhaDoCatalogo } from "./catalogoTrabalhos";
import { verificarOrcamento } from "./orcamentoCalculo";
import {
  portaoCriarNegocio, portaoEnviarProposta, portaoFazerLevantamento, portaoGuardarOrcamento, portaoLevantamento, portaoMargem,
  portaoResponderDirecao, portaoValorOrcamento, portaoVerificarOrcamento, portaoVisitaFeita,
} from "./portoesProcesso";

const linha = (extra: Partial<LinhaForm> = {}): LinhaForm => ({ ...novaLinha("l1"), divisao: "cozinha", trabalho: "pintura", medida: "12", ...extra });
const visita = { data: "2026-10-12", feita: false };

describe("portaoVisitaFeita (marcar a visita como feita)", () => {
  it("sem visita falta a visita", () => {
    expect(portaoVisitaFeita(null)).toEqual({ ok: false, emFalta: ["visita"] });
  });
  it("uma visita sem data falta a data", () => {
    expect(portaoVisitaFeita({ data: "", feita: false })).toEqual({ ok: false, emFalta: ["dataVisita"] });
  });
  it("com visita e data está tudo, mesmo no passado", () => {
    expect(portaoVisitaFeita(visita)).toEqual({ ok: true, emFalta: [] });
  });
});

describe("portaoFazerLevantamento", () => {
  it("sem visita, ou com a visita por fazer, falta a visita feita", () => {
    expect(portaoFazerLevantamento(null)).toEqual({ ok: false, emFalta: ["visitaFeita"] });
    expect(portaoFazerLevantamento(visita)).toEqual({ ok: false, emFalta: ["visitaFeita"] });
  });
  it("com a visita feita pode começar", () => {
    expect(portaoFazerLevantamento({ ...visita, feita: true })).toEqual({ ok: true, emFalta: [] });
  });
});

describe("portaoLevantamento (visita feita e pelo menos uma linha de medidas)", () => {
  it("sem visita feita falta a visita feita", () => {
    expect(portaoLevantamento({ visitaFeita: false, linhas: [linha()] })).toEqual({ ok: false, emFalta: ["visitaFeita"] });
  });
  it("sem linhas faltam as medidas", () => {
    expect(portaoLevantamento({ visitaFeita: true, linhas: [] })).toEqual({ ok: false, emFalta: ["linhas"] });
  });
  it("uma linha por acabar não conta (a validação é a do levantamento)", () => {
    expect(portaoLevantamento({ visitaFeita: true, linhas: [linha({ medida: "" })] })).toEqual({ ok: false, emFalta: ["linhaInvalida"] });
    expect(portaoLevantamento({ visitaFeita: true, linhas: [linha({ medida: "0" })] }).emFalta).toEqual(["linhaInvalida"]);
    expect(portaoLevantamento({ visitaFeita: true, linhas: [linha({ divisao: "" })] }).emFalta).toEqual(["linhaInvalida"]);
  });
  it("falta tudo de uma vez: visita feita e linhas, por esta ordem", () => {
    expect(portaoLevantamento({ visitaFeita: false, linhas: [] }).emFalta).toEqual(["visitaFeita", "linhas"]);
  });
  it("com visita feita e uma linha válida está tudo", () => {
    expect(portaoLevantamento({ visitaFeita: true, linhas: [linha()] })).toEqual({ ok: true, emFalta: [] });
  });
});

describe("portaoCriarNegocio (a pessoa; com visita feita, pelo menos uma linha)", () => {
  it("sem pessoa falta a pessoa", () => {
    expect(portaoCriarNegocio({ pessoaId: "", visitaFeita: false, linhas: [] })).toEqual({ ok: false, emFalta: ["pessoa"] });
    expect(portaoCriarNegocio({ pessoaId: "  ", visitaFeita: false, linhas: [] }).emFalta).toEqual(["pessoa"]);
  });
  it("sem visita feita não se pedem linhas", () => {
    expect(portaoCriarNegocio({ pessoaId: "a", visitaFeita: false, linhas: [] })).toEqual({ ok: true, emFalta: [] });
  });
  it("com visita feita e sem linhas faltam as medidas", () => {
    expect(portaoCriarNegocio({ pessoaId: "a", visitaFeita: true, linhas: [] })).toEqual({ ok: false, emFalta: ["linhas"] });
  });
  it("com visita feita, uma linha por acabar não serve; uma válida serve", () => {
    expect(portaoCriarNegocio({ pessoaId: "a", visitaFeita: true, linhas: [linha({ trabalho: "" })] }).emFalta).toEqual(["linhaInvalida"]);
    expect(portaoCriarNegocio({ pessoaId: "a", visitaFeita: true, linhas: [linha()] })).toEqual({ ok: true, emFalta: [] });
  });
  it("falta a pessoa e as linhas ao mesmo tempo", () => {
    expect(portaoCriarNegocio({ pessoaId: "", visitaFeita: true, linhas: [] }).emFalta).toEqual(["pessoa", "linhas"]);
  });
});

describe("portaoGuardarOrcamento (pelo menos uma linha)", () => {
  it("sem linhas falta uma linha", () => {
    expect(portaoGuardarOrcamento([])).toEqual({ ok: false, emFalta: ["orcamentoLinhas"] });
  });
  it("com uma linha está tudo", () => {
    expect(portaoGuardarOrcamento([novaLinhaDoCatalogo("pintura", "l1")])).toEqual({ ok: true, emFalta: [] });
  });
});

describe("portaoValorOrcamento (o valor que um orçamento aceita)", () => {
  it("aceita de 1 cêntimo a 10 milhões, e nada fora disso (nem zero, nem negativo, nem NaN)", () => {
    expect(portaoValorOrcamento(0.01)).toEqual({ ok: true, emFalta: [] });
    expect(portaoValorOrcamento(10_000_000)).toEqual({ ok: true, emFalta: [] });
    for (const valor of [0, -5, 10_000_000.01, Number.NaN]) expect(portaoValorOrcamento(valor).emFalta, String(valor)).toEqual(["orcamentoValor"]);
  });
});

describe("portaoVerificarOrcamento (só com orçamento)", () => {
  it("sem orçamento detalhado falta o orçamento", () => {
    expect(portaoVerificarOrcamento(undefined)).toEqual({ ok: false, emFalta: ["semOrcamento"] });
  });
  it("com o orçamento sem linhas faltam as linhas", () => {
    expect(portaoVerificarOrcamento({ linhas: [] })).toEqual({ ok: false, emFalta: ["orcamentoLinhas"] });
  });
  it("com o orçamento e linhas pode verificar", () => {
    expect(portaoVerificarOrcamento({ linhas: [novaLinhaDoCatalogo("pintura", "l1")] })).toEqual({ ok: true, emFalta: [] });
  });
});

describe("portaoMargem (os bloqueios da verificação)", () => {
  const com = (precoUnitario: number) => verificarOrcamento({ linhas: [{ ...novaLinhaDoCatalogo("pavimento", "l1"), quantidade: 10, precoUnitario }], desconto: 0 });
  it("sem bloqueios passa", () => {
    expect(portaoMargem(com(30))).toEqual({ ok: true, emFalta: [] });
  });
  it("um bloqueio mole diz que há margem por resolver", () => {
    expect(portaoMargem(com(24))).toEqual({ ok: false, emFalta: ["margem"] });
  });
  it("um preço abaixo do custo diz que a Direção não o aprova (e não 'margem')", () => {
    expect(portaoMargem(com(10))).toEqual({ ok: false, emFalta: ["abaixoDoCusto"] });
  });
});

describe("portaoResponderDirecao", () => {
  it("só há resposta a registar com o pedido feito", () => {
    expect(portaoResponderDirecao("pedida")).toEqual({ ok: true, emFalta: [] });
    for (const direcao of [null, undefined, "aprovada"] as const) expect(portaoResponderDirecao(direcao).emFalta, String(direcao)).toEqual(["semPedido"]);
  });
});

describe("portaoEnviarProposta (orçamento verificado ou exceção aprovada, e condições completas)", () => {
  it("por verificar não envia", () => {
    expect(portaoEnviarProposta({ verificado: false })).toEqual({ ok: false, emFalta: ["porVerificar"] });
  });
  it("verificado envia; as condições só travam quando já se sabe que estão incompletas", () => {
    expect(portaoEnviarProposta({ verificado: true })).toEqual({ ok: true, emFalta: [] });
    expect(portaoEnviarProposta({ verificado: true, erros: {} })).toEqual({ ok: true, emFalta: [] });
    expect(portaoEnviarProposta({ verificado: true, erros: { inicio: "obrigatorio" } })).toEqual({ ok: false, emFalta: ["condicoes"] });
  });
  it("falta o orçamento verificado e as condições ao mesmo tempo, por esta ordem", () => {
    expect(portaoEnviarProposta({ verificado: false, erros: { prazo: "invalido" } }).emFalta).toEqual(["porVerificar", "condicoes"]);
  });
});
