import { describe, expect, it } from "vitest";
import { avisoContaExistente } from "./avisoContaExistente";

describe("avisoContaExistente", () => {
  it("conta que já existia e ficha intacta: devolve a mensagem do servidor", () => {
    expect(avisoContaExistente({ existing_auth_user: true, ficha_alterada: false, message: "A pessoa já existia." })).toBe("A pessoa já existia.");
  });
  it.each([
    [null], [undefined], [{}], ["x"],
    [{ existing_auth_user: false, ficha_alterada: false, message: "m" }],
    [{ existing_auth_user: true, ficha_alterada: true, message: "m" }],
    [{ existing_auth_user: true, ficha_alterada: false }],
    [{ existing_auth_user: true, ficha_alterada: false, message: "" }],
  ])("sem aviso para %j", (dados) => {
    expect(avisoContaExistente(dados)).toBeUndefined();
  });
});
