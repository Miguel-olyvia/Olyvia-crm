import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from "npm:zod";

const requestSchema = z.object({
  token: z.string(),
  signer_name: z.string().optional(),
});

import { corsHeaders } from "../_shared/cors.ts";

interface SignatureRequest {
  token: string;
  signer_name?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'GET') {
      // Validate token and return contract info
      const url = new URL(req.url);
      const token = url.searchParams.get('token');
      
      if (!token || token.length < 10 || token.length > 500) {
        return new Response(
          JSON.stringify({ error: 'Token is required and must be between 10 and 500 characters' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Hash the token to compare with stored hash
      const encoder = new TextEncoder();
      const data = encoder.encode(token);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Find the signature token
      const { data: signatureToken, error: tokenError } = await supabase
        .from('client_contract_signature_tokens')
        .select(`
          id,
          contract_party_id,
          valid_until,
          used_at,
          attempts,
          signature_request_id
        `)
        .eq('token_hash', tokenHash)
        .single();

      if (tokenError || !signatureToken) {
        console.error('Token validation error:', tokenError);
        return new Response(
          JSON.stringify({ error: 'Invalid or expired token' }),
          { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Check if token is expired
      if (new Date(signatureToken.valid_until) < new Date()) {
        return new Response(
          JSON.stringify({ error: 'Token has expired' }),
          { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Check if already used
      if (signatureToken.used_at) {
        return new Response(
          JSON.stringify({ error: 'Token has already been used' }),
          { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Increment attempt count
      await supabase
        .from('client_contract_signature_tokens')
        .update({ attempts: (signatureToken.attempts || 0) + 1 })
        .eq('id', signatureToken.id);

      // Fetch party and contract data separately
      const { data: party } = await supabase
        .from('client_contract_parties')
        .select('id, signing_name, signing_email, role, status, contract_id')
        .eq('id', signatureToken.contract_party_id)
        .single();

      let contract = null;
      if (party?.contract_id) {
        const { data: contractData } = await supabase
          .from('client_contracts')
          .select(`
            id,
            contract_number,
            status,
            total_value,
            currency,
            start_date,
            end_date,
            organization_id,
            entity_id
          `)
          .eq('id', party.contract_id)
          .single();
        
        if (contractData) {
          // Fetch organization name
          let orgName = null;
          if (contractData.organization_id) {
            const { data: org } = await supabase
              .from('anew_organizations')
              .select('name')
              .eq('id', contractData.organization_id)
              .single();
            orgName = org?.name;
          }
          
          // Fetch entity (client) name
          let clientName = null;
          if (contractData.entity_id) {
            const { data: entity } = await supabase
              .from('anew_entities')
              .select('display_name')
              .eq('id', contractData.entity_id)
              .single();
            clientName = entity?.display_name;
          }
          
          contract = {
            ...contractData,
            company_name: orgName,
            client_name: clientName,
          };
        }
      }

      return new Response(
        JSON.stringify({
          valid: true,
          contract: contract ? {
            id: contract.id,
            contract_number: contract.contract_number,
            status: contract.status,
            total_value: contract.total_value,
            currency: contract.currency,
            start_date: contract.start_date,
            end_date: contract.end_date,
            company_name: contract.company_name,
            client_name: contract.client_name,
          } : null,
          party: party ? {
            id: party.id,
            signing_name: party.signing_name,
            signing_email: party.signing_email,
            role: party.role,
            status: party.status,
          } : null,
          token_id: signatureToken.id,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    if (req.method === 'POST') {
      // Process signature
      const body = await req.json();
      const parsed = requestSchema.safeParse(body);
      if (!parsed.success) {
        return new Response(
          JSON.stringify({ error: 'Invalid request', details: parsed.error.issues }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }
      const { token, signer_name } = parsed.data;

      // Hash the token
      const encoder = new TextEncoder();
      const data = encoder.encode(token);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Find and validate the token
      const { data: signatureToken, error: tokenError } = await supabase
        .from('client_contract_signature_tokens')
        .select(`
          id,
          contract_party_id,
          valid_until,
          used_at,
          signature_request_id
        `)
        .eq('token_hash', tokenHash)
        .single();

      if (tokenError || !signatureToken) {
        return new Response(
          JSON.stringify({ error: 'Invalid token' }),
          { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      if (new Date(signatureToken.valid_until) < new Date()) {
        return new Response(
          JSON.stringify({ error: 'Token has expired' }),
          { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      if (signatureToken.used_at) {
        return new Response(
          JSON.stringify({ error: 'Contract has already been signed with this token' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Fetch party data
      const { data: partyData } = await supabase
        .from('client_contract_parties')
        .select('id, contract_id, status, signing_name')
        .eq('id', signatureToken.contract_party_id)
        .single();

      // Get client IP and user agent
      const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
      const userAgent = req.headers.get('user-agent') || 'unknown';

      // Update the party as signed
      const { error: partyError } = await supabase
        .from('client_contract_parties')
        .update({
          status: 'signed',
          signed_at: new Date().toISOString(),
          signing_name: signer_name || partyData?.signing_name,
          signature_ip: clientIp,
          signature_user_agent: userAgent,
        })
        .eq('id', signatureToken.contract_party_id);

      if (partyError) {
        console.error('Error updating party:', partyError);
        return new Response(
          JSON.stringify({ error: 'Failed to process signature' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Mark token as used
      await supabase
        .from('client_contract_signature_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', signatureToken.id);

      // Check if all parties have signed
      const contractId = partyData?.contract_id;
      const { data: allParties } = await supabase
        .from('client_contract_parties')
        .select('status')
        .eq('contract_id', contractId)
        .eq('is_signatory', true);

      const allSigned = allParties?.every(p => p.status === 'signed');

      if (allSigned) {
        // Update contract status to signed
        await supabase
          .from('client_contracts')
          .update({ status: 'signed' })
          .eq('id', contractId);

        // Update signature request status
        await supabase
          .from('client_contract_signature_requests')
          .update({ status: 'completed' })
          .eq('id', signatureToken.signature_request_id);

        // Trigger execute-workflow to convert contact to client
        try {
          console.log('[validate-contract-signature] All parties signed, triggering workflow for contract:', contractId);
          await fetch(`${supabaseUrl}/functions/v1/execute-workflow`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              source_entity: 'contract',
              entity_id: contractId,
              new_stage_id: 'signed',
              triggered_by: null,
            }),
          });
          console.log('[validate-contract-signature] Workflow triggered successfully');
        } catch (wfErr) {
          console.error('[validate-contract-signature] Error triggering workflow:', wfErr);
        }
      }

      // Log the event
      await supabase
        .from('client_contract_events')
        .insert({
          contract_id: contractId,
          event_type: 'signed',
          description: `Contract signed by ${signer_name || 'party'}`,
          client_ip: clientIp,
          user_agent: userAgent,
        });

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Contract signed successfully',
          all_parties_signed: allSigned,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error: any) {
    console.error('Error in validate-contract-signature:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
};

serve(handler);
