import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDesktop } from "./useDesktop";

const original = window.matchMedia;
afterEach(() => { window.matchMedia = original; });

const media = (matches: boolean): void => {
  window.matchMedia = vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
};

describe("useDesktop", () => {
  it("sem matchMedia (testes, browsers muito antigos) conta como ecrã pequeno", () => {
    (window as { matchMedia?: unknown }).matchMedia = undefined;
    expect(renderHook(() => useDesktop()).result.current).toBe(false);
  });
  it("com matchMedia diz se o ecrã tem 1024 px ou mais", () => {
    media(true);
    expect(renderHook(() => useDesktop()).result.current).toBe(true);
    media(false);
    expect(renderHook(() => useDesktop()).result.current).toBe(false);
  });
});
