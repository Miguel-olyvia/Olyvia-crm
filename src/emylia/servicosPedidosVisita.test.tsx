// 4/11 (Rúben): os serviços do Catálogo pedidos na chamada entram já escolhidos na visita (uma vez)
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServicosCatalogo } from "./ServicosCatalogo";
import { acoes, seed } from "./motor";
import type { Ctx } from "./pecas";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

function desenhar(f: Record<string, string>) {
  const S = seed();
  const d = S.deals.find((x) => x.fase === 2 && !x.visita.fechada)!;
  Object.assign(d.f, f);
  const run = (fn: () => void) => fn();
  const A = acoes(S, () => {}, run);
  const extra = vi.spyOn(A, "extra");
  render(<ServicosCatalogo {...({ S, A, run, go: (fn: () => void) => () => fn() } as unknown as Ctx)} d={d} simples />);
  return { d, extra };
}

describe("os serviços pedidos na chamada, na visita", () => {
  it("entram escolhidos com a quantidade sugerida, e diz-se de onde vieram", () => {
    const { d, extra } = desenhar({ servicos_pedidos: "eletr" });
    expect(screen.getByText(/Pedidos na chamada:/)).toHaveTextContent("Pontos elétricos");
    expect(extra).toHaveBeenCalledWith(d.id, "eletr", expect.any(Number));
    expect((d.visita.extra.eletr ?? 0) > 0 || !d.visita.off.includes("eletr")).toBe(true);
    expect(d.f.servicos_pedidos_levados).toBe("eletr");
  });

  it("só uma vez: um serviço já levado (e tirado na visita) não volta", () => {
    const { extra } = desenhar({ servicos_pedidos: "eletr", servicos_pedidos_levados: "eletr" });
    expect(extra).not.toHaveBeenCalled();
  });
});
