// A Lista real com a ficha: clicar no nome abre a ficha (?open=), Esc fecha e o foco volta ao nome, os filtros mantêm-se.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { fichaDb, pessoaDb } from "@/hooks/pessoas/fichaFabrica";
import type { FiltrosLista } from "@/hooks/pessoas/listaPessoasTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import type { ListaPessoas } from "@/hooks/pessoas/useListaPessoas";
import { listaBase, pessoaLista } from "./fabricaLista";
import { PessoasReal } from "./PessoasReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
const listaMock = vi.hoisted(() => vi.fn());
const fichaMock = vi.hoisted(() => vi.fn());
const { erroToast } = vi.hoisted(() => ({ erroToast: vi.fn() }));
vi.mock("@/hooks/pessoas/useListaPessoas", () => ({ useListaPessoas: (f: FiltrosLista) => listaMock(f) }));
vi.mock("@/hooks/pessoas/useFichaPessoa", () => ({ useFichaPessoa: (id: string | null) => fichaMock(id) }));
vi.mock("@/hooks/pessoas/useAcoesFichaReal", () => ({
  useAcoesFichaReal: () => ({
    registarChamada: vi.fn(), adiar: vi.fn(), encerrar: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(), registarResultadoVisita: vi.fn(),
    capacidades: { chamada: true, encerrar: true, adiar: false, nota: false, visita: false, negocios: false },
  }),
}));
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
const url = () => screen.getByTestId("url").textContent;

function desenhar(inicial = "/pessoas", fonte: FontePessoas = REAL) {
  listaMock.mockReturnValue(listaBase({ linhas: DUAS } as Partial<ListaPessoas>));
  return render(
    <FontePessoasContext.Provider value={fonte}>
      <MemoryRouter initialEntries={[inicial]}><PessoasReal /><Local /></MemoryRouter>
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
    expect(screen.getByRole("dialog", { name: "Bruno Reis" })).toBeInTheDocument();
    expect(fichaMock).toHaveBeenCalledWith(B);
  });

  it("um ?open= válido à chegada abre a ficha logo", () => {
    desenhar(`/pessoas?open=${A}`);
    expect(screen.getByRole("dialog", { name: "Ana Lopes" })).toBeInTheDocument();
  });

  it("Esc fecha a ficha, tira o ?open= do endereço e devolve o foco ao nome", async () => {
    desenhar();
    const botao = screen.getByRole("button", { name: "Ana Lopes" });
    botao.focus();
    fireEvent.click(botao);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(url()).toBe("/pessoas");
    await waitFor(() => expect(screen.getByRole("button", { name: "Ana Lopes" })).toHaveFocus());
  });

  it("abrir e fechar não perde os filtros", async () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Clientes" }));
    expect(ultimosFiltros().papel).toBe("cliente");
    fireEvent.click(screen.getByRole("button", { name: "Ana Lopes" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
