// Os hooks do custo ligados ao calculo REAL: a retribuicao do mes e o total bruto estimado do processamento, as horas
// feitas as da assiduidade, e os acumulados nao se inventam. O calculo partilhado entra por argumento (sem Supabase);
// os avulsos e equipamentos continuam no store em memoria, que faz o hook recalcular.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";

const estado = vi.hoisted(() => ({
  pessoa: { resultado: null as unknown, aCarregar: false, retribuicaoRecusada: false, incompleta: false, periodoAberto: true, temPeriodo: true },
  organizacao: {} as Record<string, unknown>,
  locais: [] as unknown[],
  filiais: [] as unknown[],
  cargos: [] as unknown[],
}));

vi.mock("@/components/rh-exemplo/processamento/useCalculoReal", () => ({
  useCalculoRealDaPessoa: () => estado.pessoa,
  useCalculoRealDoMes: () => estado.organizacao,
}));
vi.mock("@/components/rh-exemplo/hooks/useLocaisTrabalho", () => ({ useLocaisTrabalho: () => ({ locais: estado.locais }) }));
vi.mock("@/components/rh-exemplo/hooks/useFiliaisDaArvore", () => ({ useFiliaisDaArvore: () => ({ filiais: estado.filiais, loading: false }) }));
vi.mock("@/components/rh-exemplo/hooks/useCargos", () => ({ useCargos: () => ({ cargos: estado.cargos }) }));

import { repor } from "@/components/rh-exemplo/dados/loja";
import { atribuirEquipamento, reporCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { useCustoDaOrganizacao, useCustoDaPessoa, dividirMes } from "./useCustoDaPessoa";

const MES = "2026-09";
const PESSOA = { id: "p-tiago", nome_completo: "Tiago Pinheiro", cargo: null, cargo_id: null, local_id: null } as never;

const calculoReal = (totalBrutoEstimado: number | null, extra: { realizadoMinutos?: number; planeadoMinutos?: number } = {}) => ({
  resultado: { totalBrutoEstimado },
  totais: { planeadoMinutos: extra.planeadoMinutos ?? 9600, realizadoMinutos: extra.realizadoMinutos ?? 9000 },
});

beforeEach(() => {
  cleanup();
  repor();
  reporCusto();
  estado.pessoa = { resultado: calculoReal(1200), aCarregar: false, retribuicaoRecusada: false, incompleta: false, periodoAberto: true, temPeriodo: true };
  estado.locais = [{ id: "l1", nome: "Loja Porto", organograma_node_id: "f1" }];
  estado.filiais = [{ id: "f1", name: "Filial Porto" }];
  estado.cargos = [{ id: "c1", nome: "Gerente" }];
});

describe("dividirMes", () => {
  it("separa AAAA-MM e nunca devolve zeros", () => {
    expect(dividirMes("2026-09")).toEqual([2026, 9]);
    expect(dividirMes("")).toEqual([0, 1]);
  });
});

describe("useCustoDaPessoa", () => {
  it("a retribuicao do mes e o total bruto do processamento, e as horas feitas as da assiduidade", () => {
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.custo?.retribuicaoMes).toBe(1200);
    expect(result.current.custo?.atual.bruto).toBeGreaterThanOrEqual(1200);
    expect(result.current.custo?.atual.horasFeitas).toBe(150);
    expect(result.current.aCarregar).toBe(false);
  });

  it("os acumulados ficam sem valor: nunca o mes actual repetido", () => {
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.custo?.acumuladoAno).toBeNull();
    expect(result.current.custo?.acumuladoAdmissao).toBeNull();
  });

  it("sem retribuicao a pessoa fica sem custo total (nao zero)", () => {
    estado.pessoa = { ...estado.pessoa, resultado: calculoReal(null) };
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.custo?.retribuicaoMes).toBeNull();
    expect(result.current.custo?.atual.total).toBeNull();
  });

  it("enquanto carrega nao ha custo, e diz que esta a carregar", () => {
    estado.pessoa = { ...estado.pessoa, resultado: null, aCarregar: true };
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.custo).toBeNull();
    expect(result.current.aCarregar).toBe(true);
  });

  it("sem permissao para ver retribuicoes nao ha custo, mesmo com resultado, e diz-se", () => {
    estado.pessoa = { ...estado.pessoa, retribuicaoRecusada: true };
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.custo).toBeNull();
    expect(result.current.retribuicaoRecusada).toBe(true);
  });

  it("a assiduidade lida so em parte passa como incompleta", () => {
    estado.pessoa = { ...estado.pessoa, incompleta: true };
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.incompleta).toBe(true);
  });

  it("atribuir um equipamento (store em memoria) recalcula o custo", () => {
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    const antes = result.current.custo?.atual.outrosCustos ?? 0;
    act(() => {
      expect(atribuirEquipamento({ pessoaId: "p-tiago", tipo: "portatil", descricao: "Portátil", valor: 1800, entrega: "2026-09-01", autor: "Sofia" }).erro).toBeNull();
    });
    expect((result.current.custo?.atual.outrosCustos ?? 0) - antes).toBeCloseTo(50, 2);
  });
});

describe("useCustoDaOrganizacao", () => {
  const pessoaActiva = (id: string, extra: Record<string, unknown> = {}) => ({ id, nome_completo: `Pessoa ${id}`, cargo: null, cargo_id: "c1", local_id: "l1", ...extra });
  const organizacao = (extra: Record<string, unknown> = {}) => ({
    pessoasActivas: [pessoaActiva("p-hugo"), pessoaActiva("p-ines")],
    resultados: new Map([["p-hugo", calculoReal(1400)]]),
    retribuicoesHook: { recusado: false },
    ...extra,
  });

  it("so entram as pessoas cuja assiduidade ja chegou, com a retribuicao do processamento e o centro, filial e cargo reais", () => {
    estado.organizacao = organizacao();
    const { result } = renderHook(() => useCustoDaOrganizacao(MES));
    expect(result.current.linhas.map((l) => l.pessoaId)).toEqual(["p-hugo"]);
    expect(result.current.linhas[0]).toMatchObject({ retribuicao: 1400, cargo: "Gerente", centro: "Loja Porto", filial: "Filial Porto", tipoContrato: null });
    expect(result.current.ano).toBe(2026);
    expect(result.current.mesNum).toBe(9);
  });

  it("uma pessoa sem retribuicao entra sem custo, e sem permissao ninguem tem retribuicao", () => {
    estado.organizacao = organizacao({ resultados: new Map([["p-hugo", calculoReal(null)], ["p-ines", calculoReal(1100)]]) });
    const { result, rerender } = renderHook(() => useCustoDaOrganizacao(MES));
    expect(result.current.linhas.map((l) => [l.pessoaId, l.retribuicao])).toEqual([["p-hugo", null], ["p-ines", 1100]]);
    estado.organizacao = organizacao({ resultados: new Map([["p-hugo", calculoReal(1400)], ["p-ines", calculoReal(1100)]]), retribuicoesHook: { recusado: true } });
    rerender();
    expect(result.current.linhas.every((l) => l.retribuicao === null && l.total === null)).toBe(true);
  });

  it("sem pessoas nao ha linhas", () => {
    estado.organizacao = organizacao({ pessoasActivas: [], resultados: new Map() });
    const { result } = renderHook(() => useCustoDaOrganizacao(MES));
    expect(result.current.linhas).toEqual([]);
  });
});

describe("AbaCusto", () => {
  // A aba le o hook do custo; aqui o hook e o verdadeiro, alimentado pelos mocks acima.
  const renderAba = async () => {
    const { AbaCusto } = await import("./AbaCusto");
    return render(
      <LanguageProvider>
        <AbaCusto pessoa={PESSOA} ctx={{ nomePorPessoaId: new Map(), minhaPessoaId: null } as never} ficha={null as never} />
      </LanguageProvider>,
    );
  };

  beforeEach(() => window.localStorage.setItem("language", "pt"));

  it("mostra o custo do mes com a retribuicao real e os acumulados sem valor", async () => {
    await renderAba();
    expect(screen.getByText("Total bruto estimado do processamento salarial")).toBeInTheDocument();
    expect(screen.queryByText(/A calcular a retribuição do mês/)).not.toBeInTheDocument();
    expect(screen.getByText(/precisam do cálculo de cada mês anterior e ainda não estão ligados/)).toBeInTheDocument();
  });

  it("enquanto carrega diz que esta a calcular e nao mostra um quadro vazio como se fosse zero", async () => {
    estado.pessoa = { ...estado.pessoa, resultado: null, aCarregar: true };
    await renderAba();
    expect(screen.getByText("A calcular a retribuição do mês…")).toBeInTheDocument();
    expect(screen.queryByText("Total bruto estimado do processamento salarial")).not.toBeInTheDocument();
  });

  it("sem permissao diz-o e nao mostra custo", async () => {
    estado.pessoa = { ...estado.pessoa, resultado: null, retribuicaoRecusada: true };
    await renderAba();
    expect(screen.getByText("Não tem permissão para ver a retribuição: o custo do mês não se calcula.")).toBeInTheDocument();
    expect(screen.queryByText("Total bruto estimado do processamento salarial")).not.toBeInTheDocument();
  });

  it("assiduidade lida so em parte avisa que a retribuicao pode estar incompleta", async () => {
    estado.pessoa = { ...estado.pessoa, incompleta: true };
    await renderAba();
    expect(screen.getByText(/só se leu em parte \(sem permissão para tudo\): a retribuição pode estar incompleta/)).toBeInTheDocument();
  });
});
