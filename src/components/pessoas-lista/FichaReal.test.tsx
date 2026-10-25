import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import { agregadosDb, contactoDb, fichaDb, negocioDb, pessoaDb, seccaoDb, visitaDb } from "@/hooks/pessoas/fichaFabrica";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { FichaReal } from "./FichaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
const fichaMock = vi.hoisted(() => vi.fn());
const acoesMock = vi.hoisted(() => vi.fn());
const { erroToast } = vi.hoisted(() => ({ erroToast: vi.fn() }));
vi.mock("@/hooks/pessoas/useFichaPessoa", () => ({ useFichaPessoa: (id: string | null) => fichaMock(id) }));
vi.mock("@/hooks/pessoas/useAcoesFichaReal", () => ({ useAcoesFichaReal: (...args: unknown[]) => acoesMock(...args) }));
vi.mock("@/hooks/pessoas/useSubmissoesPessoa", () => ({ useSubmissoesPessoa: () => ({ submissoes: [], pendentes: 0, estado: "ok", recarregar: () => undefined }) }));
vi.mock("@/hooks/pessoas/useGuardarIdentidadePessoa", () => ({ useGuardarIdentidadePessoa: () => ({ guardar: async () => ({}) }) }));
vi.mock("@/hooks/pessoas/useQualificarLeadPessoa", () => ({ useQualificarLeadPessoa: () => ({ classificar: async () => ({}) }) }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: erroToast } }));

beforeAll(prepararRadixNoJsdom);

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };
const ID = "11111111-1111-4111-8111-111111111111";
const OUTRO = "33333333-3333-4333-8333-333333333333";

const estadoHook = (sobre: Record<string, unknown> = {}) => ({
  ficha: null as FichaDb | null, estado: "a-carregar", erro: null, carregarMais: vi.fn(), aCarregarMais: false, carregandoTipos: [], errosMais: {}, atualizacaoFalhou: false, erroAoCarregarMais: null, recarregar: vi.fn(),
  ...sobre,
});
const acoesDe = () => ({
  registarChamada: vi.fn(), adiar: vi.fn(), encerrar: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(), registarResultadoVisita: vi.fn(),
  capacidades: { chamada: true, encerrar: true, adiar: false, nota: false, visita: false, negocios: false },
});

const FICHA = fichaDb({
  agregados: agregadosDb({ ultimo_contacto_em: "2026-10-12T09:00:00Z" }),
  contactos: seccaoDb([contactoDb()]), visitas: seccaoDb([visitaDb()]),
  negocios: { total: 1, itens: [negocioDb({ valor: 900 })] },
});

function desenhar(sobre: Partial<Parameters<typeof FichaReal>[0]> = {}) {
  const props = { pessoaId: ID as string | null, idsVisiveis: [ID], aoFechar: vi.fn(), aoIrPara: vi.fn(), aoLimpar: vi.fn(), ...sobre };
  const ui = (p: typeof props) => (
    <FontePessoasContext.Provider value={REAL}><MemoryRouter><FichaReal {...p} /></MemoryRouter></FontePessoasContext.Provider>
  );
  const r = render(ui(props));
  return { props, ...r, reenviar: (nova: Partial<typeof props>) => r.rerender(ui({ ...props, ...nova })) };
}

beforeEach(() => {
  fichaMock.mockReset();
  acoesMock.mockReset();
  erroToast.mockReset();
  acoesMock.mockReturnValue(acoesDe());
});

describe("FichaReal: a carregar", () => {
  it("diz «A abrir a ficha…» numa região de estado e não abre o painel enquanto não há resposta", () => {
    fichaMock.mockReturnValue(estadoHook());
    desenhar();
    expect(screen.getByRole("status")).toHaveTextContent("A abrir a ficha…");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a região de estado está sempre montada e vazia quando nada carrega", () => {
    fichaMock.mockReturnValue(estadoHook());
    const { reenviar } = desenhar();
    reenviar({ pessoaId: null });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("não pede nada à base quando não há pessoa aberta (o hook recebe null)", () => {
    fichaMock.mockReturnValue(estadoHook({ estado: "indisponivel" }));
    desenhar({ pessoaId: null });
    expect(fichaMock).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(erroToast).not.toHaveBeenCalled();
  });
});

describe("FichaReal: Nota e Adiar ligados (M8 aplicada)", () => {
  const comNotaEAdiar = () => ({ ...acoesDe(), capacidades: { chamada: true, encerrar: true, adiar: true, nota: true, visita: false, negocios: false } });
  const abrirMais = () => fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
  beforeEach(() => fichaMock.mockReturnValue(estadoHook({ ficha: fichaDb(), estado: "ok" })));

  it("o «Mais» oferece Nota e Adiar quando as capacidades estão ligadas", () => {
    acoesMock.mockReturnValue(comNotaEAdiar());
    desenhar();
    abrirMais();
    expect(screen.getByRole("menuitem", { name: /^Nota$/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Adiar/ })).toBeInTheDocument();
  });

  it("Nota: escrever e guardar chama juntarNota com a pessoa e o texto", async () => {
    const acoes = comNotaEAdiar();
    acoes.juntarNota.mockResolvedValue(undefined);
    acoesMock.mockReturnValue(acoes);
    desenhar();
    abrirMais();
    fireEvent.click(screen.getByRole("menuitem", { name: /^Nota$/ }));
    fireEvent.change(await screen.findByLabelText("Escreva a nota"), { target: { value: "Prefere de manhã" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(acoes.juntarNota).toHaveBeenCalledExactlyOnceWith(ID, "Prefere de manhã"));
  });

  it("Adiar: escolher «Amanhã» chama adiar com a pessoa e 1 dia", async () => {
    const acoes = comNotaEAdiar();
    acoes.adiar.mockResolvedValue(undefined);
    acoesMock.mockReturnValue(acoes);
    desenhar();
    abrirMais();
    fireEvent.click(screen.getByRole("menuitem", { name: /Adiar/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Amanhã/ }));
    await waitFor(() => expect(acoes.adiar).toHaveBeenCalledExactlyOnceWith(ID, 1));
  });

  it("um erro da base ao guardar a nota aparece traduzido, não a chave nem o código em bruto", async () => {
    const acoes = comNotaEAdiar();
    acoes.juntarNota.mockRejectedValue(new ErroNeg(null, "NG009", "pessoasPagina.erroNeg.ng009"));
    acoesMock.mockReturnValue(acoes);
    desenhar();
    abrirMais();
    fireEvent.click(screen.getByRole("menuitem", { name: /^Nota$/ }));
    fireEvent.change(await screen.findByLabelText("Escreva a nota"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Um dos valores não é válido.");
    expect(alerta).not.toHaveTextContent("NG009");
    expect(alerta).not.toHaveTextContent("erroNeg");
  });

  it("um erro da base ao adiar aparece traduzido", async () => {
    const acoes = comNotaEAdiar();
    acoes.adiar.mockRejectedValue(new ErroNeg(null, "NG008", "pessoasPagina.erroNeg.ng008"));
    acoesMock.mockReturnValue(acoes);
    desenhar();
    abrirMais();
    fireEvent.click(screen.getByRole("menuitem", { name: /Adiar/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Amanhã/ }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).not.toHaveTextContent("NG008");
    expect(alerta).not.toHaveTextContent("erroNeg");
  });
});

describe("FichaReal: aberta com dados", () => {
  beforeEach(() => fichaMock.mockReturnValue(estadoHook({ ficha: FICHA, estado: "ok" })));

  it("abre o painel com o nome da pessoa; com um negócio já não há passo de chamada: «Registar chamada» passa ao menu Mais", () => {
    desenhar();
    expect(screen.getByRole("dialog", { name: "Ana Lopes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Registar chamada/ })).toBeNull();
    fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
    expect(screen.getByRole("menuitem", { name: "Registar chamada" })).toBeInTheDocument();
  });

  it("não mostra a marca «exemplo», a aba Notas, «Criar negócio» nem «Visita e levantamento»", () => {
    desenhar();
    expect(screen.queryByText("exemplo")).toBeNull();
    expect(screen.queryByRole("tab", { name: /Notas/ })).toBeNull();
    expect(screen.getByRole("tab", { name: /Negócios/ })).toBeInTheDocument();
    // Com um negócio aberto o «Mais» só oferece «Registar chamada» (já não há botão do passo para a chamada): nem Nota, nem Adiar, nem Criar negócio.
    fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
    expect(screen.getByRole("menuitem", { name: "Registar chamada" })).toBeInTheDocument();
    for (const nome of [/^Nota$/, /Adiar/, /Criar negócio/, /Visita e levantamento/]) expect(screen.queryByRole("menuitem", { name: nome })).toBeNull();
  });

  it("sem negócios o «Mais» só oferece encerrar: nada de Nota, Adiar, Criar negócio nem Visita e levantamento", () => {
    fichaMock.mockReturnValue(estadoHook({ ficha: fichaDb(), estado: "ok" }));
    desenhar();
    fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
    expect(screen.getByRole("menuitem", { name: /Encerrar abordagem/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Criar negócio/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Visita e levantamento/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /^Nota$/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Adiar/ })).toBeNull();
  });

  it("as ações da base ficam ligadas à pessoa mostrada e à ficha lida", () => {
    desenhar();
    expect(acoesMock).toHaveBeenCalledWith(ID, FICHA);
  });

  it("Esc fecha o painel pedindo à página que feche", () => {
    const { props } = desenhar();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.aoFechar).toHaveBeenCalled();
  });

  it("fechar (pessoaId a null) esconde o painel", async () => {
    const { reenviar } = desenhar();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    reenviar({ pessoaId: null });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a ficha adaptada traz o negócio aberto e os registos para o ecrã", () => {
    desenhar();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Negócios/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Negócios/ }));
    expect(screen.getByText("Casa de banho")).toBeInTheDocument();
  });
});

describe("FichaReal: a trocar de pessoa", () => {
  it("nunca mostra a ficha de A sob o ?open= de B: enquanto B carrega, não há painel e há indicador de carregamento", () => {
    fichaMock.mockReturnValue(estadoHook({ ficha: FICHA, estado: "ok" }));
    const { reenviar, container } = desenhar({ idsVisiveis: [ID, OUTRO] });
    fichaMock.mockReturnValue(estadoHook());
    reenviar({ pessoaId: OUTRO, idsVisiveis: [ID, OUTRO] });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Ana Lopes")).toBeNull();
    expect(screen.getAllByRole("status").some((s) => s.textContent === "A abrir a ficha…")).toBe(true);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getAllByText("A abrir a ficha…").length).toBe(2); // o anúncio (sr-only) e o indicador visível
  });

  it("sem carregar, o contentor não está ocupado", () => {
    fichaMock.mockReturnValue(estadoHook({ ficha: FICHA, estado: "ok" }));
    const { container } = desenhar();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("uma ficha que não é a da pessoa aberta nunca se mostra, nem as ações trabalham sobre ela", () => {
    fichaMock.mockReturnValue(estadoHook({ ficha: FICHA, estado: "ok" })); // o hook devolve A para o id de B (não deve acontecer, mas não se mostra)
    desenhar({ pessoaId: OUTRO });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(acoesMock).not.toHaveBeenCalledWith(ID, FICHA);
  });

  it("com pessoaId a null (a fechar) o painel desliza com a última ficha", async () => {
    fichaMock.mockReturnValue(estadoHook({ ficha: FICHA, estado: "ok" }));
    const { reenviar } = desenhar();
    fichaMock.mockReturnValue(estadoHook({ estado: "indisponivel" }));
    reenviar({ pessoaId: null });
    expect(acoesMock).toHaveBeenLastCalledWith(ID, FICHA);
  });

  it("quando a nova chega, mostra a nova", () => {
    fichaMock.mockReturnValue(estadoHook({ ficha: FICHA, estado: "ok" }));
    const { reenviar } = desenhar({ idsVisiveis: [ID, OUTRO] });
    const outra = fichaDb({ pessoa: pessoaDb({ id: OUTRO, nome: "Bruno Reis" }) });
    fichaMock.mockReturnValue(estadoHook({ ficha: outra, estado: "ok" }));
    reenviar({ pessoaId: OUTRO, idsVisiveis: [ID, OUTRO] });
    expect(screen.getByRole("dialog", { name: "Bruno Reis" })).toBeInTheDocument();
  });
});

describe("FichaReal: erros", () => {
  it("um erro da função dá um toast traduzido pelo código e limpa o ?open=", () => {
    fichaMock.mockReturnValue(estadoHook({ estado: "erro", erro: new ErroNeg(null, "NG009", "pessoasPagina.erroNeg.ng009") }));
    const { props } = desenhar();
    expect(erroToast).toHaveBeenCalledExactlyOnceWith("Um dos valores não é válido.");
    expect(props.aoLimpar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("pessoa indisponível (NG003) dá o toast do código e limpa", () => {
    fichaMock.mockReturnValue(estadoHook({ estado: "indisponivel", erro: new ErroNeg(null, "NG003", "pessoasPagina.erroNeg.ng003") }));
    const { props } = desenhar();
    expect(erroToast).toHaveBeenCalledExactlyOnceWith("Esta pessoa já não está disponível.");
    expect(props.aoLimpar).toHaveBeenCalledTimes(1);
  });

  it("indisponível sem erro (identificador que não é uuid) dá o toast genérico e limpa", () => {
    fichaMock.mockReturnValue(estadoHook({ estado: "indisponivel", erro: null }));
    const { props } = desenhar({ pessoaId: "lixo" });
    expect(erroToast).toHaveBeenCalledExactlyOnceWith("Não foi possível abrir esta ficha.");
    expect(props.aoLimpar).toHaveBeenCalledTimes(1);
  });

  it("o toast sai uma só vez por falha, mesmo que o componente se redesenhe", () => {
    fichaMock.mockReturnValue(estadoHook({ estado: "erro", erro: new ErroNeg(null, "NG009", "pessoasPagina.erroNeg.ng009") }));
    const { reenviar } = desenhar();
    reenviar({});
    reenviar({ idsVisiveis: [ID, OUTRO] });
    expect(erroToast).toHaveBeenCalledTimes(1);
  });

  it("uma falha nova da mesma pessoa, depois de a ficha abrir bem, volta a avisar", () => {
    fichaMock.mockReturnValue(estadoHook({ estado: "erro", erro: new ErroNeg(null, "NG009", "pessoasPagina.erroNeg.ng009") }));
    const { reenviar } = desenhar();
    fichaMock.mockReturnValue(estadoHook({ ficha: FICHA, estado: "ok" }));
    reenviar({});
    fichaMock.mockReturnValue(estadoHook({ estado: "erro", erro: new ErroNeg(null, "NG009", "pessoasPagina.erroNeg.ng009") }));
    reenviar({});
    expect(erroToast).toHaveBeenCalledTimes(2);
  });
});
