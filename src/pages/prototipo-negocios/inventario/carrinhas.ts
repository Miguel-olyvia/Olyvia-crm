// As carrinhas da Frota (frota/seed.ts) que são armazéns móveis no Inventário: um armazém do tipo "viatura" por carrinha, com o stock de exemplo
// do protótipo da Frota. Só dados (sem o motor do Inventário), para a Frota e o resto do protótipo os lerem sem carregar o Inventário.
// Não servem clientes (não entram na reserva FIFO das ECs): repõem-se por transferência a partir do Armazém Central. Cada linha: [sku, quantidade, mínimo].
export interface Carrinha { id: string; mat: string; condutor: string; cidade: string; stock: readonly (readonly [string, number, number])[] }

export const CARRINHAS: readonly Carrinha[] = [
  { id: "VIA-AA-12-BC", mat: "AA-12-BC", condutor: "João Silva", cidade: "Lisboa", stock: [["TM-16", 45, 50], ["VE-12", 12, 6], ["FT-01", 18, 10], ["SIL-N", 3, 5], ["ABR-48", 100, 50]] },
  { id: "VIA-45-XZ-78", mat: "45-XZ-78", condutor: "Rui Alves", cidade: "Almada", stock: [["TP-U", 3, 4], ["KV-C", 6, 4], ["NTC-10", 2, 2], ["FUS-3", 20, 10]] },
  { id: "VIA-BR-03-QP", mat: "BR-03-QP", condutor: "Hugo Neves", cidade: "Seixal", stock: [["TM-16", 30, 50], ["VE-12", 5, 6]] },
  { id: "VIA-12-TT-90", mat: "12-TT-90", condutor: "Marco Antunes", cidade: "Lisboa", stock: [["TC-15", 20, 20], ["CC-15", 30, 20], ["SOL-K", 2, 2], ["ISO-15", 8, 12]] },
  { id: "VIA-AF-77-LM", mat: "AF-77-LM", condutor: "Sérgio Faria", cidade: "Leiria", stock: [["FAC-01", 6, 4], ["R32", 1, 1], ["LIMP-B", 4, 3]] },
  { id: "VIA-BX-55-RT", mat: "BX-55-RT", condutor: "Partilhada", cidade: "Lisboa", stock: [["ESC-7", 1, 1], ["SDS-K", 1, 1]] },
];
