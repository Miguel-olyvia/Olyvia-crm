// Valores iniciais, pré-visualização e palavra-passe gerada do formulário de utilizador.
import { describe, expect, it } from "vitest";
import { UTILIZADORES_EXEMPLO } from "./utilizadoresExemplo";
import { gerarPalavraPasse, TAMANHO_GERADA, utilizadorDeValores, valoresIniciaisUtilizador, vinculoVazio } from "./utilizadorForm";

describe("valoresIniciaisUtilizador", () => {
  it("um utilizador novo começa em branco e com uma linha de vínculo por escolher", () => {
    const v = valoresIniciaisUtilizador();
    expect(v).toMatchObject({ nome: "", email: "", palavraPasse: "" });
    expect(Object.keys(v)).not.toContain("estado");
    expect(Object.keys(v)).not.toContain("morada");
    expect(v.vinculos).toEqual([vinculoVazio()]);
  });

  it("editar traz os dados do utilizador, sem palavra-passe, e copia os vínculos", () => {
    const rui = UTILIZADORES_EXEMPLO.find((u) => u.id === "u-02")!;
    const v = valoresIniciaisUtilizador(rui);
    expect(v).toMatchObject({ nome: "Rui Pacheco", palavraPasse: "" });
    expect(v.vinculos).toHaveLength(3);
    expect(v.vinculos[0]).not.toBe(rui.vinculos[0]);
    expect(v.vinculos[0].ambitos).not.toBe(rui.vinculos[0].ambitos);
  });

  it("só traz os vínculos ativos, como /users (os outros ficam como estão na base)", () => {
    const rui = UTILIZADORES_EXEMPLO.find((u) => u.id === "u-02")!;
    const v = valoresIniciaisUtilizador({ ...rui, vinculos: [rui.vinculos[0], { ...rui.vinculos[1], ativo: false }] });
    expect(v.vinculos).toHaveLength(1);
  });
});

describe("utilizadorDeValores", () => {
  it("a pré-visualização só leva os vínculos completos e nunca a palavra-passe", () => {
    const v = { ...valoresIniciaisUtilizador(), palavraPasse: "segredo123", vinculos: [vinculoVazio(), { ...vinculoVazio(), organizacaoId: "o-grupo", roleId: "r-leitura" }] };
    const u = utilizadorDeValores(v, "novo");
    expect(u.vinculos).toHaveLength(1);
    expect(JSON.stringify(u)).not.toContain("segredo123");
  });
});

describe("gerarPalavraPasse", () => {
  it("dá 12 caracteres, sempre válidos, mesmo com o aleatório nos extremos", () => {
    expect(gerarPalavraPasse()).toHaveLength(TAMANHO_GERADA);
    expect(gerarPalavraPasse(() => 0)).toHaveLength(TAMANHO_GERADA);
    expect(gerarPalavraPasse(() => 0.999999)).toHaveLength(TAMANHO_GERADA);
    expect(gerarPalavraPasse(() => 1)).toHaveLength(TAMANHO_GERADA);
    expect(gerarPalavraPasse(() => 0)).toMatch(/^[A-Za-z0-9!@#$%&*]+$/);
  });
});
