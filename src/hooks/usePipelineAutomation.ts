import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function usePipelineAutomation() {
  const { toast } = useToast();

  const callPipelineAction = useCallback(async (action: string, payload: Record<string, any>) => {
    try {
      const { data, error } = await supabase.functions.invoke("pipeline-automation", {
        body: { action, payload },
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Erro na automação");

      toast({ title: data.message || "Sucesso" });
      return data;
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
      return null;
    }
  }, [toast]);

  const createDealFromLead = useCallback((payload: {
    lead_id: string;
    title?: string;
    organization_id: string;
    root_organization_id?: string;
    created_by?: string;
    entity_id?: string;
  }) => callPipelineAction("create_deal_from_lead", payload), [callPipelineAction]);

  const createQuoteFromDeal = useCallback((payload: {
    deal_id: string;
    organization_id: string;
    root_organization_id?: string;
    created_by?: string;
    title?: string;
  }) => callPipelineAction("create_quote_from_deal", payload), [callPipelineAction]);

  const createProposalFromQuote = useCallback((payload: {
    quote_id: string;
    deal_id?: string;
    organization_id: string;
    root_organization_id?: string;
    created_by?: string;
    title?: string;
  }) => callPipelineAction("create_proposal_from_quote", payload), [callPipelineAction]);

  const createProposalFromDeal = useCallback((payload: {
    deal_id: string;
    organization_id: string;
    root_organization_id?: string;
    created_by?: string;
    entity_id?: string;
    title?: string;
  }) => callPipelineAction("create_proposal_from_deal", payload), [callPipelineAction]);

  const createQuoteFromProposal = useCallback((payload: {
    proposal_id: string;
    organization_id: string;
    root_organization_id?: string;
    created_by?: string;
    deal_id?: string;
  }) => callPipelineAction("create_quote_from_proposal", payload), [callPipelineAction]);

  const createContractFromQuote = useCallback((payload: {
    quote_id: string;
    proposal_id?: string;
    organization_id: string;
    root_organization_id?: string;
    created_by?: string;
    client_id: string;
  }) => callPipelineAction("create_contract_from_quote", payload), [callPipelineAction]);

  const finalizeContract = useCallback((payload: {
    contract_id: string;
    user_id?: string;
  }) => callPipelineAction("finalize_contract", payload), [callPipelineAction]);

  const propagateRejection = useCallback((payload: {
    entity_type: "proposal" | "quote" | "contract";
    entity_id: string;
    reason?: string;
  }) => callPipelineAction("propagate_rejection", payload), [callPipelineAction]);

  return {
    createDealFromLead,
    createQuoteFromDeal,
    createProposalFromQuote,
    createProposalFromDeal,
    createQuoteFromProposal,
    createContractFromQuote,
    finalizeContract,
    propagateRejection,
  };
}
