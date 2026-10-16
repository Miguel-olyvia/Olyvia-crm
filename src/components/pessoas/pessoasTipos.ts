// Tipos da página "Pessoas" (só dados de exemplo). O papel (lead ou cliente) NÃO é
// guardado: deriva dos negócios (ver `juntarPessoas.ts`). Os campos próprios desta
// página (origem, etapa, último contacto) são de exemplo e não existem noutro sítio.
import type { FaseNegocio, NegocioMes } from "@/components/negocio-metas/negocioMetas";
import type { SaudeNegocio } from "@/components/negocio-metas/saudeNegocio";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";

export type PapelPessoa = "lead" | "cliente";
/** Os 5 passos do percurso: Lead, Contacto, Visita, Negócio e Cliente (as chaves não mudam, só os textos). */
export type EtapaPessoa = "nova" | "emContacto" | "visitaMarcada" | "qualificada" | "cliente";
export type OrigemPessoa = "site" | "formulario" | "campanha" | "indicacao" | "telefone";
export type ViaEntrada = "formulario" | "telefone" | "indicacao" | "manual";

/** Quando uma lead é perdida: o motivo, o dia (AAAA-MM-DD) e o índice (0 a 3) do passo do percurso em que aconteceu. */
export interface PerdidaPessoa {
  motivo: MotivoPerda;
  data: string;
  /** Falta nas perdidas antigas: nesse caso vale o índice da etapa (ver `passoDaPerdida`). */
  passo?: number;
}

/** A morada de uma visita: rua e número, código postal (0000-000), localidade e andar ou fração. */
export interface MoradaVisita {
  rua: string;
  codigoPostal: string;
  localidade: string;
  andar: string;
}

/**
 * A visita marcada a uma pessoa. A morada da lead (`Pessoa.morada`) é a que ela indicou; a da visita (`moradaVisita`) pode
 * ser a mesma (`igualALead`) ou outra, e é a da visita que passa a Morada da obra ao criar o negócio.
 */
export interface VisitaPessoa {
  /** AAAA-MM-DD. */
  data: string;
  /** HH:MM; vazio = sem hora. */
  hora: string;
  /** O comercial responsável pela visita. */
  comercial: string;
  servico?: string;
  igualALead: boolean;
  moradaVisita: MoradaVisita;
  /** Uma nota de acesso (só quando a morada é outra). */
  notaAcesso?: string;
  /** A visita já aconteceu (ver `marcarVisitaFeita`): o passo seguinte é o levantamento. Falta enquanto está só marcada. */
  feita?: boolean;
  /** O levantamento guardado antes de criar o negócio (linhas de medidas, observações e respostas); some com a visita ao concluí-la. */
  levantamento?: RascunhoLevantamento;
}

export interface Pessoa {
  id: string;
  nome: string;
  contacto: { telefone: string | null; email: string | null };
  comercial: string;
  /** Campo de exemplo, só desta página. */
  origem: OrigemPessoa;
  /** Campos de exemplo da origem (todos opcionais): canal, campanha e o formulário de onde veio. */
  canal?: string;
  campanha?: string;
  formulario?: string;
  viaEntrada: ViaEntrada;
  /** Saúde da pessoa, de 0 a 100 (campo de exemplo). */
  saude: number;
  /** Campo de exemplo, só desta página. Só vale a etapa efetiva (ver `etapaPessoa.ts`). */
  etapa: EtapaPessoa;
  /** Campo de exemplo: dias desde o último contacto. */
  ultimoContactoDias: number;
  /** Campos de exemplo da ficha (todos opcionais): a empresa, a morada, o NIF e o resto. */
  empresa?: { nome: string; contacto?: string; nif?: string };
  morada?: { linha: string; cp: string; localidade: string };
  distrito?: string;
  nif?: string;
  qualificacao?: QualificacaoPessoa;
  /** O resultado da última chamada (ver `opcoesPessoa.ts`); vale para lead e cliente. */
  resultadoContacto?: ResultadoContacto;
  /** AAAA-MM-DD. */
  proximoContacto?: string | null;
  /** HH:MM do próximo contacto, quando foi marcado com hora (uma visita ou "ligar numa data"). */
  proximoHora?: string;
  /** A visita marcada e ainda por concluir (ver `visitaPessoa.ts`); some quando se cria o negócio a partir dela. */
  visita?: VisitaPessoa;
  /** AAAA-MM-DD: cliente ou lead desde. */
  desde?: string;
  /** Marcada como perdida na ficha: o motivo, o dia e o passo. Só as leads se perdem. */
  perdida?: PerdidaPessoa;
}

export type QualificacaoPessoa = "MQL" | "SQL";
export type ResultadoContacto = "atendeuInteressado" | "atendeuMaisTarde" | "naoAtendeu" | "semInteresse" | "numeroErrado";
/** O resultado como se filtra e se mostra: os cinco da chamada e "Sem contacto" (nunca houve chamada). */
export type ResultadoOuNenhum = ResultadoContacto | "semContacto";
export type MotivoPerda = "preco" | "adiou" | "outraEmpresa" | "semResposta" | "naoProcurava";
/** O próximo passo depois de uma chamada. A visita e o "ligar numa data" pedem dia e hora; "perder" pede o motivo. */
export type PassoChamada = "marcarVisita" | "ligarData" | "ligarAmanha" | "ligarHoje" | "perder" | "nenhum";

export type TipoAtividade = "chamada" | "nota" | "email" | "historico";

/**
 * Uma linha da atividade de uma pessoa. `titulo` e `detalhe` são texto escrito à mão (nunca uma chave); quando o texto
 * é da aplicação, vão vazios e `chaveTitulo` / `chaveDetalhe` levam a chave de tradução. `quando` é AAAA-MM-DD;
 * `hora` (HH:MM) só existe nos registos de exemplo; `exemplo` é falso nos registos feitos nesta sessão.
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
  hora?: string;
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
  /** Os negócios abertos: sem contrato assinado e fora dos históricos (os perdidos também ficam de fora). */
  abertos: NegocioMes[];
  /** O valor em jogo: a soma dos negócios abertos (nem ganhos nem perdidos). */
  emJogo: number;
  /** Lead: próximo contacto anterior a hoje. Cliente: só com um negócio em curso com o prazo anterior a hoje. */
  atrasada: boolean;
  /** O formulário de onde veio; `null` quando foi registada à mão. */
  formulario: string | null;
  /** A etapa efetiva (ver `etapaEfetiva`); uma perdida é um estado à parte, por cima desta. */
  etapa: EtapaPessoa;
  /** A fase do negócio aberto mais avançado; `null` sem negócio aberto. */
  faseEtapa: FaseNegocio | null;
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

/** O seletor "Leads, Clientes, Todos": as perdidas só contam em "Todos". */
export type TipoPessoa = "leads" | "clientes" | "todos";
export type ChipPessoa = "todas" | "porContactar" | "atrasadas" | "perdidas";
export type OrdemPessoa = "urgencia" | "recentes" | "valor";
/** A vista da página: a tabela ("lista") ou o quadro por 6 fases. */
export type VistaPessoas = "lista" | "quadro";

/** Os filtros da lista; `comercial`, `formulario` e `resultado` vazios querem dizer "todos". */
export interface FiltrosPessoas {
  tipo: TipoPessoa;
  chip: ChipPessoa;
  pesquisa: string;
  soMinhas: boolean;
  voltou: boolean;
  comVisita: boolean;
  comercial: string;
  formulario: string;
  resultado: ResultadoOuNenhum | "";
}
