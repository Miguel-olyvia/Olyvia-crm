import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";

/**
 * Exports the given (already-filtered) contracts list to XLSX.
 *
 * Callers MUST pass the currently visible/filtered rows (e.g. filteredContracts
 * from ClientContracts.tsx), not the unfiltered `contracts` query result — the
 * export should always match what's on screen.
 */
export const exportClientContractsToXlsx = (contracts: any[]) => {
  const statusLabels: Record<string, string> = {
    draft: "Draft",
    pending_signature: "Enviado",
    signed: "Assinado",
    active: "Activo",
    expired: "Expirado",
    cancelled: "Cancelado",
  };

  downloadStandardXlsx({
    sheetName: "Contratos",
    columns: [
      { key: "number", header: "Número", width: 18 },
      { key: "client", header: "Cliente", width: 28 },
      { key: "status", header: "Estado", width: 16 },
      { key: "totalValue", header: "Valor", type: "number", width: 14 },
      { key: "startDate", header: "Início", type: "date", width: 14 },
      { key: "endDate", header: "Fim", type: "date", width: 14 },
      { key: "assignedTo", header: "Responsável", width: 22 },
      { key: "createdAt", header: "Criado em", type: "date", width: 16 },
    ],
    rows: contracts.map((contract) => ({
      number: contract.contract_number,
      client: contract._clientName,
      status: statusLabels[contract.status] || contract.status,
      totalValue: contract.total_value,
      startDate: contract.start_date,
      endDate: contract.end_date,
      assignedTo: contract.assigned_to_name,
      createdAt: contract.created_at,
    })),
  }, `contratos_${new Date().toISOString().slice(0, 10)}.xlsx`);
};
