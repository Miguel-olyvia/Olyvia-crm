// Os tipos da Frota (portada de vault/frota-prototipo.html). Os nomes dos campos seguem o protótipo HTML (mat, comb, venc, rev...) para a leitura lado a lado;
// tudo isto é de exemplo e vive numa base própria (loja.ts), fora do Estado do protótipo e do Inventário.

export type Tom = "ok" | "info" | "warn" | "bad" | "violet" | "neu";
export type EstadoViatura = "ativa" | "oficina" | "parada" | "inativa" | "vendida";
export type Posse = "Própria" | "Renting" | "Leasing";
export type TipoAtrib = "permanente" | "pontual";
export type EstadoManut = "agendada" | "em curso" | "concluída";
export type TipoOcorr = "Multa" | "Sinistro" | "Avaria";
export type EstadoOcorr = "por identificar" | "identificado" | "em resolução" | "participado" | "resolvido" | "registada";
export type ChaveVenc = "seguro" | "ipo" | "iuc";

/** Um condutor: vem de Pessoas (RH). `tec` é o técnico do protótipo (TECS do motor) quando a pessoa é a mesma. */
export interface Pessoa { id: string; nome: string; funcao: string; equipa: string; carta: string[]; cartaVal: string | null; tec?: string }

export interface Viatura {
  id: string; mat: string; marca: string; modelo: string; tipo: string; comb: string; posse: Posse; renda?: number; fimContrato?: string;
  ano: number; km: number; estado: EstadoViatura; motivo?: string; cat: string; centro: string;
  venc: Record<ChaveVenc, string | null>; seguradora: string; apolice: string;
  rev: { cadaKm: number; cadaMeses: number; ultKm: number; ultData: string };
  /** É um armazém móvel no Inventário (o id do armazém do tipo "viatura" em `armazemId`). */
  armazem: boolean; armazemId?: string | null;
  usoPessoal?: boolean; pool?: boolean;
  /** É um recurso da Agenda (aparece em Definições › Agenda e conta para reservas e conflitos). */
  agenda: boolean;
  /** O recurso da Agenda (Definições › Agenda) que é esta viatura, quando já existia lá com outro nome. */
  recursoAgenda?: string;
}

export interface Atribuicao {
  id: string; vid: string; pid: string; tipo: TipoAtrib; ini: string; fim: string | null; kmIni?: number | null; kmFim?: number; nota?: string; devolvida?: boolean;
  /** A obra do protótipo (o id do negócio em obra) quando a reserva é para uma obra. */
  obra?: number;
}

export interface Manutencao { id: string; vid: string; tipo: string; data: string; prev?: string; km?: number; estado: EstadoManut; oficina: string; valor: number; nota?: string }
export interface Leitura { vid: string; data: string; km: number; origem: string }
export interface Custo {
  id: string; vid: string; data: string; tipo: string; qtd?: number; un?: string; valor: number; km?: number; pid?: string | null;
  /** Centro de custo ("Instalações · Norte") ou obra ("Obra #1022"). */
  centro?: string; fonte: string; nota?: string; rever?: boolean;
}
export interface Ocorrencia {
  id: string; vid: string; tipo: TipoOcorr; quando: string; local: string; desc: string; valor?: number; notificada?: string; pid?: string;
  estado: EstadoOcorr; ligacao?: string; fotos?: number;
}
/** Um compromisso da agenda com a viatura: uma tarefa do plano de uma obra do protótipo, uma visita de um negócio ou outro serviço. */
export interface Compromisso { vid: string; data: string; hora: string; ref: string; desc: string; pid: string; obra?: number; tarefa?: string; negocio?: number }

export interface Frota {
  v: number;
  pessoas: Pessoa[]; viaturas: Viatura[]; atrib: Atribuicao[]; manut: Manutencao[]; leituras: Leitura[]; custos: Custo[]; ocorr: Ocorrencia[]; agenda: Compromisso[];
  /** O histórico (log de atividade): cada ação grava uma entrada (registar() em acoes.ts). As entradas antigas só têm `at` e `t`. */
  log: EntradaLog[];
  /** Os pedidos de reposição das carrinhas registados na Frota de exemplo da app real (sem Inventário real por trás). */
  pedidos?: PedidoReposicao[];
  /** Os extratos já importados (o nome do ficheiro): importar outra vez duplicava os custos. */
  importados?: string[];
}

/** Uma linha de stock da carrinha, lida do Inventário (armazém do tipo "viatura"). */
export interface LinhaCarrinha { sku: string; nome: string; qty: number; un: string; min: number }

/** Uma obra do protótipo, como a Frota a vê (vem do Estado: os negócios em obra com plano). */
export interface ObraRef { id: number; nome: string; servico: string; local: string; estado: string; tarefas: { nome: string; dia: number; dur: number; tec: string | null }[] }

/** Uma entrada do histórico: quando (ISO, hora real), o texto, quem fez, a viatura, o tipo de ação e o detalhe. */
export interface EntradaLog { at: string; t: string; quem?: string; vid?: string; acao?: string; det?: string }

/** Um pedido de reposição de uma carrinha (armazém central → carrinha), registado no exemplo. */
export interface PedidoReposicao { id: string; vid: string; sku: string; nome: string; qty: number; un: string; at: string; estado: "pedido" }
