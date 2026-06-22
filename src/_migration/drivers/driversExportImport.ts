import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";

export const exportDriversToCSV = (drivers: any[]) => {
  downloadStandardXlsx({
    sheetName: "Condutores",
    columns: [
      { key: "employee", header: "Funcionário", width: 28 },
      { key: "license", header: "Número carta", width: 18 },
      { key: "categories", header: "Categorias", width: 16 },
      { key: "expiry", header: "Validade", type: "date", width: 14 },
      { key: "vehicle", header: "Veículo", width: 16 },
      { key: "infractions", header: "Infrações", type: "number", width: 12 },
      { key: "accidents", header: "Acidentes", type: "number", width: 12 },
      { key: "score", header: "Pontuação", type: "number", width: 12 },
      { key: "active", header: "Ativo", type: "boolean", width: 10 },
    ],
    rows: drivers.map((driver) => ({
      employee: driver.full_name,
      license: driver.license_number,
      categories: Array.isArray(driver.license_categories) ? driver.license_categories.join(", ") : "",
      expiry: driver.license_expiry,
      vehicle: driver.vehicle?.license_plate,
      infractions: driver.total_infractions,
      accidents: driver.total_accidents,
      score: driver.driving_score,
      active: driver.is_active,
    })),
  }, `condutores_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
