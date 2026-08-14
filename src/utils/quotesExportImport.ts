import { supabase } from "@/integrations/supabase/client";

// Helper to resolve entity name from entity_id
const resolveEntityName = async (entityId: string | null): Promise<{ name: string; email: string; phone: string }> => {
  if (!entityId) return { name: '', email: '', phone: '' };
  
  const [entityRes, emailsRes, phonesRes] = await Promise.all([
    (supabase as any).from("anew_entities").select("display_name, type, first_name, last_name").eq("id", entityId).single(),
    (supabase as any).from("anew_entity_emails").select("email").eq("entity_id", entityId).eq("is_primary", true).limit(1),
    (supabase as any).from("anew_entity_phones").select("phone_number").eq("entity_id", entityId).eq("is_primary", true).limit(1),
  ]);

  return {
    name: entityRes.data?.display_name || '',
    email: emailsRes.data?.[0]?.email || '',
    phone: phonesRes.data?.[0]?.phone_number || '',
  };
};

export const exportQuotesToCSV = async (quotes: any[]) => {
  const BOM = '\uFEFF';
  const headers = [
    'Nº Orçamento', 'Organização', 'Cliente', 'Morada Obra',
    'Estado', 'Data Criação', 'Valor Total', 'Modelo Base',
    'Linhas do Orçamento'
  ];

  // Fetch all quote lines for the quotes
  const quoteIds = quotes.map(q => q.id);
  const { data: allLines } = await supabase
    .from('quote_lines')
    .select('*')
    .in('quote_id', quoteIds)
    .order('ordem');

  const linesByQuote = new Map();
  allLines?.forEach(line => {
    if (!linesByQuote.has(line.quote_id)) {
      linesByQuote.set(line.quote_id, []);
    }
    linesByQuote.get(line.quote_id).push(line);
  });

  // Resolve entity names for all quotes
  const entityIds = new Set<string>();
  quotes.forEach(q => { if (q.entity_id) entityIds.add(q.entity_id); });
  
  const entityNamesMap: Record<string, string> = {};
  if (entityIds.size > 0) {
    const { data } = await (supabase as any)
      .from("anew_entities")
      .select("id, display_name")
      .in("id", Array.from(entityIds));
    (data || []).forEach((e: any) => { entityNamesMap[e.id] = e.display_name; });
  }

  // Resolve org names
  const orgIds = new Set<string>();
  quotes.forEach(q => { if (q.organization_id) orgIds.add(q.organization_id); });
  
  const orgNamesMap: Record<string, string> = {};
  if (orgIds.size > 0) {
    const { data } = await (supabase as any)
      .from("anew_organizations")
      .select("id, name")
      .in("id", Array.from(orgIds));
    (data || []).forEach((o: any) => { orgNamesMap[o.id] = o.name; });
  }

  const csvContent = headers.map(h => `"${h}"`).join(';') + '\r\n' +
    quotes.map(quote => {
      const lines = linesByQuote.get(quote.id) || [];
      const clientName = quote.entity_id ? (entityNamesMap[quote.entity_id] || '') : '';
      const orgName = quote.organization_id ? (orgNamesMap[quote.organization_id] || '') : '';

      // Calculate total value from lines
      const totalValue = lines.reduce((sum: number, line: any) => {
        return sum + (parseFloat(line.preco_unitario) * parseFloat(line.qtd) * (1 + parseFloat(line.int_percent) / 100));
      }, 0);

      // Format quote lines as a readable string
      const linesText = lines.map((line: any, index: number) => {
        const lineTotal = parseFloat(line.preco_unitario) * parseFloat(line.qtd) * (1 + parseFloat(line.int_percent) / 100);
        return `${index + 1}. ${line.descricao} | Qtd: ${line.qtd} ${line.unidade} | Preço Unit: €${line.preco_unitario} | INT: ${line.int_percent}% | Total: €${lineTotal.toFixed(2)}`;
      }).join(' | ');

      const statusLabels: Record<string, string> = {
        rascunho: "Rascunho",
        enviado: "Enviado",
        aceite: "Aceite",
        perdido: "Perdido",
      };

      const row = [
        quote.quote_number || '',
        orgName,
        clientName,
        quote.obra_endereco || '',
        statusLabels[quote.estado] || quote.estado,
        new Date(quote.created_at).toLocaleDateString('pt-PT'),
        totalValue.toFixed(2),
        quote.modelo_base || '',
        linesText
      ];
      return row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';');
    }).join('\r\n');

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `orcamentos_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

export const exportQuoteToDetailedCSV = async (quoteId: string) => {
  const BOM = '\uFEFF';
  
  // Fetch quote
  const { data: quote, error: quoteError } = await (supabase as any)
    .from('quotes')
    .select('*')
    .eq('id', quoteId)
    .single();

  if (quoteError || !quote) {
    throw new Error("Orçamento não encontrado");
  }

  // Resolve entity data
  const entityData = await resolveEntityName(quote.entity_id);

  // Resolve organization data
  let orgName = '';
  let orgVat = '';
  if (quote.organization_id) {
    const { data: org } = await (supabase as any)
      .from('anew_organizations')
      .select('name, metadata')
      .eq('id', quote.organization_id)
      .single();
    orgName = org?.name || '';
    orgVat = org?.metadata?.vat || '';
  }

  // Resolve entity address
  let clientAddress = '';
  if (quote.entity_id) {
    const { data: addrLinks } = await (supabase as any)
      .from('anew_entity_addresses')
      .select('is_primary, anew_addresses(*)')
      .eq('entity_id', quote.entity_id);
    
    const primaryAddr = addrLinks?.find((a: any) => a.is_primary) || addrLinks?.[0];
    if (primaryAddr?.anew_addresses) {
      const a = primaryAddr.anew_addresses;
      clientAddress = [a.street, a.number, a.postal_code, a.city].filter(Boolean).join(", ");
    }
  }

  // Fetch quote lines
  const { data: lines, error: linesError } = await supabase
    .from('quote_lines')
    .select('*')
    .eq('quote_id', quoteId)
    .order('ordem');

  if (linesError) {
    throw new Error("Erro ao carregar linhas do orçamento");
  }

  // Build detailed CSV
  let csvContent = '***** ORÇAMENTO DETALHADO *****\r\n\r\n';
  
  csvContent += 'INFORMAÇÃO GERAL\r\n';
  csvContent += `"Nº Orçamento";"${quote.quote_number || 'N/A'}"\r\n`;
  csvContent += `"Organização";"${orgName}"\r\n`;
  csvContent += `"NIF Organização";"${orgVat}"\r\n`;
  csvContent += `"Cliente";"${entityData.name}"\r\n`;
  csvContent += `"Email Cliente";"${entityData.email}"\r\n`;
  csvContent += `"Telefone Cliente";"${entityData.phone}"\r\n`;
  csvContent += `"Morada Cliente";"${clientAddress}"\r\n`;
  csvContent += `"Morada Obra";"${quote.obra_endereco || ''}"\r\n`;
  csvContent += `"Estado";"${quote.estado}"\r\n`;
  csvContent += `"Data Criação";"${new Date(quote.created_at).toLocaleDateString('pt-PT')}"\r\n`;
  csvContent += `"Modelo Base";"${quote.modelo_base || ''}"\r\n`;
  csvContent += '\r\n';

  // Quote lines
  csvContent += 'LINHAS DO ORÇAMENTO\r\n';
  const lineHeaders = [
    'Ordem', 'Categoria', 'Subcategoria', 'Descrição', 'Unidade', 
    'Quantidade', 'Preço Unitário', 'INT %', 'IVA %', 'Total Linha', 'Notas'
  ];
  csvContent += lineHeaders.map(h => `"${h}"`).join(';') + '\r\n';

  let subtotal = 0;
  (lines || []).forEach((line: any) => {
    const lineTotal = parseFloat(line.preco_unitario) * parseFloat(line.qtd) * (1 + parseFloat(line.int_percent) / 100);
    subtotal += lineTotal;
    
    const lineRow = [
      line.ordem,
      line.categoria || '',
      line.subcategoria || '',
      line.descricao || '',
      line.unidade || '',
      line.qtd || 0,
      parseFloat(line.preco_unitario).toFixed(2),
      parseFloat(line.int_percent).toFixed(2),
      parseFloat(line.iva_percent).toFixed(2),
      lineTotal.toFixed(2),
      line.notas || ''
    ];
    csvContent += lineRow.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';') + '\r\n';
  });

  // Totals
  const defaultIva = lines && lines.length > 0 ? parseFloat(String(lines[0].iva_percent)) : 23;
  const ivaAmount = subtotal * (defaultIva / 100);
  const total = subtotal + ivaAmount;

  csvContent += '\r\n';
  csvContent += 'TOTAIS\r\n';
  csvContent += `"Subtotal (sem IVA)";"€${subtotal.toFixed(2)}"\r\n`;
  csvContent += `"IVA (${defaultIva}%)";"€${ivaAmount.toFixed(2)}"\r\n`;
  csvContent += `"TOTAL";"€${total.toFixed(2)}"\r\n`;

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `orcamento_${quote.quote_number || quoteId}_detalhado_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};
