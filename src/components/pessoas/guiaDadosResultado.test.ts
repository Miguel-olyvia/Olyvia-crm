// O guia sabe qual foi o resultado do ÚLTIMO contacto (o mais recente por dia e hora), para avisar quando não há interesse.
import { describe, expect, it } from "vitest";
import { dadosDoGuia } from "./guiaDados";
import { contactoBase, pessoaBase, registosBase } from "./fabricaTestes";

const pessoa = pessoaBase("a", { nome: "Pedro" });

describe("dadosDoGuia: ultimoResultado", () => {
  it("sem chamadas é nulo", () => {
    expect(dadosDoGuia(pessoa, registosBase()).ultimoResultado).toBeNull();
  });

  it("é o da chamada mais recente, mesmo que não seja a última da lista", () => {
    const registos = registosBase({
      contactos: [
        contactoBase("c2", { data: "2026-10-12", resultado: "semInteresse" }),
        contactoBase("c1", { data: "2026-10-10", resultado: "atendeuInteressado" }),
      ],
    });
    expect(dadosDoGuia(pessoa, registos).ultimoResultado).toBe("semInteresse");
  });

  it("no mesmo dia desempata pela hora: a chamada seguinte (outra tentativa) manda", () => {
    const registos = registosBase({
      contactos: [
        contactoBase("c1", { data: "2026-10-12", hora: "09:00", resultado: "numeroErrado" }),
        contactoBase("c2", { data: "2026-10-12", hora: "17:30", resultado: "atendeuInteressado" }),
      ],
    });
    expect(dadosDoGuia(pessoa, registos).ultimoResultado).toBe("atendeuInteressado");
  });

  it("uma chamada com resultado desconhecido da ficha dá nulo", () => {
    const registos = registosBase({ contactos: [contactoBase("c1", { resultado: null })] });
    expect(dadosDoGuia(pessoa, registos).ultimoResultado).toBeNull();
  });
});
