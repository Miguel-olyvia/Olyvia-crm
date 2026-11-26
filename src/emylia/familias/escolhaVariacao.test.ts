// A lógica pura da vista da família: que produto corresponde à escolha, que valores existem (só os que existem, nunca uma combinação inventada), a passagem ao
// produto existente mais próximo com o aviso, manter a cor ao mudar de medida, o endereço e a apresentação dos nomes. Regra do dono: «se só existem 3, só metes 3».
import { describe, expect, it } from "vitest";
import { catalogoFamiliaVerTranslations } from "@/translations/catalogoFamiliaVer";
import {
  eixosEscolhiveis, escolhaDoProduto, escolhaInicial, escolhaPorOmissao, escolherValor, fraseDoAviso, nomeParaMostrar, opcoesDoEixo,
  parametrosDaEscolha, pedidoDosParametros, produtoDaEscolha, tipoDoEixo,
} from "./escolhaVariacao";
import { A_COR, A_MED, A_TEX, A_TON, BRANCO, BRILHO, CINZA, EIXO_COR, EIXO_MED, EIXO_TEX, EIXO_TON, MATE, SANITA, eixo, produto, valor } from "./fixturesFamiliaVista";

const { produtos, eixos } = SANITA;
const nomes = (l: readonly { nome: string }[]) => l.map((o) => o.nome);

/** Um `t` de teste com os textos pt reais: o que se testa é a frase que o dono lê. */
const t = (chave: string, vars: Record<string, string | number> = {}) =>
  (catalogoFamiliaVerTranslations.pt[chave] ?? chave).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

describe("opcoesDoEixo: só os valores que existem na família", () => {
  it("Sanita GLAMIC BTW: Cor dá Branco e Cinza, Tonalidade dá Brilho e Mate (Cinza existe, mesmo só em Mate)", () => {
    expect(nomes(opcoesDoEixo(produtos, A_COR))).toEqual(["Branco", "Cinza"]);
    expect(nomes(opcoesDoEixo(produtos, A_TON))).toEqual(["Brilho", "Mate"]);
  });
  it("um valor que nenhum produto tem nunca aparece (lista de 3 produtos: 3 produtos, não 4 combinações)", () => {
    const so = produtos.filter((p) => p.id !== "cm");
    expect(nomes(opcoesDoEixo(so, A_COR))).toEqual(["Branco"]);
  });
  it("sem repetir e pela ordem das opções, depois pelo nome", () => {
    const ps = [produto("1", { [A_COR]: valor("Z", { ordem: 1 }) }), produto("2", { [A_COR]: valor("B") }), produto("3", { [A_COR]: valor("A") }), produto("4", { [A_COR]: valor("Z", { ordem: 1 }) })];
    expect(nomes(opcoesDoEixo(ps, A_COR))).toEqual(["Z", "A", "B"]);
  });
  it("leva a cor, a foto e o nome da opção", () => {
    expect(opcoesDoEixo(produtos, A_COR)[1]).toMatchObject({ valor: "Cinza", nome: "Cinza", hex: "#A3A3A3", foto: null });
  });
});

describe("eixosEscolhiveis e tipoDoEixo", () => {
  it("a medida (constante na família) não é um eixo de escolha; os outros ficam pela posição", () => {
    const ps = [produto("1", { [A_TEX]: valor("Liso"), [A_MED]: valor("70×100 cm") }), produto("2", { [A_TEX]: valor("Pizarra"), [A_MED]: valor("70×100 cm") })];
    expect(eixosEscolhiveis([EIXO_TEX, EIXO_MED, EIXO_COR], ps).map((e) => e.atributoId)).toEqual([A_COR, A_TEX]);
  });
  it("uma medida que varia dentro da família passa a ser escolhível", () => {
    const ps = [produto("1", { [A_MED]: valor("70") }), produto("2", { [A_MED]: valor("80") })];
    expect(eixosEscolhiveis([EIXO_MED], ps)).toHaveLength(1);
  });
  it("bolinhas quando as opções têm cor (hex), botões nos outros, medida pelo is_measurement e não pelo papel", () => {
    expect(tipoDoEixo(EIXO_COR, produtos)).toBe("cor");
    expect(tipoDoEixo(EIXO_TON, produtos)).toBe("botoes");
    expect(tipoDoEixo(EIXO_MED, produtos)).toBe("medida");
    expect(tipoDoEixo({ ...EIXO_TON, papel: "cor" }, produtos)).toBe("botoes");
  });
});

describe("produtoDaEscolha", () => {
  it("devolve o produto real da combinação", () => {
    expect(produtoDaEscolha(produtos, { [A_COR]: "Branco", [A_TON]: "Mate" })?.sku).toBe("LS-S-0003-B-M");
    expect(produtoDaEscolha(produtos, { [A_COR]: "Cinza", [A_TON]: "Mate" })?.sku).toBe("LS-S-0003-C-M");
  });
  it("Cinza Brilho não existe: null (nunca se inventa um produto)", () => {
    expect(produtoDaEscolha(produtos, { [A_COR]: "Cinza", [A_TON]: "Brilho" })).toBeNull();
  });
  it("a escolha do produto devolve os valores dos eixos dele", () => {
    expect(escolhaDoProduto(produtos[2]!, eixos)).toEqual({ [A_COR]: "Cinza", [A_TON]: "Mate" });
  });
});

describe("escolhaPorOmissao", () => {
  it("o primeiro valor de cada eixo, quando essa combinação existe", () => {
    expect(escolhaPorOmissao(produtos, eixos)).toEqual({ [A_COR]: "Branco", [A_TON]: "Brilho" });
  });
  it("quando a primeira combinação não existe, o produto existente mais próximo (cor primeiro)", () => {
    const sem = produtos.filter((p) => p.id !== "bb");
    expect(escolhaPorOmissao(sem, eixos)).toEqual({ [A_COR]: "Branco", [A_TON]: "Mate" });
  });
  it("sem eixos escolhíveis: escolha vazia", () => {
    expect(escolhaPorOmissao([produto("1", {})], [])).toEqual({});
  });
});

describe("escolherValor: passa ao produto existente mais próximo e avisa", () => {
  it("Sanita: de Branco Brilho escolher Cinza passa a Cinza Mate e avisa «Cinza só existe em Mate»", () => {
    const r = escolherValor(produtos, eixos, { [A_COR]: "Branco", [A_TON]: "Brilho" }, A_COR, "Cinza");
    expect(r.escolha).toEqual({ [A_COR]: "Cinza", [A_TON]: "Mate" });
    expect(r.aviso).toEqual({ escolhido: "Cinza", mudancas: [{ rotulo: "Tonalidade", para: "Mate" }] });
    expect(fraseDoAviso(r.aviso!, t)).toBe("Cinza só existe em Mate: mudamos para Mate.");
  });
  it("uma combinação que existe não muda nada nem avisa", () => {
    const r = escolherValor(produtos, eixos, { [A_COR]: "Branco", [A_TON]: "Brilho" }, A_TON, "Mate");
    expect(r.escolha).toEqual({ [A_COR]: "Branco", [A_TON]: "Mate" });
    expect(r.aviso).toBeNull();
  });
  it("o eixo tocado fica: de Cinza Mate escolher Brilho passa a Branco Brilho", () => {
    const r = escolherValor(produtos, eixos, { [A_COR]: "Cinza", [A_TON]: "Mate" }, A_TON, "Brilho");
    expect(r.escolha).toEqual({ [A_COR]: "Branco", [A_TON]: "Brilho" });
    expect(fraseDoAviso(r.aviso!, t)).toBe("Brilho só existe em Branco: mudamos para Branco.");
  });
  it("escolher o que já está escolhido não muda nada", () => {
    const r = escolherValor(produtos, eixos, { [A_COR]: "Cinza", [A_TON]: "Mate" }, A_COR, "Cinza");
    expect(r.escolha).toEqual({ [A_COR]: "Cinza", [A_TON]: "Mate" });
    expect(r.aviso).toBeNull();
  });

  describe("com três eixos", () => {
    const A = eixo("A", "a", "Eixo A", 0), B = eixo("B", "b", "Eixo B", 1), C = eixo("C", "c", "Eixo C", 2);
    const v = (id: string, ordem: number) => valor(id, { ordem });
    const p = (id: string, a: string, b: string, c: string) => produto(id, { A: v(a, a === "a1" ? 1 : 2), B: v(b, b === "b1" ? 1 : 2), C: v(c, c === "c1" ? 1 : 2) });
    it("mantém o máximo de valores iguais: de a1 b1 c1 escolher c2 dá a2 b1 c2 (muda só A) quando existe", () => {
      const ps = [p("1", "a1", "b1", "c1"), p("2", "a2", "b1", "c2"), p("3", "a2", "b2", "c2")];
      const r = escolherValor(ps, [A, B, C], { A: "a1", B: "b1", C: "c1" }, "C", "c2");
      expect(r.escolha).toEqual({ A: "a2", B: "b1", C: "c2" });
      expect(r.aviso?.mudancas).toEqual([{ rotulo: "Eixo A", para: "a2" }]);
    });
    it("em caso de empate muda primeiro o eixo de posição mais alta (o último da lista)", () => {
      const ps = [p("1", "a1", "b1", "c1"), p("2", "a2", "b1", "c2"), p("3", "a1", "b2", "c2")];
      const r = escolherValor(ps, [A, B, C], { A: "a1", B: "b1", C: "c1" }, "C", "c2");
      expect(r.escolha).toEqual({ A: "a1", B: "b2", C: "c2" });
    });
    it("o aviso diz todos os eixos que mudaram", () => {
      const ps = [p("1", "a1", "b1", "c1"), p("2", "a2", "b2", "c2")];
      const r = escolherValor(ps, [A, B, C], { A: "a1", B: "b1", C: "c1" }, "C", "c2");
      expect(r.aviso?.mudancas).toEqual([{ rotulo: "Eixo A", para: "a2" }, { rotulo: "Eixo B", para: "b2" }]);
      expect(fraseDoAviso(r.aviso!, t)).toBe("c2 não existe com a escolha anterior: mudamos Eixo A para a2 e Eixo B para b2.");
    });
  });
});

describe("escolhaInicial: o endereço e a mudança de medida (mantém cor e textura)", () => {
  const ANTRACITA = valor("ANTRACITA", { hex: "#645E5E", ordem: 1 }), BLANCO = valor("BLANCO", { hex: "#FCFCFC", ordem: 2 });
  const LISO = valor("Liso", { ordem: 1 }), PIZARRA = valor("Pizarra", { ordem: 2 });
  const medida = [eixo(A_COR, "cor", "Cor", 0), eixo(A_TEX, "textura", "Textura", 1)];
  const cach = (...pares: [string, ReturnType<typeof valor>, ReturnType<typeof valor>][]) => pares.map(([id, c, x]) => produto(id, { [A_COR]: c, [A_TEX]: x }));

  it("sem pedido: a escolha por omissão", () => {
    const ps = cach(["1", ANTRACITA, LISO], ["2", ANTRACITA, PIZARRA]);
    expect(escolhaInicial(ps, medida, {}).escolha).toEqual({ [A_COR]: "ANTRACITA", [A_TEX]: "Liso" });
  });
  it("com cor e textura que existem: ficam, sem aviso", () => {
    const ps = cach(["1", ANTRACITA, LISO], ["2", ANTRACITA, PIZARRA], ["3", BLANCO, LISO], ["4", BLANCO, PIZARRA]);
    const r = escolhaInicial(ps, medida, { [A_COR]: "BLANCO", [A_TEX]: "Pizarra" });
    expect(r.escolha).toEqual({ [A_COR]: "BLANCO", [A_TEX]: "Pizarra" });
    expect(r.aviso).toBeNull();
  });
  it("na medida nova a combinação pode não existir: aplica-se a regra e avisa (a cor fica, muda a textura)", () => {
    const ps = cach(["1", ANTRACITA, LISO], ["2", ANTRACITA, PIZARRA], ["3", BLANCO, LISO]);
    const r = escolhaInicial(ps, medida, { [A_COR]: "BLANCO", [A_TEX]: "Pizarra" });
    expect(r.escolha).toEqual({ [A_COR]: "BLANCO", [A_TEX]: "Liso" });
    expect(r.aviso).toEqual({ escolhido: "Blanco", mudancas: [{ rotulo: "Textura", para: "Liso" }] });
  });
  it("um valor que não existe na família ignora-se (e não avisa)", () => {
    const ps = cach(["1", ANTRACITA, LISO], ["3", BLANCO, LISO]);
    const r = escolhaInicial(ps, medida, { [A_COR]: "VERDE", [A_TEX]: "Liso" });
    expect(r.escolha).toEqual({ [A_COR]: "ANTRACITA", [A_TEX]: "Liso" });
    expect(r.aviso).toBeNull();
  });
});

describe("o endereço: um parâmetro por eixo, pelo código do eixo", () => {
  it("escreve cor e textura (e só eixos de escolha)", () => {
    const e = [EIXO_COR, EIXO_TEX];
    expect(parametrosDaEscolha({ [A_COR]: "GRIS 7035", [A_TEX]: "Liso" }, e).toString()).toBe("cor=GRIS+7035&textura=Liso");
  });
  it("lê os parâmetros para uma escolha pedida, ignorando os desconhecidos", () => {
    const e = [EIXO_COR, EIXO_TEX];
    expect(pedidoDosParametros(new URLSearchParams("cor=Negro&textura=Liso&x=1&tonalidade=Mate"), e)).toEqual({ [A_COR]: "Negro", [A_TEX]: "Liso" });
  });
});

describe("nomeParaMostrar: a apresentação normaliza, a base não muda", () => {
  it("primeira letra maiúscula e o resto minúsculas nas cores", () => {
    expect(nomeParaMostrar("NEGRO", true)).toBe("Negro");
    expect(nomeParaMostrar("GRIS 7035", true)).toBe("Gris 7035");
    expect(nomeParaMostrar("GRIS MEDIO", true)).toBe("Gris medio");
    expect(nomeParaMostrar("Chocolate", true)).toBe("Chocolate");
    expect(nomeParaMostrar("moka", true)).toBe("Moka");
    expect(nomeParaMostrar("BRANCO/PRETO", true)).toBe("Branco/Preto");
  });
  it("fora das cores só se mexe no que vem todo em maiúsculas (e não em siglas curtas)", () => {
    expect(nomeParaMostrar("BRILHO", false)).toBe("Brilho");
    expect(nomeParaMostrar("Pizarra", false)).toBe("Pizarra");
    expect(nomeParaMostrar("PVC", false)).toBe("PVC");
    expect(nomeParaMostrar("70×100 cm", false)).toBe("70×100 cm");
  });
});
