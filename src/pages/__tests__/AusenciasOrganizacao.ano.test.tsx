import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AusenciaDia, AusenciaTipo } from "@/types/hrAusencias";

// Separador "Ano" de AusenciasOrganizacao: escolhe-se uma pessoa num dropdown
// e ve-se o calendario anual dela (o mesmo componente `CalendarioAnual` da
// ficha individual), com os dias de ausencia coloridos por tipo.

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

vi.mock("@/hooks/useAusenciasTipos", () => ({
  useAusenciasTipos: () => ({
    tipos: [TIPO_FERIAS],
    activos: [TIPO_FERIAS],
    porId: new Map([[TIPO_FERIAS.id, TIPO_FERIAS]]),
    loading: false,
  }),
}));

const DIAS: AusenciaDia[] = [
  {
    id: "dia-1",
    pedido_id: "pedido-1",
    pessoa_id: "pessoa-ana",
    organization_id: "org-nike",
    tipo_id: TIPO_FERIAS.id,
    data: `${new Date().getFullYear()}-06-10`,
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
    data: `${new Date().getFullYear()}-06-11`,
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
// lista de pessoas aparece e que escolher uma troca os dados do calendario --
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

describe("AusenciasOrganizacao: separador Ano", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("mostra a lista de pessoas para escolher", async () => {
    await renderPagina();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Ano" }), { button: 0 });

    expect(screen.getByText("Pessoa")).toBeTruthy();
    const opcoes = screen.getAllByRole("option").map((opcao) => opcao.textContent);
    expect(opcoes).toContain("Ana Silva");
    expect(opcoes).toContain("Bruno Costa");
  });

  it("sem pessoa escolhida, nao mostra o calendario", async () => {
    await renderPagina();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Ano" }), { button: 0 });

    expect(screen.getByText("Escolhe uma pessoa para ver o ano dela")).toBeTruthy();
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("ao escolher uma pessoa, mostra o calendario anual dela com os dias coloridos por tipo", async () => {
    await renderPagina();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Ano" }), { button: 0 });

    fireEvent.change(screen.getByLabelText("Pessoa"), { target: { value: "pessoa-ana" } });

    const grelhas = screen.getAllByRole("grid");
    expect(grelhas.length).toBe(12);

    const diaMarcado = screen.getByRole("gridcell", {
      name: /10.*Férias.*aprovado|Férias.*10.*aprovado/i,
    });
    expect(diaMarcado).toBeTruthy();
    expect((diaMarcado as HTMLElement).style.backgroundColor).not.toBe("");
  });

  it("os dias da outra pessoa (Bruno) nao aparecem no calendario da Ana", async () => {
    await renderPagina();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Ano" }), { button: 0 });

    fireEvent.change(screen.getByLabelText("Pessoa"), { target: { value: "pessoa-ana" } });

    const junho = screen.getAllByRole("grid").find((grelha) =>
      grelha.getAttribute("aria-label")?.toLowerCase().startsWith("jun"),
    );
    expect(junho).toBeTruthy();
    const diaOnze = within(junho as HTMLElement).getByText("11");
    expect(diaOnze.closest("button")?.getAttribute("title")).toMatch(/sem ausência/i);
  });
});
