import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { QuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import type { Respostas } from "@/components/negocio-metas/perguntasTipos";
import { useQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import { respostasParaBase, validarRespostas, type RespostaBase } from "@/components/negocio-metas/respostasQuestionario";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { chamarNeg, ErroNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO, CHAVES_ERRO_NEG } from "./errosNeg";
import { invalidarPessoas } from "./invalidarPessoas";
import { CHAVE_JA_A_GUARDAR, CHAVE_NAO_PRONTO } from "./guardarLevantamento";
import { useFontePessoas } from "./useFontePessoas";

const CHAVE_INVALIDAS = "businessGoals.new.qform.invalid";
const CHAVE_MUDOU = "businessGoals.new.qform.changed";
const CHAVE_MUDOU_SEM_RECARGA = "businessGoals.new.qform.changedReloadFailed";
/** O pedido do cliente tem até 2000 caracteres (a base recusa mais com NG009). */
export const MAX_PEDIDO_CLIENTE = 2000;

/**
 * O que se grava da qualificação de um negócio aberto. `respostas` `undefined` = não mexe nas respostas; `{}` = apaga todas. `pedidoCliente`
 * `undefined` = não mexe; vazio ou só espaços = limpa. Tem de haver pelo menos um dos dois.
 */
export interface EntradaGuardarQualificacao {
  negocioId: string;
  /** A pessoa a que o negócio pertence: é a ficha que se refaz depois de gravar. */
  entityId: string;
  respostas?: Respostas;
  pedidoCliente?: string;
}

export interface ParamsGuardarQualificacao {
  p_negocio_id: string;
  p_respostas: Record<string, RespostaBase> | null;
  p_pedido_cliente: string | null;
  p_versao_questionario: number | null;
}

/**
 * Os parâmetros de neg_guardar_qualificacao. Só as perguntas da aba Qualificação seguem (as da Visita são do levantamento) e só se validam
 * essas. Lança `ErroNeg` antes de montar se não há nada para mexer, se uma resposta é inválida ou se o pedido passa de 2000 caracteres.
 */
export function paramsGuardarQualificacao(e: EntradaGuardarQualificacao, q: QuestionarioForm): ParamsGuardarQualificacao {
  if (e.respostas === undefined && e.pedidoCliente === undefined) throw new ErroNeg(null, null, CHAVES_ERRO_NEG.NG009);
  if (e.respostas && Object.keys(validarRespostas(q, e.respostas, "qualificacao")).length > 0) throw new ErroNeg(null, null, CHAVE_INVALIDAS);
  const pedido = e.pedidoCliente === undefined ? null : e.pedidoCliente.trim();
  if (pedido !== null && Array.from(pedido).length > MAX_PEDIDO_CLIENTE) throw new ErroNeg(null, null, CHAVES_ERRO_NEG.NG009);
  return {
    p_negocio_id: e.negocioId,
    p_respostas: e.respostas === undefined ? null : respostasParaBase(q, e.respostas, "qualificacao"),
    p_pedido_cliente: pedido,
    p_versao_questionario: q.versao,
  };
}

export interface ResultadoGuardarQualificacao {
  qualificacaoId: string | null;
  criado: boolean;
  mudou: boolean;
  versaoQuestionario: number | null;
  /** O questionário mudou desde que a pessoa o viu: gravou-se na mesma, e as perguntas foram recarregadas. */
  questionarioMudou: boolean;
}

const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);

function lerResultado(cru: unknown): ResultadoGuardarQualificacao {
  const c = typeof cru === "object" && cru !== null ? (cru as Record<string, unknown>) : {};
  return {
    qualificacaoId: texto(c.qualificacao_id), criado: c.criado === true, mudou: c.mudou === true,
    versaoQuestionario: typeof c.versao_questionario === "number" ? c.versao_questionario : null, questionarioMudou: c.questionario_mudou === true,
  };
}

export interface GuardarQualificacaoHook {
  /** Grava. Lança `ErroNeg` se falhar (NG001 negócio indisponível, NG002 não aberto, NG028 fechado, NG009 valor inválido...). Um pedido equivalente durante outro devolve o que está em curso; um diferente é recusado («já a guardar»). */
  guardar: (entrada: EntradaGuardarQualificacao) => Promise<ResultadoGuardarQualificacao>;
  aGuardar: boolean;
  /** O questionário está carregado e pode gravar-se. */
  pronto: boolean;
}

/**
 * Grava a qualificação de um negócio (respostas da aba Qualificação e o pedido do cliente) com `neg_guardar_qualificacao`, contra as perguntas do
 * questionário que o formulário usa (o contexto). Se a base disser `questionario_mudou` já gravou: recarrega as perguntas e avisa.
 */
export function useGuardarQualificacao(): GuardarQualificacaoHook {
  const { questionario, podeGuardar: contextoPodeGuardar, recarregar } = useQuestionario();
  const fonte = useFontePessoas();
  const modoReal = fonte.modo === "real";
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const client = useQueryClient();
  // Como no levantamento: em modo real só se grava contra as perguntas lidas da base, nunca contra o catálogo do código.
  const podeGuardar = contextoPodeGuardar && modoReal && !questionario.semBase;
  const { t } = useTranslation();
  const [aGuardar, setAGuardar] = useState(false);
  const emCurso = useRef<{ voo: Promise<ResultadoGuardarQualificacao>; assinatura: string } | null>(null);

  const guardar = useCallback((entrada: EntradaGuardarQualificacao): Promise<ResultadoGuardarQualificacao> => {
    // Só um pedido equivalente partilha o que está em curso (duplo clique); um diferente não pode receber o resultado de outro.
    const assinatura = JSON.stringify(entrada);
    if (emCurso.current) return emCurso.current.assinatura === assinatura ? emCurso.current.voo : Promise.reject(new ErroNeg(null, null, CHAVE_JA_A_GUARDAR));
    if (!podeGuardar) return Promise.reject(new ErroNeg(null, null, modoReal ? CHAVE_NAO_PRONTO : CHAVE_ERRO_GENERICO));
    setAGuardar(true);
    const voo = (async (): Promise<ResultadoGuardarQualificacao> => {
      try {
        const resultado = lerResultado(await chamarNeg<unknown>("neg_guardar_qualificacao", paramsGuardarQualificacao(entrada, questionario)));
        void invalidarPessoas(client, organizationId, entrada.entityId);
        if (resultado.questionarioMudou) {
          // Já gravou: se a releitura rejeitar, o guardar não falha (avisa que as perguntas não foram recarregadas).
          const recarregado = await recarregar().catch(() => null);
          toast.info(t(recarregado ? CHAVE_MUDOU : CHAVE_MUDOU_SEM_RECARGA));
        }
        return resultado;
      } finally {
        emCurso.current = null;
        setAGuardar(false);
      }
    })();
    emCurso.current = { voo, assinatura };
    return voo;
  }, [podeGuardar, modoReal, questionario, recarregar, t, client, organizationId]);

  return { guardar, aGuardar, pronto: podeGuardar };
}
