/**
 * `VisualizadorAnexoSensivel`: o cartao de cidadao e o comprovativo de IBAN
 * vistos NUMA JANELA POR CIMA DA FICHA (nao noutra pagina nem noutro separador),
 * com marca de agua, sem descarregar nem imprimir, a fechar sozinhos aos 2
 * minutos e a revogar o ficheiro ao fechar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", async () => {
  const { translations } = await import("@/translations/index");
  const pt = (translations as unknown as Record<string, Record<string, string>>).pt;
  return {
    useTranslation: () => ({
      language: "pt",
      t: (chave: string, params?: Record<string, string | number>) => {
        let texto = pt[chave] ?? chave;
        Object.entries(params ?? {}).forEach(([k, v]) => {
          texto = texto.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        });
        return texto;
      },
    }),
  };
});

vi.mock("@/hooks/useNomeParaMarcaDagua", () => ({
  useNomeParaMarcaDagua: () => "Ana Silva",
}));

import { DURACAO_VISUALIZACAO_MS } from "@/hooks/useVisualizacaoAnexo";
import { VisualizadorAnexoSensivel } from "../VisualizadorAnexoSensivel";

const obterUrl = vi.fn();
const aoFechar = vi.fn();
const criarUrl = vi.fn();
const revogarUrl = vi.fn();
const fetchFalso = vi.fn();

function resposta(tipo: string) {
  return { ok: true, status: 200, blob: async () => new Blob(["x"], { type: tipo }) };
}

function montar(anexoId: string | null = "c1") {
  return render(
    <VisualizadorAnexoSensivel
      anexoId={anexoId}
      nomeFicheiro="cartao.pdf"
      rotuloTipo="Cartão de cidadão"
      obterUrl={obterUrl}
      aoFechar={aoFechar}
    />,
  );
}

describe("VisualizadorAnexoSensivel", () => {
  const original = { criar: URL.createObjectURL, revogar: URL.revokeObjectURL, open: window.open };

  beforeEach(() => {
    obterUrl.mockReset().mockResolvedValue({ url: "https://x/a?t=1", expiraEmSegundos: 60, mime_type: "application/pdf", tipo: "cartao_cidadao" });
    aoFechar.mockReset();
    criarUrl.mockReset().mockReturnValue("blob:doc-1");
    revogarUrl.mockReset();
    fetchFalso.mockReset().mockResolvedValue(resposta("application/pdf"));
    URL.createObjectURL = criarUrl as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revogarUrl as unknown as typeof URL.revokeObjectURL;
    window.open = vi.fn() as unknown as typeof window.open;
    vi.stubGlobal("fetch", fetchFalso);
  });

  afterEach(() => {
    URL.createObjectURL = original.criar;
    URL.revokeObjectURL = original.revogar;
    window.open = original.open;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sem anexo escolhido nao desenha janela nem pede nada", () => {
    montar(null);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(obterUrl).not.toHaveBeenCalled();
  });

  it("abre numa janela (dialogo) por cima da ficha, sem abrir outro separador", async () => {
    montar();
    const janela = await screen.findByRole("dialog");
    expect(janela).toHaveTextContent("Cartão de cidadão");
    expect(janela).toHaveTextContent("cartao.pdf");
    expect(obterUrl).toHaveBeenCalledWith("c1");
    expect(window.open).not.toHaveBeenCalled();
  });

  it("um PDF aparece numa iframe com sandbox e sem barra de ferramentas nem painel", async () => {
    montar();
    const quadro = (await screen.findByTitle("Cartão de cidadão: cartao.pdf")) as HTMLIFrameElement;
    await waitFor(() => expect(quadro.getAttribute("src")).toBe("blob:doc-1#toolbar=0&navpanes=0"));
    expect(quadro.hasAttribute("sandbox")).toBe(true);
    // O URL assinado nunca chega ao DOM.
    expect(document.body.innerHTML).not.toContain("https://x/a");
  });

  it("uma imagem aparece num <img> (sem iframe)", async () => {
    obterUrl.mockResolvedValue({ url: "https://x/a?t=1", expiraEmSegundos: 60, mime_type: "image/png", tipo: "cartao_cidadao" });
    fetchFalso.mockResolvedValue(resposta("image/png"));
    montar();
    const imagem = (await screen.findByRole("img", { name: "Cartão de cidadão: cartao.pdf" })) as HTMLImageElement;
    expect(imagem.getAttribute("src")).toBe("blob:doc-1");
    expect(imagem.getAttribute("draggable")).toBe("false");
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("tem marca de agua com o nome de quem ve e a hora", async () => {
    montar();
    await screen.findByTitle("Cartão de cidadão: cartao.pdf");
    const marca = screen.getByTestId("marca-dagua");
    expect(marca).toHaveTextContent(/Ana Silva - \d/);
    // Por cima do ficheiro e sem apanhar cliques.
    expect(marca.className).toMatch(/pointer-events-none/);
    expect(marca.className).toMatch(/absolute/);
  });

  it("nao oferece descarregar, imprimir nem abrir fora: so fechar", async () => {
    montar();
    await screen.findByTitle("Cartão de cidadão: cartao.pdf");
    const janela = screen.getByRole("dialog");
    expect(janela.querySelector("a[href]")).toBeNull();
    expect(janela.querySelector("a[download]")).toBeNull();
    const botoes = Array.from(janela.querySelectorAll("button")).map((b) => (b.textContent || b.getAttribute("aria-label") || "").trim());
    expect(botoes.join("|")).not.toMatch(/descarreg|download|imprim|print|abrir/i);
    expect(screen.getAllByRole("button", { name: /fechar/i }).length).toBeGreaterThan(0);
  });

  it("diz que a visualizacao fica registada e que fecha ao fim de 2 minutos", async () => {
    montar();
    expect(await screen.findByText(/fica registada/)).toHaveTextContent(/2 minutos/);
  });

  it("o botao Fechar fecha a janela", async () => {
    montar();
    await screen.findByTitle("Cartão de cidadão: cartao.pdf");
    fireEvent.click(screen.getAllByRole("button", { name: /^fechar$/i })[0]);
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("fecha sozinha ao fim de 2 minutos (relogio simulado)", async () => {
    vi.useFakeTimers();
    montar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DURACAO_VISUALIZACAO_MS - 1);
    });
    expect(aoFechar).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("ao fechar revoga o URL de objecto e deixa de ter o ficheiro", async () => {
    const { rerender } = montar();
    await screen.findByTitle("Cartão de cidadão: cartao.pdf");
    rerender(
      <VisualizadorAnexoSensivel
        anexoId={null}
        nomeFicheiro="cartao.pdf"
        rotuloTipo="Cartão de cidadão"
        obterUrl={obterUrl}
        aoFechar={aoFechar}
      />,
    );
    expect(revogarUrl).toHaveBeenCalledWith("blob:doc-1");
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ao desmontar revoga o URL de objecto", async () => {
    const { unmount } = montar();
    await screen.findByTitle("Cartão de cidadão: cartao.pdf");
    unmount();
    expect(revogarUrl).toHaveBeenCalledWith("blob:doc-1");
  });

  it("se o ficheiro nao carrega, diz-o em alerta e nao mostra o ficheiro", async () => {
    obterUrl.mockRejectedValue(new Error("falhou"));
    montar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível abrir o ficheiro. Tente de novo.");
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("enquanto carrega mostra um estado de carga", async () => {
    obterUrl.mockReturnValue(new Promise(() => undefined));
    montar();
    expect(await screen.findByRole("status")).toHaveTextContent("A carregar o ficheiro...");
  });

  it("o menu de contexto do ficheiro esta desligado (sem 'guardar como')", async () => {
    obterUrl.mockResolvedValue({ url: "https://x/a?t=1", expiraEmSegundos: 60, mime_type: "image/png", tipo: "cartao_cidadao" });
    fetchFalso.mockResolvedValue(resposta("image/png"));
    montar();
    const imagem = await screen.findByRole("img", { name: "Cartão de cidadão: cartao.pdf" });
    const evento = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    imagem.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
  });
});
