// Os tipos das perguntas de escolha rápida de "Novo negócio" (Qualificação e Visita). Cada texto é um par
// [português, inglês]; as chaves de tradução saem daqui (ver `translations/negocioMetasVisita.ts`). Só exemplo.

export type Par = readonly [pt: string, en: string];
/** Uma opção: a chave (o que se guarda), o texto em pt e o texto em en. */
export type OpcaoDef = readonly [chave: string, pt: string, en: string];

/** Os quatro tipos de pergunta que a organização escreve (os da base). Sem tipo, a pergunta é de escolha única (o catálogo do código). */
export type TipoPergunta = "escolha_unica" | "escolha_multipla" | "texto" | "numero";

/** Os limites de uma pergunta de número; `null` = sem limite (a base aplica 3 casas e o máximo da coluna). */
export interface NumeroDef {
  min: number | null;
  max: number | null;
  casas: number | null;
  unidade: string | null;
}

export interface PerguntaDef {
  /** Único em todo o painel: é a chave da resposta e do texto (`q.<id>`). Nas perguntas da base é a chave da pergunta. */
  id: string;
  rotulo: Par;
  opcoes: readonly OpcaoDef[];
  /** Só aparece (e só conta) quando a resposta a outra pergunta é uma destas chaves; vazio conta como a chave "". */
  se?: { pergunta: string; valores: readonly string[] };
  tipo?: TipoPergunta;
  /** Verdadeiro nas perguntas da base: o texto da pergunta e das opções (a posição 0 do par) vê-se tal como está, sem passar pela tradução. */
  literal?: boolean;
  numero?: NumeroDef;
  /** O máximo de caracteres de uma resposta de texto (a base aplica 2000 quando falta). */
  textoMax?: number;
}

export interface BlocoDef {
  id: string;
  titulo?: Par;
  perguntas: readonly PerguntaDef[];
  literal?: boolean;
}

/** "especial": o que a secção leva além das perguntas (os dados da visita; as linhas de medidas). */
export type EspecialSeccao = "visitas" | "medidas";

export interface SeccaoDef {
  id: string;
  titulo: Par;
  blocos: readonly BlocoDef[];
  especial?: EspecialSeccao;
  /** Em que aba vive a secção; sem isto, na Visita. A Qualificação é uma secção como as outras, na sua aba. */
  aba?: "visita" | "qualificacao";
  literal?: boolean;
}

/**
 * As respostas: o id da pergunta → o que se respondeu, sempre em texto. Escolha única: a chave da opção. Escolha múltipla: as chaves
 * separadas por vírgula (as chaves da base não têm vírgulas). Texto: o texto. Número: o número como se escreveu. Só tem as perguntas respondidas.
 */
export type Respostas = Readonly<Record<string, string>>;

export const SIM_NAO: readonly OpcaoDef[] = [["sim", "Sim", "Yes"], ["nao", "Não", "No"]];
export const SIM_NAO_NAO_SEI: readonly OpcaoDef[] = [...SIM_NAO, ["naoSei", "Não sei", "Not sure"]];
