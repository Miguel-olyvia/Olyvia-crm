// O login dos portais vindo do Inventário (22/10/2026): o portal do fornecedor já não abre direto, só pelo login. "Abrir como fornecedor →"
// abre o login com o email da conta já posto (password vazia); depois de entrar abre a encomenda da PO e "Sair" volta ao Inventário.
// Sem prefill, "Sair" volta ao login (como antes).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { esquecerInventario, executar, lerInventario } from "./inventario/loja";
import { esquecerPerfil } from "./inventario/perfil";
import { criarPoManual, enviarPo } from "./inventario/po";
import { contaFornecedor, mudarPassword } from "./acessosPortal";
import { LoginPortal } from "./LoginPortal";
import type { Estado } from "./motor";
import type { Ctx } from "./pecas";

const novoCtx = (): Ctx => {
  const S = { acessos: {}, deals: [] } as unknown as Estado;
  return { S, run: (fn: () => void) => fn() } as unknown as Ctx;
};
/** A conta do fornecedor "alfa" (ativo na seed), já com a password trocada. */
function contaAlfa(ctx: Ctx): string {
  const s = lerInventario().suppliers.find((x) => x.id === "alfa")!;
  const { conta } = contaFornecedor(ctx.S, s, false);
  mudarPassword(ctx.S, conta.email, "segredo123");
  return conta.email;
}
function novaPo(): string {
  const r = executar((db) => { const p = criarPoManual(db, { sup: "alfa", wh: "LIS", linhas: [{ sku: "PV-450", packs: 2 }] }); enviarPo(db, p); return p.id; });
  expect(r.erro).toBe("");
  return r.valor;
}
const entrar = (pw: string): void => {
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: pw } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
};

// a caixa "Lembrar-me" (Radix) mede-se com o ResizeObserver, que o jsdom não tem
beforeAll(() => { globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }; });
beforeEach(() => { localStorage.clear(); esquecerInventario(); esquecerPerfil(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe("Login dos portais · vindo do Inventário", () => {
  it("o email vem preenchido e a password vazia; ao entrar abre a encomenda da PO e \"Sair\" volta ao Inventário", async () => {
    const ctx = novoCtx(), email = contaAlfa(ctx), id = novaPo();
    expect(lerInventario().pos.find((p) => p.id === id)!.portal.state).toBe("sent");
    const voltar = vi.fn();
    render(<LoginPortal ctx={ctx} voltar={voltar} pre={{ email, po: id, n: 1 }} />);
    expect(screen.getByLabelText("Email")).toHaveValue(email);
    expect(screen.getByLabelText("Password")).toHaveValue("");
    entrar("errada");
    expect(screen.getByRole("alert")).toHaveTextContent("Email ou password incorretos.");
    entrar("segredo123");
    expect(await screen.findByRole("heading", { name: `Encomenda ${id}` })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Sair" })[0]);
    expect(voltar).toHaveBeenCalledTimes(1);
  });

  it("sem prefill (o \"Login dos portais\" do menu): \"Sair\" do portal volta ao login, não sai dele", async () => {
    const ctx = novoCtx(), email = contaAlfa(ctx);
    const voltar = vi.fn();
    render(<LoginPortal ctx={ctx} voltar={voltar} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
    entrar("segredo123");
    fireEvent.click((await screen.findAllByRole("button", { name: "Sair" }))[0]);
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(voltar).not.toHaveBeenCalled();
  });
});
