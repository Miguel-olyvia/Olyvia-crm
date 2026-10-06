/**
 * Quem pode ABRIR cada tipo de anexo da admissao na ficha. E so a decisao do
 * ecra (mostrar o botao ou o texto "sem permissao"): a decisao que conta e a
 * de `hr-anexo-url`, no servidor, que repete esta matriz contra a organizacao
 * da linha e audita o cartao e o comprovativo.
 */
import { describe, expect, it } from "vitest";
import {
  iniciaisDoNome,
  podeAbrirAnexo,
  podeVerTodosOsTiposDeAnexo,
  type PermissoesAnexos,
} from "../anexosAdmissao";

const NENHUMA: PermissoesAnexos = {
  pessoasView: false,
  viewOwn: false,
  identificacaoReveal: false,
  bancariosEdit: false,
};

describe("podeAbrirAnexo", () => {
  it("fotografia: hr.pessoas.view abre; as outras permissoes nao", () => {
    expect(podeAbrirAnexo("fotografia", { ...NENHUMA, pessoasView: true }, false)).toBe(true);
    expect(podeAbrirAnexo("fotografia", { ...NENHUMA, identificacaoReveal: true, bancariosEdit: true }, false)).toBe(false);
  });

  it("cartao de cidadao: so identificacao.reveal (ver a ficha nao chega)", () => {
    expect(podeAbrirAnexo("cartao_cidadao", { ...NENHUMA, identificacaoReveal: true }, false)).toBe(true);
    expect(podeAbrirAnexo("cartao_cidadao", { ...NENHUMA, pessoasView: true, bancariosEdit: true }, false)).toBe(false);
  });

  it("comprovativo de IBAN: so bancarios.edit (ver a ficha nao chega)", () => {
    expect(podeAbrirAnexo("comprovativo_iban", { ...NENHUMA, bancariosEdit: true }, false)).toBe(true);
    expect(podeAbrirAnexo("comprovativo_iban", { ...NENHUMA, pessoasView: true, identificacaoReveal: true }, false)).toBe(false);
  });

  it("a propria pessoa abre os tres com hr.pessoas.view.own, sem mais permissoes", () => {
    for (const tipo of ["fotografia", "cartao_cidadao", "comprovativo_iban"] as const) {
      expect(podeAbrirAnexo(tipo, { ...NENHUMA, viewOwn: true }, true)).toBe(true);
    }
  });

  it("ser a propria pessoa SEM hr.pessoas.view.own nao chega (o servidor, decidirAcessoAnexo, exige as duas)", () => {
    for (const tipo of ["fotografia", "cartao_cidadao", "comprovativo_iban"] as const) {
      expect(podeAbrirAnexo(tipo, NENHUMA, true)).toBe(false);
    }
  });

  it("hr.pessoas.view.own numa ficha que NAO e a propria nao abre nada", () => {
    for (const tipo of ["fotografia", "cartao_cidadao", "comprovativo_iban"] as const) {
      expect(podeAbrirAnexo(tipo, { ...NENHUMA, viewOwn: true }, false)).toBe(false);
    }
  });

  it("sem permissao nem ser a propria pessoa, nao abre nenhum", () => {
    for (const tipo of ["fotografia", "cartao_cidadao", "comprovativo_iban"] as const) {
      expect(podeAbrirAnexo(tipo, NENHUMA, false)).toBe(false);
    }
  });

  it("um tipo desconhecido nunca abre (nem para a propria pessoa)", () => {
    expect(
      podeAbrirAnexo(
        "passaporte" as never,
        { pessoasView: true, viewOwn: true, identificacaoReveal: true, bancariosEdit: true },
        true,
      ),
    ).toBe(false);
  });
});

describe("podeVerTodosOsTiposDeAnexo", () => {
  it("a base entrega cada tipo a quem tem a permissao dele: so quem tem as tres ve tudo", () => {
    expect(podeVerTodosOsTiposDeAnexo(NENHUMA, false)).toBe(false);
    expect(podeVerTodosOsTiposDeAnexo({ ...NENHUMA, pessoasView: true }, false)).toBe(false);
    expect(
      podeVerTodosOsTiposDeAnexo({ ...NENHUMA, pessoasView: true, identificacaoReveal: true }, false),
    ).toBe(false);
    expect(
      podeVerTodosOsTiposDeAnexo(
        { ...NENHUMA, pessoasView: true, identificacaoReveal: true, bancariosEdit: true },
        false,
      ),
    ).toBe(true);
  });

  it("a propria pessoa ve tudo, mas so com hr.pessoas.view.own", () => {
    expect(podeVerTodosOsTiposDeAnexo({ ...NENHUMA, viewOwn: true }, true)).toBe(true);
    expect(podeVerTodosOsTiposDeAnexo(NENHUMA, true)).toBe(false);
    expect(podeVerTodosOsTiposDeAnexo({ ...NENHUMA, viewOwn: true }, false)).toBe(false);
  });
});

describe("iniciaisDoNome", () => {
  it("primeira e ultima palavra, em maiusculas", () => {
    expect(iniciaisDoNome("Joana Maria Pires")).toBe("JP");
    expect(iniciaisDoNome("ana silva")).toBe("AS");
  });

  it("uma so palavra da uma so letra", () => {
    expect(iniciaisDoNome("Madonna")).toBe("M");
  });

  it("ignora espacos a mais e nao rebenta com vazio ou nulo", () => {
    expect(iniciaisDoNome("  Rui   Costa  ")).toBe("RC");
    expect(iniciaisDoNome("")).toBe("");
    expect(iniciaisDoNome(null)).toBe("");
    expect(iniciaisDoNome(undefined)).toBe("");
  });

  it("funciona com acentos e emojis sem partir caracteres", () => {
    expect(iniciaisDoNome("Álvaro Ünal")).toBe("ÁÜ");
    expect(iniciaisDoNome("😀 Rui")).toBe("😀R");
  });
});
