// Configuração > «Período da folha»: a regra em vigor com o exemplo vivo, o histórico, o aviso de transição antes de gravar,
// gravar, o erro da base traduzido, só leitura sem permissão e a base ainda sem as RPCs. Base simulada (só `hrRpc`);
// o hook e as contas do período são os reais.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/hr/hrDb", async () => {
  const real = await vi.importActual<typeof import("@/lib/hr/hrDb")>("@/lib/hr/hrDb");
  return { ...real, hrRpc: (...a: unknown[]) => m.rpc(...a) };
});
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-nike" } }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ConfiguracaoPeriodoFolha } from "./ConfiguracaoPeriodoFolha";

interface Linha {
  id: string;
  dia_inicio: number;
  valido_de: string;
  em_vigor: boolean;
  criada_em: string;
  criada_por_nome: string | null;
  substituida_em: string | null;
}
const REGRA_22: Linha = { id: "r2", dia_inicio: 22, valido_de: "2026-01-01", em_vigor: true, criada_em: "2025-12-01T10:00:00Z", criada_por_nome: "Ana Reis", substituida_em: null };
const REGRA_1: Linha = { id: "r1", dia_inicio: 1, valido_de: "2025-01-01", em_vigor: false, criada_em: "2024-12-01T10:00:00Z", criada_por_nome: null, substituida_em: null };

const REGRA_AGENDADA: Linha = { id: "r3", dia_inicio: 5, valido_de: "2026-12-01", em_vigor: false, criada_em: "2026-10-01T10:00:00Z", criada_por_nome: null, substituida_em: null };

let linhas: Linha[];
let respostaListar: { data?: unknown; error?: unknown };
let respostaGuardar: () => Promise<{ data?: unknown; error?: unknown }>;
const chamadas = (fn: string) => m.rpc.mock.calls.filter(([nome]) => nome === fn);

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => {
  // Só o relógio de Date: o `waitFor` e o react-query continuam com os temporizadores reais.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
  window.localStorage.setItem("language", "pt");
  linhas = [REGRA_22, REGRA_1];
  respostaListar = { data: linhas, error: null };
  respostaGuardar = async () => ({ data: null, error: null });
  m.rpc.mockReset();
  m.rpc.mockImplementation(async (fn: string) => (fn === "rpc_hr_periodo_folha_regras_listar" ? respostaListar : respostaGuardar()));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const abrir = (podeGerir = true) =>
  render(
    <LanguageProvider>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ConfiguracaoPeriodoFolha podeGerir={podeGerir} />
      </QueryClientProvider>
    </LanguageProvider>,
  );
const campoDia = () => screen.getByLabelText("Dia em que a folha começa") as HTMLSelectElement;
const campoMes = () => screen.getByLabelText("Vale a partir da folha de") as HTMLSelectElement;
const guardar = () => screen.getByRole("button", { name: "Guardar regra" }) as HTMLButtonElement;
const esperarRegra = () => screen.findByTestId("periodo-folha-em-vigor");

describe("ConfiguracaoPeriodoFolha: ler", () => {
  it("lê a regra em vigor e mostra a frase e o exemplo vivo da próxima folha", async () => {
    abrir();
    const vigor = await esperarRegra();
    expect(vigor).toHaveTextContent("A folha começa no dia 22 de cada mês e acaba no dia anterior ao do mês seguinte");
    expect(vigor).toHaveTextContent("A folha de novembro de 2026 vai de 22/10/2026 a 21/11/2026.");
    expect(vigor).toHaveTextContent("Folha em curso: A folha de novembro de 2026 vai de 22/10/2026 a 21/11/2026.");
    expect(vigor).toHaveTextContent("Próxima folha: A folha de dezembro de 2026 vai de 22/11/2026 a 21/12/2026.");
    expect(chamadas("rpc_hr_periodo_folha_regras_listar")[0][1]).toEqual({ _organization_id: "org-nike" });
  });

  it("com o dia 1 diz que a folha é o mês de calendário", async () => {
    respostaListar = { data: [{ ...REGRA_22, dia_inicio: 1 }], error: null };
    abrir();
    expect(await esperarRegra()).toHaveTextContent("A folha é o mês de calendário: começa no dia 1 e acaba no último dia do mês.");
  });

  it("explica que o subsídio de férias e de Natal é pago no mês do nome da folha", async () => {
    abrir();
    await esperarRegra();
    expect(
      screen.getByText(
        "O mês de pagamento dos subsídios de férias e de Natal é o do nome da folha (o mês em que a folha termina): com início no dia 22, a folha de novembro termina a 21/11 e é a que paga o subsídio de novembro.",
      ),
    ).toBeInTheDocument();
  });

  it("sem regra gravada diz que vale o mês de calendário e não inventa um dia nem um exemplo", async () => {
    respostaListar = { data: [], error: null };
    abrir();
    const vigor = await esperarRegra();
    expect(vigor).toHaveTextContent("Ainda não há regra gravada: vale o mês de calendário");
    expect(vigor).not.toHaveTextContent("vai de");
  });

  it("mostra o histórico das regras com a data de efeito, a mais recente primeiro", async () => {
    abrir();
    const historico = await screen.findByRole("region", { name: "Histórico de regras" });
    const itens = within(historico).getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(itens[0]).toHaveTextContent("A partir da folha de janeiro de 2026: início a 22");
    expect(itens[0]).toHaveTextContent("por Ana Reis");
    expect(itens[0]).toHaveTextContent("Em vigor");
    expect(itens[1]).toHaveTextContent("A partir da folha de janeiro de 2025: mês de calendário (início no dia 1)");
  });

  it("uma regra substituída aparece como substituída e não como em vigor", async () => {
    respostaListar = { data: [REGRA_22, { ...REGRA_1, id: "r0", dia_inicio: 5, valido_de: "2026-01-01", substituida_em: "2025-12-02T00:00:00Z" }], error: null };
    abrir();
    const historico = await screen.findByRole("region", { name: "Histórico de regras" });
    expect(within(historico).getByText(/substituída|substituida/i)).toBeInTheDocument();
  });

  it("o histórico segue a ordem que a base devolve, sem reordenar por data de criação", async () => {
    const maisAntiga = { ...REGRA_1, id: "a", dia_inicio: 7, valido_de: "2026-01-01", criada_em: "2025-01-01T10:00:00Z" };
    const maisNova = { ...REGRA_1, id: "b", dia_inicio: 9, valido_de: "2026-01-01", criada_em: "2025-06-01T10:00:00Z" };
    respostaListar = { data: [maisAntiga, maisNova], error: null };
    abrir();
    const itens = within(await screen.findByRole("region", { name: "Histórico de regras" })).getAllByRole("listitem");
    expect(itens[0]).toHaveTextContent("início a 7");
    expect(itens[1]).toHaveTextContent("início a 9");
  });

  it("uma regra agendada leva a etiqueta «agendada»; as antigas e a em vigor não", async () => {
    respostaListar = { data: [REGRA_AGENDADA, REGRA_22, REGRA_1], error: null };
    abrir();
    const itens = within(await screen.findByRole("region", { name: "Histórico de regras" })).getAllByRole("listitem");
    expect(itens).toHaveLength(3);
    expect(itens[0]).toHaveTextContent("agendada");
    expect(itens[1]).not.toHaveTextContent("agendada");
    expect(itens[2]).not.toHaveTextContent("agendada");
  });

  it("enquanto lê mostra o carregamento e nenhum valor", async () => {
    m.rpc.mockImplementation(() => new Promise(() => {}));
    abrir();
    expect(await screen.findByRole("status")).toHaveTextContent("A carregar");
    expect(screen.queryByTestId("periodo-folha-em-vigor")).toBeNull();
    expect(screen.queryByLabelText("Dia em que a folha começa")).toBeNull();
  });
});

describe("ConfiguracaoPeriodoFolha: estados sem dados", () => {
  it("RPC ainda não aplicada: uma linha calma, sem alerta nem formulário nem valores", async () => {
    respostaListar = { data: null, error: { code: "PGRST202", message: "Could not find the function public.rpc_hr_periodo_folha_regras_listar" } };
    abrir();
    expect(await screen.findByTestId("periodo-folha-indisponivel")).toHaveTextContent("Disponível depois da próxima atualização da base.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByLabelText("Dia em que a folha começa")).toBeNull();
    expect(screen.queryByTestId("periodo-folha-em-vigor")).toBeNull();
  });

  it("leitura recusada: um estado, sem formulário", async () => {
    respostaListar = { data: null, error: { code: "42501", message: "periodo_folha_sem_permissao: ver" } };
    abrir();
    expect(await screen.findByText("Não tem permissão para ver o período da folha.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Dia em que a folha começa")).toBeNull();
  });

  it("falha de leitura: alerta com «Tentar de novo», que volta a ler", async () => {
    respostaListar = { data: null, error: { code: "XX000", message: "boom" } };
    abrir();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível ler as regras do período da folha");
    respostaListar = { data: linhas, error: null };
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await esperarRegra()).toHaveTextContent("dia 22");
  });
});

describe("ConfiguracaoPeriodoFolha: mudar o dia", () => {
  it("o seletor vai de 1 a 28, com «1 = mês de calendário», rótulos associados e alvos de 44 px", async () => {
    abrir();
    await esperarRegra();
    const opcoes = Array.from(campoDia().options);
    expect(opcoes).toHaveLength(28);
    expect(opcoes[0]).toHaveTextContent("1 (mês de calendário)");
    expect(opcoes[27].value).toBe("28");
    expect(campoDia().value).toBe("22");
    expect(campoDia().className).toContain("min-h-11");
    expect(campoMes().className).toContain("min-h-11");
    expect(guardar().className).toContain("min-h-11");
  });

  it("o mês de partida começa no mês seguinte ao de hoje (Lisboa) e há 12 para escolher", async () => {
    abrir();
    await esperarRegra();
    expect(campoMes().options).toHaveLength(12);
    expect(campoMes().value).toBe("2026-11-01");
    expect(campoMes().options[0]).toHaveTextContent("novembro de 2026");
  });

  it("Guardar está desactivado enquanto nada mudou", async () => {
    abrir();
    await esperarRegra();
    expect(guardar()).toBeDisabled();
    fireEvent.change(campoDia(), { target: { value: "5" } });
    expect(guardar()).toBeEnabled();
    fireEvent.change(campoDia(), { target: { value: "22" } });
    expect(guardar()).toBeDisabled();
  });

  it("antes de gravar avisa da transição, com as datas concretas da primeira folha", async () => {
    abrir();
    await esperarRegra();
    const avisos = screen.getByTestId("periodo-folha-avisos");
    expect(avisos).toHaveTextContent("A primeira folha depois da mudança é de transição");
    expect(avisos).toHaveTextContent("Não altera períodos já abertos ou fechados");
    expect(screen.queryByTestId("periodo-folha-previsao")).toBeNull();

    fireEvent.change(campoDia(), { target: { value: "5" } });
    expect(screen.getByTestId("periodo-folha-previsao")).toHaveTextContent(
      "A folha de novembro de 2026 será de transição: vai de 22/10/2026 a 04/11/2026.",
    );
  });

  it("grava o dia escolhido a partir do mês escolhido, confirma e volta a ler", async () => {
    abrir();
    await esperarRegra();
    fireEvent.change(campoDia(), { target: { value: "5" } });
    fireEvent.change(campoMes(), { target: { value: "2026-12-01" } });
    fireEvent.click(guardar());
    await waitFor(() => expect(chamadas("rpc_hr_periodo_folha_regra_guardar")).toHaveLength(1));
    expect(chamadas("rpc_hr_periodo_folha_regra_guardar")[0][1]).toEqual({ _organization_id: "org-nike", _dia_inicio: 5, _valido_de: "2026-12-01" });
    expect(await screen.findByRole("status")).toHaveTextContent("Regra do período da folha guardada. A regra vale a partir da folha de dezembro de 2026.");
    await waitFor(() => expect(chamadas("rpc_hr_periodo_folha_regras_listar").length).toBeGreaterThanOrEqual(2));
  });

  it("com uma regra agendada, voltar ao dia em vigor a partir desse mês grava-se e não leva aviso de transição", async () => {
    respostaListar = { data: [REGRA_AGENDADA, REGRA_22, REGRA_1], error: null };
    abrir();
    await esperarRegra();
    fireEvent.change(campoMes(), { target: { value: "2026-12-01" } });
    // O dia 22 já vale hoje, mas em dezembro a regra agendada diz 5: gravar 22 desfaz-a.
    expect(guardar()).toBeEnabled();
    expect(screen.queryByTestId("periodo-folha-previsao")).toBeNull();
    fireEvent.change(campoDia(), { target: { value: "5" } });
    // 5 é o que já vale em dezembro: nada a gravar.
    expect(guardar()).toBeDisabled();
    fireEvent.change(campoDia(), { target: { value: "22" } });
    fireEvent.click(guardar());
    await waitFor(() => expect(chamadas("rpc_hr_periodo_folha_regra_guardar")).toHaveLength(1));
    expect(chamadas("rpc_hr_periodo_folha_regra_guardar")[0][1]).toEqual({ _organization_id: "org-nike", _dia_inicio: 22, _valido_de: "2026-12-01" });
  });

  it("dois cliques seguidos em Guardar gravam uma só vez", async () => {
    respostaGuardar = () => new Promise(() => {});
    abrir();
    await esperarRegra();
    fireEvent.change(campoDia(), { target: { value: "5" } });
    const botao = guardar();
    act(() => {
      fireEvent.click(botao);
      fireEvent.click(botao);
    });
    await waitFor(() => expect(chamadas("rpc_hr_periodo_folha_regra_guardar")).toHaveLength(1));
  });

  it("o contentor de estado existe sempre, vazio até gravar", async () => {
    abrir();
    await esperarRegra();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("os meses oferecidos acompanham o dia de hoje, não ficam congelados na montagem", async () => {
    abrir();
    await esperarRegra();
    expect(campoMes().options[0]).toHaveTextContent("novembro de 2026");
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
    fireEvent.change(campoDia(), { target: { value: "6" } });
    expect(campoMes().options[0]).toHaveTextContent("dezembro de 2026");
  });

  it("enquanto grava o botão fica desactivado (não grava duas vezes)", async () => {
    respostaGuardar = () => new Promise(() => {});
    abrir();
    await esperarRegra();
    fireEvent.change(campoDia(), { target: { value: "5" } });
    fireEvent.click(guardar());
    await waitFor(() => expect(guardar()).toBeDisabled());
    fireEvent.click(guardar());
    expect(chamadas("rpc_hr_periodo_folha_regra_guardar")).toHaveLength(1);
  });

  it("um erro da base aparece traduzido, anunciado, e o formulário mantém o que a pessoa escolheu", async () => {
    respostaGuardar = async () => ({ data: null, error: { code: "P0001", message: "periodo_folha_regra_retroactiva: mes passado" } });
    abrir();
    await esperarRegra();
    fireEvent.change(campoDia(), { target: { value: "5" } });
    fireEvent.click(guardar());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Esse mês não serve");
    expect(alerta).not.toHaveTextContent("periodo_folha_regra_retroactiva");
    expect(campoDia().value).toBe("5");
    expect(screen.queryByText("Regra do período da folha guardada.")).toBeNull();
  });

  it("uma recusa de permissão ao gravar diz-o em palavras", async () => {
    respostaGuardar = async () => ({ data: null, error: { code: "42501", message: "periodo_folha_sem_permissao: mudar" } });
    abrir();
    await esperarRegra();
    fireEvent.change(campoDia(), { target: { value: "5" } });
    fireEvent.click(guardar());
    expect(await screen.findByRole("alert")).toHaveTextContent("Não tem permissão para mudar o período da folha.");
  });
});

describe("ConfiguracaoPeriodoFolha: abertura e fecho, sem intervalo entre folhas", () => {
  const campoFecho = () => screen.getByLabelText("Dia em que a folha fecha") as HTMLSelectElement;

  it("mostra sempre os dois dias: abre a 22 e fecha a 21, ambos em selects com rótulo e alvos de 44 px", async () => {
    abrir();
    await esperarRegra();
    expect(campoDia().value).toBe("22");
    expect(campoFecho().value).toBe("21");
    expect(campoFecho().className).toContain("min-h-11");
    const opcoes = Array.from(campoFecho().options);
    expect(opcoes).toHaveLength(28);
    expect(opcoes[0].value).toBe("fim");
    expect(opcoes[0]).toHaveTextContent("Último dia do mês");
    expect(opcoes[27].value).toBe("27");
    expect(opcoes.map((o) => o.value)).not.toContain("28");
  });

  it("abertura no dia 1 fecha no último dia do mês", async () => {
    respostaListar = { data: [{ ...REGRA_22, dia_inicio: 1 }], error: null };
    abrir();
    await esperarRegra();
    expect(campoFecho().value).toBe("fim");
  });

  it("escolher o fecho deduz a abertura (fecho 4 abre 5; último dia do mês abre 1) e grava o dia de abertura", async () => {
    abrir();
    await esperarRegra();
    fireEvent.change(campoFecho(), { target: { value: "4" } });
    expect(campoDia().value).toBe("5");
    expect(screen.getByTestId("periodo-folha-previsao")).toHaveTextContent("vai de 22/10/2026 a 04/11/2026");
    fireEvent.change(campoFecho(), { target: { value: "fim" } });
    expect(campoDia().value).toBe("1");
    fireEvent.change(campoFecho(), { target: { value: "4" } });
    fireEvent.click(guardar());
    await waitFor(() => expect(chamadas("rpc_hr_periodo_folha_regra_guardar")).toHaveLength(1));
    expect(chamadas("rpc_hr_periodo_folha_regra_guardar")[0][1]).toEqual({ _organization_id: "org-nike", _dia_inicio: 5, _valido_de: "2026-11-01" });
  });

  it("escolher a abertura deduz o fecho (abre 1 fecha no último dia; abre 6 fecha 5)", async () => {
    abrir();
    await esperarRegra();
    fireEvent.change(campoDia(), { target: { value: "1" } });
    expect(campoFecho().value).toBe("fim");
    fireEvent.change(campoDia(), { target: { value: "6" } });
    expect(campoFecho().value).toBe("5");
  });

  it("diz em texto, anunciado, o que está a ser deduzido, e que a folha só pode abrir até ao dia 28", async () => {
    abrir();
    await esperarRegra();
    const deduzido = screen.getByTestId("periodo-folha-deduzido");
    expect(deduzido).toHaveAttribute("aria-live", "polite");
    fireEvent.change(campoDia(), { target: { value: "6" } });
    expect(deduzido).toHaveTextContent("O fecho deduz-se da abertura: a folha que abre no dia 6 fecha no dia 5, sem intervalo entre folhas.");
    fireEvent.change(campoFecho(), { target: { value: "9" } });
    expect(deduzido).toHaveTextContent("A abertura deduz-se do fecho: a folha que fecha no dia 9 abre no dia 10, sem intervalo entre folhas.");
    fireEvent.change(campoFecho(), { target: { value: "fim" } });
    expect(deduzido).toHaveTextContent("a folha que fecha no último dia do mês abre no dia 1");
    expect(campoFecho().getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(campoFecho().getAttribute("aria-describedby") as string)).toHaveTextContent(
      "A folha só pode abrir até ao dia 28",
    );
  });

  it("extremos: abre 28 fecha 27, fecha 27 abre 28, e o contrário", async () => {
    abrir();
    await esperarRegra();
    fireEvent.change(campoDia(), { target: { value: "28" } });
    expect(campoFecho().value).toBe("27");
    fireEvent.change(campoDia(), { target: { value: "2" } });
    fireEvent.change(campoFecho(), { target: { value: "27" } });
    expect(campoDia().value).toBe("28");
    fireEvent.change(campoFecho(), { target: { value: "1" } });
    expect(campoDia().value).toBe("2");
    fireEvent.change(campoDia(), { target: { value: "28" } });
    expect(campoFecho().value).toBe("27");
  });

  it("depois de gravar pelo select de fecho, o texto volta a dizer que o fecho se deduz da abertura", async () => {
    abrir();
    await esperarRegra();
    fireEvent.change(campoFecho(), { target: { value: "4" } });
    expect(screen.getByTestId("periodo-folha-deduzido")).toHaveTextContent("A abertura deduz-se do fecho");
    fireEvent.click(guardar());
    await screen.findByText(/Regra do período da folha guardada/);
    expect(screen.getByTestId("periodo-folha-deduzido")).toHaveTextContent("O fecho deduz-se da abertura");
  });

  it("o exemplo mostra abertura e fecho com datas completas e o estado é só leitura sem permissão (sem o select de fecho)", async () => {
    abrir(false);
    expect(await esperarRegra()).toHaveTextContent("vai de 22/10/2026 a 21/11/2026");
    expect(screen.queryByLabelText("Dia em que a folha fecha")).toBeNull();
  });
});

describe("ConfiguracaoPeriodoFolha: sem permissão de gerir", () => {
  it("só leitura: mostra a regra e o histórico, sem controlos, com o motivo em texto", async () => {
    abrir(false);
    expect(await esperarRegra()).toHaveTextContent("dia 22");
    expect(screen.queryByLabelText("Dia em que a folha começa")).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar regra" })).toBeNull();
    expect(screen.queryByTestId("periodo-folha-avisos")).toBeNull();
    expect(screen.getByText("Só quem gere o período da folha pode alterar esta regra.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Histórico de regras" })).toBeInTheDocument();
  });
});
