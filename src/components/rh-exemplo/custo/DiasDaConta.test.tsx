/**
 * DiasDaConta: a contagem de «Ver os dias (n)» e o limiar de recolher contam as datas VALIDAS mostradas, nao as entradas da lista.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (chave: string, params?: Record<string, string | number>) => (params ? `${chave} ${JSON.stringify(params)}` : chave),
    language: "pt",
  }),
}));

import { DiasDaConta } from "@/components/rh-exemplo/custo/DiasDaConta";

const datas = (n: number) => Array.from({ length: n }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);

describe("DiasDaConta", () => {
  it("com muitas datas validas fica recolhida e o contador e o das datas validas, nao o das entradas", () => {
    render(<DiasDaConta dias={[...datas(7), "", "invalida"]} />);
    expect(screen.getByText(/rhContas\.verDias/).textContent).toBe('rhContas.verDias {"n":"7"}');
  });

  it("entradas sem data valida nao fazem recolher uma lista curta: 2 datas validas em 8 entradas aparecem logo", () => {
    render(<DiasDaConta dias={[...datas(2), "", "", "", "", "", ""]} />);
    expect(screen.queryByText(/rhContas\.verDias/)).toBeNull();
    expect(screen.getByText(/rhContas\.dias/).textContent).toBe('rhContas.dias {"dias":"1, 2"}');
  });

  it("sem nenhuma data valida nao mostra nada", () => {
    const { container } = render(<DiasDaConta dias={["", "x"]} />);
    expect(container.firstChild).toBeNull();
  });
});
