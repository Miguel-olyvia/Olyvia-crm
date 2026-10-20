// A etapa, o próximo passo, o "atrasada" e a Parte do Quadro de uma pessoa, lidos dos REGISTOS dela (contactos, visitas, levantamentos) e dos
// negócios. Funções puras: o dia de hoje (AAAA-MM-DD) chega sempre por parâmetro. O formulário NÃO conta como contacto. Os 5 passos do
// percurso (Lead, Contacto, Visita, Negócio, Cliente) mantêm as chaves de `EtapaPessoa`; uma perdida ou encerrada é um estado à parte.
//
// Decisões por defeito (o utilizador não respondeu; reversíveis):
// 1. A pessoa volta à Parte 1 (abordagem) quando tem registos POR LIGAR posteriores ao último negócio, ou uma submissão resolvida
//    depois dele (`Pessoa.abordagemDesde`), ou é nova (nunca teve negócio).
// 2. Com um negócio aberto, a pessoa aparece só na Parte 2; os registos por ligar vêem-se na ficha.
// 3. Os registos feitos depois de o negócio existir ficam por ligar (ligam-se à mão na ficha do negócio).
import { faseDoNegocio, type FaseNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { somarDias } from "@/components/negocio-metas/novoNegocio";
import type { RegistosDaPessoa } from "@/components/negocio-metas/registosTipos";
import { emAtraso } from "@/components/negocio-metas/saudeNegocio";
import { ordenarVisitas } from "@/components/negocio-metas/visitasNegocio";
import { ehHistorico, type EtapaPessoa, type NegocioPessoa, type PapelPessoa, type Pessoa, type ResumoPessoa } from "./pessoasTipos";

export const ETAPAS: readonly EtapaPessoa[] = ["nova", "emContacto", "visitaMarcada", "qualificada", "cliente"];

/** A posição no percurso, de 0 (Lead) a 4 (Cliente). */
export const indiceEtapa = (etapa: EtapaPessoa): number => ETAPAS.indexOf(etapa);

const ORDEM_FASE: readonly FaseNegocio[] = ["orcamento", "proposta", "contrato", "ganho"];

/** O negócio aberto mais avançado (em empate, o primeiro); `null` sem negócios abertos. */
export function negocioEmFoco(abertos: readonly NegocioMes[]): NegocioMes | null {
  return abertos.reduce<NegocioMes | null>(
    (melhor, n) => (melhor === null || ORDEM_FASE.indexOf(faseDoNegocio(n)) > ORDEM_FASE.indexOf(faseDoNegocio(melhor)) ? n : melhor),
    null,
  );
}

/**
 * Os passos da coluna "Próximo passo". Um id tem sempre o mesmo texto, e a divergência com o "A fazer" (`processo/tiposProcesso.ts`)
 * mantém-se de propósito: num negócio sem orçamentos a coluna diz "fazerLevantamento" e o "A fazer" "criarOrcamento" (o negócio já
 * existe). Numa pessoa com visitas por fazer a coluna diz "fecharLevantamento" (o texto é «Marcar a visita como feita») e o "A fazer"
 * "marcarVisitaFeita" (abre o painel de visita e levantamento, onde o levantamento é opcional); com uma visita feita, os dois dizem
 * "criarNegocio". Não há passo obrigatório de levantamento.
 * `passosProcesso.test.ts` ("coerência com a coluna") fixa estes casos com exatidão.
 */
export type IdPasso =
  | "registarChamada" | "marcarVisita" | "fecharLevantamento" | "criarNegocio" | "fazerLevantamento"
  | "criarProposta" | "enviarProposta" | "esperarCliente" | "recolherAssinatura" | "criarContrato" | "ganharNegocio" | "nenhum";

export interface ProximoPasso {
  id: IdPasso;
  /** AAAA-MM-DD; `null` sem prazo. */
  prazo: string | null;
}

/** Só nos negócios da base (com `estadoReal`): a proposta está aceite e ainda não há contrato, por isso o passo é criá-lo. */
export const propostaAceiteSemContrato = (n: NegocioMes): boolean =>
  n.estadoReal === "aberto" && n.proposta?.estado === "aceite" && n.contrato === null;

/** Só nos negócios da base: o contrato está assinado, o negócio está aberto e a base diz que está pronto, por isso o passo é ganhá-lo. */
export const contratoAssinadoPronto = (n: NegocioMes): boolean =>
  n.estadoReal === "aberto" && n.contrato?.estado === "assinado" && n.prontoAGanhar === true;

/**
 * O passo de um negócio aberto. Nos negócios de exemplo, uma proposta aceite sem contrato (não existe nos dados) conta como "à espera";
 * nos da base, pede o contrato, e um contrato assinado e pronto pede o ganho.
 */
export function passoDoNegocio(n: NegocioMes): IdPasso {
  if (contratoAssinadoPronto(n)) return "ganharNegocio";
  if (propostaAceiteSemContrato(n)) return "criarContrato";
  const fase = faseDoNegocio(n);
  if (fase === "contrato") return "recolherAssinatura";
  if (fase === "proposta") return n.proposta?.estado === "rascunho" ? "enviarProposta" : "esperarCliente";
  if (n.orcamentos.length === 0) return "fazerLevantamento";
  return "criarProposta";
}

/** O próximo passo para a coluna da lista e o Resumo: o que `juntarPessoas` leu dos registos (ver `proximoPassoRegistos`). */
export const proximoPasso = (r: Pick<ResumoPessoa, "proximo">): ProximoPasso => r.proximo;

/** O índice (0 a 3) do passo em que uma lead está (o passo em que se perderia agora). */
export const passoAtual = (r: Pick<ResumoPessoa, "etapa">): number => Math.min(indiceEtapa(r.etapa), 3);

/** O índice (0 a 3) do passo em que a pessoa foi perdida; nas perdidas antigas, sem passo, o da etapa. */
export const passoDaPerdida = (r: Pick<ResumoPessoa, "pessoa" | "etapa">): number => r.pessoa.perdida?.passo ?? passoAtual(r);

/** Uma lead em curso cujos negócios estão todos perdidos: a ficha avisa e oferece "Marcar como perdida". */
export function todosNegociosPerdidos(r: Pick<ResumoPessoa, "pessoa" | "papel" | "negocios">): boolean {
  return r.papel === "lead" && !r.pessoa.perdida && r.negocios.length > 0 && r.negocios.every((n) => ehHistorico(n) && n.resultado === "perdido");
}

/** O que a etapa e a Parte do Quadro precisam de saber de uma pessoa. */
export interface EntradaRegistos {
  pessoa: Pessoa;
  papel: PapelPessoa;
  /** Todos os negócios da pessoa (do quadro e históricos). */
  negocios: readonly NegocioPessoa[];
  abertos: readonly NegocioMes[];
  /** Todos os registos da pessoa (ligados e por ligar). */
  registos: RegistosDaPessoa;
}

/** As colunas da Parte 1 do Quadro (a abordagem). */
export type ColunaAbordagem = "porContactar" | "contactado" | "visita";

/** O dia (AAAA-MM-DD) em que o negócio foi criado: hoje menos os dias desde que entrou. */
export const criadoEmDoNegocio = (negocio: NegocioMes, hoje: string): string => somarDias(hoje, -negocio.dias);

/** O dia em que foi criado o negócio mais recente; `null` sem negócios. */
function criadoEmDoUltimo(negocios: readonly NegocioPessoa[], hoje: string): string | null {
  return negocios.reduce<string | null>((m, n) => {
    const dia = criadoEmDoNegocio(n, hoje);
    return m === null || dia > m ? dia : m;
  }, null);
}

/**
 * Os registos que contam para a abordagem: por ligar a nenhum negócio e posteriores (dia estritamente depois) ao último negócio. Um
 * registo deixado por ligar antes de o negócio existir foi deixado de fora de propósito e não faz a pessoa voltar. Uma visita cancelada não conta.
 */
export function registosParaAbordagem(registos: RegistosDaPessoa, negocios: readonly NegocioPessoa[], hoje: string): RegistosDaPessoa {
  const limite = criadoEmDoUltimo(negocios, hoje);
  const conta = (r: { negocioId: string | null; data: string }): boolean => r.negocioId === null && (limite === null || r.data > limite);
  return {
    contactos: registos.contactos.filter(conta), visitas: registos.visitas.filter((v) => v.estado !== "cancelada" && conta(v)),
    levantamentos: registos.levantamentos.filter(conta),
  };
}

const visitasValidas = (r: RegistosDaPessoa) => r.visitas.filter((v) => v.estado !== "cancelada");
const fechada = (p: Pessoa): boolean => p.encerrada !== undefined || p.perdida !== undefined;

/** Há alguma coisa a fazer com a pessoa (um registo por ligar, ou uma submissão, ou ainda nada)? Decisão 1. */
function voltouAAbordagem(e: EntradaRegistos, hoje: string): boolean {
  if (e.negocios.length === 0) return true;
  const limite = criadoEmDoUltimo(e.negocios, hoje);
  const submissao = e.pessoa.abordagemDesde;
  if (submissao !== undefined && limite !== null && submissao > limite) return true;
  const r = registosParaAbordagem(e.registos, e.negocios, hoje);
  return r.contactos.length + r.visitas.length + r.levantamentos.length > 0;
}

/** Parte 1: a pessoa está em abordagem (sem negócio aberto, não encerrada nem perdida, e é nova ou voltou). */
export function emAbordagem(e: EntradaRegistos, hoje: string): boolean {
  if (fechada(e.pessoa) || e.abertos.length > 0) return false;
  return voltouAAbordagem(e, hoje);
}

/** A coluna da Parte 1 em que a pessoa cai; `null` fora da abordagem (então está na Parte 2, ou em nenhuma). */
export function colunaDaPessoa(e: EntradaRegistos, hoje: string): ColunaAbordagem | null {
  if (!emAbordagem(e, hoje)) return null;
  const r = registosParaAbordagem(e.registos, e.negocios, hoje);
  if (visitasValidas(r).length > 0) return "visita";
  return r.contactos.length > 0 ? "contactado" : "porContactar";
}

/**
 * Cliente se tem negócio ganho; "Negócio" se tem um aberto; senão Lead, Contacto ou Visita pelos registos por ligar. Uma pessoa sem
 * nada de novo que só tem negócios terminados fica em Contacto (a menos que tenha voltado: submissão resolvida).
 */
export function etapaDosRegistos(e: EntradaRegistos, hoje: string): EtapaPessoa {
  if (e.papel === "cliente") return "cliente";
  if (e.abertos.length > 0) return "qualificada";
  const r = registosParaAbordagem(e.registos, e.negocios, hoje);
  if (visitasValidas(r).length > 0) return "visitaMarcada";
  if (r.contactos.length > 0) return "emContacto";
  return voltouAAbordagem(e, hoje) ? "nova" : "emContacto";
}

/** O dia mais cedo entre a chamada agendada e as visitas por fazer (as que contam para a abordagem); `null` sem nenhum. */
export function proximoContactoRegistos(e: EntradaRegistos, hoje: string): string | null {
  const r = registosParaAbordagem(e.registos, e.negocios, hoje);
  const dias = [e.pessoa.proximoContacto, ...r.visitas.filter((v) => v.estado === "porFazer").map((v) => v.data || null)]
    .filter((d): d is string => typeof d === "string" && d !== "");
  return dias.length === 0 ? null : dias.reduce((cedo, d) => (d < cedo ? d : cedo));
}

/** A primeira visita por fazer que conta para a abordagem, por ordem cronológica; `undefined` sem nenhuma. */
function primeiraVisitaPorFazer(e: EntradaRegistos, hoje: string) {
  const r = registosParaAbordagem(e.registos, e.negocios, hoje);
  return ordenarVisitas(r.visitas).find((v) => v.estado === "porFazer");
}

/**
 * O próximo contacto vem de uma visita por fazer (e não de uma chamada agendada): há uma visita no dia mais cedo, que pode ser também
 * o dia da chamada. É o caso em que «Adiar» não tem nada a mover (as visitas têm o seu ecrã, «Alterar visita»).
 */
export function proximoContactoVemDeVisitaRegistos(e: EntradaRegistos, hoje: string): boolean {
  const dia = proximoContactoRegistos(e, hoje);
  const r = registosParaAbordagem(e.registos, e.negocios, hoje);
  return dia !== null && r.visitas.some((v) => v.estado === "porFazer" && v.data === dia);
}

/** A hora do próximo contacto: a da chamada agendada, se é ela o dia mais cedo, ou a da primeira visita por fazer desse dia; senão `undefined`. */
export function horaDoProximoContactoRegistos(e: EntradaRegistos, hoje: string): string | undefined {
  const dia = proximoContactoRegistos(e, hoje);
  if (dia === null) return undefined;
  if (e.pessoa.proximoContacto === dia && e.pessoa.proximoHora) return e.pessoa.proximoHora;
  const visita = primeiraVisitaPorFazer(e, hoje);
  return visita?.data === dia && visita.hora !== "" ? visita.hora : undefined;
}

/** Lead: o próximo contacto anterior a hoje. Cliente: só com um negócio aberto em atraso. Quem está encerrada ou perdida, nunca. */
export function estaAtrasadaRegistos(e: EntradaRegistos, hoje: string): boolean {
  if (fechada(e.pessoa)) return false;
  if (e.papel === "cliente") return e.abertos.some((n) => emAtraso(n, hoje));
  const dia = proximoContactoRegistos(e, hoje);
  return dia !== null && dia < hoje;
}

/**
 * O próximo passo para a coluna da lista e o Resumo. Encerrada ou perdida, ou fora da abordagem e sem negócio, não tem nenhum.
 * Com negócio aberto manda o mais avançado; senão manda o registo mais avançado: visita feita (criar o negócio), visita por fazer
 * (fechar o levantamento), contacto (marcar a visita) ou nada (registar a chamada).
 */
export function proximoPassoRegistos(e: EntradaRegistos, hoje: string): ProximoPasso {
  const nenhum: ProximoPasso = { id: "nenhum", prazo: null };
  if (fechada(e.pessoa)) return nenhum;
  const foco = negocioEmFoco(e.abertos as NegocioMes[]);
  if (foco) return { id: passoDoNegocio(foco), prazo: foco.proximoPrazo };
  if (!emAbordagem(e, hoje)) return nenhum;
  const r = registosParaAbordagem(e.registos, e.negocios, hoje);
  const prazo = proximoContactoRegistos(e, hoje);
  if (r.visitas.some((v) => v.estado === "feita")) return { id: "criarNegocio", prazo };
  if (r.visitas.some((v) => v.estado === "porFazer")) return { id: "fecharLevantamento", prazo };
  return { id: r.contactos.length > 0 ? "marcarVisita" : "registarChamada", prazo };
}
