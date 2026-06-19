export const exportAssetsToCSV = (assets: any[]) => {
  const BOM = '\uFEFF';
  const headers = ['Código', 'Nome', 'Descrição', 'Empresa', 'Localização', 'Categoria', 'Fabricante', 'Modelo', 'Custo Aquisição', 'Valor Atual', 'Estado'];
  const csvContent = headers.map(h => `"${h}"`).join(';') + '\r\n' +
    assets.map(asset => {
      const row = [
        asset.asset_code || '',
        asset.name || '',
        asset.description || '',
        asset.companies?.name || '',
        asset.locations?.name || '',
        asset.asset_categories?.name || '',
        asset.manufacturer || '',
        asset.model || '',
        asset.acquisition_cost || 0,
        asset.current_value || 0,
        asset.status || ''
      ];
      return row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';');
    }).join('\r\n');

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `assets_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
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
