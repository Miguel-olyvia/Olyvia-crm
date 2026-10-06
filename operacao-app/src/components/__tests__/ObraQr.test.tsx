import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../lib/supabase", () => ({ supabase: {} }));

import { CartaoQr, QrSvg } from "../ObraQr";
import { urlChegada } from "../../lib/chegadas";

describe("QR da obra", () => {
  it("o link abre a obra em modo chegada", () => {
    expect(urlChegada("OB-2026-00004", "https://www.olyvia-ai.com")).toMatch(
      /^https:\/\/www\.olyvia-ai\.com(\/operacao)?\/obras\/OB-2026-00004\?chegada=1$/
    );
  });

  it("desenha o QR em SVG (com módulos escuros e margem)", () => {
    const { container } = render(<QrSvg texto="https://www.olyvia-ai.com/operacao/obras/OB-1?chegada=1" />);
    const svg = container.querySelector("svg")!;
    const [, , w] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    expect(w).toBeGreaterThanOrEqual(21 + 8);
    expect(container.querySelector("path")!.getAttribute("d")!.length).toBeGreaterThan(100);
  });

  it("a folha da porta tem o código, o título e a morada", () => {
    render(<CartaoQr obra={{ codigo: "OB-1", titulo: "WC Cascais", morada: "Rua das Flores, 7" }} url="https://x/obras/OB-1?chegada=1" />);
    expect(screen.getByText("OB-1")).toBeTruthy();
    expect(screen.getByText("WC Cascais")).toBeTruthy();
    expect(screen.getByText("Rua das Flores, 7")).toBeTruthy();
    expect(screen.getByRole("img", { name: "QR da obra OB-1" })).toBeTruthy();
  });
});
