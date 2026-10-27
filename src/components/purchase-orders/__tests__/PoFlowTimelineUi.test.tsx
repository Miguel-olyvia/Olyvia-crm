import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
// PermissionGate: deixa passar só as permissões da lista "granted".
const granted = vi.hoisted(() => ({ list: new Set<string>() }));
vi.mock("@/components/PermissionGate", () => ({
  PermissionGate: ({ permission, permissions, requireAll, children }: { permission?: string; permissions?: string[]; requireAll?: boolean; children: React.ReactNode }) => {
    const list = permission ? [permission] : permissions ?? [];
    const ok = requireAll ? list.every((p) => granted.list.has(p)) : list.some((p) => granted.list.has(p));
    return ok ? <>{children}</> : null;
  },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { PoLockNotice } from "../PoLockNotice";
import { PoFlowTimeline, PoReceptionNext } from "../PoFlowTimeline";
import { poFlowSteps } from "../poSheetFlow";

describe("PoLockNotice", () => {
  it("publicada: motivo e 'Retirar do portal para editar' com purchase_orders.approve", () => {
    granted.list = new Set(["purchase_orders.approve"]);
    const onWithdraw = vi.fn();
    render(<PoLockNotice lock={{ kind: "portal", reason: "Publicada no portal do fornecedor", unlock: "withdraw" }} onWithdraw={onWithdraw} onRevert={vi.fn()} />);
    expect(screen.getByText("Publicada no portal do fornecedor.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retirar do portal para editar/ }));
    expect(onWithdraw).toHaveBeenCalledTimes(1);
  });

  it("recebida: 'Reverter receção' só com revert_receipt + inventory.edit", () => {
    granted.list = new Set(["purchase_orders.revert_receipt"]);
    const lock = { kind: "received" as const, reason: "Encomenda recebida", unlock: "revert" as const };
    const { rerender } = render(<PoLockNotice lock={lock} onWithdraw={vi.fn()} onRevert={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Reverter receção/ })).toBeNull();
    granted.list = new Set(["purchase_orders.revert_receipt", "inventory.edit"]);
    const onRevert = vi.fn();
    rerender(<PoLockNotice lock={lock} onWithdraw={vi.fn()} onRevert={onRevert} />);
    fireEvent.click(screen.getByRole("button", { name: /Reverter receção/ }));
    expect(onRevert).toHaveBeenCalledTimes(1);
  });
});

describe("PoReceptionNext", () => {
  it("recebível com permissão: ligação para a Receção", () => {
    const onGo = vi.fn();
    render(<PoReceptionNext status="ordered" canReceive onGo={onGo} />);
    fireEvent.click(screen.getByRole("button", { name: /Receção no armazém \(Armazém › Receção\) →/ }));
    expect(onGo).toHaveBeenCalled();
  });
  it("sem permissão: só texto; pendente avisa", () => {
    render(<PoReceptionNext status="pending" canReceive={false} onGo={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/pode receber-se mesmo pendente/)).toBeInTheDocument();
  });
  it("recebida: feita", () => {
    render(<PoReceptionNext status="received" canReceive onGo={vi.fn()} />);
    expect(screen.getByText("Receção no armazém: feita.")).toBeInTheDocument();
  });
});

describe("PoFlowTimeline", () => {
  it("confirmada com data por aceitar: botão só com can_accept_date", () => {
    const publication = { status: "confirmed", promised_date: "2026-10-29" };
    const steps = poFlowSteps({ status: "ordered", publication });
    const { rerender } = render(<PoFlowTimeline orderId="po" status="ordered" steps={steps} publication={publication} canAcceptDate={false} />);
    expect(screen.queryByRole("button", { name: "Aceitar data prometida" })).toBeNull();
    rerender(<PoFlowTimeline orderId="po" status="ordered" steps={steps} publication={publication} canAcceptDate />);
    expect(screen.getByRole("button", { name: "Aceitar data prometida" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Linha temporal" }).querySelectorAll("li")).toHaveLength(6);
  });
  it("cancelada: aviso em vez das etapas", () => {
    render(<PoFlowTimeline orderId="po" status="cancelled" steps={[]} />);
    expect(screen.getByText("Encomenda cancelada.")).toBeInTheDocument();
  });
});
