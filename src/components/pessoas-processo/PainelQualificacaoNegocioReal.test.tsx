// O painel «Visita e levantamento» aberto sobre um NEGÓCIO grava a Qualificação por neg_guardar_qualificacao: só as perguntas da aba Qualificação e «o que o
// cliente pediu», só o que mudou (NULL = não mexe), ANTES do levantamento (é a que se pode repetir sem criar nada). O Supabase está simulado.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fichaDb, negocioDb } from "@/hooks/pessoas/fichaFabrica";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { respostaErro, respostaOk, rpcMock } from "@/hooks/pessoas/fichaTestUtil";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { QUESTIONARIO_BRUTO } from "@/hooks/pessoas/workflow/questionarioTestUtil";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { LevantamentoDoNegocioProvider, useLevantamentoDoNegocio } from "./LevantamentoDoNegocioReal";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpcMock(...a) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/pessoas/useAgendaVisita", async (importar) => ({
  ...(await importar<typeof import("@/hooks/pessoas/useAgendaVisita")>()),
  useAgendaVisita: () => ({ quadros: [], recursos: [], isLoading: false, isError: false, refetch: vi.fn(), omissao: { boardId: "q1", recursoId: "r1" } }),
}));

beforeAll(async () => {
  prepararRadixNoJsdom();
  await import("./PainelVisitaLevantamentoReal");
}, 60_000);
afterEach(cleanup);

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "manual" };
const NEGOCIO = "n1";
const TITULO = "Visita e levantamento de Ana Lopes";
const GUARDAR = "Guardar a visita e o levantamento";

const GRAVADAS = [{
  seccao: "qualificacao", pergunta: "imovel", resposta: "apartamento", tipo: "escolha_multipla", escolhas: ["apartamento"], escolhas_texto: ["Apartamento"],
  pergunta_texto: "Tipo de imóvel", seccao_titulo: "Qualificação", bloco: null, ordem: 0, valor_texto: null, valor_numero: null,
}];
const FICHA: FichaDb = fichaDb({
  negocios: {
    total: 1,
    itens: [negocioDb({ id: NEGOCIO, pedido_cliente: "Remodelar a casa de banho", versao_questionario: 7, qualificacao: GRAVADAS })],
  },
});

function Consumidor() {
  const levantamento = useLevantamentoDoNegocio();
  return <button type="button" onClick={(e) => levantamento?.abrir(NEGOCIO, e.currentTarget)}>abrir levantamento</button>;
}

const montar = (ficha: FichaDb = FICHA) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <FontePessoasContext.Provider value={REAL}>
      <LevantamentoDoNegocioProvider ficha={ficha}><Consumidor /></LevantamentoDoNegocioProvider>
    </FontePessoasContext.Provider>
  </QueryClientProvider>,
);

function responder(sobre: Record<string, () => Promise<unknown>> = {}): void {
  rpcMock.mockImplementation((nome: string) => {
    if (sobre[nome]) return sobre[nome]();
    if (nome === "neg_questionario_levantamento") return respostaOk(QUESTIONARIO_BRUTO);
    if (nome === "neg_guardar_qualificacao") {
      return respostaOk({ qualificacao_id: "q-1", criado: false, mudou: true, versao_questionario: 7, questionario_mudou: false });
    }
    if (nome === "neg_guardar_levantamento") return respostaOk({ levantamento_id: "lev-x", criado: true, mudou: true, ligado_a: NEGOCIO, versao_questionario: 7, questionario_mudou: false });
    return respostaOk({ mudou: true });
  });
}
beforeEach(() => { rpcMock.mockReset(); responder(); });

const abrir = async (): Promise<HTMLElement> => {
  fireEvent.click(screen.getByRole("button", { name: "abrir levantamento" }));
  const d = await screen.findByRole("dialog", { name: TITULO }, { timeout: 8000 });
  await waitFor(() => expect(within(d).getByRole("button", { name: GUARDAR })).not.toHaveAttribute("aria-disabled"));
  fireEvent.mouseDown(within(d).getByRole("tab", { name: /^Qualificação/ }));
  return d;
};
const guardar = (d: HTMLElement) => fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
const qualificacoes = () => rpcMock.mock.calls.filter((c) => c[0] === "neg_guardar_qualificacao").map((c) => c[1] as Record<string, unknown>);
const nomesDasChamadas = () => rpcMock.mock.calls.map((c) => c[0] as string).filter((n) => n !== "neg_questionario_levantamento");

describe("a Qualificação do negócio no painel", () => {
  it("abre com o pedido e as respostas já gravadas no negócio", async () => {
    montar();
    const d = await abrir();
    expect(within(d).getByLabelText(/O que o cliente pediu/)).toHaveValue("Remodelar a casa de banho");
    expect(within(d).getByRole("checkbox", { name: "Apartamento" })).toHaveAttribute("aria-checked", "true");
  });

  it("grava o pedido novo e a resposta mudada, só as da Qualificação, com a versão do questionário", async () => {
    montar();
    const d = await abrir();
    fireEvent.change(within(d).getByLabelText(/O que o cliente pediu/), { target: { value: "  Cozinha nova  " } });
    fireEvent.click(within(d).getByRole("checkbox", { name: "Moradia" }));
    guardar(d);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITULO })).toBeNull());
    expect(qualificacoes()).toHaveLength(1);
    const [q] = qualificacoes();
    expect(q).toMatchObject({ p_negocio_id: NEGOCIO, p_pedido_cliente: "Cozinha nova", p_versao_questionario: 7 });
    expect(Object.keys(q.p_respostas as object)).toEqual(["imovel"]);
  });

  it("grava a Qualificação ANTES do levantamento", async () => {
    montar();
    const d = await abrir();
    fireEvent.change(within(d).getByLabelText(/O que o cliente pediu/), { target: { value: "Outro pedido" } });
    fireEvent.mouseDown(within(d).getByRole("tab", { name: /^Visita/ }));
    fireEvent.click(within(d).getByRole("button", { name: /^Medidas/ }));
    fireEvent.change(await within(d).findByLabelText(/Observações/), { target: { value: "obs" } });
    guardar(d);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITULO })).toBeNull());
    expect(nomesDasChamadas()).toEqual(["neg_guardar_qualificacao", "neg_guardar_levantamento"]);
  });

  it("só o pedido mudou: as respostas vão NULL (não mexe)", async () => {
    montar();
    const d = await abrir();
    fireEvent.change(within(d).getByLabelText(/O que o cliente pediu/), { target: { value: "Só o pedido" } });
    guardar(d);
    await waitFor(() => expect(qualificacoes()).toHaveLength(1));
    expect(qualificacoes()[0]).toMatchObject({ p_pedido_cliente: "Só o pedido", p_respostas: null });
  });

  it("só uma resposta mudou: o pedido vai NULL (não mexe)", async () => {
    montar();
    const d = await abrir();
    fireEvent.click(within(d).getByRole("checkbox", { name: "Moradia" }));
    guardar(d);
    await waitFor(() => expect(qualificacoes()).toHaveLength(1));
    expect(qualificacoes()[0].p_pedido_cliente).toBeNull();
    expect(qualificacoes()[0].p_respostas).not.toBeNull();
  });

  it("apagar o pedido limpa-o (vai vazio, não NULL)", async () => {
    montar();
    const d = await abrir();
    fireEvent.change(within(d).getByLabelText(/O que o cliente pediu/), { target: { value: "" } });
    guardar(d);
    await waitFor(() => expect(qualificacoes()).toHaveLength(1));
    expect(qualificacoes()[0].p_pedido_cliente).toBe("");
  });

  it("apagar todas as respostas apaga-as na base ({} e não NULL)", async () => {
    montar();
    const d = await abrir();
    fireEvent.click(within(d).getByRole("checkbox", { name: "Apartamento" }));
    guardar(d);
    await waitFor(() => expect(qualificacoes()).toHaveLength(1));
    expect(qualificacoes()[0].p_respostas).toEqual({});
  });

  it("sem nada mudado na Qualificação não chama a base para a gravar", async () => {
    montar();
    const d = await abrir();
    fireEvent.mouseDown(within(d).getByRole("tab", { name: /^Visita/ }));
    guardar(d);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITULO })).toBeNull());
    expect(qualificacoes()).toHaveLength(0);
  });

  it("se a Qualificação grava e o levantamento falha, o erro diz que a Qualificação e o pedido ficaram gravados", async () => {
    responder({ neg_guardar_levantamento: () => respostaErro("NG002") });
    montar();
    const d = await abrir();
    fireEvent.change(within(d).getByLabelText(/O que o cliente pediu/), { target: { value: "Outro pedido" } });
    fireEvent.mouseDown(within(d).getByRole("tab", { name: /^Visita/ }));
    fireEvent.click(within(d).getByRole("button", { name: /^Medidas/ }));
    fireEvent.change(await within(d).findByLabelText(/Observações/), { target: { value: "obs" } });
    guardar(d);
    const alerta = await within(d).findByRole("alert");
    expect(alerta).toHaveTextContent(/Qualificação e o pedido do cliente ficaram gravados/);
    expect(qualificacoes()).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: TITULO })).toBeInTheDocument();
  });

  it("se a Qualificação falha, o erro NÃO diz que ficou gravada", async () => {
    responder({ neg_guardar_qualificacao: () => respostaErro("NG002") });
    montar();
    const d = await abrir();
    fireEvent.change(within(d).getByLabelText(/O que o cliente pediu/), { target: { value: "X" } });
    guardar(d);
    expect(await within(d).findByRole("alert")).not.toHaveTextContent(/ficaram gravados/);
  });

  it("se a Qualificação falha, o painel fica aberto com o erro, nada do levantamento se grava e o que se escreveu não se perde", async () => {
    responder({ neg_guardar_qualificacao: () => respostaErro("NG002") });
    montar();
    const d = await abrir();
    fireEvent.change(within(d).getByLabelText(/O que o cliente pediu/), { target: { value: "Pedido perdido?" } });
    guardar(d);
    expect(await within(d).findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: TITULO })).toBeInTheDocument();
    expect(within(d).getByLabelText(/O que o cliente pediu/)).toHaveValue("Pedido perdido?");
    expect(nomesDasChamadas()).not.toContain("neg_guardar_levantamento");
  });
});
