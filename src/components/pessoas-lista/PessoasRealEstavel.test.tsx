// O aoAbrir que a Lista dá à tabela tem de ser a mesma referência entre renders (senão o memo da tabela e das linhas não vale de nada),
// e guarda o botão clicado como origem do foco.
import { forwardRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { listaBase, pessoaLista } from "./fabricaLista";
import { PessoasReal } from "./PessoasReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
// A «Nova lead» do cabeçalho (P7) tem testes próprios; aqui não interessa. Sem permissão `leads.create`, o botão não se desenha.
vi.mock("@/components/pessoas-leads/NovaLeadReal", () => ({ NovaLeadReal: () => null }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => false, hasAnyPermission: () => false, permissions: [], loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
// Estes testes são do foco, do endereço e da ficha, não das leituras em lote por página (têm o seu ficheiro: PessoasRealColunas.test.tsx).
const semLeituras = vi.hoisted(() => new Map());
vi.mock("@/hooks/pessoas/useContactosPessoas", () => ({ useContactosPessoas: () => semLeituras }));
vi.mock("@/hooks/pessoas/useNomesResponsaveis", () => ({ useNomesResponsaveis: () => semLeituras }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
const listaMock = vi.hoisted(() => vi.fn());
const tabelaMock = vi.hoisted(() => vi.fn());
const fichaProps = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/useListaPessoas", () => ({ useListaPessoas: () => listaMock() }));
vi.mock("@/hooks/pessoas/useQuadroPessoas", async () => (await import("./fabricaQuadro")).moduloSemQuadro());
vi.mock("./TabelaListaReal", () => ({ TabelaListaReal: forwardRef((p: unknown, _ref) => { tabelaMock(p); return null; }) }));
vi.mock("./FichaReal", () => ({ FichaReal: (p: { children?: unknown }) => { fichaProps(p); return p.children; } }));

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function Local() {
  const l = useLocation();
  return <output data-testid="url">{l.search}</output>;
}

beforeEach(() => {
  tabelaMock.mockReset();
  fichaProps.mockReset();
  listaMock.mockReturnValue(listaBase({ linhas: [pessoaLista(A), pessoaLista(B)] }));
});

const desenhar = () => render(
  <FontePessoasContext.Provider value={REAL}><MemoryRouter><PessoasReal /><Local /></MemoryRouter></FontePessoasContext.Provider>,
);
const ultimaTabela = () => tabelaMock.mock.calls[tabelaMock.mock.calls.length - 1][0] as { aoAbrir: (id: string, origem?: HTMLElement) => void; linhas: unknown[] };
const ultimaFicha = () => fichaProps.mock.calls[fichaProps.mock.calls.length - 1][0] as {
  aoIrPara: (id: string) => void; idsVisiveis: string[]; origemFoco: { current: HTMLElement | null }; pessoaId: string | null;
};

describe("PessoasReal: referências estáveis", () => {
  it("aoAbrir não muda quando o endereço muda (abrir, trocar de pessoa, fechar)", () => {
    desenhar();
    const inicial = ultimaTabela().aoAbrir;
    act(() => ultimaTabela().aoAbrir(A));
    expect(screen.getByTestId("url").textContent).toBe(`?open=${A}`);
    expect(ultimaTabela().aoAbrir).toBe(inicial);
    act(() => ultimaFicha().aoIrPara(B));
    expect(screen.getByTestId("url").textContent).toBe(`?open=${B}`);
    expect(ultimaTabela().aoAbrir).toBe(inicial);
    const todas = new Set(tabelaMock.mock.calls.map((c) => (c[0] as { aoAbrir: unknown }).aoAbrir));
    expect(todas.size).toBe(1);
  });

  it("aoIrPara também é estável, e a abertura usa sempre o abrir mais recente (a pessoa certa no endereço)", () => {
    desenhar();
    const inicial = ultimaFicha().aoIrPara;
    act(() => ultimaTabela().aoAbrir(A));
    act(() => ultimaFicha().aoIrPara(B));
    act(() => ultimaFicha().aoIrPara(A));
    expect(ultimaFicha().aoIrPara).toBe(inicial);
    expect(screen.getByTestId("url").textContent).toBe(`?open=${A}`);
  });

  it("idsVisiveis não é refeito quando só o endereço muda", () => {
    desenhar();
    const antes = ultimaFicha().idsVisiveis;
    act(() => ultimaTabela().aoAbrir(A));
    expect(ultimaFicha().idsVisiveis).toBe(antes);
  });
});

describe("PessoasReal: a origem do foco guarda-se no clique", () => {
  it("o elemento clicado fica em origemFoco, que a ficha usa ao fechar", () => {
    desenhar();
    const botao = document.createElement("button");
    act(() => ultimaTabela().aoAbrir(A, botao));
    expect(ultimaFicha().origemFoco.current).toBe(botao);
  });

  it("abrir sem elemento (teclas [ e ]) não deixa uma origem antiga", () => {
    desenhar();
    const botao = document.createElement("button");
    act(() => ultimaTabela().aoAbrir(A, botao));
    act(() => ultimaFicha().aoIrPara(B));
    expect(ultimaFicha().origemFoco.current).toBe(botao); // a origem do primeiro clique continua a ser a de regresso
  });
});
