import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";

export const exportAssetsToCSV = (assets: any[]) => {
  downloadStandardXlsx({
    sheetName: "Ativos",
    columns: [
      { key: "code", header: "Código", width: 16 },
      { key: "name", header: "Nome", width: 28 },
      { key: "description", header: "Descrição", width: 36 },
      { key: "company", header: "Empresa", width: 26 },
      { key: "location", header: "Localização", width: 24 },
      { key: "category", header: "Categoria", width: 22 },
      { key: "manufacturer", header: "Fabricante", width: 20 },
      { key: "model", header: "Modelo", width: 20 },
      { key: "acquisitionCost", header: "Custo aquisição", type: "number", width: 16 },
      { key: "currentValue", header: "Valor atual", type: "number", width: 16 },
      { key: "status", header: "Estado", width: 14 },
    ],
    rows: assets.map((asset) => ({
      code: asset.asset_code,
      name: asset.name,
      description: asset.description,
      company: asset.companies?.name,
      location: asset.locations?.name,
      category: asset.asset_categories?.name,
      manufacturer: asset.manufacturer,
      model: asset.model,
      acquisitionCost: asset.acquisition_cost,
      currentValue: asset.current_value,
      status: asset.status,
    })),
  }, `ativos_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

export const parseAssetsCSV = (text: string, companies: any[], locations: any[], categories: any[], userId: string) => {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error("O ficheiro CSV está vazio ou inválido");
  }

  const dataLines = lines.slice(1);
  const assetsToInsert = [];

  for (const line of dataLines) {
    const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    
    if (values.length < 2 || !values[0] || !values[1]) continue;

    const company = companies.find(c => c.name === values[3]);
    const location = locations.find(l => l.name === values[4]);
    const category = categories.find(c => c.name === values[5]);

    assetsToInsert.push({
      asset_code: values[0],
      name: values[1],
      description: values[2] || null,
      company_id: company?.id || null,
      location_id: location?.id || null,
      category_id: category?.id || null,
      manufacturer: values[6] || null,
      model: values[7] || null,
      acquisition_cost: parseFloat(values[8]) || null,
      current_value: parseFloat(values[9]) || null,
      status: values[10] || 'active',
      created_by: userId,
    });
  }

  return assetsToInsert;
};
