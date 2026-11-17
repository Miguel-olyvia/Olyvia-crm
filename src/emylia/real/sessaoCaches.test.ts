// 22/01 (M6): as caches da pesquisa do Estúdio e das fotos limpam-se no sign-out e quando muda o utilizador (os produtos e as recusas de um utilizador não passam a outro).
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ cb: null as null | ((e: string, s: { user: { id: string } } | null) => void) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { onAuthStateChange: (f: typeof auth.cb) => { auth.cb = f; return { data: { subscription: { unsubscribe: () => undefined } } }; } } } }));
const pesquisa = vi.fn();
vi.mock("./produtosPaginados", async (orig) => ({ ...(await orig<typeof import("./produtosPaginados")>()), lerPesquisaProdutos: (...a: unknown[]) => pesquisa(...a) }));
vi.mock("./produtosLeves", () => ({ lerProdutoFicha: vi.fn() }));

import { candidatosDoEstudio } from "./produtosDoEstudio";

const ORG = "11111111-1111-4111-a111-111111111111";
const L = [{ id: "a", n: "a", q: 1, un: "un", tipo: "produto" as const, chave: "sanita" }];
beforeEach(() => { pesquisa.mockReset(); pesquisa.mockResolvedValue({ ok: true, v: { total: 0, pagina: 1, limite: 50, paginas: 1, produtos: [] } }); });

describe("caches e sessão", () => {
  it("o sign-out limpa a cache; sem sign-out, a mesma pesquisa não se repete", async () => {
    await candidatosDoEstudio(ORG, L); await candidatosDoEstudio(ORG, L);
    expect(pesquisa).toHaveBeenCalledTimes(1);
    auth.cb!("SIGNED_OUT", null);
    await candidatosDoEstudio(ORG, L);
    expect(pesquisa).toHaveBeenCalledTimes(2);
  });
  it("outro utilizador a entrar limpa a cache; o mesmo utilizador (tab refocus) não", async () => {
    auth.cb!("SIGNED_IN", { user: { id: "u1" } });
    await candidatosDoEstudio(ORG, L);
    const n = pesquisa.mock.calls.length;
    auth.cb!("SIGNED_IN", { user: { id: "u1" } });
    await candidatosDoEstudio(ORG, L);
    expect(pesquisa.mock.calls.length).toBe(n);
    auth.cb!("SIGNED_IN", { user: { id: "u2" } });
    await candidatosDoEstudio(ORG, L);
    expect(pesquisa.mock.calls.length).toBe(n + 1);
  });
});
