// O painel «Visita e levantamento» na ficha REAL: o ProcessoProviderReal abre-o (abrirVisitaLevantamento), o item do menu «Mais» passa a aparecer a quem
// pode editar, grava na base (visitas e levantamento, por useGuardarRegistos), diz o que falhou dentro do painel sem o fechar nem perder o que se
// escreveu, e fecha ao mudar de pessoa. O Supabase está simulado.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { fichaDb, levantamentoDb, PESSOA_ID, pessoaDb, seccaoDb, visitaDb } from "@/hooks/pessoas/fichaFabrica";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { respostaErro, respostaOk, rpcMock } from "@/hooks/pessoas/fichaTestUtil";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { QUESTIONARIO_BRUTO, copiarBruto } from "@/hooks/pessoas/workflow/questionarioTestUtil";
import { useProcesso } from "@/components/pessoas/processo/processoContexto";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ProcessoProviderReal } from "./ProcessoProviderReal";

const { sucesso, erroToast } = vi.hoisted(() => ({ sucesso: vi.fn(), erroToast: vi.fn() }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpcMock(...a) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("react-router-dom", async (importar) => ({ ...(await importar<typeof import("react-router-dom")>()), useNavigate: () => vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: sucesso, error: erroToast } }));
vi.mock("@/hooks/pessoas/useAgendaVisita", async (importar) => ({
  ...(await importar<typeof import("@/hooks/pessoas/useAgendaVisita")>()),
  useAgendaVisita: () => ({ quadros: [], recursos: [], isLoading: false, isError: false, refetch: vi.fn(), omissao: { boardId: "q1", recursoId: "r1" } }),
}));

beforeAll(async () => {
  prepararRadixNoJsdom();
  // O painel carrega-se à parte quando se abre pela primeira vez: aquece-se o módulo para o primeiro teste não pagar a transformação a frio.
  await import("./PainelVisitaLevantamentoReal");
}, 60_000);
afterEach(cleanup);

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "manual" };
const VISITA = visitaDb({
  id: "v-base", inicio: "2026-10-22T09:00:00Z", fim: "2026-10-22T10:00:00Z", board_id: "q-base", feito_por_nome: "Rita Gomes",
  recursos: [{ id: "r-base", nome: "Rita", user_id: "u1", ativo: true }],
  detalhes: { morada: { rua: "Rua A 1", codigo_postal: "1000-001", localidade: "Lisboa" }, igual_a_lead: false },
});
const FICHA: FichaDb = fichaDb({ visitas: seccaoDb([VISITA]) });

function Consumidor({ pessoa = PESSOA_ID }: { pessoa?: string }) {
  const processo = useProcesso();
  return (
    <>
      <span data-testid="painel">{String(processo?.comPainelVisita)}</span>
      <button type="button" onClick={(e) => processo?.abrirVisitaLevantamento(pessoa, e.currentTarget)}>abrir painel</button>
    </>
  );
}

const arvore = (ficha: FichaDb | null, pessoa?: string) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <FontePessoasContext.Provider value={REAL}>
      <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos()}>
        <ProcessoProviderReal ficha={ficha}><Consumidor pessoa={pessoa} /></ProcessoProviderReal>
      </ComCostura>
    </FontePessoasContext.Provider>
  </QueryClientProvider>
);
const montar = (ficha: FichaDb | null = FICHA, pessoa?: string) => render(arvore(ficha, pessoa));

function responder(respostas: Record<string, () => Promise<unknown>> = {}): void {
  rpcMock.mockImplementation((nome: string) => {
    if (respostas[nome]) return respostas[nome]();
    if (nome === "neg_questionario_levantamento") return respostaOk(QUESTIONARIO_BRUTO);
    if (nome === "neg_guardar_visita") return respostaOk({ visita_id: "v-novo", mudou: true, ligado_a: null });
    if (nome === "neg_guardar_levantamento") return respostaOk({ levantamento_id: "lev-x", criado: true, mudou: true, ligado_a: null, versao_questionario: 7, questionario_mudou: false });
    return respostaOk({ mudou: true });
  });
}
beforeEach(() => { rpcMock.mockReset(); sucesso.mockReset(); erroToast.mockReset(); responder(); });

const TITULO = "Visita e levantamento de Ana Lopes";
const GUARDAR = "Guardar a visita e o levantamento";
const painel = () => screen.queryByRole("dialog", { name: TITULO });
const abrir = async (): Promise<HTMLElement> => {
  fireEvent.click(screen.getByRole("button", { name: "abrir painel" }));
  const d = await screen.findByRole("dialog", { name: TITULO }, { timeout: 8000 });
  // Só se grava com as perguntas da base carregadas: o botão deixa de estar bloqueado.
  await waitFor(() => expect(within(d).getByRole("button", { name: GUARDAR })).not.toHaveAttribute("aria-disabled"));
  return d;
};
const chamadas = (): string[] => rpcMock.mock.calls.map((c) => c[0] as string).filter((n) => n !== "neg_questionario_levantamento");
const abrirCartao = (d: HTMLElement) => fireEvent.click(within(d).getByRole("button", { name: /^1\.ª visita/ }));
const escrever = (d: HTMLElement, rotulo: string, valor: string) => fireEvent.change(within(d).getByLabelText(rotulo), { target: { value: valor } });

describe("quem vê o item «Visita e levantamento» (comPainelVisita)", () => {
  it("quem pode editar a ficha vê-o", () => {
    montar();
    expect(screen.getByTestId("painel")).toHaveTextContent("true");
  });

  it("uma pessoa com a abordagem encerrada não vê o item (abri-lo não faria nada)", () => {
    const encerrada = fichaDb({
      lead: { ...FICHA.lead!, estado: "closed", aberta: false, encerramento: { resultado: "semInteresse", motivo: "preco", motivo_outro: null, em: "2026-10-15T09:00:00Z" } },
    });
    montar(encerrada);
    expect(screen.getByTestId("painel")).toHaveTextContent("false");
    fireEvent.click(screen.getByRole("button", { name: "abrir painel" }));
    expect(painel()).toBeNull();
  });

  it("sem permissão para editar, sem ficha ou fora da base, não vê", () => {
    montar(fichaDb({ permissoes: { editar: false, criar: true } }));
    expect(screen.getByTestId("painel")).toHaveTextContent("false");
    cleanup();
    montar(null);
    expect(screen.getByTestId("painel")).toHaveTextContent("false");
  });
});

describe("abrir o painel", () => {
  it("abre com o título da pessoa, na aba Visita e com as visitas dela; as da base não se removem, cancelam-se", async () => {
    montar();
    const d = await abrir();
    expect(within(d).getByRole("tab", { name: /^Visita/ })).toHaveAttribute("aria-selected", "true");
    expect(within(d).getByRole("button", { name: /^1\.ª visita/ })).toHaveTextContent("Por fazer");
    expect(within(d).queryByRole("button", { name: /^Remover a visita/ })).toBeNull();
    expect(within(d).getByRole("button", { name: "Cancelar a visita de 22/10/2026" })).toBeInTheDocument();
  });

  it("a ficha real grava mesmo: o selo «Novo · por gravar» do exemplo não aparece", async () => {
    montar();
    const d = await abrir();
    expect(within(d).queryByText(/por gravar/i)).toBeNull();
  });

  it("um pedido para outra pessoa que não a da ficha aberta não abre nada", () => {
    montar(FICHA, "outra-pessoa");
    fireEvent.click(screen.getByRole("button", { name: "abrir painel" }));
    expect(painel()).toBeNull();
  });

  it("sem a pessoa a ler as perguntas da base, não deixa guardar (o botão fica aria-disabled)", async () => {
    rpcMock.mockImplementation((nome: string) => (nome === "neg_questionario_levantamento" ? new Promise(() => {}) : respostaOk({})));
    montar();
    fireEvent.click(screen.getByRole("button", { name: "abrir painel" }));
    const d = await screen.findByRole("dialog", { name: TITULO });
    expect(within(d).getByRole("button", { name: GUARDAR })).toHaveAttribute("aria-disabled", "true");
  });
});

describe("gravar", () => {
  it("alterar uma visita da base grava por neg_alterar_visita (com o quadro e os recursos dela), avisa e fecha o painel", async () => {
    montar();
    const d = await abrir();
    abrirCartao(d);
    escrever(d, "Nota (opcional)", "levar fita");
    fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(painel()).toBeNull());
    expect(chamadas()).toEqual(["neg_alterar_visita"]);
    expect(rpcMock.mock.calls.find((c) => c[0] === "neg_alterar_visita")?.[1]).toMatchObject({
      p_visita_id: "v-base", p_board_id: "q-base", p_recursos: null, p_notas: "levar fita",
    });
    expect(sucesso).toHaveBeenCalledTimes(1);
  });

  it("cancelar uma visita da base (com confirmação) só chega à base ao guardar", async () => {
    montar();
    const d = await abrir();
    fireEvent.click(within(d).getByRole("button", { name: "Cancelar a visita de 22/10/2026" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancelar a visita" }));
    expect(chamadas()).toEqual([]);
    fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(painel()).toBeNull());
    expect(chamadas()).toEqual(["neg_cancelar_visita"]);
  });

  it("sem nada a guardar, fecha com a mensagem de que não havia alterações e não chama a base", async () => {
    montar();
    const d = await abrir();
    fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(painel()).toBeNull());
    expect(chamadas()).toEqual([]);
    expect(String(sucesso.mock.calls[0]?.[0] ?? "")).toMatch(/Não havia alterações/);
  });

  it("uma visita nova sem hora não chega à base: o painel diz o que falta, dentro do alerta, e fica aberto com o que se escreveu", async () => {
    montar();
    const d = await abrir();
    fireEvent.click(within(d).getByRole("button", { name: "Adicionar visita" }));
    fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
    expect(await within(d).findByRole("alert")).toHaveTextContent("Indique a hora da visita antes de guardar.");
    expect(chamadas()).toEqual([]);
    expect(painel()).not.toBeNull();
  });

  it("uma visita nova com hora cria-se com o quadro e o recurso por omissão, e a ficha não a conta como contacto nem lhe grava nota", async () => {
    montar();
    const d = await abrir();
    fireEvent.click(within(d).getByRole("button", { name: "Adicionar visita" }));
    fireEvent.change(await within(d).findByLabelText("Hora"), { target: { value: "11:00" } });
    fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(painel()).toBeNull());
    expect(chamadas()).toEqual(["neg_guardar_visita"]);
    expect(rpcMock.mock.calls.find((c) => c[0] === "neg_guardar_visita")?.[1]).toMatchObject({
      p_entity_id: PESSOA_ID, p_board_id: "q1", p_recursos: ["r1"], p_negocio_id: null,
    });
  });

  it("um erro da base (NG010: recurso ocupado) diz-se no painel, que fica aberto, com o botão outra vez disponível", async () => {
    responder({ neg_guardar_visita: () => respostaErro("NG010") });
    montar();
    const d = await abrir();
    fireEvent.click(within(d).getByRole("button", { name: "Adicionar visita" }));
    fireEvent.change(await within(d).findByLabelText("Hora"), { target: { value: "11:00" } });
    fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
    expect(await within(d).findByRole("alert")).toHaveTextContent(/já tem uma marcação/);
    expect(painel()).not.toBeNull();
    expect(within(d).getByRole("button", { name: GUARDAR })).not.toHaveAttribute("aria-busy");
  });

  it("falha a meio: diz o que ficou gravado e o que falhou, e repetir não cria a visita outra vez", async () => {
    let falha = true;
    responder({ neg_alterar_visita: () => (falha ? respostaErro("NG017") : respostaOk({ mudou: true })) });
    montar();
    const d = await abrir();
    fireEvent.click(within(d).getByRole("button", { name: "Adicionar visita" }));
    fireEvent.change(await within(d).findByLabelText("Hora"), { target: { value: "11:00" } });
    // A visita da base leva uma nota nova, e falha ao alterar depois de a nova ficar criada (a nova cria-se primeiro).
    fireEvent.click(within(d).getByRole("button", { name: /22\/10\/2026 · 10:00/ }));
    escrever(d, "Nota (opcional)", "x");
    fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
    const alerta = await within(d).findByRole("alert");
    expect(alerta).toHaveTextContent(/Ficou gravado: a visita nova\. Não foi possível gravar: a alteração da visita\./);
    falha = false;
    fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(painel()).toBeNull());
    expect(chamadas().filter((n) => n === "neg_guardar_visita")).toHaveLength(1);
  });

  it("um duplo clique em Guardar manda uma só gravação", async () => {
    montar();
    const d = await abrir();
    abrirCartao(d);
    escrever(d, "Nota (opcional)", "x");
    const botao = within(d).getByRole("button", { name: GUARDAR });
    fireEvent.click(botao);
    fireEvent.click(botao);
    await waitFor(() => expect(painel()).toBeNull());
    expect(chamadas()).toEqual(["neg_alterar_visita"]);
    expect(sucesso).toHaveBeenCalledTimes(1);
  });

  it("enquanto grava, o painel está ocupado (aria-busy) e não se fecha", async () => {
    let largar: (() => void) | undefined;
    responder({ neg_alterar_visita: () => new Promise((resolver) => { largar = () => resolver({ data: { mudou: true }, error: null }); }) });
    montar();
    const d = await abrir();
    abrirCartao(d);
    escrever(d, "Nota (opcional)", "x");
    fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(within(d).getByRole("button", { name: GUARDAR })).toHaveAttribute("aria-busy", "true"));
    fireEvent.keyDown(d, { key: "Escape" });
    expect(painel()).not.toBeNull();
    largar?.();
    await waitFor(() => expect(painel()).toBeNull());
  });
});

describe("o levantamento", () => {
  it("o levantamento livre da ficha abre o painel já preenchido, e grava-se com o id dele", async () => {
    const ficha = fichaDb({
      visitas: seccaoDb([VISITA]),
      levantamentos: seccaoDb([levantamentoDb({ id: "lev-livre", visita_id: "v-base", data: "2026-10-22", notas: "obs antigas" })]),
    });
    montar(ficha);
    const d = await abrir();
    fireEvent.click(within(d).getByRole("button", { name: /^Medidas/ }));
    const observacoes = await within(d).findByLabelText(/Observações/);
    expect(observacoes).toHaveValue("obs antigas");
    fireEvent.change(observacoes, { target: { value: "obs novas" } });
    fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(painel()).toBeNull());
    const [chamada] = rpcMock.mock.calls.filter((c) => c[0] === "neg_guardar_levantamento");
    expect(chamada[1]).toMatchObject({ p_id: "lev-livre", p_entity_id: PESSOA_ID, p_dados: { notas: "obs novas", versao_questionario: 7 } });
  });

  it("se o questionário mudou entretanto, o levantamento fica gravado mas o painel não fecha: pede para conferir as respostas", async () => {
    responder({
      neg_guardar_levantamento: () => respostaOk({ levantamento_id: "lev-x", criado: true, mudou: true, ligado_a: null, versao_questionario: 8, questionario_mudou: true }),
    });
    montar();
    const d = await abrir();
    fireEvent.click(within(d).getByRole("button", { name: /^Medidas/ }));
    fireEvent.change(await within(d).findByLabelText(/Observações/), { target: { value: "algo" } });
    fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
    expect(await within(d).findByRole("alert")).toHaveTextContent(/confirme as respostas/);
    expect(painel()).not.toBeNull();
    expect(within(d).getByLabelText(/Observações/)).toHaveValue("algo");
  });
});

describe("trocar de pessoa", () => {
  const OUTRA = "33333333-3333-4333-8333-333333333333";
  const fichaOutra = fichaDb({ pessoa: pessoaDb({ id: OUTRA, nome: "Outra Pessoa" }) });

  it("fecha o painel, e voltar à pessoa em que se abriu não o reabre", async () => {
    const r = montar();
    await abrir();
    r.rerender(arvore(fichaOutra));
    await waitFor(() => expect(painel()).toBeNull());
    r.rerender(arvore(FICHA));
    await new Promise((resolver) => setTimeout(resolver, 0));
    expect(painel()).toBeNull();
  });

  it("uma gravação que falha DEPOIS de trocar de pessoa diz-se num toast de erro (o painel já fechou e a mensagem de dentro não se vê)", async () => {
    let falhar: (() => void) | undefined;
    responder({ neg_alterar_visita: () => new Promise((resolver) => { falhar = () => resolver({ data: null, error: { code: "NG017", message: "x" } }); }) });
    const r = montar();
    const d = await abrir();
    abrirCartao(d);
    escrever(d, "Nota (opcional)", "x");
    fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(within(d).getByRole("button", { name: GUARDAR })).toHaveAttribute("aria-busy", "true"));
    r.rerender(arvore(fichaOutra));
    await waitFor(() => expect(painel()).toBeNull());
    expect(erroToast).not.toHaveBeenCalled();
    falhar?.();
    await waitFor(() => expect(erroToast).toHaveBeenCalledTimes(1));
    expect(String(erroToast.mock.calls[0]?.[0] ?? "").length).toBeGreaterThan(0);
  });

  it("uma gravação que falha com o painel aberto continua a dizer-se DENTRO do painel, sem toast", async () => {
    responder({ neg_alterar_visita: () => respostaErro("NG017") });
    montar();
    const d = await abrir();
    abrirCartao(d);
    escrever(d, "Nota (opcional)", "x");
    fireEvent.click(within(d).getByRole("button", { name: GUARDAR }));
    expect(await within(d).findByRole("alert")).toBeInTheDocument();
    expect(erroToast).not.toHaveBeenCalled();
  });
});

describe("o texto das perguntas é texto puro no painel real", () => {
  const XSS = "<img src=x onerror=alert(1)>";
  it("secção, pergunta e opção com HTML aparecem como texto, sem criar elementos", async () => {
    const bruto = copiarBruto();
    const exterior = bruto.seccoes.find((s) => s.chave === "exterior")!;
    exterior.titulo = XSS;
    exterior.perguntas[0].texto = XSS;
    exterior.perguntas[0].opcoes[0].texto = "<b>negrito</b>";
    responder({ neg_questionario_levantamento: () => respostaOk(bruto) });
    montar();
    const d = await abrir();
    const secoes = within(within(d).getByRole("navigation", { name: "Secções da visita" })).getAllByRole("button");
    fireEvent.click(secoes[1]);
    expect(document.body.querySelector("img")).toBeNull();
    expect(document.body.querySelector("b")).toBeNull();
    expect(within(d).getAllByText(XSS, { exact: false }).length).toBeGreaterThanOrEqual(2);
    expect(within(d).getByText("<b>negrito</b>", { exact: false })).toBeInTheDocument();
  });
});
