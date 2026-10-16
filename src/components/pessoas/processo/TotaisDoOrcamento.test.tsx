import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { TotaisOrcamento } from "./orcamentoCalculo";
import { TotaisDoOrcamento } from "./TotaisDoOrcamento";

vi.mock("@/hooks/useTranslation", async () => (await import("@/test/traducoesPessoasTeste")).moduloDeTraducao());

const totais = (total: number, margem: number): TotaisOrcamento => ({ semDesconto: total, semIva: total, iva: 0, total, custo: 0, margem });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const passar = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe("TotaisDoOrcamento: o anúncio dos totais", () => {
  it("há uma só região de estado, só para leitores de ecrã, com 'Total X, margem Y'", () => {
    render(<TotaisDoOrcamento totais={totais(318, 0.4)} />);
    const regioes = screen.getAllByRole("status");
    expect(regioes).toHaveLength(1);
    expect(regioes[0]).toHaveTextContent("Total 318,00 €, margem 40 %");
    expect(regioes[0].className).toContain("sr-only");
  });

  it("os valores visíveis não são uma região live (não anunciam a cada tecla)", () => {
    render(<TotaisDoOrcamento totais={totais(318, 0.4)} />);
    const grupo = screen.getByRole("group", { name: "Totais do orçamento" });
    expect(grupo.querySelector("dl")?.closest("[aria-live]")).toBeNull();
    expect(grupo.querySelector("dl")?.closest('[role="status"]')).toBeNull();
  });

  it("depois de uma alteração só anuncia ao fim de cerca de 1 s", () => {
    const { rerender } = render(<TotaisDoOrcamento totais={totais(318, 0.4)} />);
    rerender(<TotaisDoOrcamento totais={totais(636, 0.4)} />);
    expect(screen.getByRole("status")).toHaveTextContent("Total 318,00 €, margem 40 %");
    passar(999);
    expect(screen.getByRole("status")).toHaveTextContent("Total 318,00 €, margem 40 %");
    passar(1);
    expect(screen.getByRole("status")).toHaveTextContent("Total 636,00 €, margem 40 %");
  });

  it("várias alterações seguidas (uma por tecla) anunciam só a última, 1 s depois dessa", () => {
    const { rerender } = render(<TotaisDoOrcamento totais={totais(100, 0.4)} />);
    const vistos: string[] = [];
    const ver = () => { const t = screen.getByRole("status").textContent ?? ""; if (vistos[vistos.length - 1] !== t) vistos.push(t); };
    rerender(<TotaisDoOrcamento totais={totais(200, 0.35)} />);
    passar(600); ver();
    rerender(<TotaisDoOrcamento totais={totais(300, 0.3)} />);
    passar(600); ver();
    rerender(<TotaisDoOrcamento totais={totais(400, 0.25)} />);
    passar(999); ver();
    expect(vistos).toEqual(["Total 100,00 €, margem 40 %"]);
    passar(1); ver();
    expect(vistos).toEqual(["Total 100,00 €, margem 40 %", "Total 400,00 €, margem 25 %"]);
  });

  it("desmontar com um anúncio por sair não deixa temporizadores nem estado a atualizar", () => {
    const { rerender, unmount } = render(<TotaisDoOrcamento totais={totais(100, 0.4)} />);
    rerender(<TotaisDoOrcamento totais={totais(200, 0.4)} />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
