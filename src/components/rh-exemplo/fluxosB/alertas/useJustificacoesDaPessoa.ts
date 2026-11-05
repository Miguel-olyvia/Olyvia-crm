/**
 * As marcações por justificar de uma pessoa, lidas da base: os desvios que `hr_assiduidade_desvios` propõe (turno
 * planeado sem horas, ou picagem por emparelhar) do período da folha de hoje (o prazo para justificar é o fecho do
 * período), filtrados para a pessoa. É a mesma leitura do mapa
 * de assiduidade da organização (`useAssiduidadeDaOrganizacao`), por isso quem não tem permissão para a fila de desvios
 * também não vê esta lista (a base recusa e o ecrã di-lo, em vez de mostrar «não há nada»).
 *
 * As justificações ENVIADAS de uma picagem esquecida não têm tabela na base: `pendentes`, `aceites` e `recusadas` ficam
 * sempre vazias aqui, e o ecrã não oferece enviar uma.
 */
import { useMemo } from "react";
import type { PrazoDe } from "@/components/rh-exemplo/hooks/prazoJustificacao";
import { useAssiduidadeDaOrganizacao } from "@/components/rh-exemplo/hooks/useAssiduidadeDaOrganizacao";
import { usePrazoJustificacao } from "@/components/rh-exemplo/hooks/usePrazoJustificacao";
import { diasRestantes, situacaoDoPrazo, type AlertaDia, type JustificacaoPicagem, type TipoAlerta } from "@/components/rh-exemplo/lib/alertasFimDia";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import type { Desvio, TipoDesvio } from "@/components/rh-exemplo/tiposAssiduidade";

export interface JustificacoesDaPessoa {
  /** Alertas à espera de justificação (dentro ou fora do prazo). */
  porJustificar: AlertaDia[];
  /** Dias de calendário que restam à justificação mais urgente dentro do prazo; `null` se nenhuma está dentro do prazo. */
  menorPrazoDias: number | null;
  pendentes: JustificacaoPicagem[];
  aceites: JustificacaoPicagem[];
  recusadas: JustificacaoPicagem[];
  /** O que a pessoa tem para fazer agora: os alertas ainda dentro do prazo. */
  porFazer: number;
  loading: boolean;
  /** A leitura falhou (rede, timeout): não é o mesmo que «não há nada». */
  erro: boolean;
  /** A base recusou a leitura a quem consulta: também não é «não há nada». */
  recusado: boolean;
}

/** Só estes dois desvios são «falha de marcação»: o resto (horas sem turno, falta coberta por ausência) tem outro tratamento. */
const TIPO_DO_ALERTA: Partial<Record<TipoDesvio, TipoAlerta>> = {
  planeado_sem_realizado: "planeado_sem_realizado",
  pendente_par: "pendente_par",
};

/** O dia ISO `dias` antes de `hoje`, sem passar pelo fuso. */
export function diaIsoAntes(hoje: string, dias: number): string {
  const [ano, mes, dia] = hoje.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia - dias)).toISOString().slice(0, 10);
}

/** Os desvios de UMA pessoa que são falhas de marcação, como alertas do dia. Função pura. */
export function alertasDeDesvios(desvios: readonly Desvio[], pessoaId: string): AlertaDia[] {
  return desvios.flatMap((d, indice) => {
    const tipo = TIPO_DO_ALERTA[d.tipo];
    if (!tipo || d.pessoa_id !== pessoaId) return [];
    return [{
      // A base não dá id ao desvio: o par pessoa|dia|tipo|referência|posição chega para a chave da linha.
      id: [d.pessoa_id, d.data, d.tipo, d.referencia_id ?? d.planeado_id ?? "", d.hora_inicio ?? "", indice].join("|"),
      pessoaId: d.pessoa_id,
      data: d.data,
      tipo,
      horaInicio: d.hora_inicio,
      horaFim: d.hora_fim,
      minutos: d.minutos,
      distanciaM: null,
      estado: "pendente" as const,
      motivo: null,
      tratadoPor: null,
      tratadoEm: null,
    }];
  });
}

/** O resumo pronto a mostrar: os alertas, o prazo mais urgente e quantos há dentro do prazo. Função pura. */
export function resumoDosAlertas(
  alertas: readonly AlertaDia[],
  hoje: string,
  /** O fim do período da folha que contém o dia (obrigatório: sem ele não há prazo). */
  prazoDe: PrazoDe,
): Pick<JustificacoesDaPessoa, "porJustificar" | "menorPrazoDias" | "porFazer"> {
  const dentro = alertas.filter((a) => situacaoDoPrazo(a, hoje, prazoDe) === "dentro_do_prazo");
  return {
    porJustificar: [...alertas].sort((a, b) => b.data.localeCompare(a.data)),
    menorPrazoDias: dentro.length === 0 ? null : Math.min(...dentro.map((a) => diasRestantes(a.data, hoje, prazoDe))),
    porFazer: dentro.length,
  };
}

const SEM_ENVIADAS: JustificacaoPicagem[] = [];

export function useJustificacoesDaPessoa(pessoaId: string): JustificacoesDaPessoa {
  const hoje = hojeIso();
  // O prazo é o fim do período da folha; só o período de hoje ainda se pode justificar, por isso a janela começa nele.
  const datasDoPrazo = useMemo(() => [hoje], [hoje]);
  const { prazoDe, periodoDe } = usePrazoJustificacao(datasDoPrazo);
  const inicioDoPeriodo = periodoDe(hoje).de;
  const janela = useMemo(() => ({ de: inicioDoPeriodo, ate: hoje }), [inicioDoPeriodo, hoje]);
  const { desvios, desviosErro, desviosRecusado, loading } = useAssiduidadeDaOrganizacao(janela);
  return useMemo(
    () => ({
      ...resumoDosAlertas(alertasDeDesvios(desvios, pessoaId), hoje, prazoDe),
      pendentes: SEM_ENVIADAS,
      aceites: SEM_ENVIADAS,
      recusadas: SEM_ENVIADAS,
      loading,
      erro: desviosErro,
      recusado: desviosRecusado,
    }),
    [desvios, pessoaId, hoje, prazoDe, loading, desviosErro, desviosRecusado],
  );
}
