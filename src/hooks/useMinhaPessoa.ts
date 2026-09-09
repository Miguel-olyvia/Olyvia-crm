/**
 * A ficha de RH ligada a conta de quem esta a usar a aplicacao.
 *
 * PORQUE E QUE ISTO NAO E OBVIO
 * -----------------------------
 * O utilizador autenticado nao e a pessoa: sao duas identidades diferentes,
 * ligadas por `pessoas_contas`. Ha contas sem ficha de RH nenhuma (um
 * administrador externo, um utilizador de outra organizacao) e ha fichas sem
 * conta. "As minhas ausencias" precisa de saber qual e a ficha, e quando nao
 * ha nenhuma isso NAO e um erro -- e um estado vazio proprio, que diz a quem
 * olha porque e que o ecra nao tem nada.
 *
 * A base tem `hr_pessoa_do_utilizador(auth.uid(), org)` e e ela que a RLS usa.
 * Aqui le-se a mesma ligacao pela tabela, porque a funcao nao esta exposta ao
 * PostgREST e a leitura de `pessoas_contas` ja e permitida a quem tem a ficha.
 */
import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";

export interface MinhaPessoa {
  pessoaId: string | null;
  nome: string | null;
  loading: boolean;
  /** Verdadeiro quando ja se procurou e nao ha ficha ligada a esta conta. */
  semFicha: boolean;
}

export function useMinhaPessoa(): MinhaPessoa {
  const { activeCompany } = useCompany();
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const orgId = activeCompany?.id;
    if (!orgId) {
      setPessoaId(null);
      setNome(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const anewUserId = await resolveCurrentBusinessUserId();
      if (!anewUserId) {
        setPessoaId(null);
        setNome(null);
        return;
      }
      const { data, error } = await hrFrom("pessoas_contas")
        .select("pessoa_id")
        .eq("organization_id", orgId)
        .eq("anew_user_id", anewUserId)
        .eq("estado", "activa")
        .limit(1)
        .maybeSingle();

      if (error) {
        // Sem permissao de leitura a resposta correcta e "nao ha ficha
        // visivel": o ecra mostra o vazio, e nao um incidente.
        if (!isPermissionError(error)) captureFlowError(error, "hr-ausencias-load");
        setPessoaId(null);
        setNome(null);
        return;
      }

      const id = (data as { pessoa_id?: string } | null)?.pessoa_id ?? null;
      setPessoaId(id);

      if (id) {
        const { data: ficha } = await hrFrom("pessoas")
          .select("nome_completo")
          .eq("id", id)
          .maybeSingle();
        setNome((ficha as { nome_completo?: string } | null)?.nome_completo ?? null);
      } else {
        setNome(null);
      }
    } catch (e) {
      captureFlowError(e, "hr-ausencias-load");
      setPessoaId(null);
      setNome(null);
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { pessoaId, nome, loading, semFicha: !loading && pessoaId === null };
}
