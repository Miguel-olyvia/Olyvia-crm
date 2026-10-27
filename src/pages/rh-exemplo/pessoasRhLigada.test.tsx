// A lista de Pessoas de /rh-exemplo ligada como a real (Pessoas.tsx): botões de configuração atrás de permissão, ?tab= validado,
// aba da ficha no URL (?aba=) incluindo as ligações antigas ?tab=laborais / ?tab=contratos, estado sem organização e fecho da
// ficha ao mudar de organização. Supabase simulado: os hooks de dados são substituídos, nada toca na base.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string) => chave }),
}));

const estado = vi.hoisted(() => ({
  empresa: { activeCompany: { id: "org-1", name: "Org 1" }, companies: [], isLoading: false, semOrganizacao: false } as Record<string, unknown>,
  permissoes: new Set<string>(),
}));
vi.mock("@/components/rh-exemplo/hooks/useCompany", () => ({ useCompany: () => estado.empresa }));
vi.mock("@/components/rh-exemplo/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => estado.permissoes.has(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => estado.permissoes.has(p)),
    permissions: [...estado.permissoes],
    loading: false,
  }),
}));
vi.mock("@/components/rh-exemplo/hooks/usePessoas", () => ({
  usePessoas: () => ({
    pessoas: [], stats: { activos: 0, entradas90d: 0, saidas90d: 0 }, loading: false, error: null, criarPessoa: vi.fn(),
  }),
}));
vi.mock("@/components/rh-exemplo/hooks/useLocaisTrabalho", () => ({ useLocaisTrabalho: () => ({ locais: [] }) }));
vi.mock("@/components/rh-exemplo/hooks/useEstadoAdmissaoPorPessoa", () => ({
  useEstadoAdmissaoPorPessoa: () => ({ porAprovar: 0, estadoPorPessoa: new Map(), erro: false, incompleto: false }),
}));
vi.mock("@/components/rh-exemplo/hooks/PipelineAdmissoesReal", () => ({ PipelineAdmissoes: () => <div /> }));
vi.mock("@/components/rh-exemplo/fimContrato/ContratosATerminarTab", () => ({ ContratosATerminarTab: () => <div /> }));
vi.mock("@/components/rh-exemplo/PessoasFuncoesTab", () => ({ PessoasFuncoesTab: () => <div /> }));
vi.mock("@/components/rh-exemplo/NovaPessoaDialogo", () => ({ NovaPessoaDialogo: () => null }));
vi.mock("@/components/NoOrganizationState", () => ({ NoOrganizationState: () => <p>sem-organizacao</p> }));
vi.mock("@/components/rh-exemplo/ficha/FichaPessoaRh", () => ({
  FichaPessoaRh: (p: { id: string | null; aberta: boolean; aba?: string; aoMudarAba?: (aba: string) => void }) => (
    <div data-testid="ficha" data-id={p.id ?? ""} data-aberta={String(p.aberta)} data-aba={p.aba ?? ""}>
      <button type="button" onClick={() => p.aoMudarAba?.("documentos")}>mudar-aba</button>
    </div>
  ),
}));

import PessoaRhDetalhe from "./PessoaRhDetalhe";

function Sonda() {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
}

const montar = (endereco: string) =>
  render(
    <MemoryRouter initialEntries={[endereco]}>
      <Routes>
        <Route path="/rh-exemplo/pessoas/:id?" element={<PessoaRhDetalhe />} />
      </Routes>
      <Sonda />
    </MemoryRouter>,
  );

const url = () => screen.getByTestId("url").textContent;

beforeEach(() => {
  cleanup();
  estado.empresa = { activeCompany: { id: "org-1", name: "Org 1" }, companies: [], isLoading: false, semOrganizacao: false };
  estado.permissoes = new Set(["hr.pessoas.create"]);
});

describe("Pessoas (rh-exemplo): botões de configuração", () => {
  it("sem as permissões não há «Campos de admissão» nem «Regras de fim de contrato»", () => {
    montar("/rh-exemplo/pessoas");
    expect(screen.queryByRole("button", { name: "rhA.pessoas.camposAdmissao" })).toBeNull();
    expect(screen.queryByRole("button", { name: "rhA.pessoas.regrasFimContrato" })).toBeNull();
    expect(screen.getByRole("button", { name: "hr.pessoas.new" })).toBeTruthy();
  });

  it("cada botão aparece só com a sua permissão", () => {
    estado.permissoes = new Set(["hr.admissao.obrigatorios.gerir"]);
    montar("/rh-exemplo/pessoas");
    expect(screen.getByRole("button", { name: "rhA.pessoas.camposAdmissao" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "rhA.pessoas.regrasFimContrato" })).toBeNull();
    cleanup();
    estado.permissoes = new Set(["hr.contratos.regras.gerir"]);
    montar("/rh-exemplo/pessoas");
    expect(screen.getByRole("button", { name: "rhA.pessoas.regrasFimContrato" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "rhA.pessoas.camposAdmissao" })).toBeNull();
  });
});

describe("Pessoas (rh-exemplo): separador do URL", () => {
  it("um ?tab= desconhecido cai em Pessoas", () => {
    montar("/rh-exemplo/pessoas?tab=nao-existe");
    expect(screen.getByRole("tab", { name: "hr.subtabs.pessoas", selected: true })).toBeTruthy();
  });

  it("?tab=contratos sem hr.pessoas.vinculos.view cai em Pessoas e não mostra o separador", () => {
    montar("/rh-exemplo/pessoas?tab=contratos");
    expect(screen.getByRole("tab", { name: "hr.subtabs.pessoas", selected: true })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "hr.subtabs.contratos" })).toBeNull();
  });

  it("?tab=contratos com a permissão abre o separador de contratos", () => {
    estado.permissoes = new Set(["hr.pessoas.vinculos.view"]);
    montar("/rh-exemplo/pessoas?tab=contratos");
    expect(screen.getByRole("tab", { name: "hr.subtabs.contratos", selected: true })).toBeTruthy();
  });
});

describe("Pessoas (rh-exemplo): aba da ficha no URL", () => {
  it("a ligação antiga /pessoas/:id?tab=laborais abre a ficha na aba laborais e passa a ?aba=laborais", () => {
    montar("/rh-exemplo/pessoas/p1?tab=laborais");
    expect(screen.getByTestId("ficha").getAttribute("data-aba")).toBe("laborais");
    expect(screen.getByTestId("ficha").getAttribute("data-aberta")).toBe("true");
    expect(url()).toBe("/rh-exemplo/pessoas/p1?aba=laborais");
    // E o separador da lista não ficou preso a «laborais».
    expect(screen.getByRole("tab", { name: "hr.subtabs.pessoas", selected: true })).toBeTruthy();
  });

  it("a ligação de «Contratos a terminar» (?tab=contratos com ficha) escolhe a aba Contratos da ficha", () => {
    estado.permissoes = new Set(["hr.pessoas.vinculos.view"]);
    montar("/rh-exemplo/pessoas/p1?tab=contratos");
    expect(screen.getByTestId("ficha").getAttribute("data-aba")).toBe("contratos");
    expect(url()).toBe("/rh-exemplo/pessoas/p1?aba=contratos");
  });

  it("mudar de aba na ficha escreve ?aba= e mantém o caminho", () => {
    montar("/rh-exemplo/pessoas/p1");
    fireEvent.click(screen.getByRole("button", { name: "mudar-aba" }));
    expect(url()).toBe("/rh-exemplo/pessoas/p1?aba=documentos");
    expect(screen.getByTestId("ficha").getAttribute("data-aba")).toBe("documentos");
  });
});

describe("Pessoas (rh-exemplo): organização", () => {
  it("sem organização ativa mostra o estado «sem organização» e não a lista", () => {
    estado.empresa = { activeCompany: { id: "", name: "" }, companies: [], isLoading: false, semOrganizacao: true };
    montar("/rh-exemplo/pessoas");
    expect(screen.getByText("sem-organizacao")).toBeTruthy();
    expect(screen.queryByTestId("ficha")).toBeNull();
  });

  it("mudar de organização fecha a ficha aberta e limpa a aba do URL", () => {
    const { rerender } = montar("/rh-exemplo/pessoas/p1?aba=documentos");
    expect(screen.getByTestId("ficha").getAttribute("data-aberta")).toBe("true");
    estado.empresa = { activeCompany: { id: "org-2", name: "Org 2" }, companies: [], isLoading: false, semOrganizacao: false };
    act(() => {
      rerender(
        <MemoryRouter initialEntries={["/rh-exemplo/pessoas/p1?aba=documentos"]}>
          <Routes>
            <Route path="/rh-exemplo/pessoas/:id?" element={<PessoaRhDetalhe />} />
          </Routes>
          <Sonda />
        </MemoryRouter>,
      );
    });
    expect(screen.getByTestId("ficha").getAttribute("data-aberta")).toBe("false");
    expect(url()).toBe("/rh-exemplo/pessoas");
  });
});
