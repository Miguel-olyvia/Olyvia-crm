// O prazo para justificar e o fim do periodo da folha: o painel de faltas ja nao o configura nem avisa de «prazo nao
// disponivel», o detalhe da falta diz «Pode justificar ate ...» ou «Injustificada: o periodo fechou», e o calendario calcula
// com as regras do periodo. O wrapper do prazo esta simulado; nada toca em base nenhuma.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { fimDoPeriodoDoDia } from "@/lib/hr/periodoFolha";
import { prazoFalso, reporPrazoFalso } from "@/test/prazoJustificacaoFalso";
import type { Falta, PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";

vi.mock("@/components/rh-exemplo/hooks/usePrazoJustificacao", async () => (await import("@/test/prazoJustificacaoFalso")).wrapperFalso());

const aviso = vi.hoisted(() => ({ sucesso: vi.fn(), erro: vi.fn() }));
// As regras do periodo (o DescontoDaFaltaCard, dentro do detalhe, procura a folha que contem o dia da falta).
const periodoRegras = vi.hoisted(() => ({ regras: [] as Array<{ dia_inicio: number; valido_de: string }> }));
vi.mock("@/hooks/usePeriodoFolhaRegras", () => ({ usePeriodoFolhaRegras: () => ({ regras: periodoRegras.regras, estado: "ok", isLoading: false }) }));

vi.mock("@/lib/toast", () => ({ toast: { success: aviso.sucesso, error: aviso.erro } }));

vi.mock("@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa", () => ({
  useAssiduidadeDaPessoa: () => ({
    picagens: [], realizado: [], faltas: [], planeado: [], ausenciaAprovadaPorDia: new Map(), loading: false, saving: false,
    marcarFalta: vi.fn(), anularFalta: vi.fn(), registarJustificacao: vi.fn(), decidirJustificacao: vi.fn(),
    revelarJustificacao: vi.fn(), recarregar: vi.fn(),
  }),
  comoRealizadoComCorreccao: (l: unknown) => l,
}));
vi.mock("@/components/rh-exemplo/processamento/useCalculoReal", () => ({
  useCalculoRealDaPessoa: () => ({
    resultado: { resultado: { valorHoraReal: 6.25, baseMes: 1000 }, totais: { planeadoMinutos: 9600 } },
    aCarregar: false, retribuicaoRecusada: false, incompleta: false, periodoAberto: true, temPeriodo: true,
  }),
}));

import { renderHook } from "@testing-library/react";
import { situacoesDosDias, useSituacoesDoMes } from "@/components/rh-exemplo/calendarioPessoa/situacaoDoMes";
import type { DiaCalendario } from "@/components/rh-exemplo/calendarioPessoa/montarMes";
import { FaltaDetalhe } from "./FaltaDetalhe";
import { FaltasPainel } from "./FaltasPainel";

// As justificacoes do dia vivem na base: aqui a base e simulada (sem CompanyProvider e sem chamadas).
vi.mock("@/components/rh-exemplo/hooks/useJustificacoesDoDia", async () => (await import("@/test/justificacoesDoDiaFalso")).wrapperFalso());

const TUDO: PermissoesAssiduidade = {
  view: true, viewOwn: true, equipaView: true, picar: false, picarOutros: false, gerir: true, corrigir: true, faltasView: true,
  faltasEdit: true, justificacaoView: true, justificacaoEdit: true, validarRealizado: true, obrasRegistar: false,
};

// Terca 06/10/2099: sem regra o periodo e o mes de calendario (prazo 31/10/2099); com inicio a 22 acaba a 21/10/2099.
// Nunca chega, por isso o teste nao depende do dia de hoje.
const falta = (extra: Partial<Falta> = {}): Falta =>
  ({
    id: "falta-1", pessoa_id: "pessoa-a", organization_id: "org", data: "2099-10-06", planeado_id: null, vinculo_id: null,
    local_id: null, hora_inicio: "09:00:00", hora_fim: "13:00:00", minutos: 240, motivo_codigo: "assuntos_pessoais",
    justificacao_estado: "sem_justificacao", justificada: false, remunerada: false, desconta_saldo: false,
    justificacao_decidida_por: null, justificacao_decidida_em: null, justificacao_motivo: null, ausencia_dia_id: null,
    corrige_falta_id: null, correccao_motivo: null, estado: "activa", anulado_em: null, anulacao_motivo: null,
    created_at: "2099-10-06T10:00:00Z", ...extra,
  }) as Falta;

const painel = () =>
  render(
    <LanguageProvider>
      <FaltasPainel faltas={[]} desvios={[]} pessoas={[]} permissoes={TUDO} onAlterado={() => undefined} />
    </LanguageProvider>,
  );

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  periodoRegras.regras = [];
  reporPrazoFalso();
  aviso.sucesso.mockClear();
  aviso.erro.mockClear();
});
afterEach(cleanup);

const REGRA_22 = [{ dia_inicio: 22, valido_de: "2000-01-01" }];

describe("FaltasPainel: o prazo ja nao se configura", () => {
  it("nao tem o campo «Prazo para justificar (dias uteis)» nem o aviso de que o prazo nao esta disponivel", () => {
    painel();
    expect(screen.queryByLabelText(/Prazo para justificar/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Guardar prazo/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("rhb-prazo-aviso")).not.toBeInTheDocument();
    expect(screen.queryByText(/ainda não está disponível nesta base/)).not.toBeInTheDocument();
    expect(screen.queryByText(/dias úteis/)).not.toBeInTheDocument();
  });

  it("explica que o prazo e o fecho do periodo da folha", () => {
    painel();
    expect(screen.getByTestId("rhb-prazo-ajuda")).toHaveTextContent("fecho do período da folha");
  });

  it("o prazo nao esta no store dos fluxos B", async () => {
    const { lerFluxosB } = await import("@/components/rh-exemplo/dados/lojaFluxosB");
    expect(Object.keys(lerFluxosB())).not.toContain("prazoFaltaDias");
  });
});

describe("FaltaDetalhe: pode justificar ate ao fecho do periodo", () => {
  const detalhe = (f: Falta = falta()) =>
    render(
      <LanguageProvider>
        <FaltaDetalhe falta={f} nome="Ana Real" permissoes={TUDO} onFechar={() => undefined} />
      </LanguageProvider>,
    );

  it("sem regra: ate ao ultimo dia do mes (06/10 -> 31/10)", () => {
    detalhe();
    expect(screen.getByTestId("rhb-prazo-ate")).toHaveTextContent("Pode justificar até 31 de outubro de 2099");
  });

  it("com inicio a 22: 06/10 fecha a 21/10 e 22/10 so fecha a 21/11", () => {
    prazoFalso.regras = REGRA_22;
    const { unmount } = detalhe();
    expect(screen.getByTestId("rhb-prazo-ate")).toHaveTextContent("Pode justificar até 21 de outubro de 2099");
    unmount();
    detalhe(falta({ data: "2099-10-22" }));
    expect(screen.getByTestId("rhb-prazo-ate")).toHaveTextContent("Pode justificar até 21 de novembro de 2099");
  });

  it("depois do fecho diz «Injustificada: o periodo fechou» e ja nao diz ate quando", () => {
    detalhe(falta({ data: "2020-01-10" }));
    expect(screen.getByTestId("rhb-prazo-injustificada")).toHaveTextContent("Injustificada: o período fechou");
    expect(screen.queryByTestId("rhb-prazo-ate")).not.toBeInTheDocument();
  });
});

describe("FaltaDetalhe: a folha em que a falta cai (o desconto usa o periodo que CONTEM o dia)", () => {
  const detalhe = (f: Falta) =>
    render(
      <LanguageProvider>
        <FaltaDetalhe falta={f} nome="Ana Real" permissoes={TUDO} onFechar={() => undefined} />
      </LanguageProvider>,
    );

  it("uma falta a 25/10 com inicio a 22 cai na folha de NOVEMBRO (22/10 a 21/11), e sem regra na de outubro", () => {
    periodoRegras.regras = [{ dia_inicio: 22, valido_de: "2000-01-01" }];
    const { unmount } = detalhe(falta({ data: "2099-10-25" }));
    expect(screen.getByTestId("rhb-desconto-folha")).toHaveTextContent(/novembro/i);
    expect(screen.getByTestId("rhb-desconto-folha").textContent).toMatch(/22\D+10.*21\D+11/);
    unmount();
    periodoRegras.regras = [];
    detalhe(falta({ data: "2099-10-25" }));
    expect(screen.getByTestId("rhb-desconto-folha")).toHaveTextContent(/outubro/i);
  });
});

describe("calendario da pessoa: o mes inteiro calcula com o fecho do periodo", () => {
  // Quinta 08/10/2026 com uma falta sugerida: o que o calendario deixa justificar.
  const dia = (data: string): DiaCalendario =>
    ({
      data, diaSemana: 4, previsto: { intervalos: [], pausaMin: 0, minutos: 0 }, feitos: [], picagens: [], feitoMin: 0, deltaMin: null,
      atrasoMin: 0, chips: [{ tipo: "falta_sugerida", minutos: 120 }], faltas: [], horasExtra: [], banco: [], passado: true, hoje: false, semana: null,
    }) as unknown as DiaCalendario;
  const estado = (regras: typeof REGRA_22, hoje: string) =>
    situacoesDosDias([dia("2026-10-08")], [], (data) => fimDoPeriodoDoDia(data, regras), hoje).get("2026-10-08")?.situacao.estado;

  it("a mesma data muda de situacao com a regra: 08/10 fecha a 31/10 sem regra e a 21/10 com inicio a 22", () => {
    expect(estado([], "2026-10-21")).toBe("pode_justificar");
    expect(estado([], "2026-10-31")).toBe("pode_justificar");
    expect(estado([], "2026-11-01")).toBe("prazo_terminado");
    expect(estado(REGRA_22, "2026-10-21")).toBe("pode_justificar");
    expect(estado(REGRA_22, "2026-10-22")).toBe("prazo_terminado");
  });

  it("o hook do mes calcula com as regras e passa o prazo a cada dia", () => {
    // O «hoje» deste ecra de exemplo e fixo (14/10/2026): com inicio a 10, a folha de 08/10 fechou a 09/10.
    const semRegra = renderHook(() => useSituacoesDoMes("p-sofia", [dia("2026-10-08")]));
    expect(semRegra.result.current.situacoes.get("2026-10-08")?.situacao.estado).toBe("pode_justificar");
    prazoFalso.regras = [{ dia_inicio: 10, valido_de: "2000-01-01" }];
    const com10 = renderHook(() => useSituacoesDoMes("p-sofia", [dia("2026-10-08")]));
    expect(com10.result.current.situacoes.get("2026-10-08")?.situacao.estado).toBe("prazo_terminado");
  });
});