import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ProductPicker, PAGE_SIZE, type ProductOption } from "../ProductPicker";

// cmdk e o Popover usam APIs que o jsdom não tem.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function () {};

const produtos: ProductOption[] = Array.from({ length: 130 }, (_, i) => ({
  id: `p${i}`,
  name: `Produto ${String(i).padStart(3, "0")}${i % 2 === 0 ? " par" : ""}`,
  sku: `SKU${i}`,
  barcode: null,
}));

function abrir() {
  render(<ProductPicker products={produtos} value="" onChange={vi.fn()} loading={false} />);
  fireEvent.click(screen.getByRole("combobox"));
  return screen.getByRole("listbox");
}

function chegarAoFim(lista: HTMLElement) {
  Object.defineProperty(lista, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(lista, "clientHeight", { configurable: true, value: 288 });
  lista.scrollTop = 1000 - 288;
  act(() => { fireEvent.scroll(lista); });
}

describe("ProductPicker: scroll infinito", () => {
  it("mostra 50 e, ao chegar ao fim, mais 50 até acabar", () => {
    const lista = abrir();
    expect(screen.getAllByRole("option")).toHaveLength(PAGE_SIZE);
    expect(screen.getByText(/A mostrar 50 de 130 — escreva para filtrar · desça para ver mais/)).toBeTruthy();
    chegarAoFim(lista);
    expect(screen.getAllByRole("option")).toHaveLength(100);
    chegarAoFim(lista);
    expect(screen.getAllByRole("option")).toHaveLength(130);
    expect(screen.getByText("A mostrar 130 de 130 — escreva para filtrar")).toBeTruthy();
  });

  it("a pesquisa volta aos primeiros 50 e conta os resultados", () => {
    const lista = abrir();
    chegarAoFim(lista);
    expect(screen.getAllByRole("option")).toHaveLength(100);
    fireEvent.change(screen.getByPlaceholderText("Nome, SKU ou EAN…"), { target: { value: "par" } });
    expect(screen.getAllByRole("option")).toHaveLength(50);
    expect(screen.getByText(/A mostrar 50 de 65 resultados · desça para ver mais/)).toBeTruthy();
    chegarAoFim(screen.getByRole("listbox"));
    expect(screen.getAllByRole("option")).toHaveLength(65);
  });
});
