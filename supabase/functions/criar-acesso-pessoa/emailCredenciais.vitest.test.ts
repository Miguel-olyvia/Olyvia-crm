/**
 * @vitest-environment node
 *
 * O destinatario e o corpo do e-mail de credenciais de criar-acesso-pessoa.
 * O sufixo `.vitest.` e o que faz o vitest apanha-lo.
 */
import { describe, expect, it } from "vitest";
import { corpoDoEmail, destinatarioDoReenvio } from "./emailCredenciais.ts";

describe("destinatarioDoReenvio", () => {
  it("e o email da conta de autenticacao, nunca o email_pessoal da ficha", () => {
    expect(
      destinatarioDoReenvio({ emailConta: " Conta@Exemplo.pt " }),
    ).toBe("conta@exemplo.pt");
  });

  it("devolve null quando a conta nao tem email utilizavel", () => {
    expect(destinatarioDoReenvio({ emailConta: null })).toBeNull();
    expect(destinatarioDoReenvio({ emailConta: undefined })).toBeNull();
    expect(destinatarioDoReenvio({ emailConta: "" })).toBeNull();
    expect(destinatarioDoReenvio({ emailConta: "sem-arroba" })).toBeNull();
  });
});

describe("corpoDoEmail", () => {
  it("com password: leva utilizador, password e link absoluto", () => {
    const { html, text } = corpoDoEmail("Ana", "ana@x.pt", "Abc123", "https://app.x.pt");
    expect(html).toContain("Abc123");
    expect(html).toContain('href="https://app.x.pt/login"');
    expect(text).toContain("Password: Abc123");
  });

  it("escapa o HTML do nome e do email", () => {
    const { html } = corpoDoEmail('<b>"A"</b>', "a@x.pt", "p", "");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
  });

  it("sem URL base: nao ha link nenhum (nunca relativo)", () => {
    const { html, text } = corpoDoEmail("Ana", "ana@x.pt", "p", "");
    expect(html).not.toContain("href=");
    expect(text).not.toContain("Entrar:");
  });

  it("conta ja existente (password null): nao menciona nem inclui password", () => {
    const { html, text } = corpoDoEmail("Ana", "ana@x.pt", null, "https://app.x.pt");
    expect(html).not.toContain("Password:");
    expect(text).not.toContain("Password:");
    expect(html).toContain("ana@x.pt");
    expect(html.toLowerCase()).toContain("recuper");
  });
});
