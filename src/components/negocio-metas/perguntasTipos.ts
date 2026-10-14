// Os tipos das perguntas de escolha rápida de "Novo negócio" (Qualificação e Visita). Cada texto é um par
// [português, inglês]; as chaves de tradução saem daqui (ver `translations/negocioMetasVisita.ts`). Só exemplo.

export type Par = readonly [pt: string, en: string];
/** Uma opção: a chave (o que se guarda), o texto em pt e o texto em en. */
export type OpcaoDef = readonly [chave: string, pt: string, en: string];

export interface PerguntaDef {
  /** Único em todo o painel: é a chave da resposta e do texto (`q.<id>`). */
  id: string;
  rotulo: Par;
  opcoes: readonly OpcaoDef[];
  /** Só aparece (e só conta) quando a resposta a outra pergunta é uma destas chaves; vazio conta como a chave "". */
  se?: { pergunta: string; valores: readonly string[] };
}

export interface BlocoDef {
  id: string;
  titulo?: Par;
  perguntas: readonly PerguntaDef[];
}

/** "especial": o que a secção leva além das perguntas (os dados da visita; as linhas de medidas). */
export type EspecialSeccao = "visitas" | "medidas";

export interface SeccaoDef {
  id: string;
  titulo: Par;
  blocos: readonly BlocoDef[];
  especial?: EspecialSeccao;
}

/** As respostas: o id da pergunta → a chave da opção escolhida. Só tem as perguntas respondidas. */
export type Respostas = Readonly<Record<string, string>>;

export const SIM_NAO: readonly OpcaoDef[] = [["sim", "Sim", "Yes"], ["nao", "Não", "No"]];
export const SIM_NAO_NAO_SEI: readonly OpcaoDef[] = [...SIM_NAO, ["naoSei", "Não sei", "Not sure"]];
