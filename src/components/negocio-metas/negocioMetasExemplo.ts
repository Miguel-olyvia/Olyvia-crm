// DADOS DE EXEMPLO da página "Negócio e metas". Não vêm da base de dados: são
// números inventados, coerentes entre si (ver `verificarCoerencia`). Só os
// valores de partida estão aqui; totais e percentagens saem sempre de
// `negocioMetas.ts`.
import type { DadosNegocioMetas, NegocioMes } from "./negocioMetas";

const orc = (id: string, valor: number, escolhido = false) => ({ id, valor, escolhido });

const NEGOCIOS: NegocioMes[] = [
  {
    id: "n1", pessoa: "Marta Silveira", servico: "Casa de banho", comercial: "Ana Ribeiro",
    orcamentos: [orc("n1-o1", 9800, true), orc("n1-o2", 11200)],
    proposta: { estado: "aceite" }, contrato: { estado: "assinado" },
  },
  {
    id: "n2", pessoa: "Rui Figueiredo", servico: "Cozinha", comercial: "Ana Ribeiro",
    orcamentos: [orc("n2-o1", 16900), orc("n2-o2", 18500, true), orc("n2-o3", 21000)],
    proposta: { estado: "aceite" }, contrato: { estado: "assinado" },
  },
  {
    id: "n3", pessoa: "Helena Tavares", servico: "Pintura exterior", comercial: "Bruno Costa",
    orcamentos: [orc("n3-o1", 7400, true)],
    proposta: { estado: "aceite" }, contrato: { estado: "assinado" },
  },
  {
    id: "n4", pessoa: "Paulo Neves", servico: "Telhado", comercial: "Bruno Costa",
    orcamentos: [orc("n4-o1", 14200, true), orc("n4-o2", 15800)],
    proposta: { estado: "aceite" }, contrato: { estado: "assinado" },
  },
  {
    id: "n5", pessoa: "Sofia Matos", servico: "Pavimento", comercial: "Carla Mendes",
    orcamentos: [orc("n5-o1", 12900, true)],
    proposta: { estado: "aceite" }, contrato: { estado: "assinado" },
  },
  {
    id: "n6", pessoa: "Nuno Barros", servico: "Janelas", comercial: "Carla Mendes",
    orcamentos: [orc("n6-o1", 8600, true), orc("n6-o2", 9400)],
    proposta: { estado: "enviada" }, contrato: null,
  },
  {
    id: "n7", pessoa: "Inês Pacheco", servico: "Casa de banho", comercial: "Diogo Lopes",
    orcamentos: [orc("n7-o1", 6700, true)],
    proposta: { estado: "aceite" }, contrato: { estado: "assinado" },
  },
  {
    id: "n8", pessoa: "Tiago Rocha", servico: "Isolamento", comercial: "Diogo Lopes",
    orcamentos: [orc("n8-o1", 5200), orc("n8-o2", 6100)],
    proposta: null, contrato: null,
  },
  {
    id: "n9", pessoa: "Clara Dias", servico: "Cozinha", comercial: "Diogo Lopes",
    orcamentos: [orc("n9-o1", 15200, true)],
    proposta: { estado: "rascunho" }, contrato: null,
  },
  {
    id: "n10", pessoa: "Vasco Pinto", servico: "Remodelação total", comercial: "Ana Ribeiro",
    orcamentos: [orc("n10-o1", 24000, true), orc("n10-o2", 27500)],
    proposta: { estado: "aceite" }, contrato: { estado: "pendente" },
  },
];

export const DADOS_EXEMPLO: DadosNegocioMetas = {
  mesAtual: "2026-10",
  metasMes: { valor: 90000, negociosGanhos: 8, conversao: 65, propostasEnviadas: 10 },
  metasComerciais: [
    { comercial: "Ana Ribeiro", meta: 30000 },
    { comercial: "Bruno Costa", meta: 25000 },
    { comercial: "Carla Mendes", meta: 20000 },
    { comercial: "Diogo Lopes", meta: 15000 },
  ],
  negocios: NEGOCIOS,
  evolucaoAnterior: [
    { mes: "2026-05", meta: 80000, ganho: 61200 },
    { mes: "2026-06", meta: 80000, ganho: 72400 },
    { mes: "2026-07", meta: 85000, ganho: 58900 },
    { mes: "2026-08", meta: 85000, ganho: 66300 },
    { mes: "2026-09", meta: 90000, ganho: 81700 },
  ],
};
