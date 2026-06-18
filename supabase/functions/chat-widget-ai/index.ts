import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple in-memory rate limiter per form_id (max 20 requests per minute)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(formId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(formId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(formId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { form_id, messages, collected_data, conversation_mode } = await req.json();

    // Rate limiting per form_id
    if (!form_id || !checkRateLimit(form_id)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch form configuration from the forms table
    const { data: formData, error: formError } = await supabase
      .from("forms")
      .select("id, name, branding, settings, organization_id")
      .eq("id", form_id)
      .maybeSingle();

    if (formError || !formData) {
      console.error("Error fetching form:", formError);
      throw new Error("Form not found");
    }

    // Get company info and AI knowledge from back office
    let companyName = "Empresa";
    let aiKnowledge: any = null;
    
    if (formData.organization_id) {
      const { data: knowledgeData } = await supabase
        .from("company_ai_knowledge")
        .select("*")
        .eq("organization_id", formData.organization_id)
        .eq("is_active", true)
        .maybeSingle();
      
      if (knowledgeData) {
        aiKnowledge = knowledgeData;
        companyName = knowledgeData.brand_name || "Empresa";
      } else {
        const { data: companyData } = await supabase
          .from("anew_organizations")
          .select("name")
          .eq("id", formData.organization_id)
          .maybeSingle();
        
        if (companyData?.name) {
          companyName = companyData.name;
        }
      }
    }

    const companyId = formData.organization_id;

    // Get dynamic flow configuration from backoffice (with defaults)
    const defaultInitialOptions = [
      { key: 'new_quote', label: 'Quero um orçamento gratuito', action: 'lead_capture' },
      { key: 'check_visit', label: 'Saber sobre a minha visita técnica', action: 'client_lookup' }
    ];

    const flowConfig = {
      clientModeEnabled: aiKnowledge?.client_mode_enabled ?? true,
      clientValidationFields: aiKnowledge?.client_validation_fields ?? ['phone', 'postal_code', 'locality'],
      showProposals: aiKnowledge?.show_proposals ?? true,
      showVisits: aiKnowledge?.show_visits ?? true,
      welcomeMessage: aiKnowledge?.welcome_message ?? 'Olá! 👋 Bem-vindo(a)!',
      initialQuestion: aiKnowledge?.initial_question ?? 'Como posso ajudar hoje?',
      initialOptions: aiKnowledge?.initial_options ?? defaultInitialOptions,
      clientQuestion: aiKnowledge?.client_question ?? 'Já é nosso cliente?',
      newClientCta: aiKnowledge?.new_client_cta ?? 'Quer receber um orçamento gratuito e sem compromisso? 😊',
      clientNotFoundMessage: aiKnowledge?.client_not_found_message ?? 'Não encontrámos nenhum registo com esses dados. Quer pedir um orçamento gratuito?',
      clientFoundMessage: aiKnowledge?.client_found_message ?? 'Encontrámos o seu registo! Aqui estão as informações:',
      fallbackContactMessage: aiKnowledge?.fallback_contact_message ?? 'Se precisar de ajuda adicional, pode sempre ligar-nos para {phone}. Estamos aqui para ajudar! 😊',
      fallbackContactPhone: aiKnowledge?.fallback_contact_phone ?? ''
    };

    // Get campaign_id from the form's related campaign
    const { data: campaignData } = await supabase
      .from("campaigns")
      .select("id, name, organization_id")
      .eq("organization_id", companyId)
      .limit(1)
      .maybeSingle();

    const campaignId = campaignData?.id || 'bbbb2222-2222-2222-2222-222222222222';

    // Check if we need to look up client data
    let clientLookupResult: any = null;
    const clientPhone = collected_data?.client_phone;
    const clientPostalCode = collected_data?.client_postal_code;
    const clientLocality = collected_data?.client_locality;

    // Only do lookup if client mode is enabled and we have minimum required data
    const hasPhone = flowConfig.clientValidationFields.includes('phone') && clientPhone;
    const hasPostalCode = flowConfig.clientValidationFields.includes('postal_code') && clientPostalCode;
    
    if (flowConfig.clientModeEnabled && hasPhone) {
      const phoneClean = clientPhone.replace(/\D/g, '');
      
      // Search in anew_leads by phone in field_values
      const { data: leads } = await supabase
        .from("anew_leads")
        .select("id, field_values, client_id, entity_id")
        .eq("organization_id", companyId)
        .or(`field_values->>phone.ilike.%${phoneClean}%,field_values->>phone.ilike.%${clientPhone}%`);

      let matchedLead = leads?.[0];
      let matchedClientId = matchedLead?.client_id;

      // If no lead found, try anew_clients via entity phone match
      if (!matchedLead) {
        const { data: phoneMatches } = await supabase
          .from("anew_entity_phones")
          .select("entity_id")
          .or(`phone_number.ilike.%${phoneClean}%,phone_number.ilike.%${clientPhone}%`)
          .limit(50);

        const entityIds = (phoneMatches || []).map((p: any) => p.entity_id).filter(Boolean);
        if (entityIds.length > 0) {
          const { data: clients } = await supabase
            .from("anew_clients")
            .select("id, entity_id")
            .eq("organization_id", companyId)
            .in("entity_id", entityIds)
            .is("deleted_at", null)
            .limit(1);

          if (clients?.[0]) {
            matchedClientId = clients[0].id;
          }
        }
      }

      if (matchedClientId) {
        // Found a client! Now look for their proposals and visits
        let proposals: any[] = [];
        let visits: any[] = [];
        
        if (flowConfig.showProposals) {
          const { data: proposalData } = await supabase
            .from("proposals")
            .select("id, title, status, value, created_at, valid_until, stage_id, proposal_workflow_stages(stage_name)")
            .eq("client_id", matchedClientId)
            .order("created_at", { ascending: false })
            .limit(5);
          proposals = proposalData || [];
        }

        if (flowConfig.showVisits) {
          const { data: scheduleItems } = await supabase
            .from("schedule_items")
            .select("id, title, start_datetime, end_datetime, status, notes")
            .eq("client_id", matchedClientId)
            .gte("start_datetime", new Date().toISOString())
            .order("start_datetime", { ascending: true })
            .limit(3);

          visits = scheduleItems || [];
          
          // calendar_visits removed — schedule_items is the only source now
        }

        clientLookupResult = {
          found: true,
          contact_name: matchedLead ? `${matchedLead.field_values?.first_name || ''} ${matchedLead.field_values?.last_name || ''}`.trim() : null,
          proposals,
          upcoming_visits: visits
        };
      } else {
        clientLookupResult = {
          found: false,
          message: flowConfig.clientNotFoundMessage
        };
      }
    }

    // Fetch form fields from lead_field_definitions using campaign_id
    const { data: fieldDefs, error: fieldsError } = await supabase
      .from("lead_field_definitions")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("is_active", true)
      .order("step_number", { ascending: true })
      .order("sort_order", { ascending: true });

    if (fieldsError) {
      console.error("Error fetching fields:", fieldsError);
    }

    // Fetch valid districts for this campaign
    const { data: campaignDistricts } = await supabase
      .from("campaign_districts")
      .select("district_id, administrative_divisions(name)")
      .eq("campaign_id", campaignId);

    const validDistricts = campaignDistricts?.map((d: any) => d.administrative_divisions?.name).filter(Boolean) || [];
    const hasDistrictRestriction = validDistricts.length > 0;

    console.log("Company:", companyName, "Fields:", fieldDefs?.length || 0, "Client lookup:", clientLookupResult?.found, "Flow config:", flowConfig.clientModeEnabled);

    // Build fields context for AI from lead_field_definitions
    const allFields = fieldDefs || [];
    const fieldsContext = allFields.map((f: any) => {
      const isDistrictField = f.field_key?.includes('distrito') || f.field_type === 'ref_district';
      let options = f.options?.options || null;
      
      if (isDistrictField && hasDistrictRestriction) {
        options = validDistricts;
      }
      
      return {
        key: f.field_key,
        label: f.field_label,
        type: f.field_type,
        required: f.is_required,
        placeholder: f.placeholder,
        options,
        step: f.step_number,
        isDistrictField
      };
    });

    // Determine which fields are still missing (for lead capture mode)
    const collectedKeys = Object.keys(collected_data || {});
    const missingLeadFields = fieldsContext.filter((f: any) => f.required && !collectedKeys.includes(f.key));
    
    // Check if collected district is valid
    const collectedDistrict = collected_data?.po_distrito;
    const isDistrictInvalid = hasDistrictRestriction && collectedDistrict && !validDistricts.includes(collectedDistrict);

    // Build company info from AI knowledge (back office) or use defaults
    const services = aiKnowledge?.services || [];
    const benefits = aiKnowledge?.benefits || [];
    const promotions = aiKnowledge?.promotions || [];
    const contactInfo = aiKnowledge?.contact_info || {};
    const workingHours = aiKnowledge?.working_hours || '';
    const description = aiKnowledge?.description || '';
    const tagline = aiKnowledge?.tagline || '';
    const customPrompt = aiKnowledge?.custom_prompt || '';

    // Build dynamic company info section
    let companyInfoSection = `INFORMAÇÃO SOBRE A EMPRESA (${companyName.toUpperCase()}):`;
    
    if (tagline) companyInfoSection += `\n- ${tagline}`;
    if (description) companyInfoSection += `\n- ${description}`;
    
    if (services.length > 0) {
      companyInfoSection += `\n- Serviços principais:`;
      services.forEach((s: string) => companyInfoSection += `\n  • ${s}`);
    }
    
    if (benefits.length > 0) {
      companyInfoSection += `\n- Benefícios:`;
      benefits.forEach((b: string) => companyInfoSection += `\n  • ${b}`);
    }
    
    if (promotions.length > 0) {
      promotions.forEach((p: string) => companyInfoSection += `\n- Promoção atual: ${p}`);
    }
    
    if (workingHours) companyInfoSection += `\n- Horário: ${workingHours}`;
    
    if (Object.keys(contactInfo).length > 0) {
      const contacts = [];
      if (contactInfo.phone_fixed) contacts.push(`${contactInfo.phone_fixed} (fixo)`);
      if (contactInfo.phone_mobile) contacts.push(`${contactInfo.phone_mobile} (móvel)`);
      if (contactInfo.whatsapp) contacts.push(`${contactInfo.whatsapp} (WhatsApp)`);
      if (contacts.length > 0) companyInfoSection += `\n- Contactos: ${contacts.join(' | ')}`;
    }

    const personalityNote = customPrompt || '';

    // Build client info section if lookup was performed
    let clientInfoSection = '';
    if (clientLookupResult) {
      if (clientLookupResult.found) {
        clientInfoSection = `
🔍 RESULTADO DA PESQUISA DE CLIENTE:
- Cliente encontrado: ${clientLookupResult.contact_name || 'Sim'}
- Mensagem a usar: "${flowConfig.clientFoundMessage}"
`;
        if (flowConfig.showProposals && clientLookupResult.proposals?.length > 0) {
          clientInfoSection += `- Propostas encontradas (${clientLookupResult.proposals.length}):\n`;
          clientLookupResult.proposals.forEach((p: any) => {
            const status = p.proposal_workflow_stages?.stage_name || p.status;
            const date = new Date(p.created_at).toLocaleDateString('pt-PT');
            clientInfoSection += `  • "${p.title}" - Estado: ${status} - Data: ${date}\n`;
          });
        } else if (flowConfig.showProposals) {
          clientInfoSection += `- Nenhuma proposta encontrada\n`;
        }
        
        if (flowConfig.showVisits && clientLookupResult.upcoming_visits?.length > 0) {
          clientInfoSection += `- Próximas visitas:\n`;
          clientLookupResult.upcoming_visits.forEach((v: any) => {
            const date = new Date(v.start_datetime).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
            clientInfoSection += `  • ${v.title || 'Visita'} - ${date}\n`;
          });
        } else if (flowConfig.showVisits) {
          clientInfoSection += `- Nenhuma visita agendada\n`;
        }
      } else {
        clientInfoSection = `
🔍 RESULTADO DA PESQUISA: Não foi encontrado nenhum cliente com os dados fornecidos.
Mensagem a usar: "${flowConfig.clientNotFoundMessage}"
`;
      }
    }

    // Build validation fields instructions
    const validationFieldsInstructions = flowConfig.clientValidationFields.map((field: string) => {
      switch (field) {
        case 'phone': return '- "Qual é o seu número de telefone?" → extracted_field: "client_phone"';
        case 'postal_code': return '- "E o código postal?" → extracted_field: "client_postal_code"';
        case 'locality': return '- "Qual a sua localidade/freguesia?" → extracted_field: "client_locality"';
        default: return '';
      }
    }).filter(Boolean).join('\n');

    // Build initial options text
    const optionsText = flowConfig.initialOptions.map((opt: any, i: number) => 
      `${i + 1}. "${opt.label}" → action: ${opt.action}`
    ).join('\n');

    // Build the system prompt with dynamic configuration
    const clientModeInstructions = flowConfig.clientModeEnabled ? `
📌 MODO CLIENTE (quando utilizador escolhe opção com action: "client_lookup"):
Objetivo: Identificar o cliente e mostrar informações sobre propostas/visitas

Perguntas a fazer (uma de cada vez):
${validationFieldsInstructions}

${clientInfoSection}

Após identificar o cliente:
- Se encontrado: Mostra as informações das propostas e visitas de forma amigável
- Se não encontrado: Usa a mensagem: "${flowConfig.clientNotFoundMessage}"
` : '';

    const systemPrompt = `Tu és a assistente virtual da ${companyName}.

⚠️ REGRA CRÍTICA: O nome da empresa é SEMPRE "${companyName}" (exatamente assim). NUNCA uses variações, códigos ou nomes diferentes.

${companyInfoSection}

${personalityNote}

🎯 FLUXO CONVERSACIONAL PRINCIPAL:

PASSO 1 - BOAS-VINDAS E PERGUNTA INICIAL COM OPÇÕES:
- Mensagem de boas-vindas: "${flowConfig.welcomeMessage}"
- PERGUNTA OBRIGATÓRIA: "${flowConfig.initialQuestion}"
- MOSTRA SEMPRE AS OPÇÕES DISPONÍVEIS na pergunta:
${optionsText}
- extracted_field: "initial_choice"

COMO APRESENTAR A PERGUNTA INICIAL:
- Diz a boas-vindas
- Faz a pergunta inicial
- LISTA AS OPÇÕES de forma clara: "(1) ${flowConfig.initialOptions[0]?.label} ou (2) ${flowConfig.initialOptions[1]?.label})"

QUANDO O UTILIZADOR RESPONDE:
- Se escolher opção com action "lead_capture" → vai para MODO ORÇAMENTO
- Se escolher opção com action "client_lookup" → vai para MODO CLIENTE
- extracted_value deve ser o key da opção escolhida (ex: "new_quote" ou "check_visit")

${clientModeInstructions}

📌 MODO ORÇAMENTO (quando utilizador escolhe opção com action: "lead_capture"):
Objetivo: Recolher dados para orçamento gratuito

Diz: "${flowConfig.newClientCta}"
Depois recolhe os campos do formulário.

CAMPOS DO FORMULÁRIO A RECOLHER (MODO NOVO CLIENTE):
${JSON.stringify(fieldsContext, null, 2)}

DADOS JÁ RECOLHIDOS:
${JSON.stringify(collected_data || {}, null, 2)}

CAMPOS EM FALTA:
${JSON.stringify(missingLeadFields.map(f => ({ key: f.key, label: f.label, options: f.options })), null, 2)}

${hasDistrictRestriction ? `
⚠️ VALIDAÇÃO DE LOCALIZAÇÃO:
- A campanha SÓ está ativa nos distritos: ${validDistricts.join(', ')}
- Se o distrito não for válido, informa que não operam nessa zona e define "is_valid_location": false
${isDistrictInvalid ? `⛔ ATENÇÃO: "${collectedDistrict}" NÃO é uma zona válida!` : ''}
` : ''}

INSTRUÇÕES DE COMPORTAMENTO:
1. Sê empática e calorosa
2. PERGUNTA UM CAMPO DE CADA VEZ
3. Primeira pergunta pode ser mais acolhedora, as seguintes devem ser CURTAS
4. Confirma dados com 1-3 palavras ("Anotado!", "Perfeito!") + próxima pergunta
5. Usa emojis com moderação 😊
6. NUNCA inventes dados
7. **MUITO IMPORTANTE - CAMPOS SELECT/ESCOLHA:**
   - Para campos com opções predefinidas, INCLUI SEMPRE as opções NA PERGUNTA
   - Formato: "Pergunta? (Opção 1, Opção 2 ou Opção 3)"
   - Exemplo: "Que área pretende remodelar? (Casa de Banho, Cozinha ou Ambas)"
   - NUNCA faças uma pergunta de select sem mostrar as opções disponíveis!

⚠️ MUDANÇA DE MODO A QUALQUER MOMENTO:
- Se o utilizador disser "sou cliente", "afinal sou cliente", "já sou cliente", "sou cliente sim" em QUALQUER ponto da conversa:
  - Muda IMEDIATAMENTE para MODO CLIENTE (conversation_mode: "client_lookup")
  - Define extracted_field: "initial_choice" e extracted_value: "check_visit"
  - Começa a pedir os dados de validação (telefone, etc.)
  - NUNCA continues a recolher dados do formulário se o utilizador indicar que é cliente!

VALIDAÇÃO DE RESPOSTAS:
- Para pergunta inicial: Aceita números (1, 2) ou texto que corresponda às opções
- Para telefone: Mínimo 9 dígitos
- Para código postal: Formato XXXX ou XXXX-XXX
- Para select: Resposta deve corresponder a uma das opções apresentadas
- Para email: Deve conter @

📞 CONTACTO DE EMERGÊNCIA (MUITO IMPORTANTE):
${flowConfig.fallbackContactPhone ? `
- Quando NÃO conseguires ajudar o cliente (não encontras dados, não sabes a resposta, cliente frustrado, situação complexa):
- USA SEMPRE esta mensagem de forma empática: "${flowConfig.fallbackContactMessage.replace('{phone}', flowConfig.fallbackContactPhone)}"
- O número de contacto é: ${flowConfig.fallbackContactPhone}
- Sê sempre muito simpático e compreensivo ao sugerir o contacto telefónico
- Exemplos de quando usar:
  • "Lamento, não estou a conseguir encontrar essa informação. Mas não se preocupe! Pode sempre ligar-nos para ${flowConfig.fallbackContactPhone} e a nossa equipa terá todo o gosto em ajudar! 😊"
  • "Entendo a sua frustração. Para resolver isso da melhor forma, sugiro que ligue para ${flowConfig.fallbackContactPhone}. A nossa equipa está pronta para ajudar!"
` : '- Nenhum contacto de emergência configurado'}

FORMATO DE RESPOSTA (JSON OBRIGATÓRIO):
{
  "message": "A tua mensagem para o utilizador",
  "extracted_field": "chave_do_campo" ou null,
  "extracted_value": "valor_extraído" ou null,
  "is_complete": true/false,
  "is_valid_location": true/false,
  "conversation_mode": "initial" | "client_lookup" | "lead_capture"
}

VALORES PARA conversation_mode:
- "initial": Ainda a perguntar se é cliente
- "client_lookup": Modo cliente, a validar identidade ou mostrar dados
- "lead_capture": Modo orçamento, a recolher dados do formulário

IMPORTANTE:
- is_complete=true APENAS quando todos os campos obrigatórios estiverem preenchidos (modo lead_capture) OU quando já mostrou as informações do cliente (modo client_lookup)
- Se o cliente foi encontrado e já viu as suas propostas/visitas, marca is_complete=true`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    console.log("AI Response:", content);

    // Parse JSON response
    let parsedResponse;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        parsedResponse = {
          message: content,
          extracted_field: null,
          extracted_value: null,
          is_complete: false,
          conversation_mode: "initial"
        };
      }
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      parsedResponse = {
        message: content,
        extracted_field: null,
        extracted_value: null,
        is_complete: false,
        conversation_mode: "initial"
      };
    }

    // Add campaign_id to response for lead creation
    parsedResponse.campaign_id = campaignId;
    
    // Add client lookup result if available
    if (clientLookupResult) {
      parsedResponse.client_lookup = clientLookupResult;
    }

    return new Response(
      JSON.stringify(parsedResponse),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Chat Widget AI error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
