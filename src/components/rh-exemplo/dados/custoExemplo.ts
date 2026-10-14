/**
 * Os dados de exemplo do custo: valores avulsos (quilómetros e ajudas de custo) de Setembro de 2026 e os equipamentos de
 * quase todas as pessoas. As entregas contam-se a partir da admissão de cada pessoa, para fazerem sempre sentido (ninguém
 * recebe um equipamento antes de entrar). Tudo inventado, só em memória.
 */
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import type { AvulsoCusto } from "@/components/rh-exemplo/lib/custoMes";
import type { EquipamentoPessoa, TipoEquipamento } from "@/components/rh-exemplo/lib/equipamentos";

/** O mês dos valores avulsos de exemplo: o mesmo do «Cálculo do mês» (`MES_PROCESSAVEL`). */
const MES_EXEMPLO = "2026-09";
const AUTOR = "Sofia Rebelo";

export function avulsosIniciais(): AvulsoCusto[] {
  const base = { dataReal: null, autor: AUTOR, criadoEm: `${MES_EXEMPLO}-28T10:00:00.000Z`, anulado: null, mesContagem: MES_EXEMPLO };
  const km = (id: string, pessoaId: string, dia: string, descricao: string, kms: number): AvulsoCusto =>
    ({ ...base, id, pessoaId, tipo: "km", data: `${MES_EXEMPLO}-${dia}`, descricao, quantidade: kms, valorUnitario: 0.4, valor: Math.round(kms * 40) / 100 });
  const ajuda = (id: string, pessoaId: string, dia: string, descricao: string, dias: number): AvulsoCusto =>
    ({ ...base, id, pessoaId, tipo: "ajuda", data: `${MES_EXEMPLO}-${dia}`, descricao, quantidade: dias, valorUnitario: 25, valor: dias * 25 });
  return [
    km("cu-1", "p-tiago", "09", "Visita ao cliente do Porto", 120),
    ajuda("cu-2", "p-tiago", "09", "Deslocação a feira", 2),
    km("cu-4", "p-hugo", "16", "Entrega de encomenda em Braga", 85),
    km("cu-5", "p-rui", "21", "Reunião com fornecedor em Setúbal", 60),
    ajuda("cu-6", "p-ines", "23", "Formação em Lisboa", 1),
    ajuda("cu-7", "p-andre", "11", "Descarga fora do horário", 1),
  ];
}

interface Espec {
  pessoaId: string;
  tipo: TipoEquipamento;
  descricao: string;
  valor: number;
  /** Dias depois da admissão em que foi entregue. */
  diasDepois: number;
  /** Dias depois da entrega em que foi devolvido (ausente = ainda atribuído). */
  devolvidoApos?: number;
}

const ESPECS: Espec[] = [
  { pessoaId: "p-marta", tipo: "portatil", descricao: "Portátil de direção", valor: 1350, diasDepois: 20 },
  { pessoaId: "p-marta", tipo: "telemovel", descricao: "Telemóvel de serviço", valor: 780, diasDepois: 400 },
  { pessoaId: "p-rui", tipo: "portatil", descricao: "Portátil", valor: 900, diasDepois: 1230 },
  { pessoaId: "p-rui", tipo: "telemovel", descricao: "Telemóvel de serviço", valor: 650, diasDepois: 15 },
  { pessoaId: "p-rui", tipo: "fardamento", descricao: "Fardas de loja (2 conjuntos)", valor: 120, diasDepois: 10 },
  { pessoaId: "p-ines", tipo: "portatil", descricao: "Portátil", valor: 1050, diasDepois: 12 },
  { pessoaId: "p-ines", tipo: "telemovel", descricao: "Telemóvel de serviço", valor: 620, diasDepois: 12 },
  { pessoaId: "p-tiago", tipo: "telemovel", descricao: "Telemóvel", valor: 520, diasDepois: 5 },
  { pessoaId: "p-tiago", tipo: "fardamento", descricao: "Fardas de loja", valor: 95, diasDepois: 5 },
  { pessoaId: "p-carolina", tipo: "telemovel", descricao: "Telemóvel", valor: 480, diasDepois: 3 },
  { pessoaId: "p-carolina", tipo: "fardamento", descricao: "Fardas de loja", valor: 95, diasDepois: 3 },
  { pessoaId: "p-hugo", tipo: "viatura", descricao: "Viatura de serviço (carrinha elétrica)", valor: 18500, diasDepois: 30 },
  { pessoaId: "p-hugo", tipo: "telemovel", descricao: "Telemóvel", valor: 560, diasDepois: 30 },
  { pessoaId: "p-beatriz", tipo: "telemovel", descricao: "Telemóvel", valor: 480, diasDepois: 4 },
  { pessoaId: "p-beatriz", tipo: "fardamento", descricao: "Fardas de loja", valor: 95, diasDepois: 4 },
  { pessoaId: "p-andre", tipo: "ferramentas", descricao: "Kit de ferramentas de manutenção", valor: 640, diasDepois: 25 },
  { pessoaId: "p-andre", tipo: "fardamento", descricao: "Fardamento de armazém", valor: 140, diasDepois: 25 },
  { pessoaId: "p-andre", tipo: "telemovel", descricao: "Telemóvel robusto", valor: 380, diasDepois: 25 },
  { pessoaId: "p-sofia", tipo: "portatil", descricao: "Portátil de RH", valor: 1200, diasDepois: 14 },
  { pessoaId: "p-sofia", tipo: "telemovel", descricao: "Telemóvel de serviço", valor: 700, diasDepois: 14 },
  { pessoaId: "p-daniel", tipo: "portatil", descricao: "Portátil", valor: 950, diasDepois: 3 },
  { pessoaId: "p-joana", tipo: "telemovel", descricao: "Telemóvel", valor: 450, diasDepois: 6 },
  { pessoaId: "p-pedro", tipo: "telemovel", descricao: "Telemóvel", valor: 420, diasDepois: 7, devolvidoApos: 353 },
  { pessoaId: "p-pedro", tipo: "fardamento", descricao: "Fardas de loja", valor: 95, diasDepois: 7, devolvidoApos: 353 },
];

function somar(data: string, dias: number): string {
  return new Date(Date.parse(`${data}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

export function equipamentosIniciais(): EquipamentoPessoa[] {
  const fichas = lerEstado().fichas;
  return ESPECS.flatMap((e, i): EquipamentoPessoa[] => {
    const admissao = fichas[e.pessoaId]?.pessoa.data_admissao ?? diaIso(0);
    const entrega = somar(admissao, e.diasDepois);
    const devolvido = e.devolvidoApos !== undefined;
    return [{
      id: `eq-${i + 1}`, pessoaId: e.pessoaId, tipo: e.tipo, descricao: e.descricao, valor: e.valor, entrega,
      estado: devolvido ? "devolvido" : "atribuido",
      devolucao: devolvido ? somar(entrega, e.devolvidoApos ?? 0) : null,
      estadoDevolucao: devolvido ? "bom" : null,
      autor: AUTOR,
    }];
  });
}
