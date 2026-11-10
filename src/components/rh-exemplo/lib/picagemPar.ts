/**
 * Lancar a ENTRADA e a SAIDA de uma vez (fila de trabalho do RH): a validacao e os momentos a gravar. Funcoes puras.
 *
 * A base nao tem uma RPC que grave as duas picagens numa so chamada (so `rpc_hr_picar`, uma picagem de cada vez); por isso
 * quem grava chama `picar` duas vezes, a entrada primeiro. Aqui valida-se ANTES de gravar nada, para nao deixar uma entrada
 * gravada por causa de uma saida que se ia recusar.
 */
import { minutosDeHora, type Resultado } from "@/components/rh-exemplo/lib/horarioTipos";

export interface DadosDoPar {
  /** O dia da entrada (AAAA-MM-DD). */
  dia: string;
  horaEntrada: string;
  horaSaida: string;
  /** O turno passa a meia-noite: so conta quando a saida e menor que a entrada. */
  saidaNoDiaSeguinte: boolean;
}

export interface MomentosDoPar {
  entrada: string;
  saida: string;
}

/** Uma saida menor que a entrada so pode ser no dia seguinte: e quando se oferece a caixa. */
export function saidaPrecisaDeDiaSeguinte(horaEntrada: string, horaSaida: string): boolean {
  const entrada = minutosDeHora(horaEntrada);
  const saida = minutosDeHora(horaSaida);
  return entrada !== null && saida !== null && saida < entrada;
}

function diaSeguinte(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * O momento e uma marca temporal completa. A hora escrita converte-se no fuso do NAVEGADOR (`new Date` sem fuso), igual ao
 * `PicagemSheet`; nao no da organizacao.
 */
const paraMomento = (dia: string, hora: string): string => new Date(`${dia}T${hora}:00`).toISOString();

export function momentosDoPar(dados: DadosDoPar): Resultado<MomentosDoPar> {
  if (!dados.dia) return { ok: false, erro: "hr.assiduidade.erro.semData" };
  const entrada = minutosDeHora(dados.horaEntrada);
  const saida = minutosDeHora(dados.horaSaida);
  if (entrada === null) return { ok: false, erro: "rhExemplo.pic.par.erro.semEntrada" };
  if (saida === null) return { ok: false, erro: "rhExemplo.pic.par.erro.semSaida" };
  const seguinte = dados.saidaNoDiaSeguinte && saida < entrada;
  if (!seguinte && saida <= entrada) return { ok: false, erro: "rhExemplo.pic.par.erro.saidaNaoPosterior" };
  return {
    ok: true,
    valor: {
      entrada: paraMomento(dados.dia, dados.horaEntrada),
      saida: paraMomento(seguinte ? diaSeguinte(dados.dia) : dados.dia, dados.horaSaida),
    },
  };
}
