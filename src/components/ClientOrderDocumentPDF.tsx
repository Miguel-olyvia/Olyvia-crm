import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';

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
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#374151',
    padding: 6,
    fontWeight: 'bold',
    color: '#ffffff',
    fontSize: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #e5e7eb',
    padding: 5,
    backgroundColor: '#ffffff',
    fontSize: 8,
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
});

const columnStyles = {
  sku: { width: '15%', fontSize: 8 },
  description: { width: '40%', fontSize: 8 },
  quantity: { width: '15%', fontSize: 8, textAlign: 'right' as const },
  status: { width: '30%', fontSize: 8 },
};

interface ClientOrderDocumentPDFLine {
  quote_line_id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  line_status: 'servido_por_stock' | 'recebido' | 'a_aguardar_encomenda' | 'sem_fornecedor';
  purchase_order_number: string | null;
}

interface ClientOrderDocumentPDFProps {
  document: {
    contract_id: string;
    contract_number: string;
    client_name: string | null;
    signature_date: string | null;
    total_value: number | null;
    lines: ClientOrderDocumentPDFLine[];
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

const getLineStatusText = (line: ClientOrderDocumentPDFLine): string => {
  switch (line.line_status) {
    case 'servido_por_stock':
      return 'Servido por Stock';
    case 'recebido':
      return line.purchase_order_number ? `Recebido (${line.purchase_order_number})` : 'Recebido';
    case 'a_aguardar_encomenda':
      return line.purchase_order_number ? `A aguardar Encomenda ${line.purchase_order_number}` : 'A aguardar Encomenda';
    case 'sem_fornecedor':
      return 'Sem fornecedor preferencial';
    default:
      return line.line_status;
  }
};

export const ClientOrderDocumentPDF = ({ document, company }: ClientOrderDocumentPDFProps) => {
  const lines = document.lines || [];

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
            <Text style={styles.contractNumber}>Contrato: {document.contract_number || 'N/A'}</Text>
            {document.signature_date && (
              <Text style={styles.docDate}>
                Data de Assinatura: {new Date(document.signature_date).toLocaleDateString('pt-PT')}
              </Text>
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
              <Text style={columnStyles.sku}>SKU</Text>
              <Text style={columnStyles.description}>Produto</Text>
              <Text style={columnStyles.quantity}>Qtd.</Text>
              <Text style={columnStyles.status}>Estado</Text>
            </View>
          </View>
        </View>

        <View>
          {lines.map((line) => (
            <View key={line.quote_line_id} style={styles.tableRow}>
              <Text style={columnStyles.sku}>{line.product_sku || '-'}</Text>
              <Text style={columnStyles.description}>{line.product_name || ''}</Text>
              <Text style={columnStyles.quantity}>{line.quantity}</Text>
              <Text style={columnStyles.status}>{getLineStatusText(line)}</Text>
            </View>
          ))}
          {lines.length === 0 && (
            <View style={styles.tableRow}>
              <Text style={{ fontSize: 8 }}>Sem linhas de produto para este contrato.</Text>
            </View>
          )}
        </View>

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
