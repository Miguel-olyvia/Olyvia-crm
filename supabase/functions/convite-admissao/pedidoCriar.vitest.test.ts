/**
 * @vitest-environment node
 *
 * As regras puras da accao "criar" do convite: validacao do pedido, URL base
 * obrigatoria e saneamento do erro de envio. O sufixo `.vitest.` e o que faz o
 * vitest apanha-lo.
 */
import { describe, expect, it } from "vitest";
import {
  EMAIL_MAX,
  LIMITE_CRIAR_POR_PESSOA,
  LIMITE_CRIAR_POR_UTILIZADOR,
  lerResultadoCriar,
  linkDoConvite,
  linkParaOCriador,
  resolverBaseUrl,
  sanearEmailErro,
  validarPedidoCriar,
} from "./pedidoCriar.ts";

const PESSOA = "11111111-1111-4111-8111-111111111111";

describe("validarPedidoCriar", () => {
  it("aceita um pedido valido e apara o email", () => {
    expect(validarPedidoCriar({ pessoa_id: PESSOA, email: "  ana@exemplo.pt " })).toEqual({
      pessoaId: PESSOA,
      email: "ana@exemplo.pt",
    });
  });

  it("recusa pedido nulo, vazio ou de tipo errado", () => {
    expect(validarPedidoCriar(null)).toBeNull();
    expect(validarPedidoCriar(undefined)).toBeNull();
    expect(validarPedidoCriar("x")).toBeNull();
    expect(validarPedidoCriar({})).toBeNull();
    expect(validarPedidoCriar({ pessoa_id: 1, email: "a@b.pt" })).toBeNull();
    expect(validarPedidoCriar({ pessoa_id: PESSOA, email: 5 })).toBeNull();
  });

  it("recusa um pessoa_id que nao e UUID (evita o 22P02 da base)", () => {
    expect(validarPedidoCriar({ pessoa_id: "x", email: "a@b.pt" })).toBeNull();
    expect(validarPedidoCriar({ pessoa_id: `${PESSOA}'; drop`, email: "a@b.pt" })).toBeNull();
  });

  it("recusa emails com varios destinatarios, espacos ou caracteres de cabecalho", () => {
    for (const email of [
      "a@b.pt,c@d.pt",
      "a@b.pt;c@d.pt",
      "a@b.pt c@d.pt",
      "<a@b.pt>",
      "a@b",
      "@b.pt",
      "a@",
      "sem-arroba",
      "a@b.pt\nBcc: x@y.pt",
      "",
      "   ",
    ]) {
      expect(validarPedidoCriar({ pessoa_id: PESSOA, email }), email).toBeNull();
    }
  });

  it("respeita o limite de 254 caracteres no email, nos dois lados da fronteira", () => {
    const sufixo = "@exemplo.pt";
    const noLimite = "a".repeat(EMAIL_MAX - sufixo.length) + sufixo;
    const acima = "a".repeat(EMAIL_MAX - sufixo.length + 1) + sufixo;
    expect(noLimite).toHaveLength(EMAIL_MAX);
    expect(validarPedidoCriar({ pessoa_id: PESSOA, email: noLimite })).not.toBeNull();
    expect(validarPedidoCriar({ pessoa_id: PESSOA, email: acima })).toBeNull();
  });

  it("aceita unicode e sinais usuais na parte local", () => {
    expect(validarPedidoCriar({ pessoa_id: PESSOA, email: "joao.silva+rh@exemplo.pt" })).not.toBeNull();
    expect(validarPedidoCriar({ pessoa_id: PESSOA, email: "jose@exemplo.com.pt" })).not.toBeNull();
  });
});

describe("limites", () => {
  it("o tecto por pessoa e menor que o tecto por utilizador", () => {
    expect(LIMITE_CRIAR_POR_UTILIZADOR).toBe(20);
    expect(LIMITE_CRIAR_POR_PESSOA).toBe(5);
    expect(LIMITE_CRIAR_POR_PESSOA).toBeLessThan(LIMITE_CRIAR_POR_UTILIZADOR);
  });
});

describe("resolverBaseUrl", () => {
  it("devolve null quando a variavel falta, e vazia ou so tem espacos", () => {
    expect(resolverBaseUrl(undefined)).toBeNull();
    expect(resolverBaseUrl(null)).toBeNull();
    expect(resolverBaseUrl("")).toBeNull();
    expect(resolverBaseUrl("   ")).toBeNull();
  });

  it("recusa valores que nao sao um URL absoluto http(s)", () => {
    expect(resolverBaseUrl("/admissao")).toBeNull();
    expect(resolverBaseUrl("app.exemplo.pt")).toBeNull();
    expect(resolverBaseUrl("javascript:alert(1)")).toBeNull();
    expect(resolverBaseUrl("ftp://exemplo.pt")).toBeNull();
  });

  it("aceita https e http, e tira as barras finais", () => {
    expect(resolverBaseUrl("https://app.exemplo.pt")).toBe("https://app.exemplo.pt");
    expect(resolverBaseUrl(" https://app.exemplo.pt/// ")).toBe("https://app.exemplo.pt");
    expect(resolverBaseUrl("http://localhost:5173")).toBe("http://localhost:5173");
  });
});

describe("linkDoConvite", () => {
  it("e sempre absoluto", () => {
    expect(linkDoConvite("https://app.exemplo.pt", "abc")).toBe("https://app.exemplo.pt/admissao/abc");
  });
});

describe("sanearEmailErro", () => {
  const TOKEN = "tok_ABC-123_xyz";

  it("devolve null para vazio ou nulo", () => {
    expect(sanearEmailErro(null, TOKEN)).toBeNull();
    expect(sanearEmailErro(undefined, TOKEN)).toBeNull();
    expect(sanearEmailErro("   ", TOKEN)).toBeNull();
  });

  it("mantem um erro de SMTP normal", () => {
    expect(sanearEmailErro("SMTP indisponivel", TOKEN)).toBe("SMTP indisponivel");
  });

  it("tira o token em qualquer posicao e em todas as ocorrencias", () => {
    const r = sanearEmailErro(`falhou ${TOKEN} e outra vez ${TOKEN}`, TOKEN) as string;
    expect(r).not.toContain(TOKEN);
    expect(r).toContain("[token]");
  });

  it("tira qualquer caminho /admissao/<...>, mesmo com outro token", () => {
    const r = sanearEmailErro(
      '<a href="https://app.exemplo.pt/admissao/OUTRO_valor-9">x</a>',
      TOKEN,
    ) as string;
    expect(r).not.toContain("OUTRO_valor-9");
    expect(r).not.toMatch(/\/admissao\/[A-Za-z0-9_-]/);
  });

  it("corta a 500 caracteres no maximo (o CHECK da coluna)", () => {
    expect((sanearEmailErro("x".repeat(2000), TOKEN) as string).length).toBeLessThanOrEqual(500);
  });

  it("o token que atravessa o corte nao fica meio visivel", () => {
    const texto = "y".repeat(480) + TOKEN;
    const r = sanearEmailErro(texto, TOKEN) as string;
    expect(r.length).toBeLessThanOrEqual(500);
    expect(r).not.toContain(TOKEN.slice(0, 6));
  });

  it("ignora um token vazio sem rebentar", () => {
    expect(sanearEmailErro("erro", "")).toBe("erro");
  });
});

const CONVITE = "22222222-2222-4222-8222-222222222222";

describe("lerResultadoCriar", () => {
  it("le a linha unica do RETURNS TABLE (convite_id, rascunho_herdado)", () => {
    expect(lerResultadoCriar([{ convite_id: CONVITE, rascunho_herdado: true }])).toEqual({
      conviteId: CONVITE,
      rascunhoHerdado: true,
    });
    expect(lerResultadoCriar([{ convite_id: CONVITE, rascunho_herdado: false }])).toEqual({
      conviteId: CONVITE,
      rascunhoHerdado: false,
    });
  });

  it("aceita tambem um objecto solto em vez de um array de uma linha", () => {
    expect(lerResultadoCriar({ convite_id: CONVITE, rascunho_herdado: false })).toEqual({
      conviteId: CONVITE,
      rascunhoHerdado: false,
    });
  });

  it("sem id valido o conviteId e null (nunca um id inventado)", () => {
    for (const mau of [null, undefined, [], {}, [{}], "x", 42, [{ convite_id: "nao-e-uuid" }], [{ convite_id: 7 }]]) {
      expect(lerResultadoCriar(mau).conviteId).toBeNull();
    }
  });

  it("na duvida assume que HOUVE heranca: so um false literal liberta o link", () => {
    // Um valor ausente ou de tipo estranho nao pode abrir o link do RH.
    expect(lerResultadoCriar([{ convite_id: CONVITE }]).rascunhoHerdado).toBe(true);
    expect(lerResultadoCriar([{ convite_id: CONVITE, rascunho_herdado: "false" }]).rascunhoHerdado).toBe(true);
    expect(lerResultadoCriar(null).rascunhoHerdado).toBe(true);
  });
});

describe("linkParaOCriador", () => {
  const BASE = "https://app.exemplo.pt";
  const TOKEN = "abcdefghijklmnopqrstuvwxyz0123456789";

  it("com o email enviado nunca devolve o link", () => {
    expect(linkParaOCriador({ emailEnviado: true, rascunhoHerdado: false, baseUrl: BASE, token: TOKEN })).toBeNull();
  });

  it("com o email falhado e sem rascunho herdado devolve o link absoluto", () => {
    expect(linkParaOCriador({ emailEnviado: false, rascunhoHerdado: false, baseUrl: BASE, token: TOKEN })).toBe(
      `${BASE}/admissao/${TOKEN}`,
    );
  });

  it("com o email falhado E rascunho herdado NAO devolve o link (abriria o rascunho de outra pessoa na UI do RH)", () => {
    expect(linkParaOCriador({ emailEnviado: false, rascunhoHerdado: true, baseUrl: BASE, token: TOKEN })).toBeNull();
  });
});
