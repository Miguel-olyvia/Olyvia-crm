// Mensagens guardadas em estado: guarda-se a CHAVE (e os parâmetros) e traduz-se ao mostrar, para o texto
// visível seguir o idioma quando este muda. O que vem do servidor fica como vem.
import { describe, expect, it } from "vitest";
import { marcarMensagem, mensagemDeChave, mensagemDeTexto, resolverMensagem, resolverMensagemMarcada } from "./mensagem";

describe("resolverMensagem", () => {
  it("uma chave traduz-se no idioma de agora (e muda com ele)", () => {
    const m = mensagemDeChave("pc.propostaDet.sms.semTelefone");
    expect(resolverMensagem(m, "pt")).not.toBe(resolverMensagem(m, "en"));
    expect(resolverMensagem(m, "en")).not.toBe("pc.propostaDet.sms.semTelefone");
  });

  it("os parâmetros entram na tradução", () => {
    const m = mensagemDeChave("sp.catalogo.aviso.ativadosN.varios", { n: 7 });
    expect(resolverMensagem(m, "en")).toContain("7");
  });

  it("um texto vindo do servidor fica exatamente como veio, nos dois idiomas", () => {
    const m = mensagemDeTexto("Código inválido (servidor)");
    expect(resolverMensagem(m, "pt")).toBe("Código inválido (servidor)");
    expect(resolverMensagem(m, "en")).toBe("Código inválido (servidor)");
  });

  it("uma mensagem calculada por função recebe o idioma de agora", () => {
    expect(resolverMensagem({ de: (idioma) => `idioma=${idioma}` }, "en")).toBe("idioma=en");
  });

  it("sem mensagem devolve texto vazio", () => {
    expect(resolverMensagem(null, "pt")).toBe("");
    expect(resolverMensagem(undefined, "en")).toBe("");
  });
});

describe("mensagem marcada (texto que transporta a chave)", () => {
  it("resolve-se no idioma de agora e preserva os parâmetros", () => {
    const marcada = marcarMensagem("sp.dados.erro.demasiadoLongo", { max: 40 });
    expect(resolverMensagemMarcada(marcada, "pt")).toContain("40");
    expect(resolverMensagemMarcada(marcada, "pt")).not.toBe(resolverMensagemMarcada(marcada, "en"));
  });

  it("um texto comum (sem marca) volta como veio", () => {
    expect(resolverMensagemMarcada("Texto do servidor", "en")).toBe("Texto do servidor");
    expect(resolverMensagemMarcada(undefined, "en")).toBe("");
  });
});
