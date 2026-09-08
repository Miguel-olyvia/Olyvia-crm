import { describe, it, expect, afterEach, vi } from "vitest";
import { createSafeStorage } from "../safeStorage";

// Restaura o window.localStorage real entre testes.
const realDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
afterEach(() => {
  if (realDescriptor) Object.defineProperty(window, "localStorage", realDescriptor);
  vi.restoreAllMocks();
});

/** Substitui window.localStorage por um getter que lança SecurityError. */
function makeStorageThrow() {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      // Alguns browsers lançam logo aqui, no getter.
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
  });
}

describe("createSafeStorage", () => {
  it("usa o localStorage real quando está disponível", () => {
    const s = createSafeStorage();
    s.setItem("k", "v");
    expect(s.getItem("k")).toBe("v");
    expect(window.localStorage.getItem("k")).toBe("v"); // escreveu mesmo lá
    s.removeItem("k");
    expect(s.getItem("k")).toBeNull();
  });

  it("NÃO lança e cai para memória quando o localStorage está bloqueado", () => {
    makeStorageThrow();
    const s = createSafeStorage();

    // Nenhuma destas pode lançar (era o SecurityError que rebentava o form).
    expect(() => s.setItem("token", "abc")).not.toThrow();
    expect(() => s.getItem("token")).not.toThrow();
    expect(() => s.removeItem("token")).not.toThrow();

    // E funciona em memória: o que se escreve, lê-se.
    s.setItem("token", "abc");
    expect(s.getItem("token")).toBe("abc");
    s.removeItem("token");
    expect(s.getItem("token")).toBeNull();
  });

  it("devolve null para uma chave inexistente (sem lançar) com storage bloqueado", () => {
    makeStorageThrow();
    const s = createSafeStorage();
    expect(s.getItem("nao-existe")).toBeNull();
  });
});
