import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}|${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(",")}` : key,
  }),
}));

import { ConfirmedByClientBadge } from "../ConfirmedByClientBadge";

describe("ConfirmedByClientBadge", () => {
  it("sem confirmed_at nao mostra nada", () => {
    const { container, rerender } = render(<ConfirmedByClientBadge confirmedAt={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ConfirmedByClientBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("com confirmed_at mostra o texto com a hora formatada HH:mm", () => {
    const at = new Date(2026, 9, 1, 14, 5).toISOString();
    render(<ConfirmedByClientBadge confirmedAt={at} />);
    expect(screen.getByText("scheduling.confirmedByClient|time=14:05")).toBeInTheDocument();
  });

  it("aria-label e title levem a data completa", () => {
    const at = new Date(2026, 9, 1, 14, 5).toISOString();
    render(<ConfirmedByClientBadge confirmedAt={at} />);
    const el = screen.getByText("scheduling.confirmedByClient|time=14:05").closest("[aria-label]");
    expect(el).not.toBeNull();
    expect(el?.getAttribute("aria-label")).toContain("01/10/2026 14:05");
    expect(el?.getAttribute("title")).toContain("01/10/2026 14:05");
  });

  it("data invalida nao mostra nada", () => {
    const { container } = render(<ConfirmedByClientBadge confirmedAt="nao-e-data" />);
    expect(container).toBeEmptyDOMElement();
  });
});
