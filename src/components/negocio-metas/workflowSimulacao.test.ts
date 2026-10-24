import { describe, expect, it } from "vitest";
import { DADOS_EXEMPLO } from "./negocioMetasExemplo";
import type { NegocioMes } from "./negocioMetas";
import { PREDEFINICAO, type ConfigWorkflow } from "./workflowNegocio";
import {
  destinoDoEvento, eventosDoPasso, simularEvento, textoAoMudar, type EventoWorkflow,
} from "./workflowSimulacao";

const cfg = (parcial: Omit<Partial<ConfigWorkflow>, "fases"> & { fases?: Partial<ConfigWorkflow["fases"]> } = {}): ConfigWorkflow => ({
  ...PREDEFINICAO, ...parcial, fases: { ...PREDEFINICAO.fases, ...parcial.fases },
});
const sem = (id: string) => DADOS_EXEMPLO.negocios.find((n) => n.id === id) as NegocioMes;
/** Um negócio ainda em Orçamento, com um orçamento escolhido. */
const emOrcamento: NegocioMes = { ...sem("n9"), proposta: null, contrato: null };
/** O n10 voltado ao Orçamento: dois orçamentos, um deles escolhido. */
const doisOrcamentos: NegocioMes = { ...sem("n10"), proposta: null, contrato: null };
const comProposta = sem("n6"); // proposta enviada
const comContrato = sem("n10"); // contrato pendente
const curta = (chave: string) => chave.replace("businessGoals.workflow.", "");

/** O resultado resumido: "ganho", "perdido", "pergunta", "curso:proposta" ou "na:<motivo>". */
function resumo(c: ConfigWorkflow, e: EventoWorkflow, n: NegocioMes): string {
  const r = simularEvento(c, e, n);
  if (r.tipo === "nao-aplicavel") return `na:${curta(r.motivo.chave).replace("sim.na.", "")}`;
  return r.estado.tipo === "curso" ? `curso:${r.estado.fase}` : r.estado.tipo;
}

describe("simularEvento: Orçamento ganho (cada opção de A)", () => {
  it("cria a proposta, pergunta, não faz nada ou fecha como ganho", () => {
    const esperado = { criarProposta: "curso:proposta", perguntar: "pergunta", nada: "curso:orcamento", fecharGanho: "ganho" } as const;
    for (const [opcao, estado] of Object.entries(esperado)) {
      const c = cfg({ orcamentoGanho: opcao as ConfigWorkflow["orcamentoGanho"] });
      expect(resumo(c, "aceitarOrcamento", emOrcamento)).toBe(estado);
    }
  });
  it("fechar como ganho avisa que hoje não conta nas metas; as outras opções não", () => {
    expect(simularEvento(cfg({ orcamentoGanho: "fecharGanho" }), "aceitarOrcamento", emOrcamento)).toMatchObject({ ganhoSemContrato: true, pedeMotivo: false });
    expect(simularEvento(PREDEFINICAO, "aceitarOrcamento", emOrcamento)).toMatchObject({ ganhoSemContrato: false });
  });
  it("a frase do resultado leva a ação da célula", () => {
    const r = simularEvento(PREDEFINICAO, "aceitarOrcamento", emOrcamento);
    expect(r.tipo === "resultado" && r.resultado.params).toEqual({ acao: { chave: "businessGoals.workflow.passo.orcamentoGanho.criarProposta", params: undefined } });
  });
});

describe("simularEvento: Orçamento perdido", () => {
  it("perde o negócio só se for o último orçamento, e pede motivo", () => {
    expect(simularEvento(PREDEFINICAO, "perderOrcamento", emOrcamento)).toMatchObject({
      estado: { tipo: "perdido" }, pedeMotivo: true, ganhoSemContrato: false, nota: null,
    });
  });
  it("com outro orçamento em aberto o negócio continua em Orçamento (n10 com 2 orçamentos)", () => {
    const r = simularEvento(PREDEFINICAO, "perderOrcamento", doisOrcamentos);
    expect(r).toMatchObject({ estado: { tipo: "curso", fase: "orcamento" }, pedeMotivo: false });
  });
  it("se o orçamento perdido era o escolhido, o valor fica a 0 (nota só do simulador)", () => {
    const r = simularEvento(PREDEFINICAO, "perderOrcamento", doisOrcamentos);
    expect(r.tipo === "resultado" && r.nota?.chave).toContain("sim.nota.valorZero");
    const semEscolhido = sem("n8"); // 2 orçamentos, nenhum escolhido
    expect(simularEvento(PREDEFINICAO, "perderOrcamento", semEscolhido)).toMatchObject({ estado: { tipo: "curso" }, nota: null });
  });
  it("manter aberto nunca perde, nem sendo o último; perguntar pergunta", () => {
    expect(resumo(cfg({ orcamentoPerdido: "manterAberto" }), "perderOrcamento", emOrcamento)).toBe("curso:orcamento");
    expect(resumo(cfg({ orcamentoPerdido: "perguntar" }), "perderOrcamento", emOrcamento)).toBe("pergunta");
    expect(simularEvento(cfg({ orcamentoPerdido: "perguntar" }), "perderOrcamento", emOrcamento)).toMatchObject({ pedeMotivo: false });
  });
});

describe("simularEvento: Proposta", () => {
  it("ganho: cada opção de B", () => {
    const esperado = { perguntarContrato: "pergunta", criarContrato: "curso:contrato", fecharSemContrato: "ganho" } as const;
    for (const [opcao, estado] of Object.entries(esperado)) {
      expect(resumo(cfg({ propostaGanho: opcao as ConfigWorkflow["propostaGanho"] }), "aceitarProposta", comProposta)).toBe(estado);
    }
    expect(simularEvento(cfg({ propostaGanho: "fecharSemContrato" }), "aceitarProposta", comProposta)).toMatchObject({ ganhoSemContrato: true });
  });
  it("perdido: perde o negócio (com motivo), volta a Orçamento ou pergunta", () => {
    expect(simularEvento(PREDEFINICAO, "perderProposta", comProposta)).toMatchObject({ estado: { tipo: "perdido" }, pedeMotivo: true });
    expect(resumo(cfg({ propostaPerdido: "voltarOrcamento" }), "perderProposta", comProposta)).toBe("curso:orcamento");
    expect(resumo(cfg({ propostaPerdido: "perguntar" }), "perderProposta", comProposta)).toBe("pergunta");
  });
  it("só se aplica a uma proposta enviada", () => {
    for (const e of ["aceitarProposta", "perderProposta"] as const) {
      expect(resumo(PREDEFINICAO, e, emOrcamento)).toBe("na:semProposta");
      expect(resumo(PREDEFINICAO, e, sem("n9"))).toBe("na:rascunho");
      expect(resumo(PREDEFINICAO, e, comContrato)).toBe("na:jaPassou");
      expect(resumo(PREDEFINICAO, e, { ...comProposta, proposta: { estado: "aceite" } })).toBe("na:jaAceite");
      expect(resumo(cfg({ fases: { proposta: false } }), e, comProposta)).toBe("na:faseDesligada");
    }
  });
});

describe("simularEvento: Contrato", () => {
  it("assinar fecha o negócio como ganho, com contrato (sem aviso das metas)", () => {
    expect(simularEvento(PREDEFINICAO, "assinarContrato", comContrato)).toMatchObject({
      estado: { tipo: "ganho" }, ganhoSemContrato: false, pedeMotivo: false,
    });
  });
  it("perder: perde o negócio (com motivo), volta a Proposta ou pergunta", () => {
    expect(simularEvento(PREDEFINICAO, "perderContrato", comContrato)).toMatchObject({ estado: { tipo: "perdido" }, pedeMotivo: true });
    expect(resumo(cfg({ contratoPerdido: "voltarProposta" }), "perderContrato", comContrato)).toBe("curso:proposta");
    expect(resumo(cfg({ contratoPerdido: "perguntar" }), "perderContrato", comContrato)).toBe("pergunta");
  });
  it("só se aplica a um contrato pendente", () => {
    expect(resumo(PREDEFINICAO, "assinarContrato", comProposta)).toBe("na:semContrato");
    expect(resumo(cfg({ fases: { contrato: false } }), "perderContrato", comContrato)).toBe("na:contratoDesligado");
  });
});

describe("simularEvento: aplicabilidade pela fase do negócio", () => {
  it("um negócio já ganho não admite nenhum evento: o negócio já está fechado", () => {
    for (const e of ["aceitarOrcamento", "perderOrcamento", "aceitarProposta", "perderProposta", "assinarContrato", "perderContrato"] as const) {
      expect(resumo(PREDEFINICAO, e, sem("n1"))).toBe("na:jaFechado");
    }
  });
  it("os eventos do Orçamento só valem em Orçamento", () => {
    expect(resumo(PREDEFINICAO, "aceitarOrcamento", comProposta)).toBe("na:jaPassou");
    expect(resumo(PREDEFINICAO, "perderOrcamento", comContrato)).toBe("na:jaPassou");
  });
  it("aceitar exige orçamento escolhido; perder exige pelo menos um orçamento", () => {
    expect(resumo(PREDEFINICAO, "aceitarOrcamento", sem("n8"))).toBe("na:semEscolhido");
    expect(resumo(PREDEFINICAO, "perderOrcamento", { ...emOrcamento, orcamentos: [] })).toBe("na:semOrcamentos");
  });
  it("nunca altera o negócio", () => {
    const antes = JSON.stringify(comProposta);
    simularEvento(PREDEFINICAO, "perderProposta", comProposta);
    expect(JSON.stringify(comProposta)).toBe(antes);
  });
});

describe("eventosDoPasso", () => {
  it("dá os dois eventos do passo atual; um negócio ganho mostra os do contrato", () => {
    expect(eventosDoPasso(emOrcamento)).toEqual(["aceitarOrcamento", "perderOrcamento"]);
    expect(eventosDoPasso(comProposta)).toEqual(["aceitarProposta", "perderProposta"]);
    expect(eventosDoPasso(comContrato)).toEqual(["assinarContrato", "perderContrato"]);
    expect(eventosDoPasso(sem("n1"))).toEqual(["assinarContrato", "perderContrato"]);
  });
});

describe("destinoDoEvento", () => {
  it("destaca o nó onde o negócio fica ou a seta de perdido do passo", () => {
    const d = (c: ConfigWorkflow, e: EventoWorkflow, n: NegocioMes) => destinoDoEvento(e, simularEvento(c, e, n));
    expect(d(PREDEFINICAO, "aceitarOrcamento", emOrcamento)).toEqual({ tipo: "no", no: "proposta" });
    expect(d(cfg({ propostaGanho: "fecharSemContrato" }), "aceitarProposta", comProposta)).toEqual({ tipo: "no", no: "ganho" });
    expect(d(PREDEFINICAO, "perderProposta", comProposta)).toEqual({ tipo: "perdido", de: "proposta" });
    expect(d(PREDEFINICAO, "perderContrato", comContrato)).toEqual({ tipo: "perdido", de: "contrato" });
  });
  it("não destaca nada quando só pergunta ou não se aplica", () => {
    expect(destinoDoEvento("aceitarProposta", simularEvento(PREDEFINICAO, "aceitarProposta", comProposta))).toBeNull();
    expect(destinoDoEvento("aceitarProposta", simularEvento(PREDEFINICAO, "aceitarProposta", emOrcamento))).toBeNull();
    expect(destinoDoEvento("aceitarProposta", null)).toBeNull();
  });
});

describe("textoAoMudar", () => {
  const acoes = (c: ConfigWorkflow, n: NegocioMes) => {
    const t = textoAoMudar(c, n);
    if (!t) return null;
    const acao = (x: typeof t.ganho) => (x?.params?.acao as { chave: string }).chave.replace("businessGoals.workflow.passo.", "");
    return [acao(t.ganho), acao(t.perdido)];
  };
  it("dá as duas linhas do passo atual", () => {
    expect(acoes(PREDEFINICAO, emOrcamento)).toEqual(["orcamentoGanho.criarProposta", "orcamentoPerdido.perderSeUltimo"]);
    expect(acoes(PREDEFINICAO, comProposta)).toEqual(["propostaGanho.perguntarContrato", "propostaPerdido.perderNegocio"]);
    expect(acoes(PREDEFINICAO, comContrato)).toEqual(["contratoGanho.assinado", "contratoPerdido.perderNegocio"]);
  });
  it("as linhas são 'Se ganho' e 'Se perdido'", () => {
    const t = textoAoMudar(PREDEFINICAO, emOrcamento);
    expect(t?.ganho?.chave).toContain("aoMudar.ganho");
    expect(t?.perdido?.chave).toContain("aoMudar.perdido");
  });
  it("só há a linha que o simulador daria como aplicável: nada numa proposta em rascunho ou já aceite sem contrato", () => {
    expect(textoAoMudar(PREDEFINICAO, sem("n9"))).toBeNull(); // proposta em rascunho
    expect(textoAoMudar(PREDEFINICAO, { ...comProposta, proposta: { estado: "aceite" } })).toBeNull(); // aceite, sem contrato
  });
  it("um orçamento sem escolhido só tem a linha de perdido", () => {
    const t = textoAoMudar(PREDEFINICAO, sem("n8"));
    expect(t?.ganho).toBeNull();
    expect(t?.perdido?.chave).toContain("aoMudar.perdido");
  });
  it("não há linhas num negócio já ganho, nem num passo cuja fase está desligada", () => {
    expect(textoAoMudar(PREDEFINICAO, sem("n1"))).toBeNull();
    expect(textoAoMudar(cfg({ fases: { proposta: false } }), comProposta)).toBeNull();
    expect(textoAoMudar(cfg({ fases: { contrato: false } }), comContrato)).toBeNull();
  });
  it("segue a configuração", () => {
    expect(acoes(cfg({ orcamentoGanho: "fecharGanho", orcamentoPerdido: "manterAberto" }), emOrcamento))
      .toEqual(["orcamentoGanho.fecharGanho", "orcamentoPerdido.manterAberto"]);
  });
});
