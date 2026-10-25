// O que o diálogo de criar o contrato (no guia do negócio) precisa de ler: a proposta aceite (nome, cliente e total) e as minutas ativas da organização.
// São as mesmas leituras que a página de contratos faz, mas a proposta lê-se por id e na organização (a lista da página só traz propostas em alguns
// estados). A base só entra por aqui: os componentes das pessoas não falam com ela.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PropostaDoContrato {
  id: string;
  title: string | null;
  /** O nome do cliente (a entidade da proposta); `null` se a proposta não tem entidade. */
  _clientName: string | null;
  quotes: Array<{ total: number | null }>;
}

export interface MinutaAtiva {
  id: string;
  name: string;
  body_html: string | null;
}

/** A proposta aceite como o diálogo de contratos a quer; `null` se já não existe na organização. */
export function usePropostaParaContrato(propostaId: string, organizationId: string) {
  return useQuery({
    queryKey: ["guia-proposta-do-contrato", organizationId, propostaId],
    queryFn: async (): Promise<PropostaDoContrato | null> => {
      const { data, error } = await supabase.from("proposals").select("id, title, entity_id, quotes(total)").eq("id", propostaId).eq("organization_id", organizationId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const linha = data as unknown as { id: string; title: string | null; entity_id: string | null; quotes: Array<{ total: number | null }> | null };
      let cliente: string | null = null;
      if (linha.entity_id) {
        const { data: entidade, error: erroEntidade } = await supabase.from("anew_entities").select("display_name").eq("id", linha.entity_id).maybeSingle();
        // Um nome por ler não é «sem cliente»: o erro chega ao ecrã em vez de um formulário com o cliente em branco.
        if (erroEntidade) throw erroEntidade;
        cliente = (entidade as { display_name?: string | null } | null)?.display_name ?? null;
      }
      return { id: linha.id, title: linha.title, _clientName: cliente, quotes: linha.quotes ?? [] };
    },
  });
}

/** As minutas ativas da organização, por nome. */
export function useMinutasAtivas(organizationId: string) {
  return useQuery({
    queryKey: ["guia-minutas-ativas", organizationId],
    queryFn: async (): Promise<MinutaAtiva[]> => {
      const { data, error } = await supabase.from("client_contract_templates").select("id, name, body_html").eq("organization_id", organizationId).eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as unknown as MinutaAtiva[];
    },
  });
}
