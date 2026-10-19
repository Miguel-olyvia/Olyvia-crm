// A ficha real: «Carregar mais» de cada secção, o aviso de atualização falhada e a origem do foco (guardada no clique).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import { atividadeDb, contactoDb, fichaDb, levantamentoDb, seccaoDb, visitaDb } from "@/hooks/pessoas/fichaFabrica";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { FichaReal } from "./FichaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
const fichaMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/useFichaPessoa", () => ({ useFichaPessoa: (id: string | null) => fichaMock(id) }));
vi.mock("@/hooks/pessoas/useAcoesFichaReal", () => ({
  useAcoesFichaReal: () => ({
    registarChamada: vi.fn(), adiar: vi.fn(), encerrar: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(), registarResultadoVisita: vi.fn(),
    capacidades: { chamada: true, encerrar: true, adiar: false, nota: false, visita: false, negocios: false },
  }),
}));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

beforeAll(prepararRadixNoJsdom);

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };
const ID = "11111111-1111-4111-8111-111111111111";
const CURSOR = { em: "2026-10-01T09:00:00Z", id: "x" };
const mais = { tem_mais: true, proximo: CURSOR };

const COM_MAIS: FichaDb = fichaDb({
  contactos: seccaoDb([contactoDb()], mais), visitas: seccaoDb([visitaDb()], mais),
  levantamentos: seccaoDb([levantamentoDb()], mais), atividade: seccaoDb([atividadeDb()], mais),
});

const hook = (sobre: Record<string, unknown> = {}) => ({
  ficha: COM_MAIS, estado: "ok", erro: null, atualizacaoFalhou: false, carregarMais: vi.fn(() => Promise.resolve()), aCarregarMais: false,
  carregandoTipos: [] as string[], errosMais: {} as Record<string, ErroNeg>, erroAoCarregarMais: null, recarregar: vi.fn(), ...sobre,
});

function desenhar(extra: Partial<Parameters<typeof FichaReal>[0]> = {}) {
  const props = { pessoaId: ID as string | null, idsVisiveis: [ID], aoFechar: vi.fn(), aoIrPara: vi.fn(), aoLimpar: vi.fn(), ...extra };
  return { props, ...render(<FontePessoasContext.Provider value={REAL}><MemoryRouter><FichaReal {...props} /></MemoryRouter></FontePessoasContext.Provider>) };
}
const irParaAtividade = () => {
  fireEvent.mouseDown(screen.getByRole("tab", { name: /Atividade/ }));
  fireEvent.click(screen.getByRole("tab", { name: /Atividade/ }));
};

beforeEach(() => fichaMock.mockReset());

describe("Carregar mais", () => {
  it("cada secção com mais itens tem o seu botão, com texto traduzido, e pede só essa secção", () => {
    const h = hook();
    fichaMock.mockReturnValue(h);
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais contactos" }));
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais visitas" }));
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais levantamentos" }));
    irParaAtividade();
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais atividade" }));
    expect(h.carregarMais.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["contactos", "visitas", "levantamentos", "atividade"]);
  });

  it("sem mais itens não há botão", () => {
    fichaMock.mockReturnValue(hook({ ficha: fichaDb({ contactos: seccaoDb([contactoDb()]), atividade: seccaoDb([atividadeDb()]) }) }));
    desenhar();
    expect(screen.queryByRole("button", { name: /Carregar mais/ })).toBeNull();
    irParaAtividade();
    expect(screen.queryByRole("button", { name: /Carregar mais/ })).toBeNull();
  });

  it("a carregar: o botão fica ocupado, diz «A carregar…» e ignora cliques", () => {
    const h = hook({ carregandoTipos: ["atividade"], aCarregarMais: true });
    fichaMock.mockReturnValue(h);
    desenhar();
    irParaAtividade();
    const botao = screen.getByRole("button", { name: "A carregar…" });
    expect(botao).toHaveAttribute("aria-busy", "true");
    fireEvent.click(botao);
    expect(h.carregarMais).not.toHaveBeenCalled();
  });

  it("uma falha mostra o erro traduzido em role=alert, ao lado do botão que repete", () => {
    fichaMock.mockReturnValue(hook({ errosMais: { atividade: new ErroNeg(null, "NG009", "pessoasPagina.erroNeg.ng009") } }));
    desenhar();
    irParaAtividade();
    expect(screen.getByRole("alert")).toHaveTextContent("Um dos valores não é válido.");
    expect(screen.getByRole("button", { name: "Carregar mais atividade" })).toBeInTheDocument();
  });

  it("o erro de uma secção não aparece nas outras", () => {
    fichaMock.mockReturnValue(hook({ errosMais: { atividade: new ErroNeg(null, "NG009", "pessoasPagina.erroNeg.ng009") } }));
    desenhar();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Atualização em segundo plano falhada", () => {
  it("com a ficha em cache mostra um aviso role=alert e deixa tentar de novo", () => {
    const h = hook({ atualizacaoFalhou: true, erro: new ErroNeg(null, null, "pessoasPagina.erroNeg.generico") });
    fichaMock.mockReturnValue(h);
    desenhar();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível atualizar a ficha");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(h.recarregar).toHaveBeenCalledTimes(1);
  });

  it("sem falha não há aviso", () => {
    fichaMock.mockReturnValue(hook());
    desenhar();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Origem do foco", () => {
  it("ao fechar, o foco volta ao elemento guardado no clique (mesmo que o foco tenha ido para outro sítio)", async () => {
    fichaMock.mockReturnValue(hook());
    const origem = document.createElement("button");
    document.body.appendChild(origem);
    const { rerender, props } = desenhar({ origemFoco: { current: origem } });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    rerender(
      <FontePessoasContext.Provider value={REAL}><MemoryRouter><FichaReal {...props} pessoaId={null} origemFoco={{ current: origem }} /></MemoryRouter></FontePessoasContext.Provider>,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(origem).toHaveFocus());
    origem.remove();
  });
});
