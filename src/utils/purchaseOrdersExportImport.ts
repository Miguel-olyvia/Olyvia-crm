export const exportPurchaseOrdersToCSV = (orders: any[]) => {
  const BOM = '\uFEFF';
  const headers = ['Número', 'Fornecedor', 'Data da Encomenda', 'Entrega Esperada', 'Estado', 'Valor Total', 'Notas'];
  const csvContent = headers.map(h => `"${h}"`).join(';') + '\r\n' +
    orders.map(order => {
      const row = [
        order.order_number || '',
        order.suppliers?.name || '',
        order.order_date || '',
        order.expected_delivery || '',
        order.status || '',
        order.total_value || 0,
        order.notes || ''
      ];
      return row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';');
    }).join('\r\n');

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `encomendas_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

export const parsePurchaseOrdersCSV = (text: string, suppliers: any[], userId: string, organizationId?: string) => {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error("O ficheiro CSV está vazio ou inválido");
  }

  const dataLines = lines.slice(1);
  const ordersToInsert = [];

  for (const line of dataLines) {
    const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    
    if (values.length < 2 || !values[0]) continue;

    const supplier = suppliers.find(s => s.name === values[1]);
    if (!supplier) continue;

    ordersToInsert.push({
      order_number: values[0],
      supplier_id: supplier.id,
      order_date: values[2] || new Date().toISOString().split('T')[0],
      expected_delivery: values[3] || null,
      status: values[4] || 'pending',
      total_value: parseFloat(values[5]) || 0,
      notes: values[6] || null,
      created_by: userId,
      ...(organizationId ? { organization_id: organizationId } : {}),
    });
  }

  return ordersToInsert;
};
