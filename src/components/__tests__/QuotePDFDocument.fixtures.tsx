// Cenários e utilitários partilhados pelos testes do QuotePDFDocument (português de sempre e inglês).
// O documento é uma função pura sem hooks: expande-se a árvore de elementos à mão, sem gerar PDF.
// @ts-ignore -- os tipos do Node não fazem parte do tsconfig.app; o vitest corre em Node e resolve-o
import { createHash } from "node:crypto";
import { QuotePDFDocument } from "@/components/QuotePDFDocument";

/** Texto de uma árvore de elementos React (componentes-função expandidos), com os textos adjacentes juntos. */
export function textoDoPdf(node: any): string {
  return achatar(node).join("");
}

function achatar(node: any, out: string[] = []): string[] {
  if (node == null || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => achatar(n, out));
    return out;
  }
  if (typeof node.type === "function") return achatar(node.type(node.props), out);
  return achatar(node.props?.children, out);
}

/**
 * Serializa a árvore inteira (tipos, estilos e textos, com os textos adjacentes juntos) para comparar o
 * documento a sério: o português tem de sair igual não só no texto mas também na estrutura e nos estilos.
 */
export function serializarArvore(node: any): string {
  return JSON.stringify(arvore(node));
}

function arvore(node: any): unknown {
  if (node == null || typeof node === "boolean") return null;
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return juntarTextos(node.map(arvore).flat(Infinity).filter((x) => x !== null));
  if (typeof node.type === "function") return arvore(node.type(node.props));
  const { children, ...props } = node.props ?? {};
  const tipo = typeof node.type === "string" ? node.type : (node.type?.displayName ?? node.type?.name ?? String(node.type));
  return { tipo, props, filhos: juntarTextos([arvore(children)].flat(Infinity).filter((x) => x !== null)) };
}

function juntarTextos(itens: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const item of itens) {
    const ultimo = out[out.length - 1];
    if (typeof item === "string" && typeof ultimo === "string") out[out.length - 1] = ultimo + item;
    else out.push(item);
  }
  return out;
}

export const sha1 = (texto: string): string => createHash("sha1").update(texto).digest("hex");

const linha = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  descricao_snapshot: `Artigo ${id}`,
  qt: 2,
  unidade: "UN",
  retail_price_unit: 50,
  total_sem_iva: 100,
  iva_percent: 23,
  ordem: 1,
  ...over,
});

export const linhasSimples = [
  linha("a", { total_sem_iva: 1000, retail_price_unit: 500, products: { sku: "SKU-A" }, item_description: "Descrição do artigo a" }),
  linha("b", { total_sem_iva: 50, qt: 1, retail_price_unit: 50, iva_percent: 6, selected_attributes: { cor: { label: "Cor", value: "Branco" } } }),
];

export const linhasVariasSeccoes = [
  linha("a"),
  linha("b", { section_name: "Cozinha" }),
  linha("c", {
    section_name: "Cozinha",
    bundle_id: "bd1",
    selected_attributes: {
      bundle_components: [
        {
          name: "Tampo", sku: "T-1", quantity: 1, unit_price: 40, vat_rate: 23,
          selected_attributes: { acabamento: { label: "Acabamento", value: "Mate" } },
        },
        { name: "Montagem", sku: null, quantity: 1, unit_price: 20, vat_rate: 6 },
      ],
    },
  }),
  linha("d", { categoria: "Bundles" }),
];

const cliente = {
  display_name: "Ana Silva",
  vat: "123456789",
  email: "ana@exemplo.pt",
  phone: "910000000",
  client_addresses: [{ street: "Rua B", number: "2", postal_code: "4000-001", city: "Porto", is_primary: true }],
};
const empresa = {
  name: "Mudelar Lda",
  vat: "500000000",
  email: "geral@mudelar.pt",
  phone: "210000000",
  company_addresses: [{ street: "Rua A", number: "1", postal_code: "1000-001", city: "Lisboa", is_primary: true }],
};
const comercial = { name: "Rita Costa", email: "rita@exemplo.pt", phone: "912345678" };

export const modeloCompleto = {
  primary_color: "#8b5cf6",
  header_text: "<p>Cabeçalho da organização</p>",
  footer_text: "<p>Obrigado pela preferência</p>",
  terms_conditions: "<p>Pagamento a 30 dias</p>",
  thank_you_message: "<p>Obrigado!</p>",
  sections: [
    { id: "h", type: "header", visible: true, settings: { customTitle: "PROPOSTA", showLogo: false } },
    { id: "co", type: "company_info", visible: true, settings: { sectionLabel: "EMPRESA" } },
    { id: "cl", type: "client_info", visible: true, settings: { sectionLabel: "CLIENTE" } },
    { id: "d", type: "description", visible: true, settings: { sectionLabel: "DESCRIÇÃO" } },
    { id: "n", type: "notes", visible: true, settings: { sectionLabel: "NOTAS" } },
    { id: "qi", type: "quote_items", visible: true, settings: { sectionLabel: "DETALHES DA PROPOSTA" } },
    { id: "v", type: "validity", visible: true, settings: { sectionLabel: "VALIDADE" } },
    { id: "va", type: "value", visible: true, settings: { sectionLabel: "VALOR DA PROPOSTA" } },
    { id: "te", type: "terms", visible: true, settings: { sectionLabel: "CONDIÇÕES GERAIS" } },
    { id: "ty", type: "thank_you", visible: true, settings: {} },
    { id: "cu", type: "custom", visible: true, settings: { content: "<p>Garantia de 2 anos</p>" } },
    { id: "f", type: "footer", visible: true, settings: {} },
  ],
};

const base = {
  quote: {
    quote_number: "Q-1", created_at: "2026-03-05T12:00:00Z", estado: "enviado", validade_dias: 30,
    obra_endereco: "Rua da Obra, 3", client_notes: "Nota ao cliente",
  },
  company: empresa,
  client: cliente,
  user: comercial,
  lines: linhasSimples,
  fees: [{ id: "f1", calculated_value: 20, vat_rate: 23, service_fee_types: { name: "Deslocação" } }],
  descontoPercent: 10,
  proposalTemplate: modeloCompleto,
};

const totaisAgregados = {
  subtotalBruto: 300, discountValue: 30, discountPercent: 10, vatBreakdown: [{ rate: 23, base: 270, vat: 62.1 }],
  feeVatBreakdown: [{ rate: 23, name: "Deslocação", vat: 4.6 }], totalIva: 66.7, subtotalWithFees: 290, total: 356.7,
  fees: [{ name: "Deslocação", value: 20 }],
} as any;

/** Todos os cenários, para correr o mesmo conjunto em pt (baseline) e em inglês. */
export const cenariosPdf: Record<string, Record<string, unknown>> = {
  orcamentoPadrao: { ...base, proposalTemplate: null, documentContext: undefined },
  orcamentoModelo: { ...base, documentContext: { kind: "quote" } },
  propostaPadrao: { ...base, proposalTemplate: null, documentContext: { kind: "proposal", number: "P-2026-001", title: "Remodelação" } },
  propostaModelo: { ...base, documentContext: { kind: "proposal", number: "P-2026-001", title: "Remodelação" } },
  propostaSeccoes: { ...base, lines: linhasVariasSeccoes, documentContext: { kind: "proposal", number: "P-2026-001" } },
  propostaTaxas: {
    ...base,
    fees: [
      { id: "f1", calculated_value: 20, vat_rate: 23, service_fee_types: { name: "Deslocação" } },
      { id: "f2", calculated_value: 5, vat_rate: 6, service_fee_types: null },
    ],
    documentContext: { kind: "proposal", number: "P-2026-001" },
  },
  propostaSemTotais: { ...base, hideTotals: true, documentContext: { kind: "proposal", number: "P-2026-001" } },
  propostaAgregada: { ...base, totalsOverride: totaisAgregados, documentContext: { kind: "proposal", number: "P-2026-001" } },
  propostaSemDesconto: { ...base, descontoPercent: 0, fees: [], user: null, documentContext: { kind: "proposal", number: "P-2026-001" } },
  vendaDireta: { ...base, proposalTemplate: null, documentContext: { kind: "direct_sale", number: "VD-2026-0001", validUntil: "2026-10-15" } },
  vendaDiretaModelo: { ...base, documentContext: { kind: "direct_sale", number: "VD-2026-0001", validUntil: null } },
  semNada: { ...base, lines: [], fees: [], user: null, client: null, company: null, descontoPercent: 0, quote: { created_at: "2026-03-05T12:00:00Z", estado: "perdido" }, proposalTemplate: null, documentContext: { kind: "proposal" } },
};

export const renderPdf = (props: Record<string, unknown>) => (QuotePDFDocument as any)(props);
