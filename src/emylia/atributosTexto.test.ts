// 13/11: os atributos do produto (Medida, Cor, Tonalidade…): as contas e os textos puros (atributosProduto.ts).
import { describe, expect, it } from "vitest";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";
import { dimensaoParaTexto, errosDimensao, hexValido, lerDimensao, mesmosAtributos, normalizarHex, resumoAtributos, textoMedida, textoPesquisaAtributos, valoresParaGravar } from "./atributosTexto";
import { pesquisarProdutos } from "./fichaServico";

const A_COR = "aaaaaaaa-0000-4000-a000-000000000001", A_MED = "aaaaaaaa-0000-4000-a000-000000000002", A_BRI = "aaaaaaaa-0000-4000-a000-000000000003";
const O_PRETO = "bbbbbbbb-0000-4000-a000-000000000001", O_FOSCO = "bbbbbbbb-0000-4000-a000-000000000002";
const DEFS: AtributoDef[] = [
  { id: A_MED, codigo: "medida", nome: "Medida", tipo: "medida", temHex: false, ordem: 1, opcoes: [] },
  { id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", temHex: true, ordem: 2, opcoes: [{ id: O_PRETO, valor: "Preto", nome: "Preto", hex: "#000000", ordem: 1 }] },
  { id: A_BRI, codigo: "brilho", nome: "Brilho", tipo: "lista", temHex: false, ordem: 3, opcoes: [{ id: O_FOSCO, valor: "FOSCO", nome: "Fosco", hex: null, ordem: 1 }] },
];
const MED = { tipo: "2D", largura: 60, comprimento: 60, espessura: null, unidade: "cm" } as const;

describe("hex", () => {
  it("só #RRGGBB conta; sem o # acrescenta-se", () => {
    expect(hexValido("#1a2B3c")).toBe(true);
    for (const x of ["", "#12345", "#1234567", "#GGGGGG", "azul", "123456"]) expect(hexValido(x)).toBe(false);
    expect(normalizarHex(" 1a2b3c ")).toBe("#1A2B3C");
    expect(normalizarHex("#abcdef")).toBe("#ABCDEF");
    expect(normalizarHex("xyz")).toBeNull();
    expect(normalizarHex("")).toBeNull();
  });
});

describe("textoMedida", () => {
  it("2D e 3D, com a unidade e a vírgula portuguesa", () => {
    expect(textoMedida(MED)).toBe("60×60 cm");
    expect(textoMedida({ tipo: "3D", largura: 12.5, comprimento: 25, espessura: 0.8, unidade: "mm" })).toBe("12,5×25×0,8 mm");
  });
  it("com intervalo: «91–100 × 90 cm» (traço «–» e espaços à volta do ×)", () => {
    expect(textoMedida({ ...MED, largura: { de: 91, ate: 100 }, comprimento: 90 })).toBe("91–100 × 90 cm");
    expect(textoMedida({ tipo: "3D", largura: { de: 12.5, ate: 13 }, comprimento: 25, espessura: { de: 0.8, ate: 1.2 }, unidade: "mm" })).toBe("12,5–13 × 25 × 0,8–1,2 mm");
    expect(textoMedida({ ...MED, comprimento: { de: 50, ate: 60 } })).toBe("60 × 50–60 cm");
  });
});

describe("lerDimensao (a validação igual à da base)", () => {
  const num = (a: string) => ({ iv: false, a, b: "" });
  const iv = (a: string, b: string) => ({ iv: true, a, b });
  it("número: aceita vírgula e ponto; vazio é incompleto, sem erro", () => {
    expect(lerDimensao(num("12,5"))).toEqual({ v: 12.5, erro: null });
    expect(lerDimensao(num(" 60 "))).toEqual({ v: 60, erro: null });
    expect(lerDimensao(num(""))).toEqual({ v: null, erro: null });
  });
  it("número: zero, negativo, texto, mais de 100000 e mais de 3 casas dão erro", () => {
    for (const x of ["0", "-5", "abc", "1,2,3"]) expect(lerDimensao(num(x))).toEqual({ v: null, erro: "Escreva um número maior que 0." });
    expect(lerDimensao(num("100001")).erro).toBe("O máximo é 100000.");
    expect(lerDimensao(num("100000")).v).toBe(100000);
    expect(lerDimensao(num("1,2345")).erro).toBe("No máximo 3 casas decimais.");
    expect(lerDimensao(num("1,234")).v).toBe(1.234);
  });
  it("intervalo: de < até dá {de, ate}", () => {
    expect(lerDimensao(iv("91", "100"))).toEqual({ v: { de: 91, ate: 100 }, erro: null });
    expect(lerDimensao(iv("0,5", "0,501")).v).toEqual({ de: 0.5, ate: 0.501 });
  });
  it("intervalo: de igual ou maior que até dá erro; um dos lados por preencher é incompleto, sem erro", () => {
    expect(lerDimensao(iv("100", "91"))).toEqual({ v: null, erro: "O «de» tem de ser menor que o «até»." });
    expect(lerDimensao(iv("90", "90")).erro).toBe("O «de» tem de ser menor que o «até».");
    expect(lerDimensao(iv("90", ""))).toEqual({ v: null, erro: null });
    expect(lerDimensao(iv("", "90"))).toEqual({ v: null, erro: null });
  });
  it("intervalo: cada lado é validado como um número", () => {
    expect(lerDimensao(iv("0", "5")).erro).toBe("Escreva um número maior que 0.");
    expect(lerDimensao(iv("5", "100001")).erro).toBe("O máximo é 100000.");
  });
});

describe("a escrita a meio não é erro", () => {
  it("«12,», «12.», «-» e «,» são incompletos, sem erro (em número e nos dois lados do intervalo)", () => {
    for (const x of ["12,", "12.", "-", ",", "."]) {
      expect(lerDimensao({ iv: false, a: x, b: "" })).toEqual({ v: null, erro: null });
      expect(lerDimensao({ iv: true, a: x, b: "30" })).toEqual({ v: null, erro: null });
      expect(lerDimensao({ iv: true, a: "10", b: x })).toEqual({ v: null, erro: null });
      expect(errosDimensao({ iv: true, a: x, b: x })).toEqual({ a: null, b: null });
    }
  });
  it("o que já era erro continua a ser (negativo completo, texto, vários separadores)", () => {
    for (const x of ["-5", "abc", "1,2,3", "0"]) expect(errosDimensao({ iv: false, a: x, b: "" }).a).not.toBeNull();
  });
});

describe("errosDimensao (o erro de cada campo)", () => {
  it("o erro do «de» só marca o «de»; o do «até» só o «até»", () => {
    expect(errosDimensao({ iv: true, a: "0", b: "5" })).toEqual({ a: "Escreva um número maior que 0.", b: null });
    expect(errosDimensao({ iv: true, a: "5", b: "100001" })).toEqual({ a: null, b: "O máximo é 100000." });
  });
  it("«de» igual ou maior que «até»: o erro fica no «até»", () => {
    expect(errosDimensao({ iv: true, a: "100", b: "91" })).toEqual({ a: null, b: "O «de» tem de ser menor que o «até»." });
  });
  it("em modo número só há o campo único", () => {
    expect(errosDimensao({ iv: false, a: "0", b: "zzz" })).toEqual({ a: "Escreva um número maior que 0.", b: null });
  });
});

describe("dimensaoParaTexto", () => {
  it("número → um campo; intervalo → dois; vazio → um campo vazio", () => {
    expect(dimensaoParaTexto(12.5)).toEqual({ iv: false, a: "12,5", b: "" });
    expect(dimensaoParaTexto({ de: 91, ate: 100 })).toEqual({ iv: true, a: "91", b: "100" });
    expect(dimensaoParaTexto(null)).toEqual({ iv: false, a: "", b: "" });
  });
});

describe("resumoAtributos (a linha curta da lista)", () => {
  it("«Nome: valor» por ordem do atributo, separados por ·", () => {
    const attrs: AtributoProduto[] = [{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" }, { atributoId: A_MED, medida: MED }];
    expect(resumoAtributos(attrs, DEFS)).toBe("Medida: 60×60 cm · Cor: Preto");
  });
  it("sem atributos, sem definições, ou com um atributo que já não existe: vazio ou salta-o", () => {
    expect(resumoAtributos(undefined, DEFS)).toBe("");
    expect(resumoAtributos([], DEFS)).toBe("");
    expect(resumoAtributos([{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" }], undefined)).toBe("");
    expect(resumoAtributos([{ atributoId: "outro", opcaoId: "x", valor: "Y" }, { atributoId: A_BRI, opcaoId: O_FOSCO, valor: "Fosco" }], DEFS)).toBe("Brilho: Fosco");
  });
  it("mostra o nome da opção (Fosco), não o texto em maiúsculas que a base guarda (FOSCO); sem opção resolvida mostra o texto", () => {
    expect(resumoAtributos([{ atributoId: A_BRI, opcaoId: O_FOSCO, valor: "FOSCO" }], DEFS)).toBe("Brilho: Fosco");
    expect(resumoAtributos([{ atributoId: A_BRI, valor: "ACETINADO" }], DEFS)).toBe("Brilho: ACETINADO");
  });
  it("a opção que a base já não manda mostra o texto que veio com o produto", () => {
    expect(resumoAtributos([{ atributoId: A_COR, opcaoId: "apagada", valor: "Azul" }], DEFS)).toBe("Cor: Azul");
  });
});

describe("valoresParaGravar (o que a base recebe)", () => {
  it("lista → {atributo, opcao}; medida → {atributo, medida}", () => {
    expect(valoresParaGravar([{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" }, { atributoId: A_MED, medida: MED }])).toEqual([
      { atributo: A_COR, opcao: O_PRETO }, { atributo: A_MED, medida: MED },
    ]);
  });
  it("um atributo sem opção nem medida não vai", () => {
    expect(valoresParaGravar([{ atributoId: A_COR }])).toEqual([]);
  });
});

describe("mesmosAtributos", () => {
  it("compara pelo atributo e pelo valor, sem contar a ordem nem o texto", () => {
    const a: AtributoProduto[] = [{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" }, { atributoId: A_MED, medida: MED }];
    const b: AtributoProduto[] = [{ atributoId: A_MED, medida: { ...MED } }, { atributoId: A_COR, opcaoId: O_PRETO }];
    expect(mesmosAtributos(a, b)).toBe(true);
    expect(mesmosAtributos(a, [a[0]])).toBe(false);
    expect(mesmosAtributos([a[0]], [{ atributoId: A_COR, opcaoId: O_FOSCO }])).toBe(false);
    expect(mesmosAtributos(a, [a[0], { atributoId: A_MED, medida: { ...MED, largura: 30 } }])).toBe(false);
    expect(mesmosAtributos(undefined, [])).toBe(true);
  });
  it("com intervalo: a ordem das chaves não conta; outro intervalo ou número no lugar dele conta", () => {
    const iv = (d: unknown): AtributoProduto[] => [{ atributoId: A_MED, medida: { ...MED, largura: d as never } }];
    expect(mesmosAtributos(iv({ de: 91, ate: 100 }), iv({ ate: 100, de: 91 }))).toBe(true);
    expect(mesmosAtributos(iv({ de: 91, ate: 100 }), iv({ de: 91, ate: 101 }))).toBe(false);
    expect(mesmosAtributos(iv({ de: 91, ate: 100 }), iv(91))).toBe(false);
  });
  it("valoresParaGravar leva o intervalo tal como está", () => {
    const m = { ...MED, largura: { de: 91, ate: 100 } };
    expect(valoresParaGravar([{ atributoId: A_MED, medida: m }])).toEqual([{ atributo: A_MED, medida: m }]);
  });
});

describe("a pesquisa de produtos acha pelos atributos", () => {
  const base = { custo: 1, un: "un", marca: "", fornecedor: "", data: "", no: null };
  const L = [
    { ...base, id: "1", n: "Mosaico", attrs: [{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" }, { atributoId: A_MED, medida: MED }] },
    { ...base, id: "2", n: "Lavatório" },
  ];
  it("pelo valor da opção e pela medida, sem acentos nem maiúsculas", () => {
    expect(textoPesquisaAtributos(L[0])).toContain("Preto");
    expect(textoPesquisaAtributos(L[1])).toBe("");
    expect(pesquisarProdutos(L, "preto").map((p) => p.id)).toEqual(["1"]);
    expect(pesquisarProdutos(L, "60×60").map((p) => p.id)).toEqual(["1"]);
    expect(pesquisarProdutos(L, "lavat").map((p) => p.id)).toEqual(["2"]);
  });
});
