export const exportDriversToCSV = (drivers: any[]) => {
  const BOM = '\uFEFF';
  const headers = ['Funcionário', 'Número Carta', 'Categorias', 'Validade', 'Veículo', 'Infrações', 'Acidentes', 'Pontuação', 'Ativo'];
  const csvContent = headers.map(h => `"${h}"`).join(';') + '\r\n' +
    drivers.map(driver => {
      const row = [
        driver.full_name || '',
        driver.license_number || '',
        Array.isArray(driver.license_categories) ? driver.license_categories.join(',') : '',
        driver.license_expiry || '',
        driver.vehicle?.license_plate || '',
        driver.total_infractions || 0,
        driver.total_accidents || 0,
        driver.driving_score || 0,
        driver.is_active ? 'Sim' : 'Não'
      ];
      return row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';');
    }).join('\r\n');

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `condutores_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

export const parseDriversCSV = (text: string, employees: any[], vehicles: any[]) => {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error("O ficheiro CSV está vazio ou inválido");
  }

  const dataLines = lines.slice(1);
  const driversToInsert = [];

  for (const line of dataLines) {
    const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    
    if (values.length < 4 || !values[0] || !values[1]) continue;

    const employee = employees.find(e => `${e.first_name} ${e.last_name}` === values[0]);
    if (!employee) continue;

    const vehicle = vehicles.find(v => v.license_plate === values[4]);

    driversToInsert.push({
      employee_id: employee.id,
      license_number: values[1],
      license_categories: values[2] ? values[2].split(',') : ['B'],
      license_expiry: values[3] || null,
      vehicle_id: vehicle?.id || null,
      total_infractions: parseInt(values[5]) || 0,
      total_accidents: parseInt(values[6]) || 0,
      driving_score: parseInt(values[7]) || 100,
      is_active: values[8] === 'Sim',
    });
  }

  return driversToInsert;
};
