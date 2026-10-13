// O que cada resposta do levantamento faz ao orçamento (13/10/2026). Funções puras, sem React.
// Três tipos de efeito: uma linha com custo e preço (ex.: proteções), uma percentagem sobre os
// serviços (ex.: acesso difícil) e uma mudança nos materiais (materiais do cliente).
// Os valores são de exemplo; na app real vêm das Definições de cada empresa.

export interface Efeito {
  /** O campo que dá o efeito (pode haver mais de um campo a pesar no mesmo efeito). */
  k: string;
  t: "linha" | "percent" | "material";
  /** O texto da linha no orçamento. */
  d: string;
  custo: number;
  preco: number;
  /** Só em "percent": 0,10 = +10% sobre os serviços. */
  pct?: number;
  /** Só em "material": multiplica o custo e o preço da linha de materiais (0 = sai). */
  fator?: number;
}

/** O prefixo das linhas que o levantamento põe no orçamento (para as refazer quando uma resposta muda). */
export const PREFIXO_LEV = "Levantamento · ";

const r2 = (x: number) => Math.round(x * 100) / 100;
const linha = (k: string, d: string, custo: number, preco: number): Efeito => ({ k, t: "linha", d, custo: r2(custo), preco: r2(preco) });
const pctEf = (k: string, d: string, pct: number): Efeito => ({ k, t: "percent", d, custo: 0, preco: 0, pct });

// Preços de exemplo (custo / preço ao cliente)
const CARTAO_M = [1.1, 2.2];        // cartão canelado, por metro de caminho
const PLASTICO_PORTA = [3, 7];      // plástico de proteção, por porta
const ELEVADOR = [20, 45];          // proteção da cabine do elevador
const ESCADA_H = [22, 35];          // hora de transporte de material e entulho pela escada
const MOVEIS = { Médio: [10, 25], Muito: [25, 60] } as Record<string, number[]>;
const ASPIRACAO = [25, 50];         // aspiração / extração de pó nos cortes
const PARQUE_DIA = { Verde: 4, Amarela: 8, Vermelha: 14 } as Record<string, number>;
const DIAS_OBRA_PADRAO = 10;
const AMIANTO = [300, 520];         // remoção certificada
const GAS = { Anular: [110, 182], Instalar: [280, 450] } as Record<string, number[]>;

/** Todos os efeitos das respostas dadas até agora. */
export function efeitosDoLevantamento(f: Record<string, string>): Efeito[] {
  const e: Efeito[] = [];
  // Proteções e logística
  const caminho = f.diag_distancia_entrada?.startsWith("Longa") ? 20 : f.diag_distancia_entrada?.startsWith("Média") ? 12 : f.diag_distancia_entrada ? 5 : 0;
  if (caminho) e.push(linha("diag_distancia_entrada", `Proteção do caminho: cartão canelado (${caminho} m)`, CARTAO_M[0] * caminho, CARTAO_M[1] * caminho));
  const portas = Number(f.diag_portas_proteger) || 0;
  if (portas > 0) e.push(linha("diag_portas_proteger", `Plástico de proteção em ${portas} ${portas === 1 ? "porta" : "portas"}`, PLASTICO_PORTA[0] * portas, PLASTICO_PORTA[1] * portas));
  if (MOVEIS[f.diag_mobilada]) e.push(linha("diag_mobilada", `Cobrir os móveis no caminho (${f.diag_mobilada.toLowerCase()})`, MOVEIS[f.diag_mobilada][0], MOVEIS[f.diag_mobilada][1]));
  if (f.tem_elevador === "Sim") e.push(linha("tem_elevador", "Proteção do elevador", ELEVADOR[0], ELEVADOR[1]));
  const andar = Number(f.andar) || 0;
  if (f.tem_elevador === "Não" && andar >= 1) {
    const h = andar * 1.5;
    e.push(linha("andar", `Transporte pela escada (${andar}.º andar, ${String(h).replace(".", ",")} h)`, ESCADA_H[0] * h, ESCADA_H[1] * h));
  }
  if (f.diag_local_cortes === "Na própria área") e.push(linha("diag_local_cortes", "Aspiração de pó nos cortes", ASPIRACAO[0], ASPIRACAO[1]));
  if (f.diag_local_cortes === "Fora (garagem, rua)") e.push(linha("diag_local_cortes", "Deslocações para cortar fora (2 h)", ESCADA_H[0] * 2, ESCADA_H[1] * 2));
  if (f.estacionamento === "Pago") {
    const dia = PARQUE_DIA[f.zona_estacionamento] ?? PARQUE_DIA.Amarela, dias = Number(f.prazo_exec) || DIAS_OBRA_PADRAO;
    e.push(linha(f.zona_estacionamento ? "zona_estacionamento" : "estacionamento", `Estacionamento pago (${dias} dias × ${dia} €)`, dia * dias, dia * dias));
  }
  // Trabalhos que o levantamento obriga
  if (f.amianto === "Sim") e.push(linha("amianto", "Remoção certificada de amianto", AMIANTO[0], AMIANTO[1]));
  if (GAS[f.diag_gas]) e.push(linha("diag_gas", f.diag_gas === "Anular" ? "Anulação de ponto de gás" : "Instalação de ponto de gás", GAS[f.diag_gas][0], GAS[f.diag_gas][1]));
  // Percentagens sobre os serviços
  if (f.acesso === "Difícil" && f.impacto_percent) e.push(pctEf("impacto_percent", `Acesso difícil (+${f.impacto_percent})`, (parseFloat(f.impacto_percent) || 0) / 100));
  if (f.habitada_durante_obra === "Sim") e.push(pctEf("habitada_durante_obra", "Casa habitada: limpeza diária e arrumação (+4%)", 0.04));
  if (f.diag_janela === "Não") e.push(pctEf("diag_janela", "Sem janela: trabalhos com pó mais lentos (+3%)", 0.03));
  // Materiais
  if (f.materiais_cliente === "Sim") e.push({ k: "materiais_cliente", t: "material", d: "Materiais fornecidos pelo cliente: sai a linha de materiais", custo: 0, preco: 0, fator: 0 });
  return e;
}

/** Os efeitos de um só campo (para mostrar ao lado da resposta). */
export const efeitosDoCampo = (k: string, f: Record<string, string>): Efeito[] => efeitosDoLevantamento(f).filter((e) => e.k === k);

/** Os campos que podem mexer no orçamento (para o aviso "mexe no orçamento" ao lado do campo). */
export const CAMPOS_COM_EFEITO = new Set([
  "diag_distancia_entrada", "diag_portas_proteger", "diag_mobilada", "tem_elevador", "andar", "diag_local_cortes", "estacionamento",
  "zona_estacionamento", "amianto", "diag_gas", "impacto_percent", "habitada_durante_obra", "diag_janela", "materiais_cliente",
]);
