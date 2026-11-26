// Dados de teste partilhados pelos testes da vista da família com 3D (só testes importam este ficheiro).
import type { EixoVista, FamiliaVista, ProdutoVista, ValorVista } from "./escolhaVariacao";

export const A_COR = "at-cor", A_TON = "at-ton", A_TEX = "at-tex", A_MED = "at-med";

/** Um valor de eixo; `nome` é o do valor se não se disser outro. */
export const valor = (v: string, extra: Partial<ValorVista> = {}): ValorVista => ({ valor: v, nome: v, hex: null, foto: null, sigla: null, ordem: null, isMetal: false, ...extra });

export const produto = (id: string, valores: Record<string, ValorVista>, extra: Partial<ProdutoVista> = {}): ProdutoVista => ({
  id, nome: `Produto ${id}`, sku: `SKU-${id}`, estado: "active", pvp: null, stock: null, modeloId: null, modelo: null,
  subcategoriaId: null, subcategoria: null, categoriaId: null, categoria: null, medida: null, aplicacao: null, valores, ...extra,
});

export const eixo = (atributoId: string, code: string, rotulo: string, posicao: number, extra: Partial<EixoVista> = {}): EixoVista =>
  ({ atributoId, code, rotulo, papel: "medida", posicao, isMeasurement: false, ...extra });

export const EIXO_COR = eixo(A_COR, "cor", "Cor", 0), EIXO_TON = eixo(A_TON, "tonalidade", "Tonalidade", 1);
export const EIXO_TEX = eixo(A_TEX, "textura", "Textura", 2), EIXO_MED = eixo(A_MED, "medida", "Medida", 3, { isMeasurement: true });

export const BRANCO = valor("Branco", { hex: "#FCFCFC", ordem: 1 }), CINZA = valor("Cinza", { hex: "#A3A3A3", ordem: 2 });
export const BRILHO = valor("Brilho", { ordem: 1 }), MATE = valor("Mate", { ordem: 2 });

/** «Sanita GLAMIC BTW» (real): Cor Branco/Cinza × Tonalidade Brilho/Mate; existem 3 produtos e NÃO existe Cinza Brilho. */
export const SANITA: FamiliaVista = {
  id: "f-sanita", nome: "SANITA GLAMIC BTW", veValores: true, veStock: true,
  eixos: [EIXO_COR, EIXO_TON],
  produtos: [
    produto("bb", { [A_COR]: BRANCO, [A_TON]: BRILHO }, { nome: "SANITA GLAMIC BTW BRANCO BRILHO", sku: "LS-S-0003-B-B", pvp: 280, stock: 0 }),
    produto("bm", { [A_COR]: BRANCO, [A_TON]: MATE }, { nome: "SANITA GLAMIC BTW BRANCO MATE", sku: "LS-S-0003-B-M", pvp: 400, stock: 0 }),
    produto("cm", { [A_COR]: CINZA, [A_TON]: MATE }, { nome: "SANITA GLAMIC BTW CINZA MATE", sku: "LS-S-0003-C-M", pvp: 450, stock: 0 }),
  ],
  outrasMedidas: [{ id: "f-sanita", nome: "SANITA GLAMIC BTW", atual: true, medida: null, medidaValor: null, unidade: null }],
};
