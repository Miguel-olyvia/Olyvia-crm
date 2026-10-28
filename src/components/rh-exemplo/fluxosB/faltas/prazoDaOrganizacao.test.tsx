// O prazo para justificar faltas e DA ORGANIZACAO: o campo do painel de faltas grava de verdade (so com permissao, de 1 a 30,
// com a falha visivel), e o detalhe da falta le o mesmo prazo. O wrapper do prazo esta simulado (a prova do hook real esta
// em src/hooks/__tests__/useRegrasAssiduidade.test.tsx); nada toca em base nenhuma.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { falharLeituraDoPrazo, prazoFalso, reporPrazoFalso } from "@/test/prazoJustificacaoFalso";
import type { Falta, PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";

vi.mock("@/components/rh-exemplo/hooks/usePrazoJustificacao", async () => (await import("@/test/prazoJustificacaoFalso")).wrapperFalso());

const aviso = vi.hoisted(() => ({ sucesso: vi.fn(), erro: vi.fn() }));
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

// Terca 06/10/2099: com 8 dias uteis o prazo acaba na sexta 16/10/2099 (nunca chega, o teste nao depende do dia de hoje).
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

const campo = () => screen.getByLabelText(/Prazo para justificar/) as HTMLInputElement;

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  reporPrazoFalso();
  aviso.sucesso.mockClear();
  aviso.erro.mockClear();
});
afterEach(cleanup);

describe("FaltasPainel: o campo do prazo da organizacao", () => {
  it("mostra o prazo lido da organizacao e explica que se aplica aos dias ainda por justificar", () => {
    prazoFalso.dias = 8;
    prazoFalso.gravado = true;
    painel();
    expect(campo().value).toBe("8");
    expect(campo()).not.toBeDisabled();
    expect(screen.getByText(/Aplica-se a partir de agora aos dias ainda por justificar/)).toBeInTheDocument();
  });

  it("escrever nao grava: so o botao Guardar grava, uma vez, com o valor escrito", async () => {
    painel();
    fireEvent.change(campo(), { target: { value: "8" } });
    expect(prazoFalso.gravados).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Guardar prazo" }));
    await waitFor(() => expect(prazoFalso.gravados).toEqual([8]));
    await waitFor(() => expect(aviso.sucesso).toHaveBeenCalledTimes(1));
  });

  it("o botao Guardar so fica activo quando o valor muda", () => {
    prazoFalso.dias = 5;
    painel();
    expect(screen.getByRole("button", { name: "Guardar prazo" })).toBeDisabled();
    fireEvent.change(campo(), { target: { value: "6" } });
    expect(screen.getByRole("button", { name: "Guardar prazo" })).not.toBeDisabled();
  });

  it.each(["0", "31", "2.5", ""])("recusa %s com mensagem visivel e sem chamar a base", async (valor) => {
    painel();
    fireEvent.change(campo(), { target: { value: valor } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar prazo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("entre 1 e 30");
    expect(prazoFalso.gravados).toEqual([]);
  });

  it("uma falha ao gravar fica visivel e o valor escrito nao se perde", async () => {
    prazoFalso.erroAoGravar = "rhRegrasAssid.erro.semPermissao";
    painel();
    fireEvent.change(campo(), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar prazo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não tem permissão para alterar o prazo.");
    expect(campo().value).toBe("9");
    expect(aviso.sucesso).not.toHaveBeenCalled();
  });

  it("sem permissao de configurar o campo fica desactivado, e diz porque", () => {
    prazoFalso.dias = 8;
    prazoFalso.podeAlterar = false;
    painel();
    expect(campo()).toBeDisabled();
    expect(campo().value).toBe("8");
    expect(screen.queryByRole("button", { name: "Guardar prazo" })).not.toBeInTheDocument();
    expect(screen.getByText(/Só quem gere a assiduidade pode alterar o prazo\./)).toBeInTheDocument();
  });

  it("com a leitura falhada diz que o 5 e so uma omissao para calcular, e nao deixa gravar", () => {
    falharLeituraDoPrazo("indisponivel");
    painel();
    expect(screen.getByTestId("rhb-prazo-aviso")).toHaveTextContent("Usam-se 5 dias úteis (a omissão) só para calcular");
    expect(campo()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Guardar prazo" })).not.toBeInTheDocument();
  });

  it("um erro de rede oferece tentar de novo, que manda reler o prazo", () => {
    falharLeituraDoPrazo("erro");
    painel();
    expect(screen.getByTestId("rhb-prazo-aviso")).toHaveTextContent("Não foi possível ler o prazo da organização");
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/i }));
    expect(prazoFalso.recarregados).toBe(1);
  });

  it("o campo ja nao vem de um valor em memoria: nao ha prazo no store dos fluxos B", async () => {
    const { lerFluxosB } = await import("@/components/rh-exemplo/dados/lojaFluxosB");
    expect(Object.keys(lerFluxosB())).not.toContain("prazoFaltaDias");
  });
});

describe("FaltaDetalhe: o prazo da organizacao", () => {
  const detalhe = () =>
    render(
      <LanguageProvider>
        <FaltaDetalhe falta={falta()} nome="Ana Real" permissoes={TUDO} onFechar={() => undefined} />
      </LanguageProvider>,
    );

  it("usa os dias da organizacao para a data limite: 8 dias uteis depois de 06/10 e 16/10", () => {
    prazoFalso.dias = 8;
    detalhe();
    expect(screen.getByText(/A organização dá 8 dias úteis para justificar, até 16\/10\/2099\./)).toBeInTheDocument();
  });

  it("com outro prazo o texto muda: 1 dia util e quarta 07/10", () => {
    prazoFalso.dias = 1;
    detalhe();
    expect(screen.getByText(/A organização dá 1 dias úteis para justificar, até 07\/10\/2099\./)).toBeInTheDocument();
  });

  it("com a leitura falhada o detalhe diz que o prazo mostrado e a omissao", () => {
    falharLeituraDoPrazo("indisponivel");
    detalhe();
    expect(screen.getByTestId("rhb-prazo-aviso")).toBeInTheDocument();
  });
});

describe("calendario da pessoa: o mes inteiro calcula com o prazo da organizacao", () => {
  // Quinta 08/10/2026 com uma falta sugerida: o que o calendario deixa justificar.
  const dia = (data: string): DiaCalendario =>
    ({
      data, diaSemana: 4, previsto: { intervalos: [], pausaMin: 0, minutos: 0 }, feitos: [], picagens: [], feitoMin: 0, deltaMin: null,
      atrasoMin: 0, chips: [{ tipo: "falta_sugerida", minutos: 120 }], faltas: [], horasExtra: [], banco: [], passado: true, hoje: false, semana: null,
    }) as unknown as DiaCalendario;
  const estado = (prazoDias: number, hoje: string) => situacoesDosDias([dia("2026-10-08")], [], prazoDias, hoje).get("2026-10-08")?.situacao.estado;

  it("a mesma data muda de situacao com o prazo: 14/10 esta dentro com 5 dias (prazo 15/10) e fora com 1 dia (prazo 09/10)", () => {
    expect(estado(5, "2026-10-14")).toBe("pode_justificar");
    expect(estado(1, "2026-10-14")).toBe("prazo_terminado");
    expect(estado(30, "2026-10-14")).toBe("pode_justificar");
    expect(estado(5, "2026-10-16")).toBe("prazo_terminado");
    expect(estado(8, "2026-10-16")).toBe("pode_justificar");
  });

  it("o hook do mes le o prazo UMA vez e passa-o a cada dia", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T12:00:00"));
    try {
      prazoFalso.dias = 1;
      const pouco = renderHook(() => useSituacoesDoMes("p-sofia", [dia("2026-10-08")]));
      expect(pouco.result.current.situacoes.get("2026-10-08")?.situacao.estado).toBe("prazo_terminado");
      prazoFalso.dias = 30;
      const muito = renderHook(() => useSituacoesDoMes("p-sofia", [dia("2026-10-08")]));
      expect(muito.result.current.situacoes.get("2026-10-08")?.situacao.estado).toBe("pode_justificar");
    } finally {
      vi.useRealTimers();
    }
  });
});
