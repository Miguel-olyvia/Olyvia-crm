/**
 * Wiring test for channel A: `use-toast.ts` is the single choke point used by
 * 167 files, so sanitizing there covers all of them without touching a single
 * call site. This only tests the wiring — the sanitization rules themselves
 * are the responsibility of `sanitizeDbErrorForDisplay.test.ts`.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react", () => ({
  captureMessage: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("@/utils/sanitizeDbErrorForDisplay");
});

describe("use-toast.ts — wires in the shared sanitizer", () => {
  it("replaces a raw database error in the displayed description", async () => {
    const { useToast } = await import("@/hooks/use-toast");
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({
        title: "Erro",
        description: 'null value in column "entity_id" violates not-null constraint',
        variant: "destructive",
      });
    });

    expect(result.current.toasts[0].description).toBe(
      "An unexpected error occurred. Please try again."
    );
    expect(result.current.toasts[0].description).not.toContain("entity_id");
  });

  it("leaves a legitimate validation/permission message untouched", async () => {
    const { useToast } = await import("@/hooks/use-toast");
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({
        title: "Sem permissão",
        description: "Não tem permissão para editar este contacto.",
        variant: "destructive",
      });
    });

    expect(result.current.toasts[0].description).toBe(
      "Não tem permissão para editar este contacto."
    );
  });

  it("shows the original text if the sanitizer itself throws", async () => {
    vi.doMock("@/utils/sanitizeDbErrorForDisplay", () => ({
      sanitizeDbErrorForDisplay: () => {
        throw new Error("boom");
      },
    }));

    const { useToast } = await import("@/hooks/use-toast");
    const { result } = renderHook(() => useToast());
    const raw = 'null value in column "entity_id" violates not-null constraint';

    expect(() => {
      act(() => {
        result.current.toast({ title: "Erro", description: raw, variant: "destructive" });
      });
    }).not.toThrow();

    expect(result.current.toasts[0].description).toBe(raw);
  });

  it("does not touch a non-string description (e.g. a React node)", async () => {
    const { useToast } = await import("@/hooks/use-toast");
    const { result } = renderHook(() => useToast());
    const node = { type: "span", props: { children: "custom" } } as unknown;

    act(() => {
      result.current.toast({ title: "x", description: node as never, variant: "destructive" });
    });

    expect(result.current.toasts[0].description).toBe(node);
  });
});
