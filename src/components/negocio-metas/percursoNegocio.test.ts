// O ciclo de vida do negócio: levantamento (opcional) -> orçamento -> proposta -> contrato -> ganho, ou perdido em qualquer fase
// (com a fase guardada), e a perda anulável. Um contacto ou uma visita novos nunca fazem o negócio recuar.
import { afterEach, describe, expect, it } from "vitest";
import { ligarAoNegocio } from "./acoesRegistos";
import { anularPerda, alteracoesAtuais, negociosComPerdidos, negociosDoQuadro, perderNegocio, perdaDoNegocio, repor } from "./negociosAlterados";
import { faseDoNegocio, type NegocioMes } from "./negocioMetas";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "./negocioMetasExemplo";
import { contaParaMetas, faseDoPercurso, faseNaPerda, funilDaAbordagem, negociosParaMetas } from "./percursoNegocio";
import { registarContacto, registarLevantamento, registarVisita, ligarRegisto, registosAtuais, repor as reporRegistos } from "./registosPessoa";
import { MORADA_VAZIA } from "./moradaObra";
import { REGISTOS_VAZIOS } from "./registosTipos";

const HOJE = HOJE_EXEMPLO;
const base = DADOS_EXEMPLO.negocios.find((n) => faseDoNegocio(n) === "orcamento" && n.orcamentos.length >= 1)!;
const novo = (parcial: Partial<NegocioMes>): NegocioMes => ({ ...base, id: "n-teste", orcamentos: [], proposta: null, contrato: null, ...parcial });
const comOrcamento = novo({ orcamentos: [{ id: "o1", valor: 100, escolhido: true }] });
const comProposta = novo({ ...comOrcamento, proposta: { estado: "enviada" } });
const comContrato = novo({ ...comProposta, contrato: { estado: "pendente" } });
const ganho = novo({ ...comProposta, contrato: { estado: "assinado" } });
const rascunho = { linhas: [], observacoes: "", respostas: {} };

afterEach(() => { repor(); reporRegistos(); });

describe("faseDoPercurso", () => {
  it("segue as fases do negócio: orçamento, proposta, contrato e ganho", () => {
    expect([comOrcamento, comProposta, comContrato, ganho].map((n) => faseDoPercurso(n))).toEqual(["orcamento", "proposta", "contrato", "ganho"]);
  });

  it("um negócio sem orçamentos com o levantamento por decidir está em Levantamento", () => {
    expect(faseDoPercurso(novo({ decisaoLevantamento: "porDecidir" }))).toBe("levantamento");
  });

  it("dispensar o levantamento leva o negócio a Orçamento", () => {
    expect(faseDoPercurso(novo({ decisaoLevantamento: "dispensado" }))).toBe("orcamento");
  });

  it("com um levantamento ligado vai a Orçamento; sem nenhum ligado nos registos continua em Levantamento", () => {
    const ligado = novo({ decisaoLevantamento: "ligado" });
    const sem = faseDoPercurso(ligado, { registos: REGISTOS_VAZIOS });
    expect(sem).toBe("levantamento");
    registarLevantamento({ pessoaId: ligado.pessoaId, visitaId: null, data: HOJE, feitoPor: "Ana", rascunho });
    const e = ligarAoNegocio(registosAtuais(), { tipo: "levantamento", id: registosAtuais().levantamentos[0].id }, ligado.id);
    expect(faseDoPercurso(ligado, { registos: e })).toBe("orcamento");
  });

  it("sem registos à mão, 'ligado' fia-se na decisão do negócio", () => {
    expect(faseDoPercurso(novo({ decisaoLevantamento: "ligado" }))).toBe("orcamento");
  });

  it("um negócio antigo, sem decisão, conta como Orçamento (comportamento de hoje)", () => {
    expect(faseDoPercurso(novo({}))).toBe("orcamento");
  });

  it("havendo orçamentos, o levantamento por decidir já não segura o negócio", () => {
    expect(faseDoPercurso({ ...comOrcamento, decisaoLevantamento: "porDecidir" })).toBe("orcamento");
  });

  it("com uma perda diz 'perdido'", () => {
    expect(faseDoPercurso(comProposta, { perda: { fase: "proposta" } })).toBe("perdido");
  });

  it("um contacto, uma visita ou uma ligação nova não fazem o negócio recuar", () => {
    const antes = [comOrcamento, comProposta, comContrato].map((n) => faseDoPercurso(n, { registos: registosAtuais() }));
    registarContacto({ pessoaId: base.pessoaId, data: HOJE, resultado: "atendeuInteressado", nota: "" });
    const v = registarVisita({
      pessoaId: base.pessoaId, data: HOJE, hora: "", feitoPor: "Ana", estado: "porFazer", tipo: "revisita", quemVaiEstar: "", duracao: "",
      morada: MORADA_VAZIA, igualALead: true, nota: "",
    });
    ligarRegisto({ tipo: "visita", id: v.id }, comProposta.id);
    const depois = [comOrcamento, comProposta, comContrato].map((n) => faseDoPercurso(n, { registos: registosAtuais() }));
    expect(depois).toEqual(antes);
  });
});

describe("contaParaMetas: conta a partir do Orçamento", () => {
  it("Levantamento não conta; Orçamento, Proposta, Contrato e Ganho contam", () => {
    expect(contaParaMetas(novo({ decisaoLevantamento: "porDecidir" }))).toBe(false);
    expect([comOrcamento, comProposta, comContrato, ganho].map((n) => contaParaMetas(n))).toEqual([true, true, true, true]);
  });

  it("um perdido conta conforme a fase em que foi perdido", () => {
    expect(contaParaMetas(comProposta, { perda: { fase: "proposta" } })).toBe(true);
    expect(contaParaMetas(comProposta, { perda: { fase: "levantamento" } })).toBe(false);
  });
});

describe("metas e funil da abordagem", () => {
  const emLevantamento = novo({ id: "n-lev", decisaoLevantamento: "porDecidir" });
  const dispensado = novo({ id: "n-disp", decisaoLevantamento: "dispensado" });

  it("negociosParaMetas deixa de fora os negócios em Levantamento e mantém os outros pela mesma ordem", () => {
    const todos = [comOrcamento, emLevantamento, comProposta, dispensado, ganho];
    expect(negociosParaMetas(todos).map((n) => n.id)).toEqual([comOrcamento.id, comProposta.id, dispensado.id, ganho.id]);
    expect(negociosParaMetas([])).toEqual([]);
  });

  it("o funil conta as pessoas por coluna da abordagem e, à parte, os negócios em Levantamento (as pessoas fora da abordagem não contam)", () => {
    const colunas = ["porContactar", "porContactar", "contactado", "visita", null, "visita", "visita"] as const;
    expect(funilDaAbordagem(colunas, [emLevantamento, comOrcamento, dispensado])).toEqual({
      porContactar: 2, contactado: 1, visita: 3, levantamento: 1,
    });
  });

  it("sem pessoas nem negócios o funil é todo zeros", () => {
    expect(funilDaAbordagem([], [])).toEqual({ porContactar: 0, contactado: 0, visita: 0, levantamento: 0 });
  });

  it("um negócio com o levantamento ligado deixa de contar como Levantamento quando há registos com um levantamento ligado a ele", () => {
    const ligado = novo({ id: "n-lig", decisaoLevantamento: "ligado" });
    expect(funilDaAbordagem([], [ligado], REGISTOS_VAZIOS).levantamento).toBe(1);
    const comLevantamento = { ...REGISTOS_VAZIOS, levantamentos: [{ id: "rl-1", pessoaId: "a", visitaId: null, data: HOJE, feitoPor: "Ana", rascunho, negocioId: "n-lig" }] };
    expect(funilDaAbordagem([], [ligado], comLevantamento).levantamento).toBe(0);
    expect(negociosParaMetas([ligado], REGISTOS_VAZIOS)).toEqual([]);
    expect(negociosParaMetas([ligado], comLevantamento)).toEqual([ligado]);
  });
});

describe("faseNaPerda", () => {
  it("é a fase em que o negócio estava (nunca 'perdido')", () => {
    expect(faseNaPerda(comContrato)).toBe("contrato");
    expect(faseNaPerda(novo({ decisaoLevantamento: "porDecidir" }))).toBe("levantamento");
  });
});

describe("perderNegocio e anularPerda", () => {
  it("perder guarda motivo, mês, dia e a fase em que estava", () => {
    perderNegocio(comProposta, "Preço", HOJE);
    expect(perdaDoNegocio(comProposta.id)).toEqual({ motivo: "Preço", mes: HOJE.slice(0, 7), data: HOJE, fase: "proposta" });
    expect(alteracoesAtuais().perdidos[comProposta.id]).toMatchObject({ fase: "proposta", data: HOJE });
  });

  it("perde-se em qualquer fase, o Levantamento incluído, e a fase fica guardada", () => {
    const emLevantamento = novo({ id: "n-lev", decisaoLevantamento: "porDecidir" });
    perderNegocio(emLevantamento, "Adiou", HOJE);
    perderNegocio(comContrato, "Preço", HOJE);
    expect(perdaDoNegocio("n-lev")?.fase).toBe("levantamento");
    expect(perdaDoNegocio(comContrato.id)?.fase).toBe("contrato");
  });

  it("um perdido sai do quadro e fica na ficha como terminado, com a fase da perda", () => {
    perderNegocio(comProposta, "Preço", HOJE);
    expect(negociosDoQuadro([comProposta], alteracoesAtuais())).toEqual([]);
    expect(negociosComPerdidos([comProposta], alteracoesAtuais())[0]).toMatchObject({ resultado: "perdido", motivoPerda: "Preço", faseDaPerda: "proposta" });
  });

  it("anular a perda devolve o negócio ao quadro, na fase em que estava", () => {
    perderNegocio(comProposta, "Preço", HOJE);
    anularPerda(comProposta.id);
    expect(perdaDoNegocio(comProposta.id)).toBeUndefined();
    expect(negociosDoQuadro([comProposta], alteracoesAtuais()).map((n) => faseDoPercurso(n))).toEqual(["proposta"]);
    expect(negociosComPerdidos([comProposta], alteracoesAtuais())[0]).not.toHaveProperty("resultado");
  });

  it("anular a perda de um negócio que não está perdido não faz nada", () => {
    const antes = alteracoesAtuais();
    anularPerda("nao-existe");
    expect(alteracoesAtuais()).toBe(antes);
  });

  it("um negócio que se perde de novo depois de anulado guarda a perda nova", () => {
    perderNegocio(comProposta, "Preço", HOJE);
    anularPerda(comProposta.id);
    perderNegocio(comProposta, "Adiou", HOJE);
    expect(perdaDoNegocio(comProposta.id)).toMatchObject({ motivo: "Adiou", fase: "proposta" });
  });
});
