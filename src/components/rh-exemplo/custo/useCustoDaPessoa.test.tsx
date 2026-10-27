// Os hooks do custo ligados ao calculo REAL: a retribuicao do mes e o total bruto estimado do processamento, as horas
// feitas as da assiduidade, e os acumulados nao se inventam. O calculo partilhado entra por argumento (sem Supabase);
// os equipamentos continuam no store em memoria, que faz o hook recalcular. Os valores avulsos sao os lancamentos pontuais
// do periodo (da base): vem dentro da retribuicao do processamento e o custo mostra-os a parte. O tipo de contrato e as
// horas por semana vem dos vinculos (aqui simulados).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";

const estado = vi.hoisted(() => ({
  pessoa: { resultado: null as unknown, aCarregar: false, retribuicaoRecusada: false, incompleta: false, periodoAberto: true, temPeriodo: true, dados: {} as Record<string, unknown> },
  organizacao: {} as Record<string, unknown>,
  vinculos: new Map<string, unknown[]>(),
  horas: { versoes: [] as unknown[], loading: false },
  criar: vi.fn(),
  anular: vi.fn(),
  locais: [] as unknown[],
  filiais: [] as unknown[],
  cargos: [] as unknown[],
}));

vi.mock("@/components/rh-exemplo/processamento/useCalculoReal", () => ({
  useCalculoRealDaPessoa: () => estado.pessoa,
  useCalculoRealDoMes: () => estado.organizacao,
}));
vi.mock("@/components/rh-exemplo/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "org-1", name: "Org" }, companies: [], isLoading: false }) }));
vi.mock("@/components/rh-exemplo/hooks/usePessoaVinculoHoras", () => ({ usePessoaVinculoHoras: () => estado.horas }));
vi.mock("@/components/rh-exemplo/hooks/usePessoasVinculosVigentes", async () => {
  const real = await vi.importActual<typeof import("@/lib/hr/vinculosDoMes")>("@/lib/hr/vinculosDoMes");
  return { vinculoDoMes: real.vinculoDoMes, usePessoasVinculosVigentes: () => ({ vinculos: estado.vinculos, loading: false, recusado: false, error: null }) };
});
vi.mock("@/components/rh-exemplo/hooks/useLocaisTrabalho", () => ({ useLocaisTrabalho: () => ({ locais: estado.locais }) }));
vi.mock("@/components/rh-exemplo/hooks/useFiliaisDaArvore", () => ({ useFiliaisDaArvore: () => ({ filiais: estado.filiais, loading: false }) }));
vi.mock("@/components/rh-exemplo/hooks/useCargos", () => ({ useCargos: () => ({ cargos: estado.cargos }) }));

import { repor } from "@/components/rh-exemplo/dados/loja";
import { atribuirEquipamento, reporCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { useCustoDaOrganizacao, useCustoDaPessoa, dividirMes } from "./useCustoDaPessoa";

const MES = "2026-09";
const PESSOA = { id: "p-tiago", nome_completo: "Tiago Pinheiro", cargo: null, cargo_id: null, local_id: null } as never;

const lancamento = (id: string, pessoa: string, valor: number, extra: Record<string, unknown> = {}) => ({
  id, periodo_id: "per", pessoa_id: pessoa, organization_id: "org-1", descricao: `Premio ${id}`, valor, codigo_processamento_id: null,
  anulado_em: null, anulado_por: null, anulado_motivo: null, created_at: "2026-09-20T10:00:00Z", created_by: null, updated_at: "", updated_by: null, ...extra,
});
const dadosDoMes = (lancamentos: ReturnType<typeof lancamento>[] = [], periodo: unknown = { id: "per", estado: "aberto" }) => {
  const porPessoa = new Map<string, ReturnType<typeof lancamento>[]>();
  for (const l of lancamentos) porPessoa.set(l.pessoa_id, [...(porPessoa.get(l.pessoa_id) ?? []), l]);
  return {
    lancamentosPorPessoa: porPessoa,
    periodoHook: { periodo, loading: false, recusado: false },
    lancamentosHook: { saving: false, criar: estado.criar, anular: estado.anular },
    codigosActivos: [{ id: "cod-1", codigo: "PRM", nome: "Premio" }],
  };
};

const calculoReal = (
  totalBrutoEstimado: number | null,
  extra: { realizadoMinutos?: number; planeadoMinutos?: number; lancamentosPontuais?: number } = {},
) => ({
  resultado: { totalBrutoEstimado, lancamentosPontuais: extra.lancamentosPontuais ?? 0 },
  totais: { planeadoMinutos: extra.planeadoMinutos ?? 9600, realizadoMinutos: extra.realizadoMinutos ?? 9000 },
});

beforeEach(() => {
  cleanup();
  repor();
  reporCusto();
  estado.pessoa = { resultado: calculoReal(1200), aCarregar: false, retribuicaoRecusada: false, incompleta: false, periodoAberto: true, temPeriodo: true, dados: dadosDoMes() };
  estado.vinculos = new Map();
  estado.horas = { versoes: [], loading: false };
  estado.criar.mockReset();
  estado.anular.mockReset();
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

describe("useCustoDaPessoa: avulsos e horas da base", () => {
  it("os lancamentos da pessoa saem da retribuicao e aparecem como avulsos, so os dela", () => {
    estado.pessoa = {
      ...estado.pessoa,
      resultado: calculoReal(1300, { lancamentosPontuais: 100 }),
      dados: dadosDoMes([lancamento("l1", "p-tiago", 100), lancamento("l9", "p-outro", 999)]),
    };
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.custo?.retribuicaoMes).toBe(1200);
    expect(result.current.custo?.avulsos.map((a) => a.id)).toEqual(["l1"]);
    expect(result.current.custo?.atual.kmEAjudas).toBe(100);
    expect(result.current.custo?.atual.bruto).toBe(1300);
  });

  it("as horas por semana do contrato que cobre o mes mandam no custo por hora previsto", () => {
    estado.horas = { versoes: [{ valido_de: "2026-01-01", valido_ate: null, horas_semanais_equivalentes: 20 }], loading: false };
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    // Setembro de 2026 tem 22 dias uteis: 22 x 20 / 5 = 88 horas previstas.
    expect(result.current.custo?.atual.horasPrevistas).toBe(88);
  });

  it("sem versao de horas a cobrir o mes usa as horas planeadas, e enquanto le diz que esta a carregar", () => {
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.custo?.atual.horasPrevistas).toBeCloseTo(160, 1);
    estado.horas = { versoes: [], loading: true };
    expect(renderHook(() => useCustoDaPessoa(PESSOA, MES)).result.current.aCarregar).toBe(true);
  });

  it("devolve as acoes dos lancamentos do periodo", () => {
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.lancamentos).toMatchObject({ periodoAberto: true, aGravar: false });
    expect(result.current.lancamentos.criar).toBe(estado.criar);
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
    ...dadosDoMes(),
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

  it("o tipo de contrato e as horas por semana vem do vinculo que cobre o mes", () => {
    estado.organizacao = organizacao({ resultados: new Map([["p-hugo", calculoReal(1400, { planeadoMinutos: 9600 })]]) });
    estado.vinculos = new Map([
      ["p-hugo", [
        { tipoContrato: "termo_certo", estado: "terminado", dataInicio: "2025-01-01", dataFim: "2026-03-31", horasSemanais: 40 },
        { tipoContrato: "sem_termo", estado: "activo", dataInicio: "2026-04-01", dataFim: null, horasSemanais: 20 },
      ]],
    ]);
    const { result } = renderHook(() => useCustoDaOrganizacao(MES));
    expect(result.current.linhas[0]).toMatchObject({ tipoContrato: "sem_termo", horasSemanais: 20 });
  });

  it("sem vinculo que cubra o mes fica sem tipo de contrato e as horas voltam a derivar do planeado, nunca inventadas", () => {
    estado.organizacao = organizacao({ resultados: new Map([["p-hugo", calculoReal(1400, { planeadoMinutos: 22 * 8 * 60 })]]) });
    estado.vinculos = new Map([["p-hugo", [{ tipoContrato: "sem_termo", estado: "futuro", dataInicio: "2026-12-01", dataFim: null, horasSemanais: 20 }]]]);
    const { result } = renderHook(() => useCustoDaOrganizacao(MES));
    expect(result.current.linhas[0]!.tipoContrato).toBeNull();
    expect(result.current.linhas[0]!.horasSemanais).toBeCloseTo(40, 6);
  });

  it("um contrato sem horas fixas tambem deriva as horas do planeado", () => {
    estado.organizacao = organizacao({ resultados: new Map([["p-hugo", calculoReal(1400, { planeadoMinutos: 22 * 8 * 60 })]]) });
    estado.vinculos = new Map([["p-hugo", [{ tipoContrato: "sem_termo", estado: "activo", dataInicio: "2026-01-01", dataFim: null, horasSemanais: null }]]]);
    const { result } = renderHook(() => useCustoDaOrganizacao(MES));
    expect(result.current.linhas[0]).toMatchObject({ tipoContrato: "sem_termo" });
    expect(result.current.linhas[0]!.horasSemanais).toBeCloseTo(40, 6);
  });

  it("os lancamentos pontuais contam como avulsos a parte: a retribuicao sai sem eles e o total nao os conta duas vezes", () => {
    const premio = lancamento("l1", "p-hugo", 100);
    estado.organizacao = organizacao({
      resultados: new Map([["p-hugo", calculoReal(1500, { lancamentosPontuais: 100 })]]),
      ...dadosDoMes([premio]),
    });
    const { result } = renderHook(() => useCustoDaOrganizacao(MES));
    const linha = result.current.linhas[0]!;
    expect(linha.retribuicao).toBe(1400);
    expect(linha.avulsosMes).toBe(100);
    expect(result.current.avulsosPorPessoa.get("p-hugo")?.map((a) => [a.id, a.tipo, a.valor])).toEqual([["l1", "pontual", 100]]);
    // Com o mesmo bruto de 1500 e sem lancamentos, o total antes de encargos nao muda: 1400 + 100 = 1500.
    expect(linha.retribuicao! + linha.avulsosMes).toBe(1500);
  });

  it("um lancamento anulado fica na lista mas nao conta", () => {
    const anulado = lancamento("l2", "p-hugo", 50, { anulado_em: "2026-09-21T10:00:00Z", anulado_motivo: "Engano" });
    estado.organizacao = organizacao({
      resultados: new Map([["p-hugo", calculoReal(1400, { lancamentosPontuais: 0 })]]),
      ...dadosDoMes([anulado]),
    });
    const { result } = renderHook(() => useCustoDaOrganizacao(MES));
    expect(result.current.linhas[0]!.avulsosMes).toBe(0);
    expect(result.current.avulsosPorPessoa.get("p-hugo")?.[0]).toMatchObject({ anulado: { motivo: "Engano" } });
  });

  it("as acoes de registar e anular so valem com o periodo aberto, e passam pelo hook dos lancamentos", () => {
    estado.organizacao = organizacao({ ...dadosDoMes([], { id: "per", estado: "fechado" }) });
    expect(renderHook(() => useCustoDaOrganizacao(MES)).result.current.lancamentos.periodoAberto).toBe(false);
    estado.organizacao = organizacao({ ...dadosDoMes([], null) });
    expect(renderHook(() => useCustoDaOrganizacao(MES)).result.current.lancamentos.periodoAberto).toBe(false);
    estado.organizacao = organizacao();
    const { lancamentos } = renderHook(() => useCustoDaOrganizacao(MES)).result.current;
    expect(lancamentos.periodoAberto).toBe(true);
    expect(lancamentos.codigos).toEqual([{ id: "cod-1", codigo: "PRM", nome: "Premio" }]);
    expect(lancamentos.criar).toBe(estado.criar);
    expect(lancamentos.anular).toBe(estado.anular);
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
