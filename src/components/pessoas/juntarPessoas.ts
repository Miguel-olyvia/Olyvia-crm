// Junta cada pessoa com os seus negócios. Funções puras: o dia de hoje (AAAA-MM-DD)
// chega sempre por parâmetro e nada lê o relógio. O papel não é guardado: é cliente quem
// tem um negócio ganho, e lead quem não tem.
import { faseDoNegocio, isNegocioGanho, valorDoNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { ORDEM_SAUDE, saudeDoNegocio } from "@/components/negocio-metas/saudeNegocio";
import { registosDaPessoa } from "@/components/negocio-metas/acoesRegistos";
import { REGISTOS_VAZIOS, type EstadoRegistos, type RegistosDaPessoa } from "@/components/negocio-metas/registosTipos";
import {
  colunaDaPessoa, estaAtrasadaRegistos, etapaDosRegistos, horaDoProximoContactoRegistos, negocioEmFoco, proximoContactoRegistos,
  proximoContactoVemDeVisitaRegistos, proximoPassoRegistos, registosParaAbordagem,
} from "./etapaPessoa";
import {
  ehHistorico, type EtapaPessoa, type NegocioPessoa, type PapelPessoa, type ParteQuadro, type Pessoa, type ResumoPessoa,
} from "./pessoasTipos";

/** Ganho: contrato assinado no quadro do mês, ou resultado "ganho" num histórico. */
export const estaGanho = (n: NegocioPessoa): boolean => (ehHistorico(n) ? n.resultado === "ganho" : isNegocioGanho(n));

/** Aberto: no quadro do mês e ainda sem contrato assinado. Os históricos já terminaram. */
export const estaAberto = (n: NegocioPessoa): n is NegocioMes => !ehHistorico(n) && !isNegocioGanho(n);

/** O pior negócio aberto: o de saúde mais grave (a primeira de ORDEM_SAUDE); em empate, o primeiro. */
function piorAberto(abertos: NegocioMes[], hoje: string): NegocioMes | null {
  let pior: NegocioMes | null = null;
  let piorIndice = Infinity;
  for (const n of abertos) {
    const indice = ORDEM_SAUDE.indexOf(saudeDoNegocio(n, hoje));
    if (indice < piorIndice) {
      pior = n;
      piorIndice = indice;
    }
  }
  return pior;
}

/** O papel (cliente se tem um negócio ganho) e os negócios abertos de uma pessoa, a partir dos negócios dela. */
export function papelEAbertos(negocios: readonly NegocioPessoa[]): { papel: PapelPessoa; abertos: NegocioMes[] } {
  return { papel: negocios.some(estaGanho) ? "cliente" : "lead", abertos: negocios.filter(estaAberto) };
}

/** O que a etapa, o atraso, o próximo passo e a Parte do Quadro valem, lidos dos registos e dos negócios da pessoa. */
export function derivar(pessoa: Pessoa, papel: PapelPessoa, negocios: NegocioPessoa[], abertos: NegocioMes[], registos: RegistosDaPessoa, hoje: string) {
  const entrada = { pessoa, papel, negocios, abertos, registos };
  const coluna = colunaDaPessoa(entrada, hoje);
  return {
    atrasada: estaAtrasadaRegistos(entrada, hoje), etapa: etapaDosRegistos(entrada, hoje), porLigar: registosParaAbordagem(registos, negocios, hoje),
    parte: (coluna !== null ? "abordagem" : abertos.length > 0 ? "negocios" : "nenhuma") as ParteQuadro, coluna,
    proximo: proximoPassoRegistos(entrada, hoje),
    proximoContacto: proximoContactoRegistos(entrada, hoje), proximoHora: horaDoProximoContactoRegistos(entrada, hoje),
    proximoDeVisita: proximoContactoVemDeVisitaRegistos(entrada, hoje),
  };
}

/**
 * O que a base já sabe de uma pessoa (ficha real). Com isto, `resumir` não infere o papel («tem negócio ganho») nem os abertos («sem
 * contrato assinado»): um negócio aberto com contrato assinado fica nos abertos, e um cliente sem negócio ganho continua cliente.
 */
export interface BaseResumo {
  papel: PapelPessoa;
  abertos: NegocioMes[];
  etapa: EtapaPessoa;
}

/** O resumo de uma pessoa. Sem `base` infere tudo dos negócios e dos registos (o exemplo); com `base`, o papel, os abertos e a etapa vêm dela. */
export function resumir(pessoa: Pessoa, negocios: NegocioPessoa[], registos: RegistosDaPessoa, hoje: string, base?: BaseResumo): ResumoPessoa {
  const { papel, abertos } = base ?? papelEAbertos(negocios);
  const pior = piorAberto(abertos, hoje);
  const foco = negocioEmFoco(abertos);
  return {
    pessoa,
    papel,
    negocios,
    abertos,
    registos,
    ...derivar(pessoa, papel, negocios, abertos, registos, hoje),
    ...(base ? { etapa: base.etapa } : {}),
    emJogo: abertos.reduce((soma, n) => soma + valorDoNegocio(n), 0),
    formulario: pessoa.formulario ?? null,
    faseEtapa: foco ? faseDoNegocio(foco) : null,
    piorAberto: pior,
    saude: pior ? saudeDoNegocio(pior, hoje) : null,
    semNegocio: negocios.length === 0,
    soHistorico: negocios.length > 0 && negocios.every((n) => !estaAberto(n) && !estaGanho(n)),
  };
}

/**
 * Junta cada pessoa com os seus negócios e os REGISTOS dela (contactos, visitas, levantamentos): a etapa, o "atrasada", o próximo passo
 * e a Parte do Quadro saem daí. Sem `registos`, ninguém tem nenhum.
 */
export function juntarPessoas(
  pessoas: readonly Pessoa[], negocios: readonly NegocioPessoa[], hoje: string, registos: EstadoRegistos = REGISTOS_VAZIOS,
): ResumoPessoa[] {
  return pessoas.map((p) => resumir(p, negocios.filter((n) => n.pessoaId === p.id), registosDaPessoa(registos, p.id), hoje));
}
