import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import { pessoasPaginaTranslations } from "@/translations/pessoasPagina";
import type { FiltrosLista } from "@/hooks/pessoas/listaPessoasTipos";
import type { ListaPessoas } from "@/hooks/pessoas/useListaPessoas";
import { listaBase, pessoaLista } from "./fabricaLista";
import { PessoasReal } from "./PessoasReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
const listaMock = vi.hoisted(() => vi.fn());
const avatarMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/useListaPessoas", () => ({ useListaPessoas: (f: FiltrosLista) => listaMock(f) }));
vi.mock("@/components/pessoas/AvatarPessoa", () => ({ AvatarPessoa: (p: unknown) => { avatarMock(p); return null; } }));

const CAPTION = "Pessoas: etapa, último contacto, próxima visita, valor e negócios";
const REGIAO = "Lista de pessoas";
const DUAS = [pessoaLista("a", { nome: "Ana Lopes" }), pessoaLista("b", { nome: "Bruno Reis" })];
const ultimosFiltros = (): FiltrosLista => listaMock.mock.calls[listaMock.mock.calls.length - 1][0];

function desenhar(sobre: Partial<ListaPessoas> = {}) {
  listaMock.mockReturnValue(listaBase({ linhas: DUAS, ...sobre }));
  return render(<MemoryRouter><PessoasReal /></MemoryRouter>);
}
const reenviar = (sobre: Partial<ListaPessoas>, ui: ReturnType<typeof desenhar>) => {
  listaMock.mockReturnValue(listaBase({ linhas: DUAS, ...sobre }));
  ui.rerender(<MemoryRouter><PessoasReal /></MemoryRouter>);
};
const viva = () => screen.getByRole("status");
const regiao = () => screen.getByRole("region", { name: REGIAO });

beforeEach(() => { listaMock.mockReset(); avatarMock.mockReset(); });
afterEach(() => vi.useRealTimers());

describe("PessoasReal: o que mostra", () => {
  it("tem exatamente as 6 colunas e nenhuma de Localidade nem Formulário", () => {
    desenhar();
    const nomes = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(nomes).toEqual(["Pessoa", "Etapa", "Último contacto", "Próxima visita", "Valor", "Negócios"]);
    expect(screen.queryByText("Localidade")).toBeNull();
    expect(screen.queryByText("Formulário")).toBeNull();
    screen.getAllByRole("columnheader").forEach((c) => expect(c).toHaveAttribute("scope", "col"));
  });

  it("uma linha por pessoa, mesmo com nomes iguais, e o nome é o cabeçalho da linha", () => {
    desenhar({ linhas: [pessoaLista("a", { nome: "Ana" }), pessoaLista("b", { nome: "Ana" })] });
    expect(screen.getAllByRole("rowheader", { name: "Ana" })).toHaveLength(2);
    screen.getAllByRole("rowheader").forEach((c) => expect(c).toHaveAttribute("scope", "row"));
  });

  it("não tem «Nova lead», separador de Submissões, aviso de exemplo nem ficha", () => {
    desenhar();
    expect(screen.queryByText(/Nova lead/)).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByText(/Submiss/)).toBeNull();
    expect(screen.queryByText(/exemplo/i)).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /Ana Lopes/ })).toBeNull();
  });

  it("a tabela tem o nome da legenda e a região com foco tem outro, curto", () => {
    desenhar();
    expect(screen.getByRole("table", { name: CAPTION })).toBeInTheDocument();
    expect(regiao()).toHaveAttribute("tabindex", "0");
    expect(screen.queryByRole("region", { name: CAPTION })).toBeNull();
  });

  it("a região rola com altura mínima de 24rem (zoom a 400%)", () => {
    desenhar();
    expect(regiao().className).toContain("max-h-[max(70vh,24rem)]");
  });

  it("o único contentor live diz quantas pessoas estão carregadas e a ordem", () => {
    desenhar();
    expect(screen.getByRole("heading", { level: 1, name: "Pessoas" })).toBeInTheDocument();
    expect(viva()).toHaveAttribute("aria-live", "polite");
    expect(viva()).toHaveTextContent("pessoas carregadas: 2");
    expect(viva()).toHaveTextContent("Ordenado por Mais recentes");
    expect(screen.getAllByText("pessoas carregadas: 2")).toHaveLength(1); // o subtítulo visível; o live tem a frase completa
  });

  it("mudar a ordem é anunciado", () => {
    desenhar();
    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar por" }), { target: { value: "nome" } });
    expect(viva()).toHaveTextContent("Ordenado por Nome");
    expect(ultimosFiltros().ordem).toBe("nome");
  });

  it("vazio sem filtros: mensagem simples, sem tabela nem «Limpar filtros»", () => {
    desenhar({ linhas: [] });
    expect(screen.getByText("Ainda não há pessoas para mostrar.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
  });

  it("vazio com um filtro ativo: outra mensagem e «Limpar filtros» que repõe tudo", () => {
    desenhar({ linhas: [] });
    fireEvent.click(screen.getByRole("button", { name: "Clientes" }));
    expect(screen.getByText("Nenhuma pessoa corresponde aos filtros.")).toBeInTheDocument();
    expect(screen.queryByText("Ainda não há pessoas para mostrar.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(ultimosFiltros()).toEqual({ papel: null, etapa: null, pesquisa: "", ordem: "recentes" });
    expect(screen.getByText("Ainda não há pessoas para mostrar.")).toBeInTheDocument();
  });

  it("vazio com uma etapa ativa também diz que nada corresponde", () => {
    desenhar({ linhas: [] });
    fireEvent.click(screen.getByRole("button", { name: "Em contacto" }));
    expect(screen.getByText("Nenhuma pessoa corresponde aos filtros.")).toBeInTheDocument();
  });

  it("o vazio não aparece enquanto se mostra a lista anterior", () => {
    desenhar({ linhas: [], aMostrarAnterior: true, isFetching: true });
    expect(screen.queryByText("Ainda não há pessoas para mostrar.")).toBeNull();
    expect(screen.queryByText("Nenhuma pessoa corresponde aos filtros.")).toBeNull();
    expect(viva()).toHaveTextContent("A atualizar...");
  });

  it("primeira carga: o contentor live diz que carrega; sem tabela nem vazio", () => {
    desenhar({ linhas: [], isLoading: true, isFetching: true });
    expect(viva()).toHaveTextContent("A carregar pessoas...");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Ainda não há pessoas para mostrar.")).toBeNull();
  });
});

describe("PessoasReal: filtros", () => {
  it("começa sem filtros e o tipo «Clientes» muda o papel", () => {
    desenhar();
    expect(ultimosFiltros()).toEqual({ papel: null, etapa: null, pesquisa: "", ordem: "recentes" });
    fireEvent.click(screen.getByRole("button", { name: "Clientes" }));
    expect(ultimosFiltros().papel).toBe("cliente");
  });

  it("a dica está sempre; com 1 caractere destaca-se, é anunciada e não envia; com 2 envia após 300 ms", () => {
    vi.useFakeTimers();
    desenhar();
    const campo = screen.getByRole("searchbox");
    const dica = screen.getByText("Pesquise por nome (mínimo 2 letras)");
    expect(campo.getAttribute("aria-describedby")).toBe(dica.id);
    expect(dica).not.toHaveAttribute("data-destacada");
    fireEvent.change(campo, { target: { value: "a" } });
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByText("Pesquise por nome (mínimo 2 letras)")).toHaveAttribute("data-destacada", "true");
    expect(viva()).toHaveTextContent("Pesquise por nome (mínimo 2 letras)");
    expect(ultimosFiltros().pesquisa).toBe("");
    fireEvent.change(campo, { target: { value: "ana" } });
    expect(ultimosFiltros().pesquisa).toBe("");
    act(() => { vi.advanceTimersByTime(300); });
    expect(ultimosFiltros().pesquisa).toBe("ana");
    expect(screen.getByText("Pesquise por nome (mínimo 2 letras)")).not.toHaveAttribute("data-destacada");
  });
});

describe("PessoasReal: erros", () => {
  const erro = new ErroNeg(null, "NG008", "pessoasPagina.erroNeg.ng008");
  const textoErro = pessoasPaginaTranslations.pt["pessoasPagina.erroNeg.ng008"];

  it("erro sem dados: alerta com a mensagem traduzida pela chave e «Tentar de novo»", () => {
    const recarregar = vi.fn();
    desenhar({ linhas: [], isError: true, erroSemDados: true, erro, recarregar });
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(textoErro);
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(within(alerta).getByRole("button", { name: "Tentar de novo" }));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("erro sem objeto de erro usa a mensagem geral da lista", () => {
    desenhar({ linhas: [], isError: true, erroSemDados: true, erro: null });
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a lista.");
  });

  it("erro COM linhas retidas: mantém a tabela, aviso visível e anunciado, sem role alert", () => {
    const recarregar = vi.fn();
    desenhar({ isError: true, erroSemDados: false, erro, recarregar });
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    const aviso = "Não foi possível atualizar a lista. Mostra-se a última lista carregada.";
    expect(screen.getAllByText(aviso)).toHaveLength(1); // o aviso visível; o live junta-o a outras frases
    expect(viva()).toHaveTextContent(aviso);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("erro ao carregar mais: aviso anunciado com repetir, sem perder as linhas", () => {
    const carregarMais = vi.fn();
    desenhar({ haMais: true, erroAoCarregarMais: erro, carregarMais });
    expect(viva()).toHaveTextContent("Não foi possível carregar mais pessoas.");
    expect(screen.getByText("Ana Lopes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(carregarMais).toHaveBeenCalledTimes(1);
  });
});

describe("PessoasReal: carregar mais e lista ocupada", () => {
  it("o botão só aparece com haMais e chama carregarMais", () => {
    const carregarMais = vi.fn();
    desenhar({ haMais: true, carregarMais });
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(carregarMais).toHaveBeenCalledTimes(1);
  });

  it("sem haMais não há botão", () => {
    desenhar({ haMais: false });
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("aMostrarAnterior: linhas e contraste mantidos, aria-busy, barra de progresso, «A atualizar...» e sem botão", () => {
    desenhar({ haMais: true, aMostrarAnterior: true, isFetching: true });
    expect(screen.getByText("Ana Lopes")).toBeInTheDocument();
    expect(regiao()).toHaveAttribute("aria-busy", "true");
    expect(regiao().className).not.toContain("opacity");
    expect(document.querySelector("[data-progresso]")).not.toBeNull();
    expect(viva()).toHaveTextContent("A atualizar...");
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("fora desse estado a tabela não está ocupada e não há barra", () => {
    desenhar();
    expect(regiao()).toHaveAttribute("aria-busy", "false");
    expect(document.querySelector("[data-progresso]")).toBeNull();
  });

  it("isFetchingMore: o botão fica, com aria-disabled e «A carregar mais...», e não pede outra página", () => {
    const carregarMais = vi.fn();
    desenhar({ haMais: true, isFetchingMore: true, carregarMais });
    const botao = screen.getByRole("button", { name: "A carregar mais..." });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao);
    expect(carregarMais).not.toHaveBeenCalled();
    expect(viva()).toHaveTextContent("A carregar mais...");
  });
});

describe("PessoasReal: o foco não se perde", () => {
  const erro = new ErroNeg(null, "NG008", "pessoasPagina.erroNeg.ng008");
  const MAIS = [...DUAS, pessoaLista("c", { nome: "Carla Dias" })];

  it("carregar mais com sucesso até ao fim da lista: o foco fica no botão e passa à tabela no fim", () => {
    const ui = desenhar({ haMais: true });
    const botao = screen.getByRole("button", { name: "Carregar mais" });
    botao.focus();
    fireEvent.click(botao);
    reenviar({ haMais: true, isFetchingMore: true }, ui);
    expect(screen.getByRole("button", { name: "A carregar mais..." })).toBe(botao);
    expect(botao).toHaveFocus();
    reenviar({ haMais: false, linhas: MAIS }, ui);
    expect(regiao()).toHaveFocus();
  });

  it("erro ao carregar mais: o foco vai para «Tentar de novo»", () => {
    const ui = desenhar({ haMais: true });
    const botao = screen.getByRole("button", { name: "Carregar mais" });
    botao.focus();
    fireEvent.click(botao);
    reenviar({ haMais: true, isFetchingMore: true }, ui);
    reenviar({ haMais: true, erroAoCarregarMais: erro }, ui);
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toHaveFocus();
  });

  it("repetir depois do erro: o foco volta ao botão e, no fim da lista, à tabela", () => {
    const carregarMais = vi.fn();
    const ui = desenhar({ haMais: true, erroAoCarregarMais: erro, carregarMais });
    const repetir = screen.getByRole("button", { name: "Tentar de novo" });
    repetir.focus();
    fireEvent.click(repetir);
    expect(carregarMais).toHaveBeenCalledTimes(1);
    reenviar({ haMais: true, isFetchingMore: true }, ui);
    const botao = screen.getByRole("button", { name: "A carregar mais..." });
    expect(botao).toHaveFocus();
    reenviar({ haMais: false, linhas: MAIS }, ui);
    expect(regiao()).toHaveFocus();
  });

  it("não rouba o foco se o utilizador não usou o botão", () => {
    const ui = desenhar({ haMais: true });
    screen.getByRole("button", { name: "Todas" }).focus();
    reenviar({ haMais: false }, ui);
    expect(screen.getByRole("button", { name: "Todas" })).toHaveFocus();
  });
});

describe("PessoasReal: desempenho", () => {
  it("escrever na pesquisa não volta a desenhar as linhas", () => {
    desenhar();
    const chamadas = avatarMock.mock.calls.length;
    const pedidos = listaMock.mock.calls.length;
    expect(chamadas).toBe(2);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "x" } });
    expect(listaMock.mock.calls.length).toBeGreaterThan(pedidos);
    expect(avatarMock.mock.calls.length).toBe(chamadas);
  });
});
