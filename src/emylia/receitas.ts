// A receita de cada serviço, em detalhe (protótipo, 09/10/2026).
// O custo por unidade de um serviço é a soma de:
//   técnico      horas/un × custo/hora do perfil (do RH)
//   equipamentos amortização: preço de compra ÷ vida útil (h) × horas de uso/un
//   consumíveis  quantidade/un × preço unitário (do fornecedor)
//   estrutura    horas/un × €/h de estrutura (se a empresa a somar ao custo)
// Os números são de EXEMPLO, mas batem certo com os totais (eq e cons) de
// cada serviço em motor.ts, para o detalhe e o orçamento darem o mesmo.

export interface Equipamento { n: string; compra: number; vida: number; uso: number }
export interface Consumivel { n: string; q: number; un: string; preco: number; fornecedor: string; data?: string }
export interface Receita { equip: Equipamento[]; cons: Consumivel[] }

export const RECEITAS: Record<string, Receita> = {
  demol: {
    equip: [
      { n: "Martelo demolidor", compra: 900, vida: 1500, uso: 0.5 },
      { n: "Carro de mão", compra: 120, vida: 2000, uso: 0.5 },
    ],
    cons: [
      { n: "Sacos de entulho", q: 0.4, un: "un", preco: 1.5, fornecedor: "Leroy Merlin Pro" },
      { n: "Disco de corte", q: 0.05, un: "un", preco: 12, fornecedor: "Würth" },
    ],
  },
  canal: {
    equip: [{ n: "Prensa de multicamada", compra: 1700, vida: 2000, uso: 0.4 }],
    cons: [
      { n: "Tubo multicamada 16 mm", q: 3, un: "m", preco: 1.9, fornecedor: "Sanitop" },
      { n: "Uniões e acessórios", q: 1, un: "kit", preco: 2.27, fornecedor: "Sanitop" },
      { n: "Fita e vedante", q: 1, un: "un", preco: 0.5, fornecedor: "Würth" },
    ],
  },
  revest: {
    equip: [],
    cons: [
      { n: "Cimento-cola C2TE", q: 4, un: "kg", preco: 0.19, fornecedor: "Weber", data: "há 8 meses" },
      { n: "Argamassa de juntas", q: 0.25, un: "kg", preco: 1, fornecedor: "Weber" },
    ],
  },
  pav: {
    equip: [],
    cons: [
      { n: "Cimento-cola C2TE", q: 3, un: "kg", preco: 0.19, fornecedor: "Weber", data: "há 8 meses" },
      { n: "Cruzetas e niveladores", q: 1, un: "kit", preco: 0.09, fornecedor: "Leroy Merlin Pro" },
    ],
  },
  loucas: { equip: [], cons: [{ n: "Silicone sanitário", q: 0.25, un: "tubo", preco: 4.84, fornecedor: "Würth" }] },
  moveis: { equip: [], cons: [{ n: "Parafusos e buchas", q: 1, un: "kit", preco: 2, fornecedor: "Würth" }] },
  eletr: {
    equip: [{ n: "Berbequim", compra: 300, vida: 1500, uso: 1 }],
    cons: [
      { n: "Cabo 2,5 mm²", q: 4, un: "m", preco: 0.75, fornecedor: "Rexel" },
      { n: "Caixa e aparelhagem", q: 1, un: "un", preco: 3, fornecedor: "Rexel" },
    ],
  },
  teto: {
    equip: [{ n: "Aparafusadora", compra: 450, vida: 1350, uso: 0.9 }],
    cons: [
      { n: "Placa de pladur hidrófuga", q: 1.05, un: "m²", preco: 6, fornecedor: "Placo" },
      { n: "Perfis metálicos", q: 2.5, un: "ml", preco: 1.2, fornecedor: "Placo" },
      { n: "Parafusos", q: 1, un: "kit", preco: 0.5, fornecedor: "Würth" },
    ],
  },
  pint: {
    equip: [],
    cons: [
      { n: "Tinta acrílica anti-fungos", q: 0.25, un: "l", preco: 7.2, fornecedor: "CIN" },
      { n: "Fita e lixa", q: 1, un: "kit", preco: 0.3, fornecedor: "CIN" },
    ],
  },
};

/** O custo/hora do técnico, como o RH o calcula (exemplo). Só a Direção vê o salário. */
export const CUSTO_TECNICO = {
  salario: 1900, meses: 14, tsu: 0.2375, seguros: 713, horas: 1345,
};
export const custoAnoTecnico = () => {
  const c = CUSTO_TECNICO, base = c.salario * c.meses;
  return { base, tsu: base * c.tsu, seguros: c.seguros, total: base * (1 + c.tsu) + c.seguros, horas: c.horas };
};

export const amortHora = (e: Equipamento) => e.compra / e.vida;
export const amortUn = (e: Equipamento) => amortHora(e) * e.uso;
export const consUn = (c: Consumivel) => c.q * c.preco;
