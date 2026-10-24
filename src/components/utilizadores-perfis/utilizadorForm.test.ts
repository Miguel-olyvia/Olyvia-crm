// Valores iniciais, o que se guarda e a palavra-passe gerada do formulário de utilizador.
import { describe, expect, it } from "vitest";
import { UTILIZADORES_EXEMPLO } from "./utilizadoresExemplo";
import {
  gerarPalavraPasse, paraDados, TAMANHO_GERADA, utilizadorDeValores, valoresIniciaisUtilizador, vinculoVazio,
} from "./utilizadorForm";

describe("valoresIniciaisUtilizador", () => {
  it("um convite começa em branco, Convidado e com uma linha de vínculo por escolher", () => {
    const v = valoresIniciaisUtilizador();
    expect(v).toMatchObject({ nome: "", email: "", palavraPasse: "", estado: "convidado" });
    expect(v.vinculos).toEqual([vinculoVazio()]);
  });

  it("editar traz os dados do utilizador, sem palavra-passe, e copia os vínculos", () => {
    const rui = UTILIZADORES_EXEMPLO.find((u) => u.id === "u-02")!;
    const v = valoresIniciaisUtilizador(rui);
    expect(v).toMatchObject({ nome: "Rui Pacheco", estado: "ativo", palavraPasse: "" });
    expect(v.vinculos).toHaveLength(3);
    expect(v.vinculos[0]).not.toBe(rui.vinculos[0]);
    expect(v.vinculos[0].ambitos).not.toBe(rui.vinculos[0].ambitos);
    expect(valoresIniciaisUtilizador(UTILIZADORES_EXEMPLO.find((u) => u.id === "u-08")).estado).toBe("inativo");
  });
});

describe("paraDados e utilizadorDeValores", () => {
  it("paraDados nunca leva a palavra-passe", () => {
    const dados = paraDados({ ...valoresIniciaisUtilizador(), palavraPasse: "segredo123" });
    expect(JSON.stringify(dados)).not.toContain("segredo123");
    expect(Object.keys(dados)).not.toContain("palavraPasse");
  });

  it("a pré-visualização só leva os vínculos completos e reflete o estado", () => {
    const v = { ...valoresIniciaisUtilizador(), estado: "inativo" as const, vinculos: [vinculoVazio(), { ...vinculoVazio(), organizacaoId: "o-grupo", roleId: "r-leitura" }] };
    const u = utilizadorDeValores(v, "novo");
    expect(u.vinculos).toHaveLength(1);
    expect(u).toMatchObject({ ativo: false, convidado: false });
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
