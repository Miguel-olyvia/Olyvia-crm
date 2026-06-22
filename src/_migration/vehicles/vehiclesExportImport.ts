import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";

export const exportVehiclesToCSV = (vehicles: any[]) => {
  downloadStandardXlsx({
    sheetName: "Veículos",
    columns: [
      { key: "plate", header: "Matrícula", width: 16 },
      { key: "brand", header: "Marca", width: 20 },
      { key: "model", header: "Modelo", width: 20 },
      { key: "year", header: "Ano", type: "number", width: 10 },
      { key: "type", header: "Tipo", width: 16 },
      { key: "company", header: "Empresa", width: 26 },
      { key: "vin", header: "VIN", width: 22 },
      { key: "odometer", header: "Quilometragem", type: "number", width: 16 },
      { key: "status", header: "Estado", width: 14 },
    ],
    rows: vehicles.map((vehicle) => ({
      plate: vehicle.license_plate,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      type: vehicle.vehicle_type,
      company: vehicle.companies?.name,
      vin: vehicle.vin,
      odometer: vehicle.current_odometer,
      status: vehicle.status,
    })),
  }, `veiculos_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
