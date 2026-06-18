import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';

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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  poNumber: {
    fontSize: 11,
    color: '#000000',
    marginBottom: 3,
  },
  poDate: {
    fontSize: 9,
    color: '#000000',
    marginBottom: 5,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  statusText: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
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
  totalsSection: {
    position: 'absolute',
    bottom: 140,
    right: 35,
    left: 35,
    alignItems: 'flex-end',
  },
  totalsRow: {
    flexDirection: 'row',
    width: '50%',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingVertical: 3,
    borderBottom: '1 solid #e5e7eb',
  },
  totalLabel: {
    fontSize: 9,
    color: '#000000',
    flex: 1,
    marginRight: 10,
  },
  totalValue: {
    fontSize: 9,
    color: '#000000',
    textAlign: 'right',
    minWidth: 80,
  },
  grandTotal: {
    fontSize: 11,
    fontWeight: 'bold',
    borderTop: '2 solid #000000',
    borderBottom: 'none',
    paddingTop: 8,
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
  footerBottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTop: '1 solid #8b5cf6',
  },
});

interface PurchaseOrderPDFProps {
  order: any;
  company: any;
  supplier: any;
  items: any[];
  user?: any;
}

// Extract unique attribute labels from all items
const extractAttributeColumns = (items: any[]): { id: string; label: string }[] => {
  const attributeMap = new Map<string, string>();
  
  items.forEach(item => {
    const attrs = item.selected_attributes || {};
    Object.entries(attrs).forEach(([id, attr]: [string, any]) => {
      if (attr?.label && !attributeMap.has(id)) {
        attributeMap.set(id, attr.label);
      }
    });
  });
  
  return Array.from(attributeMap.entries()).map(([id, label]) => ({ id, label }));
};

// Get attribute value for an item
const getAttributeValue = (item: any, attrId: string): string => {
  const attrs = item.selected_attributes || {};
  const attr = attrs[attrId];
  if (!attr) return '-';
  
  const value = attr.value || '';
  const unit = attr.unit || '';
  return unit ? `${value} ${unit}` : value;
};

export const PurchaseOrderPDFDocument = ({ order, company, supplier, items, user }: PurchaseOrderPDFProps) => {
  const brandColor = company?.brand_color || '#000000';
  
  // Extract attribute columns from items
  const attributeColumns = extractAttributeColumns(items);
  const hasAttributes = attributeColumns.length > 0;
  
  // Calculate column widths based on number of attributes
  // Base columns: SKU, Descrição, Qtd, P.Unit, IVA, Total
  // With 0 attributes: 15%, 35%, 10%, 12%, 10%, 18%
  // With attributes: reduce Descrição width and add attribute columns
  const baseWidth = 100;
  const fixedColumnsWidth = 15 + 10 + 12 + 10 + 18; // SKU + Qtd + P.Unit + IVA + Total = 65%
  const remainingWidth = baseWidth - fixedColumnsWidth; // 35% for Descrição + attributes
  
  const attrColumnWidth = hasAttributes ? Math.min(12, remainingWidth / (attributeColumns.length + 1)) : 0;
  const descriptionWidth = remainingWidth - (attrColumnWidth * attributeColumns.length);
  
  const columnStyles = {
    sku: { width: '15%', fontSize: 8 },
    description: { width: `${descriptionWidth}%`, fontSize: 8 },
    attribute: { width: `${attrColumnWidth}%`, fontSize: 7 },
    quantity: { width: '10%', fontSize: 8, textAlign: 'right' as const },
    unitPrice: { width: '12%', fontSize: 8, textAlign: 'right' as const },
    vat: { width: '10%', fontSize: 8, textAlign: 'right' as const },
    total: { width: '18%', fontSize: 8, textAlign: 'right' as const, fontWeight: 'bold' as const },
  };
  
  const headerStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: 15,
    paddingBottom: 12,
    borderBottom: `2 solid ${brandColor}`,
  };

  const fixedFooterStyle = {
    position: 'absolute' as const,
    bottom: 20,
    left: 0,
    right: 0,
    paddingHorizontal: 40,
    paddingTop: 12,
    borderTop: `2 solid ${brandColor}`,
  };

  const footerBrandTextStyle = {
    fontSize: 9,
    color: brandColor,
    fontWeight: 'bold' as const,
  };

  // Calculate totals
  const subtotal = items.reduce((sum, item) => {
    return sum + (item.unit_price * item.quantity);
  }, 0);

  const totalVat = items.reduce((sum, item) => {
    return sum + (item.vat_amount || 0);
  }, 0);

  const total = subtotal + totalVat;

  // Format company address
  const companyAddress = company?.company_addresses?.find((addr: any) => addr.is_primary) 
    || company?.company_addresses?.[0];
  const companyFullAddress = companyAddress 
    ? [companyAddress.street, companyAddress.number, companyAddress.postal_code, companyAddress.city]
        .filter(Boolean).join(", ")
    : company?.address || '';

  // Get status badge styling
  const getStatusStyle = (status: string) => {
    const statusConfig: Record<string, { bg: string; color: string; text: string }> = {
      pending: { bg: '#fef3c7', color: '#92400e', text: 'Pendente' },
      ordered: { bg: '#dbeafe', color: '#1e40af', text: 'Encomendado' },
      received: { bg: '#d1fae5', color: '#065f46', text: 'Recebido' },
      cancelled: { bg: '#fee2e2', color: '#991b1b', text: 'Cancelado' },
    };
    return statusConfig[status] || { bg: '#f3f4f6', color: '#374151', text: status };
  };

  const statusStyle = getStatusStyle(order.status);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View fixed style={headerStyle}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>ENCOMENDA</Text>
            <Text style={styles.poNumber}>{order.order_number || 'N/A'}</Text>
            <Text style={styles.poDate}>
              Data: {new Date(order.order_date).toLocaleDateString('pt-PT')}
            </Text>
            {order.expected_delivery && (
              <Text style={styles.poDate}>
                Entrega Prevista: {new Date(order.expected_delivery).toLocaleDateString('pt-PT')}
              </Text>
            )}
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.color }]}>
                {statusStyle.text}
              </Text>
            </View>
          </View>
          {company?.logo_url && (
            <Image src={company.logo_url} style={styles.logo} />
          )}
        </View>

        {/* Supplier Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>FORNECEDOR</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nome:</Text>
            <Text style={styles.value}>{supplier?.name || ''}</Text>
          </View>
          {supplier?.tax_id && (
            <View style={styles.row}>
              <Text style={styles.label}>NIF:</Text>
              <Text style={styles.value}>{supplier.tax_id}</Text>
            </View>
          )}
          {supplier?.email && (
            <View style={styles.row}>
              <Text style={styles.label}>Email:</Text>
              <Text style={styles.value}>{supplier.email}</Text>
            </View>
          )}
          {supplier?.phone && (
            <View style={styles.row}>
              <Text style={styles.label}>Telefone:</Text>
              <Text style={styles.value}>{supplier.phone}</Text>
            </View>
          )}
        </View>

        {/* Notes Section */}
        {order.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>NOTAS</Text>
            <View style={{ padding: 8, backgroundColor: '#f9fafb', borderRadius: 4 }}>
              <Text style={{ fontSize: 9, color: '#374151', lineHeight: 1.4 }}>{order.notes}</Text>
            </View>
          </View>
        )}

        {/* Order Items Table */}
        <View fixed style={styles.section}>
          <Text style={styles.sectionTitle}>ITENS DA ENCOMENDA</Text>
          
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={columnStyles.sku}>SKU</Text>
              <Text style={columnStyles.description}>Descrição</Text>
              {attributeColumns.map((attr) => (
                <Text key={attr.id} style={columnStyles.attribute}>{attr.label}</Text>
              ))}
              <Text style={columnStyles.quantity}>Qtd.</Text>
              <Text style={columnStyles.unitPrice}>P. Unit.</Text>
              <Text style={columnStyles.vat}>IVA</Text>
              <Text style={columnStyles.total}>Total</Text>
            </View>
          </View>
        </View>

        {/* Table Rows */}
        <View>
          {items.map((item, index) => {
            const lineSubtotal = item.unit_price * item.quantity;
            const lineTotal = lineSubtotal + (item.vat_amount || 0);
            
            return (
              <View key={item.id || index} style={styles.tableRow}>
                <Text style={columnStyles.sku}>{item.sku || '-'}</Text>
                <Text style={columnStyles.description}>{item.description || ''}</Text>
                {attributeColumns.map((attr) => (
                  <Text key={attr.id} style={columnStyles.attribute}>
                    {getAttributeValue(item, attr.id)}
                  </Text>
                ))}
                <Text style={columnStyles.quantity}>{item.quantity}</Text>
                <Text style={columnStyles.unitPrice}>€{item.unit_price?.toFixed(2)}</Text>
                <Text style={columnStyles.vat}>{item.vat_rate}%</Text>
                <Text style={columnStyles.total}>€{lineTotal.toFixed(2)}</Text>
              </View>
            );
          })}
        </View>

        {/* Totals */}
        <View fixed style={styles.totalsSection}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalLabel}>Subtotal (sem IVA):</Text>
            <Text style={styles.totalValue}>€{subtotal.toFixed(2)}</Text>
          </View>
          
          <View style={styles.totalsRow}>
            <Text style={styles.totalLabel}>IVA Total:</Text>
            <Text style={styles.totalValue}>€{totalVat.toFixed(2)}</Text>
          </View>
          
          <View style={[styles.totalsRow, styles.grandTotal]}>
            <Text style={[styles.totalLabel, { fontWeight: 'bold' as const }]}>TOTAL GERAL (c/ IVA):</Text>
            <Text style={[styles.totalValue, { fontWeight: 'bold' as const }]}>€{total.toFixed(2)}</Text>
          </View>
        </View>

        {/* Fixed Footer */}
        <View fixed style={fixedFooterStyle}>
          <View style={styles.footerTopRow}>
            <View style={styles.footerSection}>
              <Text style={styles.footerTitle}>EMPRESA</Text>
              <Text style={styles.footerText}>{company?.name || ''}</Text>
              {company?.vat && (
                <Text style={styles.footerText}>NIF: {company.vat}</Text>
              )}
              {companyFullAddress && (
                <Text style={styles.footerText}>{companyFullAddress}</Text>
              )}
              {company?.phone && (
                <Text style={styles.footerText}>Tel: {company.phone}</Text>
              )}
              {company?.email && (
                <Text style={styles.footerText}>Email: {company.email}</Text>
              )}
            </View>

            {user && (
              <View style={styles.footerSection}>
                <Text style={styles.footerTitle}>RESPONSÁVEL</Text>
                <Text style={styles.footerText}>
                  {user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim()}
                </Text>
                {user.email && (
                  <Text style={styles.footerText}>Email: {user.email}</Text>
                )}
                {user.phone && (
                  <Text style={styles.footerText}>Tel: {user.phone}</Text>
                )}
              </View>
            )}
          </View>

          <View style={{
            flexDirection: 'row' as const,
            justifyContent: 'center' as const,
            alignItems: 'center' as const,
            marginTop: 6,
            paddingTop: 6,
            borderTop: `1 solid ${brandColor}`,
          }}>
            <Text style={footerBrandTextStyle}>{company?.name || 'Purchase Order'}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};
