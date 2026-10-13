// As ações da ficha da pessoa, em memória: funções puras e imutáveis. O dia de hoje (AAAA-MM-DD) chega sempre
// por parâmetro e nada lê o relógio. Um id que não existe (ou uma ação que não se aplica) devolve o próprio estado.
import { DIAS_DO_PASSO, RESULTADOS_ATENDIDOS } from "./opcoesPessoa";
import type {
  EstadoPessoas, EtapaPessoa, ItemAtividade, MotivoPerda, PapelPessoa, PassoChamada, Pessoa, ResultadoContacto,
} from "./pessoasTipos";

/** A parte do estado que as ações mudam. */
export type EstadoAcoes = Pick<EstadoPessoas, "pessoas" | "atividade" | "contactadas">;

export interface DadosChamada {
  resultado: ResultadoContacto;
  nota: string;
  passo: PassoChamada;
  hoje: string;
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

/**
 * Regista uma chamada: zera os dias desde o último contacto e define o próximo. Só um resultado "atendeu" tira a pessoa
 * de "Voltou a contactar" (quem não atendeu, ou tinha o número errado, ainda não foi respondida).
 */
export function registarChamada<E extends EstadoAcoes>(estado: E, id: string, dados: DadosChamada): E {
  if (!existe(estado, id)) return estado;
  const dias = DIAS_DO_PASSO[dados.passo];
  const respondeu = RESULTADOS_ATENDIDOS.includes(dados.resultado);
  const item: ItemAtividade = {
    id: novoId(estado, "chamada"), pessoaId: id, tipo: "chamada", titulo: "", chaveTitulo: `pessoasPagina.result.${dados.resultado}`,
    detalhe: dados.nota.trim(), quando: dados.hoje, exemplo: false,
  };
  return {
    ...estado,
    pessoas: mudarPessoa(estado.pessoas, id, (p) => ({
      ...p,
      ultimoContactoDias: 0,
      resultadoContacto: dados.resultado,
      proximoContacto: dias === null ? null : somarDias(dados.hoje, dias),
    })),
    atividade: [item, ...estado.atividade],
    contactadas: respondeu && !estado.contactadas.includes(id) ? [...estado.contactadas, id] : estado.contactadas,
  };
}

/** Adia o próximo contacto: hoje mais 1, 3 ou 7 dias. */
export function adiar<E extends EstadoAcoes>(estado: E, id: string, dias: 1 | 3 | 7, hoje: string): E {
  if (!existe(estado, id)) return estado;
  return { ...estado, pessoas: mudarPessoa(estado.pessoas, id, (p) => ({ ...p, proximoContacto: somarDias(hoje, dias) })) };
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

/** Marca uma lead em curso como perdida. Clientes e leads já perdidas ficam como estão (a etapa "cliente" é a dos clientes). */
export function perder<E extends EstadoAcoes>(estado: E, id: string, motivo: MotivoPerda, hoje: string): E {
  const alvo = estado.pessoas.find((p) => p.id === id);
  if (!alvo || alvo.etapa === "cliente" || alvo.perdida) return estado;
  const item: ItemAtividade = {
    id: novoId(estado, "perda"), pessoaId: id, tipo: "historico", titulo: "", chaveTitulo: "pessoasPagina.activity.lost",
    detalhe: "", chaveDetalhe: `pessoasPagina.lost.${motivo}`, quando: hoje, exemplo: false,
  };
  return {
    ...estado,
    pessoas: mudarPessoa(estado.pessoas, id, (p) => ({ ...p, perdida: { motivo, data: hoje }, proximoContacto: null })),
    atividade: [item, ...estado.atividade],
  };
}

/** A atividade de exemplo e a nova numa só lista, da mais recente para a mais antiga (em empate, as novas primeiro). */
export function juntarAtividade(semente: readonly ItemAtividade[], novas: readonly ItemAtividade[]): ItemAtividade[] {
  return [...novas, ...semente].sort((a, b) => b.quando.localeCompare(a.quando));
}

export type SeloCabecalho = { tipo: "papel"; valor: PapelPessoa } | { tipo: "etapa"; valor: EtapaPessoa };

/** Os selos de papel e etapa: a etapa sai quando só repete o papel (cliente na etapa "cliente"). */
export function selosCabecalho(papel: PapelPessoa, etapa: EtapaPessoa): SeloCabecalho[] {
  const papelSelo: SeloCabecalho = { tipo: "papel", valor: papel };
  return etapa === papel ? [papelSelo] : [papelSelo, { tipo: "etapa", valor: etapa }];
}

export { ligacoes, type LigacoesContacto } from "@/components/ficha-comum/ligacoesContacto";
