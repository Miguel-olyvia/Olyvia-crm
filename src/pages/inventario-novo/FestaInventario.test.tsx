// A festa (fatia 4): só receções/saídas NOVAS desde a leitura anterior; nunca na primeira; com o movimento reduzido, nada.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import type { MovimentoLivro } from "./anularInventario";

const movimento = vi.hoisted(() => ({ reduzir: false }));
vi.mock("@/emylia/movimento", async (orig) => ({
  ...(await orig<typeof import("@/emylia/movimento")>()),
  useReduzir: () => movimento.reduzir,
}));

import { FestaInventario, eFesta, novosDeFesta, useFestaDoLivro } from "./FestaInventario";

const mov = (x: Partial<MovimentoLivro> = {}): MovimentoLivro => ({
  id: "m-1", movement_type: "entrada", document_type: "compra", document_number: "PO-1", quantity: 1, product_id: "p", produto: "P",
  warehouse_id: "w", armazem: "W", reference_id: null, sale_source_type: null, sale_source_id: null, reversal_of_movement_id: null,
  created_at: "2026-11-24T10:00:00Z", rececao: { purchase_order_id: "po", purchase_order_item_id: null }, anulado: false, ...x,
});
const saida = (id: string) => mov({ id, movement_type: "saida", document_type: "venda", sale_source_type: "contract", sale_source_id: "c", rececao: null });
const ajuste = (id: string) => mov({ id, movement_type: "ajuste_positivo", document_type: "ajuste", rececao: null });

let vibracoes: unknown[];
beforeEach(() => {
  movimento.reduzir = false;
  vibracoes = [];
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: (p: unknown) => { vibracoes.push(p); return true; } });
});
afterEach(cleanup);

describe("a festa do novo Inventário", () => {
  it("eFesta: receção de PO e saída de EC; não ajustes nem estornos", () => {
    expect(eFesta(mov())).toBe(true);
    expect(eFesta(saida("s"))).toBe(true);
    expect(eFesta(ajuste("a"))).toBe(false);
    expect(eFesta(mov({ reversal_of_movement_id: "x" }))).toBe(false);
  });

  it("novosDeFesta: nada na primeira leitura; depois só o que não estava visto", () => {
    expect(novosDeFesta(null, [mov()])).toEqual([]);
    expect(novosDeFesta(new Set(["m-1"]), [mov(), saida("s-2"), ajuste("a-3")]).map((m) => m.id)).toEqual(["s-2"]);
  });

  it("dispara com uma receção nova (e vibra); não na primeira carga nem com um ajuste", () => {
    const { result, rerender } = renderHook(({ m }) => useFestaDoLivro(m, "org-1"), { initialProps: { m: undefined as MovimentoLivro[] | undefined } });
    rerender({ m: [mov({ id: "antes" })] });
    expect(result.current).toBeNull();
    rerender({ m: [ajuste("a"), mov({ id: "antes" })] });
    expect(result.current).toBeNull();
    rerender({ m: [mov({ id: "nova" }), ajuste("a"), mov({ id: "antes" })] });
    expect(result.current).not.toBeNull();
    expect(vibracoes).toEqual([[10, 30, 10]]);
    render(<FestaInventario festa={result.current} />);
    expect(screen.getByTestId("festa")).toHaveAttribute("aria-hidden", "true");
  });

  it("trocar de organização volta a ser a primeira leitura", () => {
    const { result, rerender } = renderHook(({ m, o }) => useFestaDoLivro(m, o), { initialProps: { m: [mov({ id: "a" })] as MovimentoLivro[] | undefined, o: "org-1" } });
    rerender({ m: undefined, o: "org-2" });
    rerender({ m: [mov({ id: "b" })], o: "org-2" });
    expect(result.current).toBeNull();
  });

  it("com prefers-reduced-motion não há festa nem vibração", () => {
    movimento.reduzir = true;
    const { result, rerender } = renderHook(({ m }) => useFestaDoLivro(m, "org-1"), { initialProps: { m: [] as MovimentoLivro[] } });
    rerender({ m: [mov({ id: "nova" })] });
    expect(result.current).toBeNull();
    expect(vibracoes).toEqual([]);
    render(<FestaInventario festa={123} />);
    expect(screen.queryByTestId("festa")).toBeNull();
  });
});
