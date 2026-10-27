// O caso real da proposta P-2026-0109 e do contrato CC-2026-0331 (Mudelar, 7 de outubro de 2026), linha a linha, como vem no PDF.
// Serve o teste casoAnabela.test.ts: o contrato todo, da lead ao fim da obra, numa organização real (estadoVazio).
/* eslint-disable */
export interface LinhaP { sku: string | null; d: string; iva: 6 | 23; q: number; pu: number }
export interface BundleP { b: string; q: number; pu: number; total: number; c: LinhaP[] }
export type ItemP = LinhaP | BundleP;
const L = (sku: string | null, d: string, iva: 6 | 23, q: number, pu: number): LinhaP => ({ sku, d, iva, q, pu });
export const ZONAS: { zona: string; itens: ItemP[] }[] = [
 { zona: "Geral", itens: [
  L("RSPC0014", "Rodapé Branco 7 cm M/L", 23, 80, 5.60),
  { b: "Estucar e Pintar Paredes com Materiais m2", q: 202, pu: 24.89, total: 5027.78, c: [L("MGM1","Tinta Vinyl + Primário e Estuque para paredes m2",23,202,4.90), L("MOEPP","Mão de Obra - Pintura e Estuque Paredes m2",6,202,20)] },
  { b: "Pintura de Teto com reparação m2", q: 57, pu: 22.26, total: 1268.82, c: [L("MGM0","Tinta Vinyl + Primário para teto m2",23,57,2.25), L("MOPTR","Mão de Obra - Pintura de teto com Reparação m2",6,57,20)] },
  { b: "Teto Falso em Pladur Com Instalação m2", q: 18, pu: 75.46, total: 1358.28, c: [L("MGM13","Teto Falso em Pladur m2",23,18,37.5), L("MGM0","Tinta Vinyl + Primário para teto m2",23,18,2.25), L("MOITFPCF","Mão de Obra - Instalação de teto Falso em Pladur C/ focos Led",6,18,35.71)] },
  { b: "Abertura e Fecho de Roço C/ Acabamento ML", q: 5, pu: 17.86, total: 89.30, c: [L("MGM6","Acabamento Roço m2",23,5,0.72), L("MOAFRCA","Mão de Obra Abertura e Fecho de Roço c/ Acabamento ml",6,5,17.14)] },
  { b: "Quadro Eletrico até 22 Módulos C/Instalação", q: 1, pu: 1444.07, total: 1444.07, c: [L("MGM0001","Quadro Eletrico até 22 Módulos",23,1,644.03), L("MOME0002","Mão de Obra - Quadro Elétrico até 22 modulos",6,1,800)] },
  { b: "Afagamento e Envernizamento de Pavimento com Verniz m2", q: 80, pu: 29.88, total: 2390.40, c: [L("MGM12","Verniz Berger-Seidle m2",23,80,4.17), L("MOAE","Mão de Obra - Afagamento e Envernizamento de Pavimento m2",6,80,25.71)] },
  L("MATISAC", "Materiais Instalação de Ar Condicionado (trabalho AVAC, 2 técnicos, 8 h cada)", 23, 1, 1129.41),
  L("MATISAC", "Materiais Instalação de Ar Condicionado (tubo de cobre e cabo)", 23, 1, 728.00),
  L("MOME0007", "Mão de Obra Eletricista v/hora", 6, 38, 42.85),
  L(null, "Material Elétrico", 23, 1, 550),
  L(null, "Mão de Obra Instalação de 2 Estrutura em Pladur", 6, 1, 1071.43),
  L(null, "Materiais em Pladur para Estrutura", 23, 1, 250),
 ]},
 { zona: "Casa de banho comum", itens: [
  L("MOMRCCBC", "MO Modelo Remodelação Completa - Casa de Banho Comum", 6, 1, 4432.77),
  L("MOP3DCM", "Projeto 3D 3 imagens - Clientes BMLAR", 6, 1, 196.01),
  { b: "Base Duche Com Instalação 80x80", q: 1, pu: 248.88, total: 248.88, c: [L("MOIBDXXL","Instalação de Base de Duche",6,1,107.14), L("DBBD0028","Base de Duche STONE PLUS 80x80",23,1,141.75)] },
  { b: "Resguardo de Duche c/Instalação 80x195", q: 1, pu: 586.28, total: 586.28, c: [L("MOIRKENNAXXL","Instalação de Resguardo",6,1,89.28), L("DBR0092","RESGUARDO BASIC ANGULAR 2P 2F 80X80",23,1,497)] },
  { b: "Pavimento c/Instalação", q: 3, pu: 59.05, total: 177.15, c: [L("MOIP","Instalação de Pavimento m2",6,3,35.71), L("RP0009","Revestimento TRAVERTRINO NAVONA",23,3,23.33)] },
  { b: "Ventax C/Instalação", q: 1, pu: 80.70, total: 80.70, c: [L("MOIV","Instalação de Ventaxia WC",6,1,35.71), L("MVWC","Ventax WC",23,1,45)] },
  { b: "Móvel Lavatório c/Instalação Branco", q: 1, pu: 278.58, total: 278.58, c: [L("MOIL","Instalação de Lavatório Cerâmica",6,1,17.86), L("MOIMWC","Instalação de Mobiliário WC",6,1,35.72), L("MACBML0084","Móvel AXIS Suspenso c/lavatório 70x50x45 - 2 Gav",23,1,225)] },
  { b: "Revestimento Cerâmico c/Instalação", q: 15, pu: 59.05, total: 885.75, c: [L("MOIR","Instalação de Revestimento m2",6,15,35.71), L("RP0009","Revestimento TRAVERTRINO NAVONA",23,15,23.33)] },
  { b: "Sanita Compacta C/Instalação", q: 1, pu: 286.89, total: 286.89, c: [L("MOISBTW","Instalação de Sanita Compacta",6,1,53.57), L("LSS0009","SANITA GLAMIC BTW BRANCO BRILHO",23,1,233.33)] },
  { b: "Espelho Led / Retroiluminado c/Instalação", q: 1, pu: 172.39, total: 172.39, c: [L("MOIECL","Instalação de Espelho com LED",6,1,35.72), L("MACBE0015","Espelho REDONDO RETROILUMINADO LED 60",23,1,136.67)] },
  { b: "Tomada C/Tampa C/Instalação", q: 2, pu: 36.57, total: 73.14, c: [L("MGM5","Tomada c/tampa",23,2,8), L("MOIET","Instalação Elétrica de tomada",6,2,28.57)] },
  L("MOICD", "Instalação de Coluna de Duche", 6, 1, 53.57),
  L("MOITL", "Instalação de torneira de lavatório", 6, 1, 17.86),
 ]},
 { zona: "Casa de banho suite", itens: [
  L("MOMRCCBC", "MO Modelo Remodelação Completa - Casa de Banho Comum", 6, 1, 4432.77),
  { b: "Base Duche Com Instalação 150x87", q: 1, pu: 386.89, total: 386.89, c: [L("MOIBDXXL","Instalação de Base de Duche",6,1,107.14), L("DBBD0061","Base de Duche STONE PLUS 90x160",23,1,279.75)] },
  { b: "Resguardo de Duche c/Instalação", q: 1, pu: 512.61, total: 512.61, c: [L("MOIRKENNAXXL","Instalação de Resguardo",6,1,89.28), L("DBR0316","RESGUARDO SPAZIO CORREDERA 70 (74,5-76)",23,1,423.33)] },
  { b: "Revestimento Cerâmico c/Instalação", q: 29, pu: 59.05, total: 1712.45, c: [L("MOIR","Instalação de Revestimento m2",6,29,35.71), L("RP0009","Revestimento TRAVERTRINO NAVONA",23,29,23.33)] },
  { b: "Pavimento c/Instalação", q: 9, pu: 59.05, total: 531.45, c: [L("MOIP","Instalação de Pavimento m2",6,9,35.71), L("RP0009","Revestimento TRAVERTRINO NAVONA",23,9,23.33)] },
  { b: "Sanita Compacta C/Instalação", q: 1, pu: 286.89, total: 286.89, c: [L("MOISBTW","Instalação de Sanita Compacta",6,1,53.57), L("LSS0009","SANITA GLAMIC BTW BRANCO BRILHO",23,1,233.33)] },
  { b: "Móvel Lavatório c/Instalação 1 lavatório", q: 1, pu: 944.59, total: 944.59, c: [L("MOIL","Instalação de Lavatório Cerâmica",6,1,17.86), L("MOIMWC","Instalação de Mobiliário WC",6,1,35.72), L("MACBML0091","Móvel AXIS Suspenso c/lavatório 150x50x45 - 4 Gav - 2 lav",23,1,891)] },
  L("MODPE", "Mão de Obra - Deslocação de Ponto de Esgoto ML", 6, 2, 53.57),
  L("MOIET", "Instalação Elétrica de tomada (tomadas para máquinas)", 6, 2, 28.57),
  L("MOIET", "Instalação Elétrica de tomada", 6, 2, 28.57),
  L("MGM5", "Tomada c/tampa", 23, 2, 8.75),
  { b: "Espelho Led / Retroiluminado c/Instalação", q: 1, pu: 427.39, total: 427.39, c: [L("MOIECL","Instalação de Espelho com LED",6,1,35.72), L("MACBE0029","Espelho FLORENÇA HORIZONTAL 120X50",23,1,391.67)] },
  L("MOP3DCM", "Projeto 3D 3 imagens - Clientes BMLAR", 6, 1, 196.01),
  { b: "Toalheiro Elétrico C/Instalação", q: 1, pu: 327.40, total: 327.40, c: [L("MOITE","Instalação de Toalheiros Eletricos",6,1,35.72), L("ACBT0013","Toalheiro ELÉTRICO HOT BRANCO",23,1,291.67)] },
  L("MOICD", "Instalação de Coluna de Duche", 6, 2, 53.57),
  L("MOITL", "Instalação de torneira de lavatório", 6, 1, 17.86),
 ]},
 { zona: "Cozinha", itens: [
  L("MOMRCC", "MO Modelo Remodelação Completa - Cozinha", 6, 1, 4713.62),
  L("MODP", "Mão de Obra Demolição de parede m2", 6, 5, 12.14),
  { b: "Acessórios de Cozinha C/ Instalação", q: 1, pu: 948.11, total: 948.11, c: [L("MCCAC0008","Estrutura de Gavetões Internos para dispenseiro",23,1,204.17), L("MCCAC0007","Estrutura para gaveta",23,1,65.63), L("MCCAC0006","Estrutura para gavetão",23,6,65.80), L("MOACIA0009","Instalação Estrutura de Gavetões Internos para dispenseiro",6,1,75), L("MOACIA0002","Instalação Estrutura para gaveta",6,3,21.17), L("MOACIA0005","Instalação Estrutura para gavetão",6,6,24.17)] },
  { b: "Levantamento de Parede em Alvenaria WC", q: 2, pu: 17.86, total: 35.72, c: [L("MGM6","Acabamento Roço m2",23,2,0.72), L("MOLPA","Mão de Obra Levantamento de parede em Alvenaria m2",6,2,17.14)] },
  { b: "Estucar e Pintar Paredes com Materiais m2", q: 20, pu: 24.89, total: 497.80, c: [L("MGM1","Tinta Vinyl + Primário e Estuque para paredes m2",23,20,4.90), L("MOEPP","Mão de Obra - Pintura e Estuque Paredes m2",6,20,20)] },
  { b: "Tomada C/Tampa C/Instalação", q: 6, pu: 37.32, total: 223.92, c: [L("MGM5","Tomada c/tampa",23,6,8.75), L("MOIET","Instalação Elétrica de tomada",6,6,28.57)] },
  { b: "Pavimento c/Instalação", q: 14, pu: 63.64, total: 890.96, c: [L("MOIP","Instalação de Pavimento m2",6,14,35.71), L("RP0011","Revestimento SURFACE MARFIL",23,14,27.92)] },
  { b: "Bancada de Cozinha C/Instalação 1/2", q: 2, pu: 1395.17, total: 2790.34, c: [L("MOIBC","Instalação de Bancada de Cozinha até 1/2 Chapa",6,2,642.85), L("BCL0029","Bancada de Cozinha SURFACE MARFIL 1/2",23,2,752.32)] },
  L("MOAPG", "Anulação de Ponto de Gás", 6, 1, 182),
  { b: "Lava-Louças C/Instalação", q: 1, pu: 367.85, total: 367.85, c: [L("MOILLC","Instalação de Lava Loiça",6,1,17.85), L("LLCCC0011","Lava-louças AMBAR 1 CUBA 50",23,1,350)] },
  { b: "Armário Inferior de cozinha com Instalação", q: 1, pu: 5042.43, total: 5042.43, c: [L("MCCAIC0004","Armário Inferior de cozinha 60cm",23,3,368.20), L("MCCAIC0005","Armário Inferior de cozinha 70cm",23,4,419.30), L("MCCASC0195","Armário Inferior de cozinha Canto em L",23,1,466.67), L("MCCAIC0006","Armário Inferior de cozinha 80cm",23,1,439.37), L("MOACIAI0004","Instalação Armário Inferior de cozinha 60cm",6,3,135.26), L("MOACIAI0006","Instalação Armário Inferior de cozinha 80cm",6,1,161.40), L("MOACIAI0005","Instalação Armário Inferior de cozinha 70cm",6,4,154.03), L("MOACIAI0033","Instalação de Armário Inferior de cozinha Canto em L",6,1,171.43)] },
  { b: "Armário Superior de cozinha com Instalação", q: 1, pu: 3738.51, total: 3738.51, c: [L("MCCASC0012","Armário Superior de cozinha 60x90cm Altura",23,3,379.17), L("MCCASC0013","Armário Superior de cozinha 70x90cm Altura",23,2,430.15), L("MCCASC0001","Armário Superior de cozinha 30x70cm Altura",23,4,184.10), L("MOACIAS0001","Instalação Armário Superior de cozinha 30x70cm Altura",6,4,67.63), L("MOACIAS0012","Instalação Armário Superior de cozinha 60x90cm Altura",6,3,139.29), L("MOACIAS0013","Instalação Armário Superior de cozinha 70x90cm Altura",6,2,158.01)] },
  L("MATISJPVC", "Materiais Instalação de Janelas em PVC (janela de correr 2 folhas 2400x2000 branco)", 23, 1, 1546.36),
  { b: "Eletrodoméstico de Cozinha C/Instalação", q: 1, pu: 434.85, total: 434.85, c: [L("MOIEM","Instalação de Eletrodomésticos Mudelar",6,1,17.85), L("ET0004","Termoacumulador VULCANO 150L",23,1,417)] },
 ]},
];
export const TAXA = { d: "Taxa de Serviço de Consultoria Obra Geral", valor: 1216.87 };
export const OFICIAL = { subtotalProdutos: 56469.30, subtotal: 57686.17, iva6: 2111.36, iva23: 5174.28, iva: 7285.64, total: 64971.81 };
/** O prazo de execução do contrato, em dias úteis. */
export const PRAZO_CONTRATO = 94;
export const PAGAMENTO: [string, number][] = [["Adjudicação", 30], ["1 mês antes do início da obra", 20], ["Início de obra", 15], ["Na retificação das medidas da cozinha", 10], ["Fim de obra", 25]];
