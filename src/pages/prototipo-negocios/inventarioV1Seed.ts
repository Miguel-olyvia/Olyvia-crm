// Os dados de exemplo do Inventário no V1 (19/10/2026): os da Mudelar, uma empresa de remodelações (cozinhas e casas de banho).
// Os do mockup (inventario/seed.ts) são de uma empresa de climatização e solar (bombas de calor, painéis, inversores) e de clientes
// inventados que não existem nos Negócios ("Cliente Ferreira Obras"): no V1 o Inventário fala das obras dos Negócios.
// · O Armazém Central (o "LIS" de onde saem as obras: ponteNegocios.ARMAZEM_OBRAS) e as carrinhas da Frota (armazéns móveis).
// · Os materiais das obras e os três fornecedores delas entram como no motor (garantirArtigosObra); juntam-se os consumíveis do dia a dia.
// · Um pouco de história, para o livro de movimentos e as encomendas não estarem vazios: uma encomenda recebida, uma a caminho
//   (confirmada no portal do fornecedor) e um consumível abaixo do mínimo, por encomendar.
// As encomendas de cliente das obras não vêm daqui: nascem do pagamento validado no negócio (ponteNegocios.ts), como antes.
// Tudo isto é inventado. O relógio do Inventário é o do mockup (09/10/2026: inventario/base.ts HOJE).
import { comoSistema, mudou } from "./inventario/base";
import { CARRINHAS } from "./inventario/carrinhas";
import { ARMAZEM_OBRAS, garantirArtigosObra } from "./inventario/ponteNegocios";
import { enviarPo, linhaDeArtigo, novaPo, portalConfirmar, portalVista } from "./inventario/po";
import { receberLinhas } from "./inventario/receber";
import { baseVazia } from "./inventario/seed";
import { aplicarMovimentos, linhaStock } from "./inventario/stock";
import type { Inventario, Produto } from "./inventario/tipos";

/** Quem trata do armazém no V1 (o papel Armazém do protótipo). */
export const FIEL = "Nuno";

/** O fornecedor dos consumíveis (sem portal: a encomenda segue por email). */
const CONSUMIVEIS = { id: "consum", name: "Consumíveis Lisboa (exemplo)", code: "FOR-104", city: "Lisboa", sla: 2 };

// [sku, nome, categoria, unidade, venda, custo, stock no Armazém Central, mínimo, ponto de encomenda, fornecedor (ou null: só nas carrinhas)]
const PRODUTOS: [string, string, string, string, number, number, number, number, number, string | null][] = [
  ["CS-SAC", "Sacos de entulho (rolo de 10)", "Consumíveis", "rolos", 9.9, 5.2, 14, 6, 10, "consum"],
  ["CS-PLA", "Plástico de proteção 4 × 5 m", "Consumíveis", "un", 6.5, 3.1, 3, 6, 8, "consum"],
  ["CS-FIT", "Fita de pintor 48 mm", "Consumíveis", "un", 4.2, 1.9, 30, 10, 15, "consum"],
  ["SIL-N", "Silicone sanitário branco", "Consumíveis", "un", 6.9, 3.2, 24, 10, 15, "consum"],
  ["CS-JUN", "Argamassa de juntas · saco 5 kg", "Consumíveis", "sacos", 11.5, 6.4, 18, 8, 10, "consum"],
  ["TM-16", "Tubo multicamada 16 mm (metro)", "Canalização", "m", 2.4, 1.35, 200, 50, 100, "consum"],
  ["VE-12", "Válvula de esfera 1/2\"", "Canalização", "un", 9.9, 5.4, 20, 6, 10, "consum"],
  ["FT-01", "Fita de teflon", "Canalização", "un", 1.5, 0.6, 40, 10, 15, "consum"],
  ["ABR-48", "Abraçadeiras 4,8 × 200", "Elétrico", "un", 0.1, 0.04, 400, 100, 150, "consum"],
  ["TC-15", "Tubo de cobre 15 mm (metro)", "Canalização", "m", 8.4, 5.1, 0, 0, 0, null],
  ["CC-15", "Curvas de cobre 15 mm", "Canalização", "un", 1.9, 0.9, 0, 0, 0, null],
  ["SOL-K", "Solda e decapante", "Canalização", "kit", 24, 13.5, 0, 0, 0, null],
  ["ISO-15", "Isolamento de tubo 15 mm (metro)", "Canalização", "m", 1.6, 0.8, 0, 0, 0, null],
  ["TP-U", "Termopar universal", "Aquecimento", "un", 14.5, 7.9, 0, 0, 0, null],
  ["KV-C", "Kit de vedantes de caldeira", "Aquecimento", "un", 12, 6.5, 0, 0, 0, null],
  ["NTC-10", "Sonda de temperatura NTC 10k", "Aquecimento", "un", 18, 9.6, 0, 0, 0, null],
  ["FUS-3", "Fusíveis 3,15 A", "Elétrico", "un", 0.8, 0.3, 0, 0, 0, null],
  ["FAC-01", "Filtros de ar condicionado", "Climatização", "un", 9.5, 4.8, 0, 0, 0, null],
  ["R32", "Gás R32 (garrafa)", "Climatização", "un", 129, 82, 0, 0, 0, null],
  ["LIMP-B", "Spray de limpeza de baterias", "Climatização", "un", 8.5, 4.1, 0, 0, 0, null],
  ["ESC-7", "Escadote de 7 degraus", "Ferramentas", "un", 129, 79, 0, 0, 0, null],
  ["SDS-K", "Berbequim e martelo SDS", "Ferramentas", "kit", 389, 245, 0, 0, 0, null],
];

function armazem(db: Inventario): void {
  db.warehouses.push({
    id: ARMAZEM_OBRAS, name: "Armazém Central", code: "ARM-01", addr: "Rua Industrial 18", cp: "1950-123", city: "Lisboa", lat: 38.751, lng: -9.102,
    manager: FIEL, phone: "210 000 111", email: "armazem@mudelar.exemplo", cap: "600 m²", active: true, serves: true, deleted: false,
  });
  CARRINHAS.forEach((c, i) => {
    db.warehouses.push({ id: c.id, name: `Carrinha ${c.mat}`, code: `VIA-${String(i + 1).padStart(2, "0")}`, addr: "Armazém móvel (viatura)", cp: "", city: c.cidade, lat: null, lng: null,
      manager: c.condutor, phone: "", email: "", cap: "Viatura", active: true, serves: false, deleted: false, tipo: "viatura", matricula: c.mat });
  });
}

function consumiveis(db: Inventario): void {
  db.suppliers.push({
    ...CONSUMIVEIS, contact: "Loja da Rua Industrial", email: "encomendas@consumiveis.exemplo", phone: "210 000 404", nif: "509100046", company: "Mudelar", addr: "Rua Industrial 40", cp: "1950-125",
    country: "Portugal", web: "", notes: "Consumíveis do dia a dia: entrega em 2 dias úteis.", active: true, deleted: false,
    portal: "none", portalUsers: 0, lastAccess: null, dataConfirmed: true, invitedAt: null, awaiting: false,
  });
  const abertura: Parameters<typeof aplicarMovimentos>[1] = [];
  for (const [sku, name, cat, unit, sale, cost, qty, min, rop, sup] of PRODUTOS) {
    const p: Produto = { sku, ean: "", name, cat, sub: sup ? "Armazém" : "Carrinha", unit, sale, cost, avg: 0, codes: [], deleted: false };
    db.products.push(p);
    if (sup) {
      db.items.push({ id: "I" + (db.items.length + 1), sup, sku, ref: "CL-" + sku, packN: 1, unitLabel: unit === "un" ? "Unidade" : unit, price: cost, pref: true, moq: 1, lead: CONSUMIVEIS.sla });
      const r = linhaStock(db, sku, ARMAZEM_OBRAS, true);
      if (r) Object.assign(r, { loc: "C-" + String(db.stocks.length).padStart(2, "0"), min, max: Math.max(min * 4, rop * 2), rop });
      if (qty) abertura.push({ type: "in", sku, wh: ARMAZEM_OBRAS, qty, doc: "Saldo inicial", note: "Abertura do inventário", cost, user: FIEL });
    }
  }
  if (abertura.length) aplicarMovimentos(db, abertura);
}

/** A carga de cada carrinha (a mesma da Frota), entrada no dia da abertura. */
function carrinhas(db: Inventario): void {
  const carga: Parameters<typeof aplicarMovimentos>[1] = [];
  for (const c of CARRINHAS) for (const [sku, qty, min] of c.stock) {
    const r = linhaStock(db, sku, c.id, true);
    if (r) Object.assign(r, { loc: "Carrinha", min, max: min * 2, rop: min });
    carga.push({ type: "in", sku, wh: c.id, qty, doc: "Carga inicial", note: `Carga da carrinha ${c.mat}`, cost: db.products.find((p) => p.sku === sku)?.cost, user: FIEL });
  }
  aplicarMovimentos(db, carga);
}

/** Uma encomenda recebida (sacos de entulho) e uma a caminho (bases de duche, confirmada no portal para 13/10). */
function historia(db: Inventario): void {
  const po = (sup: string, date: string, linhas: [string, number][]) => {
    db.relogio = date + "T09:10";
    const p = novaPo(db, { sup, wh: ARMAZEM_OBRAS, date });
    for (const [sku, n] of linhas) { const i = db.items.find((x) => x.sup === sup && x.sku === sku); if (i) p.lines.push(linhaDeArtigo(db, i, n)); }
    enviarPo(db, p);
    return p;
  };
  const sacos = po("consum", "2026-09-29", [["CS-SAC", 10], ["CS-FIT", 20]]);
  db.relogio = "2026-10-01T10:20";
  receberLinhas(db, sacos, sacos.lines.map((l) => ({ lineId: l.id, qty: l.packs * l.packN })), ARMAZEM_OBRAS, null);
  const bases = po("sanit", "2026-10-06", [["OB-BD80", 2], ["OB-SANS", 2]]);
  db.relogio = "2026-10-06T16:40"; portalVista(db, bases);
  db.relogio = "2026-10-07T09:05"; portalConfirmar(db, bases, "2026-10-13", "Saem do nosso armazém na sexta; entregamos na terça de manhã.");
  // dois preços novos pedidos pelos fornecedores, por rever (aceites, passam a ser o custo do material)
  const preco = (sku: string, sup: string, nw: number, at: string) => {
    const it = db.items.find((i) => i.sup === sup && i.sku === sku);
    if (it) db.prices.push({ id: "PC" + (db.prices.length + 1), sup, itemId: it.id, cur: it.price, nw, state: "pending", at, note: "" });
  };
  preco("SIL-N", "consum", 3.6, "2026-10-08T11:00");
  preco("OB-CP3060", "ceram", 14.9, "2026-10-07T15:20");
  // as saídas da obra da Marta Lima (WC, em curso): o livro mostra para onde foi o material
  db.relogio = "2026-10-09T08:15";
  aplicarMovimentos(db, [
    { type: "out", sku: "OB-CIM25", wh: ARMAZEM_OBRAS, qty: 6, doc: "Obra #1022", note: "Obra da Marta Lima · WC · Odivelas", user: FIEL },
    { type: "out", sku: "CS-SAC", wh: ARMAZEM_OBRAS, qty: 2, doc: "Obra #1022", note: "Obra da Marta Lima · WC · Odivelas", user: FIEL },
  ]);
}

/** A base do Inventário no V1, no estado de 09/10/2026. */
export function criarSeedV1(): Inventario {
  return comoSistema(() => {
    const db = baseVazia();
    db.rc = { ...db.rc, sup: "", guia: "", rejected: [], toSend: [], toConfirm: [] };
    db.relogio = "2026-09-01T08:30";
    armazem(db);
    garantirArtigosObra(db);
    // os materiais das obras compram-se por obra (a encomenda de cliente pede o que falta): sem mínimo, salvo o cimento-cola, que se gasta em todas
    for (const r of db.stocks) if (r.sku.startsWith("OB-") && r.sku !== "OB-CIM25") Object.assign(r, { min: 0, max: 0, rop: 0 });
    consumiveis(db);
    carrinhas(db);
    historia(db);
    db.relogio = null;
    mudou(db);
    return db;
  });
}
