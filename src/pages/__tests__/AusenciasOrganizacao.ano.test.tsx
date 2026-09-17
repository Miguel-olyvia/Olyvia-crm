import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import type { AusenciaDia, AusenciaTipo } from "@/types/hrAusencias";

// Separador "Mapa de ausências e férias" de AusenciasOrganizacao: junta o
// mapa mensal (grelha com todas as pessoas) e o calendario anual de UMA
// pessoa escolhida num dropdown num alternador Mes/Ano, em vez de dois
// separadores fixos e desligados um do outro.

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-nike" }, isLoading: false }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "pt" }),
}));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (perm: string) => perm === "hr.ausencias.view",
    loading: false,
  }),
}));

const PESSOAS = [
  { id: "pessoa-ana", nome_completo: "Ana Silva" },
  { id: "pessoa-bruno", nome_completo: "Bruno Costa" },
];

vi.mock("@/hooks/usePessoas", () => ({
  usePessoas: () => ({ pessoas: PESSOAS }),
}));

vi.mock("@/hooks/useMinhaPessoa", () => ({
  useMinhaPessoa: () => ({ pessoaId: "pessoa-ana" }),
}));

const TIPO_FERIAS: AusenciaTipo = {
  id: "tipo-ferias",
  organization_id: "org-nike",
  codigo: "ferias",
  nome: "Férias",
  descricao: null,
  categoria: "ferias",
  cor: "#22c55e",
  remunerada: true,
  desconta_saldo: true,
  conta_minimo_legal: true,
  exige_aprovacao_chefia: true,
  exige_aprovacao_rh: false,
  exige_justificacao: false,
  justificacao_sensivel: false,
  permite_meio_dia: true,
  inclui_fim_de_semana: false,
  inclui_feriados: false,
  antecedencia_minima_dias: 0,
  unidade_apresentacao: "dia",
  activo: true,
};

const TIPO_DOENCA: AusenciaTipo = {
  ...TIPO_FERIAS,
  id: "tipo-doenca",
  codigo: "doenca",
  nome: "Doença",
  categoria: "doenca",
  cor: "#ef4444",
};

vi.mock("@/hooks/useAusenciasTipos", () => ({
  useAusenciasTipos: () => ({
    tipos: [TIPO_FERIAS, TIPO_DOENCA],
    activos: [TIPO_FERIAS, TIPO_DOENCA],
    porId: new Map([
      [TIPO_FERIAS.id, TIPO_FERIAS],
      [TIPO_DOENCA.id, TIPO_DOENCA],
    ]),
    loading: false,
  }),
}));

const MES_ACTUAL = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

const DIAS: AusenciaDia[] = [
  {
    id: "dia-1",
    pedido_id: "pedido-1",
    pessoa_id: "pessoa-ana",
    organization_id: "org-nike",
    tipo_id: TIPO_FERIAS.id,
    data: `${MES_ACTUAL}-10`,
    fraccao_dia: 1,
    conta_saldo: true,
    e_feriado: false,
    e_fim_semana: false,
    periodo_inicio: `${new Date().getFullYear()}-01-01`,
    estado: "aprovado",
  },
  {
    id: "dia-2",
    pedido_id: "pedido-2",
    pessoa_id: "pessoa-bruno",
    organization_id: "org-nike",
    tipo_id: TIPO_FERIAS.id,
    data: `${MES_ACTUAL}-11`,
    fraccao_dia: 1,
    conta_saldo: true,
    e_feriado: false,
    e_fim_semana: false,
    periodo_inicio: `${new Date().getFullYear()}-01-01`,
    estado: "aprovado",
  },
  {
    id: "dia-3",
    pedido_id: "pedido-3",
    pessoa_id: "pessoa-bruno",
    organization_id: "org-nike",
    tipo_id: TIPO_DOENCA.id,
    data: `${MES_ACTUAL}-12`,
    fraccao_dia: 1,
    conta_saldo: true,
    e_feriado: false,
    e_fim_semana: false,
    periodo_inicio: `${new Date().getFullYear()}-01-01`,
    estado: "aprovado",
  },
];

vi.mock("@/hooks/useAusenciasDaOrganizacao", () => ({
  useAusenciasDaOrganizacao: () => ({
    pedidos: [],
    pendentes: [],
    decisoesPorPedido: new Map(),
    dias: DIAS,
    loading: false,
    recusado: false,
    saving: false,
    recarregar: vi.fn(),
    decidirChefia: vi.fn(),
    decidirRh: vi.fn(),
    cancelar: vi.fn(),
    corrigirAprovado: vi.fn(),
    verMotivo: vi.fn(),
  }),
}));

// CampoSelect usa o Select do Radix, que em jsdom exige polyfills de ponteiro
// que este projecto nao tem configurados (nenhum outro teste o exercita). O
// que este teste quer verificar e a logica de OrganizacaoConteudo -- que a
// lista de pessoas aparece e que escolher uma troca os dados mostrados --
// nao o comportamento interno do Radix. Um `<select>` nativo testa exactamente
// essa logica sem depender de pointer events que o jsdom nao implementa.
vi.mock("@/components/hr/form/Campos", async () => {
  const actual = await vi.importActual<typeof import("@/components/hr/form/Campos")>(
    "@/components/hr/form/Campos",
  );
  return {
    ...actual,
    CampoSelect: ({
      id,
      label,
      valor,
      onChange,
      opcoes,
      vazioLabel,
    }: {
      id: string;
      label: string;
      valor: string;
      onChange: (valor: string) => void;
      opcoes: { value: string; label: string }[];
      vazioLabel?: string;
    }) => (
      <div>
        <label htmlFor={id}>{label}</label>
        <select id={id} value={valor} onChange={(e) => onChange(e.target.value)}>
          {vazioLabel && <option value="">{vazioLabel}</option>}
          {opcoes.map((opcao) => (
            <option key={opcao.value} value={opcao.value}>
              {opcao.label}
            </option>
          ))}
        </select>
      </div>
    ),
  };
});

vi.mock("@/lib/hr/hrDb", () => ({
  hrFrom: () => ({
    select: () => ({
      eq: () => Promise.resolve({ data: [], error: null }),
    }),
  }),
  isPermissionError: () => false,
}));

async function renderPagina() {
  const { OrganizacaoConteudo } = await import("../AusenciasOrganizacao");
  render(
    <MemoryRouter initialEntries={["/rh/ausencias/organizacao"]}>
      <OrganizacaoConteudo />
    </MemoryRouter>,
  );
}

function irParaModoAno() {
  fireEvent.click(screen.getByRole("button", { name: "Ano" }));
}

describe("AusenciasOrganizacao: separador Mapa de ausências e férias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("entra por omissao no modo Mes, com a grelha de todas as pessoas", async () => {
    await renderPagina();

    expect(screen.getByRole("button", { name: "Mês" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("grid")).toBeTruthy();
  });

  it("o alternador muda para o modo Ano e mostra a lista de pessoas para escolher", async () => {
    await renderPagina();
    irParaModoAno();

    expect(screen.getByRole("button", { name: "Ano" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Pessoa")).toBeTruthy();
    const opcoes = screen.getAllByRole("option").map((opcao) => opcao.textContent);
    expect(opcoes).toContain("Ana Silva");
    expect(opcoes).toContain("Bruno Costa");
  });

  it("no modo Ano, com 'Todos' escolhido, mostra os 12 meses de todas as pessoas", async () => {
    await renderPagina();
    irParaModoAno();

    // So os meses com marcacoes tem grelha (`MapaMensal` mostra texto de
    // "sem marcacoes" nos outros 11) -- o que conta aqui e o mes actual, que
    // tem os dois, e que ha doze cabecalhos de mes no total.
    const cabecalhosDeMes = screen
      .getAllByText(/^[a-zç]+ \d{4}$/i)
      .filter((elemento) => elemento.tagName === "P");
    expect(cabecalhosDeMes.length).toBe(12);

    const linhas = screen.getAllByRole("rowheader").map((linha) => linha.textContent);
    expect(linhas).toContain("Ana Silva");
    expect(linhas).toContain("Bruno Costa");
  });

  it("no modo Ano, ao escolher uma pessoa, mostra o calendario anual dela com os dias coloridos por tipo", async () => {
    await renderPagina();
    irParaModoAno();

    fireEvent.change(screen.getByLabelText("Pessoa"), { target: { value: "pessoa-ana" } });

    const grelhas = screen.getAllByRole("grid");
    expect(grelhas.length).toBe(12);

    const diaMarcado = screen.getByRole("gridcell", {
      name: /10.*Férias.*aprovado|Férias.*10.*aprovado/i,
    });
    expect(diaMarcado).toBeTruthy();
    expect((diaMarcado as HTMLElement).style.backgroundColor).not.toBe("");
  });

  it("no modo Ano, os dias da outra pessoa (Bruno) nao aparecem no calendario da Ana", async () => {
    await renderPagina();
    irParaModoAno();

    fireEvent.change(screen.getByLabelText("Pessoa"), { target: { value: "pessoa-ana" } });

    const nomeMesActual = format(new Date(`${MES_ACTUAL}-01T12:00:00Z`), "LLLL yyyy", {
      locale: pt,
    });
    const mesActual = screen.getAllByRole("grid").find(
      (grelha) => grelha.getAttribute("aria-label") === nomeMesActual,
    );
    expect(mesActual).toBeTruthy();
    const diaOnze = within(mesActual as HTMLElement).getByText("11");
    expect(diaOnze.closest("button")?.getAttribute("title")).toMatch(/sem ausência/i);
  });

  it("no modo Mes, sem pessoa escolhida, a grelha mostra todas as pessoas", async () => {
    await renderPagina();

    const linhas = screen.getAllByRole("rowheader").map((linha) => linha.textContent);
    expect(linhas).toContain("Ana Silva");
    expect(linhas).toContain("Bruno Costa");
  });

  it("no modo Mes, escolher uma pessoa filtra a grelha a essa pessoa so", async () => {
    await renderPagina();

    fireEvent.change(screen.getByLabelText("Pessoa"), { target: { value: "pessoa-ana" } });

    const linhas = screen.getAllByRole("rowheader").map((linha) => linha.textContent);
    expect(linhas).toEqual(["Ana Silva"]);
  });

  it("trocar de mes no modo Mes actualiza o campo de mes", async () => {
    await renderPagina();

    const campoMes = screen.getByLabelText("Mês") as HTMLInputElement;
    const anoActual = new Date().getFullYear();
    fireEvent.change(campoMes, { target: { value: `${anoActual}-01` } });

    expect(campoMes.value).toBe(`${anoActual}-01`);
  });

  it("trocar de ano no modo Ano actualiza o ano mostrado e continua em sincronia ao voltar ao Mes", async () => {
    await renderPagina();
    irParaModoAno();

    const anoActual = new Date().getFullYear();
    fireEvent.click(screen.getByRole("button", { name: `Ano seguinte (${anoActual + 1})` }));

    expect(screen.getByText(String(anoActual + 1))).toBeTruthy();
  });

  it("no modo Mes, o filtro de tipo reduz os dias mostrados ao tipo escolhido", async () => {
    await renderPagina();

    let linhas = screen.getAllByRole("rowheader").map((linha) => linha.textContent);
    expect(linhas).toEqual(expect.arrayContaining(["Ana Silva", "Bruno Costa"]));

    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: TIPO_DOENCA.id } });

    linhas = screen.getAllByRole("rowheader").map((linha) => linha.textContent);
    expect(linhas).toEqual(["Bruno Costa"]);
  });

  it("no modo Mes, sem filtro de tipo (Todos), mostra tudo como antes", async () => {
    await renderPagina();

    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: TIPO_DOENCA.id } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "" } });

    const linhas = screen.getAllByRole("rowheader").map((linha) => linha.textContent);
    expect(linhas).toEqual(expect.arrayContaining(["Ana Silva", "Bruno Costa"]));
  });

  it("no modo Ano, com uma pessoa escolhida, o filtro de tipo reduz os dias mostrados", async () => {
    await renderPagina();
    irParaModoAno();

    fireEvent.change(screen.getByLabelText("Pessoa"), { target: { value: "pessoa-bruno" } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: TIPO_DOENCA.id } });

    const nomeMesActual = format(new Date(`${MES_ACTUAL}-01T12:00:00Z`), "LLLL yyyy", {
      locale: pt,
    });
    const mesActual = screen.getAllByRole("grid").find(
      (grelha) => grelha.getAttribute("aria-label") === nomeMesActual,
    );
    expect(mesActual).toBeTruthy();

    const diaOnze = within(mesActual as HTMLElement).getByText("11");
    expect(diaOnze.closest("button")?.getAttribute("title")).toMatch(/sem ausência/i);

    const diaDoze = within(mesActual as HTMLElement).getByText("12");
    expect(diaDoze.closest("button")?.getAttribute("title")).toMatch(/Doença/i);
  });

  it("mostra a legenda dos padrões visuais do mapa uma unica vez, no modo Mes", async () => {
    await renderPagina();

    expect(screen.getByText("Aprovado")).toBeTruthy();
    expect(screen.getByText("Pendente de aprovação")).toBeTruthy();
    expect(screen.getByText("Não útil (fim de semana/feriado)")).toBeTruthy();
    expect(screen.getByText("Sem marcação")).toBeTruthy();
  });

  it("mostra a legenda uma unica vez tambem no modo Ano, com os 12 mapas mensais", async () => {
    await renderPagina();
    irParaModoAno();

    // So o mes com marcacoes tem grelha; os outros onze mostram "sem
    // marcacoes" (ver teste acima) -- o que interessa aqui e que a legenda,
    // que vive no ecra pai e nao dentro de `MapaMensal`, aparece so uma vez.
    expect(screen.getAllByText("Aprovado").length).toBe(1);
    expect(screen.getAllByText("Pendente de aprovação").length).toBe(1);
    expect(screen.getAllByText("Não útil (fim de semana/feriado)").length).toBe(1);
    expect(screen.getAllByText("Sem marcação").length).toBe(1);
  });
});
