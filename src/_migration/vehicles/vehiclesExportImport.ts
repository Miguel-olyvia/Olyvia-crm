export const exportVehiclesToCSV = (vehicles: any[]) => {
  const BOM = '\uFEFF';
  const headers = ['Matrícula', 'Marca', 'Modelo', 'Ano', 'Tipo', 'Empresa', 'VIN', 'Quilometragem', 'Estado'];
  const csvContent = headers.map(h => `"${h}"`).join(';') + '\r\n' +
    vehicles.map(vehicle => {
      const row = [
        vehicle.license_plate || '',
        vehicle.brand || '',
        vehicle.model || '',
        vehicle.year || '',
        vehicle.vehicle_type || '',
        vehicle.companies?.name || '',
        vehicle.vin || '',
        vehicle.current_odometer || 0,
        vehicle.status || ''
      ];
      return row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';');
    }).join('\r\n');

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `veiculos_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

export const parseVehiclesCSV = (text: string, companies: any[], userId: string) => {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error("O ficheiro CSV está vazio ou inválido");
  }

  const dataLines = lines.slice(1);
  const vehiclesToInsert = [];

  for (const line of dataLines) {
    const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    
    if (values.length < 3 || !values[0] || !values[1] || !values[2]) continue;

    const company = companies.find(c => c.name === values[5]);
    if (!company) continue;

    vehiclesToInsert.push({
      license_plate: values[0],
      brand: values[1],
      model: values[2],
      year: parseInt(values[3]) || new Date().getFullYear(),
      vehicle_type: values[4] || 'light',
      company_id: company.id,
      vin: values[6] || null,
      current_odometer: parseInt(values[7]) || 0,
      status: values[8] || 'active',
      created_by: userId,
    });
  }

  return vehiclesToInsert;
};
