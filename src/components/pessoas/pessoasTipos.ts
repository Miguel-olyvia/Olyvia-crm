// Tipos da página "Pessoas" (só dados de exemplo). O papel (lead ou cliente) NÃO é
// guardado: deriva dos negócios (ver `juntarPessoas.ts`). Os campos próprios desta
// página (origem, etapa, último contacto) são de exemplo e não existem noutro sítio.
import type { FaseNegocio, NegocioMes } from "@/components/negocio-metas/negocioMetas";
import type { SaudeNegocio } from "@/components/negocio-metas/saudeNegocio";

export type PapelPessoa = "lead" | "cliente";
export type EtapaPessoa = "nova" | "emContacto" | "visitaMarcada" | "qualificada" | "cliente";
export type OrigemPessoa = "site" | "formulario" | "campanha" | "indicacao" | "telefone";

export interface Pessoa {
  id: string;
  nome: string;
  contacto: { telefone: string | null; email: string | null };
  comercial: string;
  /** Campo de exemplo, só desta página. */
  origem: OrigemPessoa;
  /** Detalhe da origem (por exemplo o serviço do formulário); opcional. */
  origemDetalhe?: string;
  /** Campo de exemplo, só desta página. */
  etapa: EtapaPessoa;
  /** Campo de exemplo: dias desde o último contacto. */
  ultimoContactoDias: number;
  /** Campos de exemplo da ficha (todos opcionais): a empresa, a morada, o NIF e o resto. */
  empresa?: { nome: string; contacto?: string; nif?: string };
  morada?: { linha: string; cp: string; localidade: string };
  distrito?: string;
  nif?: string;
  qualificacao?: QualificacaoPessoa;
  /** O resultado da última chamada (ver `opcoesPessoa.ts`). */
  resultadoContacto?: ResultadoContacto;
  /** AAAA-MM-DD. */
  proximoContacto?: string | null;
  /** AAAA-MM-DD: cliente ou lead desde. */
  desde?: string;
  /** Marcada como perdida na ficha: o motivo e o dia (AAAA-MM-DD). */
  perdida?: { motivo: MotivoPerda; data: string };
}

export type QualificacaoPessoa = "MQL" | "SQL";
export type ResultadoContacto = "atendeuInteressado" | "atendeuMaisTarde" | "naoAtendeu" | "semInteresse" | "numeroErrado";
export type MotivoPerda = "preco" | "adiou" | "outraEmpresa" | "semResposta" | "naoProcurava";
export type PassoChamada = "ligarAmanha" | "ligarHoje" | "visitaOuOrcamento" | "nenhum";

export type TipoAtividade = "chamada" | "nota" | "email" | "historico";

/**
 * Uma linha da atividade de uma pessoa. `titulo` e `detalhe` são texto escrito à mão (nunca uma chave); quando o texto
 * é da aplicação, vão vazios e `chaveTitulo` / `chaveDetalhe` levam a chave de tradução. `quando` é AAAA-MM-DD;
 * `exemplo` é falso nos registos feitos nesta sessão.
 */
export interface ItemAtividade {
  id: string;
  pessoaId: string;
  tipo: TipoAtividade;
  titulo: string;
  detalhe: string;
  chaveTitulo?: string;
  chaveDetalhe?: string;
  quando: string;
  exemplo: boolean;
}

/** Negócio fora do quadro do mês: acabou ganho ou perdido num mês anterior (AAAA-MM). */
export type NegocioHistorico = NegocioMes & { mes: string; resultado: "ganho" | "perdido" };
export type NegocioPessoa = NegocioMes | NegocioHistorico;

export const ehHistorico = (n: NegocioPessoa): n is NegocioHistorico => "resultado" in n;

export interface ResumoPessoa {
  pessoa: Pessoa;
  papel: PapelPessoa;
  /** Todos os negócios da pessoa, do quadro e históricos. */
  negocios: NegocioPessoa[];
  /** Negócios abertos ou ganhos (os perdidos e os históricos perdidos não contam). */
  numero: number;
  valor: number;
  /** A fase mais avançada entre os negócios abertos ou ganhos; `null` sem eles. */
  fase: FaseNegocio | null;
  /** O pior negócio aberto (do quadro do mês); `null` sem nenhum. */
  piorAberto: NegocioMes | null;
  saude: SaudeNegocio | null;
  semNegocio: boolean;
  /** Tem negócios, mas nenhum aberto nem ganho. */
  soHistorico: boolean;
}

export type CodigoMatch = "CONFLITO" | "MATCH_FORTE" | "MATCH_EMAIL" | "MATCH_TELEFONE";
export type TipoSubmissao = "lead" | "contacto" | "cliente";

export interface CandidataSubmissao {
  pessoaId: string;
  via: "email" | "telefone" | "ambos";
}

export interface Submissao {
  id: string;
  codigo: CodigoMatch;
  tipo: TipoSubmissao;
  /** O nome da ficha a que a submissão está ligada. */
  nomeFicha: string;
  formulario: string;
  campanha: string;
  /** AAAA-MM-DDTHH:MM. */
  data: string;
  candidatas: CandidataSubmissao[];
  campos: { rotulo: string; valor: string }[];
  /** Resultado da deduplicação: o que coincidiu com a ficha existente. */
  _meta: { emailIgual: boolean; telefoneIgual: boolean };
  /** O serviço de que pediu visita e que ficou por marcar; `null` sem pedido. */
  visitaPedida: string | null;
}

export interface NotaPessoa {
  id: string;
  pessoaId: string;
  submissaoId: string;
  formulario: string;
  data: string;
  campos: { rotulo: string; valor: string }[];
}

export interface EstadoPessoas {
  submissoes: Submissao[];
  notas: NotaPessoa[];
  pessoas: Pessoa[];
  /** A atividade registada nesta sessão, a mais recente primeiro (a de exemplo junta-se na leitura). */
  atividade: ItemAtividade[];
  /** Quem foi contactada nesta sessão: deixa de contar como "Voltou a contactar". */
  contactadas: string[];
}

export type ChipPessoa = "todos" | "leads" | "clientes" | "semNegocio" | "voltou" | "semContacto";
export type OrdemPessoa = "atencao" | "nome" | "ultimoContacto" | "valor";

export interface FiltrosPessoas {
  chip: ChipPessoa;
  pesquisa: string;
}
