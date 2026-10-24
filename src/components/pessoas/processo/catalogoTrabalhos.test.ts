import { describe, expect, it } from "vitest";
import { DIVISOES, OUTRO, UNIDADES, trabalhosPorDivisao } from "@/components/negocio-metas/levantamentoExemplo";
import type { LinhaLevantamento } from "@/components/negocio-metas/negocioMetas";
import {
  CATALOGO, CHAVES_CATALOGO, chaveDoTrabalho, linhasDoLevantamento, novaLinhaDoCatalogo, type ChaveTrabalho,
} from "./catalogoTrabalhos";
import { MARGEM_MIN, totaisDoOrcamento } from "./orcamentoCalculo";

/** Os trabalhos que o levantamento deixa escolher: os de cada divisão e o "Outro". */
const TRABALHOS_DO_LEVANTAMENTO = [...new Set([...DIVISOES.flatMap((d) => trabalhosPorDivisao(d)), OUTRO])];

describe("catálogo de trabalhos", () => {
  it("tem exatamente os mesmos trabalhos que o levantamento (as mesmas chaves, para as linhas dele alimentarem o orçamento)", () => {
    expect([...CHAVES_CATALOGO].sort()).toEqual([...TRABALHOS_DO_LEVANTAMENTO].sort());
  });

  it("cada trabalho tem custo, preço acima do custo, um tipo (mão de obra ou material) e uma unidade das do levantamento", () => {
    for (const chave of CHAVES_CATALOGO) {
      const t = CATALOGO[chave];
      expect(t.custo, chave).toBeGreaterThan(0);
      expect(t.preco, chave).toBeGreaterThan(t.custo);
      expect(["maoDeObra", "material"], chave).toContain(t.tipo);
      expect(UNIDADES as readonly string[], chave).toContain(t.unidade);
    }
  });

  it("há mão de obra e há materiais (as duas taxas de IVA entram nos cálculos)", () => {
    expect(new Set(CHAVES_CATALOGO.map((c) => CATALOGO[c].tipo))).toEqual(new Set(["maoDeObra", "material"]));
  });

  it("ao preço de lista nenhum trabalho fica abaixo da margem mínima (uma linha nova nunca nasce bloqueada)", () => {
    for (const chave of CHAVES_CATALOGO) {
      const { margem } = totaisDoOrcamento({ linhas: [novaLinhaDoCatalogo(chave, "x")], desconto: 0 });
      expect(margem, chave).toBeGreaterThanOrEqual(MARGEM_MIN);
    }
  });
});

describe("novaLinhaDoCatalogo", () => {
  it("uma linha com quantidade 1 e o preço de lista do catálogo", () => {
    expect(novaLinhaDoCatalogo("pavimento", "l1")).toEqual({
      id: "l1", trabalho: "pavimento", quantidade: 1, precoUnitario: CATALOGO.pavimento.preco,
    });
  });
});

const linhaLev = (trabalho: string, medida: number): LinhaLevantamento => ({ divisao: "Sala", trabalho, medida, unidade: "m²", observacoes: "" });
const PELO_NOME: Record<string, ChaveTrabalho> = { Pavimento: "pavimento", Pintura: "pintura" };
const chaveDe = (texto: string): ChaveTrabalho | null => PELO_NOME[texto] ?? null;

describe("chaveDoTrabalho (o texto que o levantamento guardou volta a ser a chave do catálogo)", () => {
  const rotulo = (chave: ChaveTrabalho) => `Rótulo ${chave}`;
  it("encontra o trabalho cujo rótulo é o texto", () => {
    expect(chaveDoTrabalho("Rótulo azulejos", rotulo)).toBe("azulejos");
  });
  it("um texto que não é de nenhum trabalho (escrito à mão) não tem chave", () => {
    expect(chaveDoTrabalho("Lareira", rotulo)).toBeNull();
  });
  it("o rótulo do 'Outro' não conta: é a deixa para o texto livre", () => {
    expect(chaveDoTrabalho("Rótulo outro", rotulo)).toBeNull();
  });
});

describe("linhasDoLevantamento (as linhas da visita viram as do orçamento)", () => {
  it("o mesmo trabalho em várias divisões soma as medidas numa só linha, pelo preço de lista", () => {
    const linhas = linhasDoLevantamento([linhaLev("Pavimento", 10), linhaLev("Pintura", 40), linhaLev("Pavimento", 5.5)], chaveDe);
    expect(linhas).toEqual([
      { id: "l1", trabalho: "pavimento", quantidade: 15.5, precoUnitario: CATALOGO.pavimento.preco },
      { id: "l2", trabalho: "pintura", quantidade: 40, precoUnitario: CATALOGO.pintura.preco },
    ]);
  });

  it("um trabalho escrito à mão ('Outro') fica como 'outro', com o texto como nome; textos iguais somam, diferentes ficam à parte", () => {
    const linhas = linhasDoLevantamento([linhaLev("Lareira", 1), linhaLev("Lareira", 2), linhaLev("Pérgola", 1)], chaveDe);
    expect(linhas.map((l) => [l.trabalho, l.nome, l.quantidade])).toEqual([["outro", "Lareira", 3], ["outro", "Pérgola", 1]]);
    expect(new Set(linhas.map((l) => l.id)).size).toBe(2);
  });

  it("sem linhas no levantamento, o orçamento começa vazio", () => {
    expect(linhasDoLevantamento([], chaveDe)).toEqual([]);
  });

  it("as medidas somam sem erros de vírgula flutuante (0,1 + 0,2 = 0,3)", () => {
    const linhas = linhasDoLevantamento([linhaLev("Pavimento", 0.1), linhaLev("Pavimento", 0.2)], chaveDe);
    expect(linhas[0].quantidade).toBe(0.3);
  });
});
