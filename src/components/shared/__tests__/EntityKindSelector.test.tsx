import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntityKindSelector } from "@/components/shared/EntityKindSelector";
import type { EntityKind } from "@/lib/entityKind";

function Harness({ initial = "person" as EntityKind, onChange = vi.fn() }) {
  const [kind, setKind] = useState<EntityKind>(initial);
  return <EntityKindSelector value={kind} onChange={(k) => { setKind(k); onChange(k); }} />;
}

describe("EntityKindSelector", () => {
  it("e um grupo de radios com nome acessivel e duas opcoes", () => {
    render(<Harness />);
    const group = screen.getByRole("radiogroup", { name: /tipo de ficha/i });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /pessoa/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /empresa/i })).not.toBeChecked();
  });

  it("vem pre-seleccionado pelo tipo actual", () => {
    render(<Harness initial="organization" />);
    expect(screen.getByRole("radio", { name: /empresa/i })).toBeChecked();
  });

  it("clicar muda a escolha", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /empresa/i }));
    expect(onChange).toHaveBeenCalledWith("organization");
  });

  it("teclado: sao radios nativos do mesmo grupo (Tab entra, setas mudam, espaco escolhe) e mostram o foco", () => {
    render(<Harness />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    expect(radios[0].name).not.toBe("");
    for (const r of radios) {
      expect(r.tagName).toBe("INPUT");
      expect(r.type).toBe("radio");
      expect(r.className).toMatch(/peer/);
    }
    const label = radios[0].closest("label");
    expect(label?.className).toMatch(/peer-focus-visible|has-\[:focus-visible\]/);
  });

  it("alvos de 44 px, tema escuro e texto (nao so cor)", () => {
    render(<Harness />);
    const labels = screen.getAllByText(/pessoa|empresa/i).map((el) => el.closest("label"));
    for (const label of labels) {
      expect(label?.className).toMatch(/min-h-\[44px\]/);
      expect(label?.className).toMatch(/dark:/);
    }
  });
});
