import { describe, expect, it } from "vitest";
import { novaLinha, type LinhaForm } from "@/components/negocio-metas/levantamento";
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { visitaBase } from "../fabricaTestes";
import { novaLinhaDoCatalogo } from "./catalogoTrabalhos";
import { verificarOrcamento } from "./orcamentoCalculo";
import {
  portaoCriarNegocio, portaoEnviarProposta, portaoFazerLevantamento, portaoGuardarOrcamento, portaoLevantamento, portaoMargem,
  portaoResponderDirecao, portaoValorOrcamento, portaoVerificarOrcamento, portaoVisitaFeita,
} from "./portoesProcesso";

const linha = (extra: Partial<LinhaForm> = {}): LinhaForm => ({ ...novaLinha("l1"), divisao: "cozinha", trabalho: "pintura", medida: "12", ...extra });
const porFazer = (extra: Partial<VisitaNegocio> = {}) => visitaBase("v1", { data: "2026-10-12", ...extra });
const feita = (extra: Partial<VisitaNegocio> = {}) => visitaBase("v2", { estado: "feita", ...extra });
const cancelada = visitaBase("v3", { estado: "cancelada" });

describe("portaoVisitaFeita (marcar a visita como feita: abrir o painel de visita e levantamento da pessoa)", () => {
  it("sem pessoa, sem visitas, ou só com visitas canceladas, falta a visita", () => {
    expect(portaoVisitaFeita(null)).toEqual({ ok: false, emFalta: ["visita"] });
    expect(portaoVisitaFeita({ visitas: [] })).toEqual({ ok: false, emFalta: ["visita"] });
    expect(portaoVisitaFeita({ visitas: [cancelada] })).toEqual({ ok: false, emFalta: ["visita"] });
  });
  it("a próxima visita sem data falta a data", () => {
    expect(portaoVisitaFeita({ visitas: [porFazer({ data: "" })] })).toEqual({ ok: false, emFalta: ["dataVisita"] });
  });
  it("com visita por fazer e data está tudo, mesmo no passado", () => {
    expect(portaoVisitaFeita({ visitas: [porFazer()] })).toEqual({ ok: true, emFalta: [] });
    expect(portaoVisitaFeita({ visitas: [porFazer({ data: "2020-01-01" })] }).ok).toBe(true);
  });
  it("com todas as visitas já feitas pode abrir o painel (falta só tirar as medidas)", () => {
    expect(portaoVisitaFeita({ visitas: [feita()] })).toEqual({ ok: true, emFalta: [] });
  });
});

describe("portaoLevantamento (guardar a visita e o levantamento numa só gravação)", () => {
  it("sem nenhuma visita feita guarda-se, com ou sem linhas", () => {
    expect(portaoLevantamento({ visitas: [porFazer()], linhas: [] })).toEqual({ ok: true, emFalta: [] });
    expect(portaoLevantamento({ visitas: [porFazer()], linhas: [linha()] })).toEqual({ ok: true, emFalta: [] });
  });
  it("com uma visita feita guarda-se na mesma sem nenhuma linha: o levantamento é opcional", () => {
    expect(portaoLevantamento({ visitas: [feita()], linhas: [] })).toEqual({ ok: true, emFalta: [] });
    expect(portaoLevantamento({ visitas: [porFazer(), feita()], linhas: [] })).toEqual({ ok: true, emFalta: [] });
  });
  it("uma linha por acabar não conta, esteja ou não a visita feita (a validação é a do levantamento)", () => {
    expect(portaoLevantamento({ visitas: [feita()], linhas: [linha({ medida: "" })] })).toEqual({ ok: false, emFalta: ["linhaInvalida"] });
    expect(portaoLevantamento({ visitas: [feita()], linhas: [linha({ medida: "0" })] }).emFalta).toEqual(["linhaInvalida"]);
    expect(portaoLevantamento({ visitas: [porFazer()], linhas: [linha({ divisao: "" })] }).emFalta).toEqual(["linhaInvalida"]);
  });
  it("com visita feita e uma linha válida está tudo", () => {
    expect(portaoLevantamento({ visitas: [feita()], linhas: [linha()] })).toEqual({ ok: true, emFalta: [] });
  });
  it("uma visita cancelada não conta como feita nem como visita", () => {
    expect(portaoLevantamento({ visitas: [cancelada], linhas: [] }).ok).toBe(true);
  });
  it("não exige visita nenhuma: nem a visita nem o levantamento são obrigatórios", () => {
    expect(portaoLevantamento({ visitas: [], linhas: [] })).toEqual({ ok: true, emFalta: [] });
  });
});

describe("portaoFazerLevantamento (o passo de um negócio em Levantamento: tem de haver um levantamento para ligar)", () => {
  it("sem linhas, sem observações e sem nenhum levantamento por ligar, falta o levantamento", () => {
    expect(portaoFazerLevantamento({ linhas: [], observacoes: "  ", temPorLigar: false })).toEqual({ ok: false, emFalta: ["semLevantamento"] });
  });
  it("com linhas, ou observações, ou um levantamento já por ligar, está tudo", () => {
    expect(portaoFazerLevantamento({ linhas: [linha()], observacoes: "", temPorLigar: false })).toEqual({ ok: true, emFalta: [] });
    expect(portaoFazerLevantamento({ linhas: [], observacoes: "Ver telhado", temPorLigar: false }).ok).toBe(true);
    expect(portaoFazerLevantamento({ linhas: [], observacoes: "", temPorLigar: true }).ok).toBe(true);
  });
  it("uma linha por acabar não conta (a validação é a do levantamento) e não se diz «falta o levantamento»", () => {
    expect(portaoFazerLevantamento({ linhas: [linha({ medida: "0" })], observacoes: "", temPorLigar: false })).toEqual({ ok: false, emFalta: ["linhaInvalida"] });
  });
});

describe("portaoCriarNegocio (só a pessoa é obrigatória; visita e levantamento são opcionais e ligam-se, não se escrevem aqui)", () => {
  it("sem pessoa falta a pessoa", () => {
    expect(portaoCriarNegocio({ pessoaId: "" })).toEqual({ ok: false, emFalta: ["pessoa"] });
    expect(portaoCriarNegocio({ pessoaId: "  " }).emFalta).toEqual(["pessoa"]);
  });
  it("com a pessoa está tudo: nada mais se exige", () => {
    expect(portaoCriarNegocio({ pessoaId: "a" })).toEqual({ ok: true, emFalta: [] });
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
