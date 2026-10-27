// Os valores avulsos do custo ligados a base: o lancamento pontual vira um avulso «de uma vez» no mes do periodo, a retribuicao
// sai sem os lancamentos (que ja estao no total bruto do processamento) e as acoes passam pelo hook dos lancamentos.
import { describe, expect, it, vi } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import {
  acoesDosLancamentos,
  AvulsosReaisProvider,
  avulsosDosLancamentos,
  lancamentoParaAvulso,
  retribuicaoSemPontuais,
  useAvulsosReais,
} from "./lancamentosCusto";
import { valorDoAvulsoNoMes } from "@/components/rh-exemplo/lib/custoMes";

const lanc = (extra: Record<string, unknown> = {}) => ({
  id: "l1", periodo_id: "per", pessoa_id: "p1", organization_id: "org", descricao: "Premio", valor: 120.5, codigo_processamento_id: null,
  anulado_em: null, anulado_por: null, anulado_motivo: null, created_at: "2026-10-05T09:00:00Z", created_by: "u1", updated_at: "", updated_by: null, ...extra,
}) as never;

describe("lancamentoParaAvulso", () => {
  it("conta de uma vez no mes do periodo, seja qual for o dia em que foi registado", () => {
    const a = lancamentoParaAvulso(lanc(), "2026-09");
    expect(a).toMatchObject({ id: "l1", pessoaId: "p1", tipo: "pontual", valor: 120.5, descricao: "Premio", anulado: null, conta: { modo: "umaVez" } });
    expect(valorDoAvulsoNoMes(a, "2026-09")).toBe(120.5);
    expect(valorDoAvulsoNoMes(a, "2026-10")).toBe(0);
    expect(a.criadoEm).toBe("2026-10-05T09:00:00Z");
  });

  it("nao inventa autor, e um anulado leva o motivo (e conta zero no mes)", () => {
    const a = lancamentoParaAvulso(lanc({ anulado_em: "2026-10-06T09:00:00Z", anulado_motivo: "Engano" }), "2026-09");
    expect(a.autor).toBe("");
    expect(a.anulado).toEqual({ motivo: "Engano", por: "", em: "2026-10-06T09:00:00Z" });
  });

  it("um valor negativo (desconto) mantem-se negativo", () => {
    expect(lancamentoParaAvulso(lanc({ valor: -30 }), "2026-09").valor).toBe(-30);
  });
});

describe("avulsosDosLancamentos", () => {
  it("junta os lancamentos de todas as pessoas", () => {
    const mapa = new Map([["p1", [lanc()]], ["p2", [lanc({ id: "l2", pessoa_id: "p2" }), lanc({ id: "l3", pessoa_id: "p2" })]]]);
    expect(avulsosDosLancamentos(mapa, "2026-09").map((a) => a.id)).toEqual(["l1", "l2", "l3"]);
    expect(avulsosDosLancamentos(new Map(), "2026-09")).toEqual([]);
  });
});

describe("retribuicaoSemPontuais", () => {
  it("tira os lancamentos do total bruto, ao centimo", () => {
    expect(retribuicaoSemPontuais({ resultado: { totalBrutoEstimado: 1500.1, lancamentosPontuais: 100.05 } })).toBe(1400.05);
  });

  it("sem retribuicao fica sem retribuicao (nao zero), e sem o campo dos lancamentos nada se tira", () => {
    expect(retribuicaoSemPontuais({ resultado: { totalBrutoEstimado: null, lancamentosPontuais: 100 } })).toBeNull();
    expect(retribuicaoSemPontuais({ resultado: { totalBrutoEstimado: 900 } })).toBe(900);
  });
});

describe("acoesDosLancamentos", () => {
  const dados = (periodo: unknown) => ({
    periodoHook: { periodo },
    lancamentosHook: { saving: true, criar: vi.fn(), anular: vi.fn() },
    codigosActivos: [{ id: "c1", codigo: "PRM", nome: "Premio", activo: true }],
  }) as never;

  it("so um periodo aberto deixa registar e anular", () => {
    expect(acoesDosLancamentos(dados({ estado: "aberto" })).periodoAberto).toBe(true);
    expect(acoesDosLancamentos(dados({ estado: "fechado" })).periodoAberto).toBe(false);
    expect(acoesDosLancamentos(dados(null)).periodoAberto).toBe(false);
  });

  it("passa o estado de gravacao, os codigos e as funcoes do hook", () => {
    const d = dados({ estado: "aberto" });
    const a = acoesDosLancamentos(d);
    expect(a.aGravar).toBe(true);
    expect(a.codigos).toEqual([{ id: "c1", codigo: "PRM", nome: "Premio" }]);
    expect(a.criar).toBe((d as never as { lancamentosHook: { criar: unknown } }).lancamentosHook.criar);
  });
});

describe("AvulsosReaisProvider", () => {
  function Mostra({ pessoa }: { pessoa: string }) {
    return <output>{String(useAvulsosReais().get(pessoa)?.length ?? "nenhum")}</output>;
  }

  it("sem provider nao ha avulsos (nunca os de exemplo)", () => {
    const { result } = renderHook(() => useAvulsosReais());
    expect(result.current.size).toBe(0);
  });

  it("entrega os avulsos de cada pessoa", () => {
    const mapa = new Map([["p1", avulsosDosLancamentos(new Map([["p1", [lanc()]]]), "2026-09")]]);
    render(<AvulsosReaisProvider valor={mapa}><Mostra pessoa="p1" /></AvulsosReaisProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("1");
  });
});
