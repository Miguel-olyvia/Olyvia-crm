/**
 * O criterio negativo de "utilizador interno": qualquer papel que nao seja
 * `client` conta. Nao ha whitelist de papeis internos -- ver o comentario em
 * `papelInterno.ts` sobre porque isso bloquearia papeis futuros.
 */
import { describe, it, expect } from "vitest";
import { eInterno } from "@/lib/auth/papelInterno";

describe("eInterno", () => {
  it("so client -> externo (portal puro)", () => {
    expect(eInterno(["client"])).toBe(false);
  });

  it("client + outro papel -> interno (o hibrido tem trabalho no CRM)", () => {
    expect(eInterno(["client", "admin"])).toBe(true);
  });

  it("varios papeis, nenhum client -> interno", () => {
    expect(eInterno(["admin", "hr_manager"])).toBe(true);
    expect(eInterno(["um_papel_qualquer_criado_amanha"])).toBe(true);
  });

  it("lista vazia -> externo", () => {
    // O caso "zero papeis" de useClientRole.fetchAccessKind e tratado LA como
    // crm_user (onboarding), antes deste predicado ser chamado -- nao dentro
    // dele. Quem usa este predicado para listar candidatos a ligacao (que
    // partem sempre de contas com pelo menos uma membership, logo pelo menos
    // um papel) nunca ve este caso ocorrer na pratica.
    expect(eInterno([])).toBe(false);
  });
});
