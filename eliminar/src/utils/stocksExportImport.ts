export const exportStocksToCSV = (stocks: any[]) => {
  const BOM = '\uFEFF';
  const headers = ['Produto', 'Armazém', 'Quantidade', 'Quantidade Mínima', 'Quantidade Máxima', 'Ponto de Reposição', 'Localização'];
  const csvContent = headers.map(h => `"${h}"`).join(';') + '\r\n' +
    stocks.map(stock => {
      const row = [
        stock.products?.name || '',
        stock.warehouses?.name || '',
        stock.quantity || 0,
        stock.minimum_quantity || 0,
        stock.maximum_quantity || 0,
        stock.reorder_point || 0,
        stock.location || ''
      ];
      return row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';');
    }).join('\r\n');

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `stocks_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

export const parseStocksCSV = (text: string, products: any[], warehouses: any[], organizationId?: string, createdBy?: string) => {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error("O ficheiro CSV está vazio ou inválido");
  }

  const dataLines = lines.slice(1);
  const stocksToInsert = [];

  for (const line of dataLines) {
    const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    
    if (values.length < 3) continue;

    const product = products.find(p => p.name === values[0]);
    const warehouse = warehouses.find(w => w.name === values[1]);

    if (!product || !warehouse) continue;

    stocksToInsert.push({
      product_id: product.id,
      warehouse_id: warehouse.id,
      quantity: parseInt(values[2]) || 0,
      minimum_quantity: parseInt(values[3]) || 0,
      maximum_quantity: parseInt(values[4]) || 0,
      reorder_point: parseInt(values[5]) || 0,
      location: values[6] || null,
      ...(organizationId && { organization_id: organizationId }),
      ...(createdBy && { created_by: createdBy }),
    });
  }

  return stocksToInsert;
};
