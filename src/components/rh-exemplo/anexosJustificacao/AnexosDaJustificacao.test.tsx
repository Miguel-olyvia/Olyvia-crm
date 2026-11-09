// A lista dos anexos de uma justificação: o que se vê depende só do que a RPC de listar devolve (nome oculto, pode_abrir,
// pode_remover). A Edge, o storage e a base estão simulados.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

const m = vi.hoisted(() => ({ invoke: vi.fn(), upload: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: m.invoke }, storage: { from: () => ({ uploadToSignedUrl: m.upload }) } },
}));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: m.rpc, hrFrom: () => ({}) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { renderRh } from "@/test/rhExemploProviders";
import { avisarMudancaDeJustificacoes } from "@/hooks/useJustificacoesDoDia";
import { AnexosDaJustificacao } from "./AnexosDaJustificacao";

const DIA = { justificacaoDiaId: "d-1" };
const linha = (parcial: Record<string, unknown> = {}) => ({
  id: "a-1", estado: "verificado", nome: "atestado.pdf", mime_type: "application/pdf", tamanho_bytes: 2048, criado_em: "2026-11-01T10:00:00Z",
  carregado_por_nome: "Ana", pode_abrir: true, pode_remover: true, origem: "dia", ...parcial,
});
const erroHttp = (codigo: string) => ({ data: null, error: { context: new Response(JSON.stringify({ error: codigo }), { status: 409 }) } });
const pdf = (n: string) => new File(["x"], n, { type: "application/pdf" });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem("language", "pt");
  m.rpc.mockResolvedValue({ data: [], error: null });
});
afterEach(() => cleanup());

describe("AnexosDaJustificacao", () => {
  it("sem anexos, sem acesso ou com a RPC recusada não ocupa lugar", async () => {
    const { container } = renderRh(<AnexosDaJustificacao alvo={DIA} />);
    await waitFor(() => expect(m.rpc).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    m.rpc.mockResolvedValue({ data: null, error: { code: "P0002" } });
    const outro = renderRh(<AnexosDaJustificacao alvo={{ faltaId: "f-1" }} />);
    await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(2));
    expect(outro.container).toBeEmptyDOMElement();
  });

  it("lê pelo id da justificação do dia ou pelo id da falta, nunca pelos dois", async () => {
    renderRh(<AnexosDaJustificacao alvo={{ faltaId: "f-9" }} />);
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("rpc_hr_justificacao_anexos_listar", { _justificacao_dia_id: null, _falta_id: "f-9" }));
  });

  it("mostra o nome, «Abrir» e «Remover» conforme pode_abrir e pode_remover, com alvos de 44 px", async () => {
    m.rpc.mockResolvedValue({ data: [linha(), linha({ id: "a-2", nome: "receita.png", pode_abrir: false, pode_remover: false })], error: null });
    renderRh(<AnexosDaJustificacao alvo={DIA} />);
    const lista = await screen.findByLabelText("Anexos da justificação");
    const primeiro = within(lista).getByText("atestado.pdf").closest("li") as HTMLElement;
    expect(within(primeiro).getByRole("button", { name: "Abrir atestado.pdf" })).toHaveClass("min-h-11");
    expect(within(primeiro).getByRole("button", { name: "Remover atestado.pdf" })).toHaveClass("min-h-11");
    const segundo = within(lista).getByText("receita.png").closest("li") as HTMLElement;
    expect(within(segundo).queryByRole("button")).not.toBeInTheDocument();
  });

  it("com o nome oculto diz «N anexos» e mostra «Anexo» com o tamanho, sem botões", async () => {
    m.rpc.mockResolvedValue({ data: [linha({ nome: null, pode_abrir: false, pode_remover: false }), linha({ id: "a-2", nome: null, tamanho_bytes: 4096, pode_abrir: false, pode_remover: false })], error: null });
    renderRh(<AnexosDaJustificacao alvo={DIA} />);
    expect(await screen.findByTestId("rhjd-anexos-contagem")).toHaveTextContent("2 anexos");
    expect(screen.getByText("Anexo · 2 kB")).toBeInTheDocument();
    expect(screen.getByText("Anexo · 4 kB")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/atestado/)).not.toBeInTheDocument();
  });

  it("um só anexo oculto diz «1 anexo»", async () => {
    m.rpc.mockResolvedValue({ data: [linha({ nome: null, pode_abrir: false, pode_remover: false })], error: null });
    renderRh(<AnexosDaJustificacao alvo={DIA} />);
    expect(await screen.findByTestId("rhjd-anexos-contagem")).toHaveTextContent("1 anexo");
  });

  const janelaFalsa = () => ({ location: { href: "" }, close: vi.fn(), opener: {} as unknown });

  it("abrir: a janela abre-se logo no clique (antes de a Edge responder) e só depois recebe o URL, sem opener", async () => {
    m.rpc.mockResolvedValue({ data: [linha()], error: null });
    let responder: (v: unknown) => void = () => {};
    m.invoke.mockReturnValue(new Promise((r) => { responder = r; }));
    const janela = janelaFalsa();
    const abrir = vi.spyOn(window, "open").mockReturnValue(janela as unknown as Window);
    renderRh(<AnexosDaJustificacao alvo={DIA} />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir atestado.pdf" }));
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir.mock.calls[0][0]).toBe("about:blank");
    expect(abrir.mock.calls[0][1]).toBe("_blank");
    expect(janela.location.href).toBe("");
    responder({ data: { ok: true, url: "https://exemplo/assinado", expiraEmSegundos: 60, mime_type: "application/pdf" }, error: null });
    await waitFor(() => expect(janela.location.href).toBe("https://exemplo/assinado"));
    expect(janela.opener).toBeNull();
    expect(janela.close).not.toHaveBeenCalled();
    expect(m.invoke).toHaveBeenCalledWith("hr-justificacao-anexo", { body: { accao: "abrir", anexo_id: "a-1" } });
    abrir.mockRestore();
  });

  it("abrir com a janela bloqueada pelo browser: oferece uma ligação alternativa para o mesmo URL", async () => {
    m.rpc.mockResolvedValue({ data: [linha()], error: null });
    m.invoke.mockResolvedValue({ data: { ok: true, url: "https://exemplo/assinado", expiraEmSegundos: 60, mime_type: "application/pdf" }, error: null });
    const abrir = vi.spyOn(window, "open").mockReturnValue(null);
    renderRh(<AnexosDaJustificacao alvo={DIA} />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir atestado.pdf" }));
    const ligacao = await screen.findByRole("link", { name: /Abrir o ficheiro/ });
    expect(ligacao).toHaveAttribute("href", "https://exemplo/assinado");
    expect(ligacao).toHaveAttribute("target", "_blank");
    expect(ligacao).toHaveAttribute("rel", "noopener noreferrer");
    abrir.mockRestore();
  });

  it("se a abertura é recusada, fecha a janela em branco e anuncia o erro traduzido (nunca o código)", async () => {
    m.rpc.mockResolvedValue({ data: [linha()], error: null });
    m.invoke.mockResolvedValue(erroHttp("sem_permissao"));
    const janela = janelaFalsa();
    const abrir = vi.spyOn(window, "open").mockReturnValue(janela as unknown as Window);
    renderRh(<AnexosDaJustificacao alvo={DIA} />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir atestado.pdf" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Não tem permissão para fazer isto.");
    expect(alerta).not.toHaveTextContent("sem_permissao");
    expect(janela.close).toHaveBeenCalledTimes(1);
    expect(janela.location.href).toBe("");
    expect(screen.queryByRole("link", { name: /Abrir o ficheiro/ })).not.toBeInTheDocument();
    abrir.mockRestore();
  });

  it("com um 401 de autenticação vê o texto da sessão e não o texto cru da autenticação", async () => {
    m.rpc.mockResolvedValue({ data: [linha()], error: null });
    m.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 401 }) } });
    const abrir = vi.spyOn(window, "open").mockReturnValue(null);
    renderRh(<AnexosDaJustificacao alvo={DIA} />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir atestado.pdf" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("A sessão terminou.");
    expect(alerta).not.toHaveTextContent("Invalid or expired token");
    abrir.mockRestore();
  });

  it("relê a lista quando alguém avisa que as justificações mudaram (por exemplo, os ficheiros da fase 2 acabaram de subir)", async () => {
    m.rpc.mockResolvedValueOnce({ data: [], error: null });
    renderRh(<AnexosDaJustificacao alvo={DIA} alvoAnexar={DIA} />);
    await screen.findByLabelText("Anexar ficheiros");
    expect(screen.queryByText("atestado.pdf")).not.toBeInTheDocument();
    m.rpc.mockResolvedValue({ data: [linha()], error: null });
    act(() => avisarMudancaDeJustificacoes());
    expect(await screen.findByText("atestado.pdf")).toBeInTheDocument();
    expect(m.rpc).toHaveBeenCalledTimes(2);
  });

  it("deixa de ouvir o aviso quando desmonta (nenhuma leitura depois)", async () => {
    const { unmount } = renderRh(<AnexosDaJustificacao alvo={DIA} alvoAnexar={DIA} />);
    await screen.findByLabelText("Anexar ficheiros");
    unmount();
    m.rpc.mockClear();
    act(() => avisarMudancaDeJustificacoes());
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("depois de remover, o foco vai para o item seguinte; se era o último, para o campo de ficheiros", async () => {
    const dois = [linha(), linha({ id: "a-2", nome: "receita.png" })];
    m.rpc.mockResolvedValueOnce({ data: dois, error: null }).mockResolvedValueOnce({ data: [dois[1]], error: null }).mockResolvedValue({ data: [], error: null });
    m.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    renderRh(<AnexosDaJustificacao alvo={DIA} alvoAnexar={DIA} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remover atestado.pdf" }));
    const proximo = await screen.findByRole("button", { name: "Abrir receita.png" });
    await waitFor(() => expect(proximo).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Remover receita.png" }));
    await waitFor(() => expect(screen.getByLabelText("Anexar ficheiros")).toHaveFocus());
  });

  it("remover chama a Edge e volta a ler a lista", async () => {
    m.rpc.mockResolvedValueOnce({ data: [linha()], error: null }).mockResolvedValue({ data: [], error: null });
    m.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const { container } = renderRh(<AnexosDaJustificacao alvo={DIA} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remover atestado.pdf" }));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(m.invoke).toHaveBeenCalledWith("hr-justificacao-anexo", { body: { accao: "remover", anexo_id: "a-1" } });
  });

  it("remover recusado (justificação decidida) anuncia o erro e mantém o anexo", async () => {
    m.rpc.mockResolvedValue({ data: [linha()], error: null });
    m.invoke.mockResolvedValue(erroHttp("justificacao_decidida"));
    renderRh(<AnexosDaJustificacao alvo={DIA} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remover atestado.pdf" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta justificação já foi decidida: já não aceita anexos.");
    expect(screen.getByText("atestado.pdf")).toBeInTheDocument();
  });

  it("só oferece «Anexar ficheiros» com alvoAnexar; sobe, e os que falham ficam com «Tentar outra vez»", async () => {
    renderRh(<AnexosDaJustificacao alvo={DIA} />);
    await waitFor(() => expect(m.rpc).toHaveBeenCalled());
    expect(screen.queryByLabelText("Anexar ficheiros")).not.toBeInTheDocument();
    cleanup();

    m.invoke
      .mockResolvedValueOnce({ data: { ok: true, anexo_id: "a-9", bucket: "hr-documentos-quarantine", caminho: "justificacoes/a.pdf", upload_token: "t" }, error: null })
      .mockResolvedValueOnce(erroHttp("anexo_conteudo_recusado"));
    m.upload.mockResolvedValue({ data: {}, error: null });
    renderRh(<AnexosDaJustificacao alvo={DIA} alvoAnexar={DIA} />);
    const campo = (await screen.findByLabelText("Anexar ficheiros")) as HTMLInputElement;
    expect(campo.accept).toBe("application/pdf,image/jpeg,image/png");
    fireEvent.change(campo, { target: { files: [pdf("a.pdf")] } });
    expect(await screen.findByRole("button", { name: "Tentar outra vez a.pdf" })).toBeInTheDocument();
    expect(screen.getByText(/O conteúdo do ficheiro não foi aceite/)).toHaveAttribute("role", "alert");
  });

  it("se só a confirmação falhou, «Tentar outra vez» repete só a confirmação (sem nova reserva nem novo upload) e o foco volta ao campo", async () => {
    const reserva = { data: { ok: true, anexo_id: "a-9", bucket: "hr-documentos-quarantine", caminho: "justificacoes/a.pdf", upload_token: "t" }, error: null };
    m.invoke.mockResolvedValueOnce(reserva).mockResolvedValueOnce(erroHttp("anexo_nao_carregado")).mockResolvedValueOnce({ data: { ok: true }, error: null });
    m.upload.mockResolvedValue({ data: {}, error: null });
    renderRh(<AnexosDaJustificacao alvo={DIA} alvoAnexar={DIA} />);
    fireEvent.change(await screen.findByLabelText("Anexar ficheiros"), { target: { files: [pdf("a.pdf")] } });
    fireEvent.click(await screen.findByRole("button", { name: "Tentar outra vez a.pdf" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Tentar outra vez a.pdf" })).not.toBeInTheDocument());
    expect(m.invoke.mock.calls.map((c) => c[1].body.accao)).toEqual(["url", "confirmar", "confirmar"]);
    expect(m.invoke.mock.calls[2][1].body.anexo_id).toBe("a-9");
    expect(m.upload).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByLabelText("Anexar ficheiros")).toHaveFocus());
  });

  it("se o upload falhou, «Tentar outra vez» remove a reserva antiga e só depois reserva de novo; se remover falha, mostra o erro e não reserva", async () => {
    const reserva = (id: string) => ({ data: { ok: true, anexo_id: id, bucket: "hr-documentos-quarantine", caminho: `justificacoes/${id}.pdf`, upload_token: "t" }, error: null });
    m.upload.mockResolvedValueOnce({ data: null, error: new Error("rede") });
    m.invoke.mockResolvedValueOnce(reserva("a-1")).mockResolvedValueOnce(erroHttp("sem_permissao"));
    renderRh(<AnexosDaJustificacao alvo={DIA} alvoAnexar={DIA} />);
    fireEvent.change(await screen.findByLabelText("Anexar ficheiros"), { target: { files: [pdf("a.pdf")] } });
    fireEvent.click(await screen.findByRole("button", { name: "Tentar outra vez a.pdf" }));
    expect(await screen.findByText("Não tem permissão para fazer isto.")).toBeInTheDocument();
    expect(m.invoke.mock.calls.map((c) => c[1].body.accao)).toEqual(["url", "remover"]);
    expect(m.invoke.mock.calls[1][1].body.anexo_id).toBe("a-1");
    // Ainda há «Tentar outra vez» (a reserva continua por limpar) e agora o remover corre bem.
    m.upload.mockResolvedValue({ data: {}, error: null });
    m.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null }).mockResolvedValueOnce(reserva("a-2")).mockResolvedValueOnce({ data: { ok: true }, error: null });
    fireEvent.click(await screen.findByRole("button", { name: "Tentar outra vez a.pdf" }));
    await waitFor(() => expect(m.invoke.mock.calls.map((c) => c[1].body.accao)).toEqual(["url", "remover", "remover", "url", "confirmar"]));
    expect(m.invoke.mock.calls[4][1].body.anexo_id).toBe("a-2");
  });

  it("um formato recusado no browser não chama a Edge", async () => {
    renderRh(<AnexosDaJustificacao alvo={DIA} alvoAnexar={DIA} />);
    const campo = await screen.findByLabelText("Anexar ficheiros");
    fireEvent.change(campo, { target: { files: [new File(["x"], "a.heic", { type: "image/heic" })] } });
    expect(await screen.findByText("O ficheiro tem de ser PDF, JPEG ou PNG.")).toBeInTheDocument();
    expect(m.invoke).not.toHaveBeenCalled();
  });
});
