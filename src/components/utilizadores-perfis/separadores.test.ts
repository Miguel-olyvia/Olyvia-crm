// Regras puras dos separadores: cada separador pede a sua permissão e o URL nunca abre um que não é permitido.
import { describe, expect, it } from "vitest";
import { PERMISSAO_SEPARADOR, resolverSeparador, separadoresPermitidos } from "./separadores";

const com = (...codigos: string[]) => (codigo: string) => codigos.includes(codigo);

describe("separadoresPermitidos", () => {
  it("users.view dá Utilizadores e Portal, e não Roles", () => {
    expect(separadoresPermitidos(com("users.view"))).toEqual(["utilizadores", "portal"]);
  });
  it("roles.view dá só Roles", () => {
    expect(separadoresPermitidos(com("roles.view"))).toEqual(["roles"]);
  });
  it("as duas dão os três, pela ordem da página", () => {
    expect(separadoresPermitidos(com("users.view", "roles.view"))).toEqual(["utilizadores", "roles", "portal"]);
  });
  it("sem nenhuma não dá nada; permissões de ação sozinhas não abrem separador", () => {
    expect(separadoresPermitidos(com())).toEqual([]);
    expect(separadoresPermitidos(com("users.create", "roles.edit"))).toEqual([]);
  });
  it("o Portal pede a permissão que a sub-aba de clientes já exigia", () => {
    expect(PERMISSAO_SEPARADOR.portal).toBe("users.view");
  });
});

describe("resolverSeparador", () => {
  it("aceita o pedido quando é permitido", () => {
    expect(resolverSeparador("roles", ["utilizadores", "roles"])).toBe("roles");
  });
  it("valor inválido, vazio ou nulo cai no primeiro permitido", () => {
    expect(resolverSeparador("xpto", ["roles"])).toBe("roles");
    expect(resolverSeparador("", ["portal", "roles"])).toBe("portal");
    expect(resolverSeparador(null, ["utilizadores"])).toBe("utilizadores");
  });
  it("pedido de um separador não permitido cai no primeiro permitido", () => {
    expect(resolverSeparador("roles", ["utilizadores", "portal"])).toBe("utilizadores");
  });
  it("sem permitidos devolve null", () => {
    expect(resolverSeparador("roles", [])).toBeNull();
  });
});
