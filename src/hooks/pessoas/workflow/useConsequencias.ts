import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { chamarNeg, ErroNeg } from "../chamarNeg";
import { CHAVE_ERRO_GENERICO, CHAVES_ERRO_NEG } from "../errosNeg";
import { useFontePessoas } from "../useFontePessoas";
import {
  criaContratoEfetivo, criaPropostaEfetivo, lerRecusaOrcamento, lerResultadoCadeia, lerResultadoRecusaOrcamento, paraEnvioCadeia,
  paraEnvioRecusaOrcamento, RECUSAS_ORCAMENTO, type Cadeia, type Consequencias, type RecusaOrcamento, type ResultadoCadeia, type ResultadoRecusaOrcamento,
} from "./consequencias";

/** Chave da leitura, com a organização (para não misturar organizações na cache). */
export const consequenciasQueryKey = (organizationId: string | null | undefined) => ["pessoas-consequencias", organizationId ?? null] as const;

export type EstadoConsequencias = "a-carregar" | "erro" | "pronto";

export interface ConsequenciasHook {
  /** `erro`: alguma leitura falhou; `dados` traz o que se leu, com `null` no resto, e `recarregar` tenta de novo. */
  estado: EstadoConsequencias;
  dados: Consequencias;
  /** Há uma gravação em curso (qualquer das duas). */
  aGuardar: boolean;
  /** Grava os dois interruptores por `neg_guardar_cadeia`. Lança `ErroNeg` se falhar. */
  guardarCadeia: (cadeia: Cadeia) => Promise<ResultadoCadeia>;
  /** Grava a recusa do orçamento por `neg_guardar_recusa_orcamento`. Lança `ErroNeg` se falhar. */
  guardarRecusaOrcamento: (valor: RecusaOrcamento) => Promise<ResultadoRecusaOrcamento>;
  recarregar: () => void;
}

interface Lido {
  dados: Consequencias;
  /** Quantas leituras falharam (cada uma já foi comunicada à observabilidade). */
  falhas: number;
}

const DESCONHECIDO: Consequencias = { recusaOrcamento: null, orcamentoCriaProposta: null, propostaCriaContrato: null };
const COLUNAS_ACOES = "stage_id, action_type, is_active";

// `as any` sai quando os tipos do Supabase forem regenerados. Toda a leitura de dados leva o organization_id; as fases são as globais (organization_id nulo).
async function dadosDe(consulta: PromiseLike<{ data: unknown; error: unknown }>): Promise<unknown> {
  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}

async function lerRecusa(organizationId: string): Promise<RecusaOrcamento | null> {
  const linha = await dadosDe((supabase as any).from("negocio_workflow_config").select("recusa_orcamento").eq("organization_id", organizationId).maybeSingle());
  return lerRecusaOrcamento(linha);
}

/** A fase global que o motor usa (a única com esse nome e sem organização). */
async function lerFase(tabela: string, nome: string): Promise<string> {
  const fases = await dadosDe((supabase as any).from(tabela).select("id").is("organization_id", null).eq("name", nome));
  const id = Array.isArray(fases) && fases.length === 1 ? (fases[0] as { id?: unknown }).id : null;
  if (typeof id !== "string") throw new Error(`a fase ${nome} de ${tabela} não é única`);
  return id;
}

/** Ações que não têm formato de lista também são uma leitura falhada. */
function desconhecidoEFalha(valor: boolean | null, tabela: string): boolean {
  if (valor === null) throw new Error(`as ações de ${tabela} não se reconhecem`);
  return valor;
}

async function lerCriaProposta(organizationId: string): Promise<boolean | null> {
  const [fase, acoes] = await Promise.all([
    lerFase("quote_workflow_stages", "aceite"),
    dadosDe((supabase as any).from("quote_stage_actions").select(COLUNAS_ACOES).eq("organization_id", organizationId).eq("action_type", "create_proposal")),
  ]);
  return desconhecidoEFalha(criaPropostaEfetivo(acoes, fase), "quote_stage_actions");
}

async function lerCriaContrato(organizationId: string): Promise<boolean | null> {
  const [fase, acoes] = await Promise.all([
    lerFase("proposal_workflow_stages", "accepted"),
    dadosDe((supabase as any).from("proposal_stage_actions").select(COLUNAS_ACOES).eq("organization_id", organizationId)),
  ]);
  return desconhecidoEFalha(criaContratoEfetivo(acoes, fase), "proposal_stage_actions");
}

/** Cada leitura falha sozinha: o que se leu fica, o que não se leu fica `null` e a falha é observável (captureFlowError e estado «erro»). */
async function lerTudo(organizationId: string): Promise<Lido> {
  const [recusa, orcamento, proposta] = await Promise.allSettled([lerRecusa(organizationId), lerCriaProposta(organizationId), lerCriaContrato(organizationId)]);
  let falhas = 0;
  const valor = <T>(r: PromiseSettledResult<T | null>): T | null => {
    if (r.status === "fulfilled") return r.value;
    falhas += 1;
    captureFlowError(r.reason, "pessoas-neg");
    return null;
  };
  const dados: Consequencias = { recusaOrcamento: valor(recusa), orcamentoCriaProposta: valor(orcamento), propostaCriaContrato: valor(proposta) };
  return { dados, falhas };
}

/**
 * As consequências da cadeia de documentos da organização de Pessoas: lê-as de negocio_workflow_config, quote_stage_actions e proposal_stage_actions
 * (sempre com o filtro da organização) e grava-as SÓ por `neg_guardar_cadeia` e `neg_guardar_recusa_orcamento` (NG008, NG009, NG026, 42501). Só uma
 * gravação de cada vez. `habilitado` false não lê nada. Depende das migrations 20261226210000 e 20261226240000: sem elas a leitura da recusa
 * falha (estado «erro», o resto continua lido).
 */
export function useConsequencias(habilitado = true): ConsequenciasHook {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const consulta = useQuery({
    queryKey: consequenciasQueryKey(organizationId),
    queryFn: () => lerTudo(organizationId as string),
    enabled: habilitado && !!organizationId,
  });
  const [aGuardar, setAGuardar] = useState(false);
  // O estado só muda no render seguinte: a referência é o que impede dois pedidos num duplo clique.
  const emCurso = useRef<{ tipo: "cadeia" | "recusa"; voo: Promise<unknown> } | null>(null);

  const juntar = useCallback((parcial: Partial<Consequencias>) => {
    client.setQueryData<Lido>(consequenciasQueryKey(organizationId), (antigo) => (antigo ? { ...antigo, dados: { ...antigo.dados, ...parcial } } : antigo));
  }, [client, organizationId]);
  const reler = useCallback(() => {
    void client.invalidateQueries({ queryKey: consequenciasQueryKey(organizationId) });
  }, [client, organizationId]);

  const executar = useCallback(<T>(tipo: "cadeia" | "recusa", corpo: (organizacao: string) => Promise<T>): Promise<T> => {
    if (emCurso.current) {
      // Um segundo pedido igual devolve o que já está em curso; um de outra espécie não se mistura com ele.
      return emCurso.current.tipo === tipo ? (emCurso.current.voo as Promise<T>) : Promise.reject(new ErroNeg(null, null, CHAVE_ERRO_GENERICO));
    }
    if (!organizationId) return Promise.reject(new ErroNeg(null, null, CHAVE_ERRO_GENERICO));
    setAGuardar(true);
    const voo = (async () => {
      try {
        return await corpo(organizationId);
      } finally {
        emCurso.current = null;
        setAGuardar(false);
      }
    })();
    emCurso.current = { tipo, voo };
    return voo;
  }, [organizationId]);

  const guardarCadeia = useCallback((cadeia: Cadeia) => executar("cadeia", async (organizacao) => {
    const resposta = await chamarNeg<unknown>("neg_guardar_cadeia", paraEnvioCadeia(organizacao, cadeia.orcamentoCriaProposta, cadeia.propostaCriaContrato));
    const resultado = lerResultadoCadeia(resposta);
    if (resultado.depois) juntar(resultado.depois);
    else reler(); // a resposta não se reconhece: relê-se da base em vez de mostrar o que se enviou
    return resultado;
  }), [executar, juntar, reler]);

  const guardarRecusaOrcamento = useCallback((valor: RecusaOrcamento) => executar("recusa", async (organizacao) => {
    // Os valores que a base não aceita recusam-se aqui (NG009), sem gastar uma ida à base.
    if (!(RECUSAS_ORCAMENTO as readonly string[]).includes(valor)) throw new ErroNeg(null, "NG009", CHAVES_ERRO_NEG.NG009);
    const resposta = await chamarNeg<unknown>("neg_guardar_recusa_orcamento", paraEnvioRecusaOrcamento(organizacao, valor));
    const resultado = lerResultadoRecusaOrcamento(resposta);
    if (resultado.depois) juntar({ recusaOrcamento: resultado.depois });
    else reler();
    return resultado;
  }), [executar, juntar, reler]);

  const recarregar = useCallback(() => {
    void consulta.refetch();
  }, [consulta]);

  const lido = consulta.data;
  const estado: EstadoConsequencias = consulta.isError || (lido !== undefined && lido.falhas > 0) ? "erro" : consulta.isSuccess ? "pronto" : "a-carregar";
  return { estado, dados: lido?.dados ?? DESCONHECIDO, aGuardar, guardarCadeia, guardarRecusaOrcamento, recarregar };
}
