/**
 * Aceitar uma justificação de dia cria a falta NA BASE: marca-a (`rpc_hr_falta_marcar`, com a justificação registada e a
 * coluna `remunerada` conforme «paga» ou «não paga») e decide-a como justificada (`rpc_hr_falta_decidir_justificacao`),
 * tudo pelo hook real de assiduidade da pessoa.
 *
 * É um componente (e não uma função) porque o hook real está preso a UMA pessoa e a uma janela de datas, e a fila mostra
 * pessoas diferentes: monta-se enquanto a decisão dura, para essa pessoa e esse dia, e quem o monta recebe o resultado em
 * `aoConcluir` uma só vez. Não desenha nada.
 *
 * Idempotente: se a pessoa ja tem uma falta activa nesse dia e hora, nao marca outra; decide a que existe.
 * O `marcarFalta` não devolve o id da falta; lê-se das faltas do dia, relidas depois de marcar, por quem não existia antes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useAssiduidadeDaPessoa } from "@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa";
import { argumentosDaFalta, faltaActivaDoDia, faltaCriada, type DecisaoQueCriaFalta } from "@/components/rh-exemplo/lib/faltaDaAceitacao";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";

/** Em que passo acabou: «marcar» (nada ficou na base), «procurar» ou «decidir» (a falta ficou marcada). */
export type EtapaDaAceitacao = "marcar" | "procurar" | "decidir";

export interface ResultadoDaAceitacao {
  /** Uma chave de tradução ou a mensagem já escrita (o `t` devolve a própria cadeia se não conhece a chave); `null` = tudo feito. */
  erro: string | null;
  faltaId: string | null;
  etapa: EtapaDaAceitacao;
}

interface Props {
  justificacao: JustificacaoDia;
  decisao: DecisaoQueCriaFalta;
  aoConcluir: (resultado: ResultadoDaAceitacao) => void;
}

type Fase = "espera" | "marcada";

export function AceitarComFaltaReal({ justificacao, decisao, aoConcluir }: Props) {
  const janela = useMemo(() => ({ de: justificacao.data, ate: justificacao.data }), [justificacao.data]);
  const assiduidade = useAssiduidadeDaPessoa(justificacao.pessoaId, janela);
  const [fase, setFase] = useState<Fase>("espera");
  const idsAntes = useRef<Set<string>>(new Set());
  // Cada passo corre uma só vez, mesmo que o efeito volte a correr (renderizações extra, modo estrito).
  const marcou = useRef(false);
  const decidiu = useRef(false);
  const concluir = useRef(aoConcluir);
  concluir.current = aoConcluir;

  useEffect(() => {
    if (assiduidade.loading || assiduidade.saving) return;
    if (fase === "espera" && !marcou.current) {
      marcou.current = true;
      // Ja ha uma falta activa neste dia e hora: continua a partir dela (decidir), sem marcar outra.
      const existente = faltaActivaDoDia(assiduidade.faltas, justificacao);
      if (existente) {
        decidiu.current = true;
        void assiduidade
          .decidirJustificacao({ faltaId: existente.id, resultado: "justificada", motivo: null })
          .then((erro) => concluir.current({ erro, faltaId: existente.id, etapa: "decidir" }));
        return;
      }
      idsAntes.current = new Set(assiduidade.faltas.map((f) => f.id));
      void assiduidade.marcarFalta(argumentosDaFalta(justificacao, decisao)).then((erro) => {
        if (erro) concluir.current({ erro, faltaId: null, etapa: "marcar" });
        else setFase("marcada");
      });
      return;
    }
    if (fase === "marcada" && !decidiu.current) {
      decidiu.current = true;
      const falta = faltaCriada(assiduidade.faltas, idsAntes.current, justificacao);
      if (!falta) {
        concluir.current({ erro: "rhJust.erro.faltaNaoEncontrada", faltaId: null, etapa: "procurar" });
        return;
      }
      void assiduidade
        .decidirJustificacao({ faltaId: falta.id, resultado: "justificada", motivo: null })
        .then((erro) => concluir.current({ erro, faltaId: falta.id, etapa: "decidir" }));
    }
  }, [fase, assiduidade, justificacao, decisao]);

  return null;
}
