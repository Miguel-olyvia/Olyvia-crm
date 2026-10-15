// Todas as ações da Frota de exemplo, feitas pela UI (React Testing Library), e o sítio onde cada uma tem de aparecer:
// o Hoje, a ficha da viatura (com a aba Histórico), as listas de cada ecrã, o calendário das Atribuições, a Atividade e
// os contadores do menu lateral (useContadoresFrota). Regra: uma ação só está pronta quando funciona pela UI e aparece
// em todos os ecrãs ligados.
// Inclui o bug "agendei uma manutenção e não deu nem aparece no calendário".
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import FrotaExemplo from "@/pages/frota-exemplo/FrotaExemplo";
import { esquecerPerfilFrota } from "@/pages/prototipo-negocios/frota/perfil";
import { definirOrganizacaoFrotaExemplo, lerFrotaExemplo, reporFrotaExemplo } from "./dados/loja";
import { stockCarrinhaExemplo } from "./dados/exemplo";
import { abaixoMin } from "./dados";
import { useContadoresFrota } from "./useContadoresFrota";
import { useNomeUtilizador } from "./useNomeUtilizador";
import type { EcraFrota } from "./contexto";

const TODAS = ["inventory.view", "inventory.edit", "warehouses.view", "users.view", "operations.view", "scheduling.view"];
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => TODAS.includes(p),
    hasAnyPermission: (l: string[]) => l.some((p) => TODAS.includes(p)),
    permissions: TODAS,
    loading: false,
  }),
}));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-acoes" }, isLoading: false }) }));
// quem assina o histórico: o utilizador da sessão (anew_users.name), aqui a "Ana Teste"
vi.mock("@/integrations/supabase/client", () => {
  const consulta = { select: () => consulta, eq: () => consulta, maybeSingle: async () => ({ data: { name: "Ana Teste" }, error: null }) };
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: "u-teste", email: "ana@teste.pt" } } } }) },
      from: () => consulta,
    },
  };
});

// o jsdom não tem ResizeObserver (as caixas de seleção do Radix usam-no)
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const ECRAS: EcraFrota[] = ["hoje", "viaturas", "atribuicoes", "condutores", "manutencao", "custos", "ocorrencias", "documentos", "relatorios", "atividade", "ligacoes"];

/** As pílulas do menu lateral (a mesma fonte do AppSidebar). */
function Contadores() {
  const c = useContadoresFrota();
  return <output data-testid="contadores">{JSON.stringify({ hoje: c("hoje"), viaturas: c("viaturas"), ocorrencias: c("ocorrencias"), manutencao: c("manutencao") })}</output>;
}
const contadores = (): Record<string, number | null> => JSON.parse(screen.getByTestId("contadores").textContent ?? "{}");

const abrirEm = (caminho: string) =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[caminho]}>
        <Contadores />
        <Routes>
          {ECRAS.map((e) => <Route key={e} path={`/frota/${e}`} element={<FrotaExemplo key={e} ecra={e} />} />)}
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
/** Sai do ecrã atual e abre outro (os dados ficam na base de exemplo, como ao mudar de página). */
const ir = (caminho: string) => { cleanup(); return abrirEm(caminho); };
const aviso = () => screen.getByTestId("aviso-frota");

/** Abre a ficha da viatura a partir das Viaturas (e a aba, se for dada). */
async function ficha(mat: string, aba?: string): Promise<HTMLElement> {
  ir("/frota/viaturas");
  fireEvent.click(screen.getByRole("row", { name: `Abrir a ${mat}` }));
  const f = await screen.findByRole("dialog");
  if (aba) fireEvent.click(within(f).getByRole("tab", { name: aba }));
  return f;
}
/** A aba Histórico da ficha tem a entrada (o quê, o texto e quem). */
async function noHistorico(mat: string, acao: string, texto: string | RegExp): Promise<void> {
  const f = await ficha(mat, "Histórico");
  const t = within(f).getByRole("table", { name: "Histórico" });
  const linha = within(t).getAllByRole("row").find((r) => within(r).queryByText(acao) && within(r).queryByText(texto));
  expect(linha, `Histórico da ${mat}: ${acao}`).toBeTruthy();
  expect(within(linha!).getByText("Ana Teste")).toBeInTheDocument();
}
/** O ecrã Atividade tem a entrada, com a viatura (ou "Frota") e quem a fez. */
function naAtividade(acao: string, texto: string | RegExp, mat?: string): void {
  ir("/frota/atividade");
  const t = screen.getByRole("table", { name: "Histórico" });
  const linha = within(t).getAllByRole("row").find((r) => within(r).queryByText(acao) && within(r).queryByText(texto));
  expect(linha, `Atividade: ${acao}`).toBeTruthy();
  expect(within(linha!).getByText("Ana Teste")).toBeInTheDocument();
  if (mat) expect(within(linha!).getByText(mat)).toBeInTheDocument();
}
/** A linha da viatura no calendário das Atribuições (na semana aberta). */
const linhaCalendario = (mat: string): HTMLElement => {
  const l = screen.getAllByRole("row").find((r) => within(r).queryByRole("button", { name: mat }));
  expect(l, `linha da ${mat} no calendário`).toBeTruthy();
  return l!;
};
/** Escolhe valores num diálogo (rótulo → valor) e carrega no botão. */
async function preencher(dlg: HTMLElement, campos: Record<string, string>, botao: string): Promise<void> {
  for (const [rotulo, valor] of Object.entries(campos)) fireEvent.change(within(dlg).getByLabelText(rotulo), { target: { value: valor } });
  fireEvent.click(within(dlg).getByRole("button", { name: botao }));
}
const fechou = (nome: string) => waitFor(() => expect(screen.queryByRole("dialog", { name: nome })).toBeNull());

beforeAll(async () => {
  // o nome da sessão fica em cache: as ações dos testes já saem assinadas pela "Ana Teste"
  const { result } = renderHook(() => useNomeUtilizador());
  await waitFor(() => expect(result.current).toBe("Ana Teste"));
  cleanup();
});
beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("language", "pt");
  esquecerPerfilFrota();
  definirOrganizacaoFrotaExemplo("org-acoes");
  reporFrotaExemplo();
});
afterEach(() => { cleanup(); window.localStorage.clear(); esquecerPerfilFrota(); });

describe("Manutenção agendada (bug: 'agendei uma manutenção e não deu nem aparece no calendário')", () => {
  it("sem viatura não grava e diz porquê junto aos botões (nada fica em silêncio)", async () => {
    abrirEm("/frota/manutencao");
    const antes = lerFrotaExemplo().manut.length;
    fireEvent.click(screen.getByRole("button", { name: "Agendar manutenção" }));
    const dlg = await screen.findByRole("dialog", { name: "Agendar manutenção" });
    fireEvent.click(within(dlg).getByRole("button", { name: "Agendar" }));
    expect(await within(dlg).findByText("Não foi gravado: Escolhe a viatura.")).toBeInTheDocument();
    expect(within(dlg).getByLabelText("Viatura")).toHaveAttribute("aria-invalid", "true");
    expect(lerFrotaExemplo().manut.length).toBe(antes);
  });

  it("agendada para a próxima semana: aviso com ligação para essa semana, e aparece no calendário, Hoje, Manutenção, ficha (Histórico) e Atividade", async () => {
    abrirEm("/frota/manutencao");
    fireEvent.click(screen.getByRole("button", { name: "Agendar manutenção" }));
    const dlg = await screen.findByRole("dialog", { name: "Agendar manutenção" });
    // a data por omissão é daqui a 7 dias (21/10/2026), na semana seguinte à de HOJE
    expect(within(dlg).getByLabelText("Data")).toHaveValue("2026-10-21");
    await preencher(dlg, { Viatura: "v1", "Intervenção": "Travões" }, "Agendar");
    await fechou("Agendar manutenção");
    expect(lerFrotaExemplo().manut.some((m) => m.vid === "v1" && m.tipo === "Travões" && m.data === "2026-10-21" && m.estado === "agendada")).toBe(true);
    expect(aviso()).toHaveTextContent("Travões da AA-12-BC agendada para 21/10/2026.");
    // na lista de intervenções da Manutenção
    const linhaM = screen.getAllByRole("row").find((r) => within(r).queryByText("Travões"));
    expect(linhaM).toBeTruthy();
    expect(within(linhaM!).getByText("Agendada")).toBeInTheDocument();
    // "Ver no calendário" abre a semana certa (a próxima), onde a manutenção bloqueia a viatura
    const link = within(aviso()).getByRole("link", { name: "Ver no calendário" });
    expect(link).toHaveAttribute("href", "/frota/atribuicoes?semana=1");
    fireEvent.click(link);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Atribuições/));
    expect(screen.getByText("19/10/2026 a 25/10/2026")).toBeInTheDocument();
    expect(within(linhaCalendario("AA-12-BC")).getByText("Manutenção · Travões")).toBeInTheDocument();
    // na semana de HOJE não aparece (é na seguinte), e os botões de semana mudam o URL
    fireEvent.click(screen.getByRole("button", { name: "Esta semana" }));
    expect(screen.getByText("12/10/2026 a 18/10/2026")).toBeInTheDocument();
    expect(within(linhaCalendario("AA-12-BC")).queryByText("Manutenção · Travões")).toBeNull();
    // no Hoje: as próximas manutenções, com a ligação para a semana no calendário
    ir("/frota/hoje");
    const prox = screen.getByRole("region", { name: "Próximas manutenções" });
    expect(within(prox).getByText("AA-12-BC · Travões")).toBeInTheDocument();
    expect(within(prox).getByRole("link", { name: "Ver Travões da AA-12-BC no calendário" })).toHaveAttribute("href", "/frota/atribuicoes?semana=1");
    // na ficha: aba Manutenção, Ligações (agenda) e Histórico
    const f = await ficha("AA-12-BC", "Manutenção");
    expect(within(f).getByText("Travões")).toBeInTheDocument();
    expect(within(f).getByText("agendada")).toBeInTheDocument();
    fireEvent.click(within(f).getByRole("tab", { name: "Ligações" }));
    expect(within(f).getByText(/Travões · Oficina|Travões · /)).toBeInTheDocument();
    await noHistorico("AA-12-BC", "Manutenção agendada", "Travões da AA-12-BC agendada para 21/10/2026.");
    naAtividade("Manutenção agendada", "Travões da AA-12-BC agendada para 21/10/2026.", "AA-12-BC");
  });

  it("agendada a partir da ficha para hoje: aparece no 'Na estrada hoje' do Hoje e no calendário desta semana", async () => {
    const f = await ficha("45-XZ-78", "Manutenção");
    fireEvent.click(within(f).getByRole("button", { name: "Agendar manutenção" }));
    const dlg = await screen.findByRole("dialog", { name: "Agendar manutenção" });
    expect(within(dlg).getByLabelText("Viatura")).toHaveValue("v2");
    await preencher(dlg, { "Intervenção": "Pneus", Data: "2026-10-14" }, "Agendar");
    await fechou("Agendar manutenção");
    // a ficha continua aberta e a aba Manutenção já tem a intervenção
    expect(within(screen.getByRole("dialog")).getByText("Pneus")).toBeInTheDocument();
    expect(within(aviso()).getByRole("link", { name: "Ver no calendário" })).toHaveAttribute("href", "/frota/atribuicoes");
    ir("/frota/hoje");
    const estrada = screen.getByRole("region", { name: "Na estrada hoje" });
    expect(within(estrada).getByRole("row", { name: "Abrir a 45-XZ-78" })).toHaveTextContent("Pneus");
    ir("/frota/atribuicoes");
    expect(within(linhaCalendario("45-XZ-78")).getByText("Manutenção · Pneus")).toBeInTheDocument();
    naAtividade("Manutenção agendada", "Pneus da 45-XZ-78 agendada para 14/10/2026.", "45-XZ-78");
  });

  it("concluir uma revisão: fica concluída, entra nos custos, a revisão recomeça e o contador do menu acompanha", async () => {
    abrirEm("/frota/manutencao");
    const antesMenu = contadores().manutencao ?? 0;
    const v4Antes = screen.getAllByRole("row").some((r) => within(r).queryByText("12-TT-90") && within(r).queryByRole("button", { name: "Agendar" }));
    const linha = screen.getAllByRole("row").find((r) => within(r).queryByText("Revisão anual"))!;
    fireEvent.click(within(linha).getByRole("button", { name: "Concluir" }));
    const dlg = await screen.findByRole("dialog", { name: "Concluir intervenção" });
    await preencher(dlg, { "Km à saída": "231500", "Valor final (€)": "310" }, "Concluir");
    await fechou("Concluir intervenção");
    expect(aviso()).toHaveTextContent("Revisão anual concluída.");
    const depois = screen.getAllByRole("row").find((r) => within(r).queryByText("Revisão anual"))!;
    expect(within(depois).getByText("Concluída")).toBeInTheDocument();
    expect(lerFrotaExemplo().viaturas.find((v) => v.id === "v4")?.rev.ultKm).toBe(231500);
    expect(contadores().manutencao ?? 0).toBe(v4Antes ? antesMenu - 1 : antesMenu);
    ir("/frota/custos");
    expect(screen.getByRole("row", { name: /Abrir os custos da 12-TT-90: Oficina de 14\/10\/2026, 310,00/ })).toBeInTheDocument();
    await noHistorico("12-TT-90", "Manutenção concluída", /Revisão anual concluída/);
    naAtividade("Manutenção concluída", /Revisão anual concluída/, "12-TT-90");
  });
});

describe("Atribuições: reservar, cancelar, devolver e atribuir", () => {
  it("reservar pelo calendário: aparece no calendário, Hoje, Reservas, ficha e Atividade; cancelar liberta tudo", async () => {
    abrirEm("/frota/atribuicoes");
    fireEvent.click(screen.getByRole("button", { name: "Reservar BX-55-RT a 17/10/2026" }));
    const dlg = await screen.findByRole("dialog", { name: "Atribuir viatura" });
    expect(within(dlg).getByLabelText("Tipo")).toHaveValue("pontual");
    await preencher(dlg, { Condutor: "p8" }, "Atribuir");
    await fechou("Atribuir viatura");
    expect(aviso()).toHaveTextContent("BX-55-RT atribuída a Sofia Martins.");
    expect(within(linhaCalendario("BX-55-RT")).getByText("Sofia")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reservar BX-55-RT a 17/10/2026" })).toBeNull();
    ir("/frota/hoje");
    expect(within(screen.getByRole("region", { name: "Próximas reservas" })).getByText(/Sofia Martins/)).toBeInTheDocument();
    const f = await ficha("BX-55-RT", "Atribuições");
    expect(within(f).getByText("Sofia Martins")).toBeInTheDocument();
    await noHistorico("BX-55-RT", "Reserva", "BX-55-RT atribuída a Sofia Martins.");
    naAtividade("Reserva", "BX-55-RT atribuída a Sofia Martins.", "BX-55-RT");
    // cancelar a reserva (com confirmação)
    ir("/frota/atribuicoes?vista=res");
    const linha = screen.getAllByRole("row").find((r) => within(r).queryByText("Sofia Martins"))!;
    fireEvent.click(within(linha).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar reserva" }));
    await waitFor(() => expect(aviso()).toHaveTextContent("Reserva cancelada."));
    ir("/frota/atribuicoes");
    expect(within(linhaCalendario("BX-55-RT")).queryByText("Sofia")).toBeNull();
    expect(screen.getByRole("button", { name: "Reservar BX-55-RT a 17/10/2026" })).toBeInTheDocument();
    naAtividade("Reserva cancelada", "Reserva cancelada. A viatura ficou livre na Agenda.", "BX-55-RT");
  });

  it("devolver na ficha e voltar a atribuir: km, Histórico das atribuições, livres hoje, calendário, ficha e Atividade", async () => {
    const f = await ficha("AA-12-BC");
    fireEvent.click(within(f).getByRole("button", { name: "Devolver" }));
    const dlg = await screen.findByRole("dialog", { name: "Devolver viatura" });
    await preencher(dlg, { "Km na devolução": "148400" }, "Registar devolução");
    await fechou("Devolver viatura");
    expect(aviso()).toHaveTextContent(/AA-12-BC devolvida com 148.400 km\./);
    expect(lerFrotaExemplo().viaturas.find((v) => v.id === "v1")?.km).toBe(148400);
    // a ficha mostra agora "Atribuir" (viatura livre) e continua a deixar registar km
    const fichaAberta = screen.getByRole("dialog");
    expect(within(fichaAberta).getByRole("button", { name: "Atribuir" })).toBeInTheDocument();
    expect(within(fichaAberta).getByRole("button", { name: "Registar km" })).toBeInTheDocument();
    ir("/frota/hoje");
    expect(screen.getByRole("button", { name: /Viaturas livres hoje/ })).toHaveTextContent("AA-12-BC");
    ir("/frota/atribuicoes?vista=hist");
    expect(screen.getAllByRole("row").some((r) => within(r).queryByText("João Silva") && within(r).queryByText("AA-12-BC"))).toBe(true);
    await noHistorico("AA-12-BC", "Devolução", /^AA-12-BC devolvida com 148.400 km\.$/);
    naAtividade("Devolução", /^AA-12-BC devolvida com 148.400 km\.$/, "AA-12-BC");
    // atribuir outra vez, a partir da ficha
    const f2 = await ficha("AA-12-BC");
    fireEvent.click(within(f2).getByRole("button", { name: "Atribuir" }));
    const dlg2 = await screen.findByRole("dialog", { name: "Atribuir viatura" });
    await preencher(dlg2, { Condutor: "p8" }, "Atribuir");
    await fechou("Atribuir viatura");
    expect(aviso()).toHaveTextContent("AA-12-BC atribuída a Sofia Martins.");
    ir("/frota/atribuicoes");
    expect(within(linhaCalendario("AA-12-BC")).getAllByText("Sofia").length).toBeGreaterThan(0);
    naAtividade("Atribuição", "AA-12-BC atribuída a Sofia Martins.", "AA-12-BC");
  });
});

describe("Km, abastecimentos, despesas e extrato", () => {
  it("registar km: ficha, Histórico e Atividade", async () => {
    const f = await ficha("AA-12-BC");
    fireEvent.click(within(f).getByRole("button", { name: "Registar km" }));
    const dlg = await screen.findByRole("dialog", { name: "Registar km" });
    await preencher(dlg, { "Km no conta-quilómetros": "148600" }, "Registar");
    await fechou("Registar km");
    expect(screen.getByRole("dialog")).toHaveTextContent(/Km atuais148.600 km/);
    await noHistorico("AA-12-BC", "Km", /^Km registados\./);
    naAtividade("Km", /^Km registados\./, "AA-12-BC");
  });

  it("registar abastecimento na ficha: custos (ecrã e ficha), km, Histórico e Atividade", async () => {
    const f = await ficha("AA-12-BC");
    fireEvent.click(within(f).getByRole("button", { name: "Registar abastecimento" }));
    const dlg = await screen.findByRole("dialog", { name: "Registar abastecimento" });
    expect(within(dlg).getByLabelText("Viatura")).toHaveValue("v1");
    await preencher(dlg, { Litros: "50", "Valor com IVA (€)": "81.5", "Km no momento": "148700" }, "Registar");
    await fechou("Registar abastecimento");
    expect(aviso()).toHaveTextContent("Abastecimento de 81,50 € registado na AA-12-BC.");
    expect(lerFrotaExemplo().viaturas.find((v) => v.id === "v1")?.km).toBe(148700);
    ir("/frota/custos");
    expect(screen.getByRole("row", { name: /Abrir os custos da AA-12-BC: Combustível de 14\/10\/2026, 81,50/ })).toBeInTheDocument();
    const fc = await ficha("AA-12-BC", "Custos");
    expect(within(fc).getAllByText("81,50 €").length).toBeGreaterThan(0);
    await noHistorico("AA-12-BC", "Abastecimento", "Abastecimento de 81,50 € registado na AA-12-BC.");
    naAtividade("Abastecimento", "Abastecimento de 81,50 € registado na AA-12-BC.", "AA-12-BC");
  });

  it("abastecer uma viatura na oficina: o diálogo mostra a viatura (a mesma lista da ficha)", async () => {
    const f = await ficha("BR-03-QP");
    fireEvent.click(within(f).getByRole("button", { name: "Registar abastecimento" }));
    const dlg = await screen.findByRole("dialog", { name: "Registar abastecimento" });
    const sel = within(dlg).getByLabelText("Viatura") as HTMLSelectElement;
    expect(sel).toHaveValue("v3");
    expect(sel.selectedOptions[0]?.textContent).toMatch(/BR-03-QP/);
  });

  it("registar despesa nos Custos: lista, ficha, Histórico e Atividade", async () => {
    abrirEm("/frota/custos");
    fireEvent.click(screen.getByRole("button", { name: "Registar despesa" }));
    const dlg = await screen.findByRole("dialog", { name: "Registar despesa" });
    await preencher(dlg, { Viatura: "v2", "Valor com IVA (€)": "12.4", Fornecedor: "Via Verde" }, "Registar");
    await fechou("Registar despesa");
    expect(aviso()).toHaveTextContent("Despesa de 12,40 € registada.");
    expect(screen.getByRole("row", { name: /Abrir os custos da 45-XZ-78: Portagens de 14\/10\/2026, 12,40/ })).toBeInTheDocument();
    const f = await ficha("45-XZ-78", "Custos");
    expect(within(f).getAllByText("12,40 €").length).toBeGreaterThan(0);
    await noHistorico("45-XZ-78", "Despesa", "Despesa de 12,40 € registada.");
    naAtividade("Despesa", "Despesa de 12,40 € registada.", "45-XZ-78");
  });

  it("importar o extrato: custos com 'Rever km', Atividade, e não importa duas vezes", async () => {
    abrirEm("/frota/custos");
    const antes = lerFrotaExemplo().custos.length;
    fireEvent.click(screen.getByRole("button", { name: "Importar extrato" }));
    const dlg = await screen.findByRole("dialog", { name: "Importar extrato do cartão frota" });
    fireEvent.click(within(dlg).getByRole("button", { name: /^Importar \d+ linhas$/ }));
    await fechou("Importar extrato do cartão frota");
    expect(aviso()).toHaveTextContent(/abastecimentos importados/);
    expect(lerFrotaExemplo().custos.length).toBeGreaterThan(antes);
    expect(screen.getAllByText("Rever km").length).toBeGreaterThan(0);
    naAtividade("Importação", /abastecimentos importados/);
    ir("/frota/custos");
    fireEvent.click(screen.getByRole("button", { name: "Importar extrato" }));
    const dlg2 = await screen.findByRole("dialog", { name: "Importar extrato do cartão frota" });
    fireEvent.click(within(dlg2).getByRole("button", { name: /^Importar \d+ linhas$/ }));
    expect((await within(dlg2).findAllByText(/já foi importado/)).length).toBeGreaterThan(0);
  });
});

describe("Estado, ocorrências, documentos, viatura nova e carrinha", () => {
  it("mudar o estado na ficha: Viaturas, ficha, Histórico e Atividade", async () => {
    const f = await ficha("45-XZ-78");
    fireEvent.click(within(f).getByRole("button", { name: "Mudar estado" }));
    const dlg = await screen.findByRole("dialog", { name: "Mudar estado da viatura" });
    await preencher(dlg, { "Novo estado": "parada", Motivo: "À espera de peças" }, "Mudar estado");
    await fechou("Mudar estado da viatura");
    expect(aviso()).toHaveTextContent("45-XZ-78 passou a “Parada”.");
    ir("/frota/viaturas");
    expect(screen.getByRole("row", { name: "Abrir a 45-XZ-78" })).toHaveTextContent("Parada");
    await noHistorico("45-XZ-78", "Estado", "45-XZ-78 passou a “Parada”.");
    naAtividade("Estado", "45-XZ-78 passou a “Parada”.", "45-XZ-78");
  });

  it("registar uma multa e identificar o condutor: Ocorrências, ficha, Hoje, contadores do menu e Atividade", async () => {
    abrirEm("/frota/ocorrencias");
    const antes = contadores();
    fireEvent.click(screen.getByRole("button", { name: "Registar ocorrência" }));
    const dlg = await screen.findByRole("dialog", { name: "Registar ocorrência" });
    await preencher(dlg, { Viatura: "v2", Tipo: "Multa", "Data e hora": "2026-10-12T09:30", Local: "IC19, Sintra", "Valor (€)": "60", "O que aconteceu": "Excesso de velocidade de teste" }, "Registar");
    await fechou("Registar ocorrência");
    expect(aviso()).toHaveTextContent("Multa registada na 45-XZ-78.");
    expect(screen.getByText("Excesso de velocidade de teste")).toBeInTheDocument();
    expect(contadores().ocorrencias).toBe((antes.ocorrencias ?? 0) + 1);
    expect(contadores().hoje).toBe((antes.hoje ?? 0) + 1);
    ir("/frota/hoje");
    expect(screen.getByRole("button", { name: /Multas por identificar/ })).toHaveTextContent(String((antes.ocorrencias ?? 0) + 1));
    const f = await ficha("45-XZ-78", "Ocorrências");
    expect(within(f).getByText("Excesso de velocidade de teste")).toBeInTheDocument();
    await noHistorico("45-XZ-78", "Ocorrência", "Multa registada na 45-XZ-78.");
    naAtividade("Ocorrência", "Multa registada na 45-XZ-78.", "45-XZ-78");
    // identificar o condutor: a multa sai das pendentes e os contadores descem
    ir("/frota/ocorrencias");
    const linha = screen.getAllByRole("row").find((r) => within(r).queryByText("Excesso de velocidade de teste"))!;
    fireEvent.click(within(linha).getByRole("button", { name: "Identificar condutor" }));
    const dlg2 = await screen.findByRole("dialog", { name: "Identificar condutor" });
    await preencher(dlg2, { Condutor: "p2" }, "Identificar e notificar");
    await fechou("Identificar condutor");
    expect(aviso()).toHaveTextContent("Condutor identificado: Rui Alves.");
    expect(contadores().ocorrencias).toBe(antes.ocorrencias);
    expect(contadores().hoje).toBe(antes.hoje);
    await noHistorico("45-XZ-78", "Condutor identificado", "Condutor identificado: Rui Alves. Notificação enviada.");
    naAtividade("Condutor identificado", "Condutor identificado: Rui Alves. Notificação enviada.", "45-XZ-78");
  });

  it("marcar uma ocorrência resolvida: estado, ficha e Atividade", async () => {
    abrirEm("/frota/ocorrencias");
    const linha = screen.getAllByRole("row").find((r) => within(r).queryByText(/Riscos e mossa na porta lateral/))!;
    fireEvent.click(within(linha).getByRole("button", { name: "Marcar resolvida" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Marcar resolvida" }));
    await waitFor(() => expect(aviso()).toHaveTextContent("Ocorrência marcada como resolvida."));
    const depois = screen.getAllByRole("row").find((r) => within(r).queryByText(/Riscos e mossa na porta lateral/))!;
    expect(within(depois).getByText("Resolvido")).toBeInTheDocument();
    await noHistorico("AA-12-BC", "Ocorrência resolvida", "Ocorrência marcada como resolvida.");
    naAtividade("Ocorrência resolvida", "Ocorrência marcada como resolvida.", "AA-12-BC");
  });

  it("renovar a IPO vencida: Documentos, Hoje, ficha, custos e Atividade", async () => {
    abrirEm("/frota/documentos?vista=vencidos");
    fireEvent.click(screen.getByRole("button", { name: "Renovar Inspeção (IPO) da 12-TT-90" }));
    const dlg = await screen.findByRole("dialog", { name: "Renovar documento" });
    await preencher(dlg, { "Nova validade": "2027-10-05", "Valor pago (€)": "37.3" }, "Guardar");
    await fechou("Renovar documento");
    expect(aviso()).toHaveTextContent("Inspeção (IPO) da 12-TT-90 renovado até 05/10/2027.");
    expect(screen.queryByRole("button", { name: "Renovar Inspeção (IPO) da 12-TT-90" })).toBeNull();
    ir("/frota/hoje");
    expect(screen.getByRole("button", { name: /Documentos vencidos/ })).not.toHaveTextContent("12-TT-90");
    const f = await ficha("12-TT-90", "Documentos");
    expect(within(f).getByText("Válido até 05/10/2027")).toBeInTheDocument();
    ir("/frota/custos");
    expect(screen.getByRole("row", { name: /Abrir os custos da 12-TT-90: Oficina de 14\/10\/2026, 37,30/ })).toBeInTheDocument();
    await noHistorico("12-TT-90", "Documento renovado", "Inspeção (IPO) da 12-TT-90 renovado até 05/10/2027.");
    naAtividade("Documento renovado", "Inspeção (IPO) da 12-TT-90 renovado até 05/10/2027.", "12-TT-90");
  });

  it("criar uma viatura: Viaturas, calendário, contador do menu, ficha e Atividade", async () => {
    abrirEm("/frota/viaturas");
    const antes = contadores().viaturas ?? 0;
    fireEvent.click(screen.getByRole("button", { name: "Nova viatura" }));
    const dlg = await screen.findByRole("dialog", { name: "Nova viatura" });
    await preencher(dlg, { "Matrícula": "AB-12-CD", Marca: "Fiat", Modelo: "Doblò Cargo", Ano: "2024", "Km atuais": "1200", "Seguro válido até": "2027-06-30", "Inspeção (IPO) até": "2028-06-30", "IUC até": "2027-05-31" }, "Criar viatura");
    await fechou("Nova viatura");
    expect(aviso()).toHaveTextContent("Viatura AB-12-CD criada (exemplo).");
    expect(contadores().viaturas).toBe(antes + 1);
    // abre logo a ficha da viatura nova
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("AB-12-CD"));
    ir("/frota/viaturas");
    expect(screen.getByRole("row", { name: "Abrir a AB-12-CD" })).toBeInTheDocument();
    ir("/frota/atribuicoes");
    expect(linhaCalendario("AB-12-CD")).toBeInTheDocument();
    await noHistorico("AB-12-CD", "Nova viatura", "Viatura AB-12-CD criada.");
    naAtividade("Nova viatura", "Viatura AB-12-CD criada.", "AB-12-CD");
  });

  it("pedir reposição da carrinha: pedido na ficha (stock e Histórico), Atividade, e não repete o mesmo pedido", async () => {
    const F = lerFrotaExemplo();
    const v = F.viaturas.find((x) => x.armazem && abaixoMin(stockCarrinhaExemplo(x)).length);
    expect(v, "há uma carrinha de exemplo abaixo do mínimo").toBeTruthy();
    const n = abaixoMin(stockCarrinhaExemplo(v)).length;
    const f = await ficha(v!.mat, "Stock na carrinha");
    fireEvent.click(within(f).getByRole("button", { name: `Pedir reposição ao armazém central (${n})` }));
    await waitFor(() => expect(within(f).getByRole("heading", { name: "Pedidos de reposição" })).toBeInTheDocument());
    expect(within(f).getAllByText("Pedido").length).toBeGreaterThanOrEqual(n);
    expect(lerFrotaExemplo().pedidos?.filter((p) => p.vid === v!.id)).toHaveLength(n);
    expect(screen.getByTestId("aviso-ficha")).toHaveTextContent(`Pedido de reposição registado no exemplo: armazém central → carrinha ${v!.mat}`);
    // outra vez: recusa e diz porquê, sem duplicar
    fireEvent.click(within(f).getByRole("button", { name: `Pedir reposição ao armazém central (${n})` }));
    await waitFor(() => expect(screen.getByTestId("aviso-ficha")).toHaveTextContent("Já há pedidos de reposição pendentes"));
    expect(lerFrotaExemplo().pedidos?.filter((p) => p.vid === v!.id)).toHaveLength(n);
    await noHistorico(v!.mat, "Pedido de reposição", /^Pedido de reposição registado no exemplo/);
    naAtividade("Pedido de reposição", /^Pedido de reposição registado no exemplo/, v!.mat);
  });

  it("repor os dados de exemplo: apaga o que se fez e a Atividade começa com essa entrada", async () => {
    const f = await ficha("AA-12-BC");
    fireEvent.click(within(f).getByRole("button", { name: "Registar km" }));
    const dlg = await screen.findByRole("dialog", { name: "Registar km" });
    await preencher(dlg, { "Km no conta-quilómetros": "148600" }, "Registar");
    await fechou("Registar km");
    ir("/frota/hoje");
    fireEvent.click(screen.getByRole("button", { name: /Repor dados de exemplo/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Repor" }));
    await waitFor(() => expect(aviso()).toHaveTextContent("Dados de exemplo repostos."));
    expect(lerFrotaExemplo().viaturas.find((v) => v.id === "v1")?.km).toBe(148230);
    naAtividade("Dados repostos", "Dados de exemplo repostos.");
    expect(screen.queryByText(/^Km registados/)).toBeNull();
  });
});
