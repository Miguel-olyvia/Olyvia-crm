import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
// Import só-de-tipos (apagado na compilação): não cria dependência em runtime
// para a página que renderiza este PDF, e evita duplicar a forma do bloco
// `diagnostic` — quem a define e a normaliza é o `ClientOrders.tsx`.
import type { ClientOrderDiagnosticNeed } from '@/pages/ClientOrders';
import { formatOrderLineQuantity } from '@/utils/quotes/lineUom';

// Fase 5.0F do plano de inventário — PDF do documento "Encomenda Cliente"
// (mesmo padrão/biblioteca de PurchaseOrderPDFDocument.tsx). Ao contrário
// daquele PDF, este é texto simples por linha (sem badge colorido) e não tem
// preços/IVA por linha — só produto/SKU/quantidade/estado, tal como pedido.
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 100,
    paddingHorizontal: 35,
    fontFamily: 'Helvetica',
    fontSize: 9,
    backgroundColor: '#ffffff',
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: '#374151',
    marginBottom: 8,
  },
  contractNumber: {
    fontSize: 11,
    color: '#000000',
    marginBottom: 3,
  },
  docDate: {
    fontSize: 9,
    color: '#000000',
    marginBottom: 5,
  },
  logo: {
    width: 160,
    height: 80,
    objectFit: 'contain',
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#000000',
    backgroundColor: '#f3f4f6',
    padding: 5,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  label: {
    width: '25%',
    fontWeight: 'bold',
    color: '#000000',
    fontSize: 9,
  },
  value: {
    width: '75%',
    color: '#000000',
    fontSize: 9,
  },
  table: {
    marginTop: 5,
    marginBottom: 5,
  },
  // Cabeçalho e linhas com o mesmo padding horizontal, para as colunas ficarem
  // alinhadas; o espaço entre células vem do padding de cada coluna.
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#374151',
    paddingVertical: 6,
    paddingHorizontal: 5,
    fontWeight: 'bold',
    color: '#ffffff',
    fontSize: 8,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottom: '1 solid #e5e7eb',
    paddingVertical: 5,
    paddingHorizontal: 5,
    backgroundColor: '#ffffff',
    fontSize: 8,
  },
  // Título de cada grupo de categoria na tabela de linhas.
  groupTitleRow: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderBottom: '1 solid #e5e7eb',
    paddingVertical: 4,
    paddingHorizontal: 9,
    marginTop: 4,
  },
  groupTitleText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#111827',
  },
  // Quadrado vazio para marcar à mão na separação do material.
  checkbox: {
    width: 9,
    height: 9,
    border: '1 solid #374151',
  },
  subcategoryText: {
    fontSize: 7,
    color: '#6b7280',
    marginTop: 1,
  },
  fixedFooter: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    paddingHorizontal: 40,
    paddingTop: 12,
  },
  footerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  footerSection: {
    flex: 1,
  },
  footerTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 3,
  },
  footerText: {
    fontSize: 7,
    color: '#6b7280',
    marginBottom: 1,
  },
  // --- Diagnóstico da obra (mesma linguagem visual das secções acima) ---
  diagnosticNote: {
    fontSize: 7,
    color: '#6b7280',
    marginBottom: 6,
  },
  diagnosticNeed: {
    border: '1 solid #e5e7eb',
    padding: 6,
    marginBottom: 6,
  },
  diagnosticNeedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  diagnosticNeedTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#000000',
    width: '80%',
  },
  diagnosticNeedArea: {
    fontSize: 8,
    color: '#374151',
    width: '20%',
    textAlign: 'right',
  },
  diagnosticFieldRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  diagnosticFieldLabel: {
    width: '30%',
    fontWeight: 'bold',
    color: '#374151',
    fontSize: 8,
  },
  diagnosticFieldValue: {
    width: '70%',
    color: '#000000',
    fontSize: 8,
  },
  diagnosticMaterialsBlock: {
    marginTop: 5,
    paddingTop: 4,
    borderTop: '1 solid #e5e7eb',
  },
  diagnosticMaterialsTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 1,
  },
  diagnosticMaterialRow: {
    flexDirection: 'row',
    marginBottom: 1,
  },
  diagnosticMaterialQty: {
    width: '20%',
    fontSize: 8,
    fontWeight: 'bold',
    color: '#000000',
  },
  diagnosticMaterialDescription: {
    width: '80%',
    fontSize: 8,
    color: '#374151',
  },
});

// Larguras somam 100%. paddingHorizontal separa as células; o Estado leva
// paddingLeft maior para não colar à Qtd. (alinhada à direita).
const columnStyles = {
  check: { width: '5%', paddingHorizontal: 4, paddingTop: 1 },
  sku: { width: '15%', fontSize: 8, paddingHorizontal: 4 },
  description: { width: '38%', fontSize: 8, paddingHorizontal: 4 },
  quantity: { width: '12%', fontSize: 8, paddingHorizontal: 4, textAlign: 'right' as const },
  status: { width: '30%', fontSize: 8, paddingLeft: 10, paddingRight: 4 },
};

// Espelha ClientOrderDocumentLine em src/pages/ClientOrders.tsx: uma linha é de
// produto OU de serviço, e a RPC devolve o par não aplicável a NULL.
interface ClientOrderDocumentPDFLine {
  quote_line_id: string;
  item_type?: 'product' | 'service';
  product_id: string | null;
  product_name: string | null;
  product_sku: string | null;
  service_id?: string | null;
  service_name?: string | null;
  service_sku?: string | null;
  // `quantity` em unidades de stock; line_quantity/unidade = como foi vendido
  // (ex. 2 PK10). stock_unidade é resolvido em ClientOrders.fetchDetail.
  quantity: number;
  line_quantity?: number | null;
  unidade?: string | null;
  units_per_uom?: number | null;
  stock_unidade?: string | null;
  line_status: 'servido_por_stock' | 'recebido' | 'a_aguardar_encomenda' | 'stock_disponivel_confirmar' | 'parcial' | 'sem_fornecedor' | 'servico' | 'nao_recebido_anulado';
  purchase_order_number: string | null;
  // 20261206150000: quantidade anulada nas POs (unidades base) e anulações.
  qty_cancelled?: number | null;
  cancellations?: Array<{
    purchase_order_number?: string | null;
    quantity_cancelled?: number | null;
    reason?: string | null;
    notes?: string | null;
  } | null> | null;
  // 20261204310000: reserva por ordem de assinatura (unidades base).
  component_index?: number | null;
  qty_reserved?: number | null;
  qty_ordered?: number | null;
  qty_received?: number | null;
  qty_missing?: number | null;
  // 20261204340000: quantidade já servida por stock; null em serviços.
  qty_served?: number | null;
  // Só em produtos; null/ausente = desconhecido. Ver ClientOrders.
  has_preferred_supplier?: boolean | null;
  stock_movement_id?: string | null;
  stock_exit_movement_id?: string | null;
  // Categoria principal/subcategoria do produto (null em serviços e produtos
  // sem categoria). Servem só para agrupar a tabela — ver groupLinesByCategory.
  category_name?: string | null;
  subcategory_name?: string | null;
}

interface ClientOrderLineGroup {
  key: string;
  title: string;
  lines: ClientOrderDocumentPDFLine[];
}

const NO_CATEGORY_TITLE = 'Sem categoria';
const SERVICES_TITLE = 'Serviços';

// Agrupa por categoria principal: categorias por ordem alfabética (pt), depois
// "Sem categoria" e, por fim, "Serviços". Dentro de cada grupo mantém-se a
// ordem original das linhas. Os componentes de um bundle são produtos e caem
// cada um na sua categoria.
const groupLinesByCategory = (lines: ClientOrderDocumentPDFLine[]): ClientOrderLineGroup[] => {
  const byCategory = new Map<string, ClientOrderDocumentPDFLine[]>();
  const uncategorised: ClientOrderDocumentPDFLine[] = [];
  const services: ClientOrderDocumentPDFLine[] = [];

  for (const line of lines) {
    // item_type é opcional neste tipo; sem ele, o estado 'servico' identifica-a.
    if (line.item_type === 'service' || (!line.item_type && line.line_status === 'servico')) {
      services.push(line);
      continue;
    }
    const category = line.category_name?.trim();
    if (!category) {
      uncategorised.push(line);
      continue;
    }
    const bucket = byCategory.get(category);
    if (bucket) bucket.push(line);
    else byCategory.set(category, [line]);
  }

  const groups: ClientOrderLineGroup[] = Array.from(byCategory.keys())
    .sort((a, b) => a.localeCompare(b, 'pt', { sensitivity: 'base' }))
    .map((category) => ({ key: `cat:${category}`, title: category, lines: byCategory.get(category) ?? [] }));
  if (uncategorised.length > 0) groups.push({ key: 'no-category', title: NO_CATEGORY_TITLE, lines: uncategorised });
  if (services.length > 0) groups.push({ key: 'services', title: SERVICES_TITLE, lines: services });
  return groups;
};

const formatGroupTitle = (group: ClientOrderLineGroup): string => {
  const count = group.lines.length;
  const noun = group.key === 'services'
    ? (count === 1 ? 'serviço' : 'serviços')
    : (count === 1 ? 'produto' : 'produtos');
  return `${group.title.toLocaleUpperCase('pt-PT')} — ${count} ${noun}`;
};

const pdfQty = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// Quantidade em unidades base com o código da unidade de stock, quando se
// conhece (mesma regra do ecrã em ClientOrders.formatBaseQty).
const formatBaseQty = (value: number, line: ClientOrderDocumentPDFLine): string => {
  const unit = line.stock_unidade || (Number(line.units_per_uom) > 1 ? null : line.unidade) || '';
  const n = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(value);
  return `${n}${unit ? ` ${unit}` : ''}`;
};

// "Parcial — X servido · Y em stock · Z a aguardar fornecedor · W em falta"
// (só as partes > 0; "servido" vem de qty_served, como no ecrã).
const getPartialText = (line: ClientOrderDocumentPDFLine): string => {
  const parts: string[] = [];
  const served = pdfQty(line.qty_served);
  const reserved = pdfQty(line.qty_reserved);
  const ordered = pdfQty(line.qty_ordered);
  const received = pdfQty(line.qty_received);
  const missing = pdfQty(line.qty_missing);
  if (served > 0) parts.push(`${formatBaseQty(served, line)} servido`);
  if (reserved > 0) parts.push(`${formatBaseQty(reserved, line)} em stock`);
  if (ordered > 0) {
    const pending = Math.round((ordered - received) * 1e6) / 1e6;
    if (pending > 0) parts.push(`${formatBaseQty(pending, line)} a aguardar fornecedor${line.purchase_order_number ? ` (${line.purchase_order_number})` : ''}`);
    if (received > 0) parts.push(`${formatBaseQty(received, line)} recebido`);
  }
  if (missing > 0) parts.push(`${formatBaseQty(missing, line)} em falta`);
  return parts.length > 0 ? `Parcial — ${parts.join(' · ')}` : 'Parcial';
};

interface ClientOrderDocumentPDFProps {
  document: {
    contract_id: string;
    contract_number: string;
    client_name: string | null;
    signature_date: string | null;
    total_value: number | null;
    // Preenchidos só quando a encomenda nasceu de uma venda direta (Fase 5).
    direct_sale_number?: string | null;
    proforma_number?: string | null;
    // 20261204290000: número próprio da encomenda, origem e morada de entrega.
    // Opcionais — sem order_number cai para o nº do contrato.
    order_number?: string | null;
    origin_type?: 'contract' | 'direct_sale' | 'manual' | null;
    origin_number?: string | null;
    delivery_address?: string | null;
    lines: ClientOrderDocumentPDFLine[];
    // Cópia congelada do levantamento de necessidades (Fase 1). Opcional:
    // vendas diretas e encomendas manuais não têm diagnóstico e a secção
    // simplesmente não é impressa.
    diagnostic?: ClientOrderDiagnosticNeed[];
  };
  company?: {
    name?: string | null;
    logo_url?: string | null;
    vat?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  } | null;
}

const PO_CANCELLATION_REASON_TEXT: Record<string, string> = {
  found_stock: 'Encontrei stock / outra solução',
  supplier_unavailable: 'Fornecedor sem produto',
  other: 'Outro',
};

// " na PO-1 (motivo)" — mesma regra do ecrã (ClientOrders.getLineCancellationRefs).
const getCancellationRefsText = (line: ClientOrderDocumentPDFLine): string => {
  const list = Array.isArray(line.cancellations) ? line.cancellations : [];
  const pos = Array.from(new Set(list.map((c) => c?.purchase_order_number).filter((n): n is string => !!n)));
  if (pos.length === 0 && line.purchase_order_number) pos.push(line.purchase_order_number);
  const reasons = Array.from(new Set(list.map((c) => {
    if (!c) return '';
    if (c.reason === 'other') return c.notes?.trim() || PO_CANCELLATION_REASON_TEXT.other;
    return (c.reason && PO_CANCELLATION_REASON_TEXT[c.reason]) || c.reason || '';
  }).filter(Boolean)));
  return `${pos.length > 0 ? ` na ${pos.join(', ')}` : ''}${reasons.length > 0 ? ` (${reasons.join('; ')})` : ''}`;
};

// Parte anulada numa linha recebida/servida/parcial; vazio sem anulação.
const getCancelledSuffixText = (line: ClientOrderDocumentPDFLine): string => {
  if (!['recebido', 'servido_por_stock', 'parcial'].includes(line.line_status)) return '';
  const cancelled = pdfQty(line.qty_cancelled);
  if (cancelled <= 0) return '';
  return ` · ${formatBaseQty(cancelled, line)} não será recebido — anulado${getCancellationRefsText(line)}`;
};

const getLineStatusText = (line: ClientOrderDocumentPDFLine): string =>
  `${getBaseLineStatusText(line)}${getCancelledSuffixText(line)}`;

const getBaseLineStatusText = (line: ClientOrderDocumentPDFLine): string => {
  switch (line.line_status) {
    case 'nao_recebido_anulado':
      return `Não será recebido — anulado${getCancellationRefsText(line)}`;
    case 'servido_por_stock':
      return 'Servido por Stock';
    case 'recebido': {
      const base = line.purchase_order_number ? `Recebido (${line.purchase_order_number})` : 'Recebido';
      const served = pdfQty(line.qty_served);
      return served > 0 ? `${base} — ${formatBaseQty(served, line)} servido do stock` : base;
    }
    case 'a_aguardar_encomenda':
      return line.purchase_order_number ? `A aguardar Encomenda ${line.purchase_order_number}` : 'A aguardar Encomenda';
    case 'stock_disponivel_confirmar':
      return 'Stock disponível — confirmar saída';
    case 'parcial':
      return getPartialText(line);
    case 'sem_fornecedor':
      // Quantidade em falta sem pedido ao fornecedor; a causa depende de
      // has_preferred_supplier (mesmos textos do ecrã).
      if (line.has_preferred_supplier === true) return 'Em falta — por pedir ao fornecedor';
      if (line.has_preferred_supplier === false) return 'Sem fornecedor preferencial';
      return 'Em falta — sem pedido ao fornecedor';
    case 'servico':
      return 'Serviço';
    default:
      return line.line_status;
  }
};

// Mesmo formato do diálogo (separador decimal PT, no máximo 2 casas), para o
// papel e o ecrã mostrarem exactamente o mesmo número.
const formatDiagnosticNumber = (value: number): string =>
  new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(value);

// Só os campos preenchidos entram no PDF — rótulos sem valor não se imprimem.
// A ordem espelha a da secção "Diagnóstico da obra" do diálogo.
const getDiagnosticFields = (need: ClientOrderDiagnosticNeed): Array<{ label: string; value: string }> => {
  const fields: Array<{ label: string; value: string }> = [];
  if (need.diag_demolir_descricao) {
    fields.push({ label: 'Demolir:', value: need.diag_demolir_descricao });
  }
  if (need.diag_demolir_m2 !== null && need.diag_demolir_m2 !== undefined) {
    fields.push({ label: 'Área a demolir:', value: `${formatDiagnosticNumber(need.diag_demolir_m2)} m²` });
  }
  if (need.diag_proteger_descricao) {
    fields.push({ label: 'Proteger:', value: need.diag_proteger_descricao });
  }
  if (need.diag_intervencao_tipo) {
    fields.push({ label: 'Tipo de intervenção:', value: need.diag_intervencao_tipo });
  }
  if (need.diag_intervencao_descricao) {
    fields.push({ label: 'Descrição da intervenção:', value: need.diag_intervencao_descricao });
  }
  return fields;
};

// Texto da origem para o cabeçalho — mesma regra do ecrã (ClientOrders.tsx):
// contrato → "Contrato CC-…"; venda direta → "Venda Direta VD-…" (nº da query a
// direct_sales se origin_number vier null); manual → "Sem documento anterior".
// Sem origin_type (RPC antiga) só se mostra a venda direta, como antes.
const getOriginText = (doc: ClientOrderDocumentPDFProps['document']): string | null => {
  const proforma = doc.proforma_number ? ` · Proforma ${doc.proforma_number}` : '';
  if (doc.origin_type === 'direct_sale' || (!doc.origin_type && doc.direct_sale_number)) {
    const number = doc.origin_number || doc.direct_sale_number || '';
    return `Venda Direta${number ? ` ${number}` : ''}${proforma}`;
  }
  if (doc.origin_type === 'contract') return `Contrato ${doc.origin_number || doc.contract_number || ''}`.trim();
  if (doc.origin_type === 'manual') return 'Sem documento anterior';
  return null;
};

export const ClientOrderDocumentPDF = ({ document, company }: ClientOrderDocumentPDFProps) => {
  const lines = document.lines || [];
  const diagnostic = document.diagnostic || [];
  const originText = getOriginText(document);
  const groups = groupLinesByCategory(lines);

  // Uma linha da tabela. Os componentes de bundle partilham quote_line_id e
  // distinguem-se pelo component_index (mesma chave de antes).
  const renderLine = (line: ClientOrderDocumentPDFLine) => {
    const qty = formatOrderLineQuantity(line);
    const subcategory = line.subcategory_name?.trim();
    return (
      <View key={`${line.quote_line_id}:${line.component_index ?? 0}`} style={styles.tableRow} wrap={false}>
        <View style={columnStyles.check}>
          <View style={styles.checkbox} />
        </View>
        <Text style={columnStyles.sku}>{line.product_sku || line.service_sku || '-'}</Text>
        <View style={columnStyles.description}>
          <Text style={{ fontSize: 8 }}>{line.product_name || line.service_name || ''}</Text>
          {subcategory && <Text style={styles.subcategoryText}>{subcategory}</Text>}
        </View>
        <Text style={columnStyles.quantity}>
          {qty.stock ? `${qty.main}\n${qty.stock}` : qty.main}
        </Text>
        <Text style={columnStyles.status}>{getLineStatusText(line)}</Text>
      </View>
    );
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View fixed style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 15,
          paddingBottom: 12,
          borderBottom: '2 solid #000000',
        }}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>ENCOMENDA CLIENTE</Text>
            <Text style={styles.subtitle}>Nota de Satisfação de Encomenda</Text>
            <Text style={styles.contractNumber}>
              Encomenda: {document.order_number || document.contract_number || 'N/A'}
            </Text>
            {document.signature_date && (
              <Text style={styles.docDate}>
                Data de Assinatura: {new Date(document.signature_date).toLocaleDateString('pt-PT')}
              </Text>
            )}
            {originText && (
              <Text style={styles.docDate}>Origem: {originText}</Text>
            )}
          </View>
          {company?.logo_url && (
            <Image src={company.logo_url} style={styles.logo} />
          )}
        </View>

        {/* Client Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CLIENTE</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nome:</Text>
            <Text style={styles.value}>{document.client_name || ''}</Text>
          </View>
          {document.delivery_address && (
            <View style={styles.row}>
              <Text style={styles.label}>Morada de entrega:</Text>
              <Text style={styles.value}>{document.delivery_address}</Text>
            </View>
          )}
          {document.total_value !== null && document.total_value !== undefined && (
            <View style={styles.row}>
              <Text style={styles.label}>Valor Total:</Text>
              <Text style={styles.value}>€{Number(document.total_value).toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* Lines Table */}
        <View fixed style={styles.section}>
          <Text style={styles.sectionTitle}>LINHAS DE PRODUTO</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              {/* Coluna da caixa de verificação: cabeçalho em branco. */}
              <View style={columnStyles.check} />
              <Text style={columnStyles.sku}>SKU</Text>
              <Text style={columnStyles.description}>Produto</Text>
              <Text style={columnStyles.quantity}>Qtd.</Text>
              <Text style={columnStyles.status}>Estado</Text>
            </View>
          </View>
        </View>

        <View>
          {groups.map((group) => {
            const [firstLine, ...otherLines] = group.lines;
            return (
              <View key={group.key}>
                {/* Título + primeira linha juntos, para o título nunca ficar
                    sozinho no fundo da página. */}
                <View wrap={false}>
                  <View style={styles.groupTitleRow}>
                    <Text style={styles.groupTitleText}>{formatGroupTitle(group)}</Text>
                  </View>
                  {firstLine && renderLine(firstLine)}
                </View>
                {otherLines.map(renderLine)}
              </View>
            );
          })}
          {lines.length === 0 && (
            <View style={styles.tableRow}>
              <Text style={{ fontSize: 8 }}>Sem linhas de produto para este contrato.</Text>
            </View>
          )}
        </View>

        {/* Diagnóstico da obra — o que o armazém vai executar. Cópia congelada
            do levantamento de necessidades; sem diagnóstico não se imprime nada
            (nem título, nem espaço), que é o caso das vendas diretas e das
            encomendas manuais. */}
        {diagnostic.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <View wrap={false}>
              <Text style={styles.sectionTitle}>DIAGNÓSTICO DA OBRA</Text>
              <Text style={styles.diagnosticNote}>
                Cópia do diagnóstico no momento em que o orçamento foi gravado. Não faz parte das
                linhas da encomenda.
              </Text>
            </View>

            {diagnostic.map((need, needIndex) => {
              const fields = getDiagnosticFields(need);
              // Uma necessidade e os seus materiais mantêm-se juntos; só se
              // deixa partir quando o bloco é grande de mais para uma página e
              // o `wrap={false}` passaria a cortar conteúdo.
              const keepTogether = need.materials.length <= 12;

              return (
                <View
                  key={need.deal_need_id || `diag-${needIndex}`}
                  style={styles.diagnosticNeed}
                  wrap={!keepTogether}
                >
                  <View style={styles.diagnosticNeedHeader}>
                    <Text style={styles.diagnosticNeedTitle}>
                      {need.need_title || 'Necessidade sem título'}
                    </Text>
                    {need.diag_area_m2 !== null && need.diag_area_m2 !== undefined && (
                      <Text style={styles.diagnosticNeedArea}>
                        {formatDiagnosticNumber(need.diag_area_m2)} m²
                      </Text>
                    )}
                  </View>

                  {fields.map((field) => (
                    <View key={field.label} style={styles.diagnosticFieldRow}>
                      <Text style={styles.diagnosticFieldLabel}>{field.label}</Text>
                      <Text style={styles.diagnosticFieldValue}>{field.value}</Text>
                    </View>
                  ))}

                  {need.materials.length > 0 && (
                    <View style={styles.diagnosticMaterialsBlock}>
                      <Text style={styles.diagnosticMaterialsTitle}>
                        MATERIAIS PREVISTOS — INFORMATIVO PARA O ARMAZÉM
                      </Text>
                      <Text style={styles.diagnosticNote}>
                        Não são linhas da encomenda, não têm preço e não somam ao total.
                      </Text>
                      {need.materials.map((material, materialIndex) => (
                        <View
                          key={`${need.deal_need_id || needIndex}-mat-${materialIndex}`}
                          style={styles.diagnosticMaterialRow}
                        >
                          <Text style={styles.diagnosticMaterialQty}>
                            {formatDiagnosticNumber(material.quantity)}
                            {material.unidade ? ` ${material.unidade}` : ''}
                          </Text>
                          <Text style={styles.diagnosticMaterialDescription}>
                            {material.descricao || '-'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Fixed Footer */}
        <View fixed style={styles.fixedFooter}>
          <View style={styles.footerTopRow}>
            <View style={styles.footerSection}>
              <Text style={styles.footerTitle}>EMPRESA</Text>
              <Text style={styles.footerText}>{company?.name || ''}</Text>
              {company?.vat && <Text style={styles.footerText}>NIF: {company.vat}</Text>}
              {company?.address && <Text style={styles.footerText}>{company.address}</Text>}
              {company?.phone && <Text style={styles.footerText}>Tel: {company.phone}</Text>}
              {company?.email && <Text style={styles.footerText}>Email: {company.email}</Text>}
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};
