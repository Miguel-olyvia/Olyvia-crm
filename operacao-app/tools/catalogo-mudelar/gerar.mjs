#!/usr/bin/env node
// Catálogo real da Mudelar para o protótipo de Negócios (14/10/2026).
//
// Lê os extratos da base da Mudelar (só leitura, fora do git) e escreve dados compactos em
// src/pages/prototipo-negocios/dados/ (mudelarServicos.ts e mudelarProdutos.ts, gerados).
//
//   node operacao-app/tools/catalogo-mudelar/gerar.mjs [pasta-dos-extratos]
//   (por omissão: <raiz do repositório>/_entrada, ou a variável MUDELAR_ENTRADA)
//
// Entradas: mudelar-servicos.json (358 serviços, PVP e custo reais) e mudelar-produtos.json
// (2.159 produtos, PVP e custo reais, sem imagens).
// O que é REAL: nomes, referências (sku), categorias, marcas e fornecedores quando existem, PVP e custo.
// O que é INVENTADO (com regras fixas, para uma empresa portuguesa de remodelações): os perfis e os
// salários, os equipamentos, os consumíveis, a árvore ofício › sub, a receita de cada serviço (passos,
// horas, equipamentos, consumíveis), a medida da visita, os ícones e as ilustrações, as marcas e os
// fornecedores que faltam, a descrição de uma linha e as relações produto ↔ serviço.
// As horas de cada receita são calibradas para o custo calculado pelo motor (custosModelo.ts, com a
// estrutura) ficar perto do custo real (a ±12%, de propósito, com uma variação fixa por serviço).
//
// Determinístico: semente fixa e variação tirada de um hash do sku (nada de Math.random).
//
// 14/10 ("liga tudo", a partir da vista Problemas das Ligações):
//  · os c1..c41 passam a usar esta receita no protótipo (catalogoMudelar.ts, receitaMudelar);
//  · o material de consumo que vinha como produto (AVAC e Elétrica) passa a consumível e entra nas receitas
//    (eConsumivel; nas receitas pela chave "sku:<sku>"); a bomba de condensados, os focos, a tela radiante, as redes
//    mosquiteiras e os roupeiros ganham o serviço de instalação (servicoDoProduto); os termoacumuladores ficam sem
//    serviço, porque a Mudelar não tem nenhum que os instale (SEM_SERVICO);
//  · os 4 equipamentos sem uso entram nas receitas a que pertencem (pintura, canalização, caixilharia, AVAC).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../../..");
const ENTRADA = path.resolve(process.argv[2] || process.env.MUDELAR_ENTRADA || path.join(RAIZ, "_entrada"));
const PROTO = path.join(RAIZ, "src/pages/prototipo-negocios");
const SAIDA = path.join(PROTO, "dados");
const SEMENTE = 20261014;
const HOJE = "2026-10-13"; // o "hoje" do protótipo (custosModelo.ts)
const GERADO = "2026-10-14";

/* ------------------------------------------------------------------ utilitários */
const normal = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const slug = (s) => normal(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const limpo = (s) => (s == null ? null : String(s).replace(/\s+/g, " ").trim() || null);
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Um número em [0, 1) fixo para cada chave (a mesma chave dá sempre o mesmo número). */
const aleatorio = (chave) => mulberry32(fnv1a(`${SEMENTE}:${chave}`))();
function mesesAntes(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1 - n, 1));
  const ult = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ult)).padStart(2, "0")}`;
}
const num = (x) => (x == null || x === "" ? null : Number(x));

/* ------------------------------------------------------------------ custos (as mesmas contas de custosModelo.ts) */
const PAR = { meses: 14, tsu: 23.75, segurosAno: 713, horasAno: 1345, horasMes: 672 };
const ESTRUTURA_MES = 3400; // custos0().estrutura (5 linhas ativas)
const TAXA_ESTR = ESTRUTURA_MES / PAR.horasMes;
const custoHora = (sal) => (sal == null ? null : (sal * PAR.meses * (1 + PAR.tsu / 100) + PAR.segurosAno) / PAR.horasAno);

/** Os perfis que o protótipo já tem (PERFIS0): não mudam. */
const PERFIS_BASE = [
  ["servente", "Servente · demolição", 1900], ["canalizador", "Canalizador", 1900], ["ladrilhador", "Ladrilhador", null],
  ["montador", "Montador", 1900], ["eletricista", "Eletricista", 1900], ["pintor", "Pintor", 1900], ["gas", "Técnico de gás (ITG)", 2100],
];
/**
 * Os perfis novos, com o salário bruto mensal (inventado, tabela de 2026 de uma PME de remodelações).
 * A média dos salários novos (17.400 € ÷ 9 = 1.933,33 €) é igual à dos perfis de antes, para o custo/hora
 * médio (o do ladrilhador, que continua sem salário) não mudar e os testes de antes continuarem certos.
 */
const PERFIS_NOVOS = [
  ["pedreiro", "Pedreiro", 1950], ["carpinteiro", "Carpinteiro", 2000], ["serralheiro", "Serralheiro · caixilharia", 1900],
  ["ajudante", "Ajudante", 1450], ["marmorista", "Marmorista", 2050], ["tecnico-avac", "Técnico de AVAC", 2250],
  ["pladurista", "Pladurista · tetos e divisórias", 1900], ["projetista", "Projetista · design 3D", 2200], ["motorista", "Motorista · cargas e entulho", 1700],
];
const PERFIS = [...PERFIS_BASE, ...PERFIS_NOVOS];
const MEDIA_HORA = (() => { const v = PERFIS.map((p) => custoHora(p[2])).filter((x) => x != null); return v.reduce((a, b) => a + b, 0) / v.length; })();
const horaPerfil = (id) => { const p = PERFIS.find((x) => x[0] === id); if (!p) throw new Error("perfil " + id); return custoHora(p[2]) ?? MEDIA_HORA; };

/* ------------------------------------------------------------------ equipamentos */
// Os de receitas.ts (já existem no protótipo, com residual 0, manutenção 0 e 600 h/ano): só para as contas.
const EQUIP_BASE = [
  ["Martelo demolidor", 900, 1500, 0, 0, 600], ["Carro de mão", 120, 2000, 0, 0, 600], ["Prensa de multicamada", 1700, 2000, 0, 0, 600],
  ["Berbequim", 300, 1500, 0, 0, 600], ["Aparafusadora", 450, 1350, 0, 0, 600],
];
// Os novos: [nome, compra €, vida útil h, valor residual €, manutenção €/ano, uso h/ano].
const EQUIP_NOVOS = [
  ["Rebarbadora 230 mm", 220, 1200, 20, 25, 300], ["Rebarbadora 125 mm", 140, 1000, 10, 15, 300],
  ["Martelo perfurador SDS-Plus", 380, 1500, 40, 40, 400], ["Roçadeira de parede", 650, 1500, 60, 60, 250],
  ["Aspirador industrial", 450, 2500, 40, 50, 500], ["Cortador manual de cerâmica 120 cm", 320, 3000, 30, 20, 400],
  ["Serra de corte a água", 900, 2500, 80, 90, 350], ["Misturador de argamassas", 260, 2000, 20, 20, 300],
  ["Betoneira 160 l", 650, 5000, 80, 60, 200], ["Nível laser", 480, 4000, 50, 30, 500],
  ["Serra de esquadria", 600, 3000, 60, 50, 300], ["Serra circular", 280, 2000, 25, 25, 300],
  ["Serra tico-tico", 180, 1500, 15, 15, 250], ["Lixadora orbital", 220, 1500, 20, 20, 300],
  ["Máquina de pintura airless", 1400, 3000, 150, 150, 250], ["Lixadora de paredes (girafa)", 750, 2000, 70, 70, 200],
  ["Andaime móvel", 1200, 10000, 200, 80, 400], ["Escadote de alumínio", 160, 5000, 10, 5, 600],
  ["Afagadora de pavimentos", 3200, 4000, 400, 300, 200], ["Bordadora", 1500, 3000, 150, 120, 150],
  ["Detetor de fugas de gás", 350, 5000, 30, 40, 150], ["Kit de ensaio de estanquidade (gás)", 420, 5000, 40, 50, 150],
  ["Multímetro e testador de instalações", 650, 6000, 60, 60, 300], ["Bomba de vácuo (AVAC)", 380, 3000, 30, 30, 150],
  ["Manifold digital (AVAC)", 450, 4000, 40, 30, 150], ["Flangeador e cortador de tubo de cobre", 220, 3000, 20, 15, 150],
  ["Ventosas de vidro (par)", 120, 4000, 10, 5, 200], ["Elevador de placas de pladur", 380, 5000, 40, 20, 200],
  ["Aparafusadora de pladur", 320, 2000, 30, 25, 400], ["Talocha mecânica", 1100, 3000, 100, 100, 150],
  ["Carrinha de obra", 28000, 12000, 8000, 1800, 1500], ["Carrinha basculante 3,5 t", 38000, 10000, 10000, 2500, 1200],
  ["Polidora de pedra", 650, 2000, 50, 60, 250], ["Serra de pedra com carril", 1800, 4000, 150, 120, 300],
  ["Caroteadora", 900, 3000, 80, 80, 150], ["Computador e software 3D", 2500, 6000, 200, 600, 1200],
  ["Soldador de tubo PPR", 180, 1500, 15, 15, 150], ["Serra de esquadria para alumínio e PVC", 950, 3000, 90, 60, 200],
];
const idEquip = (n) => "e-" + slug(n);
const EQUIP = [...EQUIP_BASE, ...EQUIP_NOVOS].map(([n, compra, vida, residual, manutAno, usoAno]) => ({ id: idEquip(n), n, compra, vida, residual, manutAno, usoAno }));
const equipHora = (e) => (e.vida > 0 ? Math.max(0, e.compra - e.residual) / e.vida : 0) + (e.usoAno > 0 ? e.manutAno / e.usoAno : 0);
const EQ = Object.fromEntries(EQUIP.map((e) => [e.id, e]));
// atalhos curtos para as receitas
const E = {
  martelo: "Martelo demolidor", carro: "Carro de mão", prensa: "Prensa de multicamada", berbequim: "Berbequim", aparaf: "Aparafusadora",
  reb230: "Rebarbadora 230 mm", reb125: "Rebarbadora 125 mm", perfurador: "Martelo perfurador SDS-Plus", rocadeira: "Roçadeira de parede",
  aspirador: "Aspirador industrial", cortador: "Cortador manual de cerâmica 120 cm", serraAgua: "Serra de corte a água", misturador: "Misturador de argamassas",
  betoneira: "Betoneira 160 l", laser: "Nível laser", esquadria: "Serra de esquadria", circular: "Serra circular", tico: "Serra tico-tico",
  orbital: "Lixadora orbital", airless: "Máquina de pintura airless", girafa: "Lixadora de paredes (girafa)", andaime: "Andaime móvel",
  escadote: "Escadote de alumínio", afagadora: "Afagadora de pavimentos", bordadora: "Bordadora", detetor: "Detetor de fugas de gás",
  ensaioGas: "Kit de ensaio de estanquidade (gás)", multimetro: "Multímetro e testador de instalações", vacuo: "Bomba de vácuo (AVAC)",
  manifold: "Manifold digital (AVAC)", flangeador: "Flangeador e cortador de tubo de cobre", ventosas: "Ventosas de vidro (par)",
  elevador: "Elevador de placas de pladur", aparafPladur: "Aparafusadora de pladur", talocha: "Talocha mecânica", carrinha: "Carrinha de obra",
  basculante: "Carrinha basculante 3,5 t", polidora: "Polidora de pedra", serraPedra: "Serra de pedra com carril", caroteadora: "Caroteadora",
  pc3d: "Computador e software 3D", ppr: "Soldador de tubo PPR", serraPvc: "Serra de esquadria para alumínio e PVC",
};
for (const [k, n] of Object.entries(E)) { if (!EQ[idEquip(n)]) throw new Error("equipamento " + n); E[k] = idEquip(n); }

/* ------------------------------------------------------------------ consumíveis */
// [chave, nome, unidade, preço €, fornecedor, marca, meses do preço, opcional por omissão]
// Os nomes são diferentes dos consumíveis de receitas.ts (para não mudarem as contas de antes).
const CONS_DEF = [
  // canalização
  ["multi16", "Tubo multicamada 16 mm", "m", 1.85, "Sanitop", "Uponor", 3], ["multi20", "Tubo multicamada 20 mm", "m", 2.6, "Sanitop", "Uponor", 3],
  ["acessMulti", "Acessórios de cravar multicamada", "kit", 6.9, "Sanitop", "Uponor", 4], ["pvc40", "Tubo PVC de esgoto Ø40", "m", 2.1, "Anlorbel", "Fersil", 5],
  ["pvc110", "Tubo PVC de esgoto Ø110", "m", 6.4, "Anlorbel", "Fersil", 5], ["curvasPvc", "Curvas e uniões de PVC", "kit", 4.5, "Anlorbel", "Fersil", 5],
  ["flexivel", "Ligação flexível inox 1/2\"", "un", 4.8, "Sanitop", "Tucai", 2], ["torneiraSeg", "Torneira de segurança 1/2\"", "un", 6.2, "Sanitop", "Arco", 2],
  ["teflon", "Fita de teflon", "un", 0.85, "Würth", "Würth", 9], ["siliconeSan", "Silicone sanitário transparente 280 ml", "tubo", 5.2, "Würth", "Sika", 1],
  ["fixSanita", "Kit de fixação de sanita e bidé", "kit", 3.4, "Sanitop", "Fischer", 6], ["sifao", "Sifão de garrafa cromado", "un", 9.5, "Sanitop", "Rubicer", 4, true],
  ["valvula", "Válvula de descarga de autoclismo", "un", 7.8, "Sanitop", "Geberit", 4, true], ["manga", "Manga de ligação de sanita", "un", 4.1, "Sanitop", "Fersil", 7],
  ["colaPvc", "Cola para PVC 250 ml", "un", 6.3, "Anlorbel", "Tangit", 10],
  // gás
  ["cobre15", "Tubo de cobre 15 mm", "m", 9.8, "Sanitop", "KME", 2], ["flexGas", "Tubo flexível de gás certificado 1 m", "un", 14.5, "Sanitop", "Tucai", 3],
  ["valvGas", "Válvula de corte de gás", "un", 11.2, "Sanitop", "Arco", 3], ["solda", "Solda e decapante", "kit", 7.4, "Würth", "Castolin", 8],
  ["espumaFugas", "Espuma detetora de fugas", "un", 6.9, "Würth", "Würth", 11],
  // eletricidade
  ["cabo15", "Cabo H07V-U 1,5 mm²", "m", 0.32, "Rexel", "Solidal", 1], ["cabo25", "Cabo H07V-U 2,5 mm²", "m", 0.48, "Rexel", "Solidal", 1],
  ["tuboVd", "Tubo VD 20 mm", "m", 0.38, "Rexel", "Efapel", 6], ["caixaDeriv", "Caixa de derivação", "un", 1.2, "Rexel", "Efapel", 6],
  ["caixaApar", "Caixa de aparelhagem", "un", 0.55, "Rexel", "Efapel", 6], ["ligadores", "Ligadores rápidos", "kit", 2.9, "Rexel", "Wago", 2],
  ["fitaIsol", "Abraçadeiras e fita isolante", "kit", 1.8, "Würth", "Würth", 12], ["disj16", "Disjuntor 16 A", "un", 7.9, "Rexel", "Hager", 3],
  ["focoLed", "Foco LED de encastrar", "un", 4.0, "Eletricol", "Eletricol", 2], ["tuboExaust", "Tubo de exaustão em alumínio Ø150", "m", 6.5, "Anlorbel", "Pujol", 7],
  // revestimentos
  ["colaFlex", "Cimento-cola flexível C2TE S1", "kg", 0.42, "Weber", "Weber", 8], ["juntas", "Argamassa de juntas CG2", "kg", 1.35, "Weber", "Weber", 8],
  ["niveladores", "Cunhas e clips de nivelamento", "kit", 3.2, "Leroy Merlin Pro", "Dexter", 4], ["perfilRemate", "Perfil de remate em alumínio", "ml", 4.6, "Anlorbel", "Emac", 5, true],
  ["primario", "Primário de aderência", "l", 6.8, "Anlorbel", "Mapei", 3], ["membrana", "Membrana impermeabilizante líquida", "kg", 5.9, "Anlorbel", "Sika", 2],
  ["bandaCantos", "Banda de reforço para cantos", "ml", 2.4, "Anlorbel", "Sika", 2], ["mantaSpc", "Manta acústica para pavimento flutuante", "m²", 2.1, "Anlorbel", "Duplach", 6, true],
  ["siliconeNeutro", "Silicone neutro", "tubo", 6.1, "Würth", "Soudal", 1], ["microcimento", "Microcimento bicomponente", "kg", 4.8, "Anlorbel", "Topciment", 2],
  ["vernizMicro", "Verniz de poliuretano para microcimento", "l", 22, "Anlorbel", "Topciment", 2],
  // alvenarias
  ["tijolo", "Tijolo 30×20×11", "un", 0.48, "Anlorbel", "Preceram", 9], ["argamassa", "Argamassa pré-doseada (saco 25 kg)", "saco", 3.9, "Anlorbel", "Secil", 7],
  ["cimento", "Cimento Portland (saco 25 kg)", "saco", 5.2, "Anlorbel", "Secil", 7], ["areia", "Areia lavada (saco 25 kg)", "saco", 2.3, "Anlorbel", "Secil", 7],
  ["redeFibra", "Rede de fibra de vidro", "m²", 1.15, "Anlorbel", "Weber", 10, true], ["autonivel", "Argamassa autonivelante (saco 25 kg)", "saco", 14.9, "Weber", "Weber", 4],
  ["laRocha", "Lã de rocha 40 mm", "m²", 3.95, "Anlorbel", "Volcalis", 3],
  // pladur
  ["placaH", "Placa de gesso cartonado hidrófuga 13 mm", "m²", 6.4, "Anlorbel", "Placo", 2], ["perfis48", "Perfil metálico 48 mm", "ml", 1.25, "Anlorbel", "Placo", 2],
  ["parafPladur", "Parafusos para gesso cartonado", "kit", 2.5, "Würth", "Würth", 5], ["fitaMassa", "Fita e massa de juntas", "kit", 3.9, "Anlorbel", "Placo", 5],
  ["suspensoes", "Suspensões e tirantes", "kit", 2.8, "Anlorbel", "Placo", 5],
  // pintura
  ["tintaMate", "Tinta plástica mate branca", "l", 4.2, "CIN", "CIN", 3], ["tintaTeto", "Tinta anti-fungos para tetos", "l", 6.9, "Robbialac", "Robbialac", 3],
  ["primAcril", "Primário acrílico", "l", 5.4, "CIN", "CIN", 3], ["massaRep", "Massa de reparação", "kg", 2.1, "CIN", "Barbot", 13],
  ["protecao", "Fita de pintor e plástico de proteção", "kit", 3.6, "Leroy Merlin Pro", "Tesa", 4], ["lixa", "Lixa", "un", 0.45, "Würth", "Würth", 12],
  ["vernizPav", "Verniz para pavimento de madeira", "l", 18.5, "Anlorbel", "Bona", 6], ["estuque", "Estuque projetado (saco 20 kg)", "saco", 7.8, "Anlorbel", "Secil", 8],
  // montagem e carpintaria
  ["parafMoveis", "Parafusos e buchas para móveis", "kit", 3.5, "Würth", "Fischer", 4], ["calcos", "Calços e pés niveladores", "kit", 2.2, "Würth", "Würth", 4],
  ["colaPu", "Cola de montagem PU", "tubo", 7.9, "Würth", "Sika", 2], ["siliconeAcril", "Silicone acrílico branco", "tubo", 3.8, "Würth", "Soudal", 2, true],
  ["ferragens", "Cavilhas e ferragens de união", "kit", 4.6, "Würth", "Hettich", 5], ["espumaPu", "Espuma de poliuretano", "un", 7.2, "Würth", "Soudal", 3],
  // caixilharia
  ["espumaCaix", "Espuma de poliuretano para caixilharia 750 ml", "un", 8.4, "Anlorbel", "Soudal", 2], ["siliconeCaix", "Silicone para caixilharia", "tubo", 6.6, "Anlorbel", "Soudal", 2],
  ["buchasCaix", "Buchas metálicas para caixilho", "kit", 5.2, "Würth", "Fischer", 5], ["fitaExpansiva", "Fita de vedação expansiva", "ml", 1.1, "Anlorbel", "Soudal", 5, true],
  ["calcosCaix", "Calços de assentamento de caixilho", "kit", 1.6, "Anlorbel", "Alvisun", 5],
  // marmoraria
  ["colaEpoxi", "Cola epóxi para pedra", "kg", 19.5, "Jodiva", "Tenax", 4], ["discoDiam", "Disco diamantado (desgaste)", "un", 4.5, "Jodiva", "Tenax", 6],
  ["siliconePedra", "Silicone para pedra natural", "tubo", 9.2, "Jodiva", "Soudal", 4],
  // AVAC
  ["cobreAvac", "Tubo de cobre isolado 1/4\" + 3/8\"", "m", 9.6, "Frigicoll", "KME", 1], ["r32", "Gás refrigerante R32", "kg", 38, "Frigicoll", "Daikin", 1],
  ["calha", "Calha técnica 80×40", "m", 2.1, "Frigicoll", "Siccom", 3], ["suporteExt", "Suporte de parede para unidade exterior", "un", 18.5, "Frigicoll", "Siccom", 3],
  // geral, demolição, limpeza, transporte
  ["sacosRafia", "Sacos de ráfia para entulho", "un", 0.9, "Leroy Merlin Pro", "Dexter", 8], ["protObra", "Plástico e cartão de proteção de obra", "m²", 0.55, "Leroy Merlin Pro", "Dexter", 5],
  ["discoCorte", "Disco de corte (desgaste)", "un", 2.8, "Würth", "Würth", 8], ["gasoleo", "Gasóleo", "l", 1.72, "Galp Frota", "Galp", 0],
  ["detergente", "Detergentes e produtos de limpeza", "kit", 4.5, "Leroy Merlin Pro", "Sonasol", 9, true], ["taxaRcd", "Taxa de vazadouro de RCD", "t", 25, "Ambigroup", "Ambigroup", 10],
  ["licenca3d", "Licença de software 3D (por projeto)", "un", 18, "Autodesk", "Autodesk", 1],
];
const CONS = CONS_DEF.map(([k, n, un, preco, fornecedor, marca, meses, opcional], i) => ({ k, id: "k" + (i + 1), n, un, preco, fornecedor, marca, data: mesesAntes(HOJE, meses), opcional: !!opcional }));
const K = Object.fromEntries(CONS.map((c) => [c.k, c]));

/* ------------------------------------------------------------------ produtos que são material de consumo */
// Regra (14/10): estes artigos da base da Mudelar não se escolhem na visita nem se instalam um a um: gastam-se na obra.
// Saem da lista de produtos e passam a consumíveis (com a marca, o fornecedor, o custo real, a unidade e a data do
// preço do produto) e entram nas receitas pela chave "sku:<sku>" (ver T: avacHora, quadro, tomada, pontoLuz).
//  · AVAC: tudo o que não é um aparelho. É o material da pré-instalação do ar condicionado: tubo de cobre isolado,
//    tubo anelado, tubo de esgoto, calha, cabo, caixas e tabuleiros de pré-instalação, válvulas de carga, buchas,
//    parafusos e fita. Fica produto a bomba de condensados (é uma peça que se instala).
//  · Elétrica: o fio, o tubo e o material da terra de proteção (caixa de medição da terra, elétrodos). A aparelhagem,
//    os focos e a tela radiante (TECNISIS) continuam produtos.
function eConsumivel(p) {
  const cat = normal(p.cat ?? ""), n = normal(p.name);
  if (cat === "avac") return !/bomba/.test(n);
  // o fio de 1,5 fica produto: traz a "Passagem de fio Eletrico" (MOME0003), que se vende ao metro com ele
  if (cat === "eletrica") return /^fio |^tubo |caixa medi|el?ectrodo/.test(n) && !/^fio 1\.5/.test(n);
  return false;
}
/** A unidade de compra do consumível, pelo nome do artigo (rolo, caixa, saco), senão a do produto. */
function unidadeConsumivel(p) {
  const n = normal(p.name);
  if (/\(cx\s*\d+\s*rolos\)|\/cx\)/.test(n)) return "cx"; // "(cx12rolos)", "(24mts/cx)"
  if (/rolo|\(\d+\s*mts\)/.test(n)) return "rolo"; // "(Rolo c/100mts)", "(100mts)"
  if (/saco \d+ un/.test(n)) return "saco";
  return unidadeProduto(p);
}

/* ------------------------------------------------------------------ a árvore (ofício › sub) */
// Os ofícios e subs que o protótipo já tem não mudam (há testes que os comparam). Juntam-se subs a ofícios
// existentes (menos a Revestimentos, que tem de ficar Parede · Pavimento · Colas e argamassas) e ofícios novos.
const SUBS_NOVOS_EXISTENTES = [
  ["Demolições", ["Entulho", "Portas e mobiliário"]],
  ["Canalização", ["Aquecimento de águas", "Lava-loiças e torneiras de cozinha"]],
  ["Gás (ITG)", ["Redes de gás", "Aparelhos a gás"]],
  ["Carpintaria", ["Móveis de casa de banho", "Resguardos", "Eletrodomésticos", "Roupeiros", "Portas"]],
  ["Eletricidade", ["Aparelhagem e quadros", "Iluminação", "Ventilação"]],
  ["Pintura", ["Paredes", "Tetos"]],
];
const OFICIOS_NOVOS = [
  ["Alvenarias e rebocos", []],
  ["Isolamento e impermeabilização", []],
  ["Caixilharia", ["Janelas", "Redes mosquiteiras"]],
  ["Marmoraria", ["Bancadas de cozinha", "Bancadas de casa de banho"]],
  ["AVAC", ["Ar condicionado"]],
  ["Projeto e design", []],
  ["Serviços gerais", ["Deslocações", "Limpeza"]],
  ["Modelos de obra", ["Casa de banho", "Cozinha"]],
  ["Subempreitadas", ["AVAC", "Gás", "Janelas", "Roupeiros", "Marmoraria", "Piso radiante"]],
];
const OFICIOS_EXISTENTES = ["Demolições", "Canalização", "Revestimentos", "Gás (ITG)", "Carpintaria", "Eletricidade", "Pintura"];
const SUBS_EXISTENTES = {
  "Canalização": ["Águas e esgotos", "Louças e torneiras"], "Revestimentos": ["Parede", "Pavimento", "Colas e argamassas"],
  "Carpintaria": ["Mobiliário", "Pladur", "Acessórios WC"],
};
const temNo = (of, sub) => {
  if (OFICIOS_EXISTENTES.includes(of)) return !sub || (SUBS_EXISTENTES[of] ?? []).includes(sub) || (SUBS_NOVOS_EXISTENTES.find((x) => x[0] === of)?.[1] ?? []).includes(sub);
  const o = OFICIOS_NOVOS.find((x) => x[0] === of);
  return !!o && (!sub || o[1].includes(sub));
};
/** O perfil de cada ofício novo (PERFIL_DO_OFICIO em custosModelo.ts). */
const PERFIL_DOS_OFICIOS_NOVOS = {
  "Alvenarias e rebocos": "pedreiro", "Isolamento e impermeabilização": "pedreiro", "Caixilharia": "serralheiro", "Marmoraria": "marmorista",
  "AVAC": "tecnico-avac", "Projeto e design": "projetista", "Serviços gerais": "ajudante", "Modelos de obra": "pedreiro", "Subempreitadas": "ajudante",
};

/* ------------------------------------------------------------------ as receitas: modelos */
// mo: [passo, perfil, parte das horas]; eq: [equipamento, horas por hora de mão de obra]; cs: [consumível, quantidade por unidade, opcional?]
// mat: parte do custo que é material da própria linha (componentes vendidos como serviço, subempreitadas).
const T = {
  armario: { mo: [["Montagem e fixação do módulo", "montador", 0.75], ["Nivelamento e afinação das portas", "montador", 0.25]], eq: [[E.aparaf, 0.6], [E.laser, 0.25], [E.berbequim, 0.15]], cs: [["parafMoveis", 1], ["calcos", 0.5], ["siliconeAcril", 0.15, true]] },
  armarioLed: { mo: [["Montagem da calha e da fita LED", "eletricista", 0.7], ["Ligação ao ponto de luz", "eletricista", 0.3]], eq: [[E.berbequim, 0.3], [E.multimetro, 0.1]], cs: [["ligadores", 0.3], ["cabo15", 1]] },
  acessCoz: { mo: [["Montagem do acessório", "montador", 1]], eq: [[E.aparaf, 0.5]], cs: [["parafMoveis", 0.3]] },
  componente: { mat: 0.86, mo: [["Montagem do componente", "montador", 1]], eq: [[E.aparaf, 0.5]], cs: [["parafMoveis", 0.2]] },
  conjunto: { mat: 0.78, mo: [["Montagem do conjunto", "montador", 0.8], ["Transporte e arrumação", "ajudante", 0.2]], eq: [[E.aparaf, 0.5], [E.laser, 0.2]], cs: [["parafMoveis", 1], ["ferragens", 1]] },
  cozinhaCompleta: { mo: [["Montagem dos móveis", "montador", 0.6], ["Ligações de água e esgoto", "canalizador", 0.1], ["Ligações elétricas", "eletricista", 0.1], ["Transporte e apoio", "ajudante", 0.2]], eq: [[E.aparaf, 0.5], [E.laser, 0.2], [E.tico, 0.05], [E.caroteadora, 0.02]], cs: [["parafMoveis", 12], ["calcos", 6], ["ferragens", 4], ["siliconeSan", 2], ["flexivel", 2], ["ligadores", 2]] },
  roupeiro: { mo: [["Montagem do corpo e das prateleiras", "carpinteiro", 0.55], ["Portas, calhas e ferragens", "carpinteiro", 0.3], ["Transporte e arrumação", "ajudante", 0.15]], eq: [[E.aparaf, 0.6], [E.laser, 0.3], [E.esquadria, 0.1]], cs: [["parafMoveis", 2], ["ferragens", 1], ["calcos", 1]] },
  // 14/10: a serra de esquadria para alumínio e PVC (acertos de perfis e remates; também nas redes)
  janela: { mo: [["Assentamento e fixação do aro", "serralheiro", 0.45], ["Montagem das folhas e afinação", "serralheiro", 0.2], ["Vedação e remates", "ajudante", 0.35]], eq: [[E.perfurador, 0.3], [E.laser, 0.3], [E.ventosas, 0.3], [E.escadote, 0.5], [E.serraPvc, 0.15]], cs: [["espumaCaix", 1], ["siliconeCaix", 1], ["buchasCaix", 1], ["fitaExpansiva", 4, true], ["calcosCaix", 1]] },
  rede: { mo: [["Montagem da rede no vão", "serralheiro", 1]], eq: [[E.berbequim, 0.4], [E.serraPvc, 0.2]], cs: [["buchasCaix", 0.5], ["siliconeCaix", 0.3]] },
  porta: { mo: [["Aro e guarnições", "carpinteiro", 0.6], ["Folha e ferragens", "carpinteiro", 0.3], ["Remates e limpeza", "ajudante", 0.1]], eq: [[E.esquadria, 0.2], [E.laser, 0.3], [E.aparaf, 0.4]], cs: [["espumaPu", 1], ["colaPu", 1], ["parafMoveis", 1]] },
  retirarPorta: { mo: [["Desmontagem da folha e do aro", "carpinteiro", 0.7], ["Remoção e arrumação", "ajudante", 0.3]], eq: [[E.reb125, 0.2], [E.perfurador, 0.2]], cs: [["sacosRafia", 2], ["discoCorte", 0.2]] },
  marmorBancada: { mo: [["Medição, corte e furação", "marmorista", 0.35], ["Assentamento e nivelamento", "marmorista", 0.4], ["Colagem, remates e silicone", "ajudante", 0.25]], eq: [[E.serraPedra, 0.3], [E.polidora, 0.2], [E.ventosas, 0.3], [E.caroteadora, 0.05]], cs: [["colaEpoxi", 0.6], ["siliconePedra", 1], ["discoDiam", 1]] },
  marmorMl: { mo: [["Corte e acabamento", "marmorista", 1]], eq: [[E.serraPedra, 0.6], [E.polidora, 0.4]], cs: [["discoDiam", 0.3], ["colaEpoxi", 0.1]] },
  marmorCuba: { mo: [["Abertura e colagem da cuba", "marmorista", 0.8], ["Acabamento", "ajudante", 0.2]], eq: [[E.serraPedra, 0.4], [E.polidora, 0.3], [E.caroteadora, 0.1]], cs: [["colaEpoxi", 0.5], ["siliconePedra", 1], ["discoDiam", 1]] },
  grua: { mat: 0.75, mo: [["Acompanhamento da descarga", "marmorista", 0.5], ["Apoio à grua", "ajudante", 0.5]], eq: [[E.ventosas, 1]], cs: [["protObra", 6]] },
  projeto: { mo: [["Modelação e imagens 3D", "projetista", 0.85], ["Reunião com o cliente", "projetista", 0.15]], eq: [[E.pc3d, 1]], cs: [["licenca3d", 1]] },
  // 14/10: o flangeador e cortador de tubo de cobre, e o material da pré-instalação que vinha como produto (por hora,
  // a média de uma instalação de split de cerca de 6 h: ~3 m de cada tubo de cobre, 1 m de cabo, 0,5 m de calha…)
  avacHora: { horas: true, mo: [["Técnico de AVAC", "tecnico-avac", 1], ["Ajudante", "ajudante", 1]], eq: [[E.vacuo, 0.3], [E.manifold, 0.3], [E.carrinha, 0.5], [E.flangeador, 0.2]],
    cs: [["fitaIsol", 0.2], ["sku:AVAC0003", 0.01], ["sku:AVAC0004", 0.01], ["sku:AVAC0008", 0.01], ["sku:AVAC0006", 0.02], ["sku:AVAC0001", 0.01], ["sku:AVAC0002", 0.01],
      ["sku:AVAC0010", 0.02], ["sku:AVAC0005", 0.05], ["sku:AVAC0009", 0.05], ["sku:AVAC0014", 0.05], ["sku:AVAC0011", 0.2], ["sku:AVAC0012", 0.2], ["sku:AVAC0013", 0.02]] },
  eletrHora: { horas: true, mo: [["Eletricista", "eletricista", 1]], eq: [], cs: [] },
  deslocacao: { mo: [["Condução (por km)", "motorista", 1]], eq: [[E.carrinha, 1]], cs: [["gasoleo", 0.08]] },
  pontoEletr: { mo: [["Montagem e ligação", "eletricista", 0.85], ["Ensaio", "eletricista", 0.15]], eq: [[E.multimetro, 0.15], [E.berbequim, 0.2]], cs: [["caixaApar", 1], ["ligadores", 0.3]] },
  // 14/10: o fio 2,5 já enfiado no tubo da Mudelar (MGME0007) no lugar do cabo e do tubo VD
  tomada: { mo: [["Abertura, enfiamento e montagem", "eletricista", 0.85], ["Ensaio", "eletricista", 0.15]], eq: [[E.multimetro, 0.15], [E.rocadeira, 0.15]], cs: [["caixaApar", 1], ["sku:MGME0007", 3], ["ligadores", 0.3]] },
  disjuntor: { mo: [["Montagem e ligação no quadro", "eletricista", 1]], eq: [[E.multimetro, 0.3]], cs: [["ligadores", 0.2]] },
  // 14/10: a alimentação (fio de 6 mm em tubo de 25 mm) e a terra de proteção (fio verde-amarelo de 16 mm, elétrodo, caixa de medição) da Mudelar
  quadro: { mo: [["Montagem e ligação do quadro", "eletricista", 0.7], ["Abertura e fecho de roços", "ajudante", 0.3]], eq: [[E.multimetro, 0.3], [E.perfurador, 0.2], [E.rocadeira, 0.1]],
    cs: [["disj16", 6], ["ligadores", 3], ["fitaIsol", 2], ["cabo25", 10], ["sku:MGME0009", 10], ["sku:MGME0006", 5], ["sku:MGME0003", 5], ["sku:MGME0005", 1], ["sku:MGME0004", 1]] },
  fioMl: { mo: [["Enfiamento do cabo", "eletricista", 1]], eq: [], cs: [["cabo15", 2.1], ["tuboVd", 1.05]] },
  fitaLed: { mo: [["Montagem do perfil e da fita LED", "eletricista", 1]], eq: [[E.berbequim, 0.2], [E.esquadria, 0.05]], cs: [["fitaIsol", 0.2], ["ligadores", 0.1]] },
  // 14/10: a linha nova em tubo de 25 mm da Mudelar (MGME0010) no lugar do tubo VD
  pontoLuz: { mo: [["Abertura de roço e nova linha", "eletricista", 0.8], ["Fecho do roço", "pedreiro", 0.2]], eq: [[E.rocadeira, 0.3], [E.multimetro, 0.1]], cs: [["cabo25", 6], ["sku:MGME0010", 5], ["caixaApar", 1], ["argamassa", 0.2]] },
  aplique: { mo: [["Fixação e ligação", "eletricista", 1]], eq: [[E.berbequim, 0.3], [E.multimetro, 0.1]], cs: [["caixaDeriv", 1], ["ligadores", 0.3]] },
  ventax: { mo: [["Furação e montagem", "eletricista", 0.7], ["Remates", "pedreiro", 0.3]], eq: [[E.caroteadora, 0.3], [E.multimetro, 0.1]], cs: [["tuboExaust", 1], ["cabo15", 4], ["caixaApar", 1]] },
  chamine: { mo: [["Montagem da chaminé", "montador", 0.5], ["Ligação elétrica", "eletricista", 0.2], ["Furação e remates do teto", "pladurista", 0.3]], eq: [[E.caroteadora, 0.2], [E.escadote, 0.6], [E.berbequim, 0.3]], cs: [["tuboExaust", 3], ["parafMoveis", 1], ["cabo15", 4]] },
  eletrodom: { mo: [["Encastre e montagem", "montador", 0.7], ["Ligação e ensaio", "eletricista", 0.3]], eq: [[E.aparaf, 0.3], [E.multimetro, 0.1]], cs: [["parafMoveis", 0.5], ["ligadores", 0.3], ["flexivel", 0.5, true]] },
  eletroGas: { mo: [["Ligação ao gás e ensaio", "gas", 0.8], ["Apoio", "ajudante", 0.2]], eq: [[E.detetor, 0.3], [E.ensaioGas, 0.3]], cs: [["flexGas", 1], ["valvGas", 1], ["espumaFugas", 0.3]] },
  gasAnular: { mo: [["Corte e tamponamento do ponto", "gas", 0.8], ["Ensaio de estanquidade", "gas", 0.2]], eq: [[E.ensaioGas, 0.4], [E.detetor, 0.3], [E.flangeador, 0.3]], cs: [["solda", 0.5], ["espumaFugas", 0.3], ["cobre15", 0.5]] },
  gasCert: { mat: 0.35, mo: [["Ensaio de estanquidade e relatório", "gas", 1]], eq: [[E.ensaioGas, 1], [E.detetor, 0.5]], cs: [["espumaFugas", 1]] },
  gasRede: { mo: [["Traçado e tubagem de cobre", "gas", 0.7], ["Roços e fixações", "ajudante", 0.3]], eq: [[E.flangeador, 0.4], [E.rocadeira, 0.2], [E.ensaioGas, 0.1], [E.detetor, 0.1]], cs: [["cobre15", 12], ["solda", 2], ["valvGas", 2], ["argamassa", 2], ["espumaFugas", 1]] },
  caldeiraMont: { mo: [["Montagem e ligações", "gas", 0.7], ["Apoio", "ajudante", 0.3]], eq: [[E.detetor, 0.3], [E.ensaioGas, 0.3], [E.perfurador, 0.2], [E.caroteadora, 0.1]], cs: [["flexGas", 1], ["valvGas", 1], ["tuboExaust", 2], ["flexivel", 2], ["espumaFugas", 0.5]] },
  caldeiraDesm: { mo: [["Corte do gás e desmontagem", "gas", 0.6], ["Remoção", "ajudante", 0.4]], eq: [[E.detetor, 0.3], [E.carro, 0.3]], cs: [["solda", 0.3], ["sacosRafia", 2]] },
  loica: { mo: [["Assentamento e fixação", "canalizador", 0.7], ["Ligações de água e esgoto e ensaio", "canalizador", 0.3]], eq: [[E.berbequim, 0.3], [E.laser, 0.2]], cs: [["siliconeSan", 0.3], ["fixSanita", 1], ["flexivel", 1], ["teflon", 0.2]] },
  sanita: { mo: [["Assentamento e fixação", "canalizador", 0.7], ["Ligações de água e esgoto e ensaio", "canalizador", 0.3]], eq: [[E.berbequim, 0.3], [E.laser, 0.1]], cs: [["siliconeSan", 0.3], ["fixSanita", 1], ["flexivel", 1], ["manga", 1], ["valvula", 1, true]] },
  sanitaSusp: { mo: [["Estrutura de encastrar e fixação", "canalizador", 0.6], ["Ligações e ensaio", "canalizador", 0.25], ["Fecho em pladur ou alvenaria", "pedreiro", 0.15]], eq: [[E.perfurador, 0.3], [E.laser, 0.3]], cs: [["siliconeSan", 0.3], ["manga", 1], ["flexivel", 1], ["pvc110", 0.5], ["curvasPvc", 0.5]] },
  sanitaEletr: { mo: [["Assentamento e ligações de água", "canalizador", 0.6], ["Ponto elétrico e ligação", "eletricista", 0.4]], eq: [[E.berbequim, 0.3], [E.multimetro, 0.2]], cs: [["siliconeSan", 0.3], ["fixSanita", 1], ["flexivel", 1], ["manga", 1], ["cabo25", 4], ["caixaApar", 1]] },
  base: { mo: [["Nivelamento e assentamento", "canalizador", 0.6], ["Ligação ao esgoto e vedação", "canalizador", 0.4]], eq: [[E.laser, 0.3], [E.misturador, 0.2]], cs: [["argamassa", 1], ["siliconeSan", 0.5], ["pvc40", 1], ["curvasPvc", 0.3]] },
  banheira: { mo: [["Assentamento e nivelamento", "canalizador", 0.6], ["Ligações e vedação", "canalizador", 0.4]], eq: [[E.laser, 0.3], [E.misturador, 0.2]], cs: [["argamassa", 1], ["siliconeSan", 0.5], ["pvc40", 1], ["curvasPvc", 0.3]] },
  torneira: { mo: [["Montagem e ligação", "canalizador", 1]], eq: [[E.berbequim, 0.1]], cs: [["flexivel", 1], ["teflon", 0.2], ["siliconeSan", 0.1]] },
  torneiraEnc: { mo: [["Corpo de encastrar e ligações", "canalizador", 0.75], ["Roço e fecho", "pedreiro", 0.25]], eq: [[E.rocadeira, 0.3], [E.prensa, 0.2]], cs: [["multi16", 2], ["acessMulti", 1], ["argamassa", 0.3], ["teflon", 0.2]] },
  coluna: { mo: [["Fixação e ligação", "canalizador", 1]], eq: [[E.berbequim, 0.3], [E.laser, 0.2]], cs: [["teflon", 0.2], ["siliconeSan", 0.2], ["parafMoveis", 0.5]] },
  colunaEnc: { mo: [["Corpo de encastrar e ligações", "canalizador", 0.7], ["Roço e fecho", "pedreiro", 0.3]], eq: [[E.rocadeira, 0.3], [E.prensa, 0.2], [E.laser, 0.2]], cs: [["multi16", 3], ["acessMulti", 1], ["argamassa", 0.3], ["teflon", 0.2]] },
  lavaLoica: { mo: [["Montagem e ligações", "canalizador", 1]], eq: [[E.tico, 0.2]], cs: [["sifao", 1, true], ["flexivel", 2], ["siliconeSan", 0.3]] },
  movelWc: { mo: [["Montagem e fixação do móvel", "montador", 0.8], ["Ligação do sifão", "canalizador", 0.2]], eq: [[E.aparaf, 0.4], [E.berbequim, 0.3], [E.laser, 0.3]], cs: [["parafMoveis", 1], ["siliconeSan", 0.2], ["sifao", 1, true]] },
  tampoWc: { mo: [["Assentamento e fixação", "montador", 1]], eq: [[E.laser, 0.3], [E.berbequim, 0.2]], cs: [["colaPu", 0.5], ["siliconeSan", 0.3]] },
  resguardo: { mo: [["Perfis, fixação e vidro", "montador", 0.8], ["Vedação", "montador", 0.2]], eq: [[E.berbequim, 0.3], [E.laser, 0.3], [E.ventosas, 0.3]], cs: [["siliconeNeutro", 1], ["parafMoveis", 0.5]] },
  serigrafia: { mat: 0.7, mo: [["Aplicação e limpeza", "montador", 1]], eq: [], cs: [["detergente", 0.2]] },
  acessWc: { mo: [["Marcação, furação e fixação", "montador", 1]], eq: [[E.berbequim, 0.5], [E.laser, 0.3]], cs: [["parafMoveis", 0.5], ["siliconeSan", 0.1]] },
  espelhoLed: { mo: [["Fixação do espelho", "montador", 0.5], ["Ligação elétrica", "eletricista", 0.5]], eq: [[E.berbequim, 0.3], [E.multimetro, 0.1]], cs: [["parafMoveis", 0.5], ["ligadores", 0.2]] },
  toalheiroEl: { mo: [["Fixação", "montador", 0.4], ["Ponto elétrico e ligação", "eletricista", 0.6]], eq: [[E.berbequim, 0.3], [E.multimetro, 0.1]], cs: [["parafMoveis", 0.5], ["caixaApar", 1], ["cabo25", 3]] },
  levantar: { mo: [["Desmontagem e remoção", "servente", 1]], eq: [[E.martelo, 0.2], [E.carro, 0.3]], cs: [["sacosRafia", 2], ["siliconeSan", 0.1]] },
  demolParede: { mo: [["Demolição", "servente", 0.8], ["Remoção do entulho", "ajudante", 0.2]], eq: [[E.martelo, 0.5], [E.carro, 0.3], [E.reb230, 0.1]], cs: [["sacosRafia", 2], ["discoCorte", 0.1]] },
  entulho: { mo: [["Carga do entulho", "ajudante", 0.5], ["Transporte ao vazadouro", "motorista", 0.5]], eq: [[E.basculante, 0.5], [E.carro, 0.4]], cs: [["taxaRcd", 0.5], ["sacosRafia", 4]] },
  limpeza: { mat: 0.86, mo: [["Verificação final com o cliente", "ajudante", 1]], eq: [], cs: [["detergente", 1]] },
  // 14/10: o soldador de tubo PPR (as ligações a redes antigas em PPR)
  desloAgua: { mo: [["Roço e tubagem", "canalizador", 0.7], ["Fecho do roço", "pedreiro", 0.3]], eq: [[E.rocadeira, 0.2], [E.perfurador, 0.2], [E.prensa, 0.2], [E.ppr, 0.15]], cs: [["multi16", 1.1], ["acessMulti", 0.3], ["argamassa", 0.2]] },
  desloEsgoto: { mo: [["Roço e tubagem", "canalizador", 0.7], ["Fecho do roço", "pedreiro", 0.3]], eq: [[E.rocadeira, 0.2], [E.reb125, 0.1]], cs: [["pvc40", 1.1], ["curvasPvc", 0.3], ["colaPvc", 0.05], ["argamassa", 0.3]] },
  supressao: { mo: [["Corte e tamponamento", "canalizador", 1]], eq: [[E.prensa, 0.3]], cs: [["acessMulti", 0.5], ["teflon", 0.3]] },
  multicamada: { mo: [["Passagem da tubagem", "canalizador", 1]], eq: [[E.prensa, 0.3]], cs: [["multi16", 1.05], ["acessMulti", 0.2]] },
  roco: { mo: [["Abertura do roço", "pedreiro", 0.7], ["Limpeza", "ajudante", 0.3]], eq: [[E.rocadeira, 0.4], [E.aspirador, 0.4]], cs: [["discoCorte", 0.1]] },
  rocoAcab: { mo: [["Abertura do roço", "pedreiro", 0.5], ["Fecho e acabamento", "pedreiro", 0.3], ["Limpeza", "ajudante", 0.2]], eq: [[E.rocadeira, 0.3], [E.aspirador, 0.3]], cs: [["argamassa", 0.15], ["massaRep", 0.2]] },
  nicho: { mo: [["Abertura e estrutura do nicho", "pedreiro", 0.6], ["Revestimento do nicho", "ladrilhador", 0.4]], eq: [[E.rocadeira, 0.3], [E.cortador, 0.2], [E.laser, 0.2]], cs: [["argamassa", 0.5], ["colaFlex", 3], ["juntas", 0.3], ["perfilRemate", 1.2, true]] },
  alvenaria: { mo: [["Assentamento do tijolo", "pedreiro", 0.7], ["Apoio e argamassa", "ajudante", 0.3]], eq: [[E.misturador, 0.3], [E.laser, 0.3], [E.reb230, 0.1]], cs: [["tijolo", 10], ["argamassa", 0.8]] },
  reboco: { mo: [["Chapisco e reboco", "pedreiro", 0.7], ["Apoio", "ajudante", 0.3]], eq: [[E.misturador, 0.3], [E.talocha, 0.1]], cs: [["argamassa", 0.8], ["redeFibra", 0.5, true]] },
  rebocoTeto: { mo: [["Chapisco e reboco do teto", "pedreiro", 0.7], ["Apoio", "ajudante", 0.3]], eq: [[E.misturador, 0.3], [E.andaime, 0.8]], cs: [["argamassa", 0.8], ["redeFibra", 0.5, true]] },
  betonilha: { mo: [["Betonilha e nivelamento", "pedreiro", 0.6], ["Amassadura e transporte", "ajudante", 0.4]], eq: [[E.betoneira, 0.3], [E.talocha, 0.3], [E.laser, 0.2]], cs: [["cimento", 0.4], ["areia", 1.2]] },
  autonivelante: { mo: [["Primário e autonivelante", "pedreiro", 0.6], ["Amassadura", "ajudante", 0.4]], eq: [[E.misturador, 0.4]], cs: [["autonivel", 0.2], ["primario", 0.1]] },
  impermeab: { mo: [["Primário, membrana e banda", "pedreiro", 0.8], ["Apoio", "ajudante", 0.2]], eq: [[E.misturador, 0.2]], cs: [["membrana", 1.5], ["bandaCantos", 0.4], ["primario", 0.1]] },
  laRocha: { mo: [["Montagem dos painéis", "pladurista", 0.8], ["Apoio", "ajudante", 0.2]], eq: [[E.aparafPladur, 0.3]], cs: [["laRocha", 1.05], ["suspensoes", 0.3]] },
  revest: { mo: [["Assentamento do revestimento", "ladrilhador", 0.85], ["Betumação e limpeza", "ajudante", 0.15]], eq: [[E.cortador, 0.2], [E.serraAgua, 0.1], [E.misturador, 0.1], [E.laser, 0.2]], cs: [["colaFlex", 5], ["juntas", 0.3], ["niveladores", 0.3], ["perfilRemate", 0.3, true]] },
  pav: { mo: [["Assentamento do pavimento", "ladrilhador", 0.85], ["Betumação e limpeza", "ajudante", 0.15]], eq: [[E.cortador, 0.2], [E.serraAgua, 0.1], [E.misturador, 0.1], [E.laser, 0.2]], cs: [["colaFlex", 5], ["juntas", 0.3], ["niveladores", 0.5]] },
  spc: { mo: [["Montagem do pavimento flutuante", "carpinteiro", 0.9], ["Limpeza", "ajudante", 0.1]], eq: [[E.esquadria, 0.2], [E.tico, 0.1]], cs: [["mantaSpc", 1.05, true], ["siliconeAcril", 0.05]] },
  pedra: { mo: [["Assentamento da pedra", "ladrilhador", 0.7], ["Apoio e cortes", "ajudante", 0.3]], eq: [[E.serraAgua, 0.3], [E.reb230, 0.2], [E.laser, 0.2]], cs: [["colaFlex", 7], ["colaEpoxi", 0.1]] },
  painel: { mo: [["Montagem dos painéis", "carpinteiro", 0.8], ["Apoio", "ajudante", 0.2]], eq: [[E.circular, 0.2], [E.aparaf, 0.3]], cs: [["colaPu", 0.3], ["parafMoveis", 0.5]] },
  rodape: { mo: [["Corte e colagem", "ladrilhador", 1]], eq: [[E.esquadria, 0.3]], cs: [["colaPu", 0.05], ["siliconeAcril", 0.05]] },
  afagar: { mo: [["Afagamento", "carpinteiro", 0.6], ["Envernizamento", "pintor", 0.4]], eq: [[E.afagadora, 0.5], [E.bordadora, 0.2], [E.aspirador, 0.3]], cs: [["vernizPav", 0.15], ["lixa", 0.5]] },
  microcimento: { mo: [["Aplicação em camadas", "pedreiro", 0.8], ["Lixagem e verniz", "ajudante", 0.2]], eq: [[E.misturador, 0.2], [E.girafa, 0.2]], cs: [["microcimento", 1.8], ["primario", 0.15], ["vernizMicro", 0.12]] },
  teto: { mo: [["Estrutura e placas", "pladurista", 0.8], ["Juntas e acabamento", "ajudante", 0.2]], eq: [[E.elevador, 0.3], [E.aparafPladur, 0.6], [E.laser, 0.3], [E.escadote, 0.5]], cs: [["parafPladur", 0.1], ["fitaMassa", 0.5], ["suspensoes", 0.5]] },
  tetoFocos: { mo: [["Estrutura e placas", "pladurista", 0.7], ["Focos LED", "eletricista", 0.15], ["Juntas e acabamento", "ajudante", 0.15]], eq: [[E.elevador, 0.3], [E.aparafPladur, 0.6], [E.caroteadora, 0.05], [E.escadote, 0.5]], cs: [["parafPladur", 0.1], ["fitaMassa", 0.5], ["suspensoes", 0.5]] },
  tetoBloco: { mo: [["Estrutura e placas hidrófugas", "pladurista", 0.65], ["Focos LED e ligação", "eletricista", 0.15], ["Juntas, massa e pintura", "pintor", 0.2]], eq: [[E.elevador, 0.3], [E.aparafPladur, 0.6], [E.escadote, 0.6], [E.multimetro, 0.05]], cs: [["placaH", 4.2], ["perfis48", 10], ["parafPladur", 1], ["fitaMassa", 2], ["suspensoes", 2], ["focoLed", 2], ["cabo15", 6], ["tintaTeto", 1]] },
  sanca: { mo: [["Colagem e remates", "pladurista", 0.9], ["Apoio", "ajudante", 0.1]], eq: [[E.esquadria, 0.2], [E.escadote, 0.5]], cs: [["colaPu", 0.1], ["fitaMassa", 0.2]] },
  // 14/10: a máquina de pintura airless nas demãos (paredes e tetos)
  pinturaPar: { mo: [["Preparação e proteção", "pintor", 0.25], ["Duas demãos", "pintor", 0.65], ["Limpeza", "ajudante", 0.1]], eq: [[E.escadote, 0.3], [E.orbital, 0.1], [E.airless, 0.3]], cs: [["protecao", 0.1], ["lixa", 0.3], ["massaRep", 0.05]] },
  pinturaTeto: { mo: [["Preparação e proteção", "pintor", 0.25], ["Duas demãos", "pintor", 0.65], ["Limpeza", "ajudante", 0.1]], eq: [[E.escadote, 0.5], [E.andaime, 0.2], [E.airless, 0.3]], cs: [["protecao", 0.1], ["lixa", 0.3]] },
  pinturaRep: { mo: [["Reparação e massa", "pintor", 0.4], ["Lixagem", "pintor", 0.15], ["Duas demãos", "pintor", 0.35], ["Limpeza", "ajudante", 0.1]], eq: [[E.escadote, 0.5], [E.girafa, 0.3], [E.aspirador, 0.2]], cs: [["protecao", 0.15], ["massaRep", 0.4], ["lixa", 0.5], ["primAcril", 0.1]] },
  estuque: { mo: [["Estuque", "pintor", 0.5], ["Duas demãos", "pintor", 0.4], ["Limpeza", "ajudante", 0.1]], eq: [[E.escadote, 0.3], [E.girafa, 0.2], [E.misturador, 0.1]], cs: [["estuque", 0.2], ["protecao", 0.1], ["lixa", 0.3]] },
  modeloWc: { mo: [["Demolição e remoção", "servente", 0.15], ["Canalização", "canalizador", 0.18], ["Eletricidade", "eletricista", 0.07], ["Regularização e rebocos", "pedreiro", 0.1], ["Revestimento e pavimento", "ladrilhador", 0.3], ["Montagem de louças e móveis", "montador", 0.1], ["Pintura do teto", "pintor", 0.05], ["Apoio e limpeza", "ajudante", 0.05]], eq: [[E.martelo, 0.05], [E.carro, 0.05], [E.rocadeira, 0.03], [E.cortador, 0.08], [E.serraAgua, 0.03], [E.misturador, 0.05], [E.prensa, 0.03], [E.aspirador, 0.05]], cs: [["sacosRafia", 15], ["colaFlex", 60], ["juntas", 4], ["multi16", 8], ["acessMulti", 2], ["pvc40", 3], ["membrana", 6], ["cabo25", 15], ["siliconeSan", 2], ["protecao", 2]] },
  modeloCoz: { mo: [["Demolição e remoção", "servente", 0.1], ["Canalização e gás", "canalizador", 0.1], ["Eletricidade", "eletricista", 0.12], ["Regularização e rebocos", "pedreiro", 0.08], ["Revestimento e pavimento", "ladrilhador", 0.2], ["Montagem dos móveis", "montador", 0.3], ["Pintura", "pintor", 0.05], ["Apoio e limpeza", "ajudante", 0.05]], eq: [[E.martelo, 0.04], [E.carro, 0.04], [E.rocadeira, 0.03], [E.cortador, 0.05], [E.aparaf, 0.2], [E.laser, 0.1], [E.multimetro, 0.03]], cs: [["sacosRafia", 15], ["colaFlex", 50], ["juntas", 3], ["multi16", 6], ["cabo25", 30], ["tuboVd", 15], ["parafMoveis", 12], ["calcos", 6], ["siliconeSan", 2], ["protecao", 2]] },
  modeloCozSimples: { mo: [["Desmontagem dos móveis antigos", "servente", 0.15], ["Montagem dos móveis", "montador", 0.55], ["Ligações de água", "canalizador", 0.12], ["Ligações elétricas", "eletricista", 0.08], ["Apoio e limpeza", "ajudante", 0.1]], eq: [[E.aparaf, 0.3], [E.laser, 0.1], [E.carro, 0.05]], cs: [["sacosRafia", 8], ["parafMoveis", 10], ["calcos", 5], ["flexivel", 2], ["siliconeSan", 1]] },
  sub0: { zero: true, mo: [], eq: [], cs: [] },
};

/* ------------------------------------------------------------------ cada serviço: família */
// O que se decide por serviço: o modelo de receita, o ofício › sub, a medida da visita, o ícone, as linhas de negócio e a unidade.
function unidadeDe(nome) {
  const n = normal(nome);
  if (/v\/hora|\/hora\b/.test(n)) return "h";
  if (/p\/km/.test(n)) return "km";
  if (/\bm2\b|m²/.test(n)) return "m²";
  if (/\bml\b|p\/ml|\bm\/l\b/.test(n)) return "ml";
  return "un";
}
const WC = ["wc"], COZ = ["coz"], AMBAS = ["wc", "coz"], NENHUMA = [];
/** [modelo, ofício, sub, ícone, linhas, medida] */
function familia(s) {
  const n = normal(s.name), sku = s.sku, cat = normal(s.cat ?? ""), un = unidadeDe(s.name);
  const F = (t, of, sub, ic, ln, med = null, extra = {}) => ({ t, of, sub, ic, ln, med, ...extra });
  if (cat === "subcontrato" && !(num(s.pvp) > 0)) {
    const sub = { "tela radiante": "Piso radiante", "avac": "AVAC", "instalacoes de rede de gas": "Gás", "instalacao de janelas": "Janelas", "carpintaria": "Roupeiros", "marmorista": "Marmoraria" }[normal(s.sub)];
    return F("sub0", "Subempreitadas", sub ?? null, "subcontrato", NENHUMA);
  }
  if (sku === "SLPO00001") return F("limpeza", "Serviços gerais", "Limpeza", "limpeza", AMBAS, null, { custom: "Subempreitada de limpeza pós-obra (BM Clean)", fornecedor: "BM Clean" });
  if (/^MCC/.test(sku)) return F("componente", "Carpintaria", "Mobiliário", "cozinha", COZ, null, { custom: `Componente: ${limpo(s.name)}`, fornecedor: "Anlorbel" });
  if (sku === "MOMCCAC0001") return F("conjunto", "Carpintaria", "Mobiliário", "moveis", COZ, null, { custom: "Conjunto de bancos, mesa e prateleira", fornecedor: "Anlorbel" });
  if (cat === "modelo de mao de obra") {
    if (/casa de banho/.test(n)) return F("modeloWc", "Modelos de obra", "Casa de banho", "loucas", WC);
    if (sku === "MOMSMMC") return F("modeloCozSimples", "Modelos de obra", "Cozinha", "cozinha", COZ);
    return F("modeloCoz", "Modelos de obra", "Cozinha", "cozinha", COZ);
  }
  if (sku === "MOCCP00001") return F("cozinhaCompleta", "Carpintaria", "Mobiliário", "cozinha", COZ);
  if (cat === "mao de obra de armarios de cozinha") {
    if (/iluminacao led/.test(n)) return F("armarioLed", "Eletricidade", "Iluminação", "iluminacao", COZ);
    if (/armario|coluna cristaleira/.test(n)) return F("armario", "Carpintaria", "Mobiliário", "cozinha", COZ);
    return F("acessCoz", "Carpintaria", "Mobiliário", "cozinha", COZ);
  }
  if (cat === "mao de obra janelas") {
    if (/rede mosquiteira/.test(n)) return F("rede", "Caixilharia", "Redes mosquiteiras", "janela", NENHUMA);
    return F("janela", "Caixilharia", "Janelas", "janela", NENHUMA);
  }
  if (cat === "mao de obra - mobiliario de roupeiros") return F("roupeiro", "Carpintaria", "Roupeiros", "moveis", NENHUMA);
  if (cat === "mao de obra marmorista") {
    if (sku === "MOEBCG") return F("grua", "Marmoraria", "Bancadas de cozinha", "subcontrato", COZ, null, { custom: "Aluguer de grua com operador", fornecedor: "Gruas do Centro" });
    if (sku === "MOMBQ0001") return F("marmorBancada", "Marmoraria", "Bancadas de casa de banho", "loucas", WC);
    if (sku === "MOMC0001") return F("marmorCuba", "Marmoraria", "Bancadas de cozinha", "cozinha", COZ);
    if (un === "ml") return F("marmorMl", "Marmoraria", "Bancadas de cozinha", "cozinha", COZ);
    return F("marmorBancada", "Marmoraria", "Bancadas de cozinha", "cozinha", COZ);
  }
  if (cat === "mao de obra design") return F("projeto", "Projeto e design", null, "projeto", AMBAS);
  if (sku === "MOAVAC") return F("avacHora", "AVAC", "Ar condicionado", "avac", NENHUMA);
  if (sku === "DDFR0001") return F("deslocacao", "Serviços gerais", "Deslocações", "deslocacao", AMBAS);
  const P = {
    // elétricos
    MOME0005: F("pontoEletr", "Eletricidade", "Aparelhagem e quadros", "eletricidade", AMBAS, null, { vezes: 10 }),
    MOME0006: F("tomada", "Eletricidade", "Aparelhagem e quadros", "eletricidade", AMBAS, null, { vezes: 25 }),
    MOME0001: F("fitaLed", "Eletricidade", "Iluminação", "iluminacao", AMBAS),
    MOME0004: F("pontoEletr", "Eletricidade", "Aparelhagem e quadros", "eletricidade", AMBAS),
    MOIET: F("tomada", "Eletricidade", "Aparelhagem e quadros", "eletricidade", AMBAS),
    MOME0008: F("disjuntor", "Eletricidade", "Aparelhagem e quadros", "eletricidade", AMBAS),
    MOME0002: F("quadro", "Eletricidade", "Aparelhagem e quadros", "eletricidade", AMBAS),
    MOME0007: F("eletrHora", "Eletricidade", null, "eletricidade", AMBAS),
    MOME0003: F("fioMl", "Eletricidade", null, "eletricidade", COZ),
    // extras
    MOIKI: F("impermeab", "Isolamento e impermeabilização", null, "impermeabilizacao", WC, "pav"),
    MOGDPA: F("desloAgua", "Canalização", "Águas e esgotos", "canalizacao", WC),
    MODPE: F("desloEsgoto", "Canalização", "Águas e esgotos", "esgoto", AMBAS),
    MOCN: F("nicho", "Revestimentos", null, "revestimento", WC),
    MODP: F("demolParede", "Demolições", null, "demolicao", AMBAS),
    MOSPA: F("supressao", "Canalização", "Águas e esgotos", "canalizacao", WC),
    MOAPG: F("gasAnular", "Gás (ITG)", "Redes de gás", "gas", AMBAS),
    MOCG: F("gasCert", "Gás (ITG)", "Redes de gás", "gas", COZ, null, { custom: "Taxa da entidade inspetora", fornecedor: "Entidade inspetora de gás" }),
    MODC: F("caldeiraDesm", "Gás (ITG)", "Aparelhos a gás", "gas", COZ),
    MOICIC: F("chamine", "Carpintaria", "Eletrodomésticos", "cozinha", COZ),
    MOIEG: F("eletroGas", "Gás (ITG)", "Aparelhos a gás", "gas", AMBAS),
    MOIEC: F("eletrodom", "Carpintaria", "Eletrodomésticos", "cozinha", COZ),
    MOMC: F("caldeiraMont", "Gás (ITG)", "Aparelhos a gás", "gas", COZ),
    MOCSR: F("serigrafia", "Carpintaria", "Resguardos", "duche", WC, null, { custom: "Serigrafia do vidro (vidraria)", fornecedor: "Beto & Vidros" }),
    MOLSM: F("levantar", "Demolições", null, "demolicao", WC, "pcs"),
    // casa de banho
    MOMA: F("alvenaria", "Revestimentos", null, "revestimento", WC),
    MOIASWC: F("acessWc", "Carpintaria", "Acessórios WC", "loucas", WC),
    MOIAWC: F("acessWc", "Carpintaria", "Acessórios WC", "loucas", WC),
    MOIAL: F("aplique", "Eletricidade", "Iluminação", "iluminacao", WC),
    MOIBP: F("banheira", "Canalização", "Louças e torneiras", "duche", WC),
    MOIBDXXL: F("base", "Canalização", "Louças e torneiras", "duche", WC),
    MOIBBTW: F("loica", "Canalização", "Louças e torneiras", "loucas", WC),
    MOIBSUSP: F("sanitaSusp", "Canalização", "Louças e torneiras", "loucas", WC),
    MOICH: F("torneira", "Canalização", "Louças e torneiras", "duche", WC),
    MOICHM: F("torneira", "Canalização", "Louças e torneiras", "duche", WC),
    MOICD: F("coluna", "Canalização", "Louças e torneiras", "duche", WC),
    MOICDE: F("colunaEnc", "Canalização", "Louças e torneiras", "duche", WC),
    MOIE: F("acessWc", "Carpintaria", "Acessórios WC", "loucas", WC),
    MOIECL: F("espelhoLed", "Eletricidade", "Iluminação", "iluminacao", WC),
    MOIJAWC: F("janela", "Caixilharia", "Janelas", "janela", WC),
    MOIL: F("loica", "Canalização", "Louças e torneiras", "loucas", WC),
    MOIMWC: F("movelWc", "Carpintaria", "Móveis de casa de banho", "moveis", WC),
    MOIPCPL: F("porta", "Carpintaria", "Portas", "porta", AMBAS),
    MOIRKENNAXXL: F("resguardo", "Carpintaria", "Resguardos", "duche", WC),
    MOISBTW: F("sanita", "Canalização", "Louças e torneiras", "loucas", WC),
    MOISE: F("sanitaEletr", "Canalização", "Louças e torneiras", "loucas", WC),
    MOISSUSP: F("sanitaSusp", "Canalização", "Louças e torneiras", "loucas", WC),
    MOITB: F("tampoWc", "Carpintaria", "Móveis de casa de banho", "moveis", WC),
    MOITFPH: F("tetoBloco", "Carpintaria", "Pladur", "pladur", WC),
    MOITE: F("toalheiroEl", "Eletricidade", null, "eletricidade", WC),
    MOITBF: F("torneira", "Canalização", "Louças e torneiras", "canalizacao", WC),
    MOITBD: F("torneira", "Canalização", "Louças e torneiras", "canalizacao", WC),
    MOITCB: F("torneiraEnc", "Canalização", "Louças e torneiras", "canalizacao", WC),
    MOITL: F("torneira", "Canalização", "Louças e torneiras", "canalizacao", WC),
    MOITLE: F("torneiraEnc", "Canalização", "Louças e torneiras", "canalizacao", WC),
    MOIV: F("ventax", "Eletricidade", "Ventilação", "avac", WC),
    MOIVLF: F("resguardo", "Carpintaria", "Resguardos", "duche", WC),
    // gerais
    MOIPCVT: F("porta", "Carpintaria", "Portas", "porta", NENHUMA),
    IPCGE0001: F("porta", "Carpintaria", "Portas", "porta", NENHUMA),
    MOITFP: F("teto", "Carpintaria", "Pladur", "pladur", AMBAS, "pav"),
    MOITFPCF: F("tetoFocos", "Carpintaria", "Pladur", "pladur", AMBAS, "pav"),
    MOPP: F("pinturaPar", "Pintura", "Paredes", "pintura", AMBAS, "par"),
    MOPPC: F("pinturaPar", "Pintura", "Paredes", "pintura", AMBAS, "par"),
    MOPT: F("pinturaTeto", "Pintura", "Tetos", "pintura", AMBAS, "pav", { un: "m²" }),
    MOPTR: F("pinturaRep", "Pintura", "Tetos", "pintura", AMBAS, "pav"),
    MOEPP: F("estuque", "Pintura", "Paredes", "pintura", AMBAS, "par"),
    MORP: F("retirarPorta", "Demolições", "Portas e mobiliário", "demolicao", NENHUMA),
    MORPC: F("retirarPorta", "Demolições", "Portas e mobiliário", "demolicao", NENHUMA),
    MOARSA: F("roco", "Alvenarias e rebocos", null, "demolicao", AMBAS),
    MOAFRCA: F("rocoAcab", "Alvenarias e rebocos", null, "revestimento", AMBAS),
    MORPSP: F("reboco", "Alvenarias e rebocos", null, "revestimento", AMBAS, "par"),
    MORTSP: F("rebocoTeto", "Alvenarias e rebocos", null, "revestimento", AMBAS, "pav"),
    MOIS0001: F("sanca", "Carpintaria", "Pladur", "pladur", AMBAS),
    MOLPA: F("alvenaria", "Alvenarias e rebocos", null, "revestimento", AMBAS),
    MOMGCM0001: F("multicamada", "Canalização", "Águas e esgotos", "canalizacao", AMBAS),
    MOREDV: F("entulho", "Demolições", "Entulho", "entulho", AMBAS),
    // cozinha
    MOIBPH: F("tetoBloco", "Carpintaria", "Pladur", "pladur", COZ),
    MOIEM: F("eletrodom", "Carpintaria", "Eletrodomésticos", "cozinha", COZ),
    MOIGP: F("gasRede", "Gás (ITG)", "Redes de gás", "gas", COZ),
    MOITPHC: F("tetoBloco", "Carpintaria", "Pladur", "pladur", COZ),
    MOITC: F("torneira", "Canalização", "Lava-loiças e torneiras de cozinha", "canalizacao", COZ),
    MODPLE: F("pontoLuz", "Eletricidade", "Aparelhagem e quadros", "eletricidade", COZ),
    MOPPTR: F("pinturaRep", "Pintura", "Tetos", "pintura", COZ, "pav"),
    MOPPTSR: F("pinturaTeto", "Pintura", "Tetos", "pintura", COZ, "pav"),
    // pavimento e revestimento
    MOIPA: F("painel", "Revestimentos", "Parede", "revestimento", NENHUMA, "par"),
    MOIP: F("pav", "Revestimentos", "Pavimento", "pavimento", AMBAS, "pav"),
    MOIPN0001: F("pedra", "Revestimentos", "Parede", "revestimento", NENHUMA, "par"),
    MOIR: F("revest", "Revestimentos", "Parede", "revestimento", AMBAS, "par"),
    MOIRP: F("rodape", "Revestimentos", "Pavimento", "pavimento", AMBAS),
    MOIPSPC: F("spc", "Revestimentos", "Pavimento", "pavimento", AMBAS, "pav"),
    MOAE: F("afagar", "Revestimentos", "Pavimento", "pavimento", NENHUMA, "pav"),
    MOBP0001: F("betonilha", "Alvenarias e rebocos", null, "pavimento", AMBAS, "pav"),
    MOPRMC0001: F("microcimento", "Revestimentos", "Parede", "revestimento", AMBAS, "par"),
    MOIAN1: F("autonivelante", "Alvenarias e rebocos", null, "pavimento", AMBAS, "pav"),
    MOILAR: F("laRocha", "Isolamento e impermeabilização", null, "impermeabilizacao", NENHUMA),
    MOILLC: F("lavaLoica", "Canalização", "Lava-loiças e torneiras de cozinha", "cozinha", COZ),
  }[sku];
  if (P) return P;
  throw new Error(`Serviço sem família: ${sku} · ${s.name}`);
}

/* ------------------------------------------------------------------ o Catálogo do protótipo (c1..c41) */
function lerCatalogoProto() {
  const txt = fs.readFileSync(path.join(PROTO, "catalogo.ts"), "utf8");
  const out = [];
  for (const m of txt.matchAll(/\{ id: "(c\d+)", n: "([^"]+)", cat: "([^"]+)", un: "([^"]+)"/g)) out.push({ id: m[1], n: m[2], cat: m[3], un: m[4] });
  return out;
}

/* ------------------------------------------------------------------ a receita: calibrar */
function receita(s, f, cId) {
  const tpl = T[f.t];
  if (!tpl) throw new Error("modelo " + f.t);
  const custo = num(s.custo), vezes = f.vezes ?? 1;
  if (tpl.zero) return { mo: [], eq: [], cs: [["Preço do subempreiteiro (pedido por obra)", "un", 0, "A definir por obra", 1]], h: 0, alvo: 0, calc: 0 };
  const j = (aleatorio("svc:" + s.sku) - 0.5) * 0.24; // ±12%, fixo por serviço
  const alvo = custo * (1 + j);
  // consumíveis do modelo (× vezes para "10 interruptores", "25 tomadas")
  let cs = tpl.cs.map(([k, q, opc]) => ({ c: K[k], q: q * vezes, opc: !!(opc ?? K[k].opcional) }));
  const custom = [];
  if (tpl.mat) custom.push([f.custom ?? "Material", "un", r2(alvo * tpl.mat), f.fornecedor ?? "Anlorbel", 1]);
  const custoCons = () => cs.filter((x) => !x.opc).reduce((a, x) => a + x.q * x.c.preco, 0) + custom.reduce((a, c) => a + c[2] * c[4], 0);
  // os consumíveis não podem pesar mais do que 35% (fora as subempreitadas e os componentes, que já são o material)
  const consModelo = cs.filter((x) => !x.opc).reduce((a, x) => a + x.q * x.c.preco, 0);
  const tecto = alvo * (tpl.mat ? 0.08 : 0.35);
  if (consModelo > tecto && consModelo > 0) { const f2 = tecto / consModelo; cs = cs.map((x) => ({ ...x, q: x.q * f2 })); }
  const rateH = tpl.mo.reduce((a, [, p, sh]) => a + sh * (horaPerfil(p) + TAXA_ESTR), 0) / tpl.mo.reduce((a, m) => a + m[2], 0)
    + tpl.eq.reduce((a, [e, r]) => a + r * equipHora(EQ[e]), 0) / tpl.mo.reduce((a, m) => a + m[2], 0);
  let H;
  if (tpl.horas) H = null; // por hora: as horas do modelo são as da unidade
  else H = Math.max(0.01, (alvo - custoCons()) / rateH);
  const somaSh = tpl.mo.reduce((a, m) => a + m[2], 0);
  const mo = tpl.mo.map(([n, p, sh]) => [n, p, Math.max(0.01, r2(tpl.horas ? sh : (H * sh) / somaSh))]);
  const hTot = mo.reduce((a, m) => a + m[2], 0);
  const base = tpl.horas ? 1 : H / somaSh;
  const eq = tpl.eq.map(([e, r]) => [e, r2((tpl.horas ? r : base * r))]).filter(([, h]) => h > 0);
  const csOut = cs.map((x) => [x.c.id, r3(x.q), x.opc ? 1 : 0]).filter(([, q]) => q > 0);
  // a conta do motor (custoReceita com a estrutura): para o relatório
  const moC = mo.reduce((a, [, p, h]) => a + h * horaPerfil(p), 0);
  const eqC = eq.reduce((a, [e, h]) => a + h * equipHora(EQ[e]), 0);
  const consC = csOut.reduce((a, [id, q, o]) => a + (o ? 0 : q * CONS.find((c) => c.id === id).preco), 0) + custom.reduce((a, c) => a + c[2] * c[4], 0);
  const calc = moC + eqC + consC + hTot * TAXA_ESTR;
  return { mo, eq, cs: [...csOut, ...custom], h: r2(hTot), alvo, calc, rs: [r2(hTot), r2(hTot > 0 ? moC / hTot : 0), r2(eqC), r2(consC)], cId };
}

/* ------------------------------------------------------------------ produtos */
const JUNK_CATS = ["calcado", "vestuario", "periferico", "processador", "placa grafica"];
function motivoExclusao(p) {
  const c = normal(p.cat ?? ""), cp = normal(p.cat_pai ?? "");
  if (JUNK_CATS.some((j) => c.includes(j) || cp.includes(j))) return "outro negócio";
  if (/teste/i.test(`${p.sku} ${p.name} ${p.fornecedor ?? ""}`)) return "artigo de teste";
  if (!p.cat) return "sem categoria";
  if (!(num(p.pvp) > 0)) return "sem preço de venda";
  return null;
}
/** Ofício › sub, ilustração e a etiqueta da subcategoria de um produto. */
function classificarProduto(p) {
  const cat = normal(p.cat), sub = normal(p.sub ?? ""), n = normal(p.name);
  const R = (of, s, img) => ({ of, sub: s, img });
  if (cat === "bases duche") return R("Canalização", "Louças e torneiras", "base-duche");
  if (cat === "colunas duche") return R("Canalização", "Louças e torneiras", "coluna-duche");
  if (cat === "resguardos de duche") return R("Carpintaria", "Resguardos", "resguardo");
  if (cat === "duche & banho") {
    if (/banheira/.test(sub) && !/resguardo/.test(sub)) return R("Canalização", "Louças e torneiras", "banheira");
    if (/chuveiro/.test(sub)) return R("Canalização", "Louças e torneiras", "coluna-duche");
    return R("Carpintaria", "Resguardos", "resguardo");
  }
  if (cat === "loicas sanitarias") {
    // palavra inteira: "Kit´s para Sanitários" contém "sanita" (as estruturas não são sanitas)
    if (/\bsanitas?\b/.test(sub)) return R("Canalização", "Louças e torneiras", "sanita");
    if (/bide/.test(sub)) return R("Canalização", "Louças e torneiras", "bide");
    if (/lavatorio/.test(sub)) return R("Canalização", "Louças e torneiras", "lavatorio");
    return R("Canalização", "Louças e torneiras", /placa de acionamento/.test(n) ? "acessorio-wc" : /bide/.test(n) ? "bide" : "sanita");
  }
  // as misturadoras monocomando são de cozinha: ficam com os lava-loiças (a escolha não mexe nas louças da casa de banho)
  if (cat === "torneiras & misturadoras") return R("Canalização", /misturadora/.test(sub) ? "Lava-loiças e torneiras de cozinha" : "Louças e torneiras", "torneira");
  if (cat === "lava-loucas & cubas") return R("Canalização", "Lava-loiças e torneiras de cozinha", "lava-loica");
  if (cat === "moveis & arrumacao casa de banho") {
    if (/espelho/.test(sub)) return R("Carpintaria", "Acessórios WC", "espelho");
    if (/aplique/.test(sub)) return R("Eletricidade", "Iluminação", "iluminacao");
    return R("Carpintaria", "Móveis de casa de banho", "movel-wc");
  }
  if (cat === "acessorios de casa de banho") return R("Carpintaria", "Acessórios WC", /toalheiro/.test(sub) ? "toalheiro" : "acessorio-wc");
  if (cat.startsWith("revestimentos")) {
    if (/rodape/.test(n)) return R("Revestimentos", "Pavimento", "pavimento");
    const pav = /spc|microcimento/.test(sub) || /porcelan/.test(sub) || /fresno|roble|nogal|alerce|madeira|\bpav\b/.test(n);
    return pav ? R("Revestimentos", "Pavimento", "pavimento") : R("Revestimentos", "Parede", "revestimento");
  }
  if (cat === "mobiliario & componentes cozinha") return R("Carpintaria", "Mobiliário", /puxador/.test(n) ? "ferramenta" : "armario-cozinha");
  if (cat === "bancadas de cozinha") return R("Carpintaria", "Mobiliário", "bancada");
  if (cat === "eletrodomesticos") {
    if (/exaustor/.test(sub)) return R("Carpintaria", "Eletrodomésticos", "exaustor");
    if (/esquentador|termoacumulador/.test(sub)) return R("Canalização", "Aquecimento de águas", "esquentador");
    if (/ventax/.test(sub)) return R("Eletricidade", "Ventilação", "avac");
    return R("Carpintaria", "Eletrodomésticos", "eletrodomestico");
  }
  if (cat === "janelas") return R("Caixilharia", /rede mosquiteira/.test(n) ? "Redes mosquiteiras" : "Janelas", "janela");
  if (cat === "portas") return R("Carpintaria", "Portas", "porta");
  if (cat === "mobiliario de roupeiros") return R("Carpintaria", "Roupeiros", "roupeiro");
  if (cat === "marmorista") return R("Marmoraria", "Bancadas de cozinha", "lava-loica");
  if (cat === "avac") return R("AVAC", "Ar condicionado", "avac");
  if (cat === "eletrica") return R("Eletricidade", /led|foco|fita/.test(n) ? "Iluminação" : "Aparelhagem e quadros", /led|foco|fita/.test(n) ? "iluminacao" : "eletrico");
  if (cat === "materiais") {
    if (/tinta|verniz/.test(n)) return R("Pintura", null, "quimico");
    if (/teto falso|sanca/.test(n)) return R("Carpintaria", "Pladur", "material");
    if (/impermeabiliz|la de rocha/.test(n)) return R("Isolamento e impermeabilização", null, "quimico");
    if (/canaliz|ponto de agua|ponto de esgoto/.test(n)) return R("Canalização", "Águas e esgotos", "material");
    if (/foco|led/.test(n)) return R("Eletricidade", "Iluminação", "iluminacao");
    if (/autonivelante/.test(n)) return R("Alvenarias e rebocos", null, "cola");
    return R("Alvenarias e rebocos", null, "material");
  }
  return R(null, null, "generico");
}
/** A marca e o fornecedor (inventados com regras quando a base não os tem). */
const FORN_DA_MARCA = {
  "Duplach": "DUPLACH GROUP S.A.U", "Rubicer": "RUBICER, Lda.", "Grespania": "Grespania Ceramica", "Coverlam": "Grespania Ceramica",
  "Kerlux": "NOVALAM INNOVACION, S.A.", "WHIRPOOL": "Prome Retail S.A.", "INDESIT": "Prome Retail S.A.", "TEKA": "Prome Retail S.A.",
  "VULCANO": "Prome Retail S.A.", "LG": "Prome Retail S.A.", "FRASA": "BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.", "FPM": "FPM",
  "Beto & Vidros": "Beto & Vidros", "Eletricol": "Eletricol", "TECNISIS": "Eletricol", "Jodiva": "Jodiva",
};
const ANLORBEL = "Anlorbel - Com. de Mat. de Construção e Decoração, SA";
function marcaFornecedor(p, cl) {
  let marca = limpo(p.marca);
  const n = normal(p.name), cat = normal(p.cat);
  if (!marca) {
    if (cat === "mobiliario & componentes cozinha" || cat === "mobiliario de roupeiros") marca = "Mudelar";
    else if (cat === "bancadas de cozinha" || cat === "marmorista") marca = "Jodiva";
    else if (cat === "duche & banho") marca = /kenna|akord/.test(n) ? "Duplach" : "GME";
    else if (cat.startsWith("revestimentos")) marca = /spc/.test(n) ? "Duplach" : "Grespania";
    else if (cat === "avac") marca = /bomba/.test(n) ? "Siccom" : "Frigicoll";
    else if (cat === "eletrica") marca = "Eletricol";
    else if (cat === "materiais") marca = /tinta/.test(n) ? "CIN" : /verniz/.test(n) ? "Berger-Seidle" : /teto falso|sanca/.test(n) ? "Placo" : /la de rocha/.test(n) ? "Volcalis" : /canaliz|agua|esgoto/.test(n) ? "Uponor" : /foco|led/.test(n) ? "Eletricol" : "Weber";
    else if (cat === "eletrodomesticos") marca = "Teka";
    else if (cat === "portas") marca = "FPM";
    else marca = "Anlorbel";
  }
  let forn = limpo(p.fornecedor);
  if (!forn) forn = FORN_DA_MARCA[marca] ?? (cat === "avac" ? "Frigicoll" : cat === "bancadas de cozinha" || cat === "marmorista" ? "Jodiva" : ANLORBEL);
  return { marca, forn };
}
function unidadeProduto(p) {
  const u = normal(p.un ?? "");
  if (u === "m2") return "m²";
  if (u === "un") return "un";
  const n = normal(p.name);
  if (/\bm2\b/.test(n)) return "m²";
  if (/\bml\b|\bm\/l\b/.test(n)) return "ml";
  if (normal(p.cat).startsWith("revestimentos")) return "m²";
  return "un";
}
const DIM = /(\d{2,4}(?:[.,]\d)?)\s*(?:mm|cm)?\s*[x×X]\s*(\d{2,4}(?:[.,]\d)?)(?:\s*(?:mm|cm)?\s*[x×X]\s*(\d{1,4}(?:[.,]\d)?))?/;
function descricao(p, sub, marca, un) {
  const d = DIM.exec(p.name);
  const dims = d ? [d[1], d[2], d[3]].filter(Boolean).join("×") : null;
  const tipo = limpo(sub) ?? limpo(p.cat);
  const porUn = un === "m²" ? "preço por m²" : un === "ml" ? "preço por metro" : "preço por unidade";
  return `${tipo}${dims ? ` ${dims}` : ""}, ${marca}; ${porUn}.`;
}

/* ------------------------------------------------------------------ produto → serviço que o instala */
function servicoDoProduto(p, svcPorSku, svcPorNome) {
  const n = normal(p.name), cat = normal(p.cat), sub = normal(p.sub ?? "");
  // 14/10: a tela radiante da TECNISIS (a tela, o termóstato e a sonda) instala-se com o "Sistema Tela Radiante" (subempreitada)
  if (normal(p.marca ?? "") === "tecnisis") return svcPorSku.get("MOISTR") ?? null;
  // 1) o serviço "Instalação <nome do produto>" (armários de cozinha, roupeiros, janelas, portas, acessórios)
  const nome = n.replace(/\s+/g, " ").trim();
  for (const pre of ["instalacao ", "instalacao de "]) { const s = svcPorNome.get(pre + nome); if (s) return s; }
  const S = (sku) => svcPorSku.get(sku) ?? null;
  if (cat === "bases duche") return S("MOIBDXXL");
  if (cat === "colunas duche") return /encastr/.test(n) ? S("MOICDE") : S("MOICD");
  if (cat === "resguardos de duche" || (cat === "duche & banho" && /resguardo/.test(sub))) return /fixo|lateral|painel/.test(n) && !/porta/.test(n) ? S("MOIVLF") : S("MOIRKENNAXXL");
  if (cat === "duche & banho") {
    if (/banheira/.test(sub)) return S("MOIBP");
    if (/chuveiro/.test(sub)) return /monocomando|misturad/.test(n) ? S("MOICHM") : S("MOICH");
    return S("MOIRKENNAXXL");
  }
  if (cat === "loicas sanitarias") {
    if (/\bsanitas?\b/.test(sub)) return /smart|wish|eletric/.test(n) ? S("MOISE") : /susp/.test(n) ? S("MOISSUSP") : S("MOISBTW");
    if (/bide/.test(sub)) return /susp/.test(n) ? S("MOIBSUSP") : S("MOIBBTW");
    if (/lavatorio/.test(sub)) return S("MOIL");
    return null; // estruturas e placas de acionamento: entram na instalação da sanita suspensa
  }
  if (cat === "torneiras & misturadoras") {
    if (/sifao|valvula/.test(sub)) return null;
    if (/bide/.test(sub)) return S("MOITBD");
    if (/banheira/.test(sub)) return /chao|pe/.test(n) ? S("MOITCB") : S("MOITBF");
    if (/encastre/.test(sub)) return S("MOITLE");
    if (/lavatorio|pe alto/.test(sub)) return S("MOITL");
    return S("MOITC"); // misturadoras monocomando: cozinha
  }
  if (cat === "lava-loucas & cubas") return S("MOILLC");
  if (cat === "moveis & arrumacao casa de banho") {
    if (/espelho/.test(sub)) return /led|luz/.test(n) ? S("MOIECL") : S("MOIE");
    if (/aplique/.test(sub)) return S("MOIAL");
    if (/tampo|bancada/.test(sub)) return S("MOITB");
    return S("MOIMWC");
  }
  if (cat === "acessorios de casa de banho") {
    if (/toalheiro/.test(sub) && /eletric/.test(n)) return S("MOITE");
    if (/pega|banco|cadeira/.test(sub) || /barra de apoio/.test(n)) return S("MOIASWC");
    return S("MOIAWC");
  }
  if (cat.startsWith("revestimentos")) {
    if (/rodape/.test(n)) return S("MOIRP");
    if (/spc/.test(sub)) return S("MOIPSPC");
    if (/pedra/.test(sub)) return S("MOIPN0001");
    if (/acustic/.test(sub)) return S("MOIPA");
    if (/microcimento/.test(sub)) return S("MOPRMC0001");
    return classificarProduto(p).sub === "Pavimento" ? S("MOIP") : S("MOIR");
  }
  if (cat === "mobiliario & componentes cozinha") {
    if (/armario de coluna c\/espaco/.test(n)) return S("MOACIACC0001");
    if (/canto em l/.test(n)) return S("MOACIAI0033");
    return null;
  }
  if (cat === "eletrodomesticos") {
    if (/esquentador/.test(sub)) return S("MOIEG");
    if (/ventax/.test(sub)) return S("MOIV");
    if (/placa/.test(sub) && /gas/.test(n)) return S("MOIEG");
    if (/termoacumulador/.test(sub)) return null;
    return S("MOIEC");
  }
  // as redes mosquiteiras: o serviço da Mudelar tem o mesmo nome do produto (14/10)
  if (cat === "janelas") return /rede/.test(n) ? svcPorNome.get(nome) ?? null : S("MOIJAWC");
  // os roupeiros de catálogo: a "Instalação de Roupeiros" com as mesmas portas e as mesmas medidas (14/10)
  if (cat === "mobiliario de roupeiros") {
    const portas = /(\d) portas de (correr|abrir)/.exec(n), dim = DIM.exec(p.name);
    if (!portas || !dim) return null;
    const medidas = [dim[1], dim[2], dim[3]].filter(Boolean).join("x");
    const ok = [...svcPorNome].filter(([sn]) => sn.startsWith("instalacao de roupeiros") && sn.includes(portas[0]) && sn.includes(medidas));
    return ok.length === 1 ? ok[0][1] : null;
  }
  // a bomba de condensados: o técnico de AVAC à hora (1 h por bomba; 14/10)
  if (cat === "avac") return /bomba/.test(n) ? S("MOAVAC") : null;
  if (cat === "portas") return /vidro/.test(n) ? S("MOIPCVT") : /espelho/.test(n) ? S("IPCGE0001") : S("MOIPCPL");
  if (cat === "marmorista") return S("MOMC0001");
  if (cat === "materiais") {
    const M = [[/teto falso/, "MOITFP"], [/vinyl \+ primario\s+para teto/, "MOPT"], [/estuque para paredes/, "MOEPP"], [/tinta vinyl/, "MOPP"], [/reboco de parede/, "MORPSP"],
      [/reboco de teto/, "MORTSP"], [/betonilha/, "MOBP0001"], [/autonivelante/, "MOIAN1"], [/impermeabilizante/, "MOIKI"], [/la de rocha/, "MOILAR"], [/murete/, "MOMA"],
      [/tijolo/, "MOLPA"], [/canalizacao multicamada/, "MOMGCM0001"], [/ponto de agua/, "MOGDPA"], [/ponto de esgoto/, "MODPE"], [/acabamento roco/, "MOAFRCA"], [/sanca/, "MOIS0001"], [/verniz/, "MOAE"],
      [/^foco/, "MOIAL"]]; // 14/10: o foco LED solto instala-se como um aplique LED
    for (const [re, sku] of M) if (re.test(n)) return S(sku);
    return null;
  }
  if (cat === "eletrica") {
    const M = [[/interruptor/, "MOME0004"], [/tomada/, "MOIET"], [/disjuntor/, "MOME0008"], [/quadro eletrico/, "MOME0002"], [/cablagem|^fio 1\.5/, "MOME0003"], [/fita led/, "MOME0001"],
      [/^foco/, "MOIAL"]]; // 14/10: o foco LED solto instala-se como um aplique LED
    for (const [re, sku] of M) if (re.test(n)) return S(sku);
    return null;
  }
  return null;
}

/**
 * Os produtos que se instalam mas ficam sem serviço, com a razão (14/10). Nos ramos que foram revistos (AVAC, Elétrica,
 * Janelas, Roupeiros, Termoacumuladores), o gerador falha se aparecer um produto sem serviço que não esteja aqui.
 */
const SEM_SERVICO = [
  [/^termoacumulador/, "A Mudelar não tem um serviço de instalação de termoacumulador (precisa de canalizador e de eletricista; o do esquentador é de gás). A pedir à Mudelar."],
];

/* ------------------------------------------------------------------ serviço que exige produto (com a pergunta) */
// sku → [ofício, sub, pergunta, regra da quantidade (null = 1)]
const EXIGE = {
  MOISSUSP: ["Canalização", "Louças e torneiras", "O cliente mantém a sanita?"],
  MOISE: ["Canalização", "Louças e torneiras", "O cliente mantém a sanita?"],
  MOIBBTW: ["Canalização", "Louças e torneiras", "O cliente mantém o bidé?"],
  MOIBSUSP: ["Canalização", "Louças e torneiras", "O cliente mantém o bidé?"],
  MOIBDXXL: ["Canalização", "Louças e torneiras", "O cliente mantém a base de duche?"],
  MOIL: ["Canalização", "Louças e torneiras", "O cliente mantém o lavatório?"],
  MOICD: ["Canalização", "Louças e torneiras", "O cliente mantém a coluna de duche?"],
  MOICDE: ["Canalização", "Louças e torneiras", "O cliente mantém a coluna de duche?"],
  MOITL: ["Canalização", "Louças e torneiras", "O cliente mantém a torneira do lavatório?"],
  MOITBD: ["Canalização", "Louças e torneiras", "O cliente mantém a torneira do bidé?"],
  MOITC: ["Canalização", "Lava-loiças e torneiras de cozinha", "O cliente mantém a torneira da cozinha?"],
  MOILLC: ["Canalização", "Lava-loiças e torneiras de cozinha", "O cliente mantém o lava-loiça?"],
  MOIMWC: ["Carpintaria", "Móveis de casa de banho", "O cliente mantém o móvel do lavatório?"],
  MOIRKENNAXXL: ["Carpintaria", "Resguardos", "O cliente mantém o resguardo?"],
  MOIE: ["Carpintaria", "Acessórios WC", "O cliente mantém o espelho?"],
  MOIECL: ["Carpintaria", "Acessórios WC", "O cliente mantém o espelho?"],
  MOITE: ["Carpintaria", "Acessórios WC", "O cliente mantém o toalheiro?"],
  MOIR: ["Revestimentos", "Parede", "O cliente mantém o revestimento?", ["par", 1.1, true]],
  MOIPSPC: ["Revestimentos", "Pavimento", "O cliente mantém o pavimento?", ["pav", 1.1, true]],
  MOIJAWC: ["Caixilharia", "Janelas", "O cliente mantém a janela?"],
  MOIPCPL: ["Carpintaria", "Portas", "O cliente mantém a porta?"],
};

/* ------------------------------------------------------------------ correr */
function main() {
  const svcIn = JSON.parse(fs.readFileSync(path.join(ENTRADA, "mudelar-servicos.json"), "utf8"));
  const prodIn = JSON.parse(fs.readFileSync(path.join(ENTRADA, "mudelar-produtos.json"), "utf8"));
  const cProto = lerCatalogoProto();
  if (cProto.length !== 41) throw new Error(`Esperava 41 serviços c1..c41 em catalogo.ts e li ${cProto.length}.`);

  // os produtos que são material de consumo passam a consumíveis (eConsumivel), antes das receitas, que os usam por "sku:<sku>"
  const nomes = new Map();
  for (const p of prodIn) { const k = normal(limpo(p.name)); nomes.set(k, (nomes.get(k) ?? 0) + 1); }
  const consDeProduto = [];
  for (const p of prodIn) {
    if (motivoExclusao(p) || !eConsumivel(p)) continue;
    const { marca, forn } = marcaFornecedor(p, classificarProduto(p));
    let n = limpo(p.name);
    if (nomes.get(normal(n)) > 1) n = `${n} · ${p.sku}`;
    if (CONS.some((c) => normal(c.n) === normal(n))) throw new Error("consumível repetido: " + n);
    const c = { k: "sku:" + p.sku, id: "k" + (CONS.length + 1), n, un: unidadeConsumivel(p), preco: num(p.custo), fornecedor: forn, marca,
      data: mesesAntes(HOJE, Math.floor(aleatorio("prod:" + p.sku) * 6)), opcional: false, sku: p.sku };
    CONS.push(c); K[c.k] = c; consDeProduto.push(c);
  }

  // os c1..c41 ligam-se ao sku pelo nome (sem duplicar: o serviço da Mudelar fica com o id cN)
  const porNome = new Map(svcIn.map((s) => [normal(limpo(s.name)), s]));
  const cDoSku = new Map();
  for (const c of cProto) { const s = porNome.get(normal(limpo(c.n))); if (s) cDoSku.set(s.sku, c.id); }

  const usados = new Set();
  const idSvc = (s) => {
    if (cDoSku.has(s.sku)) return cDoSku.get(s.sku);
    let id = "s-" + slug(s.sku); while (usados.has(id)) id += "x";
    usados.add(id); return id;
  };
  const servicos = svcIn.map((s) => {
    const f = familia(s), id = idSvc(s), cId = cDoSku.get(s.sku) ?? null;
    if (!temNo(f.of, f.sub)) throw new Error(`Nó por criar: ${f.of} › ${f.sub} (${s.sku})`);
    const r = receita(s, f, cId);
    const cProtoItem = cId ? cProto.find((c) => c.id === cId) : null;
    return { id, sku: s.sku, n: limpo(s.name), of: f.of, sub: f.sub, un: cProtoItem?.un ?? f.un ?? unidadeDe(s.name), pvp: num(s.pvp), custo: num(s.custo), med: f.med, ic: f.ic, ln: f.ln, cId, r };
  });
  // ordem: os ofícios novos pela ordem da árvore (o OFICIOS do protótipo sai da 1.ª aparição em CATALOGO)
  const ordemOf = [...OFICIOS_EXISTENTES, ...OFICIOS_NOVOS.map((o) => o[0])];
  const svcOrdenados = [...servicos].sort((a, b) => ordemOf.indexOf(a.of) - ordemOf.indexOf(b.of));
  const svcPorSku = new Map(servicos.map((s) => [s.sku, s.id]));
  const svcPorNome = new Map(servicos.map((s) => [normal(s.n).replace(/\s+/g, " ").trim(), s.id]));

  // produtos
  const excluidos = [];
  const marcas = [], forns = [], subsT = [], nos = [];
  const idx = (arr, v) => { const k = v ?? ""; let i = arr.indexOf(k); if (i < 0) { arr.push(k); i = arr.length - 1; } return i; };
  const idxNo = (of, sub) => { const k = `${of ?? ""}|${sub ?? ""}`; let i = nos.findIndex((x) => x.join("|") === k); if (i < 0) { nos.push([of ?? "", sub ?? ""]); i = nos.length - 1; } return i; };
  const idsP = new Set();
  const produtos = [];
  const semServico = [];
  let comServico = 0;
  for (const p of prodIn) {
    const motivo = motivoExclusao(p);
    if (motivo) { excluidos.push({ sku: p.sku, n: limpo(p.name), motivo }); continue; }
    if (eConsumivel(p)) continue; // passou a consumível (acima)
    const cl = classificarProduto(p);
    if (cl.of && !temNo(cl.of, cl.sub)) throw new Error(`Nó por criar (produto): ${cl.of} › ${cl.sub}`);
    const { marca, forn } = marcaFornecedor(p, cl);
    const un = unidadeProduto(p);
    let n = limpo(p.name);
    if (nomes.get(normal(n)) > 1) n = `${n} · ${p.sku}`;
    let id = "p-" + slug(p.sku); while (idsP.has(id)) id += "x"; idsP.add(id);
    const svc = servicoDoProduto(p, svcPorSku, svcPorNome);
    if (svc) comServico++;
    else if (["avac", "eletrica", "janelas", "mobiliario de roupeiros"].includes(normal(p.cat)) || /termoacumulador/.test(normal(p.sub ?? ""))) {
      // estes ramos ficam todos com serviço (14/10), salvo os de SEM_SERVICO, com a razão
      const razao = SEM_SERVICO.find(([re]) => re.test(normal(p.name)));
      if (!razao) throw new Error(`Produto sem serviço de instalação: ${p.sku} · ${p.name}`);
      semServico.push({ sku: p.sku, n: limpo(p.name), razao: razao[1] });
    }
    const sub = limpo(p.sub) ?? limpo(p.cat) ?? null;
    const meses = Math.floor(aleatorio("prod:" + p.sku) * 6); // 0 a 5 meses: a tabela de preços da Mudelar é recente
    produtos.push([id, p.sku, n, idxNo(cl.of, cl.sub), idx(subsT, sub), idx(marcas, marca), idx(forns, forn), un, num(p.custo), num(p.pvp), cl.img, descricao(p, sub, marca, un), mesesAntes(HOJE, meses), svc ?? "", svc ? 1 : 0]);
  }

  // cada consumível vindo de um produto tem de entrar numa receita (senão seria "consumível sem uso" nas Ligações)
  const consUsados = new Set(servicos.flatMap((s) => s.r.cs.filter((c) => c.length === 3).map((c) => c[0])));
  for (const c of consDeProduto) if (!consUsados.has(c.id)) throw new Error(`Consumível sem uso: ${c.n} (${c.k})`);
  // e cada equipamento novo numa receita (senão seria "equipamento sem uso")
  const eqUsados = new Set(servicos.flatMap((s) => s.r.eq.map(([e]) => e)));
  for (const e of EQUIP_NOVOS) if (!eqUsados.has(idEquip(e[0]))) throw new Error(`Equipamento sem uso: ${e[0]}`);

  // relações serviço → produto obrigatório
  const exige = [];
  for (const [sku, [of, sub, pergunta, regra]] of Object.entries(EXIGE)) {
    const sid = svcPorSku.get(sku);
    if (!sid) throw new Error("exige: sku " + sku);
    exige.push([sid, of, sub, pergunta, regra ?? null]);
  }

  // o relatório da calibração
  const comCusto = servicos.filter((s) => s.custo > 0);
  const dentro = comCusto.filter((s) => Math.abs(s.r.calc / s.custo - 1) <= 0.3);
  const resumo = {
    gerado: GERADO, semente: SEMENTE, servicos: servicos.length, ligadosAoC: cDoSku.size, servicosNovos: servicos.length - cDoSku.size,
    produtosEntrada: prodIn.length, produtos: produtos.length, produtosExcluidos: excluidos.length, produtosComServico: comServico,
    produtosParaConsumivel: consDeProduto.length, produtosSemServicoJustificado: semServico.length,
    perfisNovos: PERFIS_NOVOS.length, equipamentos: EQUIP.length, equipamentosNovos: EQUIP_NOVOS.length, consumiveis: CONS.length,
    consumiveisOpcionais: CONS.filter((c) => c.opcional).length, receitasComCusto: comCusto.length, receitasDentro30: dentro.length,
  };

  const bruto = {
    resumo,
    perfis: PERFIS_NOVOS,
    equip: EQUIP_NOVOS.map(([n, ...r]) => [idEquip(n), n, ...r]),
    cons: CONS.map((c) => [c.id, c.n, c.un, c.preco, c.fornecedor, c.marca, c.data, c.opcional ? 1 : 0, ...(c.sku ? [c.sku] : [])]),
    subsNovos: SUBS_NOVOS_EXISTENTES, oficiosNovos: OFICIOS_NOVOS, perfilDoOficio: PERFIL_DOS_OFICIOS_NOVOS,
    servicos: svcOrdenados.map((s) => [s.id, s.sku, s.n, s.of, s.sub ?? "", s.un, s.pvp, s.custo, s.med ?? "", s.ic, s.ln.join(","), s.cId ?? "", s.r.rs ?? [0, 0, 0, 0], s.r.mo, s.r.eq, s.r.cs]),
    exige,
    excluidos,
    semServico,
  };
  const brutoP = { nos, subs: subsT, marcas, forns, produtos };

  fs.mkdirSync(SAIDA, { recursive: true });
  const cab = (o) => `// GERADO por operacao-app/tools/catalogo-mudelar/gerar.mjs a ${GERADO} (semente ${SEMENTE}). Não editar à mão: correr o gerador.\n// ${o}\n`;
  fs.writeFileSync(path.join(SAIDA, "mudelarServicos.ts"),
    cab("Serviços (358, PVP e custo reais), receitas, perfis novos, equipamentos novos e consumíveis. Ler por catalogoMudelar.ts.") +
    `import type { BrutoServicos } from "./catalogoMudelar";\n\nexport const BRUTO_SERVICOS: BrutoServicos = JSON.parse(${JSON.stringify(JSON.stringify(bruto))});\n`);
  fs.writeFileSync(path.join(SAIDA, "mudelarProdutos.ts"),
    cab(`Produtos da Mudelar (${produtos.length} de ${prodIn.length}; ${excluidos.length} excluídos). Ler por catalogoMudelar.ts.`) +
    `import type { BrutoProdutos } from "./catalogoMudelar";\n\nexport const BRUTO_PRODUTOS: BrutoProdutos = JSON.parse(${JSON.stringify(JSON.stringify(brutoP))});\n`);

  const tam = (f) => (fs.statSync(path.join(SAIDA, f)).size / 1024).toFixed(0) + " KB";
  console.log(JSON.stringify(resumo, null, 2));
  console.log(`Dentro de ±30%: ${dentro.length}/${comCusto.length} (${((100 * dentro.length) / comCusto.length).toFixed(1)}%)`);
  console.log(`mudelarServicos.ts ${tam("mudelarServicos.ts")} · mudelarProdutos.ts ${tam("mudelarProdutos.ts")}`);
  console.log(`Excluídos: ${excluidos.map((e) => `${e.sku} (${e.motivo})`).join(", ")}`);
  console.log(`Produtos que passaram a consumível (${consDeProduto.length}): ${consDeProduto.map((c) => c.sku).join(", ")}`);
  console.log(`Produtos sem serviço, com razão (${semServico.length}): ${semServico.map((x) => x.sku).join(", ")}`);
  const naoLigados = cProto.filter((c) => ![...cDoSku.values()].includes(c.id)).map((c) => c.id);
  if (naoLigados.length) console.log("c sem sku:", naoLigados.join(", "));
}
main();
