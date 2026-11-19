// Rótulos do catálogo que seguem o idioma do portal. Em português ficam EXATAMENTE como as listas de sempre
// (listasArtigo.ts, servicoCatalogo.ts): este teste é o que impede os dois lados de se afastarem.
import { describe, expect, it } from "vitest";
import { CORES, UNIDADES } from "../listasArtigo";
import { UNIDADES_SERVICO, unidadeServicoLabel } from "../servicoCatalogo";
import { CatalogImageError } from "../catalogImages";
import { resolverMensagem } from "@/portal-i18n/mensagem";
import {
  CHAVE_COR,
  CHAVE_ERRO_FOTO,
  corCanonicaPortal,
  juntarMensagens,
  mensagemErroFoto,
  opcoesDeCor,
  opcoesDeUnidade,
  rotuloUnidadeArtigo,
  rotuloUnidadeServico,
  validarFotoCatalogo,
} from "../textosCatalogo";
import { dicionarios } from "@/portal-i18n/dicionarios";

describe("unidades", () => {
  it("em português, os rótulos de artigo são os da lista de sempre", () => {
    expect(opcoesDeUnidade(false, "pt").map((o) => [o.value, o.label])).toEqual(UNIDADES.map(([v, r]) => [v, r]));
  });

  it("em português, os rótulos de serviço são os da lista de sempre", () => {
    expect(opcoesDeUnidade(true, "pt").map((o) => [o.value, o.label])).toEqual(UNIDADES_SERVICO.map(([v, r]) => [v, r]));
    expect(rotuloUnidadeServico("vg", "pt")).toBe(unidadeServicoLabel("vg"));
  });

  it("em inglês muda o rótulo e nunca o código que se grava", () => {
    const en = opcoesDeUnidade(false, "en");
    expect(en.map((o) => o.value)).toEqual(UNIDADES.map(([v]) => v));
    expect(en.find((o) => o.value === "cx")?.label).toBe("cx (box)");
    expect(opcoesDeUnidade(true, "en").find((o) => o.value === "m²")?.label).toBe("m² (square metre)");
    expect(rotuloUnidadeServico("vg", "en")).toBe("lump sum (fixed price)");
  });

  it("códigos desconhecidos voltam como vêm; sem código de serviço, «—»", () => {
    expect(rotuloUnidadeArtigo("xpto", "en")).toBe("xpto");
    expect(rotuloUnidadeServico("xpto", "en")).toBe("xpto");
    expect(rotuloUnidadeServico(null, "en")).toBe("—");
    expect(rotuloUnidadeServico(undefined, "pt")).toBe("—");
  });

  it("todas as unidades das listas têm rótulo nos dois idiomas", () => {
    for (const idioma of ["pt", "en"] as const) {
      for (const o of opcoesDeUnidade(false, idioma)) expect(o.label).not.toMatch(/^sp\./);
      for (const o of opcoesDeUnidade(true, idioma)) expect(o.label).not.toMatch(/^sp\./);
    }
  });
});

describe("cores", () => {
  it("em português, os nomes são os da lista; todas têm chave nos dois dicionários", () => {
    expect(opcoesDeCor("pt").map((o) => o.label)).toEqual([...CORES]);
    for (const cor of CORES) {
      expect(CHAVE_COR[cor]).toBeTruthy();
      expect(dicionarios.en[CHAVE_COR[cor]]).toBeTruthy();
    }
  });

  it("em inglês o valor continua em português (é o que se grava e o que dá o código do SKU)", () => {
    const branco = opcoesDeCor("en").find((o) => o.value === "Branco");
    expect(branco).toEqual({ value: "Branco", label: "White" });
  });

  it("corCanonicaPortal: o nome inglês de uma cor da lista passa ao português; o resto como corCanonica", () => {
    expect(corCanonicaPortal("white", "en")).toBe("Branco");
    expect(corCanonicaPortal("  NATURAL   wood ", "en")).toBe("Madeira natural");
    expect(corCanonicaPortal("preto", "en")).toBe("Preto");
    expect(corCanonicaPortal("PRETO", "pt")).toBe("Preto");
    expect(corCanonicaPortal("white", "pt")).toBe("White");
    expect(corCanonicaPortal("", "en")).toBe("");
    expect(corCanonicaPortal("turquesa", "en")).toBe("Turquesa");
  });
});

describe("erros das fotos", () => {
  it("o texto fixo da biblioteca traduz-se; o que a Edge escreve fica como vem", () => {
    const fixo = new CatalogImageError("file_too_large", "A foto tem de ter até 5 MB.", 413);
    expect(resolverMensagem(mensagemErroFoto(fixo), "pt")).toBe("A foto tem de ter até 5 MB.");
    expect(resolverMensagem(mensagemErroFoto(fixo), "en")).toBe("The photo must be up to 5 MB.");
    const daEdge = new CatalogImageError("file_too_large", "Texto da Edge", 413);
    expect(resolverMensagem(mensagemErroFoto(daEdge), "en")).toBe("Texto da Edge");
  });

  it("sem mensagem, usa a fixa; erro desconhecido ou sem texto dá a frase genérica", () => {
    expect(resolverMensagem(mensagemErroFoto(new CatalogImageError("not_found", "", 404)), "en")).toBe(
      "The item does not exist or is no longer available.",
    );
    expect(resolverMensagem(mensagemErroFoto(new Error("falhou")), "en")).toBe("falhou");
    expect(resolverMensagem(mensagemErroFoto(null), "pt")).toBe("Não foi possível concluir a ação.");
    expect(resolverMensagem(mensagemErroFoto(null), "en")).toBe("The action could not be completed.");
  });

  it("o limite leva o número nos dois idiomas", () => {
    const limite = new CatalogImageError("limit", "Cada artigo pode ter no máximo 4 fotos.", 409);
    expect(resolverMensagem(mensagemErroFoto(limite), "en")).toBe("Each item can have at most 4 photos.");
  });

  it("todos os códigos têm texto nos dois idiomas", () => {
    for (const chave of Object.values(CHAVE_ERRO_FOTO)) {
      expect(dicionarios.pt[chave]).toBeTruthy();
      expect(dicionarios.en[chave]).toBeTruthy();
    }
  });
});

describe("validarFotoCatalogo (as mesmas regras de sempre)", () => {
  const ficheiro = (type: string, size: number) => ({ name: "f", type, size }) as unknown as File;
  it("limite, tipo, vazio e tamanho", () => {
    expect(resolverMensagem(validarFotoCatalogo(ficheiro("image/jpeg", 10), 4)!, "pt")).toBe("Cada artigo pode ter no máximo 4 fotos.");
    expect(resolverMensagem(validarFotoCatalogo(ficheiro("application/pdf", 10), 0)!, "pt")).toMatch(/Só se aceitam fotos em JPEG, PNG ou WEBP/);
    expect(resolverMensagem(validarFotoCatalogo(ficheiro("image/png", 0), 0)!, "en")).toBe("The file is empty.");
    expect(resolverMensagem(validarFotoCatalogo(ficheiro("image/webp", 6 * 1024 * 1024), 0)!, "en")).toBe("The photo must be up to 5 MB.");
    expect(validarFotoCatalogo(ficheiro("image/jpeg", 1000), 3)).toBeNull();
  });
});

describe("juntarMensagens", () => {
  it("junta no idioma de quando se mostra", () => {
    const m = juntarMensagens([
      { chave: "sp.catalogo.foto.erro.empty_file" },
      { texto: "do servidor" },
      { de: (idioma) => `no ${idioma}` },
    ]);
    expect(resolverMensagem(m, "pt")).toBe("O ficheiro está vazio. do servidor no pt");
    expect(resolverMensagem(m, "en")).toBe("The file is empty. do servidor no en");
  });
});
