// Configuração do pagamento dos subsídios de férias e de Natal: ligar com data, meses, desligar, erros da base traduzidos,
// só leitura sem permissão de gerir, RPC por aplicar. Base simulada (só `hrRpc`); o hook e o cliente das RPCs são os reais.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), semOrganizacao: false }));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: (...a: unknown[]) => m.rpc(...a) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: m.semOrganizacao ? null : { id: "org-nike" } }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { rhExemploSubsidiosTranslations } from "@/translations/rhExemploSubsidios";
import { dataHaMeses, hojeLisboa } from "@/lib/hr/horasExtraBase";
import { ConfiguracaoSubsidios } from "./ConfiguracaoSubsidios";

interface Linha { tem_config: boolean; ativo_desde: string | null; ferias_mes: number; natal_mes: number; folhas_fechadas_desde: string | null; ultima_folha_fechada_ate: string | null }
const DESLIGADA: Linha = { tem_config: false, ativo_desde: null, ferias_mes: 6, natal_mes: 11, folhas_fechadas_desde: null, ultima_folha_fechada_ate: null };
const LIGADA: Linha = { tem_config: true, ativo_desde: "2026-01-01", ferias_mes: 6, natal_mes: 11, folhas_fechadas_desde: null, ultima_folha_fechada_ate: null };

let linha: Linha;
let respostaGuardar: { data?: unknown; error?: unknown };
const guardadas = () => m.rpc.mock.calls.filter(([fn]) => fn === "rpc_hr_subsidios_config_guardar");

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  linha = DESLIGADA;
  m.semOrganizacao = false;
  respostaGuardar = { data: { alterada: true, ativo_desde: "2026-12-01", ferias_mes: 6, natal_mes: 11 }, error: null };
  m.rpc.mockReset();
  m.rpc.mockImplementation(async (fn: string) => (fn === "rpc_hr_subsidios_config_ler" ? { data: linha, error: null } : respostaGuardar));
});
afterEach(cleanup);

const abrir = (podeGerir = true) =>
  render(
    <LanguageProvider>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ConfiguracaoSubsidios podeGerir={podeGerir} />
      </QueryClientProvider>
    </LanguageProvider>,
  );
const interruptor = () => screen.getByRole("switch", { name: "Pagar os subsídios de férias e de Natal" });
const data = () => screen.getByLabelText("Data de início") as HTMLInputElement;
const mesFerias = () => screen.getByLabelText("Mês de pagamento do subsídio de férias") as HTMLSelectElement;
const mesNatal = () => screen.getByLabelText("Mês de pagamento do subsídio de Natal") as HTMLSelectElement;
const guardar = () => screen.getByRole("button", { name: "Guardar" });
const pronto = async () => { await screen.findByTestId("subs-cfg-estado"); };

describe("traduções da configuração dos subsídios", () => {
  it("en e pt têm as mesmas chaves rhSubs.cfg.*, incluindo os 12 meses", () => {
    const chaves = (l: "en" | "pt") => Object.keys(rhExemploSubsidiosTranslations[l]).filter((k) => k.startsWith("rhSubs.cfg.")).sort();
    expect(chaves("en")).toEqual(chaves("pt"));
    expect(chaves("pt").filter((k) => k.startsWith("rhSubs.cfg.mes.")).length).toBe(12);
    expect(chaves("pt").length).toBeGreaterThan(20);
  });
});

describe("configuração dos subsídios: leitura", () => {
  it("desligada por omissão: junho e novembro, a regra explicada e Guardar inactivo", async () => {
    abrir();
    await pronto();
    expect(m.rpc).toHaveBeenCalledWith("rpc_hr_subsidios_config_ler", { p_organization_id: "org-nike" });
    expect(screen.getByTestId("subs-cfg-estado")).toHaveTextContent(/Desligado/);
    expect(interruptor()).toHaveAttribute("aria-checked", "false");
    expect(mesFerias().value).toBe("6");
    expect(mesNatal().value).toBe("11");
    expect(screen.getByText(/A quem tem os duodécimos a 0 %, paga-se o subsídio inteiro nesse mês; a 50 %, metade; a 100 %, nada/)).toBeInTheDocument();
    expect(screen.getByText(/Quem entrou durante o ano recebe o proporcional aos dias de contrato/)).toBeInTheDocument();
    expect(screen.getByText(/duodécimos por definir não recebe e aparece um aviso/)).toBeInTheDocument();
    expect(guardar()).toHaveAttribute("aria-disabled", "true");
  });

  it("ligada: mostra desde quando, os meses e as folhas fechadas", async () => {
    linha = { ...LIGADA, ferias_mes: 7, natal_mes: 12, folhas_fechadas_desde: "2026-02-01", ultima_folha_fechada_ate: "2026-09-30" };
    abrir();
    await pronto();
    expect(screen.getByTestId("subs-cfg-estado")).toHaveTextContent("Ligado: paga a partir de 01/01/2026. Férias em julho, Natal em dezembro.");
    expect(screen.getByTestId("subs-cfg-folhas")).toHaveTextContent(/01\/02\/2026/);
    expect(screen.getByTestId("subs-cfg-folhas")).toHaveTextContent(/30\/09\/2026/);
    expect(interruptor()).toHaveAttribute("aria-checked", "true");
    expect(data().value).toBe("2026-01-01");
  });
});

describe("configuração dos subsídios: gravar", () => {
  it("liga com data: grava a data e os meses por omissão, confirma em texto e foca o estado", async () => {
    abrir();
    await pronto();
    fireEvent.click(interruptor());
    fireEvent.change(data(), { target: { value: "2026-12-01" } });
    expect(guardar()).not.toHaveAttribute("aria-disabled");
    linha = { ...LIGADA, ativo_desde: "2026-12-01" };
    fireEvent.click(guardar());
    await waitFor(() => expect(guardadas()).toHaveLength(1));
    expect(guardadas()[0][1]).toEqual({ p_organization_id: "org-nike", p_ativo_desde: "2026-12-01", p_ferias_mes: 6, p_natal_mes: 11 });
    expect(await screen.findByTestId("subs-cfg-resultado")).toHaveTextContent("Configuração guardada.");
    await waitFor(() => expect(screen.getByTestId("subs-cfg-estado")).toHaveTextContent("Ligado: paga a partir de 01/12/2026"));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("subs-cfg-estado")));
    expect(guardar()).toHaveAttribute("aria-disabled", "true");
  });

  it("muda os meses sem mexer na data", async () => {
    linha = LIGADA;
    abrir();
    await pronto();
    fireEvent.change(mesFerias(), { target: { value: "7" } });
    fireEvent.change(mesNatal(), { target: { value: "12" } });
    fireEvent.click(guardar());
    await waitFor(() => expect(guardadas()).toHaveLength(1));
    expect(guardadas()[0][1]).toEqual({ p_organization_id: "org-nike", p_ativo_desde: "2026-01-01", p_ferias_mes: 7, p_natal_mes: 12 });
  });

  it("desliga (sem folhas fechadas): grava a data nula", async () => {
    linha = LIGADA;
    abrir();
    await pronto();
    fireEvent.click(interruptor());
    expect(screen.queryByLabelText("Data de início")).toBeNull();
    fireEvent.click(guardar());
    await waitFor(() => expect(guardadas()).toHaveLength(1));
    expect(guardadas()[0][1]).toMatchObject({ p_ativo_desde: null, p_ferias_mes: 6, p_natal_mes: 11 });
  });

  it("a base diz que nada mudou: «Sem alteração»", async () => {
    linha = LIGADA;
    respostaGuardar = { data: { alterada: false, ativo_desde: "2026-01-01", ferias_mes: 7, natal_mes: 11 }, error: null };
    abrir();
    await pronto();
    fireEvent.change(mesFerias(), { target: { value: "7" } });
    fireEvent.click(guardar());
    expect(await screen.findByTestId("subs-cfg-resultado")).toHaveTextContent("Sem alteração");
  });

  it("não grava duas vezes com cliques repetidos e fica inactivo enquanto grava", async () => {
    abrir();
    await pronto();
    fireEvent.click(interruptor());
    fireEvent.change(data(), { target: { value: "2026-12-01" } });
    let acabar: (v: unknown) => void = () => undefined;
    m.rpc.mockImplementation(async (fn: string) =>
      fn === "rpc_hr_subsidios_config_ler" ? { data: linha, error: null } : new Promise((r) => { acabar = r; }),
    );
    fireEvent.click(guardar());
    const aGravar = () => screen.getByRole("button", { name: "A guardar…" });
    await waitFor(() => expect(aGravar()).toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(aGravar());
    expect(guardadas()).toHaveLength(1);
    acabar({ data: { alterada: true, ativo_desde: "2026-12-01", ferias_mes: 6, natal_mes: 11 }, error: null });
    await screen.findByTestId("subs-cfg-resultado");
  });
});

describe("configuração dos subsídios: o que a base recusa", () => {
  it("com folhas fechadas e o pagamento ligado, a data e o interruptor ficam fixos, com a razão em texto; os meses continuam editáveis", async () => {
    linha = { ...LIGADA, folhas_fechadas_desde: "2026-02-01", ultima_folha_fechada_ate: "2026-09-30" };
    abrir();
    await pronto();
    expect(interruptor()).toHaveAttribute("aria-disabled", "true");
    expect(data()).toHaveAttribute("readonly");
    expect(screen.getByTestId("subs-cfg-bloqueio")).toHaveTextContent(/já não se pode antecipar, adiar nem desligar/);
    fireEvent.click(interruptor());
    expect(interruptor()).toHaveAttribute("aria-checked", "true");
    fireEvent.change(mesFerias(), { target: { value: "7" } });
    expect(guardar()).not.toHaveAttribute("aria-disabled");
    expect(screen.getByTestId("subs-cfg-aviso-meses")).toBeInTheDocument();
  });

  it("antes de gravar: ligar numa data até ao fim da última folha fechada é avisado e não grava", async () => {
    linha = { ...DESLIGADA, folhas_fechadas_desde: "2026-02-01", ultima_folha_fechada_ate: "2026-09-30" };
    abrir();
    await pronto();
    fireEvent.click(interruptor());
    fireEvent.change(data(), { target: { value: "2026-09-30" } });
    expect(screen.getByRole("alert")).toHaveTextContent("A data tem de ser posterior ao fim da última folha fechada (30/09/2026).");
    expect(data()).toHaveAttribute("aria-invalid", "true");
    expect(guardar()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(guardar());
    expect(guardadas()).toHaveLength(0);
    fireEvent.change(data(), { target: { value: "2026-10-01" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(guardar()).not.toHaveAttribute("aria-disabled");
  });

  it("data em falta ou inválida não se grava", async () => {
    abrir();
    await pronto();
    fireEvent.click(interruptor());
    fireEvent.change(data(), { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Indique uma data válida.");
    expect(guardar()).toHaveAttribute("aria-disabled", "true");
  });

  it.each([
    ["HRA89", /pago duas vezes ou nenhuma/],
    ["HRA81", /Configuração inválida/],
  ])("erro %s da base aparece traduzido, anunciado, e nunca o código em bruto", async (code, texto) => {
    respostaGuardar = { data: null, error: { code, message: `${code} bruto da base` } };
    abrir();
    await pronto();
    fireEvent.click(interruptor());
    fireEvent.change(data(), { target: { value: "2026-12-01" } });
    fireEvent.click(guardar());
    const alerta = await screen.findByTestId("subs-cfg-erro");
    expect(alerta).toHaveAttribute("role", "alert");
    expect(alerta).toHaveTextContent(texto);
    expect(alerta).not.toHaveTextContent("bruto da base");
    expect(screen.queryByTestId("subs-cfg-resultado")).toBeNull();
  });

  it("HRA88 ao ligar: texto próprio de ligar, sem o código em bruto", async () => {
    respostaGuardar = { data: null, error: { code: "HRA88", message: "HRA88 bruto da base" } };
    abrir();
    await pronto();
    fireEvent.click(interruptor());
    fireEvent.change(data(), { target: { value: "2026-12-01" } });
    fireEvent.click(guardar());
    const alerta = await screen.findByTestId("subs-cfg-erro");
    expect(alerta).toHaveTextContent("Não é possível ligar os subsídios com esta data");
    expect(alerta).not.toHaveTextContent(/HRA88|rhSubs\./);
  });

  it.each([
    ["adiar", "2026-02-01", "Não é possível adiar a data de início"],
    ["antecipar", "2025-12-01", "Não é possível antecipar a data de início"],
  ])("HRA88 ao %s uma data já ligada: texto próprio", async (_a, alvo, texto) => {
    linha = { ...LIGADA };
    respostaGuardar = { data: null, error: { code: "HRA88", message: "x" } };
    abrir();
    await pronto();
    fireEvent.change(data(), { target: { value: alvo } });
    fireEvent.click(guardar());
    expect(await screen.findByTestId("subs-cfg-erro")).toHaveTextContent(texto);
  });

  it("HRA88 ao desligar: texto próprio de desligar", async () => {
    linha = { ...LIGADA };
    respostaGuardar = { data: null, error: { code: "HRA88", message: "x" } };
    abrir();
    await pronto();
    fireEvent.click(interruptor());
    fireEvent.click(guardar());
    expect(await screen.findByTestId("subs-cfg-erro")).toHaveTextContent("Não é possível desligar os subsídios");
  });

  it("recusa de permissão ao gravar: texto de falta de permissão", async () => {
    respostaGuardar = { data: null, error: { code: "42501", message: "permission denied" } };
    abrir();
    await pronto();
    fireEvent.click(interruptor());
    fireEvent.change(data(), { target: { value: "2026-12-01" } });
    fireEvent.click(guardar());
    expect(await screen.findByTestId("subs-cfg-erro")).toHaveTextContent(/Sem permissão para alterar/);
  });
});

describe("configuração dos subsídios: permissões e estados", () => {
  it("sem permissão de gerir: só leitura, com o motivo em texto e sem controlos de edição", async () => {
    linha = { ...LIGADA, ferias_mes: 7 };
    abrir(false);
    await pronto();
    expect(screen.getByTestId("subs-cfg-estado")).toHaveTextContent(/Ligado: paga a partir de 01\/01\/2026. Férias em julho/);
    expect(screen.getByTestId("subs-cfg-so-leitura")).toHaveTextContent(/Só leitura/);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    expect(screen.queryByLabelText("Data de início")).toBeNull();
  });

  it("RPC inexistente: «Ainda não disponível», sem erro vermelho nem valores inventados", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function public.rpc_hr_subsidios_config_ler" } });
    abrir();
    expect(await screen.findByTestId("subs-cfg-indisponivel")).toHaveTextContent("Ainda não disponível");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByTestId("subs-cfg-estado")).toBeNull();
  });

  it("a carregar: texto de estado e nada de valores", () => {
    m.rpc.mockReturnValue(new Promise(() => undefined));
    abrir();
    expect(screen.getByRole("status")).toHaveTextContent("A carregar");
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("erro de leitura: anunciado (alert)", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    abrir();
    expect(await screen.findByTestId("subs-cfg-erro-leitura")).toHaveAttribute("role", "alert");
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("leitura recusada: diz que não há permissão para ver", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
    abrir();
    expect(await screen.findByTestId("subs-cfg-sem-ver")).toHaveTextContent(/Sem permissão para ver/);
  });
});

describe("configuração dos subsídios: data, aspecto bloqueado e sem organização", () => {
  it("a ajuda da data diz que cobre as folhas que terminam a partir dela, e não «a primeira folha em que paga»", async () => {
    linha = LIGADA;
    abrir();
    await pronto();
    expect(screen.getByText("Aplica-se às folhas que terminam a partir desta data.")).toBeInTheDocument();
    expect(screen.queryByText(/primeira folha/)).toBeNull();
  });

  it("ao ligar com uma folha fechada, a data por omissão é o dia a seguir à última folha fechada (e já não abre com erro)", async () => {
    linha = { ...DESLIGADA, folhas_fechadas_desde: "2026-02-01", ultima_folha_fechada_ate: "2026-09-30" };
    abrir();
    await pronto();
    fireEvent.click(interruptor());
    expect(data().value).toBe("2026-10-01");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(guardar()).not.toHaveAttribute("aria-disabled");
  });

  it("ao ligar sem folhas fechadas, a data por omissão é hoje", async () => {
    abrir();
    await pronto();
    fireEvent.click(interruptor());
    expect(data().value).toBe(hojeLisboa());
  });

  it("a data só aceita de 2000-01-01 até hoje mais cinco anos", async () => {
    linha = LIGADA;
    abrir();
    await pronto();
    expect(data()).toHaveAttribute("min", "2000-01-01");
    expect(data()).toHaveAttribute("max", dataHaMeses(hojeLisboa(), -60));
  });

  it("bloqueado: o interruptor e a data parecem desactivados (opacidade e cursor), e não só têm aria-disabled", async () => {
    linha = { ...LIGADA, folhas_fechadas_desde: "2026-02-01", ultima_folha_fechada_ate: "2026-09-30" };
    abrir();
    await pronto();
    for (const el of [interruptor(), data()]) {
      expect(el.className).toMatch(/(^|\s)opacity-/);
      expect(el.className).toMatch(/(^|\s)cursor-not-allowed/);
    }
    expect(screen.getByText("Pagar os subsídios de férias e de Natal").className).toMatch(/(^|\s)cursor-not-allowed/);
  });

  it("não bloqueado: o interruptor e a data não levam o aspecto desactivado", async () => {
    linha = LIGADA;
    abrir();
    await pronto();
    expect(interruptor().className).not.toMatch(/(^|\s)opacity-/);
    expect(data().className).not.toMatch(/(^|\s)cursor-not-allowed/);
  });

  it("Guardar inactivo (nada mudou) parece inactivo", async () => {
    abrir();
    await pronto();
    expect(guardar()).toHaveAttribute("aria-disabled", "true");
    expect(guardar().className).toMatch(/(^|\s)opacity-/);
    expect(guardar().className).toMatch(/(^|\s)cursor-not-allowed/);
    fireEvent.click(interruptor());
    expect(guardar().className).not.toMatch(/(^|\s)opacity-/);
  });

  it("sem organização activa: diz «Escolha uma organização» em vez de «A carregar» para sempre", () => {
    m.semOrganizacao = true;
    abrir();
    expect(screen.getByTestId("subs-cfg-sem-organizacao")).toHaveTextContent("Escolha uma organização para ver a configuração dos subsídios.");
    expect(screen.queryByText(/A carregar/)).toBeNull();
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
