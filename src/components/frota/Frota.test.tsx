// A Frota real (/frota/*) com o Supabase falso (testes/bdFalsa): os ecrãs abrem sem selo de exemplo e com estados vazios
// decentes, a ficha tem 9 abas (stock da carrinha lido de stocks), as recusas no navegador não chamam RPCs, os erros
// das RPCs (feriado da Agenda incluído) aparecem claros, as permissões fleet.* mandam nos botões, as obras/ordens abrem
// nas Operações, e o grupo Frota está no menu a seguir ao Inventário com fleet.view/fleet.self.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { menuSections } from "@/components/sidebar/menuConfig";
import { ECRAS, montar } from "./testes/montar";
import { bd, frotaDeTeste, ORG } from "./testes/bdFalsa";
import { segundaFeira } from "./ecras/AtribuicoesFrota";
import { mensagemErroFrota } from "./dados";

const estado = vi.hoisted(() => ({ perms: new Set<string>(), aCarregar: false }));
const TODAS = ["fleet.view", "fleet.manage", "fleet.costs", "inventory.edit", "inventory.view", "warehouses.view", "warehouses.create", "operations.view", "scheduling.view"];
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => !estado.aCarregar && estado.perms.has(p),
    hasAnyPermission: (l: string[]) => !estado.aCarregar && l.some((p) => estado.perms.has(p)),
    permissions: estado.aCarregar ? [] : [...estado.perms],
    loading: estado.aCarregar,
  }),
}));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-teste" }, isLoading: false }) }));
vi.mock("@/integrations/supabase/client", async () => (await import("./testes/bdFalsa")).clienteFalso);
vi.mock("@/lib/cachedAuth", () => ({ getCachedAuthUser: async () => ({ data: { user: { id: "auth-1" } } }) }));

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
const titulo = (): string => screen.getByRole("heading", { level: 1 }).textContent ?? "";
const carregado = () => waitFor(() => expect(screen.queryByText("A carregar a Frota…")).toBeNull());

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("language", "pt");
  estado.perms = new Set(TODAS);
  estado.aCarregar = false;
  bd.tabelas = {};
  bd.respostas = {};
  bd.falhar.clear();
  bd.rpc.mockClear();
  bd.updates = [];
});
afterEach(() => cleanup());

describe("Frota: ecrãs com a BD vazia", () => {
  it("todos os ecrãs abrem com o título, sem selo de exemplo nem chaves por traduzir, e com estado vazio", async () => {
    for (const e of ECRAS) {
      montar(`/frota/${e}`);
      await carregado();
      expect(titulo()).not.toMatch(/exemplo/i);
      expect(document.body.textContent ?? "").not.toMatch(/Dados de exemplo|Repor dados de exemplo/);
      expect(document.body.textContent ?? "").not.toMatch(/\b(?:sidebar|frotaExemplo|fleet)\.[A-Za-z]+/);
      cleanup();
    }
    montar("/frota/hoje");
    await carregado();
    expect(screen.getByText("Ainda não há viaturas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova viatura" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Novo condutor" })).toBeInTheDocument();
  });

  it("uma leitura que falha mostra o erro e deixa tentar outra vez", async () => {
    bd.falhar.add("fleet_v_vehicles");
    montar("/frota/viaturas");
    // a leitura tenta 2 vezes (retry: 1) antes de mostrar o erro
    expect(await screen.findByText(/Não foi possível ler parte da Frota/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tentar outra vez/ })).toBeInTheDocument();
  });
});

describe("Frota: ecrãs e ficha com dados", () => {
  beforeEach(() => frotaDeTeste());

  it("abre /frota/viaturas, a ficha da AA-12-BC com 9 abas, o stock da carrinha e as ligações", async () => {
    montar("/frota/viaturas");
    fireEvent.click(await screen.findByRole("row", { name: "Abrir a AA-12-BC" }));
    const ficha = await screen.findByRole("dialog");
    expect(within(ficha).getByRole("heading", { name: /AA-12-BC.*Renault Master 2\.3 dCi/ })).toBeInTheDocument();
    expect(within(ficha).getAllByRole("tab").map((a) => a.textContent)).toEqual(["Resumo", "Atribuições", "Manutenção", "Custos", "Ocorrências", "Documentos", "Stock na carrinha", "Ligações", "Histórico"]);
    fireEvent.click(within(ficha).getByRole("tab", { name: "Stock na carrinha" }));
    expect(within(ficha).getByText("Tubo multicamada 16 mm")).toBeInTheDocument();
    expect(within(ficha).getByText("Repor 6")).toBeInTheDocument();
    expect(within(ficha).getByRole("link", { name: /Ver os armazéns no Inventário/ })).toHaveAttribute("href", "/warehouses");
    fireEvent.click(within(ficha).getByRole("tab", { name: "Ligações" }));
    expect(within(ficha).getByRole("link", { name: /Abrir a Agenda/ })).toHaveAttribute("href", "/scheduling");
    expect(within(ficha).getByText("Na Agenda (Frota)")).toBeInTheDocument();
    expect(await within(ficha).findByRole("link", { name: /Ordem OT-501/ })).toHaveAttribute("href", "/operacao/ordens/OT-501");
    fireEvent.click(within(ficha).getByRole("tab", { name: "Histórico" }));
    expect(within(ficha).getByText("Km registados.")).toBeInTheDocument();
    expect(within(ficha).getByText("Ana Teste")).toBeInTheDocument();
  });

  it("a viatura sem armazém móvel não tem a aba do stock", async () => {
    montar("/frota/viaturas");
    fireEvent.click(await screen.findByRole("row", { name: "Abrir a 45-XZ-78" }));
    const ficha = await screen.findByRole("dialog");
    expect(within(ficha).queryByRole("tab", { name: "Stock na carrinha" })).toBeNull();
  });

  it("recusa a atribuição a quem não tem carta sem chamar a RPC", async () => {
    montar("/frota/hoje");
    fireEvent.click(await screen.findByRole("button", { name: "Nova atribuição" }));
    const dlg = await screen.findByRole("dialog", { name: "Atribuir viatura" });
    fireEvent.change(within(dlg).getByLabelText("Viatura"), { target: { value: "v2" } });
    fireEvent.change(within(dlg).getByLabelText("Condutor"), { target: { value: "d2" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Atribuir" }));
    await waitFor(() => expect(within(dlg).getAllByText("Paulo Mota não tem carta de condução registada.").length).toBeGreaterThan(0));
    expect(within(dlg).getByLabelText("Condutor")).toHaveAttribute("aria-invalid", "true");
    expect(bd.rpc).not.toHaveBeenCalled();
  });

  it("km que descem dão erro e não chamam a RPC", async () => {
    montar("/frota/viaturas");
    fireEvent.click(await screen.findByRole("row", { name: "Abrir a AA-12-BC" }));
    const ficha = await screen.findByRole("dialog");
    fireEvent.click(within(ficha).getByRole("button", { name: "Registar km" }));
    const dlg = await screen.findByRole("dialog", { name: "Registar km" });
    fireEvent.change(within(dlg).getByLabelText("Km no conta-quilómetros"), { target: { value: "1000" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Registar" }));
    expect((await within(dlg).findAllByText(/Os km não podem descer\. Última leitura: 148.230 km\./)).length).toBeGreaterThan(0);
    expect(within(dlg).getByText(/^Não foi gravado: Os km não podem descer/)).toBeInTheDocument();
    expect(bd.rpc).not.toHaveBeenCalled();
  });

  it("a RPC que recusa deixa o diálogo aberto com a mensagem dela; o feriado da Agenda vem explicado", async () => {
    bd.respostas.rpc_fleet_schedule_maintenance = () => ({ error: { message: "Não é possível criar ou alterar agendamentos em dia bloqueado/feriado: Natal", code: "23514" } });
    montar("/frota/manutencao");
    fireEvent.click(await screen.findByRole("button", { name: "Agendar manutenção" }));
    const dlg = await screen.findByRole("dialog", { name: "Agendar manutenção" });
    fireEvent.change(within(dlg).getByLabelText("Viatura"), { target: { value: "v1" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Agendar" }));
    expect(await within(dlg).findByText(/A Agenda não aceita marcações em feriados ou dias bloqueados \(Natal\)\. Nada foi gravado/)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Agendar manutenção" })).toBeInTheDocument();
    expect(screen.getByTestId("aviso-frota")).toHaveTextContent("A Agenda não aceita marcações em feriados");
  });

  it("um cartão do Hoje abre a lista já filtrada", async () => {
    montar("/frota/hoje");
    fireEvent.click(await screen.findByRole("button", { name: /Documentos vencidos/ }));
    await waitFor(() => expect(titulo()).toMatch(/^Documentos/));
    expect(screen.getByRole("button", { name: /^Vencidos/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Renovar Inspeção (IPO) da 45-XZ-78" })).toBeInTheDocument();
  });

  it("sem fleet.manage é só consulta: os botões de escrita não abrem diálogos e dizem porquê", async () => {
    estado.perms = new Set(["fleet.view"]);
    montar("/frota/hoje");
    const botao = await screen.findByRole("button", { name: "Nova atribuição" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).toHaveAttribute("title", expect.stringMatching(/fleet\.manage/));
    fireEvent.click(botao);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/Só consulta/)).toBeInTheDocument();
  });

  it("o condutor (fleet.self) regista km na sua viatura mas não atribui", async () => {
    estado.perms = new Set(["fleet.self"]);
    montar("/frota/viaturas");
    fireEvent.click(await screen.findByRole("row", { name: "Abrir a 45-XZ-78" }));
    const ficha = await screen.findByRole("dialog");
    expect(within(ficha).getByRole("button", { name: "Registar km" })).not.toHaveAttribute("aria-disabled");
    expect(within(ficha).getByRole("button", { name: "Atribuir" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText(/Só consulta/)).toBeNull();
  });

  it("enquanto as permissões carregam, os botões dizem que estão a carregar", async () => {
    estado.aCarregar = true;
    montar("/frota/hoje");
    const botao = await screen.findByRole("button", { name: "Nova atribuição" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).toHaveAttribute("title", "A carregar permissões…");
    expect(screen.queryByText(/Só consulta/)).toBeNull();
  });

  it("as obras e ordens abrem nas Operações; sem operations.view são texto", async () => {
    montar("/frota/ligacoes");
    expect(await screen.findByRole("link", { name: /Ordem OT-501/ })).toHaveAttribute("href", "/operacao/ordens/OT-501");
    cleanup();
    estado.perms = new Set(TODAS.filter((p) => p !== "operations.view"));
    montar("/frota/ligacoes");
    expect(await screen.findByText(/Ordem OT-501/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ordem OT-501/ })).toBeNull();
  });

  it("cancelar uma reserva pede confirmação e só depois chama a RPC", async () => {
    montar("/frota/atribuicoes?vista=res");
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    const conf = await screen.findByRole("alertdialog", { name: "Cancelar a reserva" });
    fireEvent.click(within(conf).getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(bd.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar reserva" }));
    await waitFor(() => expect(bd.rpc).toHaveBeenCalledWith("rpc_fleet_cancel_reservation", { p_assignment_id: "a2" }));
  });

  it("marcar uma ocorrência resolvida pede confirmação", async () => {
    montar("/frota/ocorrencias");
    fireEvent.click(await screen.findByRole("button", { name: "Marcar resolvida" }));
    const conf = await screen.findByRole("alertdialog", { name: "Marcar a ocorrência como resolvida" });
    fireEvent.click(within(conf).getByRole("button", { name: "Marcar resolvida" }));
    await waitFor(() => expect(screen.getByTestId("aviso-frota")).toHaveTextContent("Ocorrência marcada como resolvida."));
    expect(bd.rpc).toHaveBeenCalledWith("rpc_fleet_resolve_incident", { p_incident_id: "o2" });
  });

  it("a pesquisa é uma caixa combinada que fecha ao clicar fora", async () => {
    montar("/frota/hoje");
    await carregado();
    const caixa = await screen.findByRole("combobox", { name: "Procurar na frota" });
    fireEvent.change(caixa, { target: { value: "master" } });
    expect(caixa).toHaveAttribute("aria-expanded", "true");
    const lista = document.getElementById(caixa.getAttribute("aria-controls")!)!;
    expect(within(lista).getByRole("option", { name: /AA-12-BC/ })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(caixa).toHaveAttribute("aria-expanded", "false");
  });

  it("?viatura=<id> abre logo a ficha (ligação dos avisos)", async () => {
    montar("/frota/documentos?viatura=v2");
    const ficha = await screen.findByRole("dialog");
    expect(within(ficha).getByRole("heading", { name: /45-XZ-78/ })).toBeInTheDocument();
  });

  it("os avisos do job diário aparecem no Hoje e abrem a viatura", async () => {
    bd.tabelas.notifications = [{ id: "n1", type: "fleet_document_due", title: "Documento da viatura a vencer", message: "Inspeção (IPO) da 45-XZ-78: venceu.", priority: "high", link: "/frota/documentos", data: { vehicle_id: "v2" }, entity_id: "c1", action_type: null, action_config: null, created_at: "2026-10-15T06:30:00Z" }];
    montar("/frota/hoje");
    fireEvent.click(await screen.findByText("Documento da viatura a vencer"));
    const ficha = await screen.findByRole("dialog");
    expect(within(ficha).getByRole("heading", { name: /45-XZ-78/ })).toBeInTheDocument();
  });
});

describe("Frota: regras e menu", () => {
  it("a semana do calendário começa à segunda-feira", () => {
    expect(segundaFeira("2026-10-14")).toBe("2026-10-12");
    expect(segundaFeira("2026-10-12")).toBe("2026-10-12");
    expect(segundaFeira("2026-10-18")).toBe("2026-10-12");
  });

  it("os erros de fora da Frota ficam claros", () => {
    expect(mensagemErroFrota({ message: "duplicate key value violates unique constraint \"fleet_vehicles_org_plate_uq\"", code: "23505" })).toBe("Já existe uma viatura com esta matrícula.");
    expect(mensagemErroFrota({ message: "Could not find the function", code: "PGRST202" })).toMatch(/ainda não está disponível/);
    expect(mensagemErroFrota(new TypeError("Failed to fetch"))).toMatch(/Sem ligação/);
    expect(mensagemErroFrota({ message: "Sem permissão para esta ação na Frota.", code: "42501" })).toBe("Sem permissão para esta ação na Frota.");
  });

  it("é um grupo a seguir ao Inventário, com fleet.view ou fleet.self e o prefixo /frota só seu", () => {
    const i = menuSections.findIndex((s) => s.id === "inventory");
    const frota = menuSections[i + 1];
    expect(frota.id).toBe("frota");
    expect(frota.labelKey).toBe("sidebar.frota");
    expect(frota.permissions).toEqual(["fleet.view", "fleet.self"]);
    expect(frota.items.map((x) => x.to)).toEqual(ECRAS.map((e) => `/frota/${e}`));
    expect(frota.items.every((x) => JSON.stringify(x.permissions) === JSON.stringify(["fleet.view", "fleet.self"]))).toBe(true);
    for (const s of menuSections) if (s.id !== "frota") expect(s.paths.some((p) => p.startsWith("/frota") || "/frota/hoje".startsWith(p + "/"))).toBe(false);
    expect(ORG).toBe("org-teste");
  });
});
