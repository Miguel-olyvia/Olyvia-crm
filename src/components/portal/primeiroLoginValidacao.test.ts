// A validação da palavra-passe do primeiro login usa o passwordResetSchema (partilhado com o CRM, que não se
// altera); aqui só se mapeia a primeira falha para uma chave pc.login.* do portal.
import { describe, expect, it } from "vitest";
import { traduzir } from "@/portal-i18n/traduzir";
import { chaveDoErroDePassword } from "./primeiroLoginValidacao";

const pt = (dados: { password: string; confirmPassword: string }) => {
  const chave = chaveDoErroDePassword(dados);
  return chave === null ? null : traduzir("pt", chave);
};
const en = (dados: { password: string; confirmPassword: string }) => {
  const chave = chaveDoErroDePassword(dados);
  return chave === null ? null : traduzir("en", chave);
};

describe("chaveDoErroDePassword", () => {
  it("palavra-passe válida e confirmada: sem erro", () => {
    expect(chaveDoErroDePassword({ password: "12345678", confirmPassword: "12345678" })).toBeNull();
  });

  it("curta: a mensagem de hoje em português e a tradução em inglês", () => {
    expect(pt({ password: "1234567", confirmPassword: "1234567" })).toBe("A password deve ter no mínimo 8 caracteres.");
    expect(en({ password: "1234567", confirmPassword: "1234567" })).toBe("The password must be at least 8 characters long.");
  });

  it("limite: 8 caracteres passa, 7 não", () => {
    expect(chaveDoErroDePassword({ password: "abcdefgh", confirmPassword: "abcdefgh" })).toBeNull();
    expect(chaveDoErroDePassword({ password: "abcdefg", confirmPassword: "abcdefg" })).not.toBeNull();
  });

  it("confirmação vazia", () => {
    expect(pt({ password: "12345678", confirmPassword: "" })).toBe("Confirme a password.");
    expect(en({ password: "12345678", confirmPassword: "" })).toBe("Please confirm the password.");
  });

  it("confirmação diferente", () => {
    expect(pt({ password: "12345678", confirmPassword: "87654321" })).toBe("As passwords não coincidem.");
    expect(en({ password: "12345678", confirmPassword: "87654321" })).toBe("The passwords do not match.");
  });

  it("tudo vazio: a primeira falha é a da palavra-passe, como no schema", () => {
    expect(pt({ password: "", confirmPassword: "" })).toBe("A password deve ter no mínimo 8 caracteres.");
  });

  it("caracteres especiais e emojis contam como caracteres", () => {
    expect(chaveDoErroDePassword({ password: "pä$$wörd", confirmPassword: "pä$$wörd" })).toBeNull();
  });
});
