import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";

export const exportWarehousesToCSV = (warehouses: any[]) => {
  downloadStandardXlsx({
    sheetName: "Armazéns",
    columns: [
      { key: "name", header: "Nome", width: 28 },
      { key: "code", header: "Código", width: 16 },
      { key: "address", header: "Morada", width: 36 },
      { key: "city", header: "Cidade", width: 20 },
      { key: "postalCode", header: "Código postal", width: 16 },
      { key: "country", header: "País", width: 16 },
      { key: "manager", header: "Gestor", width: 24 },
      { key: "phone", header: "Telefone", width: 18 },
      { key: "email", header: "Email", width: 30 },
      { key: "capacity", header: "Capacidade", type: "number", width: 14 },
      { key: "active", header: "Ativo", type: "boolean", width: 10 },
    ],
    rows: warehouses.map((warehouse) => ({
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address,
      city: warehouse.city,
      postalCode: warehouse.postal_code,
      country: warehouse.country,
      manager: warehouse.manager_name,
      phone: warehouse.phone,
      email: warehouse.email,
      capacity: warehouse.capacity,
      active: warehouse.is_active,
    })),
  }, `armazens_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

export const parseWarehousesCSV = (text: string, userId: string, companyId: string) => {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error("O ficheiro CSV está vazio ou inválido");
  }

  const dataLines = lines.slice(1);
  const warehousesToInsert = [];

  for (const line of dataLines) {
    const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    
    if (values.length < 2 || !values[0] || !values[1]) continue;

    warehousesToInsert.push({
      name: values[0],
      code: values[1],
      address: values[2] || null,
      city: values[3] || null,
      postal_code: values[4] || null,
      country: values[5] || null,
      manager_name: values[6] || null,
      phone: values[7] || null,
      email: values[8] || null,
      capacity: values[9] ? parseInt(values[9]) : null,
      is_active: values[10] === 'Sim',
      created_by: userId,
      organization_id: companyId,
    });
  }

  return warehousesToInsert;
};
