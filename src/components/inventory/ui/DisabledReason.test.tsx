import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BlockedButton, DisabledReasonInfo } from "./DisabledReason";
import { RowActions } from "./RowActions";

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => false, hasAnyPermission: () => false, loading: false }),
}));

afterEach(cleanup);

describe("18/11: motivo do bloqueio legível por toque", () => {
  it("BlockedButton bloqueado: focável (aria-disabled), não corre a ação e mostra o motivo ao clique", () => {
    const onClick = vi.fn();
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <BlockedButton blockedReason="Sem permissão: requer X (x.y)" onClick={onClick}>
          Passar para stock
        </BlockedButton>
      </div>,
    );
    const b = screen.getByRole("button", { name: "Passar para stock" });
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).not.toBeDisabled();
    expect(b).toHaveAccessibleDescription("Sem permissão: requer X (x.y)");
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
    expect(onRow).not.toHaveBeenCalled();
    expect(screen.getByRole("note")).toHaveTextContent("Sem permissão: requer X (x.y)");
  });

  it("BlockedButton sem motivo é um botão normal", () => {
    const onClick = vi.fn();
    render(<BlockedButton blockedReason={null} onClick={onClick}>Receber</BlockedButton>);
    const b = screen.getByRole("button", { name: "Receber" });
    expect(b).not.toHaveAttribute("aria-disabled");
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("DisabledReasonInfo abre o motivo ao toque", () => {
    render(<DisabledReasonInfo label="Ativo" reason="Sem permissão: requer Editar armazéns" />);
    fireEvent.click(screen.getByRole("button", { name: "Porque está bloqueado: Ativo" }));
    expect(screen.getByRole("note")).toHaveTextContent("Sem permissão: requer Editar armazéns");
  });

  it("RowActions: principal sem permissão não corre e mostra o motivo ao clique", () => {
    const onClick = vi.fn();
    render(<RowActions primary={{ label: "Receber", onClick, permission: "purchase_orders.receive" }} />);
    const b = screen.getByRole("button", { name: /Receber/ });
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("note")).toHaveTextContent("purchase_orders.receive");
  });
});
