/**
 * As contas de CRM da organizacao activa que podem ser LIGADAS a uma ficha
 * nova de RH -- para o selector de "preencher a partir de uma conta".
 *
 * PORQUE NAO UMA VIEW OU RPC NOVA
 * --------------------------------
 * A politica `anew_users_select` ja deixa qualquer autenticado ver a propria
 * linha e as linhas de colegas com membership activa numa organizacao
 * visivel (20260615130000...sql:23742-23765). Uma funcao `SECURITY DEFINER`
 * aqui nao acrescentaria acesso nenhum -- so o alargaria, contornando a RLS
 * para devolver o mesmo conjunto sem a rede de seguranca. Por isso este hook
 * faz o mesmo caminho de tres consultas que `UsersNew.tsx` (576-724) ja
 * percorre, e nao um objecto novo na base.
 *
 * O FILTRO POR ORGANIZACAO ACTIVA NAO E DECORATIVO
 * --------------------------------------------------
 * `anew_users_select` alcança toda a hierarquia visivel de organizacoes, nao
 * so a activa. `anew_users` nem sequer tem `organization_id` proprio -- o
 * ambito vem so de `anew_memberships`. Por isso a lista nasce SEMPRE das
 * memberships da organizacao activa: sem isso apareceriam colegas de
 * organizacoes irmas que a RPC de ligar recusaria com
 * `conta_sem_membership_na_organizacao`.
 *
 * O CRITERIO DE "INTERNO" E O DO LOGIN, SEM EXCEPCAO
 * -----------------------------------------------------
 * `eInterno` (src/lib/auth/papelInterno.ts) e o mesmo predicado de
 * `useClientRole`: qualquer papel que nao seja `client` conta como interno,
 * incluindo o hibrido (tem `client` e outro papel). Nao ha aqui o caso "zero
 * papeis" de `useClientRole` -- como a lista nasce das memberships, nunca
 * existe um candidato com zero papeis.
 *
 * A EXCLUSAO DE QUEM JA ESTA LIGADO E UMA CORTESIA, NAO A GARANTIA
 * -------------------------------------------------------------------
 * A leitura de `pessoas_contas` esta sujeita as politicas de RH: quem nao ve
 * todas as fichas da organizacao pode nao ver todas as ligacoes activas, e
 * por isso ver na lista uma conta que ja esta ligada a outra ficha. A
 * garantia real e o indice unico parcial `idx_pessoas_contas_uma_activa_por_conta`
 * e a excepcao `conta_ja_ligada_a_outra_pessoa` de `rpc_hr_ligar_conta`.
 */
import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { eInterno } from "@/lib/auth/papelInterno";
import { captureFlowError } from "@/lib/observability/captureFlowError";

export interface ContaLigavel {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  position: string | null;
  location: string | null;
}

interface LinhaMembership {
  user_id: string;
  role_id: string;
}

interface LinhaPapel {
  id: string;
  code: string | null;
}

interface LinhaAnewUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  position: string | null;
  location: string | null;
  status: string;
}

export function useContasLigaveis() {
  const { activeCompany } = useCompany();
  const [contas, setContas] = useState<ContaLigavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [semPermissao, setSemPermissao] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompany?.id) {
      setContas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setSemPermissao(false);

    try {
      // 1. Membership activa NESTA organizacao -- o ambito, nunca a hierarquia
      // visivel que a RLS de `anew_users` alcancaria sozinha.
      const { data: memberships, error: erroMemberships } = await supabase
        .from("anew_memberships")
        .select("user_id, role_id")
        .eq("organization_id", activeCompany.id)
        .eq("status", "active");

      if (erroMemberships) {
        if (isPermissionError(erroMemberships)) {
          setSemPermissao(true);
          setContas([]);
          setLoading(false);
          return;
        }
        throw erroMemberships;
      }

      const linhasMembership = (memberships ?? []) as LinhaMembership[];
      if (linhasMembership.length === 0) {
        setContas([]);
        setLoading(false);
        return;
      }

      // 2. Papeis, para separar interno de portal puro pelo MESMO criterio do
      // login (eInterno) -- nunca uma whitelist propria.
      const roleIds = Array.from(new Set(linhasMembership.map((m) => m.role_id)));
      const { data: papeis, error: erroPapeis } = await supabase
        .from("anew_roles")
        .select("id, code")
        .in("id", roleIds);
      if (erroPapeis) throw erroPapeis;

      const codigoPorPapel = new Map<string, string | null>(
        ((papeis ?? []) as LinhaPapel[]).map((p) => [p.id, p.code]),
      );

      const papeisPorUtilizador = new Map<string, string[]>();
      for (const m of linhasMembership) {
        const codigo = codigoPorPapel.get(m.role_id) ?? null;
        if (!codigo) continue;
        const actuais = papeisPorUtilizador.get(m.user_id) ?? [];
        actuais.push(codigo);
        papeisPorUtilizador.set(m.user_id, actuais);
      }

      const userIdsInternos = Array.from(papeisPorUtilizador.entries())
        .filter(([, codigos]) => eInterno(codigos))
        .map(([userId]) => userId);

      if (userIdsInternos.length === 0) {
        setContas([]);
        setLoading(false);
        return;
      }

      // 3. anew_users, so activos e nao apagados.
      const { data: utilizadores, error: erroUtilizadores } = await supabase
        .from("anew_users")
        .select("id, name, email, phone, position, location, status")
        .in("id", userIdsInternos)
        .eq("status", "active")
        .is("deleted_at", null);
      if (erroUtilizadores) throw erroUtilizadores;

      // 4. Contas ja ligadas a alguma ficha ACTIVA nesta organizacao: excluidas
      // por cortesia (a garantia real vive no indice unico e na RPC).
      const { data: ligadas, error: erroLigadas } = await hrFrom("pessoas_contas")
        .select("anew_user_id")
        .eq("organization_id", activeCompany.id)
        .eq("estado", "activa");
      if (erroLigadas && !isPermissionError(erroLigadas)) throw erroLigadas;

      const jaLigados = new Set(
        ((ligadas ?? []) as Array<{ anew_user_id: string }>).map((l) => l.anew_user_id),
      );

      const disponiveis = ((utilizadores ?? []) as LinhaAnewUser[])
        .filter((u) => !jaLigados.has(u.id))
        .map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          position: u.position,
          location: u.location,
        }));

      setContas(disponiveis);
      setLoading(false);
    } catch (e) {
      captureFlowError(e, "hr-contas-ligaveis-load");
      setContas([]);
      setLoading(false);
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { contas, loading, semPermissao, refresh: load };
}
