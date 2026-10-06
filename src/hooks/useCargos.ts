/**
 * Catalogo de cargos da organizacao activa (`hr_cargos`, 20261202070000) --
 * copia estrutural de `useModelosDocumentosRH.ts` -- e os periodos do salario de
 * cada cargo (`hr_cargos_periodos`, fluxo 2).
 *
 * O SALARIO DO CARGO E O UNICO SALARIO -- OBRIGACAO LEGAL, NAO CONVENIENCIA
 * -----------------------------------------------------------------------
 * O salario base de toda a gente com cargo vem do cargo: um trigger em
 * `pessoas_retribuicoes` recusa qualquer versao que divirja do salario do cargo
 * NA DATA da versao. Mudar o salario de um cargo e `definirSalario` (RPC): fecha
 * o periodo em vigor, abre outro com data de efeito (hoje ou futura) e refaz as
 * versoes de retribuicao de quem tem o cargo. Nao se escreve por UPDATE:
 * `editar` envia so nome, horas e autor -- com `salario_base`/`periodicidade` a
 * base recusa (HRC01).
 *
 * `hr_cargos.salario_base`/`periodicidade` sao CACHE do periodo mais recente (pode
 * ser FUTURO) e `authenticated` NAO as pode ler: um `select` delas, ou `*`, falha
 * com permission denied. Aqui pedem-se so as colunas legiveis. O salario (de hoje
 * ou de qualquer data) le-se de `hr_cargos_periodos` (`salarioDoCargoEm`), que so
 * devolve linhas a quem tem `hr.pessoas.retribuicao.view`: sem essa permissao a
 * lista vem vazia, sem erro, e o ecra mostra o cargo sem valores.
 *
 * NUNCA SE APAGA UM CARGO
 * -------------------------
 * A RLS bloqueia DELETE por politica RESTRICTIVE (pessoas.cargo_id pode
 * apontar para ele). So `activo`, por UPDATE.
 */
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrFrom, hrRpc } from "@/lib/hr/hrDb";
import { useCompany } from "@/contexts/CompanyContext";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { periodoDoCargoEm, type HrCargoPeriodo } from "@/lib/hr/cargosPeriodos";
import {
  lerResultadoDefinirSalario,
  type ResultadoDefinirSalario,
} from "@/lib/hr/respostasRpc";
import type { Periodicidade } from "@/types/hr";

export type { ResultadoDefinirSalario };

export interface HrCargo {
  id: string;
  organization_id: string;
  nome: string;
  horas_referencia: number | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

// Nunca `*` nem salario_base/periodicidade: ver o cabecalho.
const COLUNAS =
  "id, organization_id, nome, horas_referencia, activo, deleted_at, deleted_by, created_at, updated_at, created_by, updated_by";

const COLUNAS_PERIODOS =
  "id, cargo_id, salario_base, periodicidade, valido_de, valido_ate, motivo";

/** O PostgREST devolve no maximo 1000 linhas por pedido, em silencio. */
const PAGINA_PERIODOS = 1000;

export interface NovoCargoRH {
  nome: string;
  salario_base: number;
  periodicidade: Periodicidade;
  horas_referencia: number | null;
}

/** Editar um cargo muda so o nome e as horas: o salario muda por `definirSalario`. */
export interface EdicaoCargoRH {
  id: string;
  nome: string;
  horas_referencia: number | null;
}

export function useCargos() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const orgId = activeCompany?.id;
  const queryKey = ["hr-cargos", orgId];
  const queryKeyPeriodos = ["hr-cargos-periodos", orgId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async (): Promise<HrCargo[]> => {
      if (!orgId) return [];
      const { data: linhas, error: erro } = await hrFrom("hr_cargos")
        .select(COLUNAS)
        .eq("organization_id", orgId)
        .order("nome", { ascending: true });
      if (erro) throw erro;
      return (linhas ?? []) as HrCargo[];
    },
    enabled: !!orgId,
  });

  const {
    data: periodosData,
    isLoading: periodosLoading,
    isError: periodosError,
  } = useQuery({
    queryKey: queryKeyPeriodos,
    queryFn: async (): Promise<HrCargoPeriodo[]> => {
      if (!orgId) return [];
      // PAGINADO: uma organizacao com muitos cargos e muitas subidas passa as
      // 1000 linhas, e as cortadas fariam um cargo aparecer "sem salario" (ou
      // com o salario de um periodo antigo) sem erro nenhum. Ordem total
      // (`valido_de`, `id`) para as paginas nao repetirem nem saltarem linhas.
      const todos: HrCargoPeriodo[] = [];
      for (let inicio = 0; ; inicio += PAGINA_PERIODOS) {
        const { data: pagina, error: erro } = await hrFrom("hr_cargos_periodos")
          .select(COLUNAS_PERIODOS)
          .eq("organization_id", orgId)
          .order("valido_de", { ascending: false })
          .order("id", { ascending: true })
          .range(inicio, inicio + PAGINA_PERIODOS - 1);
        // Uma falha a meio invalida tudo: periodos a menos dariam salarios errados.
        if (erro) throw erro;
        const linhas = (pagina ?? []) as HrCargoPeriodo[];
        todos.push(...linhas);
        if (linhas.length < PAGINA_PERIODOS) break;
      }
      return todos;
    },
    enabled: !!orgId,
  });
  const periodos = periodosData ?? [];

  const salarioDoCargoEm = useCallback(
    (cargoId: string, data: string): HrCargoPeriodo | null => periodoDoCargoEm(periodos, cargoId, data),
    // `periodosData` e estavel entre renders enquanto nao muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodosData],
  );

  const invalidar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, orgId]);

  /** Uma subida de salario mexe nos cargos, nos periodos e no relatorio de divergencias. */
  const invalidarSalario = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: queryKeyPeriodos });
    queryClient.invalidateQueries({ queryKey: ["hr-cargos-retribuicoes-divergentes", orgId] });
  }, [queryClient, orgId]);

  const criarMutation = useMutation({
    mutationFn: async (novo: NovoCargoRH) => {
      if (!orgId) throw new Error("Sem organizacao activa");
      const businessUserId = await resolveCurrentBusinessUserId();
      const { error: erro } = await hrFrom("hr_cargos").insert({
        organization_id: orgId,
        nome: novo.nome,
        salario_base: novo.salario_base,
        periodicidade: novo.periodicidade,
        horas_referencia: novo.horas_referencia,
        created_by: businessUserId,
        updated_by: businessUserId,
      });
      if (erro) throw erro;
    },
    // O trigger de criacao abre o primeiro periodo: os periodos mudam tambem.
    onSuccess: invalidarSalario,
  });

  const editarMutation = useMutation({
    mutationFn: async (edicao: EdicaoCargoRH) => {
      const businessUserId = await resolveCurrentBusinessUserId();
      const { error: erro } = await hrFrom("hr_cargos")
        .update({
          nome: edicao.nome,
          horas_referencia: edicao.horas_referencia,
          updated_by: businessUserId,
        })
        .eq("id", edicao.id);
      if (erro) throw erro;
    },
    onSuccess: invalidar,
  });

  const alternarActivoMutation = useMutation({
    mutationFn: async (args: { id: string; activo: boolean }) => {
      const businessUserId = await resolveCurrentBusinessUserId();
      const { error: erro } = await hrFrom("hr_cargos")
        .update({ activo: args.activo, updated_by: businessUserId })
        .eq("id", args.id);
      if (erro) throw erro;
    },
    onSuccess: invalidar,
  });

  const definirSalarioMutation = useMutation({
    mutationFn: async (args: {
      cargoId: string;
      salarioBase: number;
      periodicidade: Periodicidade;
      validoDe: string;
      motivo: string;
    }): Promise<ResultadoDefinirSalario> => {
      const { data: resultado, error: erro } = await hrRpc("rpc_hr_cargo_definir_salario", {
        p_cargo_id: args.cargoId,
        p_salario_base: args.salarioBase,
        p_periodicidade: args.periodicidade,
        p_valido_de: args.validoDe,
        p_motivo: args.motivo,
      });
      if (erro) throw erro;
      // `data` nulo (ou sem as chaves) com `error` nulo nao e um sucesso.
      const lido = lerResultadoDefinirSalario(resultado);
      if (!lido) {
        throw new Error("rpc_hr_cargo_definir_salario devolveu uma resposta sem o resultado esperado");
      }
      return lido;
    },
    onSuccess: invalidarSalario,
  });

  return {
    cargos: data ?? [],
    periodos,
    /** Os periodos ainda a carregar pela primeira vez. */
    periodosLoading,
    /** A leitura dos periodos falhou: `periodos` esta vazio por erro, nao por nao haver. */
    periodosError,
    salarioDoCargoEm,
    isLoading,
    error,
    isSaving:
      criarMutation.isPending ||
      editarMutation.isPending ||
      alternarActivoMutation.isPending ||
      definirSalarioMutation.isPending,
    criar: criarMutation.mutateAsync,
    editar: editarMutation.mutateAsync,
    /** Nunca `eliminar` -- so activar/desactivar. Ver nota no cabecalho. */
    definirActivo: (id: string, activo: boolean) => alternarActivoMutation.mutateAsync({ id, activo }),
    /** Muda o salario do cargo a partir de `validoDe` (hoje ou futuro). Lanca o erro da base para o ecra o traduzir. */
    definirSalario: (
      cargoId: string,
      salarioBase: number,
      periodicidade: Periodicidade,
      validoDe: string,
      motivo: string,
    ) =>
      definirSalarioMutation.mutateAsync({ cargoId, salarioBase, periodicidade, validoDe, motivo }),
  };
}
