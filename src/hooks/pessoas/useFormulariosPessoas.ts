import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { useFontePessoas } from "./useFontePessoas";

const STALE_TIME_MS = 5 * 60_000;

export interface FormularioDaLista {
  id: string;
  nome: string;
}

async function lerFormularios(organizationId: string): Promise<FormularioDaLista[]> {
  let erro: unknown = null;
  let linhas: { id: string; name: string | null }[] = [];
  try {
    const resposta = await supabase.from("forms").select("id, name").eq("organization_id", organizationId).order("name", { ascending: true });
    erro = resposta.error ?? null;
    linhas = (resposta.data ?? []) as { id: string; name: string | null }[];
  } catch (excecao) {
    erro = excecao;
  }
  if (erro) {
    captureFlowError(erro, "pessoas-neg");
    throw erro;
  }
  return linhas.flatMap((l) => (l.name && l.name.trim() !== "" ? [{ id: l.id, nome: l.name.trim() }] : []));
}

/**
 * Os formulários da organização ativa (sob RLS), para o filtro «Formulário» (a base filtra pelo `forms.id` da campanha da lead).
 * Só lê com `ativo` (o painel de filtros aberto) e em modo real. Um erro não bloqueia nada: o painel diz que não carregou.
 */
export interface FormulariosPessoas {
  formularios: readonly FormularioDaLista[];
  aCarregar: boolean;
  erro: boolean;
  /** Volta a ler os formulários (o botão «Tentar de novo» do aviso de erro). Estável entre renders. */
  repetir: () => void;
}

export function useFormulariosPessoas(ativo: boolean = true): FormulariosPessoas {
  const fonte = useFontePessoas();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const consulta = useQuery({
    queryKey: ["pessoas-formularios", organizationId] as const,
    queryFn: () => lerFormularios(organizationId as string),
    enabled: ativo && !!organizationId,
    staleTime: STALE_TIME_MS,
    retry: 1,
  });
  const formularios = useMemo(() => consulta.data ?? [], [consulta.data]);
  const { refetch } = consulta;
  const repetir = useCallback(() => { void refetch(); }, [refetch]);
  return { formularios, aCarregar: consulta.isLoading, erro: consulta.isError, repetir };
}
