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

export interface ParsedPurchaseOrdersResult {
  ordersToInsert: any[];
  skippedLines: { line: number; orderNumber: string; reason: string }[];
}

/**
 * Parses the purchase orders import CSV.
 *
 * order_number is per-organization unique (see the composite
 * UNIQUE(organization_id, order_number) constraint), so a single duplicate
 * order_number used to fail the WHOLE batch when it hit
 * rpc_import_purchase_orders_csv's one-transaction INSERT loop. To keep that
 * RPC's all-or-nothing semantics intact while still giving useful feedback,
 * duplicates are detected and skipped HERE, client-side, before the RPC is
 * ever called — mirroring how parseProductsCSV pre-scans for duplicate SKUs
 * (skip subsequent occurrences, keep the file's first) and cross-references
 * already-existing values (existingOrderNumbers, passed in by the caller)
 * instead of aborting the whole import.
 */
export const parsePurchaseOrdersCSV = (
  text: string,
  suppliers: any[],
  userId: string,
  organizationId?: string,
  existingOrderNumbers: Set<string> = new Set(),
): ParsedPurchaseOrdersResult => {
  const lines = text.split(/\r?\n/).filter(line => line.trim());

  if (lines.length < 2) {
    throw new Error("O ficheiro CSV está vazio ou inválido");
  }

  const dataLines = lines.slice(1);
  const ordersToInsert: any[] = [];
  const skippedLines: { line: number; orderNumber: string; reason: string }[] = [];
  const seenInFile = new Set<string>();

  dataLines.forEach((line, index) => {
    const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

    if (values.length < 2 || !values[0]) return;

    const lineNumber = index + 2; // +2 for header row and 0-index
    const orderNumber = values[0];

    const supplier = suppliers.find(s => s.name === values[1]);
    if (!supplier) {
      skippedLines.push({ line: lineNumber, orderNumber, reason: `Fornecedor "${values[1]}" não encontrado` });
      return;
    }

    if (seenInFile.has(orderNumber) || existingOrderNumbers.has(orderNumber)) {
      skippedLines.push({
        line: lineNumber,
        orderNumber,
        reason: seenInFile.has(orderNumber)
          ? "Número de encomenda duplicado no ficheiro"
          : "Número de encomenda já existe nesta organização",
      });
      return;
    }
    seenInFile.add(orderNumber);

    ordersToInsert.push({
      order_number: orderNumber,
      supplier_id: supplier.id,
      order_date: values[2] || new Date().toISOString().split('T')[0],
      expected_delivery: values[3] || null,
      status: values[4] || 'pending',
      total_value: parseFloat(values[5]) || 0,
      notes: values[6] || null,
      created_by: userId,
      ...(organizationId ? { organization_id: organizationId } : {}),
    });
  });

  return { ordersToInsert, skippedLines };
};
