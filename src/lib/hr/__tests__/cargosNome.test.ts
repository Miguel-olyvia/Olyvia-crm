/**
 * A chave do nome do cargo: dois nomes sao o mesmo cargo se tiverem a mesma
 * chave (minusculas, sem acentos, so letras e digitos). Espelho exacto de
 * `public.hr_cargo_nome_chave` (20261210160000); a paridade com o SQL esta em
 * `cargosNomeMigration.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  ACENTOS_DE,
  ACENTOS_PARA,
  chaveDoNomeDoCargo,
  cargoComMesmoNome,
  normalizarNomeDoCargo,
} from "@/lib/hr/cargosNome";
import { CASOS_CHAVE } from "./cargosNomeCasos";

describe("chaveDoNomeDoCargo", () => {
  it.each(CASOS_CHAVE.map(([nome, chave]) => [nome, chave]))("%j -> %j", (nome, chave) => {
    expect(chaveDoNomeDoCargo(nome)).toBe(chave);
  });

  it("os quatro nomes do problema colidem", () => {
    const chaves = new Set(
      ["Administrativo(a)", "administrativo(a)", "Administrativo(a) ", "Administrativo (a)"].map(
        chaveDoNomeDoCargo,
      ),
    );
    expect(chaves.size).toBe(1);
  });

  it("Tecnico(a), tecnico a e Tecnico (a) com acento colidem", () => {
    const chaves = new Set(["Tecnico(a)", "tecnico a", "Técnico (a)"].map(chaveDoNomeDoCargo));
    expect(chaves.size).toBe(1);
  });

  it("nomes diferentes nao colidem", () => {
    expect(chaveDoNomeDoCargo("Gestor 2")).not.toBe(chaveDoNomeDoCargo("Gestor 3"));
    expect(chaveDoNomeDoCargo("Comercial")).not.toBe(chaveDoNomeDoCargo("Comerciais"));
  });

  it("entradas que nao sao texto dao chave vazia (a SQL e STRICT)", () => {
    expect(chaveDoNomeDoCargo(null as unknown as string)).toBe("");
    expect(chaveDoNomeDoCargo(undefined as unknown as string)).toBe("");
  });

  it("emojis e simbolos nao contam; as letras que ficam sim", () => {
    expect(chaveDoNomeDoCargo("Chef \u{1F468}‍\u{1F373}")).toBe("chef");
  });

  it("a tabela de acentos tem origem e destino do mesmo tamanho, sem repeticoes na origem", () => {
    expect([...ACENTOS_DE]).toHaveLength([...ACENTOS_PARA].length);
    expect(new Set([...ACENTOS_DE]).size).toBe([...ACENTOS_DE].length);
    expect(ACENTOS_PARA).toMatch(/^[a-z]+$/);
  });
});

describe("normalizarNomeDoCargo", () => {
  it("tira os espacos das pontas e colapsa os do meio", () => {
    expect(normalizarNomeDoCargo("  Administrativo   (a)  ")).toBe("Administrativo (a)");
    expect(normalizarNomeDoCargo("Gestor\t\nde  Loja")).toBe("Gestor de Loja");
  });

  it("mantem maiusculas e acentos", () => {
    expect(normalizarNomeDoCargo("Técnico(a)")).toBe("Técnico(a)");
  });
});

describe("cargoComMesmoNome", () => {
  const cargos = [
    { id: "1", nome: "Administrativo(a)", activo: true },
    { id: "2", nome: "Antigo", activo: false },
  ];

  it("acha pelo nome exacto, por minusculas, por espaco e por acentos", () => {
    for (const nome of ["Administrativo(a)", "administrativo(a)", "Administrativo(a) ", "Administrativo (a)"]) {
      expect(cargoComMesmoNome(cargos, nome)?.id, nome).toBe("1");
    }
    expect(cargoComMesmoNome(cargos, "Ántigoç")).toBeNull();
    expect(cargoComMesmoNome(cargos, "Ántigo")?.id).toBe("2");
  });

  it("devolve tambem o desactivado", () => {
    expect(cargoComMesmoNome(cargos, "antigo")?.activo).toBe(false);
  });

  it("ignora o proprio cargo na edicao", () => {
    expect(cargoComMesmoNome(cargos, "administrativo (a)", "1")).toBeNull();
    expect(cargoComMesmoNome(cargos, "antigo", "1")?.id).toBe("2");
  });

  it("um nome sem letras nem digitos nunca colide (a base recusa-o a parte)", () => {
    expect(cargoComMesmoNome([{ id: "9", nome: "---", activo: true }], "(  )")).toBeNull();
    expect(cargoComMesmoNome(cargos, "")).toBeNull();
  });
});
