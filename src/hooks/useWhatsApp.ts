import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

export type WhatsAppModule = "leads" | "contacts" | "clients" | "proposals" | "quotes" | "contracts";

export interface WhatsAppContext {
  module: WhatsAppModule;
  // Person
  recipientName: string;
  recipientPhone: string;
  recipientPhoneCountryCode?: string;
  // Entity IDs for timeline
  entityId?: string;
  organizationId?: string;
  contactId?: string;
  clientId?: string;
  leadId?: string;
  dealId?: string;
  contractId?: string;
  proposalId?: string;
  quoteId?: string;
  // Context-specific
  dealName?: string;
  proposalTitle?: string;
  proposalValue?: number;
  proposalLink?: string;
  quoteTitle?: string;
  quoteValue?: number;
  contractNumber?: string;
  visitDate?: string;
  hasActiveDeal?: boolean;
}

/**
 * Format phone number for WhatsApp.
 * Removes non-digits, handles PT numbers.
 */
export function formatWhatsAppPhone(phone: string, countryCode?: string): string {
  let clean = phone.replace(/\D/g, "");

  // If we have an explicit country code, prepend it
  if (countryCode) {
    const cleanCode = countryCode.replace(/\D/g, "");
    // Avoid double-prepending
    if (!clean.startsWith(cleanCode)) {
      clean = cleanCode + clean;
    }
    return clean;
  }

  // Remove leading 00
  if (clean.startsWith("00")) clean = clean.substring(2);

  // PT: 9 digits starting with 9 or 2
  if (clean.length === 9 && (clean.startsWith("9") || clean.startsWith("2"))) {
    clean = "351" + clean;
  }

  return clean;
}

/**
 * Build the default WhatsApp message based on module + context.
 */
export function buildWhatsAppMessage(ctx: WhatsAppContext, commercialName: string, companyName: string): string {
  const name = ctx.recipientName || "Cliente";

  switch (ctx.module) {
    case "leads":
      if (ctx.visitDate) {
        return `Olá ${name}, confirmo a nossa visita agendada para ${ctx.visitDate}. Alguma questão entretanto?`;
      }
      return `Olá ${name}, o meu nome é ${commercialName} da ${companyName}. Gostaria de falar consigo sobre o seu pedido. Quando lhe dá mais jeito conversarmos?`;

    case "contacts":
      if (ctx.hasActiveDeal && ctx.dealName) {
        return `Olá ${name}, envio-lhe informações sobre ${ctx.dealName}. Qualquer dúvida estou disponível!`;
      }
      return `Olá ${name}, aqui é ${commercialName} da ${companyName}. Gostaria de dar seguimento à nossa conversa. Tem disponibilidade esta semana?`;

    case "clients":
      return `Olá ${name}, aqui é ${commercialName} da ${companyName}. Como está tudo? Gostaria de saber se precisa de alguma coisa.`;

    case "proposals":
      if (ctx.proposalLink) {
        return `Olá ${name}, envio-lhe a proposta ${ctx.proposalTitle || ""} no valor de €${(ctx.proposalValue || 0).toFixed(2)}. Pode consultar todos os detalhes aqui: ${ctx.proposalLink}. Qualquer questão, estou disponível!`;
      }
      return `Olá ${name}, a proposta ${ctx.proposalTitle || ""} no valor de €${(ctx.proposalValue || 0).toFixed(2)} está pronta. Posso enviar-lhe por email ou prefere que nos reunamos para a apresentar?`;

    case "quotes":
      return `Olá ${name}, o orçamento ${ctx.quoteTitle || ""} no valor de €${(ctx.quoteValue || 0).toFixed(2)} está pronto. Gostaria de analisarmos em conjunto?`;

    case "contracts":
      return `Olá ${name}, o contrato ${ctx.contractNumber || ""} está pronto para assinatura. Posso enviar-lhe o documento?`;

    default:
      return `Olá ${name}, aqui é ${commercialName} da ${companyName}.`;
  }
}

export function useWhatsApp() {
  const { toast } = useToast();
  const { activeCompany } = useCompany();

  const openWhatsApp = useCallback((phone: string, message: string): boolean => {
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    const encoded = encodeURIComponent(message);
    const url = isMobile
      ? `https://wa.me/${phone}?text=${encoded}`
      : `https://web.whatsapp.com/send?phone=${phone}&text=${encoded}`;

    try {
      const newWindow = window.open(url, "_blank", "noopener,noreferrer");
      if (newWindow) {
        newWindow.opener = null;
        return true;
      }
    } catch {}

    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return true;
    } catch {}

    try {
      window.top?.location.assign(url);
      return true;
    } catch {}

    try {
      window.location.href = url;
      return true;
    } catch {
      return false;
    }
  }, []);

  const sendWhatsApp = useCallback(async (ctx: WhatsAppContext, customMessage?: string) => {
    if (!ctx.recipientPhone) {
      toast({
        title: "Telefone não definido",
        description: "Adicione um número de telefone primeiro.",
        variant: "destructive",
      });
      return false;
    }

    const phone = formatWhatsAppPhone(ctx.recipientPhone, ctx.recipientPhoneCountryCode);
    if (!phone || phone.length < 9) {
      toast({
        title: "Telefone inválido",
        description: "O número de telefone não é válido.",
        variant: "destructive",
      });
      return false;
    }

    if (customMessage) {
      const opened = openWhatsApp(phone, customMessage);
      if (!opened) {
        toast({
          title: "Popup bloqueado",
          description: "Permita pop-ups para abrir o WhatsApp.",
          variant: "destructive",
        });
      }
      return opened;
    }

    // Get commercial name and company name
    let commercialName = "Equipa Comercial";
    let companyName = activeCompany?.name || "";
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: anewUser } = await (supabase as any)
          .from("anew_users")
          .select("name")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        if (anewUser?.name) commercialName = anewUser.name;
      }
    } catch {}

    const message = buildWhatsAppMessage(ctx, commercialName, companyName);
    const opened = openWhatsApp(phone, message);
    if (!opened) {
      toast({
        title: "Popup bloqueado",
        description: "Permita pop-ups para abrir o WhatsApp.",
        variant: "destructive",
      });
    }
    return opened;
  }, [toast, activeCompany, openWhatsApp]);

  const registerInTimeline = useCallback(async (ctx: WhatsAppContext, messagePreview: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const createdBy = await resolveCurrentBusinessUserId();
      if (!createdBy) throw new Error("Business user not resolved");
      const now = new Date().toISOString();
      
      const organizationId = ctx.organizationId || activeCompany?.id || null;

      console.info("[useWhatsApp.registerInTimeline] Start", {
        module: ctx.module,
        entityId: ctx.entityId,
        organizationId,
        leadId: ctx.leadId,
        createdBy,
      });

      if (ctx.entityId && organizationId) {
        const { error } = await supabase.from("entity_interactions").insert({
          entity_id: ctx.entityId,
          organization_id: organizationId,
          interaction_type: "whatsapp",
          subject: `WhatsApp para ${ctx.recipientName}`,
          notes: messagePreview,
          interaction_at: now,
          created_by: createdBy,
        });

        if (error) {
          console.error("[useWhatsApp.registerInTimeline] entity_interactions insert failed", error);
          throw error;
        }
        console.info("[useWhatsApp.registerInTimeline] entity_interactions insert ok");
      } else {
        console.warn("[useWhatsApp.registerInTimeline] Missing entityId or organizationId", {
          entityId: ctx.entityId,
          organizationId,
        });
      }

      // Document send tracking (channel = whatsapp). Failure must NOT mark send as failed.
      if (ctx.module === "contracts" && ctx.contractId) {
        try {
          await (supabase as any).from("contract_sends").insert({
            contract_id: ctx.contractId,
            organization_id: organizationId,
            sent_by: createdBy,
            recipient_email: null,
            recipient_name: ctx.recipientName || null,
            subject: `WhatsApp${ctx.contractNumber ? `: ${ctx.contractNumber}` : ""}`,
            message: messagePreview,
            channel: "whatsapp",
            status: "sent",
            sent_at: now,
          });
        } catch (e) {
          console.error("[contract-sends whatsapp] tracking failed", e);
        }
      }
      if (ctx.module === "proposals" && ctx.proposalId) {
        try {
          await (supabase as any).from("proposal_sends").insert({
            proposal_id: ctx.proposalId,
            organization_id: organizationId,
            sent_by: createdBy,
            recipient_email: "",
            recipient_name: ctx.recipientName || null,
            subject: `WhatsApp${ctx.proposalTitle ? `: ${ctx.proposalTitle}` : ""}`,
            message: messagePreview,
            channel: "whatsapp",
            status: "sent",
            sent_at: now,
          });
        } catch (e) {
          console.error("[proposal-sends whatsapp] tracking failed", e);
        }
      }
      if (ctx.module === "quotes" && ctx.quoteId) {
        try {
          await (supabase as any).from("quote_sends").insert({
            quote_id: ctx.quoteId,
            organization_id: organizationId,
            sent_by: createdBy,
            recipient_email: "",
            recipient_name: ctx.recipientName || null,
            subject: `WhatsApp${ctx.quoteTitle ? `: ${ctx.quoteTitle}` : ""}`,
            message: messagePreview,
            status: "sent",
            sent_at: now,
          });
        } catch (e) {
          console.error("[quote-sends whatsapp] tracking failed", e);
        }
      }
      if (ctx.module === "leads" && ctx.leadId) {
        const { data: currentLead } = await supabase
          .from("anew_leads")
          .select("contact_attempts")
          .eq("id", ctx.leadId)
          .maybeSingle();

        await supabase
          .from("anew_leads")
          .update({
            last_contact_at: now,
            last_contact_by: createdBy,
            last_contact_result: "whatsapp_sent",
            contact_attempts: ((currentLead?.contact_attempts as number) || 0) + 1,
          })
          .eq("id", ctx.leadId);
      }

      toast({ title: "Registado na timeline" });
      if (ctx.entityId) {
        window.dispatchEvent(new CustomEvent("entity-interaction-created", {
          detail: { entityId: ctx.entityId }
        }));
      }
      return true;
    } catch (err) {
      console.error("Failed to register WhatsApp in timeline:", err);
      toast({ title: "Erro", description: "Não foi possível registar na timeline.", variant: "destructive" });
      return false;
    }
  }, [activeCompany, toast]);

  return { sendWhatsApp, openWhatsApp, registerInTimeline, formatWhatsAppPhone, buildWhatsAppMessage: buildWhatsAppMessage };
}
