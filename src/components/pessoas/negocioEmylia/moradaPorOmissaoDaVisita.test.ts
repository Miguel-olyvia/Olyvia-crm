// A morada por omissão da visita: a obra manda; só sem obra vale a morada do cliente (a da ficha da entidade)
import { describe, expect, it } from "vitest";
import type { Negocio } from "@/emylia/motor";
import { moradaPorOmissaoDaVisita } from "./moradaPorOmissaoDaVisita";

const CLIENTE = { morada: "Rua de Casa 1", cp: "1000-001", localidade: "Lisboa", fracao: "2.º Dto", de: "ficha" as const };
const negocio = (f: Record<string, string>, local = "", moradaLead?: typeof CLIENTE): Negocio => ({ f, local, ...(moradaLead ? { moradaLead } : {}) }) as unknown as Negocio;

describe("moradaPorOmissaoDaVisita", () => {
  it("com morada de obra: a obra, mesmo que o cliente tenha outra morada na ficha", () => {
    const r = moradaPorOmissaoDaVisita(negocio({ morada: "Rua da Obra 9", cp: "2750-100", localidade: "Cascais" }, "", CLIENTE));
    expect(r.origem).toBe("obra");
    expect(r.morada).toEqual({ rua: "Rua da Obra 9", codigoPostal: "2750-100", localidade: "Cascais", andar: "" });
  });

  it("sem obra mas com um código postal no pedido: a obra como o cliente a indicou, não a casa do cliente", () => {
    const r = moradaPorOmissaoDaVisita(negocio({}, "Rua das Flores 12, 2710-001 Sintra", CLIENTE));
    expect(r.origem).toBe("obra");
    expect(r.morada?.codigoPostal).toBe("2710-001");
  });

  it("sem obra e sem pedido localizado: a morada do cliente", () => {
    const r = moradaPorOmissaoDaVisita(negocio({}, "", CLIENTE));
    expect(r.origem).toBe("cliente");
    expect(r.morada).toEqual({ rua: "Rua de Casa 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "2.º Dto" });
  });

  it("sem nada: sem morada; só o texto do pedido sem código postal: só a rua (como antes)", () => {
    expect(moradaPorOmissaoDaVisita(negocio({})).morada).toBeNull();
    expect(moradaPorOmissaoDaVisita(negocio({}, "Amadora")).morada).toEqual({ rua: "Amadora", codigoPostal: "", localidade: "", andar: "" });
  });
});
