/**
 * A decisão do RH sobre uma justificação de dia, para os dois ecrãs que a tomam (a fila e o painel do dia da ficha).
 *
 * Recusar decide-se logo (não cria nada na base). Aceitar cria a falta na base e só depois fica decidida: monta
 * `AceitarComFaltaReal` enquanto dura, e quando a base responde regista o resultado ou diz o que falhou, sem nunca dar a
 * justificação por aceite se a falta não ficou marcada. Enquanto uma aceitação está a correr não se aceita outra.
 */
import { useCallback, useState, type ReactNode } from "react";
import { decidirJustificacaoDeDia } from "@/components/rh-exemplo/dados/accoesJustificacaoDia";
import { criaFalta, ehPessoaDaBase, type DecisaoQueCriaFalta } from "@/components/rh-exemplo/lib/faltaDaAceitacao";
import type { DecisaoJustificacaoDia, JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import { useTranslation } from "@/hooks/useTranslation";
import { AceitarComFaltaReal, type ResultadoDaAceitacao } from "./AceitarComFaltaReal";
import { textoDaDecisao } from "./textoDaDecisao";

export interface MensagemDeDecisao {
  texto: string;
  erro: boolean;
}

interface Execucao {
  justificacao: JustificacaoDia;
  decisao: DecisaoQueCriaFalta;
}

/** `aoCriarFalta`: chamado quando a base ficou com uma falta nova (mesmo que a decisão depois tenha falhado), para o ecrã reler o dia. */
export function useDecisaoDoDia(aoCriarFalta?: () => void) {
  const { t } = useTranslation();
  const [execucao, setExecucao] = useState<Execucao | null>(null);
  const [mensagem, setMensagem] = useState<MensagemDeDecisao | null>(null);

  const registar = useCallback(
    (j: JustificacaoDia, decisao: DecisaoJustificacaoDia, motivo: string, faltaId: string | null): string | null => {
      const resultado = decidirJustificacaoDeDia(j.id, decisao, motivo, faltaId);
      if (resultado.erro) {
        setMensagem({ texto: t(resultado.erro), erro: true });
        return resultado.erro;
      }
      setMensagem({ texto: textoDaDecisao(t, decisao, resultado), erro: false });
      return null;
    },
    [t],
  );

  /** Devolve a chave do erro quando a decisão não pôde sequer começar; `null` quando ficou decidida ou está a correr. */
  const decidir = useCallback(
    (j: JustificacaoDia, decisao: DecisaoJustificacaoDia, motivo = ""): string | null => {
      if (!criaFalta(decisao)) return registar(j, decisao, motivo, null);
      if (execucao) return null;
      if (!ehPessoaDaBase(j.pessoaId)) {
        const chave = "rhJust.erro.semPessoaReal";
        setMensagem({ texto: t(chave), erro: true });
        return chave;
      }
      setMensagem({ texto: t("rhJust.rh.aMarcarFalta"), erro: false });
      setExecucao({ justificacao: j, decisao });
      return null;
    },
    [execucao, registar, t],
  );

  const concluir = useCallback(
    (r: ResultadoDaAceitacao) => {
      const em = execucao;
      setExecucao(null);
      if (!em) return;
      if (r.faltaId || r.etapa !== "marcar") aoCriarFalta?.();
      if (r.erro) {
        const chave = r.etapa === "procurar" ? r.erro : r.etapa === "decidir" ? "rhJust.erro.decisaoFalhou" : "rhJust.erro.marcarFalhou";
        setMensagem({ texto: r.etapa === "procurar" ? t(chave) : t(chave, { motivo: t(r.erro) }), erro: true });
        return;
      }
      registar(em.justificacao, em.decisao, "", r.faltaId);
    },
    [execucao, registar, t, aoCriarFalta],
  );

  const executor: ReactNode = execucao ? (
    <AceitarComFaltaReal key={execucao.justificacao.id} justificacao={execucao.justificacao} decisao={execucao.decisao} aoConcluir={concluir} />
  ) : null;

  return { decidir, mensagem, executor, aOcupar: execucao !== null };
}
