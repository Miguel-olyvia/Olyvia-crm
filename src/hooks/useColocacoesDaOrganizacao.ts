/**
 * A colocacao em vigor de TODAS as pessoas da organizacao activa no organograma
 * (`pessoas_colocacao_organograma`), mais as tres gravacoes da pagina Organizacao:
 * ligar, alterar e desligar uma pessoa.
 *
 * E a versao "da organizacao inteira" de `usePessoaColocacaoOrganograma` (que e de UMA pessoa):
 * escreve na mesma tabela e com as mesmas regras -- ALTERAR fecha a linha em vigor na vespera e
 * cria a nova; a permissao exigida (`.edit` ou `.corrigir`) decide-a a politica de RLS pelo
 * `valido_ate` da linha, nao este hook.
 *
 * NAO escreve o centro de trabalho (`pessoas.local_id`): esse muda-se na ficha da pessoa.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { dataDeHojeISO } from "@/lib/hr/afectacoes";
import { planearGravacao, validoAteDeDesligar, vigentesPorPessoa } from "@/lib/hr/colocacoesOrganizacao";
import type { PessoaColocacaoOrganograma } from "@/types/hr";

const COLUNAS =
  "id, pessoa_id, organization_id, organograma_node_id, valido_de, valido_ate, motivo, created_at, updated_at";

export type ResultadoColocacaoOrg =
  | { tipo: "ok"; operacao: "ligar" | "alterar" | "desligar" }
  | { tipo: "erro"; mensagem: string | null; codigo: "inicioNaoPosterior" | "naoLigada" | "base" };

export interface GuardarColocacaoArgs {
  pessoaId: string;
  nodeId: string;
  /** AAAA-MM-DD */
  desde: string;
  motivo: string | null;
}

/** A base nao devolveu a linha escrita (a RLS filtrou o UPDATE sem erro): nao se grava, e diz-se. */
export const MENSAGEM_NAO_GRAVADA = "A alteracao nao foi aceite pela base (sem permissao, ou a ligacao ja mudou). Nada foi gravado.";

class LinhaNaoGravadaError extends Error {
  constructor() {
    super(MENSAGEM_NAO_GRAVADA);
  }
}

export function useColocacoesDaOrganizacao() {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id;
  const [linhas, setLinhas] = useState<PessoaColocacaoOrganograma[]>([]);
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);
  const [erro, setErro] = useState(false);
  // A organizacao activa neste momento: uma resposta de outra organizacao ignora-se.
  const orgAtivaRef = useRef(organizationId);
  orgAtivaRef.current = organizationId;
  const orgCarregadaRef = useRef<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) {
      orgCarregadaRef.current = undefined;
      setLinhas([]);
      setErro(false);
      setLoading(false);
      return;
    }
    // Outra organizacao: as linhas da anterior nao servem de base enquanto a nova nao chega.
    if (orgCarregadaRef.current !== organizationId) setLinhas([]);
    setLoading(true);
    const hoje = dataDeHojeISO();
    const { data, error } = await hrFrom("pessoas_colocacao_organograma")
      .select(COLUNAS)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .lte("valido_de", hoje)
      .or(`valido_ate.is.null,valido_ate.gte.${hoje}`);
    if (orgAtivaRef.current !== organizationId) return;
    if (error) {
      if (isPermissionError(error)) {
        setRecusado(true);
        setErro(false);
        setLinhas([]);
      } else {
        // Falha transitoria: mantem o que ja havia e diz que a leitura falhou, em vez de mostrar uma lista vazia como verdade.
        captureFlowError(error, "hr-colocacao-organograma-org-load");
        setErro(true);
      }
    } else {
      orgCarregadaRef.current = organizationId;
      setRecusado(false);
      setErro(false);
      setLinhas((data ?? []) as PessoaColocacaoOrganograma[]);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const vigentes = useMemo(() => vigentesPorPessoa(linhas, dataDeHojeISO()), [linhas]);

  const falha = useCallback(async (e: unknown): Promise<ResultadoColocacaoOrg> => {
    if (e instanceof LinhaNaoGravadaError) return { tipo: "erro", mensagem: e.message, codigo: "base" };
    if (!isPermissionError(e)) captureFlowError(e, "hr-colocacao-organograma-org-write");
    return { tipo: "erro", mensagem: await getFriendlyErrorMessage(e), codigo: "base" };
  }, []);

  const guardar = useCallback(
    async (args: GuardarColocacaoArgs): Promise<ResultadoColocacaoOrg> => {
      if (!organizationId) return { tipo: "erro", mensagem: null, codigo: "base" };
      const plano = planearGravacao(vigentes.get(args.pessoaId) ?? null, args.desde);
      if ("erro" in plano) return { tipo: "erro", mensagem: null, codigo: plano.erro };
      setSaving(true);
      try {
        const autorId = await resolveCurrentBusinessUserId();
        if (plano.fechar) {
          const { data, error } = await hrFrom("pessoas_colocacao_organograma")
            .update({ valido_ate: plano.fechar.validoAte, updated_by: autorId })
            .eq("id", plano.fechar.id)
            .select("id");
          if (error) throw error;
          // 0 linhas sem erro e o que a RLS devolve quando filtra o UPDATE: sem isto inseria-se uma segunda ligacao em vigor.
          if (!data || data.length === 0) throw new LinhaNaoGravadaError();
        }
        const { error } = await hrFrom("pessoas_colocacao_organograma").insert({
          pessoa_id: args.pessoaId,
          organization_id: organizationId,
          organograma_node_id: args.nodeId,
          valido_de: args.desde,
          valido_ate: null,
          motivo: args.motivo,
          created_by: autorId,
          updated_by: autorId,
        });
        if (error) throw error;
        await load();
        return { tipo: "ok", operacao: plano.tipo };
      } catch (e) {
        // Se a linha antiga ja foi fechada mas a nova falhou, o estado real e o da base: recarrega-se.
        await load();
        return await falha(e);
      } finally {
        setSaving(false);
      }
    },
    [organizationId, vigentes, load, falha],
  );

  const desligar = useCallback(
    async (pessoaId: string, motivo: string | null): Promise<ResultadoColocacaoOrg> => {
      const atual = vigentes.get(pessoaId);
      if (!atual) return { tipo: "erro", mensagem: null, codigo: "naoLigada" };
      setSaving(true);
      try {
        const autorId = await resolveCurrentBusinessUserId();
        const { data, error } = await hrFrom("pessoas_colocacao_organograma")
          .update({ valido_ate: validoAteDeDesligar(atual.valido_de, dataDeHojeISO()), motivo, updated_by: autorId })
          .eq("id", atual.id)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) throw new LinhaNaoGravadaError();
        await load();
        return { tipo: "ok", operacao: "desligar" };
      } catch (e) {
        return await falha(e);
      } finally {
        setSaving(false);
      }
    },
    [vigentes, load, falha],
  );

  return { vigentes, loading, recusado, erro, saving, recarregar: load, guardar, desligar };
}
