/** As justificações de «esqueci-me de picar» de uma pessoa, já separadas: o que ainda falta justificar e o que já foi enviado. */
import { useMemo } from "react";
import { useFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { diasUteisRestantes, situacaoDoPrazo, type AlertaDia, type JustificacaoPicagem } from "@/components/rh-exemplo/lib/alertasFimDia";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";

export interface JustificacoesDaPessoa {
  /** Alertas à espera de justificação (dentro ou fora do prazo). */
  porJustificar: AlertaDia[];
  /** Dias úteis que restam à justificação mais urgente dentro do prazo; `null` se nenhuma está dentro do prazo. */
  menorPrazoDias: number | null;
  pendentes: JustificacaoPicagem[];
  aceites: JustificacaoPicagem[];
  recusadas: JustificacaoPicagem[];
  /** O que a pessoa tem para fazer agora: os alertas ainda dentro do prazo. */
  porFazer: number;
}

export function useJustificacoesDaPessoa(pessoaId: string): JustificacoesDaPessoa {
  const alertas = useFluxosB((e) => e.alertas);
  const justificacoes = useFluxosB((e) => e.justificacoesPicagem);
  return useMemo(() => {
    const hoje = hojeIso();
    const porJustificar = alertas.filter((a) => a.pessoaId === pessoaId && (a.estado === "pendente" || a.estado === "justificacao_pedida"));
    const dentro = porJustificar.filter((a) => situacaoDoPrazo(a, hoje) === "dentro_do_prazo");
    const minhas = justificacoes.filter((j) => j.pessoaId === pessoaId);
    return {
      porJustificar,
      menorPrazoDias: dentro.length === 0 ? null : Math.min(...dentro.map((a) => diasUteisRestantes(a.data, hoje))),
      pendentes: minhas.filter((j) => j.estado === "pendente"),
      aceites: minhas.filter((j) => j.estado === "aceite"),
      recusadas: minhas.filter((j) => j.estado === "recusada"),
      porFazer: dentro.length,
    };
  }, [alertas, justificacoes, pessoaId]);
}
