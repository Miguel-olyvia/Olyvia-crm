// O menu de "Utilizadores e perfis". Os testes que viviam aqui (lista, ficha e formulário de utilizador, e as roles em memória)
// dependiam dos dados de exemplo e foram substituídos por testes dos wrappers ligados à base: utilizadores e portal em
// UtilizadoresPerfisUtilizadores.test.tsx, roles em UtilizadoresPerfisRoles.test.tsx, permissões por separador em
// UtilizadoresPerfisSeparadores.test.tsx.
import { describe, expect, it } from "vitest";
import { menuSections } from "@/components/sidebar/menuConfig";

describe("menu", () => {
  it("tem uma só entrada, para quem tem users.view OU roles.view; os itens /users e /roles saíram do menu", () => {
    const grupo = menuSections.find((s) => s.id === "users")!;
    const entrada = grupo.items.find((i) => i.to === "/utilizadores-perfis");
    expect(entrada?.labelKey).toBe("sidebar.usersProfiles");
    expect(entrada?.permissions).toEqual(["users.view", "roles.view"]);
    expect(grupo.paths).toContain("/utilizadores-perfis");
    expect(grupo.items.some((i) => i.to === "/users")).toBe(false);
    expect(grupo.items.some((i) => i.to === "/roles")).toBe(false);
  });
});
