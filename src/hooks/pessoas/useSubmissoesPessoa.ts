import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import type { SubmissaoFicha } from "./adaptarSubmissoes";
import { lerSubmissoesPessoa } from "./lerSubmissoesPessoa";
import { useFontePessoas } from "./useFontePessoas";

const STALE_TIME_MS = 15_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEM_SUBMISSOES: SubmissaoFicha[] = [];

/** Sem `pessoaId` devolve o prefixo (a organização), para invalidar as submissões de todas as pessoas dela. */
export function submissoesPessoaQueryKey(organizationId: string | null | undefined, pessoaId?: string | null) {
  const base = ["neg-ficha-submissoes", organizationId ?? null] as const;
  return pessoaId ? ([...base, pessoaId] as const) : base;
}

export interface SubmissoesLidas {
  submissoes: SubmissaoFicha[];
  /** Quantas são submissões ainda por rever (as leads e as já revistas não contam): é o que o aviso «Voltou a contactar» oferece ver. */
  pendentes: number;
  /** `inativo`: modo exemplo, sem organização ou sem uma pessoa válida (nada se lê). */
  estado: "inativo" | "a-carregar" | "ok" | "erro";
  /** Há uma lista lida mas a última releitura falhou: a lista mostra-se (pode estar desatualizada) com um aviso discreto. */
  desatualizado: boolean;
  recarregar: () => void;
}

/**
 * As submissões de formulário da pessoa aberta, lidas como a página de Leads as lê (ver `lerSubmissoesPessoa`). Só em modo real, com
 * organização e uma pessoa com forma de uuid. Sem `placeholderData`: ao trocar de pessoa não se mostra a anterior.
 */
export function useSubmissoesPessoa(pessoaId: string | null): SubmissoesLidas {
  const fonte = useFontePessoas();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const ativo = organizationId !== null && pessoaId !== null && UUID.test(pessoaId);
  const consulta = useQuery({
    queryKey: submissoesPessoaQueryKey(organizationId, pessoaId),
    queryFn: async () => {
      try {
        return await lerSubmissoesPessoa(organizationId as string, pessoaId as string);
      } catch (erro) {
        captureFlowError(erro, "pessoas-neg");
        throw erro;
      }
    },
    enabled: ativo,
    staleTime: STALE_TIME_MS,
    retry: 1,
  });
  const submissoes = consulta.data ?? SEM_SUBMISSOES;
  const pendentes = useMemo(() => submissoes.filter((s) => s.tipo === "submissao" && s.revisao === "pending").length, [submissoes]);
  const { refetch } = consulta;
  const recarregar = useCallback(() => { void refetch(); }, [refetch]);
  // Uma falha numa releitura em segundo plano não troca a lista boa pelo ecrã de erro: o erro só manda quando não há dados.
  const temDados = consulta.data !== undefined;
  const estado = !ativo ? "inativo" : temDados ? "ok" : consulta.isError ? "erro" : "a-carregar";
  const desatualizado = ativo && temDados && consulta.isError;
  return { submissoes, pendentes, estado, desatualizado, recarregar };
}
