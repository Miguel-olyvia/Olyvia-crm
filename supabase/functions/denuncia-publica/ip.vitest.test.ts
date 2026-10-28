/**
 * @vitest-environment node
 *
 * O IP so serve para limitar pedidos. O primeiro valor de x-forwarded-for forja-se: o
 * IP vem do cabecalho que a plataforma garante (cf-connecting-ip) ou da entrada que ELA
 * acrescentou (a ultima, menos os saltos de confianca configurados).
 */
import { describe, expect, it } from "vitest";
import { ipDoPedido } from "./ip.ts";

const pedido = (cabecalhos: Record<string, string>) => new Request("https://x.test/", { method: "POST", headers: cabecalhos });

describe("ipDoPedido", () => {
  it("ignora o que o cliente forja a esquerda de x-forwarded-for", () => {
    expect(ipDoPedido(pedido({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("prefere cf-connecting-ip", () => {
    expect(ipDoPedido(pedido({ "cf-connecting-ip": "198.51.100.9", "x-forwarded-for": "1.1.1.1, 203.0.113.7" }))).toBe("198.51.100.9");
  });

  it("salta os saltos de confianca a direita", () => {
    expect(ipDoPedido(pedido({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), 1)).toBe("203.0.113.7");
    expect(ipDoPedido(pedido({ "x-forwarded-for": "203.0.113.7" }), 1)).toBeNull();
  });

  it("devolve null (nunca 'unknown') sem IP valido", () => {
    expect(ipDoPedido(pedido({}))).toBeNull();
    expect(ipDoPedido(pedido({ "x-forwarded-for": "nao-e-ip" }))).toBeNull();
    expect(ipDoPedido(pedido({ "x-forwarded-for": "999.1.1.1" }))).toBeNull();
  });

  it("aceita IPv6 e tira a porta do IPv4", () => {
    expect(ipDoPedido(pedido({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(ipDoPedido(pedido({ "x-forwarded-for": "203.0.113.7:52344" }))).toBe("203.0.113.7");
  });
});
