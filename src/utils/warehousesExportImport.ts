export const exportWarehousesToCSV = (warehouses: any[]) => {
  const BOM = '\uFEFF';
  const headers = ['Nome', 'Código', 'Morada', 'Cidade', 'Código Postal', 'País', 'Gestor', 'Telefone', 'Email', 'Capacidade', 'Ativo'];
  const csvContent = headers.map(h => `"${h}"`).join(';') + '\r\n' +
    warehouses.map(warehouse => {
      const row = [
        warehouse.name || '',
        warehouse.code || '',
        warehouse.address || '',
        warehouse.city || '',
        warehouse.postal_code || '',
        warehouse.country || '',
        warehouse.manager_name || '',
        warehouse.phone || '',
        warehouse.email || '',
        warehouse.capacity || '',
        warehouse.is_active ? 'Sim' : 'Não'
      ];
      return row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';');
    }).join('\r\n');

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `armazens_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
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
