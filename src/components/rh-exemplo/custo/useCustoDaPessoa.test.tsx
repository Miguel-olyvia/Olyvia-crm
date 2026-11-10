// Os hooks do custo ligados ao calculo REAL: a retribuicao do mes e o total bruto estimado do processamento, as horas
// feitas as da assiduidade, e os acumulados nao se inventam. O calculo partilhado entra por argumento (sem Supabase);
// os equipamentos, as definicoes e as excecoes de taxa vem da base (hooks simulados aqui, junto com as permissoes) e fazem o
// hook recalcular. Os valores avulsos sao os lancamentos pontuais do periodo (da base): vem dentro da retribuicao do
// processamento e o custo mostra-os a parte. O tipo de contrato e as horas por semana vem dos vinculos (aqui simulados).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";

const estado = vi.hoisted(() => ({
  permissoes: [] as string[],
  permissoesACarregar: false,
  equipamentosHook: { equipamentos: null as unknown, aCarregar: false, erro: null as string | null, atribuir: vi.fn(), devolver: vi.fn(), alterarConta: vi.fn() },
  excecoesHook: { excecoes: null as unknown, aCarregar: false, erro: null as string | null, definir: vi.fn() },
  pedidoEquipamentos: vi.fn(),
  pedidoExcecoes: vi.fn(),
  pessoa: { resultado: null as unknown, aCarregar: false, retribuicaoRecusada: false, incompleta: false, periodoAberto: true, temPeriodo: true, dados: {} as Record<string, unknown> },
  organizacao: {} as Record<string, unknown>,
  // Os resultados GRAVADOS de um periodo fechado (simulados) e os pedidos feitos ao calculo vivo e a eles.
  gravados: { estado: "ok" as string, porPessoa: new Map<string, unknown>(), antesDoRegisto: false },
  pedidoGravados: vi.fn(),
  pedidoCalculo: vi.fn(),
  vinculos: new Map<string, unknown[]>(),
  horas: { versoes: [] as unknown[], loading: false },
  criar: vi.fn(),
  anular: vi.fn(),
  locais: [] as unknown[],
  filiais: [] as unknown[],
  cargos: [] as unknown[],
  periodosCargo: [] as unknown[],
  periodosErro: false,
  periodosACarregar: false,
}));

// As regras do periodo da folha: sem regra (a base ainda sem as RPCs) o periodo e o mes de calendario.
const SEM_REGRAS_PERIODO: never[] = [];
vi.mock("@/hooks/usePeriodoFolhaRegras", () => ({ usePeriodoFolhaRegras: () => ({ regras: SEM_REGRAS_PERIODO, estado: "ok", isLoading: false }) }));

vi.mock("@/components/rh-exemplo/processamento/useCalculoReal", () => ({
  useCalculoRealDaPessoa: (...args: unknown[]) => {
    estado.pedidoCalculo(...args);
    return estado.pessoa;
  },
  useCalculoRealDoMes: () => estado.organizacao,
}));
vi.mock("@/components/rh-exemplo/hooks/useProcessamentoResultados", async () => {
  const real = await vi.importActual<typeof import("@/lib/hr/resultadosFecho")>("@/lib/hr/resultadosFecho");
  return {
    resultadoDeLinhaGravada: real.resultadoDeLinhaGravada,
    minutosDeLinhaGravada: real.minutosDeLinhaGravada,
    useProcessamentoResultados: (periodoId: string | undefined, activo: boolean) => {
      estado.pedidoGravados(periodoId, activo);
      return activo ? estado.gravados : { estado: "inactivo", porPessoa: new Map(), antesDoRegisto: false };
    },
  };
});
vi.mock("@/components/rh-exemplo/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "org-1", name: "Org" }, companies: [], isLoading: false }) }));
vi.mock("@/components/rh-exemplo/hooks/usePessoaVinculoHoras", () => ({ usePessoaVinculoHoras: () => estado.horas }));
vi.mock("@/components/rh-exemplo/hooks/usePessoasVinculosVigentes", async () => {
  const real = await vi.importActual<typeof import("@/lib/hr/vinculosDoMes")>("@/lib/hr/vinculosDoMes");
  return { vinculoDoMes: real.vinculoDoMes, usePessoasVinculosVigentes: () => ({ vinculos: estado.vinculos, loading: false, recusado: false, error: null }) };
});
vi.mock("@/components/rh-exemplo/hooks/useLocaisTrabalho", () => ({ useLocaisTrabalho: () => ({ locais: estado.locais }) }));
vi.mock("@/components/rh-exemplo/hooks/useFiliaisDaArvore", () => ({ useFiliaisDaArvore: () => ({ filiais: estado.filiais, loading: false }) }));
vi.mock("@/components/rh-exemplo/hooks/useCargos", () => ({ useCargos: () => ({ cargos: estado.cargos, periodos: estado.periodosCargo, periodosLoading: estado.periodosACarregar, periodosError: estado.periodosErro }) }));
// Os dados do custo (equipamentos, excecoes) e as permissoes vem destes wrappers: aqui sao simulados.
vi.mock("@/components/rh-exemplo/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => estado.permissoes.includes(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => estado.permissoes.includes(p)),
    permissions: estado.permissoes,
    loading: estado.permissoesACarregar,
  }),
}));
vi.mock("@/components/rh-exemplo/hooks/useEquipamentosCusto", () => ({
  useEquipamentosCusto: (opcoes: unknown) => {
    estado.pedidoEquipamentos(opcoes);
    return estado.equipamentosHook;
  },
  useEquipamentosCustoAcoes: () => estado.equipamentosHook,
}));
vi.mock("@/components/rh-exemplo/hooks/useCustoExcecoes", () => ({
  useCustoExcecoes: (opcoes: unknown) => {
    estado.pedidoExcecoes(opcoes);
    return estado.excecoesHook;
  },
}));

import { definirMesCusto, reporCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { useCustoDaOrganizacao, useCustoDaPessoa, dividirMes } from "./useCustoDaPessoa";

const MES = "2026-09";
const PESSOA = { id: "p-tiago", nome_completo: "Tiago Pinheiro", cargo: null, cargo_id: null, local_id: null } as never;
const VER = "hr.pessoas.retribuicao.view";
const EDITAR = "hr.pessoas.retribuicao.edit";

const portatil = (extra: Partial<EquipamentoPessoa> = {}): EquipamentoPessoa => ({
  id: "eq-1", pessoaId: "p-tiago", tipo: "portatil", descricao: "Portátil", valor: 1800, entrega: "2026-09-01",
  conta: { modo: "repartido", meses: 36, inicio: null, fim: null }, estado: "atribuido", devolucao: null, estadoDevolucao: null, autor: "Sofia", ...extra,
});

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

const somaRegras = (linhas: unknown[] = []) => (linhas as { valor: number }[]).reduce((s, l) => s + l.valor, 0);
const calculoReal = (
  totalBrutoEstimado: number | null,
  extra: { realizadoMinutos?: number; planeadoMinutos?: number; lancamentosPontuais?: number; linhasRegra?: unknown[] } = {},
) => ({
  // O resultado do processamento na forma real: a base do mes e o que o total leva alem dos manuais; sem linhas nem descontos.
  resultado: {
    totalBrutoEstimado,
    lancamentosPontuais: extra.lancamentosPontuais ?? 0,
    baseMes: totalBrutoEstimado === null ? null : totalBrutoEstimado - (extra.lancamentosPontuais ?? 0) - somaRegras(extra.linhasRegra),
    divisorDuodecimos: 14,
    linhasAutomaticas: [],
    linhasRegra: extra.linhasRegra ?? [],
    descontoFaltas: 0,
    subsidioAlimentacao: 0,
  },
  totais: { planeadoMinutos: extra.planeadoMinutos ?? 9600, realizadoMinutos: extra.realizadoMinutos ?? 9000 },
});

beforeEach(() => {
  cleanup();
  reporCusto();
  estado.permissoes = [VER, EDITAR];
  estado.permissoesACarregar = false;
  estado.equipamentosHook = { ...estado.equipamentosHook, equipamentos: [], aCarregar: false, erro: null };
  estado.excecoesHook = { ...estado.excecoesHook, excecoes: {}, aCarregar: false, erro: null };
  estado.pedidoEquipamentos.mockClear();
  estado.pedidoExcecoes.mockClear();
  estado.pessoa = { resultado: calculoReal(1200), aCarregar: false, retribuicaoRecusada: false, incompleta: false, periodoAberto: true, temPeriodo: true, dados: dadosDoMes() };
  estado.gravados = { estado: "ok", porPessoa: new Map(), antesDoRegisto: false };
  estado.pedidoGravados.mockClear();
  estado.pedidoCalculo.mockClear();
  estado.vinculos = new Map();
  estado.horas = { versoes: [], loading: false };
  estado.criar.mockReset();
  estado.anular.mockReset();
  estado.locais = [{ id: "l1", nome: "Loja Porto", organograma_node_id: "f1" }];
  estado.filiais = [{ id: "f1", name: "Filial Porto" }];
  estado.cargos = [{ id: "c1", nome: "Gerente" }];
  estado.periodosCargo = [];
  estado.periodosErro = false;
  estado.periodosACarregar = false;
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
    expect(result.current.custo?.atual.avulsos).toBe(100);
    expect(result.current.custo?.atual.bruto).toBe(1300);
  });

  it("km e ajudas ja estao na retribuicao: nao voltam como avulsos e o bruto nao os conta duas vezes", () => {
    // 1200 de base + 100 km x 0,40 = 1240 no processamento (totalRegras); o lancamento de km tambem esta na lista do periodo.
    estado.pessoa = {
      ...estado.pessoa,
      resultado: calculoReal(1240, { linhasRegra: [{ tipo: "km", faixa: null, quantidade: 100, valor: 40 }] }),
      dados: dadosDoMes([lancamento("k1", "p-tiago", 40, { tipo: "km", quantidade: 100 })]),
    };
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    const custo = result.current.custo;
    expect(custo?.avulsos).toEqual([]);
    expect(custo?.atual.avulsos).toBe(0);
    expect(custo?.atual.bruto).toBe(1240);
    // A TSU incide so sobre os 1200 (sem os km): 285; o custo = 1240 + 285 + seguro 0 (cargo sem seguro).
    expect(custo?.atual.encargosTaxa).toBe(285);
    expect(custo?.atual.total).toBe(1525);
    expect(custo?.atual.contas.linhas.find((l) => l.chave === "km")?.valor).toBe(40);
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

  it("um equipamento vindo da base recalcula o custo (1800 / 36 = 50 por mes), e so conta o da propria pessoa", () => {
    const { result, rerender } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    const antes = result.current.custo?.atual.outrosCustos ?? 0;
    estado.equipamentosHook = { ...estado.equipamentosHook, equipamentos: [portatil(), portatil({ id: "eq-2", pessoaId: "p-outro" })] };
    rerender();
    expect((result.current.custo?.atual.outrosCustos ?? 0) - antes).toBeCloseTo(50, 2);
    expect(result.current.custo?.equipamentos.map((e) => e.id)).toEqual(["eq-1"]);
  });

  it("as taxas e a excecao da base entram na conta: a excecao da pessoa baixa os encargos", () => {
    const { result, rerender } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    const antes = result.current.custo?.atual.encargosTaxa ?? 0;
    expect(result.current.custo?.taxaExcecao).toBeNull();
    estado.excecoesHook = { ...estado.excecoesHook, excecoes: { "p-tiago": 10 } };
    rerender();
    expect(result.current.custo?.taxaExcecao).toBe(10);
    expect(result.current.custo?.atual.encargosTaxa).toBeLessThan(antes);
    expect(result.current.custo?.atual.encargosTaxa).toBeCloseTo(120, 2);
  });

  it("pede os dados do custo so da pessoa, e so a quem pode ver; podeEditar exige ver e editar", () => {
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(estado.pedidoEquipamentos).toHaveBeenCalledWith({ pessoaId: "p-tiago", enabled: true });
    expect(estado.pedidoExcecoes).toHaveBeenCalledWith({ enabled: true });
    expect(result.current.podeEditar).toBe(true);
    estado.permissoes = [VER];
    expect(renderHook(() => useCustoDaPessoa(PESSOA, MES)).result.current.podeEditar).toBe(false);
  });

  it("sem a permissao de ver o custo nada se pede a base, nao ha custo e diz-se (mesmo com resultado)", () => {
    estado.permissoes = [];
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(estado.pedidoEquipamentos).toHaveBeenCalledWith({ pessoaId: "p-tiago", enabled: false });
    expect(estado.pedidoExcecoes).toHaveBeenCalledWith({ enabled: false });
    expect(result.current.custo).toBeNull();
    expect(result.current.retribuicaoRecusada).toBe(true);
    expect(result.current.podeEditar).toBe(false);
  });

  it("enquanto os dados da base nao chegam nao ha custo (nunca valores de exemplo) e diz que esta a carregar", () => {
    estado.equipamentosHook = { ...estado.equipamentosHook, equipamentos: null, aCarregar: true };
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.custo).toBeNull();
    expect(result.current.aCarregar).toBe(true);
    expect(result.current.erroBase).toBeNull();
  });

  it("enquanto as permissoes carregam nao ha custo e diz que esta a carregar, sem dizer que falta permissao", () => {
    estado.permissoes = [];
    estado.permissoesACarregar = true;
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.custo).toBeNull();
    expect(result.current.aCarregar).toBe(true);
    expect(result.current.retribuicaoRecusada).toBe(false);
  });

  it("uma falha a ler os dados da base nao calcula o custo e devolve o texto do erro", () => {
    estado.excecoesHook = { ...estado.excecoesHook, excecoes: null, erro: "Falha de teste" };
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.custo).toBeNull();
    expect(result.current.erroBase).toBe("Falha de teste");
    expect(result.current.aCarregar).toBe(false);
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

  it("os equipamentos da base entram nas linhas (os da organizacao toda) e o custo da linha acompanha-os", () => {
    estado.organizacao = organizacao();
    const { result, rerender } = renderHook(() => useCustoDaOrganizacao(MES));
    expect(estado.pedidoEquipamentos).toHaveBeenCalledWith({ pessoaId: null, enabled: true });
    expect(result.current.linhas[0]!.equipamentosMes).toBe(0);
    estado.equipamentosHook = { ...estado.equipamentosHook, equipamentos: [portatil({ pessoaId: "p-hugo" })] };
    rerender();
    expect(result.current.linhas[0]!.equipamentosMes).toBeCloseTo(50, 2);
    expect(result.current.podeEditar).toBe(true);
  });

  it("sem a permissao de ver o custo nao ha linhas e diz-se; sem permissao de editar so se le", () => {
    estado.organizacao = organizacao();
    estado.permissoes = [];
    const { result } = renderHook(() => useCustoDaOrganizacao(MES));
    expect(result.current.linhas).toEqual([]);
    expect(result.current.semPermissaoCusto).toBe(true);
    expect(result.current.baseACarregar).toBe(false);
    estado.permissoes = [VER];
    const soLeitura = renderHook(() => useCustoDaOrganizacao(MES)).result.current;
    expect(soLeitura.linhas).toHaveLength(1);
    expect(soLeitura.podeEditar).toBe(false);
  });

  it("enquanto os dados da base nao chegam nao ha linhas e diz-se que esta a carregar; uma falha da o erro", () => {
    estado.organizacao = organizacao();
    estado.excecoesHook = { ...estado.excecoesHook, excecoes: null, aCarregar: true };
    const carregar = renderHook(() => useCustoDaOrganizacao(MES)).result.current;
    expect(carregar.linhas).toEqual([]);
    expect(carregar.baseACarregar).toBe(true);
    estado.excecoesHook = { ...estado.excecoesHook, excecoes: null, aCarregar: false, erro: "Falha de teste" };
    const falha = renderHook(() => useCustoDaOrganizacao(MES)).result.current;
    expect(falha.linhas).toEqual([]);
    expect(falha.baseACarregar).toBe(false);
    expect(falha.erroBase).toBe("Falha de teste");
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

  it("sem a permissao de ver o custo (permissoes) diz-o e nao mostra custo", async () => {
    estado.permissoes = [];
    await renderAba();
    expect(screen.getByText("Não tem permissão para ver a retribuição: o custo do mês não se calcula.")).toBeInTheDocument();
    expect(screen.queryByText("Total bruto estimado do processamento salarial")).not.toBeInTheDocument();
  });

  it("enquanto os dados da base nao chegam diz que esta a calcular em vez de mostrar um quadro a zeros", async () => {
    estado.excecoesHook = { ...estado.excecoesHook, excecoes: null, aCarregar: true };
    await renderAba();
    expect(screen.getByText("A calcular a retribuição do mês…")).toBeInTheDocument();
    expect(screen.queryByText("Total bruto estimado do processamento salarial")).not.toBeInTheDocument();
  });

  it("uma falha a ler os dados da base mostra o erro e nao mostra custo", async () => {
    estado.equipamentosHook = { ...estado.equipamentosHook, equipamentos: null, erro: "Falha de teste" };
    await renderAba();
    expect(screen.getByRole("alert")).toHaveTextContent("Falha de teste");
    expect(screen.queryByText("Total bruto estimado do processamento salarial")).not.toBeInTheDocument();
  });

  it("assiduidade lida so em parte avisa que a retribuicao pode estar incompleta", async () => {
    estado.pessoa = { ...estado.pessoa, incompleta: true };
    await renderAba();
    expect(screen.getByText(/só se leu em parte \(sem permissão para tudo\): a retribuição pode estar incompleta/)).toBeInTheDocument();
  });
});

// ---- Mes FECHADO: o ecra le o que ficou gravado no fecho e nao monta o calculo vivo ----

const FECHADO = { id: "per", estado: "fechado" };
const gravada = (pessoaId: string, extra: Record<string, unknown> = {}) => ({
  pessoa_id: pessoaId, valor_hora: 8.5, total_bruto: 1500, totais: { lancamentos_pontuais: 100 }, linhas: [], avisos: [],
  retribuicao_id: null, cargo_periodo_id: null, regra_salarial_id: null, fechado_em: "2026-10-01T10:00:00Z", fechado_por_nome: "Rita",
  planeado_minutos: 9600, realizado_minutos: 9000, pessoa_nome: `Gravada ${pessoaId}`, ...extra,
});
/** O calculo vivo de teste: ler `resultado` ou `resultados` num mes fechado e um erro (nao se monta o calculo vivo). */
const vivoProibido = <T extends Record<string, unknown>>(base: T, campo: "resultado" | "resultados"): T => {
  const copia = { ...base };
  Object.defineProperty(copia, campo, { get: () => { throw new Error("calculo vivo lido num mes fechado"); }, enumerable: true });
  return copia;
};

describe("useCustoDaPessoa: mes fechado", () => {
  beforeEach(() => {
    estado.pessoa = vivoProibido({ ...estado.pessoa, dados: dadosDoMes([], FECHADO) }, "resultado") as typeof estado.pessoa;
    estado.gravados = { estado: "ok", porPessoa: new Map([["p-tiago", gravada("p-tiago")]]), antesDoRegisto: false };
  });

  it("usa as horas e a retribuicao GRAVADAS (total_bruto menos os pontuais) e nunca le o calculo vivo", () => {
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.fechado).toBe(true);
    expect(result.current.semValoresGravados).toBe(false);
    expect(result.current.custo?.retribuicaoMes).toBe(1400);
    expect(result.current.custo?.atual.horasFeitas).toBe(150);
    // 9600 minutos planeados = 160 h previstas (sem horas contratuais).
    expect(result.current.custo?.atual.horasPrevistas).toBeCloseTo(160, 1);
    expect(estado.pedidoCalculo).toHaveBeenCalledWith("p-tiago", 2026, 9, { congelarSeFechado: true });
    expect(estado.pedidoGravados).toHaveBeenCalledWith("per", true);
  });

  it("as horas contratuais continuam a mandar nas horas previstas, tambem num mes fechado", () => {
    estado.horas = { versoes: [{ valido_de: "2026-01-01", valido_ate: null, horas_semanais_equivalentes: 20 }], loading: false };
    expect(renderHook(() => useCustoDaPessoa(PESSOA, MES)).result.current.custo?.atual.horasPrevistas).toBe(88);
  });

  it("equipamentos, taxas e excecoes continuam vivos", () => {
    estado.equipamentosHook = { ...estado.equipamentosHook, equipamentos: [portatil()] };
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.custo?.atual.outrosCustos).toBeCloseTo(50, 2);
    expect(result.current.custo?.atual.encargosTaxa).toBeCloseTo(1400 * 0.2375, 2);
  });

  it("pessoa sem linha gravada: aviso, sem retribuicao nem horas inventadas, nunca recalcula", () => {
    estado.gravados = { estado: "ok", porPessoa: new Map([["p-outro", gravada("p-outro")]]), antesDoRegisto: false };
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.semValoresGravados).toBe(true);
    expect(result.current.custo?.retribuicaoMes).toBeNull();
    expect(result.current.custo?.atual.total).toBeNull();
    // Sem linha gravada o custo nao leva horas feitas (nem um 0 inventado) e nao ha custo por hora feita.
    expect(result.current.custo?.horasFeitas).toBeNull();
    expect(result.current.custo?.atual.porHoraFeita).toBeNull();
  });

  it("com linha gravada o custo leva as horas gravadas", () => {
    expect(renderHook(() => useCustoDaPessoa(PESSOA, MES)).result.current.custo?.horasFeitas).toBe(150);
  });

  it("fechado antes do registo, recusado ou com erro: mesmo aviso", () => {
    for (const lido of [{ estado: "ok", antesDoRegisto: true }, { estado: "recusado", antesDoRegisto: false }, { estado: "erro", antesDoRegisto: false }]) {
      estado.gravados = { ...lido, porPessoa: new Map() };
      expect(renderHook(() => useCustoDaPessoa(PESSOA, MES)).result.current.semValoresGravados).toBe(true);
    }
  });

  it("linha gravada sem minutos validos (base sem a migration) conta como sem valores, nunca como 0 horas", () => {
    estado.gravados = { estado: "ok", porPessoa: new Map([["p-tiago", gravada("p-tiago", { planeado_minutos: undefined, realizado_minutos: null })]]), antesDoRegisto: false };
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.semValoresGravados).toBe(true);
    expect(result.current.custo?.retribuicaoMes).toBeNull();
  });

  it("enquanto os valores gravados carregam nao ha custo, diz que esta a carregar e nao avisa", () => {
    estado.gravados = { estado: "a_carregar", porPessoa: new Map(), antesDoRegisto: false };
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.custo).toBeNull();
    expect(result.current.aCarregar).toBe(true);
    expect(result.current.semValoresGravados).toBe(false);
  });

  it("periodo aberto: continua vivo e nem pede os gravados", () => {
    estado.pessoa = { resultado: calculoReal(1200), aCarregar: false, retribuicaoRecusada: false, incompleta: false, periodoAberto: true, temPeriodo: true, dados: dadosDoMes([], { id: "per", estado: "aberto" }) };
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA, MES));
    expect(result.current.fechado).toBe(false);
    expect(result.current.custo?.retribuicaoMes).toBe(1200);
    expect(result.current.custo?.atual.horasFeitas).toBe(150);
    expect(estado.pedidoGravados).toHaveBeenCalledWith("per", false);
  });
});

describe("useCustoDaOrganizacao: mes fechado", () => {
  const pessoaActiva = (id: string) => ({ id, nome_completo: `Pessoa ${id}`, cargo: null, cargo_id: "c1", local_id: "l1" });
  const organizacaoFechada = (extra: Record<string, unknown> = {}) =>
    vivoProibido({
      pessoasActivas: [pessoaActiva("p-hugo"), pessoaActiva("p-ines")],
      todasAsPessoas: [pessoaActiva("p-hugo"), pessoaActiva("p-ines"), { ...pessoaActiva("p-saiu"), nome_completo: "Saiu Depois" }],
      retribuicoesHook: { recusado: false },
      ...dadosDoMes([], FECHADO),
      ...extra,
    }, "resultados");

  beforeEach(() => {
    estado.organizacao = organizacaoFechada();
    estado.gravados = {
      estado: "ok", antesDoRegisto: false,
      porPessoa: new Map([["p-hugo", gravada("p-hugo")], ["p-saiu", gravada("p-saiu", { total_bruto: 900, totais: { lancamentos_pontuais: 0 } })]]),
    };
  });

  it("as linhas vem do gravado (tambem de quem saiu depois), sem ler o calculo vivo", () => {
    const { result } = renderHook(() => useCustoDaOrganizacao(MES));
    const linhas = result.current.linhas;
    expect(result.current.fechado).toBe(true);
    expect(linhas.map((l) => l.pessoaId).sort()).toEqual(["p-hugo", "p-ines", "p-saiu"]);
    expect(linhas.find((l) => l.pessoaId === "p-hugo")).toMatchObject({ retribuicao: 1400 });
    expect(linhas.find((l) => l.pessoaId === "p-hugo")?.semValoresGravados).toBeFalsy();
    expect(linhas.find((l) => l.pessoaId === "p-saiu")).toMatchObject({ nome: "Saiu Depois", retribuicao: 900 });
    expect(estado.pedidoGravados).toHaveBeenCalledWith("per", true);
  });

  it("quem so existe no gravado (ja nao vem da lista) tem o seguro desconhecido; quem esta na lista tem o do cargo de hoje", () => {
    estado.gravados = { ...estado.gravados, porPessoa: new Map([...estado.gravados.porPessoa, ["p-fantasma", gravada("p-fantasma")]]) };
    const { result } = renderHook(() => useCustoDaOrganizacao(MES));
    expect(result.current.linhas.find((l) => l.pessoaId === "p-fantasma")).toMatchObject({ seguroDesconhecido: true, seguro: 0 });
    expect(result.current.linhas.find((l) => l.pessoaId === "p-saiu")?.seguroDesconhecido).toBeUndefined();
    expect(result.current.linhas.find((l) => l.pessoaId === "p-hugo")?.seguroDesconhecido).toBeUndefined();
  });

  it("uma pessoa activa sem linha gravada vem marcada e sem retribuicao", () => {
    const { result } = renderHook(() => useCustoDaOrganizacao(MES));
    expect(result.current.linhas.find((l) => l.pessoaId === "p-ines")).toMatchObject({ retribuicao: null, total: null, semValoresGravados: true });
    expect(result.current.semValoresGravados).toBe(false);
  });

  it("fechado antes do registo ou sem poder ler: todas as activas sem valores, e o ecra e avisado", () => {
    estado.gravados = { estado: "recusado", antesDoRegisto: false, porPessoa: new Map() };
    const { result } = renderHook(() => useCustoDaOrganizacao(MES));
    expect(result.current.semValoresGravados).toBe(true);
    expect(result.current.linhas.map((l) => l.semValoresGravados)).toEqual([true, true]);
  });

  it("a carregar os gravados: sem linhas e diz-se", () => {
    estado.gravados = { estado: "a_carregar", antesDoRegisto: false, porPessoa: new Map() };
    const { result } = renderHook(() => useCustoDaOrganizacao(MES));
    expect(result.current.linhas).toEqual([]);
    expect(result.current.gravadosACarregar).toBe(true);
  });

  it("gravado em erro ou recusado: expoe a falha e o recarregar do hook dos gravados; sem falha, nao", () => {
    const recarregar = vi.fn();
    for (const lido of ["erro", "recusado"]) {
      estado.gravados = { estado: lido, antesDoRegisto: false, porPessoa: new Map(), recarregar } as typeof estado.gravados;
      const { result } = renderHook(() => useCustoDaOrganizacao(MES));
      expect(result.current.gravadosFalhou).toBe(true);
      result.current.recarregarGravados();
    }
    expect(recarregar).toHaveBeenCalledTimes(2);
    estado.gravados = { estado: "ok", antesDoRegisto: true, porPessoa: new Map() };
    expect(renderHook(() => useCustoDaOrganizacao(MES)).result.current.gravadosFalhou).toBe(false);
  });

  it("equipamentos vivos entram nas linhas do mes fechado", () => {
    estado.equipamentosHook = { ...estado.equipamentosHook, equipamentos: [portatil({ pessoaId: "p-hugo" })] };
    const { result } = renderHook(() => useCustoDaOrganizacao(MES));
    expect(result.current.linhas.find((l) => l.pessoaId === "p-hugo")?.equipamentosMes).toBeCloseTo(50, 2);
  });

  it("periodo aberto: vivo como antes (e os gravados nem se pedem)", () => {
    estado.organizacao = {
      pessoasActivas: [pessoaActiva("p-hugo")], resultados: new Map([["p-hugo", calculoReal(1400)]]), retribuicoesHook: { recusado: false }, ...dadosDoMes(),
    };
    const { result } = renderHook(() => useCustoDaOrganizacao(MES));
    expect(result.current.fechado).toBe(false);
    expect(result.current.linhas.map((l) => l.retribuicao)).toEqual([1400]);
    expect(estado.pedidoGravados).toHaveBeenCalledWith("per", false);
  });
});

describe("AbaCusto: mes fechado", () => {
  const renderAba = async () => {
    const { AbaCusto } = await import("./AbaCusto");
    return render(
      <LanguageProvider>
        <AbaCusto pessoa={PESSOA} ctx={{ nomePorPessoaId: new Map(), minhaPessoaId: null } as never} ficha={null as never} />
      </LanguageProvider>,
    );
  };

  beforeEach(() => {
    window.localStorage.setItem("language", "pt");
    estado.pessoa = { resultado: null, aCarregar: false, retribuicaoRecusada: false, incompleta: false, periodoAberto: false, temPeriodo: true, dados: dadosDoMes([], FECHADO) };
  });

  it("diz numa linha que so as horas e a retribuicao sao as do fecho", async () => {
    estado.gravados = { estado: "ok", porPessoa: new Map([["p-tiago", gravada("p-tiago")]]), antesDoRegisto: false };
    await renderAba();
    expect(screen.getByText(/só as horas e a retribuição são as gravadas no fecho/)).toBeInTheDocument();
    expect(screen.queryByText(/Sem valores gravados no fecho/)).not.toBeInTheDocument();
  });

  it("sem linha gravada avisa em texto (nao so cor) e nao recalcula", async () => {
    estado.gravados = { estado: "ok", porPessoa: new Map(), antesDoRegisto: false };
    await renderAba();
    expect(screen.getByText(/Sem valores gravados no fecho para esta pessoa/)).toBeInTheDocument();
  });

  it("a pessoa sem linha gravada nao mostra «por hora feita»; com linha gravada mostra", async () => {
    estado.gravados = { estado: "ok", porPessoa: new Map(), antesDoRegisto: false };
    const semLinha = await renderAba();
    expect(screen.queryByText(/Custo por hora realmente feita/)).not.toBeInTheDocument();
    expect(screen.getByText(/Custo por hora prevista/)).toBeInTheDocument();
    semLinha.unmount();
    estado.gravados = { estado: "ok", porPessoa: new Map([["p-tiago", gravada("p-tiago")]]), antesDoRegisto: false };
    await renderAba();
    expect(screen.getByText(/Custo por hora realmente feita/)).toBeInTheDocument();
  });

  it("em ingles os mesmos avisos", async () => {
    window.localStorage.setItem("language", "en");
    estado.gravados = { estado: "ok", porPessoa: new Map(), antesDoRegisto: false };
    await renderAba();
    expect(screen.getByText(/No values saved at closing for this person/)).toBeInTheDocument();
    expect(screen.getByText(/only the hours and the pay are the ones saved/)).toBeInTheDocument();
  });
});

// ---- Estimativa pelo salario do cargo (so nos Custos): quem nao tem retribuicao vigente mas tem cargo com salario mensal ----

const PESSOA_C1 = { id: "p-tiago", nome_completo: "Tiago Pinheiro", cargo: null, cargo_id: "c1", local_id: null } as never;
const periodoCargo = (extra: Record<string, unknown> = {}) => ({
  id: "cp1", cargo_id: "c1", salario_base: 1500, periodicidade: "mensal", valido_de: "2026-01-01", valido_ate: null, motivo: null, ...extra,
});

// Hoje fixo (15/09/2026): a estimativa so vale para o mes corrente e futuros, por isso o relogio nao pode andar.
const fixarHoje = () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
};

describe("useCustoDaPessoa: estimativa pelo cargo", () => {
  beforeEach(() => {
    fixarHoje();
    estado.pessoa = { ...estado.pessoa, resultado: calculoReal(null) };
    estado.periodosCargo = [periodoCargo()];
  });

  afterEach(() => { vi.useRealTimers(); });

  it("mes passado ainda aberto nao estima: sem valor com a razao mes_passado; o corrente estima", () => {
    const passado = renderHook(() => useCustoDaPessoa(PESSOA_C1, "2026-08")).result.current.custo;
    expect(passado?.retribuicaoMes).toBeNull();
    expect(passado?.estimadoPeloCargo).toBeUndefined();
    expect(passado?.razaoSemValor).toBe("mes_passado");
    expect(passado?.atual.total).toBeNull();
    expect(renderHook(() => useCustoDaPessoa(PESSOA_C1, "2026-09")).result.current.custo?.estimadoPeloCargo).toBeDefined();
  });

  it("mes anterior ao primeiro periodo do cargo nao estima", () => {
    estado.periodosCargo = [periodoCargo({ valido_de: "2026-10-01" })];
    const custo = renderHook(() => useCustoDaPessoa(PESSOA_C1, "2026-09")).result.current.custo;
    expect(custo?.estimadoPeloCargo).toBeUndefined();
    expect(custo?.razaoSemValor).toBe("sem_periodo");
  });

  it("falha a ler os periodos dos cargos: nao estima e nao diz sem_periodo, diz que nao se leu", () => {
    estado.periodosErro = true;
    estado.periodosCargo = [];
    const custo = renderHook(() => useCustoDaPessoa(PESSOA_C1, MES)).result.current.custo;
    expect(custo?.estimadoPeloCargo).toBeUndefined();
    expect(custo?.razaoSemValor).toBe("erro_periodos");
  });

  it("com retribuicao vigente nao ha estimativa, mesmo havendo cargo com salario", () => {
    estado.pessoa = { ...estado.pessoa, resultado: calculoReal(1200) };
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA_C1, MES));
    expect(result.current.custo?.retribuicaoMes).toBe(1200);
    expect(result.current.custo?.estimadoPeloCargo).toBeUndefined();
  });

  it("sem retribuicao e com cargo mensal usa o salario do cargo, so o base, e marca-o", () => {
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA_C1, MES));
    expect(result.current.custo?.retribuicaoMes).toBe(1500);
    expect(result.current.custo?.estimadoPeloCargo).toEqual({ cargo: "Gerente", salario: 1500 });
    expect(result.current.custo?.atual.bruto).toBe(1500);
    expect(result.current.custo?.atual.total).not.toBeNull();
  });

  it("cargo com salario nao mensal: sem estimativa e com a razao", () => {
    estado.periodosCargo = [periodoCargo({ periodicidade: "hora" })];
    const { result } = renderHook(() => useCustoDaPessoa(PESSOA_C1, MES));
    expect(result.current.custo?.retribuicaoMes).toBeNull();
    expect(result.current.custo?.estimadoPeloCargo).toBeUndefined();
    expect(result.current.custo?.razaoSemValor).toBe("nao_mensal");
    expect(result.current.custo?.atual.total).toBeNull();
  });

  it("sem periodo de salario valido no mes: sem estimativa, razao sem_periodo; sem cargo: sem_cargo", () => {
    estado.periodosCargo = [];
    expect(renderHook(() => useCustoDaPessoa(PESSOA_C1, MES)).result.current.custo?.razaoSemValor).toBe("sem_periodo");
    estado.periodosCargo = [periodoCargo()];
    const semCargo = renderHook(() => useCustoDaPessoa(PESSOA, MES)).result.current.custo;
    expect(semCargo?.razaoSemValor).toBe("sem_cargo");
    expect(semCargo?.retribuicaoMes).toBeNull();
  });

  it("sem permissao para ver retribuicoes nao ha custo nem estimativa", () => {
    estado.pessoa = { ...estado.pessoa, retribuicaoRecusada: true };
    expect(renderHook(() => useCustoDaPessoa(PESSOA_C1, MES)).result.current.custo).toBeNull();
  });

  it("mes fechado nunca estima: sem linha gravada fica sem valor, e o gravado manda", () => {
    estado.pessoa = vivoProibido({ ...estado.pessoa, dados: dadosDoMes([], FECHADO) }, "resultado") as typeof estado.pessoa;
    estado.gravados = { estado: "ok", porPessoa: new Map(), antesDoRegisto: false };
    const semLinha = renderHook(() => useCustoDaPessoa(PESSOA_C1, MES)).result.current.custo;
    expect(semLinha?.retribuicaoMes).toBeNull();
    expect(semLinha?.estimadoPeloCargo).toBeUndefined();
    expect(semLinha?.razaoSemValor).toBeUndefined();
    estado.gravados = { estado: "ok", porPessoa: new Map([["p-tiago", gravada("p-tiago")]]), antesDoRegisto: false };
    const comLinha = renderHook(() => useCustoDaPessoa(PESSOA_C1, MES)).result.current.custo;
    expect(comLinha?.retribuicaoMes).toBe(1400);
    expect(comLinha?.estimadoPeloCargo).toBeUndefined();
  });
});

describe("useCustoDaOrganizacao: estimativa pelo cargo", () => {
  const pessoaActiva = (id: string, cargoId: string | null = "c1") => ({ id, nome_completo: `Pessoa ${id}`, cargo: null, cargo_id: cargoId, local_id: "l1" });
  const organizacao = (resultados: Map<string, unknown>) => ({
    pessoasActivas: [pessoaActiva("p-hugo"), pessoaActiva("p-ines"), pessoaActiva("p-sem", null)],
    resultados, retribuicoesHook: { recusado: false }, ...dadosDoMes(),
  });

  beforeEach(() => { fixarHoje(); estado.periodosCargo = [periodoCargo()]; });
  afterEach(() => { vi.useRealTimers(); });

  it("mes passado aberto nao estima ninguem; falha nos periodos diz que nao se leu; periodos a carregar contam como a carregar", () => {
    estado.organizacao = organizacao(new Map([["p-hugo", calculoReal(null)]]));
    const passado = renderHook(() => useCustoDaOrganizacao("2026-08")).result.current.linhas.find((l) => l.pessoaId === "p-hugo")!;
    expect(passado).toMatchObject({ retribuicao: null, razaoSemValor: "mes_passado" });
    expect(passado.estimadoPeloCargo).toBeUndefined();
    estado.periodosErro = true;
    expect(renderHook(() => useCustoDaOrganizacao(MES)).result.current.linhas.find((l) => l.pessoaId === "p-hugo")).toMatchObject({ retribuicao: null, razaoSemValor: "erro_periodos" });
    estado.periodosErro = false;
    expect(renderHook(() => useCustoDaOrganizacao(MES)).result.current.baseACarregar).toBe(false);
    estado.periodosACarregar = true;
    expect(renderHook(() => useCustoDaOrganizacao(MES)).result.current.baseACarregar).toBe(true);
  });

  it("quem nao tem retribuicao e tem cargo mensal e estimado; quem tem retribuicao nao; quem nao tem cargo fica sem valor com a razao", () => {
    estado.organizacao = organizacao(new Map([["p-hugo", calculoReal(null)], ["p-ines", calculoReal(1100)], ["p-sem", calculoReal(null)]]));
    const { linhas } = renderHook(() => useCustoDaOrganizacao(MES)).result.current;
    const por = (id: string) => linhas.find((l) => l.pessoaId === id)!;
    expect(por("p-hugo")).toMatchObject({ retribuicao: 1500, estimadoPeloCargo: { cargo: "Gerente", salario: 1500 } });
    expect(por("p-ines").retribuicao).toBe(1100);
    expect(por("p-ines").estimadoPeloCargo).toBeUndefined();
    expect(por("p-sem")).toMatchObject({ retribuicao: null, total: null, razaoSemValor: "sem_cargo" });
  });

  it("mes fechado nunca estima", () => {
    estado.organizacao = vivoProibido({ ...organizacao(new Map()), todasAsPessoas: [pessoaActiva("p-hugo")], ...dadosDoMes([], FECHADO) }, "resultados");
    estado.gravados = { estado: "ok", antesDoRegisto: false, porPessoa: new Map() };
    const { linhas } = renderHook(() => useCustoDaOrganizacao(MES)).result.current;
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.every((l) => l.estimadoPeloCargo === undefined && l.retribuicao === null)).toBe(true);
  });
});

describe("AbaCusto: estimativa pelo cargo", () => {
  const renderAba = async (aoMudarAba = vi.fn(), pessoa: never = PESSOA_C1) => {
    const { AbaCusto } = await import("./AbaCusto");
    render(
      <LanguageProvider>
        <AbaCusto pessoa={pessoa} ctx={{ nomePorPessoaId: new Map(), minhaPessoaId: null } as never} ficha={null as never} aoMudarAba={aoMudarAba} />
      </LanguageProvider>,
    );
    return aoMudarAba;
  };

  beforeEach(() => {
    fixarHoje();
    window.localStorage.setItem("language", "pt");
    definirMesCusto(MES);
    estado.pessoa = { ...estado.pessoa, resultado: calculoReal(null) };
    estado.periodosCargo = [periodoCargo()];
  });
  afterEach(() => { vi.useRealTimers(); });

  it("sem permissao de editar a retribuicao a nota aparece mas o botao «Definir retribuição» nao", async () => {
    estado.permissoes = [VER];
    await renderAba();
    expect(screen.getByText(/Estimativa pelo salário do cargo/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Definir retribuição" })).not.toBeInTheDocument();
  });

  it("o botao «Definir retribuição» tem o alvo de 44 px (min-h-11)", async () => {
    await renderAba();
    expect(screen.getByRole("button", { name: "Definir retribuição" }).className).toContain("min-h-11");
  });

  it("mes passado: diz porque nao se estima, sem nota de estimativa nem botao", async () => {
    definirMesCusto("2026-08");
    await renderAba();
    expect(screen.getByText("Mês passado: sem retribuição registada; o salário do cargo pode ter sido outro")).toBeInTheDocument();
    expect(screen.queryByText(/Estimativa pelo salário do cargo/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Definir retribuição" })).not.toBeInTheDocument();
  });

  it("falha a ler os periodos dos cargos: diz que nao foi possivel ler o salario, nunca «sem salário no cargo»", async () => {
    estado.periodosErro = true;
    estado.periodosCargo = [];
    await renderAba();
    expect(screen.getByText("Não foi possível ler o salário do cargo")).toBeInTheDocument();
    expect(screen.queryByText("Sem retribuição nem salário no cargo")).not.toBeInTheDocument();
  });

  it("mostra a nota (role status, em texto) e o botao «Definir retribuição» leva a aba dos contratos", async () => {
    const aoMudarAba = await renderAba();
    const nota = screen.getByText(/Estimativa pelo salário do cargo \(Gerente: .*1500,00.*\)\. Esta pessoa ainda não tem retribuição definida; sem duodécimos nem subsídios\./);
    expect(nota.closest("[role='status']")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Definir retribuição" }));
    expect(aoMudarAba).toHaveBeenCalledWith("contratos");
  });

  it("com retribuicao nao ha nota", async () => {
    estado.pessoa = { ...estado.pessoa, resultado: calculoReal(1200) };
    await renderAba();
    expect(screen.queryByText(/Estimativa pelo salário do cargo/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Definir retribuição" })).not.toBeInTheDocument();
  });

  it("sem retribuicao e sem cargo diz «Sem retribuição nem salário de cargo» e nao mostra a nota de estimativa", async () => {
    await renderAba(vi.fn(), PESSOA);
    expect(screen.getByText("Sem retribuição e sem cargo atribuído")).toBeInTheDocument();
    expect(screen.queryByText(/Estimativa pelo salário do cargo/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Sem valor").length).toBeGreaterThan(0);
  });

  it("cargo nao mensal: razao em texto, sem estimativa", async () => {
    estado.periodosCargo = [periodoCargo({ periodicidade: "semanal" })];
    await renderAba();
    expect(screen.getByText(/salário do cargo não é mensal/)).toBeInTheDocument();
    expect(screen.queryByText(/Estimativa pelo salário do cargo/)).not.toBeInTheDocument();
  });

  it("mes fechado nunca mostra a nota de estimativa", async () => {
    estado.pessoa = vivoProibido({ ...estado.pessoa, dados: dadosDoMes([], FECHADO) }, "resultado") as typeof estado.pessoa;
    estado.gravados = { estado: "ok", porPessoa: new Map(), antesDoRegisto: false };
    await renderAba();
    expect(screen.queryByText(/Estimativa pelo salário do cargo/)).not.toBeInTheDocument();
    expect(screen.queryByText("Sem retribuição e sem cargo atribuído")).not.toBeInTheDocument();
  });

  it("em ingles a nota e o botao", async () => {
    window.localStorage.setItem("language", "en");
    await renderAba();
    expect(screen.getByText(/Estimate based on the job salary/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set pay" })).toBeInTheDocument();
  });
});

// ---- As contas do mes, passo a passo, e o ecra sem valores de exemplo ----

describe("AbaCusto: as contas do mes", () => {
  const renderAba = async (pessoa: never = PESSOA_C1) => {
    const { AbaCusto } = await import("./AbaCusto");
    return render(
      <LanguageProvider>
        <AbaCusto pessoa={pessoa} ctx={{ nomePorPessoaId: new Map(), minhaPessoaId: null } as never} ficha={null as never} />
      </LanguageProvider>,
    );
  };
  const normal = (s: string | null | undefined) => (s ?? "").replace(/[\u00a0\u202f]/g, " ");
  const linhaDe = (rotulo: string | RegExp) => screen.getByRole("rowheader", { name: rotulo }).closest("tr") as HTMLElement;
  const KM = { tipo: "km", faixa: null, quantidade: 100, valor: 40 };

  beforeEach(() => {
    window.localStorage.setItem("language", "pt");
    definirMesCusto(MES);
    estado.cargos = [{ id: "c1", nome: "Gerente", seguro_acidentes_pct: 5 }];
    estado.pessoa = { ...estado.pessoa, resultado: calculoReal(1240, { linhasRegra: [KM] }), dados: dadosDoMes() };
  });

  it("mostra uma tabela com cabecalhos, as formulas, a TSU sem os km e o seguro de 5 % sobre o salario base", async () => {
    await renderAba();
    const tabela = screen.getByRole("table", { name: /Contas do custo de Tiago Pinheiro/ });
    expect(within(tabela).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Conta", "Como se calcula", "Valor"]);
    expect(normal(linhaDe("Quilómetros").textContent)).toContain("100 km × 0,40 € = 40,00 €");
    expect(normal(linhaDe("TSU da empresa").textContent)).toContain("23,75 % × 1 200,00 € = 285,00 €");
    expect(normal(linhaDe(/^Seguro de acidentes de trabalho/).textContent)).toContain("5 % × 1 200,00 € = 60,00 €");
    expect(normal(linhaDe(/Custo total/).textContent)).toContain("1585,00");
    expect(screen.getByText("A base da TSU é a retribuição do mês sem km nem ajudas de custo (dentro dos limites legais); inclui o subsídio de alimentação, o IHT e as horas extra. Confirme com a contabilidade.")).toBeInTheDocument();
  });

  it("cargo sem seguro: a linha do seguro diz «Sem seguro neste cargo» e vale 0", async () => {
    estado.cargos = [{ id: "c1", nome: "Gerente", seguro_acidentes_pct: null }];
    await renderAba();
    expect(linhaDe(/^Seguro de acidentes de trabalho/).textContent).toContain("Sem seguro neste cargo");
  });

  it("pessoa sem direito a km, ajudas e IHT: essas linhas nem aparecem", async () => {
    estado.pessoa = { ...estado.pessoa, resultado: calculoReal(1200) };
    await renderAba();
    for (const rotulo of ["Quilómetros", "Ajudas de custo", /IHT/]) expect(screen.queryByRole("rowheader", { name: rotulo })).not.toBeInTheDocument();
  });

  it("«Para comparar» substitui «Ao lado»: sem saldo do banco de horas nem valores de exemplo, com a formula dos 12 meses", async () => {
    await renderAba();
    expect(screen.getByText("Para comparar (não entra no custo do mês)")).toBeInTheDocument();
    expect(screen.queryByText("Ao lado")).not.toBeInTheDocument();
    expect(screen.queryByText(/banco de horas/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/exemplo/i)).not.toBeInTheDocument();
    expect(screen.getByText("Só o salário base repartido por 12 meses (14 ÷ 12) com TSU e seguro")).toBeInTheDocument();
    expect(screen.queryByText("Custo com os subsídios repartidos por 12 meses")).not.toBeInTheDocument();
    expect(screen.getByText(/salário base × 14 ÷ 12 \+ TSU \+ seguro/)).toBeInTheDocument();
    expect(screen.getByText(/NÃO inclui alimentação, horas extra, IHT, km, ajudas, manuais nem equipamentos/)).toBeInTheDocument();
  });

  it("o formulario so tem a taxa desta pessoa: sem taxa da empresa, seguro, km nem dia", async () => {
    await renderAba();
    expect(screen.getByLabelText(/Taxa desta pessoa \(%\)/)).toBeInTheDocument();
    for (const rotulo of [/Taxa da empresa/, /Seguro de acidentes de trabalho \(%\)/, /Valor por km/, /Valor por dia/]) expect(screen.queryByLabelText(rotulo)).not.toBeInTheDocument();
    expect(screen.queryByText(/são por organização/)).not.toBeInTheDocument();
  });

  it("mes fechado: as contas dizem que so mostram o gravado e usam as linhas gravadas (km incluidos)", async () => {
    estado.pessoa = vivoProibido({ ...estado.pessoa, dados: dadosDoMes([], FECHADO) }, "resultado") as typeof estado.pessoa;
    estado.gravados = {
      estado: "ok",
      porPessoa: new Map([["p-tiago", gravada("p-tiago", { total_bruto: 1240, totais: { base_mes: 1200, divisor_duodecimos: 14, lancamentos_pontuais: 0, total_regras: 40 }, linhas: [{ origem: "regra", valor: 40, tipo: "km", faixa: null, quantidade: 100 }] })]]),
      antesDoRegisto: false,
    };
    await renderAba();
    expect(screen.getByText("Num mês fechado só a retribuição e as horas são as gravadas no fecho; a TSU, o seguro e os equipamentos são os de hoje.")).toBeInTheDocument();
    expect(screen.queryByText(/Nada se recalcula/)).not.toBeInTheDocument();
    expect(normal(linhaDe("Quilómetros").textContent)).toContain("100 km × 0,40 € = 40,00 €");
    expect(normal(linhaDe("TSU da empresa").textContent)).toContain("23,75 % × 1 200,00 € = 285,00 €");
  });

  it("mes fechado: o seguro e o do cargo de HOJE (mudar o cargo depois do fecho muda a linha) e o ecra di-lo", async () => {
    const vivo = estado.pessoa;
    const gravar = () => {
      estado.pessoa = vivoProibido({ ...vivo, dados: dadosDoMes([], FECHADO) }, "resultado") as typeof estado.pessoa;
      estado.gravados = {
        estado: "ok",
        porPessoa: new Map([["p-tiago", gravada("p-tiago", { total_bruto: 1200, totais: { base_mes: 1200, divisor_duodecimos: 14, lancamentos_pontuais: 0, total_regras: 0 }, linhas: [] })]]),
        antesDoRegisto: false,
      };
    };
    gravar();
    const primeira = await renderAba();
    expect(normal(linhaDe(/^Seguro de acidentes de trabalho/).textContent)).toContain("5 % × 1 200,00 € = 60,00 €");
    primeira.unmount();
    estado.cargos = [{ id: "c1", nome: "Gerente", seguro_acidentes_pct: 3 }];
    gravar();
    await renderAba();
    expect(normal(linhaDe(/^Seguro de acidentes de trabalho/).textContent)).toContain("3 % × 1 200,00 € = 36,00 €");
    expect(screen.getByText(/a TSU, o seguro e os equipamentos são os de hoje/)).toBeInTheDocument();
  });

  it("mes fechado sem valores gravados: sem contas (nada se recalcula)", async () => {
    estado.pessoa = vivoProibido({ ...estado.pessoa, dados: dadosDoMes([], FECHADO) }, "resultado") as typeof estado.pessoa;
    estado.gravados = { estado: "ok", porPessoa: new Map(), antesDoRegisto: false };
    await renderAba();
    expect(screen.getByText("Sem retribuição registada: não há contas para mostrar.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("estimativa pelo cargo: so salario base, TSU e seguro sobre a estimativa, marcados como estimados", async () => {
    fixarHoje();
    estado.pessoa = { ...estado.pessoa, resultado: calculoReal(null) };
    estado.periodosCargo = [periodoCargo()];
    try {
      await renderAba();
      expect(screen.queryByRole("rowheader", { name: "Quilómetros" })).not.toBeInTheDocument();
      expect(normal(linhaDe(/^Seguro de acidentes de trabalho/).textContent)).toContain("5 % × 1 500,00 € = 75,00 €");
      expect(linhaDe("TSU da empresa").textContent).toContain("(estimado)");
      expect(screen.getByText(/Contas feitas sobre o salário estimado do cargo/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
