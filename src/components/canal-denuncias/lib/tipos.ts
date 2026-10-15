// Tipos e listas fechadas do canal de denúncias de exemplo. Só dados em memória: nada aqui fala com lado nenhum.

export const TIPOS = ["assedio", "discriminacao", "corrupcao", "fraude", "seguranca", "dados", "conflito", "outro"] as const;
export type TipoDenuncia = (typeof TIPOS)[number];

export const ESTADOS = ["recebida", "em_analise", "mais_info", "concluida", "arquivada"] as const;
export type EstadoDenuncia = (typeof ESTADOS)[number];

export const GRAVIDADES = ["baixa", "media", "alta"] as const;
export type Gravidade = (typeof GRAVIDADES)[number];

export const RESULTADOS = ["procedente", "parcialmente_procedente", "improcedente", "sem_competencia"] as const;
export type ResultadoDenuncia = (typeof RESULTADOS)[number];

export const AINDA_ACONTECE = ["sim", "nao", "nao_sei"] as const;
export type AindaAcontece = (typeof AINDA_ACONTECE)[number];

export const MAX_FICHEIROS = 5;

export interface Anexo {
  nome: string;
  /** Bytes. O ficheiro nunca é lido nem enviado: guarda-se só o nome e o tamanho. */
  tamanho: number;
}

export interface Identidade {
  nome: string;
  email: string;
  telefone: string;
  podemContactar: boolean;
  soResponsavel: boolean;
}

export interface Mensagem {
  id: string;
  autor: "responsavel" | "denunciante";
  texto: string;
  /** AAAA-MM-DDTHH:MM */
  em: string;
  anexos: Anexo[];
}

export interface Nota {
  id: string;
  quem: string;
  em: string;
  texto: string;
}

export interface EventoHistorico {
  id: string;
  em: string;
  quem: string;
  /** Código da ação; o texto vem das traduções (`cd.hist.<acao>`). */
  acao: string;
  detalhe?: string;
}

export interface Decisao {
  resultado: ResultadoDenuncia;
  medidas: string;
  fundamentacao: string;
  em: string;
}

export interface Responsavel {
  id: string;
  nome: string;
  area: string;
}

export interface Denuncia {
  id: string;
  codigo: string;
  pin: string;
  tipo: TipoDenuncia;
  resumo: string;
  descricao: string;
  quando: string;
  aindaAcontece: AindaAcontece;
  onde: string;
  envolvidos: string;
  testemunhas: AindaAcontece;
  jaReportado: string;
  anexos: Anexo[];
  anonima: boolean;
  /** Sempre null numa denúncia anónima: a identidade nunca chega a ser guardada. */
  identidade: Identidade | null;
  estado: EstadoDenuncia;
  /** AAAA-MM-DD */
  recebidaEm: string;
  confirmadaEm: string | null;
  responsavelId: string | null;
  /** Pessoas visadas pela denúncia (ids de Responsavel): nunca podem ficar com o caso. */
  denunciados: string[];
  /** Responsáveis que declararam conflito de interesses neste caso. */
  conflitos: string[];
  gravidade: Gravidade;
  avaliacaoInicial: string;
  mensagens: Mensagem[];
  notas: Nota[];
  decisao: Decisao | null;
  motivoArquivo: string | null;
  historico: EventoHistorico[];
}
