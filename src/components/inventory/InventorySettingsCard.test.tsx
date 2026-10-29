// 29/10: modos de baixa de stock — 'manual' deixa de aparecer como "Contrato assinado"; 'proposal_accepted' (antigo) só se mostra,
// desativado, quando é o valor atual da organização (migration 20270101250000_negocio_baixa_automatica_na_emissao).
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let settingsRow: { stock_deduction_trigger: string; default_warehouse_id: string | null } | null = null;

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order"]) q[k] = () => q;
    q.maybeSingle = () => Promise.resolve({ data: settingsRow, error: null });
    q.then = (ok: (r: unknown) => unknown) =>
      Promise.resolve({ data: table === "warehouses" ? [{ id: "w1", name: "Lisboa" }] : [], error: null }).then(ok);
    return q;
  };
  return { supabase: { from: (t: string) => chain(t), rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) } };
});
vi.mock("@/components/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  InventorySettingsCard,
  TRIGGER_LABEL,
  normalizeStockDeductionTrigger,
  stockDeductionTriggerOptions,
} from "./InventorySettingsCard";

describe("normalizeStockDeductionTrigger", () => {
  it("mantém os três valores da BD tal como estão", () => {
    expect(normalizeStockDeductionTrigger("contract_signed")).toBe("contract_signed");
    expect(normalizeStockDeductionTrigger("manual")).toBe("manual");
    expect(normalizeStockDeductionTrigger("proposal_accepted")).toBe("proposal_accepted");
  });

  it("sem linha ou valor desconhecido = contract_signed (o padrão da BD)", () => {
    expect(normalizeStockDeductionTrigger(null)).toBe("contract_signed");
    expect(normalizeStockDeductionTrigger(undefined)).toBe("contract_signed");
    expect(normalizeStockDeductionTrigger("lixo")).toBe("contract_signed");
  });
});

describe("stockDeductionTriggerOptions", () => {
  it("só automático e manual se escolhem", () => {
    expect(stockDeductionTriggerOptions("contract_signed")).toEqual([
      { value: "contract_signed", disabled: false },
      { value: "manual", disabled: false },
    ]);
    expect(stockDeductionTriggerOptions("manual").map((o) => o.value)).toEqual(["contract_signed", "manual"]);
  });

  it("a antiga «Proposta aceite» só aparece, desativada, quando é a atual", () => {
    expect(stockDeductionTriggerOptions("proposal_accepted")).toEqual([
      { value: "contract_signed", disabled: false },
      { value: "manual", disabled: false },
      { value: "proposal_accepted", disabled: true },
    ]);
  });

  it("rótulos novos", () => {
    expect(TRIGGER_LABEL.contract_signed).toBe("Automático — quando a encomenda de cliente é emitida");
    expect(TRIGGER_LABEL.manual).toBe("Manual — só pela Saída para clientes");
    expect(TRIGGER_LABEL.proposal_accepted).toBe("Proposta aceite (antigo)");
  });
});

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <InventorySettingsCard organizationId="org-1" />
    </QueryClientProvider>,
  );
}

describe("InventorySettingsCard", () => {
  it("'manual' na BD aparece como Manual (antes aparecia «Contrato assinado»)", async () => {
    settingsRow = { stock_deduction_trigger: "manual", default_warehouse_id: null };
    renderCard();
    const manual = await screen.findByRole("radio", { name: TRIGGER_LABEL.manual });
    await waitFor(() => expect(manual).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByRole("radio", { name: TRIGGER_LABEL.contract_signed })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("radio", { name: TRIGGER_LABEL.proposal_accepted })).toBeNull();
  });

  it("'proposal_accepted' na BD aparece selecionado mas desativado", async () => {
    settingsRow = { stock_deduction_trigger: "proposal_accepted", default_warehouse_id: null };
    renderCard();
    const antigo = await screen.findByRole("radio", { name: TRIGGER_LABEL.proposal_accepted });
    await waitFor(() => expect(antigo).toHaveAttribute("aria-checked", "true"));
    expect(antigo).toBeDisabled();
    expect(screen.getByRole("radio", { name: TRIGGER_LABEL.manual })).not.toBeDisabled();
  });

  it("sem linha: Automático", async () => {
    settingsRow = null;
    renderCard();
    const auto = await screen.findByRole("radio", { name: TRIGGER_LABEL.contract_signed });
    await waitFor(() => expect(auto).toHaveAttribute("aria-checked", "true"));
  });
});
