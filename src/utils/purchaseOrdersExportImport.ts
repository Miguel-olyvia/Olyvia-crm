import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";

export const exportPurchaseOrdersToCSV = (orders: any[]) => {
  downloadStandardXlsx({
    sheetName: "Encomendas",
    columns: [
      { key: "number", header: "Número", width: 18 },
      { key: "supplier", header: "Fornecedor", width: 28 },
      { key: "orderDate", header: "Data da encomenda", type: "date", width: 16 },
      { key: "deliveryDate", header: "Entrega esperada", type: "date", width: 16 },
      { key: "status", header: "Estado", width: 16 },
      { key: "total", header: "Valor total", type: "number", width: 16 },
      { key: "notes", header: "Notas", width: 36 },
    ],
    rows: orders.map((order) => ({
      number: order.order_number,
      supplier: order.suppliers?.name,
      orderDate: order.order_date,
      deliveryDate: order.expected_delivery,
      status: order.status,
      total: order.total_value,
      notes: order.notes,
    })),
  }, `encomendas_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
