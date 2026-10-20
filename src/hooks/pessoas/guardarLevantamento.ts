import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { respostasParaBase, validarRespostas } from "@/components/negocio-metas/respostasQuestionario";
import type { QuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import type { Respostas } from "@/components/negocio-metas/perguntasTipos";
import { useQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { chamarNeg, ErroNeg } from "./chamarNeg";
import { invalidarPessoas } from "./invalidarPessoas";
import { useFontePessoas } from "./useFontePessoas";

// A base recusa estes dois porque o levantamento já está ligado (NG005) ou o negócio já tem um (NG013): a ficha que se vê está desatualizada.
const RECUSAS_DE_FICHA_DESATUALIZADA = ["NG005", "NG013"];
export const CHAVE_NAO_PRONTO ="businessGoals.new.qform.notReady";
const CHAVE_INVALIDAS = "businessGoals.new.qform.invalid";
const CHAVE_MUDOU = "businessGoals.new.qform.changed";
const CHAVE_MUDOU_SEM_RECARGA = "businessGoals.new.qform.changedReloadFailed";

/** O que se grava de um levantamento: os dados, as linhas e as respostas (as do formulário, em texto: ver `Respostas`). */
export interface EntradaGuardarLevantamento {
  id: string;
  organizationId: string;
  entityId: string;
  /** O negócio a que se liga ao gravar; sem ele o levantamento fica livre. */
  negocioId?: string | null;
  /** p_dados tal como a base os quer (data_levantamento, visita_id, feito_por, estado, notas, morada_*); a versão do questionário acrescenta-se aqui. */
  dados: Record<string, unknown>;
  linhas: readonly unknown[];
  respostas: Respostas;
}

/**
 * Os parâmetros de neg_guardar_levantamento no formato novo: as respostas por chave de pergunta (escolhas, texto ou número) e a versão do
 * questionário contra a qual a pessoa preencheu em p_dados (a base devolve `questionario_mudou` se entretanto subiu). O catálogo do código não tem versão.
 * Valida as respostas antes de as montar (texto comprido, número fora dos limites ou das casas): lança `ErroNeg` e nada segue. A guarda do botão
 * é do ecrã; esta é a que impede gravar mesmo que alguém chame `guardar` sem passar por ele.
 */
export function paramsGuardarLevantamento(e: EntradaGuardarLevantamento, q: QuestionarioForm): Record<string, unknown> {
  if (Object.keys(validarRespostas(q, e.respostas)).length > 0) throw new ErroNeg(null, null, CHAVE_INVALIDAS);
  return {
    p_id: e.id,
    p_organization_id: e.organizationId,
    p_entity_id: e.entityId,
    p_dados: q.versao === null ? e.dados : { ...e.dados, versao_questionario: q.versao },
    p_linhas: e.linhas,
    p_respostas: respostasParaBase(q, e.respostas),
    ...(e.negocioId ? { p_negocio_id: e.negocioId } : {}),
  };
}

export interface ResultadoGuardarLevantamento {
  levantamentoId: string | null;
  criado: boolean;
  mudou: boolean;
  ligadoA: string | null;
  /** A versão do questionário contra a qual a base validou (null se a base não a disse). */
  versaoQuestionario: number | null;
  /** O questionário mudou desde que a pessoa o viu: gravou-se na mesma, e as perguntas foram recarregadas. */
  questionarioMudou: boolean;
}

const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);

function lerResultado(cru: unknown): ResultadoGuardarLevantamento {
  const c = typeof cru === "object" && cru !== null ? (cru as Record<string, unknown>) : {};
  return {
    levantamentoId: texto(c.levantamento_id), criado: c.criado === true, mudou: c.mudou === true, ligadoA: texto(c.ligado_a),
    versaoQuestionario: typeof c.versao_questionario === "number" ? c.versao_questionario : null, questionarioMudou: c.questionario_mudou === true,
  };
}

export interface GuardarLevantamentoHook {
  /** Grava. Lança `ErroNeg` se falhar, e recusa (sem chamar a base) se o questionário ainda não carregou ou se há respostas por corrigir. Um pedido durante outro devolve o que já está em curso. */
  guardar: (entrada: EntradaGuardarLevantamento) => Promise<ResultadoGuardarLevantamento>;
  aGuardar: boolean;
  /** O questionário está carregado e pode gravar-se. Um botão «Guardar» fica desativado enquanto isto for falso. */
  pronto: boolean;
}

/**
 * Grava o levantamento por neg_guardar_levantamento com as perguntas do questionário que o formulário usa (o contexto). Se a base disser
 * `questionario_mudou`, o levantamento já ficou gravado: recarrega as perguntas e avisa quem preenche para conferir as respostas.
 */
export function useGuardarLevantamento(): GuardarLevantamentoHook {
  const { questionario, podeGuardar: contextoPodeGuardar, recarregar } = useQuestionario();
  const fonte = useFontePessoas();
  const modoReal = fonte.modo === "real";
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const client = useQueryClient();
  // Em modo real o catálogo do código (`semBase`) é o que o contexto vale SEM fornecedor: gravaria sem `versao_questionario` e com chaves de
  // pergunta que a base pode não ter. Só se grava contra as perguntas lidas da base; o protótipo sem base (modo exemplo) continua com o catálogo.
  const podeGuardar = contextoPodeGuardar && !(modoReal && questionario.semBase);
  const { t } = useTranslation();
  const [aGuardar, setAGuardar] = useState(false);
  // O estado só muda no render seguinte: a referência é o que impede dois pedidos num duplo clique.
  const emCurso = useRef<Promise<ResultadoGuardarLevantamento> | null>(null);

  const guardar = useCallback((entrada: EntradaGuardarLevantamento): Promise<ResultadoGuardarLevantamento> => {
    if (emCurso.current) return emCurso.current;
    if (!podeGuardar) return Promise.reject(new ErroNeg(null, null, CHAVE_NAO_PRONTO));
    setAGuardar(true);
    const voo = (async (): Promise<ResultadoGuardarLevantamento> => {
      try {
        let resultado: ResultadoGuardarLevantamento;
        try {
          resultado = lerResultado(await chamarNeg<unknown>("neg_guardar_levantamento", paramsGuardarLevantamento(entrada, questionario)));
        } catch (erro) {
          if (erro instanceof ErroNeg && erro.codigo !== null && RECUSAS_DE_FICHA_DESATUALIZADA.includes(erro.codigo)) {
            void invalidarPessoas(client, organizationId, entrada.entityId);
          }
          throw erro;
        }
        // Depois de escrever: a ficha e as listas refazem-se (o levantamento aparece em todo o lado sem recarregar a página).
        void invalidarPessoas(client, organizationId, entrada.entityId);
        if (resultado.questionarioMudou) {
          const recarregado = await recarregar();
          // Se a releitura falhou, as perguntas no ecrã continuam as antigas: não se diz que foram recarregadas.
          toast.info(t(recarregado ? CHAVE_MUDOU : CHAVE_MUDOU_SEM_RECARGA));
        }
        return resultado;
      } finally {
        emCurso.current = null;
        setAGuardar(false);
      }
    })();
    emCurso.current = voo;
    return voo;
  }, [podeGuardar, questionario, recarregar, t, client, organizationId]);

  return { guardar, aGuardar, pronto: podeGuardar };
}
