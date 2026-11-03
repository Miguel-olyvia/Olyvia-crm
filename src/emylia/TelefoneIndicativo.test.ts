import { describe, expect, it } from "vitest";
import { telefoneNormal, telefoneOk } from "./acessosPortal";
import { partirTelefoneCliente } from "./TelefoneIndicativo";

describe("telefone do cliente com indicativo (2/11)", () => {
  it("um número português sem indicativo fica com o +351", () => {
    expect(telefoneNormal("939 606 981")).toBe("+351939606981");
    expect(telefoneNormal("213456789")).toBe("+351213456789");
    expect(telefoneOk("912 345 678")).toBe(true);
  });
  it("o que já tem indicativo fica como está", () => {
    expect(telefoneNormal("+34 612 345 678")).toBe("+34612345678");
    expect(telefoneNormal("00351912345678")).toBe("+351912345678");
    expect(telefoneOk("12345")).toBe(false);
  });
  it("partir o telefone para o seletor", () => {
    expect(partirTelefoneCliente("+34612345678")).toEqual({ indicativo: "+34", digitos: "612345678" });
    expect(partirTelefoneCliente("912 345 678")).toEqual({ indicativo: "+351", digitos: "912345678" });
    expect(partirTelefoneCliente("ana@x.pt")).toEqual({ indicativo: "+351", digitos: "" });
  });
});
