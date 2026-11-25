import { describe, expect, it } from "vitest";
import { getEntityDisplayName } from "@/lib/entityDisplayName";

describe("getEntityDisplayName", () => {
  it("display_name da ficha manda sobre tudo o resto (empresa preenchida)", () => {
    expect(getEntityDisplayName({
      display_name: "Empresa X, Lda",
      company_name: "Outra Empresa",
      first_name: "Ana",
      last_name: "Silva",
    })).toBe("Empresa X, Lda");
  });

  it("ficha so com nome e apelido, sem display_name: compoe nome + apelido", () => {
    expect(getEntityDisplayName({ display_name: "", first_name: "Ana", last_name: "Silva" })).toBe("Ana Silva");
    expect(getEntityDisplayName({ first_name: "Ana", last_name: null })).toBe("Ana");
    expect(getEntityDisplayName({ first_name: null, last_name: "Silva" })).toBe("Silva");
  });

  it("display_name vazio ou so espacos: cai no nome da empresa, depois em nome + apelido", () => {
    expect(getEntityDisplayName({ display_name: "   ", company_name: "Empresa X", first_name: "Ana" })).toBe("Empresa X");
    expect(getEntityDisplayName({ display_name: null, company_name: " ", first_name: " Ana ", last_name: " Silva " })).toBe("Ana Silva");
  });

  it("nao depende do tipo: a mesma ficha da o mesmo nome como person ou organization", () => {
    const base = { display_name: "Empresa X", first_name: "Ana", last_name: "Silva" };
    const person = getEntityDisplayName({ ...base, type: "person" } as any);
    const organization = getEntityDisplayName({ ...base, type: "organization" } as any);
    expect(person).toBe("Empresa X");
    expect(organization).toBe(person);
  });

  it("campos em falta ou de tipo errado nao rebentam e usam o ultimo recurso", () => {
    expect(getEntityDisplayName(null, "Cliente")).toBe("Cliente");
    expect(getEntityDisplayName(undefined)).toBe("");
    expect(getEntityDisplayName({}, "Lead")).toBe("Lead");
    expect(getEntityDisplayName({ display_name: 42 as any, first_name: undefined }, "Cliente")).toBe("Cliente");
  });
});
