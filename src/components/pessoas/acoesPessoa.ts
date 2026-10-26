// As ações da ficha da pessoa, em memória: funções puras e imutáveis. O dia de hoje (AAAA-MM-DD) chega sempre
// por parâmetro e nada lê o relógio. Um id que não existe (ou uma ação que não se aplica) devolve o próprio estado.
import type { EntradaVisita } from "@/hooks/pessoas/visitaDb";
import { encerrarAbordagem } from "./acoesEncerrar";
import { detalheDaVisitaDaChamada, errosDiaHora, exigeDiaHora, textoAgenda } from "./chamadaPassos";
import { indiceEtapa } from "./etapaPessoa";
import { destinoInicial, moradaDaLead, validarDestino, type DestinoVisita } from "./moradaVisita";
import { DIAS_DO_PASSO, RESULTADOS_ATENDIDOS } from "./opcoesPessoa";
import type {
  EstadoPessoas, ItemAtividade, MotivoEncerramento, MotivoPerda, PapelPessoa, PassoChamada, Pessoa, ResultadoContacto,
} from "./pessoasTipos";

/**
 * A parte do estado que as ações mudam: as pessoas, a atividade e quem já foi contactada. O contacto e a visita que uma chamada deixa
 * são da pessoa e vivem no store dos registos (ver `chamadaPassos.ts`), não aqui.
 */
export type EstadoAcoes = Pick<EstadoPessoas, "pessoas" | "atividade" | "contactadas">;

export interface DadosChamada {
  resultado: ResultadoContacto;
  nota: string;
  passo: PassoChamada;
  hoje: string;
  /** AAAA-MM-DD e HH:MM da visita ou da próxima chamada (só nos passos que os pedem). */
  data?: string;
  hora?: string;
  /** Onde é a visita, escolhido no formulário: a morada da lead ou outra (ver `moradaVisita.ts`). */
  destinoVisita?: DestinoVisita;
  /** Só a ficha real, no passo `marcarVisita`: a visita completa (quadro, recursos, duração, morada) que `useAcoesVisita` marca. O exemplo não a usa. */
  visita?: EntradaVisita;
  /** O motivo, no passo "perder" (que encerra a abordagem, «sem interesse»): um da lista ou «outro» com o texto em `motivoOutro`. */
  motivo?: MotivoEncerramento;
  motivoOutro?: string;
  /** A pessoa tem um negócio aberto: não há abordagem a encerrar (quem chama conhece os negócios). */
  temNegocioAberto?: boolean;
  /** Só o Pipeline: o negócio do cartão de onde se registou a chamada; o contacto (e a visita) ficam ligados a ele. */
  negocioId?: string;
}

const MS_DIA = 86_400_000;

/** Soma dias a um dia AAAA-MM-DD (em UTC, sem fusos nem relógio). */
export function somarDias(dia: string, dias: number): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, d) + dias * MS_DIA).toISOString().slice(0, 10);
}

const mudarPessoa = (pessoas: Pessoa[], id: string, mudar: (p: Pessoa) => Pessoa): Pessoa[] =>
  pessoas.map((p) => (p.id === id ? mudar(p) : p));

const existe = (estado: EstadoAcoes, id: string): boolean => estado.pessoas.some((p) => p.id === id);

const novoId = (estado: EstadoAcoes, tipo: string): string => `novo-${tipo}-${estado.atividade.length + 1}`;

/** O dia (e a hora) do próximo contacto que a chamada deixa: o escolhido, ou hoje mais os dias do passo; sem nenhum, `null`. */
function proximoDaChamada(d: DadosChamada): { dia: string | null; hora: string | undefined } {
  if (d.passo === "ligarData") return { dia: d.data ?? null, hora: d.hora };
  const dias = DIAS_DO_PASSO[d.passo];
  return { dia: dias === null ? null : somarDias(d.hoje, dias), hora: undefined };
}

/** A chamada em si: o último contacto, o resultado, o próximo contacto e a linha na atividade. */
function chamadaBase<E extends EstadoAcoes>(estado: E, id: string, d: DadosChamada): E {
  const respondeu = RESULTADOS_ATENDIDOS.includes(d.resultado);
  const proximo = proximoDaChamada(d);
  const item: ItemAtividade = {
    id: novoId(estado, "chamada"), pessoaId: id, tipo: "chamada", titulo: "", chaveTitulo: `pessoasPagina.result.${d.resultado}`,
    detalhe: d.nota.trim(), quando: d.hoje, exemplo: false,
  };
  return {
    ...estado,
    pessoas: mudarPessoa(estado.pessoas, id, (p) => ({
      ...p, ultimoContactoDias: 0, resultadoContacto: d.resultado, proximoContacto: proximo.dia, proximoHora: proximo.hora,
    })),
    atividade: [item, ...estado.atividade],
    contactadas: respondeu && !estado.contactadas.includes(id) ? [...estado.contactadas, id] : estado.contactadas,
  };
}

/** A visita pede um sítio (a morada da lead, ou a que se escolheu) e não se marca a uma pessoa perdida ou com a abordagem encerrada. */
function visitaAplicavel(alvo: Pessoa | undefined, d: DadosChamada): boolean {
  if (!alvo || alvo.perdida || alvo.encerrada) return false;
  const lead = moradaDaLead(alvo);
  return validarDestino(d.destinoVisita ?? destinoInicial(lead), lead) === null;
}

/** O passo só se aplica com o que pede: dia e hora válidos, a visita com sítio e, para encerrar, o motivo (e nenhum negócio aberto). */
function passoAplicavel(estado: EstadoAcoes, id: string, d: DadosChamada): boolean {
  if (exigeDiaHora(d.passo)) {
    const erros = errosDiaHora(d.data ?? "", d.hora ?? "", d.hoje);
    if (erros.data || erros.hora) return false;
  }
  const alvo = estado.pessoas.find((p) => p.id === id);
  if (d.passo === "marcarVisita") return visitaAplicavel(alvo, d);
  if (d.passo !== "perder") return true;
  return d.motivo !== undefined && !d.temNegocioAberto && !alvo?.encerrada && !alvo?.perdida
    && (d.motivo !== "outro" || (d.motivoOutro ?? "").trim() !== "");
}

/** O que o passo escolhido faz a seguir à chamada: marca a visita (na atividade), agenda a chamada ou encerra a abordagem. */
function aplicarPasso<E extends EstadoAcoes>(estado: E, id: string, d: DadosChamada): E {
  const quando = textoAgenda(d.data ?? "", d.hora ?? "");
  if (d.passo === "marcarVisita") {
    const alvo = estado.pessoas.find((p) => p.id === id);
    const item: ItemAtividade = {
      id: novoId(estado, "visita"), pessoaId: id, tipo: "historico", titulo: "", chaveTitulo: "pessoasPagina.activity.visitBooked",
      detalhe: alvo ? detalheDaVisitaDaChamada(alvo, d) : quando, quando: d.hoje, exemplo: false,
    };
    return { ...estado, atividade: [item, ...estado.atividade] };
  }
  if (d.passo === "ligarData") {
    const item: ItemAtividade = {
      id: novoId(estado, "agenda"), pessoaId: id, tipo: "historico", titulo: "", chaveTitulo: "pessoasPagina.activity.callScheduled",
      detalhe: quando, quando: d.hoje, exemplo: false,
    };
    return { ...estado, atividade: [item, ...estado.atividade] };
  }
  if (d.passo !== "perder" || !d.motivo) return estado;
  return encerrarAbordagem(estado, id, {
    resultado: "semInteresse", motivo: d.motivo, motivoOutro: d.motivoOutro, hoje: d.hoje, temNegocioAberto: d.temNegocioAberto,
  });
}

/**
 * Regista uma chamada: zera os dias desde o último contacto e define o próximo. Só um resultado "atendeu" tira a pessoa
 * de "Voltou a contactar" (quem não atendeu, ou tinha o número errado, ainda não foi respondida). O passo escolhido
 * acrescenta o seu efeito (visita marcada, chamada agendada ou abordagem encerrada) e a sua linha na atividade; se não se aplica
 * (falta o dia ou a hora, ou o motivo), o estado fica como está. O contacto e a visita em si regista-os quem chama (ver `chamadaPassos.ts`).
 */
export function registarChamada<E extends EstadoAcoes>(estado: E, id: string, dados: DadosChamada): E {
  if (!chamadaAplicavel(estado, id, dados)) return estado;
  return aplicarPasso(chamadaBase(estado, id, dados), id, dados);
}

/** A chamada pode registar-se (a pessoa existe e o passo tem o que pede)? É a pergunta que `registarChamada` faz antes de mudar o estado. */
export const chamadaAplicavel = (estado: EstadoAcoes, id: string, dados: DadosChamada): boolean =>
  existe(estado, id) && passoAplicavel(estado, id, dados);

/**
 * Adia a chamada agendada: o próximo contacto passa a hoje mais 1, 3 ou 7 dias. As visitas não se mexem (têm o seu ecrã, «Alterar
 * visita»): quando o próximo contacto é uma visita (`vemDeVisita`, que quem chama sabe pelos registos) não há nada a adiar, e não se cria
 * uma chamada agendada que ninguém marcou.
 */
export function adiar<E extends EstadoAcoes>(estado: E, id: string, dias: 1 | 3 | 7, hoje: string, vemDeVisita = false): E {
  const pessoa = estado.pessoas.find((p) => p.id === id);
  if (!pessoa || vemDeVisita) return estado;
  const dia = somarDias(hoje, dias);
  return {
    ...estado,
    pessoas: mudarPessoa(estado.pessoas, id, (p) => ({ ...p, proximoContacto: dia })),
  };
}

/** Uma nota escrita à mão: entra na atividade. */
export function juntarNota<E extends EstadoAcoes>(estado: E, id: string, texto: string, hoje: string): E {
  const limpo = texto.trim();
  if (!existe(estado, id) || limpo === "") return estado;
  const item: ItemAtividade = {
    id: novoId(estado, "nota"), pessoaId: id, tipo: "nota", titulo: "", chaveTitulo: "pessoasPagina.activity.noteAdded",
    detalhe: limpo, quando: hoje, exemplo: false,
  };
  return { ...estado, atividade: [item, ...estado.atividade] };
}

/**
 * Marca uma lead como perdida, em qualquer passo do percurso antes de cliente (Lead, Contacto, Visita ou Negócio), e
 * guarda o passo (índice 0 a 3). `contexto` vem de quem chama e conhece os registos e os negócios: `passo` é o índice da etapa
 * efetiva na altura e `papel` diz se é cliente. Um cliente (pelo papel, ou pelo passo 4) e uma lead já perdida ficam como estão,
 * sem alterações.
 */
export interface ContextoPerda {
  passo: number;
  papel?: PapelPessoa;
}

export function perder<E extends EstadoAcoes>(estado: E, id: string, motivo: MotivoPerda, hoje: string, contexto: ContextoPerda): E {
  const alvo = estado.pessoas.find((p) => p.id === id);
  const indice = contexto.passo;
  if (!alvo || alvo.perdida || contexto.papel === "cliente" || indice >= indiceEtapa("cliente")) return estado;
  const item: ItemAtividade = {
    id: novoId(estado, "perda"), pessoaId: id, tipo: "historico", titulo: "", chaveTitulo: "pessoasPagina.activity.lost",
    detalhe: "", chaveDetalhe: `pessoasPagina.lost.${motivo}`, quando: hoje, exemplo: false,
  };
  return {
    ...estado,
    pessoas: mudarPessoa(estado.pessoas, id, (p) => ({ ...p, perdida: { motivo, data: hoje, passo: Math.max(0, indice) }, proximoContacto: null, proximoHora: undefined })),
    atividade: [item, ...estado.atividade],
  };
}

/** Reativa uma lead perdida: limpa a perda, repõe o próximo contacto para amanhã e regista-o na atividade. Só vale em perdidas. */
export function reativar<E extends EstadoAcoes>(estado: E, id: string, hoje: string): E {
  const alvo = estado.pessoas.find((p) => p.id === id);
  if (!alvo?.perdida) return estado;
  const item: ItemAtividade = {
    id: novoId(estado, "reativar"), pessoaId: id, tipo: "historico", titulo: "", chaveTitulo: "pessoasPagina.activity.reactivated",
    detalhe: "", chaveDetalhe: `pessoasPagina.lost.${alvo.perdida.motivo}`, quando: hoje, exemplo: false,
  };
  return {
    ...estado,
    pessoas: mudarPessoa(estado.pessoas, id, ({ perdida: _perdida, ...resto }) => ({ ...resto, proximoContacto: somarDias(hoje, 1) })),
    atividade: [item, ...estado.atividade],
  };
}

/** A atividade de exemplo e a nova numa só lista, da mais recente para a mais antiga (em empate, as novas primeiro). */
export function juntarAtividade(semente: readonly ItemAtividade[], novas: readonly ItemAtividade[]): ItemAtividade[] {
  return [...novas, ...semente].sort((a, b) => b.quando.localeCompare(a.quando));
}

export { ligacoes, type LigacoesContacto } from "@/components/ficha-comum/ligacoesContacto";
