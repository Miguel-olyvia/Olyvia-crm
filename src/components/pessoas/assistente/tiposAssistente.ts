// O contrato de um passo do assistente (o guia do Pipeline como no protótipo): só dados, sem JSX. O corpo de cada passo desenha-se à parte,
// escolhido pelo `id`; aqui ficam o que a coluna da esquerda, o cabeçalho «Passo N de M · faltam X respostas» e o rodapé precisam de saber.

/** O ícone do quadrado colorido ao lado do título (o ecrã traduz a chave para o ícone). */
export type IconeDoPasso = "telefone" | "qualificacao" | "morada" | "preparar" | "agenda" | "visitas" | "seccao" | "fechar";

export interface PassoAssistente {
  /** Estável entre renders: `chamada`, `seccao:exterior`... */
  id: string;
  /** A chave de tradução do nome do passo; ignorada se houver `rotulo`. */
  rotuloChave?: string;
  /** O nome literal (as secções do levantamento vêm da base e vêm já escritas). */
  rotulo?: string;
  icone: IconeDoPasso;
  /** Quantas respostas o passo pede (o que falta conta-se contra isto). */
  obrigatorias: number;
  respondidas: number;
  /** O passo grava no negócio: sem negócio mostra a razão e o botão «Criar o negócio». */
  precisaNegocio: boolean;
  /** Quando existe, manda sobre a conta (um passo que só guarda está feito depois de guardar, não por ter respostas). */
  feito?: boolean;
}

/** O que a coluna da esquerda desenha em cada passo: visto, o atual realçado, «!» com falta (já visitado) ou vazio. */
export type EstadoDoPasso = "feito" | "atual" | "comFalta" | "porFazer";

/** O tempo que falta, para o cabeçalho: o ecrã traduz o tipo. */
export type TempoDoPasso = { tipo: "completo" } | { tipo: "menosDeUmMinuto" } | { tipo: "minutos"; minutos: number };
