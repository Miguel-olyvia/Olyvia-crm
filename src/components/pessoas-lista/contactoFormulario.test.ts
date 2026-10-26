import { describe, expect, it } from "vitest";
import { formularioDeContacto, pedidoDeContacto, type ContactoAtual } from "./contactoFormulario";

const atual: ContactoAtual = { telefone: "912345678", email: "ana@x.pt", contacto: "email", hora: "tarde", lingua: "pt" };

describe("pedidoDeContacto", () => {
  it("sem mudanças não há nada a guardar", () => {
    expect(pedidoDeContacto(formularioDeContacto(atual), atual)).toEqual({ estado: "semAlteracao" });
  });

  it("uma pessoa sem nada abre com campos vazios e língua pt", () => {
    expect(formularioDeContacto({ telefone: null, email: null })).toEqual({ telefone: "", email: "", contacto: "", hora: "", lingua: "pt" });
  });

  it("manda só o que mudou, com o email e o telefone aparados", () => {
    const f = { ...formularioDeContacto(atual), email: "  nova@x.pt ", hora: "manha" as const };
    expect(pedidoDeContacto(f, atual)).toEqual({ estado: "guardar", dados: { email: "nova@x.pt", hora: "manha" } });
  });

  it("limpar o contacto e a hora manda cadeia vazia", () => {
    const f = { ...formularioDeContacto(atual), contacto: "" as const, hora: "" as const };
    expect(pedidoDeContacto(f, atual)).toEqual({ estado: "guardar", dados: { contacto: "", hora: "" } });
  });

  it("esvaziar o email ou o telefone não apaga: ignora-se", () => {
    const f = { ...formularioDeContacto(atual), email: "", telefone: " " };
    expect(pedidoDeContacto(f, atual)).toEqual({ estado: "semAlteracao" });
  });

  it("um email inválido é recusado antes de ir à base", () => {
    const f = { ...formularioDeContacto(atual), email: "sem-arroba" };
    expect(pedidoDeContacto(f, atual)).toEqual({ estado: "falta", campo: "email", chaveErro: "errorEmail" });
  });

  it("um telefone com menos de 7 ou mais de 15 dígitos é recusado", () => {
    expect(pedidoDeContacto({ ...formularioDeContacto(atual), telefone: "12345" }, atual)).toEqual({ estado: "falta", campo: "telefone", chaveErro: "errorPhone" });
    expect(pedidoDeContacto({ ...formularioDeContacto(atual), telefone: "1234567890123456" }, atual)).toMatchObject({ estado: "falta", campo: "telefone" });
    expect(pedidoDeContacto({ ...formularioDeContacto(atual), telefone: "abc 9123456" }, atual)).toMatchObject({ estado: "falta", campo: "telefone" });
  });

  it("uma língua fora da lista (es) mantém-se e não se reenvia; mudar para fr envia fr", () => {
    const es: ContactoAtual = { ...atual, lingua: "es" };
    expect(formularioDeContacto(es).lingua).toBe("es");
    expect(pedidoDeContacto(formularioDeContacto(es), es)).toEqual({ estado: "semAlteracao" });
    expect(pedidoDeContacto({ ...formularioDeContacto(es), lingua: "fr" }, es)).toEqual({ estado: "guardar", dados: { lingua: "fr" } });
  });
});
