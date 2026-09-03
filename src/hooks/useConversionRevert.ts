import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { leadStatusLabel } from "@/lib/leads/statusLabels";

/**
 * Desfazer a conversão de uma lead em cliente.
 *
 * O caminho anterior — `revert_contact_to_client` / `revert_lead_to_contact` —
 * foi retirado: era do módulo de Contactos, que já não existe, e a condição que
 * mostrava o botão (`source_type === 'contact'`) nunca era verdadeira nas leads
 * convertidas, por isso quem convertia por engano não tinha forma de voltar atrás.
 */

/** O que se sabe da conversão antes de a desfazer, para o ecrã poder ser honesto. */
export interface ClientRevertPreview {
  /** Só há o que desfazer quando existe uma lead viva a apontar para este cliente. */
  canRevert: boolean;
  /** Estado guardado pelo gatilho. Nulo nas conversões anteriores a ele existir. */
  previousStatus: string | null;
}

/** O que a RPC devolve. Nomes em português porque são os da própria função SQL. */
interface RevertOutcome {
  status?: string;
  estado_anterior_conhecido?: boolean;
}

// O que a reversão NÃO leva com ela. É a parte que interessa a quem hesita em
// carregar no botão, e repete-se no aviso e na confirmação de propósito.
const O_QUE_FICA =
  "Os orçamentos, propostas, contratos e acessos ao portal continuam ligados à pessoa e não se perdem.";

/**
 * O texto do diálogo de confirmação, partilhado pela listagem e pela ficha para
 * as duas não poderem prometer coisas diferentes.
 *
 * Diz o que acontece MESMO: a ficha de cliente desaparece, mas os documentos não,
 * porque estão presos à entidade e não ao papel de cliente. E quando o estado
 * anterior não ficou registado, admite-o em vez de fingir que se sabe.
 */
export const revertToLeadConfirmationText = (previousStatus: string | null): string => {
  const destino = previousStatus
    ? `volta ao funil de leads no estado em que estava antes da conversão: ${leadStatusLabel(previousStatus)}.`
    : "volta ao funil de leads em Negociação, porque o estado que tinha antes da conversão não ficou registado.";

  return `A ficha de cliente é apagada e a pessoa ${destino} ${O_QUE_FICA}`;
};

/**
 * A mensagem de sucesso, construída do que a RPC devolveu — e em português,
 * como todo o resto deste fluxo (botão, diálogo, confirmação). Passar por
 * traduções deixava um aviso inglês a seguir a um diálogo português.
 */
export const revertToLeadSuccessText = (status: string, previousStatusWasKnown: boolean): string => {
  const estado = leadStatusLabel(status);
  const destino = previousStatusWasKnown
    ? `voltou ao funil de leads em ${estado}.`
    : `voltou ao funil de leads. O estado anterior não ficou registado, por isso ficou em ${estado}.`;

  return `A ficha de cliente foi apagada e a pessoa ${destino} ${O_QUE_FICA}`;
};

export const useConversionRevert = () => {
  const { toast } = useToast();
  const { t } = useTranslation();

  // Identidades estáveis: a listagem chama-as de dentro de callbacks com lista de
  // dependências, e uma função nova a cada render reabria o ciclo de recarregamento.
  const revertClientToLead = useCallback(async (clientId: string): Promise<boolean> => {
    try {
      const { data, error } = await (supabase as any).rpc("rpc_revert_client_to_lead", { p_client_id: clientId });
      if (error) throw error;

      // O estado vem da RPC e não do que o ecrã achava: é o que ficou mesmo
      // gravado na lead, incluindo o caso em que teve de ser assumido.
      const outcome = (data ?? {}) as RevertOutcome;
      toast({
        title: "Conversão revertida",
        description: revertToLeadSuccessText(
          outcome.status ?? "negotiation",
          outcome.estado_anterior_conhecido === true,
        ),
      });
      return true;
    } catch (error: any) {
      captureFlowError(error, "entity-conversion");
      toast({ title: t('conversion.revert.error'), description: error.message, variant: "destructive" });
      return false;
    }
  }, [toast, t]);

  /**
   * Mesma pergunta que a RPC volta a fazer do lado do servidor — aqui serve só
   * para decidir se o botão aparece e o que o diálogo promete.
   */
  const getClientRevertPreview = useCallback(async (clientId: string): Promise<ClientRevertPreview> => {
    const { data } = await (supabase as any)
      .from("anew_leads")
      .select("id, status_before_conversion")
      .eq("converted_to_client_id", clientId)
      .is("deleted_at", null)
      .order("converted_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    return { canRevert: !!data?.id, previousStatus: data?.status_before_conversion ?? null };
  }, []);

  /**
   * A mesma pergunta para uma página inteira de clientes, numa query só: o botão
   * decide-se linha a linha na listagem e perguntar por linha seria um N+1.
   */
  const getRevertableClientIds = useCallback(async (clientIds: string[]): Promise<Set<string>> => {
    if (clientIds.length === 0) return new Set<string>();

    const { data } = await (supabase as any)
      .from("anew_leads")
      .select("converted_to_client_id")
      .in("converted_to_client_id", clientIds)
      .is("deleted_at", null);

    const rows = (data ?? []) as { converted_to_client_id: string | null }[];
    return new Set(rows.map(r => r.converted_to_client_id).filter((id): id is string => !!id));
  }, []);

  return {
    revertClientToLead,
    getClientRevertPreview,
    getRevertableClientIds,
  };
};
