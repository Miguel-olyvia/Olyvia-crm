// 22/10: o popup do acesso ao portal ao aprovar e enviar uma PO (poAcesso.ts): o pedido chega ao protótipo com a PO; portal ativo → publicada,
// a conta de sempre (sem password nova) e o login abre essa PO; sem acesso → a PO segue por email e dá-se o acesso como "Enviar acesso".
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcessoPortalDialog } from "../AcessoPortalDialog";
import { contaFornecedor, contaFornecedorPo, mudarPassword, ouvirAcessoForn, prefillDaPo, type PedidoAcessoForn } from "../acessosPortal";
import type { Estado } from "../motor";
import { fornecedor } from "./base";
import { esquecerInventario, executar, lerInventario } from "./loja";
import { esquecerPerfil } from "./perfil";
import { criarPoManual, enviarPo } from "./po";
import { acessoDaPoEnviada } from "./poAcesso";

const novoS = (): Estado => ({ acessos: {}, deals: [] }) as unknown as Estado;
function po(sup: string, sku: string, enviar = true): string {
  const r = executar((db) => { const p = criarPoManual(db, { sup, wh: "LIS", linhas: [{ sku, packs: 1 }] }); if (enviar) enviarPo(db, p); return p.id; });
  expect(r.erro).toBe("");
  return r.valor;
}
let pedidos: PedidoAcessoForn[] = [], tirar: () => void = () => {};

beforeEach(() => { localStorage.clear(); esquecerInventario(); esquecerPerfil(); pedidos = []; tirar = ouvirAcessoForn((p) => { pedidos.push(p); }); });
afterEach(() => { tirar(); cleanup(); localStorage.clear(); });

describe("PO enviada ao fornecedor → popup do acesso ao portal", () => {
  it("portal ativo: pede o popup com a PO publicada; a conta existente mantém a password e o login abre essa PO", () => {
    const S = novoS(), s = fornecedor(lerInventario(), "alfa")!;
    const { conta } = contaFornecedor(S, s, false);
    mudarPassword(S, conta.email, "segredo123");
    const id = po("alfa", "PV-450");
    const avisar = vi.fn();
    acessoDaPoEnviada(id, avisar);
    expect(avisar).not.toHaveBeenCalled();
    expect(pedidos).toEqual([{ sid: "alfa", reenviar: false, po: { id, publicada: true, acessoNovo: false } }]);
    const e = contaFornecedorPo(S, s, pedidos[0].po!);
    expect(e.comPassword).toBe(false);
    expect(e.conta.password).toBe("segredo123");
    expect(prefillDaPo({ ...e, n: 1 })).toEqual({ email: conta.email, po: id });
  });

  it("portal ativo sem conta no protótipo: cria-a com password temporária", () => {
    const S = novoS(), s = fornecedor(lerInventario(), "alfa")!;
    acessoDaPoEnviada(po("alfa", "PV-450"), vi.fn());
    const e = contaFornecedorPo(S, s, pedidos[0].po!);
    expect(e.comPassword).toBe(true);
    expect(e.conta.password).toHaveLength(16);
  });

  it("sem acesso: a PO segue por email, o fornecedor é convidado (como \"Enviar acesso\") e o login não abre PO nenhuma", () => {
    expect(fornecedor(lerInventario(), "gama")!.portal).toBe("none");
    const id = po("gama", "CD-80");
    expect(lerInventario().pos.find((p) => p.id === id)!.portal.state).toBe("email");
    acessoDaPoEnviada(id, vi.fn());
    const s = fornecedor(lerInventario(), "gama")!;
    expect(s.portal).toBe("invited");
    expect(s.emails!.map((x) => x.t)).toContain("Convite para o portal do fornecedor");
    expect(pedidos).toEqual([{ sid: "gama", reenviar: false, po: { id, publicada: false, acessoNovo: true } }]);
    const e = contaFornecedorPo(novoS(), s, pedidos[0].po!);
    expect(prefillDaPo({ ...e, n: 1 })).toEqual({ email: e.conta.email, po: null });
  });

  it("o convite recusado (sem email) avisa e não abre popup; PO por aprovar não pede nada", () => {
    executar((db) => { fornecedor(db, "gama")!.email = ""; });
    const avisar = vi.fn();
    acessoDaPoEnviada(po("gama", "CD-80"), avisar);
    expect(avisar).toHaveBeenCalledWith(expect.stringMatching(/seguiu por email\. O acesso ao portal não foi enviado: /), true);
    acessoDaPoEnviada(po("alfa", "PV-450", false), avisar);
    expect(pedidos).toEqual([]);
  });

  it("o popup em modo encomenda: assunto da PO, credenciais de teste e \"Entrar neste separador\"; por email, o aviso", () => {
    const S = novoS(), s = fornecedor(lerInventario(), "alfa")!;
    const entrarAqui = vi.fn();
    const e = { ...contaFornecedorPo(S, s, { id: "PO-2026-0999", publicada: true, acessoNovo: false }), n: 1 };
    render(<AcessoPortalDialog e={e} fechar={() => {}} entrarAqui={entrarAqui} />);
    const email = screen.getByRole("article", { name: "Email enviado" });
    expect(within(email).getByText(/Nova encomenda PO-2026-0999 disponível — /)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Credenciais de teste" })).toHaveTextContent(e.conta.password);
    fireEvent.click(screen.getByRole("button", { name: "Entrar neste separador" }));
    expect(entrarAqui).toHaveBeenCalledTimes(1);
    cleanup();
    render(<AcessoPortalDialog e={{ ...e, po: { id: "PO-2026-0999", publicada: false, acessoNovo: true }, n: 2 }} fechar={() => {}} />);
    expect(screen.getByText("A encomenda PO-2026-0999 seguiu por email; foi também enviado o acesso ao portal (protótipo).")).toBeInTheDocument();
  });
});
