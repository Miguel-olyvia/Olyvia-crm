import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ServicoDaChamada } from "./ServicoDaChamada";
import { seed, type Negocio } from "./motor";
import type { Ctx } from "./pecas";

// 4/11 (Rúben): «o tipo de serviço tem de ser mais completo»: os serviços do Catálogo, além da linha
describe("ServicoDaChamada: os serviços do Catálogo", () => {
  const desenhar = (f: Record<string, string> = {}) => {
    const S = seed();
    const d = { ...S.deals.find((x) => x.fase === 1)!, f } as Negocio;
    const servicosDoPedido = vi.fn();
    const ctx = { S, A: { servicosDoPedido, servicoDaChamada: vi.fn() }, run: (fn: () => void) => fn() } as unknown as Ctx;
    render(<ServicoDaChamada ctx={ctx} d={d} />);
    return servicosDoPedido;
  };

  it("procura pelo nome, sem acentos, e junta o escolhido", () => {
    const juntar = desenhar();
    fireEvent.change(screen.getByLabelText("Procurar serviços no Catálogo"), { target: { value: "eletr" } });
    fireEvent.click(screen.getByRole("button", { name: "Pontos elétricos" }));
    expect(juntar).toHaveBeenCalledWith(expect.any(Number), ["eletr"]);
  });

  it("os escolhidos ficam à vista e tiram-se com o ×", () => {
    const mudar = desenhar({ servicos_pedidos: "canal,eletr" });
    expect(screen.getByText("Canalização")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tirar Canalização" }));
    expect(mudar).toHaveBeenCalledWith(expect.any(Number), ["eletr"]);
  });

  it("sem nada com esse nome, diz-o", () => {
    desenhar();
    fireEvent.change(screen.getByLabelText("Procurar serviços no Catálogo"), { target: { value: "zzz" } });
    expect(screen.getByText("Nenhum serviço do Catálogo com «zzz».")).toBeInTheDocument();
  });
});
