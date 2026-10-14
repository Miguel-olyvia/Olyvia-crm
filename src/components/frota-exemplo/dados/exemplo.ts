// Informação de exemplo que, no protótipo, vinha de outros módulos do protótipo (o motor das obras e o Inventário do
// protótipo) e que a app real ainda não tem ligada à Frota: as obras referidas nas reservas e nos custos, e o stock
// de cada carrinha. Só dados, sem escrever em lado nenhum. Quando houver tabelas (fleet_*), isto sai daqui.
import { CARRINHAS } from "@/pages/prototipo-negocios/inventario/carrinhas";
import type { LinhaCarrinha, ObraRef, Viatura } from "./index";

/** As obras do exemplo (as mesmas #1022 e #1050 do protótipo), com as tarefas do plano. */
export const OBRAS_EXEMPLO: readonly ObraRef[] = [
  {
    id: 1022, nome: "Marta Lima", servico: "WC", local: "Odivelas", estado: "em curso",
    tarefas: [
      { nome: "Demolição", dia: 0, dur: 1, tec: "js" },
      { nome: "Canalização", dia: 1, dur: 1, tec: "ma" },
      { nome: "Revestimento e pavimento", dia: 2, dur: 2, tec: "hn" },
      { nome: "Louças e acabamentos", dia: 4, dur: 1, tec: "ma" },
    ],
  },
  {
    id: 1050, nome: "Joana Ribeiro", servico: "Remodelação WC principal", local: "Lisboa", estado: "concluída",
    tarefas: [
      { nome: "Demolição", dia: 0, dur: 1, tec: "js" },
      { nome: "Canalização", dia: 1, dur: 1, tec: "ma" },
      { nome: "Revestimento e pavimento", dia: 2, dur: 2, tec: "hn" },
      { nome: "Louças e acabamentos", dia: 4, dur: 1, tec: "ma" },
    ],
  },
];

/** "Obra #1022 · WC · Marta Lima, Odivelas". */
export const nomeObra = (o: ObraRef): string => `Obra #${o.id} · ${o.servico} · ${o.nome}, ${o.local}`;

/** A lista de obras no módulo Operações (operacao-app, servido em /operacao, fora deste SPA). */
export const OBRAS_OPERACOES = "/operacao/obras";
/**
 * O sítio ÚNICO onde se decide para onde abre uma obra. As obras do exemplo (#1022, #1050) não existem nas Operações
 * reais, por isso abrem a lista; quando a Frota tiver dados reais (`real`), abre a própria obra.
 */
export function linkObra(codigo: number | string, real = false): string {
  return real ? `${OBRAS_OPERACOES}/${encodeURIComponent(String(codigo))}` : OBRAS_OPERACOES;
}
/** A permissão do módulo Operações (a mesma do item "Operações" do menu). */
export const PERMISSAO_OPERACOES = "operations.view";
/** A permissão da Agenda (/scheduling), a mesma da entrada "Agenda" dos atalhos do menu (QuickLinks). */
export const PERMISSAO_AGENDA = "scheduling.view";

/** Os artigos que andam nas carrinhas do exemplo: nome e unidade. */
const ARTIGOS: Record<string, [string, string]> = {
  "TM-16": ["Tubo multicamada 16 mm (metro)", "m"], "VE-12": ["Válvula de esfera 1/2\"", "un"], "FT-01": ["Fita de teflon", "un"],
  "SIL-N": ["Silicone neutro", "un"], "ABR-48": ["Abraçadeiras 4,8 × 200", "un"], "TP-U": ["Termopar universal", "un"],
  "KV-C": ["Kit de vedantes de caldeira", "un"], "NTC-10": ["Sonda NTC 10k", "un"], "FUS-3": ["Fusíveis 3,15 A", "un"],
  "TC-15": ["Tubo de cobre 15 mm (metro)", "m"], "CC-15": ["Curvas de cobre 15 mm", "un"], "SOL-K": ["Solda e decapante", "kit"],
  "ISO-15": ["Isolamento 15 mm (metro)", "m"], "FAC-01": ["Filtros de ar condicionado", "un"], "R32": ["Gás R32 (garrafa)", "un"],
  "LIMP-B": ["Spray de limpeza de baterias", "un"], "ESC-7": ["Escadote 7 degraus", "un"], "SDS-K": ["Berbequim e martelo SDS", "kit"],
};

/** O stock de exemplo da carrinha (armazém móvel). Viaturas criadas aqui não têm stock: o armazém real cria-se com as tabelas. */
export function stockCarrinhaExemplo(v: Viatura | undefined): LinhaCarrinha[] {
  if (!v?.armazem || !v.armazemId) return [];
  const c = CARRINHAS.find((x) => x.id === v.armazemId);
  if (!c) return [];
  return c.stock.map(([sku, qty, min]) => ({ sku, nome: ARTIGOS[sku]?.[0] ?? sku, un: ARTIGOS[sku]?.[1] ?? "un", qty, min }));
}
