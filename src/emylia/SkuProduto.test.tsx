// 18/11: o SKU do produto bem visível: na lista numa linha própria («SKU» e o valor, que se seleciona com um clique), com «SKU por gerar» quando não há (ou é a referência
// provisória CAT-XXXXXXXXXX); na ficha com o botão «Copiar» (anuncia «SKU copiado»; se o browser recusar, seleciona o texto e di-lo).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkuFicha, SkuLinha } from "./SkuProduto";

const SKU = "MACB-AL-0005-18";
afterEach(() => { cleanup(); window.getSelection()?.removeAllRanges(); Reflect.deleteProperty(navigator, "clipboard"); });
const clipboard = (writeText: (t: string) => Promise<void>) => Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

describe("o que conta como «por gerar»", () => {
  it("vazio, só espaços ou a referência provisória CAT-XXXXXXXXXX (hexadecimal, 10 caracteres) está por gerar; uma referência verdadeira não", () => {
    for (const v of [null, undefined, "", "   ", "CAT-0123456789", " cat-abcdef0123 "]) {
      const { unmount } = render(<SkuLinha sku={v} />);
      expect(screen.getByText("SKU por gerar"), String(v)).toBeInTheDocument();
      unmount();
    }
    for (const v of [SKU, "CB-0001-1", "CAT-123", "CAT-XYZ1234567"]) {
      const { unmount } = render(<SkuLinha sku={v} />);
      expect(screen.getByText(v), v).toBeInTheDocument();
      expect(screen.queryByText("SKU por gerar"), v).toBeNull();
      unmount();
    }
  });
});

describe("SkuLinha (a lista)", () => {
  it("mostra a etiqueta «SKU» e o valor; um clique no valor seleciona-o (para copiar) sem chegar à linha por baixo", () => {
    const aoClicarNaLinha = vi.fn();
    render(<li onClick={aoClicarNaLinha}><SkuLinha sku={SKU} /></li>);
    expect(screen.getByText("SKU")).toBeInTheDocument();
    fireEvent.click(screen.getByText(SKU));
    expect(window.getSelection()?.toString()).toBe(SKU);
    expect(aoClicarNaLinha).not.toHaveBeenCalled();
  });
  it("um SKU comprido mostra-se inteiro e pode quebrar (não fica numa linha só que alargue a lista)", () => {
    const comprido = `MACB-${"AL0005".repeat(12)}-18`; // 80 caracteres
    expect(comprido).toHaveLength(80);
    render(<SkuLinha sku={comprido} />);
    const v = screen.getByText(comprido);
    expect(v.textContent).toHaveLength(80);
    expect(getComputedStyle(v).whiteSpace).not.toBe("nowrap");
    expect(v.className).not.toMatch(/whitespace-nowrap|truncate/);
    expect(v.className).toMatch(/\bbreak-all\b/); // o que deixa uma palavra sem espaços quebrar
    expect(v.parentElement!.className).toMatch(/\bflex-wrap\b/);
  });
  it("sem SKU ou com a provisória diz «SKU por gerar», em estilo suave, sem valor para selecionar", () => {
    for (const sku of [null, "", "CAT-0123456789"]) {
      const { container, unmount } = render(<SkuLinha sku={sku} />);
      expect(screen.getByText("SKU por gerar").className).toMatch(/text-muted-foreground/);
      expect(container.querySelector(".font-mono")).toBeNull();
      if (sku) expect(screen.queryByText(sku)).toBeNull();
      unmount();
    }
  });
});

describe("SkuFicha (a ficha)", () => {
  it("mostra o SKU em destaque e o botão «Copiar» (ícone + texto, aria-label «Copiar SKU», 44 px)", () => {
    render(<SkuFicha sku={SKU} />);
    expect(screen.getByText("SKU")).toBeInTheDocument();
    expect(screen.getByText(SKU)).toBeInTheDocument();
    const b = screen.getByRole("button", { name: "Copiar SKU" });
    expect(b).toHaveTextContent("Copiar");
    expect(b.className).toMatch(/\bmin-h-11\b/);
    expect(b.querySelector("svg")).not.toBeNull();
  });
  it("copiar escreve o SKU na área de transferência e anuncia «SKU copiado» numa região status", async () => {
    const escrever = vi.fn(async () => {});
    clipboard(escrever);
    render(<SkuFicha sku={SKU} />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar SKU" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("SKU copiado"));
    expect(escrever).toHaveBeenCalledExactlyOnceWith(SKU);
  });
  it("se o browser recusa a cópia, seleciona o SKU e di-lo (sem «SKU copiado»)", async () => {
    clipboard(async () => { throw new Error("negado"); });
    render(<SkuFicha sku={SKU} />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar SKU" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Não foi possível copiar/));
    expect(screen.getByRole("status")).not.toHaveTextContent("SKU copiado");
    expect(window.getSelection()?.toString()).toBe(SKU);
  });
  it("sem área de transferência no browser acontece o mesmo", async () => {
    render(<SkuFicha sku={SKU} />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar SKU" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Não foi possível copiar/));
  });
  it("sem SKU ou com a provisória diz «SKU por gerar» e não oferece copiar", () => {
    for (const sku of [null, "CAT-0123456789"]) {
      const { unmount } = render(<SkuFicha sku={sku} />);
      expect(screen.getByText("SKU por gerar")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Copiar SKU" })).toBeNull();
      unmount();
    }
  });
});
