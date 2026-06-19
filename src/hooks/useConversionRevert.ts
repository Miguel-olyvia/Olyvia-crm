import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Hook to handle reversion of lead→contact and contact→client conversions.
 * Uses transactional RPCs to avoid race conditions with sync triggers.
 */
export const useConversionRevert = () => {
  const { toast } = useToast();
  const { t } = useTranslation();

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

  const canRevertContactToLead = async (contactId: string): Promise<boolean> => {
    const { data } = await (supabase as any)
      .from("anew_contacts")
      .select("source_lead_id")
      .eq("id", contactId)
      .single();
    return !!data?.source_lead_id;
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
    canRevertContactToLead,
    canRevertClientToContact,
  };
};
