import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

// Venda Direta — Fase 4b: documento da PROFORMA.
//
// Molde: ClientOrderDocumentPDF.tsx (documento auto-contido, @react-pdf/renderer,
// dados 100% por props). NÃO segue o QuotePDFDocument, que é template-driven
// (secções configuráveis, variáveis, bundles) — maquinaria a mais para um
// documento com um layout fixo como este.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ REGRA LEGAL — NÃO ALTERAR SEM ACONSELHAMENTO                             │
// │ Em Portugal, emitir faturas exige software certificado pela AT. Este     │
// │ documento NUNCA pode parecer uma fatura:                                 │
// │   - a palavra "Fatura" não aparece em lado nenhum;                       │
// │   - não há número de fatura, série, ATCUD nem código QR;                 │
// │   - o aviso "Documento não fiscal..." está FIXO no rodapé e repete-se em │
// │     todas as páginas (prop `fixed` do @react-pdf).                       │
// │ As colunas invoice_number/invoice_series/invoice_atcud de direct_sales    │
// │ existem para o futuro módulo certificado e não são lidas aqui.           │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Valores: são usados TAL COMO vêm gravados — nunca recalculados. O subtotal e
// o total vêm do cabeçalho da venda (as linhas internas, visible_to_client =
// false, já não entram nesses valores) e o IVA é a diferença entre os dois,
// exatamente como o portal do cliente faz (ClientPortalDirectSaleDetail.tsx:
// 411-423). Somar as linhas aqui divergiria do que o comercial vê.
//
// Custos: cost_price e margem_percent NUNCA entram neste documento — não fazem
// parte das props de propósito, para não poderem ser impressos por engano.

Font.registerHyphenationCallback((word) => [word]);

/** Aviso legal obrigatório — tem de continuar visível em todas as páginas. */
export const PROFORMA_LEGAL_NOTICE =
  'Documento não fiscal. Não serve de fatura nem confere direito a dedução de IVA.';

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    // Espaço reservado para o rodapé fixo (aviso legal + dados da empresa).
    paddingBottom: 92,
    paddingHorizontal: 35,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottom: '2 solid #111827',
  },
  headerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  companyName: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 3,
  },
  companyLine: {
    fontSize: 8,
    color: '#4b5563',
    marginBottom: 1,
  },
  logo: {
    width: 130,
    height: 60,
    objectFit: 'contain',
  },
  docBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 2,
  },
  titleSub: {
    fontSize: 8,
    color: '#6b7280',
  },
  // Largura fixa e `flexShrink: 0`: sem isto o bloco encolhia por causa do
  // título ao lado e os valores saíam cortados ("PF-2026" em vez de
  // "PF-2026-0001") — a hifenização está desligada, logo nada quebra a palavra.
  docMeta: {
    width: 215,
    flexShrink: 0,
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  metaLabel: {
    width: '48%',
    fontSize: 9,
    color: '#4b5563',
  },
  metaValue: {
    width: '52%',
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 5,
    backgroundColor: '#f3f4f6',
    padding: 5,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  label: {
    width: '22%',
    fontSize: 9,
    fontWeight: 'bold',
  },
  value: {
    width: '78%',
    fontSize: 9,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#374151',
    color: '#ffffff',
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 8,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #e5e7eb',
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 8,
  },
  emptyRow: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    fontSize: 8,
    color: '#6b7280',
  },
  totalsWrapper: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  totalsBox: {
    width: '46%',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalsGrandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    marginTop: 3,
    borderTop: '1 solid #111827',
  },
  totalsLabel: {
    fontSize: 9,
    color: '#4b5563',
  },
  totalsValue: {
    fontSize: 9,
    textAlign: 'right',
  },
  totalsGrandLabel: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  totalsGrandValue: {
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  notes: {
    marginTop: 14,
    fontSize: 8,
    color: '#4b5563',
  },
  fixedFooter: {
    position: 'absolute',
    bottom: 18,
    left: 35,
    right: 35,
    paddingTop: 8,
    borderTop: '1 solid #d1d5db',
  },
  legalNotice: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  footerText: {
    fontSize: 7,
    color: '#6b7280',
    marginBottom: 1,
  },
  footerPage: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    fontSize: 7,
    color: '#6b7280',
  },
});

const columnStyles = {
  description: { width: '36%', fontSize: 8 },
  quantity: { width: '10%', fontSize: 8, textAlign: 'right' as const },
  unit: { width: '10%', fontSize: 8, textAlign: 'center' as const },
  unitPrice: { width: '16%', fontSize: 8, textAlign: 'right' as const },
  vat: { width: '10%', fontSize: 8, textAlign: 'right' as const },
  lineTotal: { width: '18%', fontSize: 8, textAlign: 'right' as const },
};

/** Empresa emitente — já resolvida pelo chamador (logótipo em base64). */
export interface ProformaPdfCompany {
  name: string | null;
  vat: string | null;
  address: string | null;
  email?: string | null;
  phone?: string | null;
  /** Data URI (base64). Uma URL crua também renderiza, mas falha em contextos sem acesso ao storage. */
  logo_url?: string | null;
}

/** Cliente da venda direta. */
export interface ProformaPdfClient {
  name: string | null;
  vat: string | null;
  address: string | null;
}

/**
 * Cabeçalho da venda direta, tal como está gravado.
 * `subtotal`/`total` são os valores do cabeçalho — nunca somas de linhas.
 */
export interface ProformaPdfSale {
  sale_number: string | null;
  proforma_number: string | null;
  proforma_issued_at: string | null;
  title?: string | null;
  client_notes?: string | null;
  currency?: string | null;
  subtotal: number | null;
  total: number | null;
  iva_rate?: number | null;
}

/** Linha da venda direta (só as visíveis ao cliente chegam aqui). */
export interface ProformaPdfLine {
  id: string;
  descricao_snapshot: string | null;
  qt: number | null;
  unidade: string | null;
  retail_price_unit: number | null;
  iva_percent: number | null;
  total_sem_iva: number | null;
  total_com_iva: number | null;
  total_com_desconto: number | null;
}

export interface ProformaPDFDocumentProps {
  sale: ProformaPdfSale;
  lines: ProformaPdfLine[];
  company: ProformaPdfCompany;
  client: ProformaPdfClient;
}

/**
 * Formatação monetária sem `Intl`: o Intl pt-PT produz um espaço estreito
 * não-quebrável antes do símbolo, que as fontes standard do PDF não têm — sai
 * um caractere em falta. Formatação manual, determinística.
 */
function formatMoney(value: number | null | undefined, currency?: string | null): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const negative = safe < 0;
  const [intPart, decPart] = Math.abs(safe).toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const amount = `${negative ? '-' : ''}${grouped},${decPart}`;
  const code = (currency || 'EUR').toUpperCase();
  return code === 'EUR' ? `${amount} EUR` : `${amount} ${code}`;
}

/** Quantidade: sem casas decimais quando é inteira, 2 casas quando não é. */
function formatQuantity(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return Number.isInteger(safe) ? String(safe) : safe.toFixed(2).replace('.', ',');
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Total da linha tal como foi gravado (com IVA), sem recalcular nada — mesma ordem de fallback do portal. */
function lineTotal(line: ProformaPdfLine): number {
  return line.total_com_desconto ?? line.total_com_iva ?? line.total_sem_iva ?? 0;
}

export const ProformaPDFDocument = ({ sale, lines, company, client }: ProformaPDFDocumentProps) => {
  const rows = lines || [];
  const currency = sale.currency;

  // Totais do cabeçalho; IVA é a diferença, nunca uma soma nova.
  const subtotal = sale.subtotal ?? 0;
  const total = sale.total ?? 0;
  const ivaValue = total - subtotal;

  // Etiqueta do IVA: taxa única quando todas as linhas partilham a mesma,
  // senão só "IVA" (mesma regra do portal).
  const lineRates = Array.from(new Set(rows.map((l) => Number(l.iva_percent ?? 0))));
  const ivaLabel =
    lineRates.length === 1
      ? `IVA (${lineRates[0]}%)`
      : lineRates.length === 0 && sale.iva_rate != null
        ? `IVA (${Number(sale.iva_rate)}%)`
        : 'IVA';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Cabeçalho da empresa emitente — repetido em todas as páginas. */}
        <View fixed style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.companyName}>{company?.name || ''}</Text>
            {company?.vat ? <Text style={styles.companyLine}>NIF: {company.vat}</Text> : null}
            {company?.address ? <Text style={styles.companyLine}>{company.address}</Text> : null}
            {company?.phone ? <Text style={styles.companyLine}>Tel.: {company.phone}</Text> : null}
            {company?.email ? <Text style={styles.companyLine}>{company.email}</Text> : null}
          </View>
          {company?.logo_url ? <Image src={company.logo_url} style={styles.logo} /> : null}
        </View>

        {/* Título e identificação do documento. */}
        <View style={styles.docBlock}>
          <View>
            <Text style={styles.title}>PROFORMA</Text>
            <Text style={styles.titleSub}>Documento não fiscal</Text>
          </View>
          <View style={styles.docMeta}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>N.º da proforma</Text>
              <Text style={styles.metaValue}>{sale.proforma_number || '—'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Data de emissão</Text>
              <Text style={styles.metaValue}>{formatDate(sale.proforma_issued_at)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Venda direta</Text>
              <Text style={styles.metaValue}>{sale.sale_number || '—'}</Text>
            </View>
          </View>
        </View>

        {/* Cliente */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CLIENTE</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nome:</Text>
            <Text style={styles.value}>{client?.name || '—'}</Text>
          </View>
          {client?.vat ? (
            <View style={styles.row}>
              <Text style={styles.label}>NIF:</Text>
              <Text style={styles.value}>{client.vat}</Text>
            </View>
          ) : null}
          {client?.address ? (
            <View style={styles.row}>
              <Text style={styles.label}>Morada:</Text>
              <Text style={styles.value}>{client.address}</Text>
            </View>
          ) : null}
        </View>

        {/* Linhas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {sale.title ? `DESCRIÇÃO — ${sale.title}` : 'DESCRIÇÃO'}
          </Text>
          {/* `fixed` no cabeçalho da tabela: repete-o no topo de cada página. */}
          <View fixed style={styles.tableHeader}>
            <Text style={columnStyles.description}>Descrição</Text>
            <Text style={columnStyles.quantity}>Qt.</Text>
            <Text style={columnStyles.unit}>Un.</Text>
            <Text style={columnStyles.unitPrice}>Preço unit.</Text>
            <Text style={columnStyles.vat}>IVA</Text>
            <Text style={columnStyles.lineTotal}>Total</Text>
          </View>

          {rows.map((line) => (
            <View key={line.id} style={styles.tableRow} wrap={false}>
              <Text style={columnStyles.description}>{line.descricao_snapshot || ''}</Text>
              <Text style={columnStyles.quantity}>{formatQuantity(line.qt)}</Text>
              <Text style={columnStyles.unit}>{line.unidade || '—'}</Text>
              <Text style={columnStyles.unitPrice}>{formatMoney(line.retail_price_unit, currency)}</Text>
              <Text style={columnStyles.vat}>{`${Number(line.iva_percent ?? 0)}%`}</Text>
              <Text style={columnStyles.lineTotal}>{formatMoney(lineTotal(line), currency)}</Text>
            </View>
          ))}

          {rows.length === 0 ? (
            <Text style={styles.emptyRow}>Sem linhas nesta venda direta.</Text>
          ) : null}
        </View>

        {/* Totais — do cabeçalho da venda, nunca somados a partir das linhas. */}
        <View style={styles.totalsWrapper} wrap={false}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal (s/ IVA)</Text>
              <Text style={styles.totalsValue}>{formatMoney(subtotal, currency)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>{ivaLabel}</Text>
              <Text style={styles.totalsValue}>{formatMoney(ivaValue, currency)}</Text>
            </View>
            <View style={styles.totalsGrandRow}>
              <Text style={styles.totalsGrandLabel}>Total</Text>
              <Text style={styles.totalsGrandValue}>{formatMoney(total, currency)}</Text>
            </View>
          </View>
        </View>

        {sale.client_notes ? (
          <View style={styles.notes}>
            <Text>{sale.client_notes}</Text>
          </View>
        ) : null}

        {/* Rodapé fixo: o aviso legal aparece em TODAS as páginas. */}
        <View fixed style={styles.fixedFooter}>
          <Text style={styles.legalNotice}>{PROFORMA_LEGAL_NOTICE}</Text>
          {company?.name ? <Text style={styles.footerText}>{company.name}</Text> : null}
          {company?.vat ? <Text style={styles.footerText}>NIF: {company.vat}</Text> : null}
          {company?.address ? <Text style={styles.footerText}>{company.address}</Text> : null}
          <Text
            style={styles.footerPage}
            render={({ pageNumber, totalPages }) => `Pág. ${pageNumber}/${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
};

export default ProformaPDFDocument;
