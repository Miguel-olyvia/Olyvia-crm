// Modelos de setor da V2 (13/10/2026). Junta aos três de `setores.ts` (Remodelação, AVAC, Solar)
// os dois do plano de 06/10: Limpeza (a partir do método BMG) e Manutenção (BM24).
// Cada modelo diz os termos (Cliente/Local/Obra), as linhas de serviço, as margens e
// os campos da visita (um CfgCampos, como os de `setores.ts`). Só dados de exemplo.
import type { CfgCampos } from "../campos";
import { SETORES, type Setor } from "../setores";

const SN = (k: string, l: string, extra: object = {}) => ({ k, l, t: "sim_nao" as const, novo: true, ...extra });
const ESC = (k: string, l: string, op: string[], extra: object = {}) => ({ k, l, t: "escolha" as const, op, novo: true, ...extra });

const LIMPEZA_CFG: CfgCampos = {
  "Local · exterior (edifício e acessos)": {
    nome: "O edifício",
    ocultos: ["n_fracoes_por_andar", "zona_estacionamento"],
    novos: [ESC("lp_horario", "Quando se pode limpar", ["Manhã cedo", "Horário de expediente", "Fim do dia", "Fim de semana"], { bloco: "Acesso" })],
  },
  "Local · interior": {
    nome: "Zonas a limpar",
    ocultos: ["pavimento", "eletrica", "quadro_diferencial", "canalizacao", "gas", "amianto", "habitada_durante_obra", "ano_construcao"],
    novos: [
      ESC("lp_tipo_espaco", "Tipo de espaço", ["Escritório", "Condomínio", "Loja", "Casa"], { bloco: "O espaço" }),
      ESC("lp_trafego", "Movimento de pessoas", ["Baixo", "Médio", "Alto"], { bloco: "O espaço" }),
    ],
  },
  "Área de intervenção": { oculto: true },
  "Escolhas do cliente": {
    ocultos: ["materiais_cliente", "cor_estilo"],
    novos: [
      ESC("lp_frequencia", "Frequência", ["Diária", "3 vezes por semana", "Semanal", "Quinzenal", "Pontual"]),
      SN("lp_produtos", "A empresa leva os produtos"),
    ],
  },
};

const MANUTENCAO_CFG: CfgCampos = {
  "Local · exterior (edifício e acessos)": { nome: "O edifício", ocultos: ["n_fracoes_por_andar"] },
  "Local · interior": {
    nome: "Instalações a manter",
    ocultos: ["pavimento", "habitada_durante_obra", "animais", "tipologia"],
    novos: [
      ESC("mn_equip", "Equipamentos", ["Elevador", "AVAC", "Quadro elétrico", "Bombas de água", "Portões"], { bloco: "Equipamentos" }),
      ESC("mn_contrato", "Contrato atual", ["Nenhum", "Com outra empresa", "A terminar"], { bloco: "Equipamentos" }),
    ],
  },
  "Área de intervenção": {
    nome: "A avaria ou o pedido",
    ocultos: ["diag_tipo_area", "diag_intervencao_tipo", "diag_toalheiro", "diag_local_cortes", "diag_demolir_descricao"],
    novos: [ESC("mn_urgencia", "Urgência", ["Hoje", "Esta semana", "Pode esperar"], { bloco: "O pedido" })],
  },
  "Escolhas do cliente": {
    ocultos: ["materiais_cliente", "cor_estilo"],
    novos: [ESC("mn_visitas", "Visitas preventivas", ["Mensal", "Trimestral", "Semestral", "Anual"])],
  },
};

/** Os dois modelos novos, no mesmo formato dos de `setores.ts`. */
export const SETORES_NOVOS: Setor[] = [
  { id: "limpeza", nome: "Limpeza", texto: "Escritórios, condomínios e casas. A visita mede as zonas e combina a frequência.", cfg: LIMPEZA_CFG },
  { id: "manutencao", nome: "Manutenção", texto: "Manutenção de edifícios e equipamentos, com contrato e visitas preventivas.", cfg: MANUTENCAO_CFG },
];

/** Todos os modelos de setor que a V2 mostra (os três de sempre e os dois novos). */
export const SETORES_V2: Setor[] = [...SETORES, ...SETORES_NOVOS];

/** Os termos que mudam com o setor: como se chama o cliente, o local e a obra. */
export interface Termos { cliente: string; local: string; obra: string }

/** O resumo de cada modelo: o que se aplica além dos campos. */
export interface ResumoSetor {
  termos: Termos;
  linhas: string[];
  margem: { min: number; alvo: number };
  cobra: string;
}

export const RESUMO_SETOR: Record<string, ResumoSetor> = {
  remodelacao: { termos: { cliente: "Cliente", local: "Local", obra: "Obra" }, linhas: ["Casa de banho", "Cozinha"], margem: { min: 28, alvo: 35 }, cobra: "Por obra" },
  avac: { termos: { cliente: "Cliente", local: "Instalação", obra: "Instalação" }, linhas: ["Ar condicionado", "Bomba de calor"], margem: { min: 25, alvo: 32 }, cobra: "Por obra" },
  solar: { termos: { cliente: "Cliente", local: "Instalação", obra: "Instalação" }, linhas: ["Fotovoltaico", "Baterias"], margem: { min: 22, alvo: 30 }, cobra: "Por obra" },
  limpeza: { termos: { cliente: "Cliente", local: "Espaço", obra: "Serviço" }, linhas: ["Limpeza regular", "Limpeza pontual", "Pós-obra"], margem: { min: 20, alvo: 28 }, cobra: "Por mês" },
  manutencao: { termos: { cliente: "Cliente", local: "Edifício", obra: "Intervenção" }, linhas: ["Preventiva", "Corretiva"], margem: { min: 25, alvo: 33 }, cobra: "Por contrato" },
};

export const setorPorId = (id: string | undefined): Setor | undefined => SETORES_V2.find((x) => x.id === (id || "remodelacao"));
