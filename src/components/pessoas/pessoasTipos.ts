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
}

export type ChipPessoa = "todos" | "leads" | "clientes" | "semNegocio" | "voltou" | "semContacto";
export type OrdemPessoa = "atencao" | "nome" | "ultimoContacto" | "valor";

export interface FiltrosPessoas {
  chip: ChipPessoa;
  pesquisa: string;
}
