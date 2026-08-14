import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeneratePDFRequest {
  contract_id: string;
  version_id?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Auth: validate JWT token ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    let callerAnewUserId: string | undefined;
    const isServiceRole = token === supabaseServiceKey;
    
    if (!isServiceRole) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired token' }),
          { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }
      const { data: anewUser } = await supabase.from('anew_users').select('id').eq('auth_user_id', user.id).maybeSingle();
      callerAnewUserId = anewUser?.id;
    }

    const { contract_id }: GeneratePDFRequest = await req.json();

    if (!contract_id) {
      return new Response(
        JSON.stringify({ error: 'Contract ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Fetch contract with parties (versions/clauses tables removed — were always empty)
    const { data: contract, error: contractError } = await supabase
      .from('client_contracts')
      .select(`
        *,
        client_contract_parties (
          id, signing_name, signing_email, role, status, signed_at
        )
      `)
      .eq('id', contract_id)
      .single();

    if (contractError || !contract) {
      console.error('Contract fetch error:', contractError);
      return new Response(
        JSON.stringify({ error: 'Contract not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // ── Scope check: verify caller has access to the contract's organization ──
    if (!isServiceRole && callerAnewUserId && contract.organization_id) {
      const { data: membership } = await supabase
        .from('anew_memberships')
        .select('id')
        .eq('user_id', callerAnewUserId)
        .eq('status', 'active')
        .or(`organization_id.eq.${contract.organization_id}`)
        .maybeSingle();

      if (!membership) {
        // Check hierarchy
        const { data: userMemberships } = await supabase.from('anew_memberships').select('organization_id').eq('user_id', callerAnewUserId).eq('status', 'active');
        const userOrgIds = (userMemberships || []).map((m: any) => m.organization_id);
        const { data: hierarchyMatch } = await supabase.from('anew_hierarchy').select('id').eq('child_org_id', contract.organization_id).in('parent_org_id', userOrgIds).maybeSingle();
        if (!hierarchyMatch) {
          return new Response(
            JSON.stringify({ error: 'Sem permissão para aceder a este contrato' }),
            { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }
      }
    }

    // Resolve organization (provider) name
    let orgName = 'N/A';
    let orgAddress = '';
    if (contract.organization_id) {
      const { data: org } = await supabase
        .from('anew_organizations')
        .select('name')
        .eq('id', contract.organization_id)
        .single();
      orgName = org?.name || 'N/A';

      // Try to get organization address
      const { data: orgAddresses } = await supabase
        .from('anew_entity_addresses')
        .select('address_id, is_primary, anew_addresses(*)')
        .eq('entity_id', contract.organization_id)
        .order('is_primary', { ascending: false })
        .limit(1);
      if (orgAddresses?.[0]?.anew_addresses) {
        const a = orgAddresses[0].anew_addresses as any;
        orgAddress = `${a.street || ''} ${a.number || ''}<br>${a.postal_code || ''} ${a.city || ''}`;
      }
    }

    // Resolve client (entity) data
    let clientName = 'N/A';
    let clientVat = '';
    let clientAddress = '';
    let clientEmail = '';
    if (contract.entity_id) {
      const { data: entity } = await supabase
        .from('anew_entities')
        .select('display_name')
        .eq('id', contract.entity_id)
        .single();
      clientName = entity?.display_name || 'N/A';

      // Get email
      const { data: emails } = await supabase
        .from('anew_entity_emails')
        .select('email')
        .eq('entity_id', contract.entity_id)
        .eq('is_primary', true)
        .limit(1);
      clientEmail = emails?.[0]?.email || '';

      // Get address
      const { data: entityAddresses } = await supabase
        .from('anew_entity_addresses')
        .select('address_id, is_primary, anew_addresses(*)')
        .eq('entity_id', contract.entity_id)
        .order('is_primary', { ascending: false })
        .limit(1);
      if (entityAddresses?.[0]?.anew_addresses) {
        const a = entityAddresses[0].anew_addresses as any;
        clientAddress = `${a.street || ''} ${a.number || ''}<br>${a.postal_code || ''} ${a.city || ''}`;
      }

      // Get VAT from fiscal entities
      const { data: fiscalEntities } = await supabase
        .from('anew_entity_fiscal_entities')
        .select('fiscal_entity_id')
        .eq('entity_id', contract.entity_id)
        .eq('is_primary', true)
        .limit(1);
      if (fiscalEntities?.[0]?.fiscal_entity_id) {
        // fiscal_entity_id might reference the entity itself with VAT stored elsewhere
        // For now, skip VAT resolution
      }
    }

    // Body comes directly from client_contracts (version system never went live).
    const contractBody: string = (contract as any).body_html || (contract as any).generated_body || '';

    // Generate HTML content for PDF
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.6; margin: 40px; }
    .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #333; padding-bottom: 20px; }
    .header h1 { margin: 0; font-size: 24px; }
    .contract-number { color: #666; font-size: 14px; margin-top: 10px; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .party { width: 45%; }
    .party h3 { margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
    .clause { margin-bottom: 20px; }
    .clause h4 { margin-bottom: 10px; color: #333; }
    .clause-text { text-align: justify; }
    .signatures { margin-top: 50px; display: flex; justify-content: space-between; }
    .signature-box { width: 45%; text-align: center; }
    .signature-line { border-top: 1px solid #333; margin-top: 60px; padding-top: 10px; }
    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #666; }
    .value { font-size: 16px; font-weight: bold; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
    <div class="contract-number">${contract.contract_number}</div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>PRIMEIRA PARTE (Prestador)</h3>
      <p><strong>${orgName}</strong></p>
      ${orgAddress ? `<p>${orgAddress}</p>` : ''}
    </div>
    <div class="party">
      <h3>SEGUNDA PARTE (Cliente)</h3>
      <p><strong>${clientName}</strong></p>
      ${clientVat ? `<p>NIF: ${clientVat}</p>` : ''}
      ${clientAddress ? `<p>${clientAddress}</p>` : ''}
    </div>
  </div>

  ${contract.total_value ? `
  <div class="value">
    Valor Total: ${new Intl.NumberFormat('pt-PT', { style: 'currency', currency: contract.currency || 'EUR' }).format(contract.total_value)}
  </div>
  ` : ''}

  ${contract.start_date || contract.end_date ? `
  <p><strong>Período:</strong> ${contract.start_date ? new Date(contract.start_date).toLocaleDateString('pt-PT') : 'N/A'} a ${contract.end_date ? new Date(contract.end_date).toLocaleDateString('pt-PT') : 'Indeterminado'}</p>
  ` : ''}

  <h2>CLÁUSULAS</h2>
  
  ${contractBody}

  <div class="signatures">
    ${contract.client_contract_parties?.filter((p: any) => p.is_signatory !== false)
      .map((party: any) => `
      <div class="signature-box">
        <div class="signature-line">
          ${party.signing_name || party.role}<br>
          ${party.signed_at ? `Assinado em: ${new Date(party.signed_at).toLocaleDateString('pt-PT')}` : '(Por assinar)'}
        </div>
      </div>
    `).join('') || `
      <div class="signature-box">
        <div class="signature-line">Primeira Parte</div>
      </div>
      <div class="signature-box">
        <div class="signature-line">Segunda Parte</div>
      </div>
    `}
  </div>

  <div class="footer">
    <p>Documento gerado automaticamente em ${new Date().toLocaleDateString('pt-PT')} às ${new Date().toLocaleTimeString('pt-PT')}</p>
    <p>Versão 1</p>
  </div>
</body>
</html>
    `;

    console.log('Contract PDF HTML generated for:', contract.contract_number);

    return new Response(
      JSON.stringify({
        success: true,
        html: htmlContent,
        contract_number: contract.contract_number,
        version: 1,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error: any) {
    console.error('Error generating contract PDF:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
};

serve(handler);
