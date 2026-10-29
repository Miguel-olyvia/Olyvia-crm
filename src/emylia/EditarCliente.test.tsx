// "Editar os dados do cliente" (29/10): o que se valida, o que muda no negócio e quem é avisado (o contacto do CRM e o portal).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { seed, type Negocio } from "./motor";
import { definirModoReal } from "./acessosPortal";
import { aplicarDados, dadosDoNegocio, definirGuardarCliente, EditarCliente, errosDados } from "./EditarCliente";
import type { Ctx } from "./pecas";

afterEach(() => { cleanup(); definirModoReal(null); });

const negocio = (): Negocio => {
  const d = structuredClone(seed().deals[0]);
  d.nome = "Teste Sistema 2910"; d.tel = "cliente.teste.2910@example.com";
  d.f = { ...d.f, email: "cliente.teste.2910@example.com", morada: "Rua do Teste 10", cp: "1000-001", localidade: "Lisboa" };
  return d;
};

describe("dados do cliente", () => {
  it("lê o negócio (o contacto escrito como email não é telefone)", () => {
    expect(dadosDoNegocio(negocio())).toMatchObject({ nome: "Teste Sistema 2910", telefone: "", email: "cliente.teste.2910@example.com", localidade: "Lisboa" });
  });

  it("valida o nome, um contacto, o email e o NIF", () => {
    const x = dadosDoNegocio(negocio());
    expect(errosDados(x)).toEqual([]);
    expect(errosDados({ ...x, nome: " " })).toEqual(["Escreva o nome do cliente."]);
    expect(errosDados({ ...x, email: "", telefone: "" })).toEqual(["Escreva o telefone ou o email."]);
    expect(errosDados({ ...x, email: "ruben@" })).toEqual(["O email não é válido (por exemplo nome@exemplo.pt)."]);
    expect(errosDados({ ...x, nif: "12345" })).toEqual(["O NIF tem 9 algarismos."]);
  });

  it("aplica no negócio: nome, telefone, email em minúsculas, NIF sem espaços, morada e o local; fica no histórico", () => {
    const d = negocio();
    const mudou = aplicarDados(d, { ...dadosDoNegocio(d), nome: "Rúben Teste", telefone: "912 345 678", email: "Ruben+Cliente@Gmail.com", nif: "123 456 789", localidade: "Sintra" });
    expect(mudou.sort()).toEqual(["email", "localidade", "nif", "nome", "telefone"]);
    expect(d).toMatchObject({ nome: "Rúben Teste", tel: "912 345 678", local: "Rua do Teste 10, 1000-001, Sintra" });
    expect(d.f).toMatchObject({ email: "ruben+cliente@gmail.com", nif: "123456789", localidade: "Sintra" });
    expect(d.hist[d.hist.length - 1].t).toContain("Dados do cliente mudados");
  });

  it("o formulário grava, avisa o contacto do CRM e, com o email novo e a proposta no portal, reenvia o acesso", () => {
    definirModoReal("org-1", "nike");
    const d = negocio();
    d.orc = { ...(d.orc ?? {}), enviada: "hoje" } as Negocio["orc"];
    const acessoPortal = vi.fn(), guardar = vi.fn(), fechar = vi.fn();
    const desligar = definirGuardarCliente(guardar);
    const ctx = { S: seed(), A: { acessoPortal }, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn() } as unknown as Ctx;
    render(<EditarCliente ctx={ctx} d={d} fechar={fechar} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ruben+cliente@gmail.com" } });
    expect(screen.getByLabelText("Enviar o acesso ao portal para o email novo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(d.f.email).toBe("ruben+cliente@gmail.com");
    expect(guardar).toHaveBeenCalledWith(d, expect.objectContaining({ email: "ruben+cliente@gmail.com" }), ["email"], { portal: true });
    expect(acessoPortal).toHaveBeenCalledWith(d.id);
    expect(fechar).toHaveBeenCalled();
    desligar();
  });

  it("com um erro não grava nem fecha", () => {
    const d = negocio(), fechar = vi.fn();
    const ctx = { S: seed(), A: {}, run: (fn: () => void) => fn() } as unknown as Ctx;
    render(<EditarCliente ctx={ctx} d={d} fechar={fechar} />);
    fireEvent.change(screen.getByLabelText("NIF"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("alert").textContent).toContain("9 algarismos");
    expect(d.f.nif).toBeUndefined();
    expect(fechar).not.toHaveBeenCalled();
  });
});
