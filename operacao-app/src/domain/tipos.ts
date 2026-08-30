/**
 * Vocabulário de Operações.
 *
 * Um termo, um significado, um sítio. É a resposta directa ao que o
 * levantamento encontrou no Infraspeak: a rota de "Pedidos" é `/failures`, a
 * de "Ocorrências" é `/scheduled-works`, e o dashboard ainda mostra widgets
 * chamados "Nº Total de Avarias". Três nomes para o mesmo objeto, porque o
 * produto foi renomeado por cima do modelo antigo.
 *
 * Aqui os rótulos vivem só neste ficheiro. Se alguém quiser mudar um nome,
 * muda-o num sítio e muda em toda a aplicação.
 */

export const ORIGENS = ["preventiva", "corretiva", "obra"] as const;
export type Origem = (typeof ORIGENS)[number];

export const ESTADOS = [
  "por_aprovar",
  "agendada",
  "em_curso",
  "pausada",
  "fechada",
  "confirmada",
  "cancelada",
] as const;
export type Estado = (typeof ESTADOS)[number];

export const FUNCOES = ["admin", "gestor", "operador", "tecnico"] as const;
export type Funcao = (typeof FUNCOES)[number];

export const PRIORIDADES = ["baixa", "normal", "alta", "urgente"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

/**
 * A NATUREZA do trabalho, não o formato da resposta.
 *
 * O modelo antigo misturava as duas coisas: "medicao", "foto" e "assinatura"
 * descrevem como se responde, não o que se está a fazer. O formato passou
 * para as medições, e aqui ficou só o trabalho — que é o que interessa para
 * saber quem o pode fazer e quanto tempo demora.
 */
export const TIPOS_TAREFA = [
  "inspecao",
  "correcao",
  "limpeza",
  "proacao",
  "substituicao",
] as const;
export type TipoTarefa = (typeof TIPOS_TAREFA)[number];

/** O formato da resposta de uma medição. */
export const TIPOS_MEDICAO = ["gama", "acumulado", "escolha", "texto"] as const;
export type TipoMedicao = (typeof TIPOS_MEDICAO)[number];

export const ESTADOS_TAREFA = [
  "pendente",
  "feita",
  "nao_conforme",
  "nao_aplicavel",
] as const;
export type EstadoTarefa = (typeof ESTADOS_TAREFA)[number];

export type TipoCusto = "mao_obra" | "material" | "servico" | "outro";

/* ─────────────────────────── Rótulos (pt-PT) ─────────────────────────── */

export const ROTULO_ESTADO: Record<Estado, string> = {
  por_aprovar: "Por aprovar",
  agendada: "Agendada",
  em_curso: "Em curso",
  pausada: "Pausada",
  fechada: "Fechada",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
};

export const ROTULO_ORIGEM: Record<Origem, string> = {
  preventiva: "Preventiva",
  corretiva: "Corretiva",
  obra: "Obra",
};

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export const ROTULO_ESTADO_TAREFA: Record<EstadoTarefa, string> = {
  pendente: "Pendente",
  feita: "Conforme",
  nao_conforme: "Não conforme",
  nao_aplicavel: "Não aplicável",
};

export const ROTULO_TIPO_TAREFA: Record<TipoTarefa, string> = {
  inspecao: "Inspeção",
  correcao: "Correção",
  limpeza: "Limpeza",
  proacao: "Proação",
  substituicao: "Substituição",
};

export const ROTULO_FUNCAO: Record<Funcao, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  operador: "Operador",
  tecnico: "Técnico",
};

/* ─────────────────────────── Grupos úteis ─────────────────────────── */

/** Estados em que a ordem ainda consome atenção de alguém. */
export const ESTADOS_ABERTOS: readonly Estado[] = [
  "por_aprovar",
  "agendada",
  "em_curso",
  "pausada",
];

export function estaAberta(estado: Estado): boolean {
  return ESTADOS_ABERTOS.includes(estado);
}

/** Estados terminais: já não se espera trabalho nenhum. */
export function estaFechada(estado: Estado): boolean {
  return estado === "confirmada" || estado === "cancelada";
}
