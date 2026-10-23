// ConfirmarCancelarVisita: a confirmação de «Cancelar visita». Assíncrona: fecha só quando a base respondeu bem, aguenta duplo clique e não
// deixa fechar a meio (Escape, «Voltar», clique fora); um erro fica dentro do diálogo, traduzido, e repetir é possível.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ConfirmarCancelarVisita } from "./ConfirmarCancelarVisita";
import { idLinhaVisita } from "./focoVisita";

vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos = pessoasPaginaTranslations.pt;
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});
const { sucesso } = vi.hoisted(() => ({ sucesso: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: sucesso } }));

beforeAll(prepararRadixNoJsdom);
beforeEach(() => sucesso.mockReset());

const PEDIDO = { visitaId: "v1", nome: "Ana", quando: "terça-feira, 20/10/2026 · 10:00" };
const confirmar = () => screen.getByRole("button", { name: "Cancelar a visita" });
const voltar = () => screen.getByRole("button", { name: "Voltar" });

function montar(aoCancelar: (id: string) => void | Promise<void>, pedido: typeof PEDIDO | null = PEDIDO) {
  const aoFechar = vi.fn();
  const r = render(<ConfirmarCancelarVisita pedido={pedido} aoCancelar={aoCancelar} aoFechar={aoFechar} />);
  return { aoFechar, ...r };
}

/** Uma promessa que o teste resolve ou rejeita quando quiser. */
function adiada() {
  let resolver!: () => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<void>((ok, nok) => { resolver = ok; rejeitar = nok; });
  return { promessa, resolver, rejeitar };
}

describe("ConfirmarCancelarVisita", () => {
  it("sem pedido não desenha nada", () => {
    montar(vi.fn(), null);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("pergunta se quer cancelar, diz a pessoa e o dia e hora, e que o recurso fica livre", () => {
    montar(vi.fn());
    const dialogo = screen.getByRole("alertdialog", { name: "Cancelar esta visita?" });
    expect(dialogo).toHaveTextContent("A visita de Ana em terça-feira, 20/10/2026 · 10:00 deixa de estar marcada");
    expect(dialogo).toHaveTextContent("o recurso fica livre");
  });

  it("«Voltar» fecha sem cancelar", () => {
    const aoCancelar = vi.fn();
    const { aoFechar } = montar(aoCancelar);
    fireEvent.click(voltar());
    expect(aoCancelar).not.toHaveBeenCalled();
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("confirmar cancela a visita certa e só fecha (e avisa) quando a base respondeu", async () => {
    const { promessa, resolver } = adiada();
    const aoCancelar = vi.fn(() => promessa);
    const { aoFechar } = montar(aoCancelar);
    fireEvent.click(confirmar());
    expect(aoCancelar).toHaveBeenCalledExactlyOnceWith("v1");
    expect(aoFechar).not.toHaveBeenCalled();
    expect(sucesso).not.toHaveBeenCalled();
    resolver();
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(sucesso).toHaveBeenCalledExactlyOnceWith("Visita de Ana cancelada");
  });

  it("enquanto grava: o botão fica aria-busy e aria-disabled, duplo clique não cancela duas vezes", async () => {
    const { promessa, resolver } = adiada();
    const aoCancelar = vi.fn(() => promessa);
    const { aoFechar } = montar(aoCancelar);
    fireEvent.click(confirmar());
    const botao = screen.getByRole("button", { name: "A guardar…" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).toHaveAttribute("aria-busy", "true");
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(aoCancelar).toHaveBeenCalledTimes(1);
    resolver();
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
  });

  it("enquanto grava não se fecha: nem Escape, nem «Voltar»", async () => {
    const { promessa, resolver } = adiada();
    const { aoFechar } = montar(vi.fn(() => promessa));
    fireEvent.click(confirmar());
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    fireEvent.click(voltar());
    expect(voltar()).toHaveAttribute("aria-disabled", "true");
    expect(aoFechar).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    resolver();
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
  });

  it("um erro fica dentro do diálogo, traduzido, e o diálogo continua aberto; repetir cancela outra vez", async () => {
    const aoCancelar = vi.fn()
      .mockRejectedValueOnce({ chave: "pessoasPagina.real.visit.err.cancelar.ng018" })
      .mockResolvedValueOnce(undefined);
    const { aoFechar } = montar(aoCancelar);
    fireEvent.click(confirmar());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Esta visita já foi feita, tem resultado ou é de um negócio fechado: não se cancela.");
    expect(aoFechar).not.toHaveBeenCalled();
    expect(sucesso).not.toHaveBeenCalled();
    fireEvent.click(confirmar());
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(aoCancelar).toHaveBeenCalledTimes(2);
  });

  it("um erro sem chave usa a mensagem genérica, nunca o texto cru", async () => {
    montar(vi.fn().mockRejectedValueOnce(new Error("duplicate key value violates")));
    fireEvent.click(confirmar());
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).not.toMatch(/duplicate key/);
    expect(alerta.textContent?.length).toBeGreaterThan(5);
  });

  it("depois de cancelar, o foco vai para a linha da visita (o botão que abriu o diálogo já não existe)", async () => {
    const linha = document.createElement("li");
    linha.id = idLinhaVisita("v1");
    linha.tabIndex = -1;
    document.body.appendChild(linha);
    const { rerender, aoFechar } = montar(vi.fn().mockResolvedValue(undefined));
    fireEvent.click(confirmar());
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    rerender(<ConfirmarCancelarVisita pedido={null} aoCancelar={vi.fn()} aoFechar={aoFechar} />);
    await waitFor(() => expect(document.activeElement).toBe(linha));
    linha.remove();
  });
});
