/**
 * As filiais que se PODEM escolher para um centro de trabalho: a propria
 * organizacao activa e todas as descendentes em `anew_hierarchy` -- nunca as
 * ascendentes.
 *
 * PORQUE E ESTA A ARVORE CERTA
 * -----------------------------
 * `hr_locais_trabalho.organograma_node_id` (20261130080000) e guardado por um
 * trigger, `hr_no_pertence_a_arvore_da_org`, que recusa qualquer no fora da
 * arvore de `organization_id` -- a propria organizacao e os seus
 * descendentes, nunca os ascendentes. `useDescendantOrgIds` resolve
 * exactamente essa mesma arvore (a mesma funcao de base,
 * `get_org_subtree_ids`), por isso o ecra so oferece, de raiz, opcoes que a
 * base aceitaria -- o erro do trigger passa a ser so uma rede de seguranca,
 * nunca o caminho normal.
 */
import { useEffect, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { useDescendantOrgIds } from "@/hooks/useDescendantOrgIds";
import { supabase } from "@/integrations/supabase/client";

export interface FilialOpcao {
  id: string;
  name: string;
}

export function useFiliaisDaArvore(): { filiais: FilialOpcao[]; loading: boolean } {
  const { activeCompany } = useCompany();
  const { orgIds, loading: orgIdsLoading } = useDescendantOrgIds();
  const [filiais, setFiliais] = useState<FilialOpcao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCompany?.id) {
      setFiliais([]);
      setLoading(false);
      return;
    }
    if (orgIdsLoading) {
      setLoading(true);
      return;
    }
    if (orgIds.length === 0) {
      setFiliais([]);
      setLoading(false);
      return;
    }

    let cancelado = false;
    setLoading(true);

    void (async () => {
      const { data, error } = await supabase
        .from("anew_organizations")
        .select("id, name")
        .in("id", orgIds)
        .order("name", { ascending: true });

      if (cancelado) return;
      if (error) {
        // Falha aqui degrada para "so a propria organizacao", nunca para uma
        // lista vazia que parecesse "sem filiais" quando pode ser so uma
        // falha de rede -- mas tambem nunca inventa nomes.
        console.error("[useFiliaisDaArvore] falha a carregar filiais:", error);
        setFiliais([]);
        setLoading(false);
        return;
      }
      setFiliais((data ?? []) as FilialOpcao[]);
      setLoading(false);
    })();

    return () => {
      cancelado = true;
    };
  }, [activeCompany?.id, orgIds, orgIdsLoading]);

  return { filiais, loading };
}
