import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

// Venda Direta — Fase 6A: DOCUMENTO INTERNO (custo e margem).
//
// Molde: ProformaPDFDocument.tsx, com a mesma linguagem visual para não haver
// duas estéticas no mesmo módulo. Mas o conteúdo é o oposto: este documento
// existe precisamente para mostrar o que a proforma esconde.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ ESTE DOCUMENTO NUNCA VAI PARA O CLIENTE                                  │
// │ Leva custos de compra e margens. É visualmente parecido com a proforma,  │
// │ que VAI para o cliente, por isso o aviso "DOCUMENTO INTERNO" está no     │
// │ título, numa tarja, e repetido FIXO no rodapé de todas as páginas — para │
// │ que uma folha solta impressa não possa ser confundida.                   │
// │ Acesso no frontend: permissão `quotes.view_costs`.                       │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Ao contrário da proforma, aqui as LINHAS INTERNAS (visible_to_client = false)
// aparecem, assinaladas. É o único documento onde aparecem, e é a razão de ser
// dele: uma linha que não é cobrada continua a ter custo e a destruir margem.
// Sem isto, esse custo não se vê em lado nenhum.
//
// Receita: usa `direct_sales.total`/`subtotal` do cabeçalho, que já contam só
// as linhas visíveis — o mesmo valor que o cliente aceitou. O custo é somado a
// partir de TODAS as linhas. A margem é a diferença entre os dois, e é por isso
// que ela reflete o peso das linhas internas sem que estas inflacionem a
// receita.

Font.registerHyphenationCallback((word) => [word]);

/** Aviso que tem de continuar visível em todas as páginas. */
export const INTERNAL_DOC_NOTICE =
  'DOCUMENTO INTERNO — contém custos e margens. Não enviar ao cliente.';

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
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
  headerLeft: { flex: 1, paddingRight: 12 },
  companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  companyLine: { fontSize: 8, color: '#4b5563', marginBottom: 1 },
  logo: { width: 90, height: 45, objectFit: 'contain' },

  // Tarja de aviso — o elemento mais visível da primeira página.
  warningBanner: {
    backgroundColor: '#7f1d1d',
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  warningText: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },

  docBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  titleSub: { fontSize: 8, color: '#6b7280', marginTop: 2 },
  docMeta: { minWidth: 190 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  metaLabel: { fontSize: 8, color: '#6b7280' },
  metaValue: { fontSize: 8, fontFamily: 'Helvetica-Bold' },

  section: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 5,
    paddingBottom: 3,
    borderBottom: '1 solid #d1d5db',
    letterSpacing: 0.4,
  },
  row: { flexDirection: 'row', marginBottom: 2 },
  label: { width: 70, fontSize: 8, color: '#6b7280' },
  value: { flex: 1, fontSize: 8 },

  tableHeader: {
    flexDirection: 'row',
    borderBottom: '1 solid #111827',
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottom: '1 solid #f3f4f6',
  },
  emptyRow: { fontSize: 8, color: '#6b7280', paddingVertical: 8 },
  internalTag: { fontSize: 7, color: '#b45309', marginTop: 1 },
  negative: { color: '#b91c1c' },

  totalsWrapper: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  totalsBox: { minWidth: 240 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  totalsGrandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 5,
    borderTop: '1 solid #111827',
  },
  totalsLabel: { fontSize: 8, color: '#4b5563' },
  totalsValue: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  totalsGrandLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  totalsGrandValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },

  warningNote: {
    marginTop: 10,
    padding: 6,
    border: '1 solid #b45309',
    backgroundColor: '#fffbeb',
    fontSize: 7.5,
    color: '#7c2d12',
  },
  fixedFooter: {
    position: 'absolute',
    bottom: 22,
    left: 35,
    right: 35,
    borderTop: '1 solid #d1d5db',
    paddingTop: 6,
  },
  legalNotice: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#7f1d1d',
    marginBottom: 3,
  },
  footerText: { fontSize: 7, color: '#6b7280' },
  footerPage: { position: 'absolute', right: 0, bottom: 0, fontSize: 7, color: '#6b7280' },
});

const columnStyles = {
  description: { width: '30%', fontSize: 8 },
  quantity: { width: '8%', fontSize: 8, textAlign: 'right' as const },
  unitCost: { width: '13%', fontSize: 8, textAlign: 'right' as const },
  unitPrice: { width: '13%', fontSize: 8, textAlign: 'right' as const },
  totalCost: { width: '12%', fontSize: 8, textAlign: 'right' as const },
  totalSale: { width: '12%', fontSize: 8, textAlign: 'right' as const },
  marginPct: { width: '6%', fontSize: 8, textAlign: 'right' as const },
  marginAbs: { width: '12%', fontSize: 8, textAlign: 'right' as const },
};

export interface InternalSaleCompany {
  name?: string | null;
  vat?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
}

export interface InternalSaleClient {
  name: string | null;
  vat: string | null;
  address: string | null;
}

/** Cabeçalho da venda. `subtotal`/`total` já contam só as linhas visíveis. */
export interface InternalSaleHeader {
  sale_number: string | null;
  status: string | null;
  title?: string | null;
  notes?: string | null;
  currency?: string | null;
  subtotal: number | null;
  total: number | null;
  created_at?: string | null;
}

/** Linha da venda — aqui entram TODAS, incluindo as internas. */
export interface InternalSaleLine {
  id: string;
  descricao_snapshot: string | null;
  qt: number | null;
  unidade: string | null;
  /**
   * Custo unitário resolvido do CATÁLOGO pelo gerador (product_prices /
   * service_prices, price_type='purchase'), não o `cost_price` gravado na
   * linha — esse fica a 0 em tudo o que venha de um bundle.
   * `null` significa "o catálogo não tem preço de compra", e o documento tem de
   * o dizer em vez de imprimir 0: um zero lê-se como "de graça" e inflaciona a
   * margem sem avisar.
   */
  cost_price: number | null;
  retail_price_unit: number | null;
  total_sem_iva: number | null;
  total_com_desconto: number | null;
  visible_to_client: boolean;
}

export interface InternalSaleDocumentPDFProps {
  sale: InternalSaleHeader;
  lines: InternalSaleLine[];
  company: InternalSaleCompany;
  client: InternalSaleClient;
}

/**
 * Formatação monetária sem `Intl` — cópia deliberada de ProformaPDFDocument:
 * o Intl pt-PT produz um espaço estreito não-quebrável que as fontes standard
 * do PDF não têm, e sai um caractere em falta.
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

/** Percentagem com uma casa; '—' quando não é calculável (receita nula). */
function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(0)}%`;
}

/**
 * Custo total da linha: custo unitário × quantidade.
 * `null` quando o catálogo não tem preço de compra — nunca 0, para o documento
 * poder distinguir "custa zero" de "não sei quanto custa".
 */
function lineCost(line: InternalSaleLine): number | null {
  if (line.cost_price === null || line.cost_price === undefined) return null;
  return Number(line.cost_price) * Number(line.qt ?? 0);
}

/**
 * Receita da linha, sem IVA. Uma linha interna não é cobrada, logo a sua
 * receita é ZERO — independentemente do preço que lá esteja gravado. É essa
 * assimetria (custo sim, receita não) que faz a margem dela ser negativa, que
 * é exatamente o que este documento tem de mostrar.
 */
function lineRevenue(line: InternalSaleLine): number {
  if (!line.visible_to_client) return 0;
  return Number(line.total_sem_iva ?? line.total_com_desconto ?? 0);
}

export const InternalSaleDocumentPDF = ({ sale, lines, company, client }: InternalSaleDocumentPDFProps) => {
  const rows = lines || [];
  const currency = sale.currency;

  // Só os custos conhecidos entram na soma. As linhas sem custo no catálogo
  // são contadas à parte e avisadas: sem isso, a margem apareceria maior do que
  // é e ninguém saberia porquê.
  const linesWithoutCost = rows.filter((l) => lineCost(l) === null);
  const totalCost = rows.reduce((acc, l) => acc + (lineCost(l) ?? 0), 0);
  // Receita do cabeçalho (o que o cliente paga, sem IVA), não uma soma nova —
  // mesma regra da proforma, para os dois documentos não divergirem.
  const revenue = sale.subtotal ?? 0;
  const margin = revenue - totalCost;
  const marginPct = revenue !== 0 ? (margin / revenue) * 100 : null;

  const hiddenLines = rows.filter((l) => !l.visible_to_client);
  const hiddenCost = hiddenLines.reduce((acc, l) => acc + (lineCost(l) ?? 0), 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View fixed style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.companyName}>{company?.name || ''}</Text>
            {company?.vat ? <Text style={styles.companyLine}>NIF: {company.vat}</Text> : null}
            {company?.address ? <Text style={styles.companyLine}>{company.address}</Text> : null}
          </View>
          {company?.logo_url ? <Image src={company.logo_url} style={styles.logo} /> : null}
        </View>

        {/* Tarja — primeira coisa que se lê na folha. */}
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>{INTERNAL_DOC_NOTICE}</Text>
        </View>

        <View style={styles.docBlock}>
          <View>
            <Text style={styles.title}>ANÁLISE DE MARGEM</Text>
            <Text style={styles.titleSub}>Uso interno</Text>
          </View>
          <View style={styles.docMeta}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Venda direta</Text>
              <Text style={styles.metaValue}>{sale.sale_number || '—'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Estado</Text>
              <Text style={styles.metaValue}>{sale.status || '—'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Criada em</Text>
              <Text style={styles.metaValue}>{formatDate(sale.created_at)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Emitido em</Text>
              <Text style={styles.metaValue}>{formatDate(new Date().toISOString())}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CLIENTE</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nome</Text>
            <Text style={styles.value}>{client?.name || '—'}</Text>
          </View>
          {client?.vat ? (
            <View style={styles.row}>
              <Text style={styles.label}>NIF</Text>
              <Text style={styles.value}>{client.vat}</Text>
            </View>
          ) : null}
          {sale.title ? (
            <View style={styles.row}>
              <Text style={styles.label}>Assunto</Text>
              <Text style={styles.value}>{sale.title}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LINHAS</Text>

          <View fixed style={styles.tableHeader}>
            <Text style={columnStyles.description}>Descrição</Text>
            <Text style={columnStyles.quantity}>Qt.</Text>
            <Text style={columnStyles.unitCost}>Custo un.</Text>
            <Text style={columnStyles.unitPrice}>Preço un.</Text>
            <Text style={columnStyles.totalCost}>Custo</Text>
            <Text style={columnStyles.totalSale}>Venda</Text>
            <Text style={columnStyles.marginPct}>Mg%</Text>
            <Text style={columnStyles.marginAbs}>Margem</Text>
          </View>

          {rows.map((line) => {
            const cost = lineCost(line);
            const rev = lineRevenue(line);
            // Sem custo conhecido não se inventa margem: a linha mostra "—" em
            // vez de um número que pareceria 100%.
            const mg = cost === null ? null : rev - cost;
            const mgPct = mg !== null && rev !== 0 ? (mg / rev) * 100 : null;
            return (
              <View key={line.id} style={styles.tableRow} wrap={false}>
                <View style={columnStyles.description}>
                  <Text>{line.descricao_snapshot || '—'}</Text>
                  {!line.visible_to_client ? (
                    <Text style={styles.internalTag}>Linha interna — não cobrada ao cliente</Text>
                  ) : null}
                  {cost === null ? (
                    <Text style={styles.internalTag}>Sem preço de compra no catálogo</Text>
                  ) : null}
                </View>
                <Text style={columnStyles.quantity}>{formatQuantity(line.qt)}</Text>
                <Text style={columnStyles.unitCost}>
                  {line.cost_price === null ? '—' : formatMoney(line.cost_price, currency)}
                </Text>
                <Text style={columnStyles.unitPrice}>
                  {line.visible_to_client ? formatMoney(line.retail_price_unit, currency) : '—'}
                </Text>
                <Text style={columnStyles.totalCost}>
                  {cost === null ? '—' : formatMoney(cost, currency)}
                </Text>
                <Text style={columnStyles.totalSale}>{formatMoney(rev, currency)}</Text>
                <Text style={columnStyles.marginPct}>{formatPercent(mgPct)}</Text>
                <Text style={[columnStyles.marginAbs, ...(mg !== null && mg < 0 ? [styles.negative] : [])]}>
                  {mg === null ? '—' : formatMoney(mg, currency)}
                </Text>
              </View>
            );
          })}

          {rows.length === 0 ? (
            <Text style={styles.emptyRow}>Sem linhas nesta venda direta.</Text>
          ) : null}
        </View>

        <View style={styles.totalsWrapper} wrap={false}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Custo total</Text>
              <Text style={styles.totalsValue}>{formatMoney(totalCost, currency)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Receita (s/ IVA)</Text>
              <Text style={styles.totalsValue}>{formatMoney(revenue, currency)}</Text>
            </View>
            {hiddenLines.length > 0 ? (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>
                  {hiddenLines.length === 1 ? '1 linha interna (custo)' : `${hiddenLines.length} linhas internas (custo)`}
                </Text>
                <Text style={[styles.totalsValue, styles.negative]}>
                  {formatMoney(-hiddenCost, currency)}
                </Text>
              </View>
            ) : null}
            <View style={styles.totalsGrandRow}>
              <Text style={styles.totalsGrandLabel}>
                {linesWithoutCost.length > 0 ? 'Margem (incompleta)' : 'Margem'}
              </Text>
              <Text style={[styles.totalsGrandValue, ...(margin < 0 ? [styles.negative] : [])]}>
                {formatMoney(margin, currency)}
                {marginPct !== null ? `  (${formatPercent(marginPct)})` : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Sem isto, uma venda com artigos sem preço de compra sairia com a
            margem inflacionada e sem nada que o denunciasse. */}
        {linesWithoutCost.length > 0 ? (
          <View style={styles.warningNote} wrap={false}>
            <Text>
              {linesWithoutCost.length === 1
                ? '1 linha não tem preço de compra no catálogo, por isso o seu custo não entra nesta conta.'
                : `${linesWithoutCost.length} linhas não têm preço de compra no catálogo, por isso o custo delas não entra nesta conta.`}
              {' '}A margem acima é o valor MÁXIMO possível — a real é menor.
            </Text>
          </View>
        ) : null}

        <View fixed style={styles.fixedFooter}>
          <Text style={styles.legalNotice}>{INTERNAL_DOC_NOTICE}</Text>
          {company?.name ? <Text style={styles.footerText}>{company.name}</Text> : null}
          <Text
            style={styles.footerPage}
            render={({ pageNumber, totalPages }) => `Pág. ${pageNumber}/${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
};

export default InternalSaleDocumentPDF;
