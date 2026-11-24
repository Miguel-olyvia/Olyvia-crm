// @vitest-environment node
// Layout real do PDF (não só a árvore): gera o PDF com o @react-pdf/renderer, lê as caixas de texto com o
// pdfjs-dist e confirma que nenhuma linha da tabela se escreve por cima de outra. Defeito visto na proposta
// P-2026-1189: linhas de bundle com descrição e «COMPONENTES DO BUNDLE» ficavam sobrepostas às seguintes.
// Depois disso, cada linha era um bloco indivisível e a proposta saía com páginas meio vazias (5 páginas, a 1.ª
// só com o cabeçalho da tabela no fim): os bundles passaram a partir-se entre componentes.
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
// @ts-ignore -- os tipos do Node não fazem parte do tsconfig.app; o vitest corre em Node e resolve-o
import { mkdirSync, writeFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { QuotePDFDocument } from "@/components/QuotePDFDocument";

interface Caixa { pagina: number; texto: string; x0: number; x1: number; y0: number; y1: number }

/** Páginas que a P-2026-1189 ocupava com cada linha indivisível (antes de os bundles se poderem partir). */
const PAGINAS_ANTES_P1189 = 5;

// Componente com SKU, quantidade e IVA 0, como os da P-2026-1189 (o último leva um atributo). O SKU leva o
// número do bundle para se poder encontrar cada componente sem ambiguidade.
const componente = (nome: string, preco: number, i: number, k: number, ultimo: boolean) => ({
  name: nome,
  sku: `MC${i + 1}C${k + 1}`,
  quantity: k % 3 === 0 ? 3 : 1,
  unit_price: preco,
  vat_rate: 0,
  ...(ultimo ? { selected_attributes: { cor: { label: "Cor", value: "CROMO" } } } : {}),
});

/** 7 bundles com 4 a 10 componentes, como a P-2026-1189 (44 componentes). */
const nomesBundles = [
  "Armário Superior de cozinha com Instalação",
  "Armário Inferior de cozinha com Instalação",
  "Armário Superior de cozinha com Instalação",
  "Armário Inferior de cozinha com Instalação",
  "Acessórios de Cozinha C/ Instalação",
  "Lava-Louças C/Instalação",
  "Torneira Misturadora de Cozinha C/Instalação",
];
const contagensP1189 = [10, 8, 4, 4, 6, 2, 2];
const descricoes = ["cor nogueira - lado A", "cor nogueira - lado A", "cor nogueira - lado B", "cor nogueira - lado B", null, null, null];

const nomeComponente = (i: number, k: number, nome: string) => `Componente ${i + 1}.${k + 1} Instalação ${nome} 60x90cm Altura`;

function linhasBundles(contagens: number[]) {
  return contagens.map((n, i) => {
    const nome = nomesBundles[i % nomesBundles.length];
    const comps = Array.from({ length: n }, (_, k) =>
      componente(nomeComponente(i, k, nome), 100 + k * 10, i, k, i === contagens.length - 1 && k === n - 1));
    const soma = comps.reduce((s, c) => s + c.unit_price * c.quantity, 0);
    return {
      id: `l${i + 1}`,
      ordem: i + 1,
      descricao_snapshot: nome,
      item_description: descricoes[i % descricoes.length],
      qt: 1,
      unidade: "UN",
      retail_price_unit: soma,
      total_sem_iva: soma,
      iva_percent: 0,
      bundle_id: `b${i + 1}`,
      selected_attributes: { bundle_components: comps },
    };
  });
}

/** Linhas simples (sem bundle), para confirmar que um orçamento sem bundles se comporta como sempre. */
const linhasSimples = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `s${i + 1}`,
  ordem: i + 1,
  descricao_snapshot: `Artigo simples ${i + 1}`,
  item_description: i % 2 === 0 ? `Descrição do artigo simples ${i + 1}` : null,
  qt: 2,
  unidade: "UN",
  retail_price_unit: 10,
  total_sem_iva: 20,
  iva_percent: 23,
  products: { sku: `SKU-${i + 1}` },
}));

const descricaoTrabalhos =
  "Execução de trabalhos de remodelação, incluindo o fornecimento e aplicação dos materiais identificados no presente orçamento. " +
  "A Mudelar assegura o acompanhamento, coordenação e execução dos trabalhos até à sua conclusão. Quaisquer trabalhos, materiais, " +
  "alterações ou serviços não previstos na presente proposta serão, sujeitos a orçamento adicional. O cliente deverá assegurar que o " +
  "espaço se encontra desimpedido e em condições adequadas para o início dos trabalhos.";

const propsProposta = (lines: unknown[], descricao: string = descricaoTrabalhos) => ({
  quote: { quote_number: "Q-1", created_at: "2026-11-20T12:00:00Z", estado: "enviado", validade_dias: 30 },
  company: { name: "Mudelar" },
  client: {
    display_name: "Cliente Teste", vat: "123456789", email: "cliente@exemplo.pt", phone: "+351910000000",
    client_addresses: [{ street: "Rua de Teste n5 1º DRT", postal_code: "2800-059", city: "Almada", is_primary: true }],
  },
  user: { name: "Rita Costa", email: "rita@exemplo.pt" },
  lines,
  fees: [],
  descontoPercent: 0,
  proposalTemplate: {
    primary_color: "#2f6b5a",
    quote_header_bg: "#3f4a3c",
    quote_row_alt_bg: "#7fcbb3",
    footer_text: "Empresa de Teste, Remodelações Unipessoal. Lda. - Rua de Teste, Nº 1, Loja B, 1000-001 Lisboa | geral@exemplo.pt www.exemplo.pt | NIF: 500 000 000 | T: +351 210 000 000",
    terms_conditions: "1. Esta proposta é válida pelo período indicado. 2. Os valores apresentados incluem IVA à taxa legal em vigor. 3. O pagamento é efetuado conforme as condições acordadas.",
    sections: [
      { id: "h", type: "header", visible: true, settings: { customTitle: "Proposta Remodelação Geral", showLogo: false } },
      { id: "cl", type: "client_info", visible: true, settings: { sectionLabel: "CLIENTE" } },
      { id: "d", type: "description", visible: true, settings: { sectionLabel: "DESCRIÇÃO DOS TRABALHOS:", content: descricao } },
      { id: "qi", type: "quote_items", visible: true, settings: { sectionLabel: "DETALHES DO ORÇAMENTO" } },
      { id: "te", type: "terms", visible: true, settings: { sectionLabel: "CONDIÇÕES GERAIS" } },
      { id: "f", type: "footer", visible: true, settings: {} },
    ],
  },
  documentContext: { kind: "proposal", number: "P-2026-1189" },
});

async function gerarPdf(props: Record<string, unknown>, nomeProva?: string): Promise<Uint8Array> {
  const buf = await renderToBuffer(React.createElement(QuotePDFDocument as any, props) as any);
  const bytes = new Uint8Array(buf);
  // @ts-ignore -- process existe em Node
  const dir = process.env.PDF_PROVA_DIR as string | undefined;
  if (dir && nomeProva) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${nomeProva}.pdf`, bytes);
  }
  return bytes;
}

async function lerPdf(bytes: Uint8Array): Promise<{ paginas: number; caixas: Caixa[] }> {
  const doc = await getDocument({ data: bytes.slice(), useSystemFonts: false, isEvalSupported: false }).promise;
  const caixas: Caixa[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const item of tc.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      const [, , , d, e, f] = item.transform;
      const altura = Math.abs(d) || item.height;
      caixas.push({ pagina: p, texto: item.str, x0: e, x1: e + item.width, y0: f, y1: f + altura * 0.8 });
    }
  }
  return { paginas: doc.numPages, caixas };
}

/** Pares de caixas de texto que se cruzam na mesma página (com 0,5 pt de folga). */
function sobreposicoes(caixas: Caixa[]): string[] {
  const res: string[] = [];
  for (let i = 0; i < caixas.length; i++) {
    for (let j = i + 1; j < caixas.length; j++) {
      const a = caixas[i];
      const b = caixas[j];
      if (a.pagina !== b.pagina) continue;
      const cruzaX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5;
      const cruzaY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5;
      if (cruzaX && cruzaY) res.push(`p${a.pagina}: «${a.texto}» × «${b.texto}»`);
    }
  }
  return res;
}

const comTexto = (caixas: Caixa[], trecho: string) => caixas.filter((c) => c.texto.includes(trecho));
const pagina = (caixas: Caixa[], trecho: string) => {
  const achadas = comTexto(caixas, trecho);
  expect(achadas.length, `«${trecho}» tem de sair uma vez`).toBe(1);
  return achadas[0].pagina;
};

/**
 * Verificações comuns a qualquer PDF com bundles: nada sobreposto; cada componente sai uma só vez, com as suas
 * duas linhas (nome e SKU) na mesma página; o cabeçalho da tabela está na página da 1.ª linha; o título de cada
 * bundle e «COMPONENTES DO BUNDLE» estão na página dos dois primeiros componentes.
 */
function verificarBundles(caixas: Caixa[], contagens: number[]) {
  expect(sobreposicoes(caixas).slice(0, 5)).toEqual([]);
  for (let i = 0; i < contagens.length; i++) {
    for (let k = 0; k < contagens[i]; k++) {
      const pNome = pagina(caixas, `Componente ${i + 1}.${k + 1} `);
      const pSku = pagina(caixas, `MC${i + 1}C${k + 1} ·`);
      expect(pSku, `componente ${i + 1}.${k + 1} cortado entre páginas`).toBe(pNome);
    }
  }
  const totalComps = contagens.reduce((s, n) => s + n, 0);
  expect(comTexto(caixas, "Componente ").length).toBe(totalComps);

  const titulos = comTexto(caixas, "COMPONENTES DO BUNDLE");
  expect(titulos.length).toBe(contagens.filter((n) => n > 0).length);
  contagens.forEach((n, i) => {
    if (n === 0) return;
    const pTitulo = titulos[i].pagina;
    for (let k = 0; k < Math.min(2, n); k++) {
      expect(pagina(caixas, `Componente ${i + 1}.${k + 1} `), `título do bundle ${i + 1} órfão`).toBe(pTitulo);
    }
  });

  // O cabeçalho da tabela nunca fica sozinho no fim de uma página: está na página do 1.º componente da 1.ª linha.
  const cab = comTexto(caixas, "Unid.");
  expect(cab.length).toBe(1);
  expect(cab[0].pagina).toBe(pagina(caixas, "Componente 1.1 "));
}

describe("QuotePDFDocument - layout real das linhas de bundle", () => {
  it("P-2026-1189 (7 bundles, 4 a 10 componentes): nada sobreposto, nada órfão e menos páginas", async () => {
    // @ts-ignore -- process existe em Node
    const bytes = await gerarPdf(propsProposta(linhasBundles(contagensP1189)), process.env.PDF_PROVA_NOME || "prova");
    const { paginas, caixas } = await lerPdf(bytes);
    verificarBundles(caixas, contagensP1189);
    for (const nome of new Set(nomesBundles)) expect(caixas.some((c) => c.texto.includes(nome))).toBe(true);
    expect(paginas).toBeLessThan(PAGINAS_ANTES_P1189);
  }, 60000);

  it("um bundle com 40 componentes parte-se entre páginas sem cortar nem repetir componentes", async () => {
    const contagens = [40];
    const { paginas, caixas } = await lerPdf(await gerarPdf(propsProposta(linhasBundles(contagens)), "bundle-40"));
    verificarBundles(caixas, contagens);
    const paginasDoBundle = new Set(comTexto(caixas, "Componente 1.").map((c) => c.pagina));
    expect(paginasDoBundle.size).toBeGreaterThan(1);
    expect(paginas).toBeGreaterThan(1);
  }, 60000);

  it.each([
    ["1 componente", [1]],
    ["3 componentes", [3, 3, 3, 3, 3, 3, 3, 3]],
    ["12 componentes", [12, 12, 12]],
  ])("bundles com %s", async (_nome, contagens) => {
    const { caixas } = await lerPdf(await gerarPdf(propsProposta(linhasBundles(contagens as number[]))));
    verificarBundles(caixas, contagens as number[]);
  }, 60000);

  it("orçamento sem bundles: nada sobreposto, todas as linhas uma vez, cabeçalho com a 1.ª linha", async () => {
    const { caixas } = await lerPdf(await gerarPdf(propsProposta(linhasSimples(60)), "sem-bundles"));
    expect(sobreposicoes(caixas).slice(0, 5)).toEqual([]);
    for (let i = 1; i <= 60; i++) {
      const sku = caixas.filter((c) => c.texto.trim() === `SKU-${i}`);
      expect(sku.length, `linha ${i} tem de sair uma vez`).toBe(1);
      const nome = caixas.filter((c) => c.texto.trim() === `Artigo simples ${i}`);
      expect(nome.map((c) => c.pagina)).toEqual([sku[0].pagina]);
    }
    expect(comTexto(caixas, "Unid.")[0].pagina).toBe(caixas.find((c) => c.texto.trim() === "SKU-1")!.pagina);
  }, 60000);

  it("cabeçalho da tabela sem espaço no fim da 1.ª página passa para a seguinte com a 1.ª linha", async () => {
    // Uma descrição dos trabalhos comprida empurra o cabeçalho para o fundo da 1.ª página.
    // Várias alturas, para que numa delas o cabeçalho caia mesmo no fim da página.
    const longa = Array.from({ length: 5 }, () => descricaoTrabalhos).join(" ");
    let cabecalhoNaPagina2 = false;
    for (let extra = 0; extra < 8; extra++) {
      const props = propsProposta(linhasBundles([10, 8]), `${longa} ${"Texto adicional da obra. ".repeat(extra * 6)}`);
      const { caixas } = await lerPdf(await gerarPdf(props));
      verificarBundles(caixas, [10, 8]);
      if (comTexto(caixas, "Unid.")[0].pagina === 2) cabecalhoNaPagina2 = true;
    }
    expect(cabecalhoNaPagina2).toBe(true);
  }, 120000);
});
