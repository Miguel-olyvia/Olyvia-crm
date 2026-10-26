// A Lista real com a ficha: clicar no nome abre a ficha (?open=), Esc fecha e o foco volta ao nome, os filtros mantêm-se.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { fichaDb, pessoaDb } from "@/hooks/pessoas/fichaFabrica";
import type { FiltrosLista } from "@/hooks/pessoas/listaPessoasTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import type { ListaPessoas } from "@/hooks/pessoas/useListaPessoas";
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
const fichaMock = vi.hoisted(() => vi.fn());
const { erroToast } = vi.hoisted(() => ({ erroToast: vi.fn() }));
vi.mock("@/hooks/pessoas/useListaPessoas", () => ({ useListaPessoas: (f: FiltrosLista) => listaMock(f) }));
vi.mock("@/hooks/pessoas/useQuadroPessoas", async () => (await import("./fabricaQuadro")).moduloSemQuadro());
vi.mock("@/hooks/pessoas/useFichaPessoa", () => ({ useFichaPessoa: (id: string | null) => fichaMock(id) }));
vi.mock("@/hooks/pessoas/useAcoesFichaReal", () => ({
  useAcoesFichaReal: () => ({
    registarChamada: vi.fn(), adiar: vi.fn(), encerrar: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(), registarResultadoVisita: vi.fn(),
    capacidades: { chamada: true, encerrar: true, adiar: false, nota: false, visita: false, negocios: false },
  }),
}));
vi.mock("@/hooks/pessoas/useSubmissoesPessoa", () => ({ useSubmissoesPessoa: () => ({ submissoes: [], pendentes: 0, estado: "ok", recarregar: () => undefined }) }));
vi.mock("@/hooks/pessoas/useGuardarIdentidadePessoa", () => ({ useGuardarIdentidadePessoa: () => ({ guardar: async () => ({}) }) }));
vi.mock("@/hooks/pessoas/useGuardarContactoPessoa", () => ({ useGuardarContactoPessoa: () => ({ guardar: async () => ({}) }) }));
vi.mock("@/hooks/pessoas/useSubstituirContactoPessoa", () => ({ useSubstituirContactoPessoa: () => ({ guardar: async () => ({}) }) }));
vi.mock("@/hooks/pessoas/useQualificarLeadPessoa", () => ({ useQualificarLeadPessoa: () => ({ classificar: async () => ({}) }) }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: erroToast } }));
vi.mock("@/components/pessoas/AvatarPessoa", () => ({ AvatarPessoa: () => null }));

beforeAll(prepararRadixNoJsdom);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };
const DUAS = [pessoaLista(A, { nome: "Ana Lopes" }), pessoaLista(B, { nome: "Bruno Reis" })];
const ultimosFiltros = (): FiltrosLista => listaMock.mock.calls[listaMock.mock.calls.length - 1][0];

function Local() {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
}
function Atras() {
  const navegar = useNavigate();
  return <button type="button" onClick={() => navegar(-1)}>atrás do browser</button>;
}
const url = () => screen.getByTestId("url").textContent;
const ficha = (nome: string) => screen.queryByRole("dialog", { name: nome });
const listaEscondida = () => document.querySelector("[data-pagina-escondida]")?.hasAttribute("hidden");

function desenhar(inicial = "/pessoas", fonte: FontePessoas = REAL) {
  listaMock.mockReturnValue(listaBase({ linhas: DUAS } as Partial<ListaPessoas>));
  return render(
    <FontePessoasContext.Provider value={fonte}>
      <MemoryRouter initialEntries={[inicial]}><PessoasReal /><Local /><Atras /></MemoryRouter>
    </FontePessoasContext.Provider>,
  );
}

const fichaDe = (id: string, nome: string) => ({
  ficha: fichaDb({ pessoa: pessoaDb({ id, nome }) }), estado: "ok", erro: null, carregarMais: vi.fn(), aCarregarMais: false, carregandoTipos: [], errosMais: {}, atualizacaoFalhou: false, erroAoCarregarMais: null, recarregar: vi.fn(),
});
const semFicha = { ficha: null, estado: "a-carregar", erro: null, carregarMais: vi.fn(), aCarregarMais: false, carregandoTipos: [], errosMais: {}, atualizacaoFalhou: false, erroAoCarregarMais: null, recarregar: vi.fn() };

beforeEach(() => {
  listaMock.mockReset();
  fichaMock.mockReset();
  erroToast.mockReset();
  fichaMock.mockImplementation((id: string | null) => (id === A ? fichaDe(A, "Ana Lopes") : id === B ? fichaDe(B, "Bruno Reis") : semFicha));
});

describe("PessoasReal com a ficha", () => {
  it("os nomes são botões que abrem um diálogo", () => {
    desenhar();
    const botao = screen.getByRole("button", { name: "Ana Lopes" });
    expect(botao).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.getAllByRole("rowheader")).toHaveLength(2);
  });

  it("clicar no nome põe ?open= no endereço e abre a ficha dessa pessoa", () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Bruno Reis" }));
    expect(url()).toBe(`/pessoas?open=${B}`);
    expect(ficha("Bruno Reis")).not.toBeNull();
    expect(fichaMock).toHaveBeenCalledWith(B);
  });

  it("um ?open= válido à chegada abre a ficha logo", () => {
    desenhar(`/pessoas?open=${A}`);
    expect(ficha("Ana Lopes")).not.toBeNull();
  });

  it("Esc fecha a ficha, tira o ?open= do endereço e devolve o foco ao nome", async () => {
    desenhar();
    const botao = screen.getByRole("button", { name: "Ana Lopes" });
    botao.focus();
    fireEvent.click(botao);
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(ficha("Ana Lopes")).toBeNull());
    expect(url()).toBe("/pessoas");
    await waitFor(() => expect(screen.getByRole("button", { name: "Ana Lopes" })).toHaveFocus());
  });

  it("com a ficha aberta a lista continua visível: a ficha completa abre num painel lateral e Esc devolve o foco ao nome", async () => {
    desenhar();
    const botao = screen.getByRole("button", { name: "Ana Lopes" });
    botao.focus();
    fireEvent.click(botao);
    expect(ficha("Ana Lopes")).not.toBeNull();
    expect(listaEscondida()).toBeFalsy();
    expect(screen.queryByRole("button", { name: "Voltar às Pessoas" })).toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(url()).toBe("/pessoas"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Ana Lopes" })).toHaveFocus());
  });

  it("a ficha das Pessoas é a completa de sempre (abas Resumo e Registos), não o ecrã guiado do Pipeline", () => {
    desenhar(`/pessoas?open=${A}`);
    expect(ficha("Ana Lopes")).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Resumo" })).toBeInTheDocument();
    expect(document.querySelector("[data-ficha-coluna]")).toBeNull();
  });

  it("o botão «atrás» do browser fecha a ficha e deixa a lista visível", async () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Ana Lopes" }));
    expect(ficha("Ana Lopes")).not.toBeNull();
    fireEvent.click(screen.getByText("atrás do browser"));
    await waitFor(() => expect(url()).toBe("/pessoas"));
    await waitFor(() => expect(ficha("Ana Lopes")).toBeNull());
    expect(listaEscondida()).toBeFalsy();
  });

  it("um ?open= vindo de fora abre a ficha e fechá-la limpa o endereço", async () => {
    desenhar(`/pessoas?open=${A}`);
    expect(ficha("Ana Lopes")).not.toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(url()).toBe("/pessoas"));
    await waitFor(() => expect(ficha("Ana Lopes")).toBeNull());
  });

  it("abrir e fechar não perde os filtros", async () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Clientes" }));
    expect(ultimosFiltros().papel).toBe("cliente");
    fireEvent.click(screen.getByRole("button", { name: "Ana Lopes" }));
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(ficha("Ana Lopes")).toBeNull());
    expect(ultimosFiltros().papel).toBe("cliente");
    expect(screen.getByRole("button", { name: "Clientes" })).toHaveAttribute("aria-pressed", "true");
  });

  it("um ?open= que não é uuid limpa-se e avisa com um toast", async () => {
    fichaMock.mockImplementation(() => ({ ...semFicha, estado: "indisponivel" }));
    desenhar("/pessoas?open=lixo");
    await waitFor(() => expect(url()).toBe("/pessoas"));
    expect(erroToast).toHaveBeenCalledTimes(1);
  });

  it("um erro ao abrir limpa o ?open= e dá o toast do erro", async () => {
    fichaMock.mockImplementation(() => ({
      ...semFicha, estado: "indisponivel", erro: Object.assign(new Error("x"), { codigo: "NG003", chave: "pessoasPagina.erroNeg.ng003" }),
    }));
    desenhar(`/pessoas?open=${A}`);
    await waitFor(() => expect(url()).toBe("/pessoas"));
    expect(erroToast).toHaveBeenCalledWith("Esta pessoa já não está disponível.");
  });
});

describe("PessoasReal em modo exemplo (sem fonte real)", () => {
  it("o nome continua texto simples e não há ficha nem pedidos", () => {
    desenhar("/pessoas", { modo: "exemplo" });
    expect(screen.queryByRole("button", { name: /Ana Lopes/ })).toBeNull();
    expect(fichaMock).not.toHaveBeenCalled();
  });
});
