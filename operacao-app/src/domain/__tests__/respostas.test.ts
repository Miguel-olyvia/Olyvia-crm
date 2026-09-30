import { describe, expect, it } from "vitest";
import {
  comoSeResponde,
  contadorRecuou,
  estadoPelasLeituras,
  faltaParaGravar,
  podeResponder,
  progressoDeExecucao,
  resumirLeituras,
  veredictoDeGama,
  type Leitura,
} from "../respostas";

const leitura = (p: Partial<Leitura> = {}): Leitura => ({
  id: "l1",
  medicaoDefId: "d1",
  nome: "Pressão",
  tipo: "gama",
  unidade: "bar",
  limiteMin: 10,
  limiteMax: 15,
  valorNum: null,
  valorTexto: null,
  opcaoId: null,
  conforme: null,
  lidaEm: null,
  corretivaOrdemId: null,
  ...p,
});

describe("quem pode responder", () => {
  it("deixa responder numa ordem em curso", () => {
    expect(podeResponder({ estadoOrdem: "em_curso", funcao: "tecnico", atribuido: true }).pode)
      .toBe(true);
  });

  it("numa ordem agendada deixa responder, e avisa que a primeira resposta a inicia", () => {
    const r = podeResponder({ estadoOrdem: "agendada", funcao: "tecnico", atribuido: true });
    expect(r.pode).toBe(true);
    expect(r.aviso).toContain("inicia a ordem");
  });

  it("mas só a quem a ordem é — iniciar sem querer a ordem de outro é pior", () => {
    const r = podeResponder({ estadoOrdem: "agendada", funcao: "tecnico", atribuido: false });
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain("outra pessoa");
  });

  it("diz o passo em falta, não só que não pode", () => {
    const r = podeResponder({ estadoOrdem: "por_aprovar", funcao: "tecnico", atribuido: true });
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain("por aprovar");
  });

  it("quem coordena também arranca a ordem ao responder", () => {
    const r = podeResponder({ estadoOrdem: "agendada", funcao: "gestor", atribuido: false });
    expect(r.pode).toBe(true);
    expect(r.aviso).toBeTruthy();
  });

  it("uma ordem em curso já não traz aviso nenhum", () => {
    expect(podeResponder({ estadoOrdem: "em_curso", funcao: "tecnico", atribuido: true }).aviso)
      .toBeUndefined();
  });

  it("explica a pausa em vez de calar", () => {
    expect(podeResponder({ estadoOrdem: "pausada", funcao: "tecnico", atribuido: true }).motivo)
      .toContain("Retoma");
  });

  it("um técnico não responde a uma ordem que não é dele", () => {
    const r = podeResponder({ estadoOrdem: "em_curso", funcao: "tecnico", atribuido: false });
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain("outra pessoa");
  });

  it("um gestor responde mesmo sem estar atribuído", () => {
    expect(podeResponder({ estadoOrdem: "em_curso", funcao: "gestor", atribuido: false }).pode)
      .toBe(true);
  });

  it("numa ordem fechada ninguém responde, nem o admin", () => {
    expect(podeResponder({ estadoOrdem: "fechada", funcao: "admin", atribuido: true }).pode)
      .toBe(false);
  });
});

describe("o veredicto de um valor", () => {
  it("dentro dos limites é conforme", () => {
    expect(veredictoDeGama(12.4, 10, 15)).toBe("conforme");
  });

  it("os limites são inclusivos — 10 e 15 passam", () => {
    expect(veredictoDeGama(10, 10, 15)).toBe("conforme");
    expect(veredictoDeGama(15, 10, 15)).toBe("conforme");
  });

  it("abaixo do mínimo é não conforme", () => {
    expect(veredictoDeGama(8, 10, 15)).toBe("nao_conforme");
  });

  it("acima do máximo é não conforme", () => {
    expect(veredictoDeGama(31, 16, 24)).toBe("nao_conforme");
  });

  it("só com mínimo, o mínimo é que conta", () => {
    expect(veredictoDeGama(999, 10, null)).toBe("conforme");
    expect(veredictoDeGama(9, 10, null)).toBe("nao_conforme");
  });

  it("sem limites não há veredicto a dar", () => {
    expect(veredictoDeGama(12.4, null, null)).toBe("sem_veredicto");
  });

  it("um campo vazio não é não conforme — é vazio", () => {
    expect(veredictoDeGama(null, 10, 15)).toBe("sem_veredicto");
    expect(veredictoDeGama(Number.NaN, 10, 15)).toBe("sem_veredicto");
  });
});

describe("o contador", () => {
  it("acusa quando desce", () => {
    expect(contadorRecuou(40000, 45812)).toBe(true);
  });

  it("deixa passar quando sobe, e quando fica igual", () => {
    expect(contadorRecuou(46100, 45812)).toBe(false);
    expect(contadorRecuou(45812, 45812)).toBe(false);
  });

  it("sem leitura anterior não há como recuar", () => {
    expect(contadorRecuou(1, null)).toBe(false);
  });
});

describe("o que falta para gravar", () => {
  it("uma gama sem valor não se grava", () => {
    expect(faltaParaGravar("gama", {})).toContain("valor");
    expect(faltaParaGravar("gama", { valorNum: 12 })).toBeNull();
  });

  it("um zero é um valor, não é falta de valor", () => {
    expect(faltaParaGravar("gama", { valorNum: 0 })).toBeNull();
  });

  it("uma escolha precisa da opção", () => {
    expect(faltaParaGravar("escolha", {})).toContain("opção");
    expect(faltaParaGravar("escolha", { opcaoId: "o1" })).toBeNull();
  });

  it("texto em branco não conta como resposta", () => {
    expect(faltaParaGravar("texto", { valorTexto: "   " })).toContain("resposta");
    expect(faltaParaGravar("texto", { valorTexto: "tudo bem" })).toBeNull();
  });
});

describe("o estado que sai das leituras", () => {
  it("com leituras por fazer, não promete nada", () => {
    expect(estadoPelasLeituras([leitura({ conforme: true, lidaEm: "x" }), leitura()])).toBeNull();
  });

  it("todas conformes, a tarefa fica feita", () => {
    expect(
      estadoPelasLeituras([
        leitura({ conforme: true, lidaEm: "x" }),
        leitura({ conforme: null, lidaEm: "x", tipo: "texto" }),
      ])
    ).toBe("feita");
  });

  it("uma não conforme chega para a tarefa ficar não conforme", () => {
    expect(
      estadoPelasLeituras([
        leitura({ conforme: true, lidaEm: "x" }),
        leitura({ conforme: false, lidaEm: "x" }),
      ])
    ).toBe("nao_conforme");
  });

  it("sem medições nenhumas, o estado não vem daqui", () => {
    expect(estadoPelasLeituras([])).toBeNull();
  });
});

describe("o resumo e o caminho de resposta", () => {
  it("conta o que falta e o que está mal", () => {
    const r = resumirLeituras([
      leitura({ lidaEm: "x", conforme: true }),
      leitura({ lidaEm: "x", conforme: false }),
      leitura(),
    ]);
    expect(r).toEqual({ total: 3, porLer: 1, naoConformes: 1 });
  });

  it("com medições responde-se pelas medições", () => {
    expect(comoSeResponde([leitura()])).toBe("medicoes");
  });

  it("sem medições responde-se à mão", () => {
    expect(comoSeResponde([])).toBe("veredicto");
  });
});

describe("o progresso da execução", () => {
  const t = (estado: string, obrigatoria = true) =>
    ({ estado, obrigatoria }) as { estado: never; obrigatoria: boolean };

  it("conta respondidas, não conformes e percentagem", () => {
    const p = progressoDeExecucao([
      t("feita"),
      t("nao_conforme"),
      t("pendente"),
      t("nao_aplicavel"),
    ]);
    expect(p.total).toBe(4);
    expect(p.respondidas).toBe(3);
    expect(p.naoConformes).toBe(1);
    expect(p.percentagem).toBe(75);
  });

  it("uma não conforme é uma resposta — não é trabalho por fazer", () => {
    const p = progressoDeExecucao([t("nao_conforme")]);
    expect(p.porResponder).toBe(0);
    expect(p.percentagem).toBe(100);
  });

  it("separa as obrigatórias, porque são essas que travam o fecho", () => {
    const p = progressoDeExecucao([t("pendente", false), t("pendente", true)]);
    expect(p.porResponder).toBe(2);
    expect(p.obrigatoriasPorResponder).toBe(1);
  });

  it("uma ordem sem tarefas não está 0% feita nem rebenta", () => {
    expect(progressoDeExecucao([]).percentagem).toBe(0);
  });
});
