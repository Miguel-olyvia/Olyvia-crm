import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";

const requestSchema = z.object({
  action: z.string(),
  caller_type: z.string().optional(),
  target_user_id: z.string().optional(),
});

import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const smsApiToken = Deno.env.get("SMSAPI_TOKEN");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (!smsApiToken) {
      return new Response(JSON.stringify({ error: "SMSAPI_TOKEN not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request", details: parsed.error.issues }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { action, caller_type, target_user_id } = parsed.data;

    // Determine if caller is CRM user or portal user
    const isCrmCaller = caller_type === "crm";

    let phoneNumber: string | null = null;
    let callerName: string | null = null;

    // Helper to resolve phone for an anew_user
    const resolveAnewUserPhone = async (anewUser: any): Promise<string | null> => {
      let phone: string | null = null;
      if (anewUser.phone) {
        const num = anewUser.phone.replace(/\s+/g, "").replace(/^0+/, "");
        phone = num.startsWith("+") ? num : `+351${num}`;
      }
      if (!phone && anewUser.entity_id) {
        const { data: ep } = await supabase
          .from("anew_entity_phones")
          .select("phone_number, country_code")
          .eq("entity_id", anewUser.entity_id)
          .eq("is_primary", true)
          .limit(1)
          .maybeSingle();
        if (ep) {
          const cc = ep.country_code || "+351";
          const num = ep.phone_number.replace(/\s+/g, "").replace(/^0+/, "");
          phone = num.startsWith("+") ? num : `${cc}${num}`;
        }
      }
      return phone;
    };

    if (isCrmCaller) {
      // Verify caller is a CRM user
      const { data: callerUser } = await supabase
        .from("anew_users")
        .select("id, name, phone, entity_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!callerUser) {
        return new Response(JSON.stringify({ error: "Not a CRM user" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If target_user_id is provided, resolve phone for that user instead (e.g. signatory verification)
      if (target_user_id) {
        const { data: targetUser } = await supabase
          .from("anew_users")
          .select("id, name, phone, entity_id")
          .eq("id", target_user_id)
          .maybeSingle();

        if (!targetUser) {
          return new Response(JSON.stringify({ error: "target_user_not_found", message: "Utilizador signatário não encontrado." }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        callerName = targetUser.name;
        phoneNumber = await resolveAnewUserPhone(targetUser);
      } else {
        callerName = callerUser.name;
        phoneNumber = await resolveAnewUserPhone(callerUser);

        // Fallback: auth user phone
        if (!phoneNumber) {
          phoneNumber = user.phone || user.user_metadata?.phone || null;
        }
      }
    } else {
      // Portal user (original flow)
      const { data: portalUser } = await supabase
        .from("client_portal_users")
        .select("id, entity_id, organization_id, created_by")
        .eq("auth_user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!portalUser) {
        return new Response(JSON.stringify({ error: "Not a portal user" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get phone from entity
      if (portalUser.entity_id) {
        const { data: phone } = await supabase
          .from("anew_entity_phones")
          .select("phone_number, country_code")
          .eq("entity_id", portalUser.entity_id)
          .eq("is_primary", true)
          .limit(1)
          .maybeSingle();

        if (phone) {
          const cc = phone.country_code || "+351";
          const num = phone.phone_number.replace(/\s+/g, "").replace(/^0+/, "");
          phoneNumber = num.startsWith("+") ? num : `${cc}${num}`;
        }
      }

      if (!phoneNumber) {
        phoneNumber = user.phone || user.user_metadata?.phone || null;
      }
    }

    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    if (action === "send_otp") {
      const { reference_id, reference_type, purpose } = body;
      if (!reference_id || !reference_type) {
        return new Response(JSON.stringify({ error: "reference_id and reference_type required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!phoneNumber) {
        return new Response(JSON.stringify({ error: "no_phone", message: "Não foi encontrado um número de telefone associado à sua conta. Atualize o seu perfil e adicione um telemóvel principal." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Rate limit: max 3 OTPs per reference in last 10 minutes
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("sms_otp_codes")
        .select("id", { count: "exact", head: true })
        .eq("reference_id", reference_id)
        .eq("reference_type", reference_type)
        .eq("purpose", purpose || "contract_signature")
        .gte("created_at", tenMinAgo);

      if ((count || 0) >= 3) {
        return new Response(JSON.stringify({ error: "rate_limit", message: "Demasiados pedidos. Aguarde alguns minutos antes de tentar novamente." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate 6-digit code
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      // Store OTP (B1: bind to auth_user_id so it can only be used by the same user)
      await supabase.from("sms_otp_codes").insert({
        phone_number: phoneNumber,
        code,
        purpose: purpose || "contract_signature",
        reference_id,
        reference_type,
        auth_user_id: user.id,
        expires_at: expiresAt,
        ip_address: clientIp,
        user_agent: userAgent,
      });

      // Send SMS via SMSAPI
      const smsMessage = `O seu código de verificação é: ${code}. Válido por 5 minutos.`;
      const cleanPhone = phoneNumber.replace("+", "");

      const smsRes = await fetch("https://api.smsapi.com/sms.do", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${smsApiToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          to: cleanPhone,
          message: smsMessage,
          format: "json",
          encoding: "utf-8",
        }),
      });

      const smsResult = await smsRes.json();
      console.log("[sms-otp] SMSAPI response:", JSON.stringify(smsResult));

      if (smsResult.error) {
        console.error("[sms-otp] SMSAPI error:", smsResult.error, smsResult.message);
        return new Response(JSON.stringify({ error: "sms_failed", message: "Falha ao enviar SMS. Tente novamente." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mask phone for UI
      const maskedPhone = phoneNumber.slice(0, -4).replace(/./g, "*") + phoneNumber.slice(-4);

      return new Response(JSON.stringify({ success: true, masked_phone: maskedPhone, caller_name: callerName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "verify_otp") {
      const { reference_id, reference_type, code, purpose } = body;
      if (!reference_id || !reference_type || !code || !purpose) {
        return new Response(JSON.stringify({ error: "reference_id, reference_type, code and purpose required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find valid OTP (B1: must belong to this auth_user_id)
      const { data: otpRecord } = await supabase
        .from("sms_otp_codes")
        .select("*")
        .eq("reference_id", reference_id)
        .eq("reference_type", reference_type)
        .eq("purpose", purpose)
        .eq("auth_user_id", user.id)
        .is("verified_at", null)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!otpRecord) {
        return new Response(JSON.stringify({ error: "expired", message: "Código expirado ou inválido. Solicite um novo código." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check max attempts
      if (otpRecord.attempts >= otpRecord.max_attempts) {
        return new Response(JSON.stringify({ error: "max_attempts", message: "Número máximo de tentativas excedido. Solicite um novo código." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Increment attempts
      await supabase
        .from("sms_otp_codes")
        .update({ attempts: otpRecord.attempts + 1 })
        .eq("id", otpRecord.id);

      // Verify code
      if (otpRecord.code !== code.trim()) {
        const remaining = otpRecord.max_attempts - otpRecord.attempts - 1;
        return new Response(JSON.stringify({
          error: "invalid_code",
          message: `Código incorreto. ${remaining > 0 ? `Restam ${remaining} tentativas.` : "Solicite um novo código."}`,
        }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark as verified
      await supabase
        .from("sms_otp_codes")
        .update({ verified_at: new Date().toISOString() })
        .eq("id", otpRecord.id);

      return new Response(JSON.stringify({ success: true, verified: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[sms-otp] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
