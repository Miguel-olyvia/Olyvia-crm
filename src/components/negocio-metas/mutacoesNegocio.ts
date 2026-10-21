// O que os ecrãs do negócio podem FAZER (perder, anular a perda, ligar e desligar um registo, ganhar, criar). É um contrato: quem o
// cumpre é a ficha real (`useMutacoesNegocio`, em `@/hooks/pessoas`, que fala com a base); os ecrãs só o leem por contexto e não sabem
// de onde vem. Sem provider (o exemplo e os testes antigos) os ecrãs continuam a usar os stores em memória, como sempre.
// Todas as funções lançam `ErroNeg` se falharem (o ecrã traduz-lhe a chave, nunca a mensagem) e esperam pela base.
import { createContext, useContext } from "react";
import type { FaseBase } from "./faseBase";
import type { FechoNegocio } from "./fechoNegocio";
import type { CondicoesTermos } from "./termosProposta";

/** Os tipos de registo que a base sabe ligar a um negócio. */
export type TipoRegistoBase = "contacto" | "visita" | "levantamento" | "orcamento" | "proposta" | "contrato";
export const TIPOS_REGISTO_BASE: readonly TipoRegistoBase[] = ["contacto", "visita", "levantamento", "orcamento", "proposta", "contrato"];

/** Os documentos (orçamento, proposta e contrato) só entram em `p_registos` ao criar com a M6 aplicada. */
export const TIPOS_DOCUMENTO: readonly TipoRegistoBase[] = ["orcamento", "proposta", "contrato"];

export interface RefRegistoBase {
  tipo: TipoRegistoBase;
  id: string;
}

export interface PedidoPerder {
  negocioId: string;
  /** A fase em que estava, na linguagem da base (`faseParaBase`): «ganho» nunca chega aqui. */
  fase: FaseBase;
  motivo: string;
}

export type ConversaoGanho = "feita" | "ja_cliente" | "ja_convertida";

/** O que `neg_reavaliar_negocio` («Fechar agora») devolveu. Os campos que a base não traz, ou traz com um valor desconhecido, ficam `null`. */
export interface ResultadoReavaliar {
  /** `false`: nada mudou (o negócio continua como estava). */
  mudou: boolean;
  estado: "aberto" | "ganho" | null;
  origemTipo: "proposta" | "contrato" | null;
  origemId: string | null;
  prova: string | null;
  /** `por_fazer`: a conversão em cliente fica por fazer (falta `leads.convert`); usa-se «Converter em cliente». */
  conversao: ConversaoGanho | "por_fazer" | "falhou" | "manual" | null;
  /** Quando nada mudou: porquê (código da base). */
  motivo: string | null;
}

export interface ResultadoGanho {
  /** `false`: o negócio já estava ganho. */
  mudou: boolean;
  /** `null` quando a base trouxe um valor que o ecrã não conhece. */
  conversao: ConversaoGanho | null;
  /** Quantas outras leads abertas a pessoa tem (o ecrã avisa se for mais de zero). */
  outrasLeadsAbertas: number;
}

export interface PedidoCriarNegocio {
  /** Gerado ao abrir o diálogo e estável entre reenvios: é o que torna o criar idempotente. Novo depois de um sucesso. */
  id: string;
  titulo: string;
  notas: string;
  /** `anew_users.id`; `null`: a base usa quem cria. */
  comercialId: string | null;
  leadId: string | null;
  /** A lead escolhida tem a abordagem encerrada e o utilizador quer reabri-la. */
  reabrirAbordagem: boolean;
  /** Contactos e visitas, e (com a M6) orçamentos, propostas e contratos. O levantamento vai à parte. */
  registos: RefRegistoBase[];
  levantamentoId: string | null;
  /** Como o negócio fecha (`p_fecho`); sem isto a base assume «contrato». */
  fecho?: FechoNegocio;
}

/**
 * O que `neg_mudar_fecho` devolveu. `precisaConfirmar`: a mudança tornaria decisivo um documento positivo já ligado e a base só a faz se se
 * repetir a chamada com a confirmação (nada mudou ainda). `fecho` é o tipo que o negócio tem agora (`null` se a base trouxe um valor desconhecido).
 */
export interface ResultadoMudarFecho {
  mudou: boolean;
  fecho: FechoNegocio | null;
  precisaConfirmar: boolean;
}

export interface ResultadoCriar {
  negocioId: string;
  /** `false`: reenvio do mesmo id (o negócio já existia): sucesso, sem repetir avisos. */
  mudou: boolean;
  /** Os registos que a base recusou ligar: ficam «por ligar» na ficha. */
  recusados: RefRegistoBase[];
}

/** O que se edita num negócio: o título, as notas e o comercial (`anew_users.id`; `null` sem comercial). */
export interface ValoresNegocio {
  titulo: string;
  notas: string;
  comercialId: string | null;
}

export interface PedidoEditarNegocio {
  negocioId: string;
  /** Os valores com que o diálogo abriu: só vão à base as colunas que mudaram. */
  antes: ValoresNegocio;
  depois: ValoresNegocio;
}

export interface MutacoesNegocio {
  /**
   * Escritas DIRETAS (UPDATE em `negocios` e em `proposals.terms`, não funções neg_*): ausentes no exemplo e onde a ficha não as monta, e
   * então os ecrãs não oferecem editar, lixo nem condições. Lançam `ErroNeg` (o ecrã traduz-lhe a chave).
   */
  editar?: (pedido: PedidoEditarNegocio) => Promise<{ mudou: boolean }>;
  enviarParaLixo?: (negocioId: string) => Promise<void>;
  restaurar?: (negocioId: string) => Promise<void>;
  guardarCondicoes?: (negocioId: string, propostaId: string, condicoes: CondicoesTermos) => Promise<void>;
  /** Muda o tipo de fecho (só com o negócio aberto). Ausente no exemplo: então os ecrãs não oferecem mudar. Lança `ErroNeg` (NG022: não muda neste estado). */
  mudarFecho?: (negocioId: string, fecho: FechoNegocio, confirmar: boolean) => Promise<ResultadoMudarFecho>;
  perder: (pedido: PedidoPerder) => Promise<{ mudou: boolean }>;
  anular: (negocioId: string, razao: string) => Promise<{ mudou: boolean }>;
  ligar: (negocioId: string, ref: RefRegistoBase) => Promise<void>;
  desligar: (negocioId: string, ref: RefRegistoBase) => Promise<void>;
  ganhar: (negocioId: string, leadId: string | null) => Promise<ResultadoGanho>;
  criar: (pedido: PedidoCriarNegocio) => Promise<ResultadoCriar>;
  /** A M6 está aplicada: o criar aceita orçamentos, propostas e contratos. Desligada, o formulário não os oferece. */
  criarComDocumentos: boolean;
  /**
   * Fecho v4 (migrations D e F): ausentes só no exemplo (sem ficha real). Na ficha real estão sempre presentes e NÃO testam se a base as tem: o único
   * travão é a bandeira do fecho, que só se liga depois de C, D, E e F aplicadas (por esta ordem). Lançam `ErroNeg` (o ecrã traduz-lhe a chave).
   */
  reavaliar?: (negocioId: string) => Promise<ResultadoReavaliar>;
  reabrirGanho?: (negocioId: string, motivo: string) => Promise<{ mudou: boolean }>;
  dispensarAlerta?: (negocioId: string) => Promise<{ mudou: boolean }>;
  /** Refaz a ficha e as listas, sem escrever nada (um documento criado por outro ecrã, ou uma ligação que falhou, passam a ver-se). */
  refrescar: () => void;
}

export const MutacoesNegocioContext = createContext<MutacoesNegocio | null>(null);

/** As mutações da ficha real; `null` fora dela (o exemplo): então os ecrãs usam os stores. */
export const useMutacoesDaFicha = (): MutacoesNegocio | null => useContext(MutacoesNegocioContext);
