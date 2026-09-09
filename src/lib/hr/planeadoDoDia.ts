/**
 * Que intervalos e que a pessoa TINHA para trabalhar num dia concreto.
 *
 * PORQUE E QUE ISTO NAO E UM `filter` DE UMA LINHA
 * ------------------------------------------------
 * `pessoas_horario_planeado` guarda duas coisas na mesma tabela: o padrao
 * semanal (`dia_semana` preenchido, `data` nula) e as excepcoes por data
 * (`data` preenchida). Uma excepcao NAO se soma ao padrao: substitui-o
 * inteiro nesse dia, incluindo quando a excepcao e "nao trabalha". Somar as
 * duas dava um dia com o turno normal MAIS o turno especial, e o mapa do mes
 * mostrava o dobro das horas planeadas.
 *
 * A validade (`valido_de` / `valido_ate`) tambem se respeita: uma linha que
 * ainda nao entrou em vigor, ou que ja saiu, nao conta -- e o que permite
 * mudar o horario de alguem a partir de uma data sem reescrever o passado.
 *
 * E SEMPRE UMA LISTA
 * ------------------
 * Um dia com dois locais devolve duas linhas, e um dia normal devolve uma. O
 * dia com um intervalo so nao e o caso normal com os outros escondidos: e a
 * mesma lista com um elemento. As senhoras da limpeza -- 09-14 numa empresa,
 * 15-19 noutra, e semanas sem padrao -- sao o caso central deste ficheiro.
 */
import { minutosDe } from "@/lib/hr/horario";
import type { HorarioPlaneado } from "@/types/hr";

/** 0 = domingo .. 6 = sabado, no calendario civil e sem passar por UTC. */
export function diaSemanaDe(iso: string): number {
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (!ano || !mes || !dia) return 0;
  return new Date(ano, mes - 1, dia).getDay();
}

function dentroDaValidade(linha: HorarioPlaneado, iso: string): boolean {
  if (linha.valido_de && iso < linha.valido_de) return false;
  if (linha.valido_ate && iso > linha.valido_ate) return false;
  return true;
}

/**
 * Os intervalos planeados de um dia, ordenados pela hora de inicio.
 *
 * Devolve lista vazia quando a pessoa nao trabalha nesse dia -- e "nao
 * trabalha" e uma informacao, nao a ausencia dela: quem chama distingue os
 * dois pelo `naoTrabalha` de `leituraDoPlaneado`.
 */
export function planeadoDoDia(
  linhas: readonly HorarioPlaneado[],
  iso: string,
): HorarioPlaneado[] {
  return leituraDoPlaneado(linhas, iso).intervalos;
}

export interface LeituraDoPlaneado {
  intervalos: HorarioPlaneado[];
  /** Ha uma linha para este dia e ela diz explicitamente que nao se trabalha. */
  naoTrabalha: boolean;
  /** O dia foi resolvido por uma excepcao com data, e nao pelo padrao semanal. */
  porExcepcao: boolean;
}

export function leituraDoPlaneado(
  linhas: readonly HorarioPlaneado[],
  iso: string,
): LeituraDoPlaneado {
  const validas = linhas.filter((linha) => dentroDaValidade(linha, iso));

  const excepcoes = validas.filter((linha) => linha.data === iso);
  const candidatas =
    excepcoes.length > 0
      ? excepcoes
      : validas.filter((linha) => linha.data === null && linha.dia_semana === diaSemanaDe(iso));

  const naoTrabalha = candidatas.length > 0 && candidatas.every((linha) => linha.nao_trabalha);

  const intervalos = candidatas
    .filter((linha) => !linha.nao_trabalha && linha.hora_inicio && linha.hora_fim)
    .sort((a, b) => {
      const porHora = (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? "");
      return porHora !== 0 ? porHora : a.ordem - b.ordem;
    });

  return { intervalos, naoTrabalha, porExcepcao: excepcoes.length > 0 };
}

/**
 * O intervalo planeado que contem uma hora -- o mesmo que a RPC de picar liga
 * a picagem.
 *
 * O fim e ABERTO: quem pica as 13:00 num turno 09:00-13:00 ja nao esta nele,
 * esta a comecar o seguinte. Fechar o fim punha a picagem no turno errado
 * sempre que dois intervalos se tocam, que e o dia com pausa ao almoco.
 */
export function planeadoQueContemHora(
  intervalos: readonly HorarioPlaneado[],
  hora: string,
): HorarioPlaneado | null {
  const minuto = minutosDe(hora);
  if (minuto === null) return null;
  for (const intervalo of intervalos) {
    const de = minutosDe(intervalo.hora_inicio);
    const ate = minutosDe(intervalo.hora_fim);
    if (de === null || ate === null) continue;
    if (minuto >= de && minuto < ate) return intervalo;
  }
  return null;
}
