// O painel de visita e levantamento do ProcessoProvider: guardar numa só gravação no pedido certo (ou criar o pedido novo de um
// cliente) e criar o negócio a partir do pedido, que o substitui e lhe dá o serviço.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { pedidoBase, pessoaBase, resumoBase, visitaBase } from "../fabricaTestes";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import type { PedidoNegocio, ResumoPessoa } from "../pessoasTipos";
import {
  Gatilho, GatilhoNovoPedido, GUARDAR, PAINEL, comVisitas, feitaComLinhas, itemDe, itensDe, levantamento, renderizar, resumoCom, visita,
} from "./arnesProcesso";

const { erro } = vi.hoisted(() => ({ erro: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: erro, success: vi.fn() } }));

// O jsdom não tem estas funções, que o Select do Radix usa ao abrir a lista.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const textos: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt };
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});

const SEM_VISITA = "Marcar a visita como feita: ainda não é possível. Este pedido ainda não tem visita marcada.";

beforeEach(() => erro.mockClear());

describe("ProcessoProvider: guardar a visita e o levantamento do painel", () => {
  it("guarda no pedido certo, numa só gravação, as visitas e o levantamento do painel, e fecha o painel", async () => {
    const outra = pedidoBase("pd-2", { contactado: true, visitas: [visitaBase("pd-2-v1", { data: "2026-11-05" })], servico: "Janelas" });
    const r = resumoCom([comVisitas(), outra]);
    const { a } = renderizar(r, <Gatilho item={itensDe(r)[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    expect(a.guardarPedido).toHaveBeenCalledTimes(1);
    const [pedidoId, dados] = (a.guardarPedido as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(pedidoId).toBe("pd-2");
    expect(dados.visitas.map((v: { id: string }) => v.id)).toEqual(["pd-2-v1"]);
    expect(dados.levantamento).toMatchObject({ linhas: [] });
    expect(a.criarPedidoComVisitas).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("«Novo negócio com visita»: abre o painel vazio, e sem nenhuma visita mostra o motivo no próprio painel (role=alert), sem toast, sem guardar e sem fechar", async () => {
    const r = resumoCom([]);
    const { a, aoAnunciar } = renderizar(r, <GatilhoNovoPedido />);
    fireEvent.click(screen.getByRole("button", { name: "novo pedido" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    expect(within(painel).queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    expect(await within(painel).findByRole("alert")).toHaveTextContent(SEM_VISITA);
    expect(a.criarPedidoComVisitas).not.toHaveBeenCalled();
    expect(erro).not.toHaveBeenCalled();
    expect(aoAnunciar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBe(painel);
  });

  it("a mesma recusa duas vezes: o alerta remonta (texto igual, sem espaço inseparável), liga-se ao botão por aria-describedby e desaparece ao mexer no rascunho", async () => {
    const r = resumoCom([]);
    renderizar(r, <GatilhoNovoPedido />);
    fireEvent.click(screen.getByRole("button", { name: "novo pedido" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    const primeiro = await within(painel).findByRole("alert");
    expect(primeiro.textContent).toBe(SEM_VISITA);
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(within(painel).getByRole("alert")).not.toBe(primeiro));
    const segundo = within(painel).getByRole("alert");
    expect(segundo.textContent).toBe(SEM_VISITA);
    expect(within(painel).getByRole("button", { name: GUARDAR })).toHaveAttribute("aria-describedby", segundo.id);
    fireEvent.click(within(painel).getByRole("button", { name: "Adicionar visita" }));
    expect(within(painel).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("«Novo negócio com visita» com uma visita acrescentada cria o pedido (sem serviço, com o comercial da pessoa) já com a visita", async () => {
    const r = resumoCom([]);
    const { a } = renderizar(r, <GatilhoNovoPedido />);
    fireEvent.click(screen.getByRole("button", { name: "novo pedido" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    fireEvent.click(within(painel).getByRole("button", { name: "Adicionar visita" }));
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    expect(a.criarPedidoComVisitas).toHaveBeenCalledTimes(1);
    const [pedido, dados] = (a.criarPedidoComVisitas as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(pedido).toEqual({ pessoaId: "a", servico: "", comercial: "Ana Ribeiro" });
    expect(dados.visitas).toHaveLength(1);
    expect(a.guardarPedido).not.toHaveBeenCalled();
  });
});

/** A mesma pessoa, já marcada como perdida (com os mesmos pedidos): o que acontece a quem tinha o painel aberto, ou um botão velho. */
const comoPerdida = (pedidos: PedidoNegocio[]): ResumoPessoa =>
  resumoBase(pessoaBase("a", { perdida: { motivo: "preco", data: "2026-10-01" } }), [], HOJE_EXEMPLO, "lead", pedidos);

describe("ProcessoProvider: pessoa perdida ou pedido que desapareceu (nada falha em silêncio nem anuncia um sucesso que não houve)", () => {
  it("um botão de um passo de uma pessoa perdida não abre nada: explica, na região live e junto ao botão, que está perdida", () => {
    const { item } = itemDe(comVisitas());
    const { aoAnunciar } = renderizar(comoPerdida([comVisitas()]), <Gatilho item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    expect(aoAnunciar).toHaveBeenCalledTimes(1);
    expect((aoAnunciar.mock.calls[0] as string[])[0].replace(/\u00a0/g, "")).toBe(
      "Marcar a visita como feita: ainda não é possível. Esta pessoa está marcada como perdida: reative-a primeiro.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("guardar o painel de uma pessoa que entretanto ficou perdida: o motivo diz-se no painel, nada se guarda, nada se anuncia e o painel fica aberto", async () => {
    const r = resumoCom([comVisitas()]);
    const { a, aoAnunciar, mudarResumo } = renderizar(r, <Gatilho item={itensDe(r)[0]} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    mudarResumo(comoPerdida([comVisitas()]));
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    expect(await within(painel).findByRole("alert")).toHaveTextContent("Esta pessoa está marcada como perdida: reative-a primeiro.");
    expect(a.guardarPedido).not.toHaveBeenCalled();
    expect(aoAnunciar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBe(painel);
  });

  it("guardar o painel de um pedido que entretanto desapareceu: o motivo diz-se no painel e nada se guarda nem se anuncia", async () => {
    const r = resumoCom([comVisitas()]);
    const { a, aoAnunciar, mudarResumo } = renderizar(r, <Gatilho item={itensDe(r)[0]} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    mudarResumo(resumoCom([]));
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    expect(await within(painel).findByRole("alert")).toHaveTextContent("Este pedido já não existe: não há nada a guardar.");
    expect(a.guardarPedido).not.toHaveBeenCalled();
    expect(aoAnunciar).not.toHaveBeenCalled();
  });

  it("o caminho feliz continua igual: guardar um pedido de uma pessoa ativa grava e anuncia", async () => {
    const r = resumoCom([comVisitas()]);
    const { a } = renderizar(r, <Gatilho item={itensDe(r)[0]} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    expect(a.guardarPedido).toHaveBeenCalledTimes(1);
  });
});

describe("ProcessoProvider: o comercial escolhido no painel não se perde", () => {
  const mudarComercial = async (painel: HTMLElement, para: string) => {
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: /^Geral/ }));
    fireEvent.keyDown(within(painel).getByRole("combobox", { name: /^Comercial/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: para }));
  };

  it("guardar o pedido leva o comercial do painel (mudado) para o pedido", async () => {
    const r = resumoCom([comVisitas()]);
    const { a } = renderizar(r, <Gatilho item={itensDe(r)[0]} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    await mudarComercial(painel, "Diogo Lopes");
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    const [, dados] = (a.guardarPedido as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(dados.comercial).toBe("Diogo Lopes");
  });

  it("«Novo negócio com visita»: o pedido novo nasce com o comercial do painel, e não o da pessoa", async () => {
    const r = resumoCom([]);
    const { a } = renderizar(r, <GatilhoNovoPedido />);
    fireEvent.click(screen.getByRole("button", { name: "novo pedido" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    await mudarComercial(painel, "Diogo Lopes");
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: /^Visita/ }));
    fireEvent.click(within(painel).getByRole("button", { name: "Adicionar visita" }));
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    const [pedido] = (a.criarPedidoComVisitas as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(pedido).toEqual({ pessoaId: "a", servico: "", comercial: "Diogo Lopes" });
  });
});

describe("ProcessoProvider: criar o negócio a partir do pedido", () => {
  it("cria o negócio com o serviço do pedido, tira o pedido e devolve o id para o aviso", async () => {
    const { r, item } = itemDe(feitaComLinhas());
    const { a, aoCriarNegocio } = renderizar(r, <Gatilho item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio de a" });
    fireEvent.click(within(painel).getByRole("button", { name: "Criar negócio" }));
    expect(aoCriarNegocio).toHaveBeenCalledTimes(1);
    expect((aoCriarNegocio.mock.calls[0] as unknown[])[0]).toMatchObject({ servico: "Cozinha", pessoa: { id: "a" } });
    expect(a.removerPedido).toHaveBeenCalledExactlyOnceWith("pd-1");
  });

  it("um pedido sem serviço dá um negócio sem serviço (nada é inventado)", async () => {
    const { r, item } = itemDe(comVisitas([visita({ estado: "feita" })], { levantamento: levantamento(), servico: "" }));
    const { aoCriarNegocio } = renderizar(r, <Gatilho item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio de a" });
    fireEvent.click(within(painel).getByRole("button", { name: "Criar negócio" }));
    expect((aoCriarNegocio.mock.calls[0] as unknown[])[0]).not.toHaveProperty("servico");
  });
});
