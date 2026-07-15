import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Hook to handle reversion of contact→client conversions.
 *
 * NOTE (Fase 1 — Contacto merged into Lead lifecycle): the "contacto" pipeline
 * stage no longer exists in anew_leads.status (see anew_leads.status enum:
 * new, contacted, no_answer, incomplete, visit_scheduled, qualified,
 * negotiating, converted, rejected). `revertLeadToContact` is kept only
 * because it is still referenced by the retired, unrouted src/pages/AnewContacts.tsx
 * (route removed in App.tsx). Do not wire it up to any new/active UI.
 * Uses transactional RPCs to avoid race conditions with sync triggers.
 */
export const useConversionRevert = () => {
  const { toast } = useToast();
  const { t } = useTranslation();

  /** @deprecated Legacy support for the retired AnewContacts.tsx page only. */
  const revertLeadToContact = async (contactId: string): Promise<boolean> => {
    try {
      const { error } = await (supabase as any).rpc("revert_lead_to_contact", { p_contact_id: contactId });
      if (error) throw error;
      toast({
        title: t('conversion.revert.leadToContactSuccess'),
        description: t('conversion.revert.leadToContactSuccessDesc'),
      });
      return true;
    } catch (error: any) {
      toast({ title: t('conversion.revert.error'), description: error.message, variant: "destructive" });
      return false;
    }
  };

  const revertContactToClient = async (clientId: string): Promise<boolean> => {
    try {
      const { error } = await (supabase as any).rpc("revert_contact_to_client", { p_client_id: clientId });
      if (error) throw error;
      toast({
        title: t('conversion.revert.contactToClientSuccess'),
        description: t('conversion.revert.contactToClientSuccessDesc'),
      });
      return true;
    } catch (error: any) {
      toast({ title: t('conversion.revert.error'), description: error.message, variant: "destructive" });
      return false;
    }
  };

  const canRevertClientToContact = async (clientId: string): Promise<boolean> => {
    const { data } = await (supabase as any)
      .from("anew_clients")
      .select("source_id, source_type")
      .eq("id", clientId)
      .single();
    return data?.source_type === 'contact' && !!data?.source_id;
  };

  return {
    revertLeadToContact,
    revertContactToClient,
    canRevertClientToContact,
  };
};
