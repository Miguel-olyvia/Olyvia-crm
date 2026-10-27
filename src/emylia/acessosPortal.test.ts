// As contas dos portais (22/10/2026): criar no primeiro envio, só o link nos seguintes, reenviar ao fornecedor, o login e o negócio que abre.
import { describe, expect, it } from "vitest";
import { acoes, demo, type Negocio } from "./motor";
import { contaCliente, contaFornecedor, emailCliente, entrar, mudarPassword, negocioDaConta } from "./acessosPortal";

const FORN = { id: "supX", name: "Fornecedor X", email: "Vendas@FornX.pt", company: "Mudelar" };

describe("contas dos portais", () => {
  it("cliente: a conta nasce no primeiro envio (8 caracteres) e os envios seguintes só levam o link", () => {
    const S = demo(), d = S.deals[0];
    const e1 = contaCliente(S, d, "proposta", "Proposta");
    expect(e1.comPassword).toBe(true);
    expect(e1.conta.password).toHaveLength(8);
    expect(e1.conta.email).toBe(emailCliente(d));
    const e2 = contaCliente(S, d, "contrato", "Contrato");
    expect(e2.comPassword).toBe(false);
    expect(e2.conta.password).toBe(e1.conta.password);
  });

  it("cliente sem email na ficha: um email de teste", () => {
    const S = demo(), d = S.deals[0] as Negocio;
    d.f.email = "";
    expect(emailCliente(d)).toBe(`cliente-${d.id}@teste.olyvia.pt`);
  });

  it("fornecedor: 16 caracteres; reenviar gera outra password e volta a pedir a troca", () => {
    const S = demo();
    const e1 = contaFornecedor(S, FORN, false);
    expect(e1.conta.email).toBe("vendas@fornx.pt");
    expect(e1.conta.password).toHaveLength(16);
    mudarPassword(S, "vendas@fornx.pt", "nova-pass-1");
    expect(contaFornecedor(S, FORN, false).comPassword).toBe(false);
    const e3 = contaFornecedor(S, FORN, true);
    expect(e3.comPassword).toBe(true);
    expect(e3.conta.password).not.toBe("nova-pass-1");
    expect(S.acessos!["vendas@fornx.pt"].mudouPassword).toBe(false);
    // outro email no convite: a conta antiga sai
    contaFornecedor(S, { ...FORN, email: "outro@fornx.pt" }, false);
    expect(Object.values(S.acessos!).filter((c) => c.ref === "supX").map((c) => c.email)).toEqual(["outro@fornx.pt"]);
  });

  it("login: email sem diferença de maiúsculas, password exata", () => {
    const S = demo();
    const { conta } = contaFornecedor(S, FORN, false);
    expect(entrar(S, "  VENDAS@fornx.pt ", conta.password)?.tipo).toBe("fornecedor");
    expect(entrar(S, "vendas@fornx.pt", conta.password + "x")).toBeNull();
    expect(entrar(S, "ninguem@x.pt", "x")).toBeNull();
  });

  it("enviar o contrato pelo motor cria a conta do cliente e o portal abre esse negócio", () => {
    const S = demo();
    const A = acoes(S, () => {}, (fn) => fn());
    // como revisaoContrato.test.tsx: uma proposta aceite, com os campos do contrato
    const d = S.deals.find((x) => x.orc && x.orc.linhas.some((l) => l.t === "svc") && !x.orc.aceite) as Negocio;
    Object.assign(d.orc!, { enviada: "hoje", aceite: "hoje", contrato: null, vendaDireta: false });
    Object.assign(d.f, { modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Rúben", multa: "Não" });
    expect(S.acessos?.[emailCliente(d)]).toBeUndefined();
    A.enviarContrato(d.id);
    expect(d.orc!.contrato).toBe("enviado");
    const c = S.acessos![emailCliente(d)];
    expect(c).toMatchObject({ tipo: "cliente", mudouPassword: false, deals: [d.id] });
    expect(negocioDaConta(S, c)?.id).toBe(d.id);
  });
});
