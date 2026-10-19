import { describe, expect, it } from "vitest";
import { isNegocioGanho, valorDoNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { ehHistorico } from "@/components/pessoas/pessoasTipos";
import { podeGanhar } from "@/components/pessoas/podeGanhar";
import { adaptarNegocios, estadoContratoDeDb, estadoPropostaDeDb } from "./adaptarNegociosFicha";
import type { ContratoDb, NegocioFichaDb, PropostaDb } from "./fichaTipos";
import { fichaDb, negocioDb, PESSOA_ID } from "./fichaFabrica";

const HOJE = "2026-10-19";
const proposta = (sobre: Partial<PropostaDb> = {}): PropostaDb => ({
  id: "p1", numero: "P-1", titulo: null, status: "draft", valor: 100, valid_until: null, terms: null, enviada_em: null, aceite_em: null,
  criado_em: "2026-10-11T09:00:00Z", ...sobre,
});
const contrato = (sobre: Partial<ContratoDb> = {}): ContratoDb => ({
  id: "k1", numero: "C-1", status: "draft", valor: 100, assinado_em: null, criado_em: "2026-10-12T09:00:00Z", tem_base: true, ...sobre,
});
const adaptar = (...itens: NegocioFichaDb[]) => adaptarNegocios(fichaDb({ negocios: { total: itens.length, itens } }), HOJE);

describe("adaptarNegocios: um negócio aberto", () => {
  it("traduz os campos e deixa o prazo por preencher", () => {
    const [n] = adaptar(negocioDb({
      valor: "1500.50", parado_desde: "2026-10-14T09:00:00Z",
      orcamentos: [{ id: "o1", numero: "O-1", estado: "draft", total: "1500.50", criado_em: "2026-10-11T09:00:00Z" }],
    })) as NegocioMes[];
    expect(n).toMatchObject({
      id: "n1", pessoaId: PESSOA_ID, pessoa: "Ana Lopes", servico: "Casa de banho", comercial: "Rita Gomes", dias: 9, parado: 5,
      proximoPrazo: null, valorBase: 1500.5, estadoReal: "aberto", contacto: { telefone: "912345678", email: "ana@exemplo.pt" },
    });
    expect(n.orcamentos).toEqual([{ id: "o1", valor: 1500.5, escolhido: false }]);
    expect(valorDoNegocio(n)).toBe(1500.5);
  });

  it("sem parado_desde não está parado; título e responsável em falta dão texto vazio; valor nulo vale 0", () => {
    const [n] = adaptar(negocioDb({ titulo: null, responsavel_nome: null, valor: null })) as NegocioMes[];
    expect(n).toMatchObject({ servico: "", comercial: "", parado: null, valorBase: 0 });
  });

  it("levantamento ligado deixa a decisão «ligado»; sem ele nada se decide", () => {
    expect((adaptar(negocioDb({ levantamento_id: "l1" })) as NegocioMes[])[0].decisaoLevantamento).toBe("ligado");
    expect((adaptar(negocioDb()) as NegocioMes[])[0].decisaoLevantamento).toBeUndefined();
  });

  it("a proposta e o contrato que contam são os mais recentes", () => {
    const [n] = adaptar(negocioDb({
      propostas: [proposta({ id: "velha", status: "accepted", criado_em: "2026-10-01T09:00:00Z" }), proposta({ id: "nova", status: "sent", criado_em: "2026-10-15T09:00:00Z" })],
      contratos: [contrato({ id: "k-velho", status: "signed", criado_em: "2026-10-01T09:00:00Z" }), contrato({ id: "k-novo", status: "draft", criado_em: "2026-10-16T09:00:00Z" })],
    })) as NegocioMes[];
    expect(n.proposta).toEqual({ estado: "enviada" });
    expect(n.contrato).toEqual({ estado: "pendente" });
  });

  it("sem propostas nem contratos ficam a null", () => {
    const [n] = adaptar(negocioDb()) as NegocioMes[];
    expect(n.proposta).toBeNull();
    expect(n.contrato).toBeNull();
  });
});

describe("adaptarNegocios: aberto com contrato assinado continua aberto", () => {
  it("não vira histórico, não conta como ganho e fica pronto a ganhar", () => {
    const itens = adaptar(negocioDb({ estado: "aberto", pronto_a_ganhar: true, contratos: [contrato({ status: "signed", assinado_em: "2026-10-17T09:00:00Z" })] }));
    expect(itens).toHaveLength(1);
    const n = itens[0];
    expect(ehHistorico(n)).toBe(false);
    expect((n as NegocioMes).contrato).toEqual({ estado: "assinado" });
    expect((n as NegocioMes).estadoReal).toBe("aberto");
    expect(isNegocioGanho(n as NegocioMes)).toBe(false);
  });
});

describe("adaptarNegocios: o pronto_a_ganhar da base", () => {
  it("passa ao negócio como prontoAGanhar, verdadeiro ou falso", () => {
    expect((adaptar(negocioDb({ pronto_a_ganhar: true }))[0] as NegocioMes).prontoAGanhar).toBe(true);
    expect((adaptar(negocioDb({ pronto_a_ganhar: false }))[0] as NegocioMes).prontoAGanhar).toBe(false);
  });

  it("um valor que não é verdadeiro conta como falso (nunca se oferece o ganho por engano)", () => {
    const sujo = { ...negocioDb(), pronto_a_ganhar: undefined } as unknown as NegocioFichaDb;
    expect((adaptar(sujo)[0] as NegocioMes).prontoAGanhar).toBe(false);
  });
});

describe("adaptarNegocios: ganho e perdido viram histórico", () => {
  it("ganho: mês de Lisboa do ganho_em, valor e estado real", () => {
    const [n] = adaptar(negocioDb({ estado: "ganho", ganho_em: "2026-08-31T23:30:00Z", valor: 2000 }));
    expect(ehHistorico(n)).toBe(true);
    expect(n).toMatchObject({ resultado: "ganho", mes: "2026-09", estadoReal: "ganho", valorBase: 2000 });
  });

  it("perdido: mês do perdido_em; sem data usa a de criação", () => {
    expect(adaptar(negocioDb({ estado: "perdido", perdido_em: "2026-07-10T09:00:00Z" }))[0]).toMatchObject({ resultado: "perdido", mes: "2026-07", estadoReal: "perdido" });
    expect(adaptar(negocioDb({ estado: "perdido", perdido_em: null, criado_em: "2026-05-02T09:00:00Z" }))[0]).toMatchObject({ mes: "2026-05" });
  });

  it("um estado desconhecido conta como aberto e nunca rebenta", () => {
    const [n] = adaptar(negocioDb({ estado: "arquivado" }));
    expect(ehHistorico(n)).toBe(false);
  });

  it("sem negócios (ou secção em falta) a lista é vazia", () => {
    expect(adaptarNegocios(fichaDb({ negocios: null }), HOJE)).toEqual([]);
    expect(adaptar()).toEqual([]);
  });
});

describe("estadoPropostaDeDb: um caso por valor", () => {
  it.each([
    ["draft", "rascunho"], ["rascunho", "rascunho"],
    ["sent", "enviada"], ["viewed", "enviada"], ["enviada", "enviada"], ["enviado", "enviada"],
    ["accepted", "aceite"], ["aceite", "aceite"], ["aceita", "aceite"], ["approved", "aceite"],
    ["rejected", "enviada"], ["declined", "enviada"], ["expired", "enviada"],
  ])("%s dá %s", (valor, esperado) => {
    expect(estadoPropostaDeDb(proposta({ status: valor }))).toBe(esperado);
  });

  it("um valor desconhecido lê os instantes: aceite_em, enviada_em, senão rascunho", () => {
    expect(estadoPropostaDeDb(proposta({ status: "xpto", aceite_em: "2026-10-12T09:00:00Z" }))).toBe("aceite");
    expect(estadoPropostaDeDb(proposta({ status: "xpto", enviada_em: "2026-10-12T09:00:00Z" }))).toBe("enviada");
    expect(estadoPropostaDeDb(proposta({ status: "xpto" }))).toBe("rascunho");
    expect(estadoPropostaDeDb(proposta({ status: null }))).toBe("rascunho");
  });
});

describe("estadoContratoDeDb: um caso por valor", () => {
  it.each([
    ["draft", "pendente"], ["pending", "pendente"], ["pendente", "pendente"], ["sent", "pendente"],
    ["signed", "assinado"], ["assinado", "assinado"], ["assinada", "assinado"], ["completed", "assinado"],
  ])("%s dá %s", (valor, esperado) => {
    expect(estadoContratoDeDb(contrato({ status: valor }))).toBe(esperado);
  });

  it("os cancelados não contam; um valor desconhecido lê o assinado_em", () => {
    for (const s of ["cancelled", "canceled", "anulado", "voided"]) expect(estadoContratoDeDb(contrato({ status: s }))).toBeNull();
    expect(estadoContratoDeDb(contrato({ status: "xpto", assinado_em: "2026-10-12T09:00:00Z" }))).toBe("assinado");
    expect(estadoContratoDeDb(contrato({ status: "xpto" }))).toBe("pendente");
    expect(estadoContratoDeDb(contrato({ status: null }))).toBe("pendente");
  });

  it("um contrato cancelado não aparece no negócio", () => {
    const [n] = adaptar(negocioDb({ contratos: [contrato({ status: "cancelled" })] })) as NegocioMes[];
    expect(n.contrato).toBeNull();
  });
});

describe("adaptarNegocios: uma só regra de proposta (a viva)", () => {
  const antes = "2026-10-01T09:00:00Z";
  const depois = "2026-10-15T09:00:00Z";

  it("uma proposta rejeitada mais recente não esconde a que ainda vale", () => {
    const [n] = adaptar(negocioDb({
      propostas: [proposta({ id: "a", status: "draft", criado_em: antes }), proposta({ id: "b", status: "rejected", enviada_em: depois, criado_em: depois })],
    })) as NegocioMes[];
    expect(n.proposta).toEqual({ estado: "rascunho" });
  });

  it("só com propostas rejeitadas o negócio fica sem proposta: rejeitada não conta como «enviada»", () => {
    for (const status of ["rejected", "declined"]) {
      const [n] = adaptar(negocioDb({ propostas: [proposta({ status, enviada_em: depois, criado_em: depois })] })) as NegocioMes[];
      expect(n.proposta).toBeNull();
    }
  });

  it("a regra «proposta aceite» do ganho vê a aceite mesmo com uma rejeitada mais recente", () => {
    const [n] = adaptar(negocioDb({
      propostas: [proposta({ id: "a", status: "accepted", criado_em: antes }), proposta({ id: "b", status: "rejected", criado_em: depois })],
    })) as NegocioMes[];
    expect(n.proposta).toEqual({ estado: "aceite" });
    expect(podeGanhar({ ...n, prontoAGanhar: undefined }, "proposta_aceite").pode).toBe(true);
  });

  it("com só rejeitadas a regra «proposta aceite» não deixa ganhar", () => {
    const [n] = adaptar(negocioDb({ propostas: [proposta({ status: "rejected", criado_em: depois })] })) as NegocioMes[];
    expect(podeGanhar({ ...n, prontoAGanhar: undefined }, "proposta_aceite")).toEqual({ pode: false, motivo: "semProposta" });
  });
});
