// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SensitiveExportDialog } from "../SensitiveExportDialog";

describe("SensitiveExportDialog", () => {
  it("offers explicit minimized and sensitive export choices", () => {
    const onConfirm = vi.fn();

    render(
      <SensitiveExportDialog
        open
        onOpenChange={vi.fn()}
        sensitiveFields={["email", "telefone", "NIF"]}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("heading", { name: /exportar dados pessoais/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /sem dados sensíveis/i }));
    expect(onConfirm).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: /incluir e exportar/i }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });
});
