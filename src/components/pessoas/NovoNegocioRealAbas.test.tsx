// «Novo negócio» na ficha REAL com as abas Geral, Visita e Levantamento: em Visita e em Levantamento liga-se o que a pessoa já tem (só dela) ou cria-se de
// novo, e grava-se tudo ligado ao negócio: primeiro o negócio (neg_criar_negocio), depois as visitas e o levantamento novos. Um erro previsível diz-se
// antes de criar; uma falha depois de criar deixa o painel aberto, diz que o negócio já existe, e repetir não cria outro negócio nem duplica o que já gravou.
// O Supabase está simulado.
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AnuncioFichaContext } from "@/components/ficha-comum/anuncioFicha";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { repor } from "@/components/negocio-metas/registosPessoa";
import { fichaDb, levantamentoDb, seccaoDb } from "@/hooks/pessoas/fichaFabrica";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { captureMock, fonteReal, respostaErro, respostaOk, rpcMock } from "@/hooks/pessoas/fichaTestUtil";
import { FontePessoasContext } from "@/hooks/pessoas/useFontePessoas";
import { QUESTIONARIO_BRUTO } from "@/hooks/pessoas/workflow/questionarioTestUtil";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { levantamentoBase, registosBase, visitaPessoaBase } from "./fabricaTestes";
import { NovoNegocioReal } from "./NovoNegocioReal";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));
const { info } = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info, error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/pessoas/useAgendaVisita", async (importar) => ({
  ...(await importar<typeof import("@/hooks/pessoas/useAgendaVisita")>()),
  useAgendaVisita: () => ({ quadros: [], recursos: [], isLoading: false, isError: false, refetch: vi.fn(), omissao: { boardId: "q1", recursoId: "r1" } }),
}));

let contador = 0;
const ordem: string[] = [];
beforeAll(prepararRadixNoJsdom);
beforeEach(() => {
  contador = 0;
  ordem.length = 0;
  rpcMock.mockReset();
  vi.stubGlobal("crypto", { randomUUID: () => `id-${++contador}` });
  responder();
});
afterEach(() => { cleanup(); repor(); info.mockReset(); vi.unstubAllGlobals(); });

type Respostas = Record<string, () => Promise<unknown>>;
function responder(extra: Respostas = {}): void {
  rpcMock.mockImplementation((nome: string) => {
    if (nome !== "neg_questionario_levantamento") ordem.push(nome);
    if (extra[nome]) return extra[nome]();
    if (nome === "neg_questionario_levantamento") return respostaOk(QUESTIONARIO_BRUTO);
    if (nome === "neg_guardar_visita") return respostaOk({ visita_id: "v-novo", mudou: true, ligado_a: null });
    if (nome === "neg_guardar_levantamento") {
      return respostaOk({ levantamento_id: "lev-x", criado: true, mudou: true, ligado_a: null, versao_questionario: 7, questionario_mudou: false });
    }
    return respostaOk({ mudou: true });
  });
}

// A pessoa «a» tem uma visita e um levantamento por ligar; a pessoa «b» também, e esses nunca aparecem no painel de «a».
const registos = registosBase({
  visitas: [visitaPessoaBase("v1", { data: "2026-10-11" }), visitaPessoaBase("v9", { pessoaId: "b", data: "2026-10-13" })],
  levantamentos: [levantamentoBase("l1", { data: "2026-10-11" }), levantamentoBase("l9", { pessoaId: "b", data: "2026-10-14" })],
});

function Harness({ aoCriado, ficha }: { aoCriado: (id: string) => void; ficha: FichaDb }) {
  const [aberto, setAberto] = useState(true);
  return <NovoNegocioReal pessoaId="a" pessoaNome="Ana" ficha={ficha} aberto={aberto} aoCriado={aoCriado} aoMudarAberto={setAberto} />;
}

function montar(opcoes: { ficha?: FichaDb; criar?: MutacoesNegocio["criar"]; podeEditar?: boolean } = {}) {
  const criar = vi.fn(opcoes.criar ?? (async (p: { id: string }) => ({ negocioId: p.id, mudou: true, recusados: [] })));
  const mutacoes = mutacoesFalsas({ criar: (async (p) => { ordem.push("criar"); return criar(p); }) as MutacoesNegocio["criar"] });
  const aoCriado = vi.fn();
  render(
    <FontePessoasContext.Provider value={fonteReal()}>
      <AnuncioFichaContext.Provider value={vi.fn()}>
        <ComCostura mutacoes={mutacoes} dados={dadosFalsos({ registos, podeEditar: opcoes.podeEditar ?? true })}><Harness aoCriado={aoCriado} ficha={opcoes.ficha ?? fichaDb()} /></ComCostura>
      </AnuncioFichaContext.Provider>
    </FontePessoasContext.Provider>,
  );
  return { criar, aoCriado };
}
const titulo = () => screen.getByRole("textbox", { name: /^Título do negócio/ });
const criarBotao = () => screen.getByRole("button", { name: /^(Criar o negócio|A guardar…)$/ });
const aba = (nome: string) => fireEvent.mouseDown(screen.getByRole("tab", { name: new RegExp(`^${nome}`) }), { button: 0 });
const chamadas = (nome: string): unknown[][] => rpcMock.mock.calls.filter((c) => c[0] === nome);

/** Escreve o título, marca uma visita nova (data por omissão, hora escrita) e faz um levantamento novo com uma resposta. */
async function preencherVisitaELevantamento(hora = "10:00") {
  fireEvent.change(titulo(), { target: { value: "Casa de banho" } });
  aba("Visita");
  fireEvent.click(screen.getByRole("button", { name: "Adicionar visita" }));
  if (hora) fireEvent.change(await screen.findByLabelText("Hora"), { target: { value: hora } });
  aba("Levantamento");
  fireEvent.click(screen.getByRole("radio", { name: "Fazer um novo" }));
  fireEvent.click(await screen.findByRole("button", { name: /Exterior do edifício/ }));
  fireEvent.click(await screen.findByRole("radio", { name: "Fácil" }));
}

describe("só se oferece o que é da pessoa", () => {
  it("a aba Visita mostra só as visitas por ligar de «a», e a Levantamento só os levantamentos dela", () => {
    montar();
    aba("Visita");
    expect(screen.getAllByRole("checkbox", { name: /^Visita de/ })).toHaveLength(1);
    aba("Levantamento");
    fireEvent.click(screen.getByRole("radio", { name: "Usar um que já existe" }));
    const lista = screen.getByRole("radiogroup", { name: "Levantamentos por ligar" });
    expect(within(lista).getAllByRole("radio")).toHaveLength(1);
  });
});

describe("perguntas do questionário", () => {
  it("sem permissão de editar (sem abas Visita e Levantamento) não se lê o questionário ao abrir", async () => {
    montar({ podeEditar: false });
    await screen.findByRole("textbox", { name: /^Título do negócio/ });
    await new Promise((r) => setTimeout(r, 30));
    expect(chamadas("neg_questionario_levantamento")).toHaveLength(0);
  });

  it("com permissão de editar lê-se (o levantamento novo precisa das perguntas)", async () => {
    montar();
    await waitFor(() => expect(chamadas("neg_questionario_levantamento").length).toBeGreaterThan(0));
  });
});

describe("ordem da gravação", () => {
  it("o negócio cria-se primeiro e as visitas e o levantamento novos depois, ligados a ele; o pedido de criar não leva as coisas novas", async () => {
    const { criar, aoCriado } = montar();
    await preencherVisitaELevantamento();
    fireEvent.click(criarBotao());
    await waitFor(() => expect(aoCriado).toHaveBeenCalledWith("id-1"));
    expect(ordem).toEqual(["criar", "neg_guardar_visita", "neg_guardar_levantamento"]);
    const pedido = criar.mock.calls[0][0] as { registos: { tipo: string }[]; levantamentoId: string | null };
    expect(pedido.levantamentoId).toBeNull();
    expect(pedido.registos).toEqual([{ tipo: "visita", id: "v1" }]);
    expect((chamadas("neg_guardar_visita")[0][1] as Record<string, unknown>).p_negocio_id).toBe("id-1");
    expect((chamadas("neg_guardar_levantamento")[0][1] as Record<string, unknown>).p_negocio_id).toBe("id-1");
  });

  it("o levantamento novo nunca se escreve sobre o que a pessoa já tem sem negócio", async () => {
    const ficha = fichaDb({ levantamentos: seccaoDb([levantamentoDb({ id: "lev-livre", data: "2026-10-12" })]) });
    const { aoCriado } = montar({ ficha });
    await preencherVisitaELevantamento();
    fireEvent.click(criarBotao());
    await waitFor(() => expect(aoCriado).toHaveBeenCalled());
    const lev = chamadas("neg_guardar_levantamento");
    expect(lev).toHaveLength(1);
    expect((lev[0][1] as Record<string, unknown>).p_id).not.toBe("lev-livre");
  });

  it("um erro previsível (visita sem hora) diz-se antes de criar o negócio e nada é escrito", async () => {
    const { criar, aoCriado } = montar();
    await preencherVisitaELevantamento("");
    fireEvent.click(criarBotao());
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(criar).not.toHaveBeenCalled();
    expect(ordem).toEqual([]);
    expect(aoCriado).not.toHaveBeenCalled();
  });
});

describe("data própria do levantamento novo (sem visita)", () => {
  it("uma data inválida não cria o negócio: diz o erro no campo da aba Levantamento e leva-lhe o foco", async () => {
    const { criar } = montar();
    fireEvent.change(titulo(), { target: { value: "Casa de banho" } });
    aba("Levantamento");
    fireEvent.click(screen.getByRole("radio", { name: "Fazer um novo" }));
    const data = await screen.findByLabelText("Data do levantamento");
    fireEvent.change(data, { target: { value: "1999-12-31" } });
    aba("Geral");
    fireEvent.click(criarBotao());
    expect(criar).not.toHaveBeenCalled();
    const campo = await screen.findByLabelText("Data do levantamento");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(campo).toHaveFocus());
  });
});

describe("levantamento: um que já existe OU um novo, nunca os dois", () => {
  it("com um existente escolhido o formulário novo não aparece, o pedido liga-o e nada se grava de levantamento", async () => {
    const { criar, aoCriado } = montar();
    fireEvent.change(titulo(), { target: { value: "Sala" } });
    aba("Levantamento");
    expect(screen.getByRole("radio", { name: "Usar um que já existe" })).toBeChecked();
    expect(screen.queryByRole("navigation", { name: /secções/i })).toBeNull();
    fireEvent.click(criarBotao());
    await waitFor(() => expect(aoCriado).toHaveBeenCalled());
    expect(criar).toHaveBeenCalledWith(expect.objectContaining({ levantamentoId: "l1" }));
    expect(chamadas("neg_guardar_levantamento")).toHaveLength(0);
  });

  it("escrever o novo e voltar a escolher o existente: o que se escreveu não se grava e o existente liga-se", async () => {
    const { criar, aoCriado } = montar();
    fireEvent.change(titulo(), { target: { value: "Sala" } });
    aba("Levantamento");
    fireEvent.click(screen.getByRole("radio", { name: "Fazer um novo" }));
    fireEvent.click(await screen.findByRole("button", { name: /Exterior do edifício/ }));
    fireEvent.click(await screen.findByRole("radio", { name: "Fácil" }));
    fireEvent.click(screen.getByRole("radio", { name: "Usar um que já existe" }));
    fireEvent.click(criarBotao());
    await waitFor(() => expect(aoCriado).toHaveBeenCalled());
    expect(criar).toHaveBeenCalledWith(expect.objectContaining({ levantamentoId: "l1" }));
    expect(chamadas("neg_guardar_levantamento")).toHaveLength(0);
  });
});

describe("falha depois de o negócio estar criado", () => {
  it("falha a visita: o painel fica aberto e diz que o negócio já foi criado; repetir não cria outro negócio", async () => {
    let falhas = 1;
    responder({ neg_guardar_visita: () => (falhas-- > 0 ? respostaErro("NG010") : respostaOk({ visita_id: "v-novo", mudou: true, ligado_a: null })) });
    const { criar, aoCriado } = montar();
    await preencherVisitaELevantamento();
    fireEvent.click(criarBotao());
    const aviso = await screen.findByText(/O negócio já foi criado/);
    expect(screen.getByRole("dialog")).toContainElement(aviso);
    expect(aoCriado).not.toHaveBeenCalled();
    expect(criar).toHaveBeenCalledTimes(1);
    fireEvent.click(criarBotao());
    await waitFor(() => expect(aoCriado).toHaveBeenCalledTimes(1));
    expect(criar).toHaveBeenCalledTimes(1);
    expect(chamadas("neg_guardar_visita")).toHaveLength(2);
  });

  it("num reenvio a verificação em seco não esconde o aviso: o negócio já existe e o aviso fica (e não se cria outro)", async () => {
    responder({ neg_guardar_visita: () => respostaErro("NG010") });
    const { criar } = montar();
    await preencherVisitaELevantamento();
    fireEvent.click(criarBotao());
    await screen.findByText(/O negócio já foi criado/);
    aba("Visita");
    fireEvent.change(await screen.findByLabelText("Hora"), { target: { value: "" } });
    fireEvent.click(criarBotao());
    await waitFor(() => expect(screen.getByText(/O negócio já foi criado/)).toBeInTheDocument());
    expect(criar).toHaveBeenCalledTimes(1);
  });

  it("NG001 no passo das visitas não fecha o painel: o aviso de que o negócio já foi criado fica", async () => {
    responder({ neg_guardar_visita: () => respostaErro("NG001") });
    montar();
    await preencherVisitaELevantamento();
    fireEvent.click(criarBotao());
    const aviso = await screen.findByText(/O negócio já foi criado/);
    expect(screen.getByRole("dialog")).toContainElement(aviso);
  });

  it("com o negócio já criado, Cancelar passa a Fechar: fecha e abre o negócio criado em vez de o deixar perdido", async () => {
    responder({ neg_guardar_visita: () => respostaErro("NG010") });
    const { aoCriado } = montar();
    await preencherVisitaELevantamento();
    fireEvent.click(criarBotao());
    await screen.findByText(/O negócio já foi criado/);
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fechar e abrir o negócio" }));
    expect(aoCriado).toHaveBeenCalledWith("id-1");
  });

  it("fechar o painel de outra forma (Esc) com o negócio já criado avisa, em vez de o deixar perdido", async () => {
    responder({ neg_guardar_visita: () => respostaErro("NG010") });
    montar();
    await preencherVisitaELevantamento();
    fireEvent.click(criarBotao());
    await screen.findByText(/O negócio já foi criado/);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(info).toHaveBeenCalledWith(expect.stringMatching(/O negócio foi criado, mas/)));
  });

  it("com o negócio já criado, o separador Geral deixa de se poder editar (o reenvio não o grava)", async () => {
    responder({ neg_guardar_visita: () => respostaErro("NG010") });
    montar();
    await preencherVisitaELevantamento();
    fireEvent.click(criarBotao());
    await screen.findByText(/O negócio já foi criado/);
    aba("Geral");
    expect(await screen.findByRole("textbox", { name: /^Título do negócio/ })).toBeDisabled();
  });

  it("falha o levantamento depois de a visita gravar: repetir só grava o levantamento e não duplica a visita", async () => {
    let falhas = 1;
    responder({
      neg_guardar_levantamento: () => (falhas-- > 0
        ? respostaErro("NG004")
        : respostaOk({ levantamento_id: "lev-x", criado: true, mudou: true, ligado_a: null, versao_questionario: 7, questionario_mudou: false })),
    });
    const { criar, aoCriado } = montar();
    await preencherVisitaELevantamento();
    fireEvent.click(criarBotao());
    await screen.findByText(/O negócio já foi criado/);
    expect(chamadas("neg_guardar_visita")).toHaveLength(1);
    fireEvent.click(criarBotao());
    await waitFor(() => expect(aoCriado).toHaveBeenCalledTimes(1));
    expect(criar).toHaveBeenCalledTimes(1);
    expect(chamadas("neg_guardar_visita")).toHaveLength(1);
    expect(chamadas("neg_guardar_levantamento")).toHaveLength(2);
  });
});
