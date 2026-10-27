/**
 * As justificações do dia, lidas e escritas na base: a pessoa justifica um atraso ou uma falta SUGERIDA, o RH decide.
 *
 * TUDO POR RPC, NADA POR TABELA
 * -----------------------------
 * `pessoas_justificacoes_dia` não dá `SELECT` ao cliente (o motivo é dado de saúde quando é consulta médica) nem aceita
 * escrita directa. Lê-se por `rpc_hr_justificacao_dia_listar`, que decide quando devolve o texto, e escreve-se por
 * `_registar` e `_decidir`. «Aceitar» é UMA chamada: a base marca a falta, regista a justificação dela e decide-a na
 * mesma transacção, e devolve o id da falta. Não há o estado «falta marcada, justificação por decidir».
 *
 * ENQUANTO A MIGRATION NÃO ESTIVER APLICADA
 * -----------------------------------------
 * As RPCs não existem. O ecrã não parte: a leitura fica `indisponivel` (e di-lo), e as escritas devolvem a chave
 * `rhJust.erro.indisponivel`. Não é «não há justificações».
 *
 * VÁRIAS LEITURAS, UMA SÓ VERDADE
 * -------------------------------
 * A fila do RH, o painel do dia e o calendário da pessoa lêem a mesma coisa em sítios diferentes. Depois de registar ou
 * decidir, `avisarMudancaDeJustificacoes` manda todas as leituras montadas relerem em silêncio, para que o contador, a
 * fila e o calendário acompanhem sem recarregar a página.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import {
  chaveDoErroDeJustificacaoDia,
  resultadoDaDecisao,
  rpcIndisponivel,
  type AcessoAoTextoDb,
  type ArgumentosDeRegisto,
  type DecisaoJustificacaoDiaDb,
  type JustificacaoDiaLinha,
  type ResultadoDaDecisaoDb,
} from "@/lib/hr/justificacaoDia";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

export type { AcessoAoTextoDb, ArgumentosDeRegisto, DecisaoJustificacaoDiaDb, JustificacaoDiaLinha, ResultadoDaDecisaoDb };

const ouvintes = new Set<() => void>();

/** Manda todas as leituras de justificações montadas relerem (em silêncio). */
export function avisarMudancaDeJustificacoes(): void {
  ouvintes.forEach((ouvinte) => ouvinte());
}

/** Como correu a leitura: `ok`, recusada por permissão, falhada (rede, timeout) ou RPC ainda por aplicar. */
export type EstadoDaLeitura = "ok" | "recusado" | "erro" | "indisponivel";

export interface OpcoesJustificacoesDoDia {
  /** Sem pessoa: a organização inteira (a fila do RH). Quem não é RH só recebe as suas, qualquer que seja o pedido. */
  pessoaId?: string | null;
  /** Primeiro dia (inclusive), `AAAA-MM-DD`. Sem limite se for omitido. */
  de?: string | null;
  /** Último dia (inclusive), `AAAA-MM-DD`. */
  ate?: string | null;
  soPendentes?: boolean;
  /** `false` não lê nada (para quem só precisa das acções). */
  activo?: boolean;
}

export function useJustificacoesDoDia(opcoes: OpcoesJustificacoesDoDia = {}) {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;
  const { pessoaId = null, de = null, ate = null, soPendentes = false, activo = true } = opcoes;

  const [linhas, setLinhas] = useState<JustificacaoDiaLinha[]>([]);
  const [leitura, setLeitura] = useState<EstadoDaLeitura>("ok");
  const [loading, setLoading] = useState(activo);
  // Conta os pedidos: só a resposta do mais recente escreve no estado (uma releitura lenta do mês anterior não
  // pode sobrescrever a do mês novo).
  const ultimoPedido = useRef(0);

  /** `silencioso`: reler depois de uma gravação sem pôr `loading` a true (não desmontar o ecrã que está aberto). */
  const load = useCallback(
    async (silencioso = false) => {
      const pedido = ++ultimoPedido.current;
      if (!activo || !orgId) {
        setLinhas([]);
        setLeitura("ok");
        setLoading(false);
        return;
      }
      if (!silencioso) setLoading(true);
      try {
        const { data, error } = await hrRpc("rpc_hr_justificacao_dia_listar", {
          _organization_id: orgId,
          _pessoa_id: pessoaId,
          _de: de,
          _ate: ate,
          _so_pendentes: soPendentes,
        });
        if (pedido !== ultimoPedido.current) return;
        if (error) {
          setLinhas([]);
          if (rpcIndisponivel(error)) setLeitura("indisponivel");
          else if (isPermissionError(error)) setLeitura("recusado");
          else {
            captureFlowError(error, "hr-assiduidade-load");
            setLeitura("erro");
          }
          return;
        }
        setLinhas(Array.isArray(data) ? (data as JustificacaoDiaLinha[]) : []);
        setLeitura("ok");
      } catch (e) {
        captureFlowError(e, "hr-assiduidade-load");
        if (pedido !== ultimoPedido.current) return;
        setLinhas([]);
        setLeitura("erro");
      } finally {
        if (pedido === ultimoPedido.current) setLoading(false);
      }
    },
    [activo, orgId, pessoaId, de, ate, soPendentes],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const reler = () => void load(true);
    ouvintes.add(reler);
    return () => {
      ouvintes.delete(reler);
    };
  }, [load]);

  const recarregar = useCallback(() => load(true), [load]);

  return {
    linhas,
    loading,
    leitura,
    recusado: leitura === "recusado",
    erro: leitura === "erro",
    indisponivel: leitura === "indisponivel",
    recarregar,
  };
}

/** O que sai de uma escrita: `null` em sucesso, ou uma chave de tradução / mensagem amigável já escrita. */
async function mensagemDoErro(e: unknown): Promise<string> {
  if (rpcIndisponivel(e)) return "rhJust.erro.indisponivel";
  const chave = chaveDoErroDeJustificacaoDia(e);
  // Um erro reconhecido é uma regra de negócio a funcionar e uma recusa de permissão é a resposta certa; o resto é um
  // defeito, mesmo que a base o tenha levantado.
  if (!chave && !isPermissionError(e)) captureFlowError(e, "hr-assiduidade-write");
  return chave ?? (await getFriendlyErrorMessage(e));
}

export interface ResultadoDoRegisto {
  erro: string | null;
  id: string | null;
}

export interface ResultadoDaDecisao extends ResultadoDaDecisaoDb {
  erro: string | null;
}

export interface ResultadoDoTexto {
  erro: string | null;
  texto: string | null;
}

export interface ResultadoDosAcessos {
  erro: string | null;
  acessos: AcessoAoTextoDb[];
}

export function useAccoesJustificacaoDia() {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;
  const [aGravar, setAGravar] = useState(false);

  /** A pessoa (ou o RH em nome dela) envia a justificação de um dia. */
  const registar = useCallback(
    async (args: ArgumentosDeRegisto): Promise<ResultadoDoRegisto> => {
      setAGravar(true);
      try {
        const { data, error } = await hrRpc("rpc_hr_justificacao_dia_registar", {
          _organization_id: orgId,
          _pessoa_id: args.pessoaId,
          _data: args.data,
          _tipo: args.tipo,
          _de_atraso: args.deAtraso,
          _periodo_inicio: args.periodoInicio,
          _periodo_fim: args.periodoFim,
          _motivo: args.motivo,
          _hora_real: args.horaReal,
          _anexos_nomes: [...args.anexosNomes],
        });
        if (error) throw error;
        avisarMudancaDeJustificacoes();
        return { erro: null, id: typeof data === "string" ? data : null };
      } catch (e) {
        return { erro: await mensagemDoErro(e), id: null };
      } finally {
        setAGravar(false);
      }
    },
    [orgId],
  );

  /**
   * O RH decide. Aceitar marca a falta, regista a justificação dela e decide-a, na mesma transacção: se qualquer passo
   * falhar nada fica escrito. Recusar exige motivo e não toca em faltas.
   *
   * Num mês fechado a base recusa aceitar sem `confirmarMesFechado` (erro `CHAVE_ERRO_MES_FECHADO`, nada escrito): o ecrã
   * pergunta e volta a chamar com `confirmarMesFechado: true`.
   */
  const decidir = useCallback(
    async (args: {
      justificacaoId: string;
      decisao: DecisaoJustificacaoDiaDb;
      motivo?: string | null;
      confirmarMesFechado?: boolean;
    }): Promise<ResultadoDaDecisao> => {
      setAGravar(true);
      try {
        const { data, error } = await hrRpc("rpc_hr_justificacao_dia_decidir", {
          _justificacao_id: args.justificacaoId,
          _decisao: args.decisao,
          _motivo: args.motivo ?? null,
          _confirmar_mes_fechado: args.confirmarMesFechado === true,
        });
        if (error) throw error;
        avisarMudancaDeJustificacoes();
        return { erro: null, ...resultadoDaDecisao(data) };
      } catch (e) {
        return { erro: await mensagemDoErro(e), faltaId: null, mesFechado: false };
      } finally {
        setAGravar(false);
      }
    },
    [],
  );

  /**
   * O texto em claro, sob registo de quem leu (`pessoas_acessos_sensiveis`). NUNCA se chama ao carregar o ecrã: é o
   * mesmo padrão do NISS e do atestado, e cada chamada deixa rasto.
   */
  const verTexto = useCallback(async (justificacaoId: string): Promise<ResultadoDoTexto> => {
    try {
      const { data, error } = await hrRpc("rpc_hr_justificacao_dia_ver_texto", { _justificacao_id: justificacaoId });
      if (error) throw error;
      return { erro: null, texto: typeof data === "string" ? data : null };
    } catch (e) {
      return { erro: await mensagemDoErro(e), texto: null };
    }
  }, []);

  /** Quem leu o texto e quando. Quem não tem a permissão de ver o texto recebe uma lista vazia e a chave do erro. */
  const acessos = useCallback(async (justificacaoId: string): Promise<ResultadoDosAcessos> => {
    try {
      const { data, error } = await hrRpc("rpc_hr_justificacao_dia_acessos", { _justificacao_id: justificacaoId });
      if (error) throw error;
      return { erro: null, acessos: Array.isArray(data) ? (data as AcessoAoTextoDb[]) : [] };
    } catch (e) {
      return { erro: await mensagemDoErro(e), acessos: [] };
    }
  }, []);

  return { registar, decidir, verTexto, acessos, aGravar };
}
