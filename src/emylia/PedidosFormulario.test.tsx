// 23/10/2026: os pedidos dos formulários entram na app (PedidosFormulario.tsx; base: 0016).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({ pedidos: [] as unknown[], chamadas: [] as { f: string; a: Record<string, unknown> }[] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (f: string, a: Record<string, unknown>) => {
      base.chamadas.push({ f, a });
      if (f === "app_pedidos_formulario") return { data: base.pedidos, error: null };
      if (f === "app_ligar_pedido") { base.pedidos = []; return { data: true, error: null }; }
      return { data: null, error: null };
    }),
  },
}));

import { PedidosFormulario } from "./PedidosFormulario";
import { definirModoReal } from "./acessosPortal";
import { acoes, seed } from "./motor";

const ORG = "2880f92b-edbd-4c46-8c4e-a58eead1ddc8";
beforeEach(() => {
  base.chamadas = [];
  base.pedidos = [{ negocio: "n-1", numero: 1051, titulo: "Remodelação de WC", criado_em: "2026-10-23T18:00:00Z", origem: "Site", nome: "Rita Sousa",
    telefone: "912 345 678", email: "rita@exemplo.pt", linha: "wc", morada: "Rua A, 1", formulario: "Pedido de orçamento WC" }];
});
afterEach(() => { cleanup(); definirModoReal(null); });

describe("os pedidos dos formulários", () => {
  it("sem conta real (o protótipo), não aparece", () => {
    const S = seed();
    render(<PedidosFormulario A={acoes(S, () => {}, (fn) => fn())} run={(fn) => fn()} />);
    expect(screen.queryByRole("region", { name: "Pedidos dos formulários" })).toBeNull();
  });
  it("lista o pedido e «Trazer para a Olyvia» cria a lead e liga-a ao negócio do formulário", async () => {
    definirModoReal(ORG, "Olyvia Demo");
    const S = seed(), n0 = S.deals.length, seq = S.seq;
    render(<PedidosFormulario A={acoes(S, () => {}, (fn) => fn())} run={(fn) => fn()} />);
    const bloco = await screen.findByRole("region", { name: "Pedidos dos formulários" });
    expect(bloco).toHaveTextContent("1 pedido novo dos formulários");
    expect(bloco).toHaveTextContent("Rita Sousa");
    expect(bloco).toHaveTextContent("Pedido de orçamento WC");
    fireEvent.click(screen.getByRole("button", { name: /Trazer para a Olyvia/ }));
    await waitFor(() => expect(base.chamadas.some((c) => c.f === "app_ligar_pedido")).toBe(true));
    // a lead nasceu na app, com o contacto, a morada e a origem do formulário
    expect(S.deals.length).toBe(n0 + 1);
    const d = S.deals.find((x) => x.id === seq)!;
    expect([d.nome, d.tel, d.local, d.fase, d.f.email, d.f.origem]).toEqual(["Rita Sousa", "912 345 678", "Rua A, 1", 0, "rita@exemplo.pt", "Formulário"]);
    // e ligou-se ao negócio do formulário, pelo id da lead
    expect(base.chamadas.find((c) => c.f === "app_ligar_pedido")!.a).toEqual({ p_org: ORG, p_negocio: "n-1", p_v1: seq });
    // a lista volta a ler-se e o pedido sai
    await waitFor(() => expect(screen.queryByRole("region", { name: "Pedidos dos formulários" })).toBeNull());
  });
});
