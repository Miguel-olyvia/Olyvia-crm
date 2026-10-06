/**
 * Encomendas na data certa, distância ao armazém e dados em falta — a parte
 * pura (tipos, rótulos, textos), sem base de dados. As leituras estão em
 * lib/encomendas.ts.
 */

export interface DistanciaArmazem {
  armazem: string;
  armazem_cp?: string;
  codigo_postal?: string;
  km_reta: number;
  km_estrada: number;
  km_ida_volta: number;
  minutos: number;
  /** cp7 = código postal exato; cp4/cp2 = média da zona. */
  precisao_obra: "cp7" | "cp4" | "cp2";
}

/** "Armazém Lisboa · 30 km · ~45 min" (e "zona" quando o código postal não é exato). */
export function textoDistancia(d: DistanciaArmazem): string {
  const zona = d.precisao_obra === "cp7" ? "" : " (pela zona do código postal)";
  const km = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(Number(d.km_estrada));
  return `Armazém ${d.armazem} · ${km} km · ~${d.minutos} min${zona}`;
}

export type EstadoEncomenda =
  | "em_atraso"
  | "chega_tarde"
  | "esta_semana"
  | "sem_prazo"
  | "mais_tarde"
  | "encomendado";

export interface LinhaEncomenda {
  obra_id: string;
  obra_codigo: string;
  obra_titulo: string | null;
  tarefa_id: string;
  tarefa_nome: string;
  inicio_planeado: string;
  produto_id: string;
  produto_nome: string;
  quantidade: number | null;
  unidade: string | null;
  prazo_dias: number | null;
  encomenda_chega: string | null;
  encomendar_ate: string | null;
  estado: EstadoEncomenda;
  detalhe: string;
}

export const ROTULO_ENCOMENDA: Record<EstadoEncomenda, string> = {
  em_atraso: "Em atraso",
  chega_tarde: "Chega tarde",
  esta_semana: "Esta semana",
  sem_prazo: "Sem prazo",
  mais_tarde: "Mais tarde",
  encomendado: "Encomendado",
};

/** Por ordem de urgência (a do servidor). */
export const ORDEM_ENCOMENDA: EstadoEncomenda[] = [
  "em_atraso",
  "chega_tarde",
  "esta_semana",
  "sem_prazo",
  "mais_tarde",
  "encomendado",
];

/** Precisa de alguém agir (encomendar, ou tratar de uma encomenda que chega tarde). */
export function encomendaUrgente(e: Pick<LinhaEncomenda, "estado">): boolean {
  return e.estado === "em_atraso" || e.estado === "chega_tarde" || e.estado === "esta_semana";
}

export interface DadoEmFalta {
  chave: string;
  /** 1 = muda datas/quantidades; 2 = pior estimativa; 3 = conveniência. */
  gravidade: number;
  titulo: string;
  detalhe: string;
  onde: string | null;
  link: string | null;
  /** 'crm' = na Olyvia (fora de /operacao); 'ops' = dentro das Operações. */
  destino: "crm" | "ops" | null;
}

/** O endereço do link: na Olyvia (CRM) ou dentro das Operações (rota da app). */
export function hrefDoDado(d: DadoEmFalta, olyviaUrl: string): string | null {
  if (!d.link) return null;
  if (d.destino === "crm") return `${olyviaUrl.replace(/\/$/, "")}${d.link}`;
  return d.link;
}
