// 3/11 (Rúben): os problemas do cliente no ecrã: a conversa com fotografias (o cliente junta-as; a equipa vê-as), e o gestor de obra que, a
// partir da mensagem, cria as tarefas com os técnicos e decide se gera orçamento; a resposta segue na conversa.
import { useReducer, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado, type MensagemObra, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { Conversa } from "./ConversaObra";
import { AcaoMensagemCliente, ProblemasDoCliente, type ConversaDaObra } from "./ProblemasObra";
import { bytesDeB64, fotoDeDataUrl, mensagemDaLinha } from "./real/conversaReal";

// o cliente da base precisa do URL do Supabase, que o ambiente de teste não tem; aqui nada vai à base
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

afterEach(cleanup);

function Montar({ S, A, children }: { S: Estado; A: ReturnType<typeof acoes>; children: (c: Ctx) => ReactNode }) {
  const [, refazer] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void) => { fn(); refazer(); };
  const ctx = { S, A, run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  return <>{children(ctx)}</>;
}
const obra = () => {
  const S = seed(), A = acoes(S, vi.fn(), (fn) => fn()), d = S.deals.find((x) => x.id === 1022) as Negocio;
  return { S, A, d, p: d.obra.plano! };
};
const IMG = "data:image/png;base64,iVBORw0KGgo=";
const msg: MensagemObra = { id: "m-1", de: "cliente", quem: "Ana Costa", t: "Está a sair água da junta do duche", q: "hoje 10:00", fotos: ["f-1"] };

describe("a conversa com fotografias", () => {
  it("as mensagens da base trazem o id e as fotografias; um data URL passa a {mime, b64}", () => {
    expect(mensagemDaLinha({ id: "m-1", de: "cliente", quem: "Ana", t: "Olhe", em: "2026-11-03T10:00:00Z", lida: false, fotos: ["f-1", "f-2"] })).toMatchObject({ id: "m-1", fotos: ["f-1", "f-2"] });
    expect(mensagemDaLinha({ id: "m-2", de: "cliente", quem: "Ana", t: "Olá", em: "2026-11-03T10:00:00Z", lida: false, fotos: [] })).not.toHaveProperty("fotos");
    expect(fotoDeDataUrl("data:image/jpeg;base64,/9j/4AAQ")).toEqual({ mime: "image/jpeg", b64: "/9j/4AAQ" });
    expect(fotoDeDataUrl("data:text/plain;base64,aGVsbG8=")).toBeNull();
    expect(bytesDeB64("aGVsbG8=")).toBe(5);
  });

  it("a equipa vê as fotografias da mensagem (lidas pelo id) e amplia-as", async () => {
    const fotoDe = vi.fn(async () => IMG);
    render(<Conversa msgs={[msg]} eu="empresa" enviar={() => true} vazio="" fotoDe={fotoDe} />);
    const botao = await screen.findByRole("button", { name: "Ampliar: Fotografia 1 de Ana Costa" });
    expect(fotoDe).toHaveBeenCalledWith("f-1");
    fireEvent.click(botao);
    expect(screen.getByRole("dialog", { name: "Fotografia 1 de Ana Costa" })).toBeTruthy();
  });

  it("o cliente junta fotografias e envia (a mensagem pode ir só com elas); o campo limpa-se se seguiu", async () => {
    const enviar = vi.fn(async () => true);
    render(<Conversa msgs={[]} eu="cliente" enviar={enviar} vazio="Sem mensagens" anexar />);
    const f = new File(["x"], "duche.jpg", { type: "image/jpeg" }), outro = new File(["y"], "nota.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Escolher fotografias"), { target: { files: [f, outro] } });
    expect(within(screen.getByRole("list", { name: "Fotografias a enviar" })).getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(enviar).toHaveBeenCalledWith("", [f]));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Fotografias a enviar" })).toBeNull());
  });
});

describe("o gestor de obra trata o problema", () => {
  const conversa = (msgs: MensagemObra[]): ConversaDaObra & { responder: ReturnType<typeof vi.fn> } =>
    ({ msgs, fotoDe: async () => IMG, responder: vi.fn(async () => true) });

  it("a mensagem com fotografias aparece por tratar; cria a tarefa com o técnico, sem orçamento; a resposta segue e fica marcada", async () => {
    const { S, A, d, p } = obra();
    A.role("operacoes");
    const c = conversa([msg]);
    render(<Montar S={S} A={A}>{(x) => <ProblemasDoCliente ctx={x} d={d} conversa={c} abrir={null} setAbrir={() => {}} />}</Montar>);
    const cartao = screen.getByRole("article", { name: `Problema por tratar: ${msg.t}` });
    expect(within(cartao).getByText("por tratar")).toBeTruthy();
    fireEvent.click(within(cartao).getByRole("button", { name: "Criar tarefas" }));
    // a 1.ª tarefa vem do que o cliente escreveu; falta o técnico e a escolha do orçamento
    expect((screen.getByLabelText("O trabalho") as HTMLInputElement).value).toBe("Está a sair água da junta do duche");
    const juntar = () => screen.getByRole("button", { name: "Juntar ao plano" }) as HTMLButtonElement;
    expect(screen.getByText("Escolha se gera orçamento.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Sem orçamento/ }));
    expect(juntar().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Técnico"), { target: { value: "ma" } });
    fireEvent.click(screen.getByRole("button", { name: "Erro nosso" }));
    fireEvent.click(juntar());
    expect(d.obra.problemas![0]).toMatchObject({ estado: "resolvido", motivo: "Erro nosso", tarefas: [{ tec: "ma" }] });
    expect(p.tasks.some((t) => t.problema === "PC-1022-1" && t.tec === "ma")).toBe(true);
    await waitFor(() => expect(c.responder).toHaveBeenCalledWith(expect.stringMatching(/sem custo para si \(erro nosso\)/)));
    await waitFor(() => expect(d.obra.problemas![0].respondida).toBeTruthy());
  });

  it("com orçamento: o preço sugerido por tarefa, os totais, e a proposta vai ao cliente (adenda)", async () => {
    const { S, A, d } = obra();
    A.role("operacoes");
    const c = conversa([msg]);
    render(<Montar S={S} A={A}>{(x) => <ProblemasDoCliente ctx={x} d={d} conversa={c} abrir={null} setAbrir={() => {}} />}</Montar>);
    fireEvent.click(screen.getByRole("button", { name: "Criar tarefas" }));
    fireEvent.change(screen.getByLabelText("Técnico"), { target: { value: "hn" } });
    fireEvent.click(screen.getByRole("button", { name: /^Com orçamento/ }));
    expect(Number((screen.getByLabelText("Preço sem IVA (€)") as HTMLInputElement).value)).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Preço sem IVA (€)"), { target: { value: "150" } });
    expect(screen.getByText("+150,00 €")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enviar a proposta ao cliente" }));
    const pr = d.obra.problemas![0];
    expect(pr).toMatchObject({ estado: "proposta", cobrar: true });
    expect(d.adendas!.find((a) => a.n === pr.adenda)).toMatchObject({ motivo: "Problema reportado pelo cliente" });
    await waitFor(() => expect(c.responder).toHaveBeenCalledWith(expect.stringContaining(`a adenda ${pr.adenda}`)));
    // o cartão passa a «à espera do cliente», com a adenda
    expect(await screen.findByText("à espera do cliente")).toBeTruthy();
  });

  it("uma mensagem só com texto: «Tratar como problema» (só o gestor); a tratada mostra o estado", () => {
    const { S, A, d } = obra();
    const texto: MensagemObra = { id: "m-2", de: "cliente", quem: "Ana Costa", t: "A porta não fecha", q: "hoje 11:00" };
    const abrir = vi.fn();
    A.role("comercial");
    const { unmount } = render(<Montar S={S} A={A}>{(x) => <AcaoMensagemCliente ctx={x} d={d} m={texto} chave="m-2" abrir={abrir} />}</Montar>);
    expect(screen.queryByRole("button", { name: "Tratar como problema" })).toBeNull();
    unmount();
    A.role("operacoes");
    render(<Montar S={S} A={A}>{(x) => <AcaoMensagemCliente ctx={x} d={d} m={texto} chave="m-2" abrir={abrir} />}</Montar>);
    fireEvent.click(screen.getByRole("button", { name: "Tratar como problema" }));
    expect(abrir).toHaveBeenCalledWith("m-2");
    cleanup();
    A.descartarProblema(d.id, { msg: "m-2", texto: texto.t, fotos: [] });
    render(<Montar S={S} A={A}>{(x) => <AcaoMensagemCliente ctx={x} d={d} m={texto} chave="m-2" abrir={abrir} />}</Montar>);
    expect(screen.getByText("Problema PC-1022-1 · não é um problema")).toBeTruthy();
  });

  it("a mensagem aberta pelo gestor aparece na lista, para tratar", () => {
    const { S, A, d } = obra();
    A.role("operacoes");
    const texto: MensagemObra = { id: "m-2", de: "cliente", quem: "Ana Costa", t: "A porta não fecha", q: "hoje 11:00" };
    render(<Montar S={S} A={A}>{(x) => <ProblemasDoCliente ctx={x} d={d} conversa={conversa([texto])} abrir="m-2" setAbrir={() => {}} />}</Montar>);
    expect(screen.getByRole("article", { name: "Problema por tratar: A porta não fecha" })).toBeTruthy();
  });
});
