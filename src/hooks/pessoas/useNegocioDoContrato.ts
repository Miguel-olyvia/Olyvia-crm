// O negócio de um contrato, para a página de contratos (partilhada com a Mudelar) dizer o que o ecrã tem de dizer: o título onde o contrato nasce
// e se o contrato a anular era a origem de um ganho. Só lê, só da organização pedida (`organization_id`), e só quando `ativo` (fecho v4 ligado e
// um negócio na mão). Sem negócio, sem organização ou com a leitura a falhar devolve `null`: nada se diz e a base decide, como sempre.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lerNegocioDoContrato, type LeituraDoNegocio, type NegocioDoContrato } from "@/components/negocio-metas/contratoNoNegocio";

const COLUNAS = "id, titulo, fecho, estado, decisao_origem_tipo, decisao_origem_id";

export interface NegocioLido { negocio: NegocioDoContrato | null; leitura: LeituraDoNegocio }

export function useNegocioDoContrato(negocioId: string | null | undefined, organizationId: string | null | undefined, ativo: boolean): NegocioLido {
  const { data, isError, isPending } = useQuery({
    queryKey: ["negocio-do-contrato", organizationId, negocioId],
    queryFn: async (): Promise<NegocioDoContrato | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: linha, error } = await (supabase as any).from("negocios").select(COLUNAS).eq("id", negocioId).eq("organization_id", organizationId).maybeSingle();
      if (error) throw error;
      return lerNegocioDoContrato(linha);
    },
    enabled: ativo && !!negocioId && !!organizationId,
    staleTime: 15_000,
  });
  const emLeitura = ativo && !!negocioId && !!organizationId;
  const leitura: LeituraDoNegocio = !emLeitura ? "pronta" : isError ? "falhou" : isPending ? "pendente" : "pronta";
  return { negocio: data ?? null, leitura };
}
