/**
 * @vitest-environment node
 *
 * Regras puras dos anexos do convite: fronteiras exactas de tamanho, tipo REAL
 * do ficheiro e nome seguro.
 */
import { describe, expect, it } from "vitest";
import {
  LIMITES,
  MIME_POR_ASSINATURA,
  TIPOS_ANEXO,
  eTipoAnexo,
  extensaoDoMime,
  sanitizarNomeOriginal,
  tamanhoMaximo,
  validarFicheiroReal,
  validarPedidoAnexo,
} from "./anexos.ts";

describe("constantes (iguais as das RPCs)", () => {
  it("tectos de numero e de tamanho", () => {
    expect(LIMITES.maxActivos).toBe(4);
    expect(LIMITES.porTipo).toEqual({ cartao_cidadao: 2, comprovativo_iban: 1, fotografia: 1 });
    expect(LIMITES.tamanhoMaxBytes).toBe(10485760);
    expect(LIMITES.fotografiaMaxBytes).toBe(5242880);
    expect(LIMITES.maxReservas).toBe(12);
  });

  it("tres tipos e tres formatos reais, sem gif nem webp", () => {
    expect([...TIPOS_ANEXO]).toEqual(["cartao_cidadao", "comprovativo_iban", "fotografia"]);
    expect(Object.keys(MIME_POR_ASSINATURA).sort()).toEqual(["jpeg", "pdf", "png"]);
    expect(eTipoAnexo("fotografia")).toBe(true);
    expect(eTipoAnexo("outro")).toBe(false);
    expect(eTipoAnexo(null)).toBe(false);
    expect(tamanhoMaximo("fotografia")).toBe(5242880);
    expect(tamanhoMaximo("cartao_cidadao")).toBe(10485760);
  });
});

describe("validarPedidoAnexo", () => {
  const ok = { tipo: "cartao_cidadao", tamanho: 1000, mime: "application/pdf" };

  it("aceita um pedido valido de cada tipo", () => {
    expect(validarPedidoAnexo(ok)).toBeNull();
    expect(validarPedidoAnexo({ tipo: "comprovativo_iban", tamanho: 1, mime: "image/png" })).toBeNull();
    expect(validarPedidoAnexo({ tipo: "fotografia", tamanho: 1000, mime: "image/jpeg" })).toBeNull();
  });

  it("tipo invalido ou ausente", () => {
    expect(validarPedidoAnexo({ ...ok, tipo: "passaporte" })).toBe("anexo_tipo_invalido");
    expect(validarPedidoAnexo({ ...ok, tipo: undefined })).toBe("anexo_tipo_invalido");
    expect(validarPedidoAnexo({ ...ok, tipo: 3 })).toBe("anexo_tipo_invalido");
  });

  it("formato declarado fora de pdf, png e jpeg", () => {
    for (const mime of ["image/gif", "image/webp", "application/zip", "text/plain", "", null, undefined, 7]) {
      expect(validarPedidoAnexo({ ...ok, mime })).toBe("anexo_formato_invalido");
    }
  });

  it("aceita o mime em maiusculas e com espacos", () => {
    expect(validarPedidoAnexo({ ...ok, mime: " Application/PDF " })).toBeNull();
  });

  it("fotografia que nao seja png ou jpeg", () => {
    expect(validarPedidoAnexo({ tipo: "fotografia", tamanho: 10, mime: "application/pdf" })).toBe(
      "anexo_fotografia_formato",
    );
    // fora dos tres formatos continua a ser formato invalido
    expect(validarPedidoAnexo({ tipo: "fotografia", tamanho: 10, mime: "image/gif" })).toBe(
      "anexo_formato_invalido",
    );
  });

  it("tamanho zero, negativo, nao numerico ou nao finito e vazio", () => {
    for (const tamanho of [0, -1, -10485760, NaN, Infinity, "10", null, undefined]) {
      expect(validarPedidoAnexo({ ...ok, tamanho })).toBe("anexo_vazio");
    }
  });

  it("fronteira de 10 MB: 10485760 passa, 10485761 nao", () => {
    expect(validarPedidoAnexo({ ...ok, tamanho: 10485760 })).toBeNull();
    expect(validarPedidoAnexo({ ...ok, tamanho: 10485761 })).toBe("anexo_demasiado_grande");
  });

  it("fronteira de 5 MB da fotografia: 5242880 passa, 5242881 nao", () => {
    const foto = { tipo: "fotografia", mime: "image/png" };
    expect(validarPedidoAnexo({ ...foto, tamanho: 5242880 })).toBeNull();
    expect(validarPedidoAnexo({ ...foto, tamanho: 5242881 })).toBe("anexo_fotografia_demasiado_grande");
  });

  it("a ordem das recusas e a da base: formato antes de vazio antes de tamanho", () => {
    expect(validarPedidoAnexo({ tipo: "cartao_cidadao", tamanho: 0, mime: "image/gif" })).toBe(
      "anexo_formato_invalido",
    );
    expect(validarPedidoAnexo({ tipo: "fotografia", tamanho: 99999999, mime: "application/pdf" })).toBe(
      "anexo_fotografia_formato",
    );
  });
});

describe("validarFicheiroReal", () => {
  it("aceita pdf, png e jpeg dentro do tamanho", () => {
    for (const assinatura of ["pdf", "png", "jpeg"]) {
      expect(validarFicheiroReal({ tipo: "cartao_cidadao", assinatura, tamanho: 1234 })).toBeNull();
    }
    expect(validarFicheiroReal({ tipo: "fotografia", assinatura: "jpeg", tamanho: 1234 })).toBeNull();
  });

  it("gif, webp, zip, office e desconhecido sao recusados", () => {
    for (const assinatura of ["gif", "webp", "zip-office", "ole2-office", "mp4", null]) {
      expect(validarFicheiroReal({ tipo: "cartao_cidadao", assinatura, tamanho: 100 })).toBe(
        "anexo_formato_invalido",
      );
    }
  });

  it("fotografia em pdf e recusada com o seu codigo", () => {
    expect(validarFicheiroReal({ tipo: "fotografia", assinatura: "pdf", tamanho: 100 })).toBe(
      "anexo_fotografia_formato",
    );
  });

  it("tamanho real: vazio e fronteiras", () => {
    expect(validarFicheiroReal({ tipo: "comprovativo_iban", assinatura: "pdf", tamanho: 0 })).toBe("anexo_vazio");
    expect(validarFicheiroReal({ tipo: "comprovativo_iban", assinatura: "pdf", tamanho: -5 })).toBe("anexo_vazio");
    expect(validarFicheiroReal({ tipo: "comprovativo_iban", assinatura: "pdf", tamanho: 10485760 })).toBeNull();
    expect(validarFicheiroReal({ tipo: "comprovativo_iban", assinatura: "pdf", tamanho: 10485761 })).toBe(
      "anexo_demasiado_grande",
    );
    expect(validarFicheiroReal({ tipo: "fotografia", assinatura: "png", tamanho: 5242880 })).toBeNull();
    expect(validarFicheiroReal({ tipo: "fotografia", assinatura: "png", tamanho: 5242881 })).toBe(
      "anexo_fotografia_demasiado_grande",
    );
  });
});

describe("extensaoDoMime", () => {
  it("pdf, png e jpg; o resto e null", () => {
    expect(extensaoDoMime("application/pdf")).toBe("pdf");
    expect(extensaoDoMime("image/png")).toBe("png");
    expect(extensaoDoMime("image/jpeg")).toBe("jpg");
    expect(extensaoDoMime("image/gif")).toBeNull();
    expect(extensaoDoMime("")).toBeNull();
  });
});

describe("sanitizarNomeOriginal", () => {
  it("deixa um nome normal intacto, com acentos e espacos", () => {
    expect(sanitizarNomeOriginal("Cartão de cidadão (frente).pdf")).toBe("Cartão de cidadão (frente).pdf");
  });

  it("fica so com o nome base: sem barras directas nem invertidas", () => {
    expect(sanitizarNomeOriginal("../../etc/passwd")).toBe("passwd");
    expect(sanitizarNomeOriginal("C:\\Users\\ana\\cc.pdf")).toBe("cc.pdf");
    expect(sanitizarNomeOriginal("a/b\\c/d.png")).toBe("d.png");
  });

  it("tira caracteres de controlo", () => {
    expect(sanitizarNomeOriginal("a\u0000b\u0007c\nd\re\tf.pdf")).toBe("abcdef.pdf");
    expect(sanitizarNomeOriginal("x\u007fy\u0085z\u2028w.png")).toBe("xyzw.png");
  });

  it("tira os controlos bidireccionais e de largura zero (nome que se disfarca de outra extensao)", () => {
    // U+202E (RLO) inverte a leitura: "fdp.exe" apareceria como "exe.pdf"
    expect(sanitizarNomeOriginal("cc\u202Efdp.exe")).toBe("ccfdp.exe");
    expect(sanitizarNomeOriginal("a\u202Ab\u202Bc\u202Cd\u202De.pdf")).toBe("abcde.pdf");
    expect(sanitizarNomeOriginal("a\u2066b\u2067c\u2068d\u2069e.pdf")).toBe("abcde.pdf");
    expect(sanitizarNomeOriginal("a\u200Bb\u200Cc\u200Dd\uFEFFe.pdf")).toBe("abcde.pdf");
    expect(sanitizarNomeOriginal("\u202E\u200B\uFEFF")).toBe("ficheiro");
  });

  it("corta aos 200 caracteres", () => {
    const longo = `${"a".repeat(300)}.pdf`;
    const r = sanitizarNomeOriginal(longo);
    expect(Array.from(r)).toHaveLength(200);
    expect(r).toBe("a".repeat(200));
  });

  it("nao parte um par substituto (emoji) ao cortar", () => {
    const r = sanitizarNomeOriginal("😀".repeat(250));
    expect(Array.from(r)).toHaveLength(200);
    expect(r).toBe("😀".repeat(200));
  });

  it("vazio, so espacos, so pontos ou nao-texto viram 'ficheiro'", () => {
    for (const v of ["", "   ", ".", "..", "...", "/", "a/", "\u0000\u0001", null, undefined, 42, {}]) {
      expect(sanitizarNomeOriginal(v)).toBe("ficheiro");
    }
  });
});
