import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import * as negociosAlterados from "@/components/negocio-metas/negociosAlterados";
import { alteracoesAtuais, repor as reporNegocios } from "@/components/negocio-metas/negociosAlterados";
import { negocioBase } from "../fabricaTestes";
import { novaLinhaDoCatalogo } from "./catalogoTrabalhos";
import { orcamentoDoNegocio, type ExtrasNegocio, type OrcamentoDetalhado } from "./orcamentoDetalhado";
import { estadoDeAgora, extrasAtuais, gravarTransicao, repor, useExtrasProcesso } from "./processoNegocios";
import { guardarOrcamento, type EstadoTransicao } from "./transicoes";
import { itensDaPessoa } from "./itensProcesso";
import { pessoaBase, resumoBase } from "../fabricaTestes";

const detalhado = (extra: Partial<OrcamentoDetalhado> = {}): OrcamentoDetalhado => ({
  orcamentoId: "o1", linhas: [novaLinhaDoCatalogo("pavimento", "l1")], desconto: 0, vendaDireta: false, verificado: false, direcao: null, versao: 1, ...extra,
});
const extras = (extra: Partial<OrcamentoDetalhado> = {}): ExtrasNegocio => ({ orcamento: detalhado(extra) });

/** Guarda os extras de um negócio sem mexer no negócio: uma transição que só muda os extras (verificar, pedir à Direção). */
const guardarExtras = (negocioId: string, e: ExtrasNegocio) => {
  const negocio = negocioBase(negocioId);
  gravarTransicao({ negocio, extras: undefined, sequencia: 0 }, { ok: true, negocio, extras: e });
};

vi.mock("@/components/negocio-metas/negociosAlterados", async (original) => {
  const real = await original<typeof import("@/components/negocio-metas/negociosAlterados")>();
  return { ...real, guardarNegocio: vi.fn(real.guardarNegocio) };
});

beforeEach(() => { repor(); reporNegocios(); });
afterEach(() => { repor(); reporNegocios(); vi.mocked(negociosAlterados.guardarNegocio).mockClear(); });

describe("processoNegocios: o estado em memória (como negociosAlterados)", () => {
  it("começa vazio, e o mesmo objeto até haver uma mudança (snapshot estável)", () => {
    expect(extrasAtuais()).toEqual({});
    expect(extrasAtuais()).toBe(extrasAtuais());
  });

  it("guardar troca o objeto (nunca muda o anterior) e indexa por negócio", () => {
    const antes = extrasAtuais();
    guardarExtras("n1", extras());
    const depois = extrasAtuais();
    expect(depois).not.toBe(antes);
    expect(antes).toEqual({});
    expect(depois.n1.orcamento?.orcamentoId).toBe("o1");
    guardarExtras("n2", extras({ orcamentoId: "o2" }));
    expect(Object.keys(extrasAtuais()).sort()).toEqual(["n1", "n2"]);
    expect(extrasAtuais().n1).toBe(depois.n1);
  });

  it("repor esquece tudo", () => {
    guardarExtras("n1", extras());
    repor();
    expect(extrasAtuais()).toEqual({});
  });

  it("o gancho re-renderiza quando muda e dá o mesmo valor quando nada mudou", () => {
    let renders = 0;
    const { result } = renderHook(() => { renders += 1; return useExtrasProcesso(); });
    const primeiro = result.current;
    const antes = renders;
    act(() => guardarExtras("n1", extras()));
    expect(result.current).not.toBe(primeiro);
    expect(result.current.n1.orcamento?.orcamentoId).toBe("o1");
    expect(renders).toBeGreaterThan(antes);
  });
});

describe("orcamentoDoNegocio: só vale o orçamento detalhado do orçamento escolhido", () => {
  const negocio = negocioBase("n1", { orcamentos: [{ id: "o1", valor: 10, escolhido: true }, { id: "o2", valor: 20, escolhido: false }] });

  it("devolve o detalhe quando é o do orçamento escolhido", () => {
    guardarExtras("n1", extras());
    expect(orcamentoDoNegocio(negocio, extrasAtuais())?.orcamentoId).toBe("o1");
  });

  it("não devolve nada se o escolhido já é outro (o detalhe ficou para trás), se não há escolhido ou se não há extras", () => {
    guardarExtras("n1", extras({ orcamentoId: "o2" }));
    expect(orcamentoDoNegocio(negocio, extrasAtuais())).toBeUndefined();
    expect(orcamentoDoNegocio(negocioBase("n1", { orcamentos: [{ id: "o1", valor: 10, escolhido: false }] }), extrasAtuais())).toBeUndefined();
    expect(orcamentoDoNegocio(negocioBase("n9"), extrasAtuais())).toBeUndefined();
    expect(orcamentoDoNegocio(negocio, {})).toBeUndefined();
  });
});

describe("gravarTransicao: grava o negócio e o extra juntos", () => {
  const negocio = negocioBase("n1", { orcamentos: [{ id: "o-novo-1", valor: 318, escolhido: true }] });
  const antes: EstadoTransicao = { negocio: negocioBase("n1"), extras: undefined, sequencia: 1 };

  it("o negócio vai para negociosAlterados e o extra para este estado, com o detalhe do orçamento novo e o número de série a avançar", () => {
    gravarTransicao(antes, {
      ok: true, negocio, extras: extras({ orcamentoId: "o-novo-1" }),
      novoOrcamento: { id: "o-novo-1", detalhe: { data: "2026-10-13", estado: "rascunho" } },
    });
    const a = alteracoesAtuais();
    expect(a.editados.n1).toBe(negocio);
    expect(a.detalhes.n1["o-novo-1"]).toEqual({ data: "2026-10-13", estado: "rascunho" });
    expect(a.sequencia).toBe(1);
    expect(extrasAtuais().n1.orcamento?.orcamentoId).toBe("o-novo-1");
  });

  it("quando o negócio não mudou (verificar, pedir à Direção) só grava o extra", () => {
    gravarTransicao({ ...antes, negocio }, { ok: true, negocio, extras: extras() });
    expect(alteracoesAtuais().editados).toEqual({});
    expect(extrasAtuais().n1).toBeDefined();
  });
});

describe("gravarTransicao: se a gravação falha a meio, nada fica a meio", () => {
  const novo = negocioBase("n1", { orcamentos: [{ id: "o-novo-1", valor: 318, escolhido: true }] });
  const antes: EstadoTransicao = { negocio: negocioBase("n1"), extras: undefined, sequencia: 1 };

  it("grava primeiro o negócio: se falha, os extras não chegam a ser escritos (nem o quadro nem os extras mostram metade)", () => {
    vi.mocked(negociosAlterados.guardarNegocio).mockImplementationOnce(() => { throw new Error("falhou"); });
    expect(() => gravarTransicao(antes, { ok: true, negocio: novo, extras: extras({ orcamentoId: "o-novo-1" }) })).toThrow("falhou");
    expect(extrasAtuais()).toEqual({});
    expect(alteracoesAtuais().editados).toEqual({});
  });
});

describe("estadoDeAgora: o negócio vem do store de agora, e não do snapshot do render", () => {
  const HOJE = "2026-10-13";
  const dados = (quantidade: number) => ({ linhas: [{ ...novaLinhaDoCatalogo("pavimento", "l1"), quantidade }], desconto: 0, vendaDireta: false });

  it("sem alterações guardadas devolve o negócio recebido; com alterações, a versão guardada", () => {
    const doRender = negocioBase("n1", { servico: "Cozinha" });
    expect(estadoDeAgora(doRender).negocio).toBe(doRender);
    const guardado = negocioBase("n1", { servico: "Cozinha", orcamentos: [{ id: "o-novo-1", valor: 1, escolhido: true }] });
    negociosAlterados.guardarNegocio(guardado);
    expect(estadoDeAgora(doRender).negocio).toBe(guardado);
    expect(estadoDeAgora(doRender).sequencia).toBe(alteracoesAtuais().sequencia + 1);
  });

  it("dois ajustes seguidos, ambos a partir do mesmo snapshot do render, não se pisam: o segundo parte do que o primeiro deixou", () => {
    const doRender = negocioBase("n1", { servico: "Cozinha", orcamentos: [{ id: "o-novo-1", valor: 318, escolhido: true }, { id: "o-x", valor: 5, escolhido: false }] });
    const resumo = resumoBase(pessoaBase("a"), [doRender], HOJE);
    const item = itensDaPessoa(resumo, HOJE, { n1: extras({ orcamentoId: "o-novo-1" }) })[0];
    gravarTransicao({ negocio: doRender, extras: undefined, sequencia: 1 }, { ok: true, negocio: doRender, extras: extras({ orcamentoId: "o-novo-1" }) });

    const ajustar = (quantidade: number) => {
      const estado = estadoDeAgora(doRender);
      const r = guardarOrcamento(estado, item, dados(quantidade), HOJE);
      if (r.ok === false) throw new Error(`devia dar certo: ${r.emFalta.join(",")}`);
      gravarTransicao(estado, r);
    };
    ajustar(10);
    // Entretanto o negócio ganhou outro orçamento; o ajuste seguinte tem de o manter, e não voltar ao snapshot do render.
    const guardado = alteracoesAtuais().editados.n1;
    negociosAlterados.guardarNegocio({ ...guardado, orcamentos: [...guardado.orcamentos, { id: "o-y", valor: 7, escolhido: false }] });
    ajustar(20);
    expect(alteracoesAtuais().editados.n1.orcamentos.map((o) => o.id)).toEqual(["o-novo-1", "o-x", "o-y"]);
    expect(alteracoesAtuais().editados.n1.orcamentos[0].valor).toBe(636);
  });
});
