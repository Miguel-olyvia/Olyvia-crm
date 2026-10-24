// Os dados de apoio do diálogo «Nova lead» (comerciais, formulários, campanhas, origens e os campos da campanha escolhida). Cópia das
// consultas de AnewLeads.tsx (a página de Leads não se altera); as chaves levam sempre a organização e só se lê com o diálogo aberto.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { filtrarComerciaisPorAmbito } from "./ambitoComerciais";
import { lerComerciais, type ComercialLido, type NoArvoreOrg } from "./comerciaisNovaLead";
import type { DefinicaoCampo } from "./fluxoNovaLead";
import { lerCamposDaCampanha, lerCampanhas, lerFormularios, lerOrigens, type CampanhaLida, type FormularioLido, type OrigemLida } from "./leituraNovaLead";

const CINCO_MINUTOS = 5 * 60 * 1000;
const K = "pessoas-nova-lead";
// Uma repetição basta: sem isto o react-query tenta 3 vezes com espera crescente (cerca de 7 s) antes de o diálogo poder dizer que falhou.
const REPETICOES = 1;

export const chavesNovaLead = {
  campanhas: (org: string | null) => [K, "campanhas", org] as const,
  origens: (org: string | null) => [K, "origens", org] as const,
  formularios: (org: string | null) => [K, "formularios", org] as const,
  comerciais: (org: string | null) => [K, "comerciais", org] as const,
  campos: (org: string | null, campanha: string | null) => [K, "campos", org, campanha] as const,
};

export interface DadosNovaLead {
  campanhas: CampanhaLida[];
  origens: OrigemLida[];
  formularios: FormularioLido[];
  /** Os comerciais a quem quem cria pode atribuir (pelo âmbito `leads.view`). */
  comerciais: ComercialLido[];
  arvore: NoArvoreOrg[];
  camposCampanha: DefinicaoCampo[];
  formularioId: string;
  /** Há campanha escolhida e os campos dela ainda não chegaram: não se pode criar a lead (sairia sem os campos obrigatórios). */
  camposACarregar: boolean;
  /** Há campanha escolhida e os campos dela não se leram: não se pode criar a lead. */
  camposErro: boolean;
  /** Falhou a leitura das campanhas, das origens ou dos comerciais (as listas aparecem vazias, mas não é porque não haja nada). */
  erroApoio: boolean;
  /** Repete as leituras que falharam. */
  repetir: () => void;
}

export function useDadosNovaLead(organizationId: string | null, campanhaId: string | null, aberto: boolean): DadosNovaLead {
  const ativo = aberto && Boolean(organizationId);
  const scope = usePermissionScope();
  const org = organizationId ?? "";
  const campanhas = useQuery({ queryKey: chavesNovaLead.campanhas(organizationId), queryFn: () => lerCampanhas(org), enabled: ativo, staleTime: CINCO_MINUTOS, retry: REPETICOES });
  const origens = useQuery({ queryKey: chavesNovaLead.origens(organizationId), queryFn: () => lerOrigens(org), enabled: ativo, staleTime: CINCO_MINUTOS, retry: REPETICOES });
  const formularios = useQuery({ queryKey: chavesNovaLead.formularios(organizationId), queryFn: () => lerFormularios(org), enabled: ativo, staleTime: CINCO_MINUTOS, retry: REPETICOES });
  const comerciais = useQuery({ queryKey: chavesNovaLead.comerciais(organizationId), queryFn: () => lerComerciais(org), enabled: ativo, staleTime: CINCO_MINUTOS, retry: REPETICOES });
  const campos = useQuery({
    queryKey: chavesNovaLead.campos(organizationId, campanhaId),
    queryFn: () => lerCamposDaCampanha(campanhaId),
    enabled: ativo && campanhaId !== null,
    staleTime: CINCO_MINUTOS,
    retry: REPETICOES,
  });

  const { getPermissionScope, anewUserId, teamMemberIds } = scope;
  const atribuiveis = useMemo(
    () => filtrarComerciaisPorAmbito(comerciais.data?.users ?? [], getPermissionScope("leads.view"), anewUserId, teamMemberIds),
    [comerciais.data, getPermissionScope, anewUserId, teamMemberIds],
  );

  const comCampanha = ativo && campanhaId !== null;
  // Repete só o que falhou.
  const repetir = () => {
    if (campanhas.isError) void campanhas.refetch();
    if (origens.isError) void origens.refetch();
    if (comerciais.isError) void comerciais.refetch();
    if (campos.isError) void campos.refetch();
  };

  return {
    camposACarregar: comCampanha && campos.isLoading,
    camposErro: comCampanha && campos.isError,
    erroApoio: ativo && (campanhas.isError || origens.isError || comerciais.isError),
    repetir,
    campanhas: campanhas.data ?? [],
    origens: origens.data ?? [],
    formularios: formularios.data ?? [],
    comerciais: atribuiveis,
    arvore: comerciais.data?.tree ?? [],
    // Sem campanha escolhida não há campos extra, mesmo que a leitura anterior ainda esteja em cache.
    camposCampanha: campanhaId !== null ? (campos.data?.campos ?? []) : [],
    formularioId: campanhaId !== null ? (campos.data?.formId ?? "") : "",
  };
}
