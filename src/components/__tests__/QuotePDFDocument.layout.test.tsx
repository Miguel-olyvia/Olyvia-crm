// @vitest-environment node
// Layout real do PDF (não só a árvore): gera o PDF com o @react-pdf/renderer, lê as caixas de texto com o
// pdfjs-dist e confirma que nenhuma linha da tabela se escreve por cima de outra. Defeito visto na proposta
// P-2026-1189: linhas de bundle com descrição e «COMPONENTES DO BUNDLE» ficavam sobrepostas às seguintes.
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
// @ts-ignore -- os tipos do Node não fazem parte do tsconfig.app; o vitest corre em Node e resolve-o
import { mkdirSync, writeFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { QuotePDFDocument } from "@/components/QuotePDFDocument";

interface Caixa { pagina: number; texto: string; x0: number; x1: number; y0: number; y1: number }

// Componente com SKU, quantidade e IVA 0, como os da P-2026-1189 (o último leva um atributo).
const componente = (nome: string, preco: number, k: number, ultimo: boolean) => ({
  name: nome,
  sku: `MCCASC00${10 + k}`,
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
const contagens = [10, 8, 4, 4, 6, 2, 2];
const descricoes = ["cor nogueira - lado A", "cor nogueira - lado A", "cor nogueira - lado B", "cor nogueira - lado B", null, null, null];

const linhasBundles = nomesBundles.map((nome, i) => {
  const comps = Array.from({ length: contagens[i] }, (_, k) =>
    componente(`Componente ${i + 1}.${k + 1} Instalação ${nome} 60x90cm Altura`, 100 + k * 10, k, i === nomesBundles.length - 1 && k === contagens[i] - 1));
  const soma = comps.reduce((s, c) => s + c.unit_price * c.quantity, 0);
  return {
    id: `l${i + 1}`,
    ordem: i + 1,
    descricao_snapshot: nome,
    item_description: descricoes[i],
    qt: 1,
    unidade: "UN",
    retail_price_unit: soma,
    total_sem_iva: soma,
    iva_percent: 0,
    bundle_id: `b${i + 1}`,
    selected_attributes: { bundle_components: comps },
  };
});

const descricaoTrabalhos =
  "Execução de trabalhos de remodelação, incluindo o fornecimento e aplicação dos materiais identificados no presente orçamento. " +
  "A Mudelar assegura o acompanhamento, coordenação e execução dos trabalhos até à sua conclusão. Quaisquer trabalhos, materiais, " +
  "alterações ou serviços não previstos na presente proposta serão, sujeitos a orçamento adicional. O cliente deverá assegurar que o " +
  "espaço se encontra desimpedido e em condições adequadas para o início dos trabalhos.";

const propsProposta = {
  quote: { quote_number: "Q-1", created_at: "2026-11-20T12:00:00Z", estado: "enviado", validade_dias: 30 },
  company: { name: "Mudelar" },
  client: {
    display_name: "Cliente Teste", vat: "123456789", email: "cliente@exemplo.pt", phone: "+351910000000",
    client_addresses: [{ street: "Rua de Teste n5 1º DRT", postal_code: "2800-059", city: "Almada", is_primary: true }],
  },
  user: { name: "Rita Costa", email: "rita@exemplo.pt" },
  lines: linhasBundles,
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
      { id: "d", type: "description", visible: true, settings: { sectionLabel: "DESCRIÇÃO DOS TRABALHOS:", content: descricaoTrabalhos } },
      { id: "qi", type: "quote_items", visible: true, settings: { sectionLabel: "DETALHES DO ORÇAMENTO" } },
      { id: "te", type: "terms", visible: true, settings: { sectionLabel: "CONDIÇÕES GERAIS" } },
      { id: "f", type: "footer", visible: true, settings: {} },
    ],
  },
  documentContext: { kind: "proposal", number: "P-2026-1189" },
};

async function gerarPdf(props: Record<string, unknown>): Promise<Uint8Array> {
  const buf = await renderToBuffer(React.createElement(QuotePDFDocument as any, props) as any);
  return new Uint8Array(buf);
}

async function caixasDeTexto(bytes: Uint8Array): Promise<Caixa[]> {
  const doc = await getDocument({ data: bytes.slice(), useSystemFonts: false, isEvalSupported: false }).promise;
  const out: Caixa[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const item of tc.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      const [, , , d, e, f] = item.transform;
      const altura = Math.abs(d) || item.height;
      out.push({ pagina: p, texto: item.str, x0: e, x1: e + item.width, y0: f, y1: f + altura * 0.8 });
    }
  }
  return out;
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

describe("QuotePDFDocument - layout real das linhas de bundle", () => {
  it("7 bundles com descrição e componentes: nenhum texto por cima de outro", async () => {
    const bytes = await gerarPdf(propsProposta);
    // @ts-ignore -- process existe em Node
    const dir = process.env.PDF_PROVA_DIR as string | undefined;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      // @ts-ignore -- process existe em Node
      writeFileSync(`${dir}/${process.env.PDF_PROVA_NOME || "prova"}.pdf`, bytes);
    }
    const caixas = await caixasDeTexto(bytes);
    // Só as 5 primeiras, para a mensagem de falha ficar legível.
    expect(sobreposicoes(caixas).slice(0, 5)).toEqual([]);
    // Todas as linhas e todos os componentes têm de sair no PDF.
    for (const nome of new Set(nomesBundles)) expect(caixas.some((c) => c.texto.includes(nome))).toBe(true);
    expect(caixas.filter((c) => c.texto.includes("Componente ")).length).toBe(contagens.reduce((s, n) => s + n, 0));
  }, 60000);
});
