// Os dados de exemplo do Inventário (do mockup): construídos pelo próprio motor, como no original, com a data de hoje fixa (09/10/2026).
// Tudo isto é inventado: produtos, fornecedores, clientes, encomendas e guias.
import { comoSistema, mudou, nifCompleto, proximoId } from "./base";
import { criarContagem, finalizarContagem } from "./contagens";
import { criarEc, sairLinha } from "./ec";
import { cancelarGuia, fecharGuia, guardarGuia } from "./guias";
import { enviarPo, linhaDeArtigo, novaPo, portalConfirmar, portalVista } from "./po";
import { receberLinhas } from "./receber";
import { aplicarMovimentos, criarPedidoTransf, linhaStock } from "./stock";
import { CARRINHAS } from "./carrinhas";
import type { Ec, Fornecedor, Inventario, Po, Produto } from "./tipos";

export function baseVazia(): Inventario {
  return {
    v: 0, seq: 0, n: { po: 131, ec: 84, tr: 6, inv: 11 }, settings: { autoPO: "direct", deduction: "contract", defaultWh: "LIS" },
    products: [], warehouses: [], stocks: [], suppliers: [], items: [], catalog: [], prices: [], pos: [], ecs: [], guias: [], counts: [], transfers: [], moves: [], vds: [], relogio: null,
    rc: { wh: "LIS", guia: "GR 2026/312", sup: "zeta", poFilter: "", mode: "scanner", basket: [], rejected: [{ code: "7790001112223", at: "2026-10-09T08:41" }], queued: [], toSend: [{ sku: "KF-10", qty: 2, at: "2026-10-08T18:02" }], toConfirm: [{ items: [{ sku: "CS-6", qty: 100 }], at: "2026-10-08T17:55", err: "Sem rede ao confirmar" }], session: [], ack: false, net: true, result: null },
  };
}

const DIAG = { text: "Moradia T3, cobertura cerâmica orientada a sul, 32 m² úteis. Quadro elétrico com espaço para 2 disjuntores. Acesso ao telhado por escada exterior.", items: ["Distância quadro–inversor: 12 m", "Radiadores existentes: 6 (substituir 3)", "Água quente: depósito antigo a retirar"] };

function produtos(db: Inventario): void {
  const pr = (sku: string, ean: string, name: string, cat: string, sub: string, sale: number, cost: number, extra: Partial<Produto> = {}): void => {
    db.products.push({ sku, ean, name, cat, sub, unit: "un", sale, cost, avg: 0, codes: [], deleted: false, ...extra });
  };
  pr("BC-08", "5601234000011", "Bomba de calor ar-água 8 kW", "Climatização", "Bombas de calor", 4290, 2850);
  pr("AQS-200", "5601234000103", "Depósito AQS 200 L", "Climatização", "AQS", 890, 610);
  pr("TR-50", "5601234000127", "Termoacumulador elétrico 50 L", "Climatização", "AQS", 219, 138);
  pr("PV-450", "5601234000028", "Painel fotovoltaico 450 W", "Solar", "Painéis", 175, 118);
  pr("INV-H5", "5601234000035", "Inversor híbrido 5 kW", "Solar", "Inversores", 1390, 940);
  pr("CS-6", "5601234000080", "Cabo solar 6 mm² (metro)", "Solar", "Cablagem", 1.6, 0.95);
  pr("ST-04", "5601234000097", "Estrutura telhado cerâmico (4 painéis)", "Solar", "Estruturas", 249, 165);
  pr("KIT-PV4", "5601234000134", "Kit solar 4 painéis (pacote)", "Solar", "Kits", 1290, 0, { kit: [{ sku: "PV-450", qty: 4 }, { sku: "ST-04", qty: 1 }, { sku: "CS-6", qty: 20 }] });
  pr("TM-16", "5601234000042", "Tubo multicamada 16 mm (metro)", "Canalização", "Tubagem", 2.4, 1.35);
  pr("VT-15", "5601234000059", "Válvula termostática 15 mm", "Canalização", "Válvulas", 24.9, 14.2, { codes: ["CX-10"] });
  pr("RA-600", "5601234000066", "Radiador alumínio 600 mm (elemento)", "Aquecimento", "Radiadores", 16.5, 9.8, { codes: ["CX-10"] });
  pr("LR-50", "5601234000073", "Lã de rocha 50 mm (m²)", "Isolamento", "Lãs minerais", 6.2, 3.6);
  pr("CD-80", "5601234000110", "Caixa de derivação estanque 80 mm", "Elétrico", "Caixas", 4.2, 2.1);
  pr("KF-10", "5601234000141", "Kit fixação química", "Ferragens", "Fixação", 12.9, 7.4);
}

function armazens(db: Inventario): void {
  db.warehouses = [
    { id: "LIS", name: "Armazém Central (Lisboa)", code: "ARM-01", addr: "Rua Industrial 18", cp: "1950-123", city: "Lisboa", lat: 38.751, lng: -9.102, manager: "T. Marques", phone: "210 000 111", email: "central@exemplo.pt", cap: "1 800 m²", active: true, serves: true, deleted: false },
    { id: "POR", name: "Armazém Norte (Porto)", code: "ARM-02", addr: "Av. da Indústria 240", cp: "4100-321", city: "Porto", lat: 41.162, lng: -8.629, manager: "R. Sousa", phone: "220 000 222", email: "norte@exemplo.pt", cap: "950 m²", active: true, serves: true, deleted: false },
    { id: "FAR", name: "Armazém Sul (Faro)", code: "ARM-03", addr: "Parque Empresarial, Lote 7", cp: "8005-410", city: "Faro", lat: 37.031, lng: -7.931, manager: "L. Pires", phone: "289 000 333", email: "sul@exemplo.pt", cap: "400 m²", active: false, serves: false, deleted: false },
    { id: "SET", name: "Depósito Temporário (Setúbal)", code: "ARM-04", addr: "Estrada Nacional 10, km 3", cp: "2910-001", city: "Setúbal", lat: 38.53, lng: -8.88, manager: "—", phone: "", email: "", cap: "120 m²", active: false, serves: false, deleted: true },
  ];
}

function fornecedores(db: Inventario): void {
  const su = (id: string, name: string, code: string, city: string, company: string, nif0: string, sla: number, portal: Fornecedor["portal"], email: string, extra: Partial<Fornecedor> = {}): void => {
    const nif = nifCompleto("5090000" + nif0.slice(-1));
    db.suppliers.push({
      id, name, code, contact: "Departamento comercial", email, phone: "2" + nif.slice(-8), nif, company, sla, addr: "Zona Industrial, Lote " + nif.slice(-2), city, cp: "", country: "Portugal", web: "", notes: "",
      active: true, deleted: false, portal, portalUsers: portal === "active" ? 2 : 0, lastAccess: portal === "active" ? "2026-10-08T17:40" : null, dataConfirmed: portal === "active",
      invitedAt: portal === "invited" ? "2026-10-01T10:00" : null, awaiting: false, ...extra,
    });
  };
  su("alfa", "Fornecedor Alfa Materiais", "FOR-001", "Lisboa", "Empresa A (Lisboa)", "509000001", 5, "active", "encomendas@alfa.exemplo", { web: "alfa.exemplo" });
  su("beta", "Beta Climatização", "FOR-002", "Porto", "Empresa A (Lisboa)", "509000002", 7, "invited", "compras@beta.exemplo", { awaiting: true, invite: { email: "compras@beta.exemplo", name: "Responsável de compras", state: "pending", at: "2026-10-01T10:00" } });
  su("gama", "Gama Elétrica", "FOR-003", "Braga", "Empresa B (Porto)", "509000003", 4, "none", "vendas@gama.exemplo");
  su("delta", "Delta Isolamentos", "FOR-004", "Coimbra", "Empresa A (Lisboa)", "509000004", 6, "revoked", "geral@delta.exemplo");
  su("eps", "Épsilon Ferragens", "FOR-005", "Leiria", "Empresa B (Porto)", "509000005", 3, "none", "pedidos@epsilon.exemplo");
  su("zeta", "Zeta Solar", "FOR-006", "Évora", "Empresa A (Lisboa)", "509000006", 8, "active", "portal@zeta.exemplo");
  su("omega", "Ómega Tintas", "FOR-007", "Setúbal", "Empresa B (Porto)", "509000007", 5, "none", "omega@exemplo.pt", { deleted: true, active: false });
  const it = (sup: string, sku: string, ref: string, packN: number, unitLabel: string, price: number, pref: boolean, moq = 1): void => {
    db.items.push({ id: "I" + (db.items.length + 1), sup, sku, ref, packN, unitLabel, price, pref, moq, lead: db.suppliers.find((s) => s.id === sup)?.sla ?? 5 });
  };
  it("alfa", "PV-450", "ALF-PV450", 1, "Unidade", 118, true, 10);
  it("zeta", "PV-450", "ZS-450M", 1, "Unidade", 121, false, 30);
  it("alfa", "CS-6", "ALF-CAB6-100", 100, "Bobine 100 m", 95, true);
  it("zeta", "CS-6", "ZS-C6R", 100, "Bobine 100 m", 99, false);
  it("alfa", "ST-04", "ALF-EST4", 1, "Kit", 165, true);
  it("zeta", "INV-H5", "ZS-HYB5", 1, "Unidade", 940, true);
  it("beta", "BC-08", "BC-AW8", 1, "Unidade", 2850, true);
  it("gama", "CD-80", "GM-CD80-20", 20, "Caixa 20 un", 42, true);
  it("eps", "KF-10", "EP-KF10", 1, "Unidade", 7.4, true);
  it("eps", "RA-600", "EP-RAD600-10", 10, "Caixa 10 un", 98, true);
  it("delta", "LR-50", "DL-LR50-6", 6, "Pack 6 m²", 21.6, true);
  it("alfa", "TM-16", "ALF-MC16-100", 100, "Rolo 100 m", 135, true);
  it("gama", "VT-15", "GM-VT15-10", 10, "Caixa 10 un", 142, true);
}

/** Os saldos iniciais entram por movimento, como tudo. */
function saldosIniciais(db: Inventario): void {
  const abertura: Parameters<typeof aplicarMovimentos>[1] = [];
  const sr = (sku: string, wh: string, loc: string, qty: number, min: number, max: number, rop: number): void => {
    const r = linhaStock(db, sku, wh, true);
    if (r) Object.assign(r, { loc, min, max, rop });
    if (qty) abertura.push({ type: "in", sku, wh, qty, doc: "Saldo inicial", note: "Abertura de inventário", cost: db.products.find((p) => p.sku === sku)?.cost, user: "T. Marques" });
  };
  sr("BC-08", "LIS", "A-01-02", 0, 1, 6, 2); sr("BC-08", "POR", "B-02-01", 1, 1, 6, 2);
  sr("AQS-200", "LIS", "A-03-01", 2, 1, 8, 2);
  sr("PV-450", "LIS", "P-03", 20, 30, 180, 60); sr("PV-450", "POR", "P-01", 90, 20, 80, 30);
  sr("INV-H5", "LIS", "A-02-04", 5, 2, 10, 3);
  sr("CS-6", "LIS", "P-05", 640, 200, 1000, 300); sr("CS-6", "POR", "P-02", 20, 100, 500, 150);
  sr("ST-04", "LIS", "P-06", 5, 4, 30, 8);
  sr("TM-16", "LIS", "C-01", 640, 200, 1500, 400); sr("TM-16", "POR", "C-04", 150, 100, 600, 200);
  sr("VT-15", "LIS", "C-02-03", 40, 20, 120, 30);
  sr("RA-600", "LIS", "D-01", 8, 20, 200, 40); sr("RA-600", "POR", "D-02", 12, 10, 100, 20);
  sr("LR-50", "POR", "E-01", 200, 60, 400, 120);
  sr("CD-80", "LIS", "E-02-01", 240, 50, 200, 80);
  sr("KF-10", "POR", "E-03-02", 0, 20, 100, 30); sr("KF-10", "LIS", "E-03-01", 0, 10, 60, 20);
  db.relogio = "2026-09-01T08:30";
  aplicarMovimentos(db, abertura);
}

type Ajudas = { po: (sup: string, wh: string, date: string, lines: [string, number][]) => Po; guia: (no: string, sup: string, date: string, wh: string, qty: [string, number][]) => string; ec: (date: string, origin: Ec["origin"], client: string, addr: string, wh: string, lines: { sku: string; qty: number; desc?: string; price?: number }[], diag?: boolean) => Ec; ship: (e: Ec, sku: string, qty: number, date: string) => void };

function ajudas(db: Inventario): Ajudas {
  return {
    po: (sup, wh, date, lines) => {
      db.relogio = date + "T09:10";
      const p = novaPo(db, { sup, wh, date });
      for (const [sku, packs] of lines) { const i = db.items.find((x) => x.sup === sup && x.sku === sku); if (i) p.lines.push(linhaDeArtigo(db, i, packs)); }
      return p;
    },
    guia: (no, sup, date, wh, qty) => { db.relogio = date + "T08:00"; return guardarGuia(db, { no, sup, date, wh, ann: qty.map(([sku, q]) => ({ sku, qty: q })) }).id; },
    ec: (date, origin, client, addr, wh, lines, diag = false) => {
      db.relogio = date + "T10:00";
      const e = criarEc(db, { origin, client, addr, wh, lines, diag: diag ? DIAG : null });
      if (origin.k === "VD" && origin.ref) db.vds.push({ ref: origin.ref, state: "confirmed" });
      return e;
    },
    ship: (e, sku, qty, date) => { db.relogio = date + "T16:30"; const l = e.lines.find((x) => x.sku === sku); if (l) sairLinha(db, e, l, qty, e.wh); },
  };
}

function historico(db: Inventario, a: Ajudas): void {
  const recebe = (p: Po, qty: number, wh: string, guia: string, quando: string): void => { db.relogio = quando; receberLinhas(db, p, [{ lineId: p.lines[0].id, qty }], wh, guia); };
  let p = a.po("eps", "POR", "2026-09-08", [["KF-10", 40]]); enviarPo(db, p);
  let g = a.guia("GR 2026/290", "eps", "2026-09-10", "POR", [["KF-10", 40]]);
  recebe(p, 40, "POR", g, "2026-09-10T11:20"); fecharGuia(db, db.guias.find((x) => x.id === g)!, "");
  p = a.po("beta", "LIS", "2026-09-12", [["BC-08", 2]]); enviarPo(db, p);
  g = a.guia("GR 2026/298", "beta", "2026-09-19", "LIS", [["BC-08", 2]]);
  recebe(p, 2, "LIS", g, "2026-09-19T15:05"); fecharGuia(db, db.guias.find((x) => x.id === g)!, "");
  p = a.po("delta", "POR", "2026-09-05", [["LR-50", 20]]); p.status = "cancelled"; p.log.push({ at: "2026-09-06T10:00", t: "Cancelada: fornecedor sem prazo" });
  p = a.po("eps", "LIS", "2026-09-20", [["RA-600", 2]]); p.deleted = true; p.log.push({ at: "2026-09-21T10:00", t: "Eliminada: rascunho duplicado" });
}

function vendas(db: Inventario, a: Ajudas): Ec[] {
  let e = a.ec("2026-09-15", { k: "VD", ref: "VD-0017", proforma: "PF-2026-0028" }, "Cliente Matos Lda", "Rua do Comércio 5, 2600-100 Vila Franca de Xira", "LIS", [{ sku: "INV-H5", qty: 1 }, { sku: "VT-15", qty: 4 }]);
  a.ship(e, "INV-H5", 1, "2026-09-16"); a.ship(e, "VT-15", 4, "2026-09-16");
  e = a.ec("2026-09-18", { k: "CT", ref: "CT-2026-037" }, "Cliente Pinto Construções", "Av. Central 77, 3000-150 Coimbra", "POR", [{ sku: "LR-50", qty: 300 }], true);
  a.ship(e, "LR-50", 200, "2026-09-20");
  const poDelta = db.pos.find((x) => x.sup === "delta" && x.originKey === "CT-2026-037");
  const g = a.guia("GR 2026/305", "delta", "2026-10-03", "POR", [["LR-50", 66]]);
  if (poDelta) { db.relogio = "2026-10-03T09:40"; receberLinhas(db, poDelta, [{ lineId: poDelta.lines[0].id, qty: 60 }], "POR", g); }
  const e87 = a.ec("2026-09-27", { k: "CT", ref: "CT-2026-041" }, "Cliente Silva & Filhos", "Rua das Flores 12, 2710-000 Sintra", "LIS",
    [{ sku: "BC-08", qty: 1 }, { sku: "AQS-200", qty: 1 }, { sku: "ST-04", qty: 2 }, { sku: "PV-450", qty: 30 }, { sku: "CS-6", qty: 150 }, { sku: "RA-600", qty: 30 }, { sku: "", desc: "Mão de obra de instalação", qty: 1, price: 850 }], true);
  a.ship(e87, "BC-08", 1, "2026-09-29"); a.ship(e87, "AQS-200", 1, "2026-09-29");
  const poAlfa = db.pos.find((x) => x.sup === "alfa" && x.originKey === "CT-2026-041");
  if (poAlfa) {
    db.relogio = "2026-09-28T09:14"; portalVista(db, poAlfa);
    db.relogio = "2026-09-30T11:20"; portalConfirmar(db, poAlfa, "2026-10-12", "Os painéis saem do nosso armazém a 10/10; entrega parcial possível antes.");
    const g2 = a.guia("GR 2026/311", "alfa", "2026-10-09", "LIS", [["PV-450", 10]]);
    db.relogio = "2026-10-09T08:50"; receberLinhas(db, poAlfa, [{ lineId: poAlfa.lines[0].id, qty: 8 }], "LIS", g2);
  }
  return [e87];
}

function vendasAbertas(db: Inventario, a: Ajudas, e87: Ec): void {
  a.ec("2026-10-02", { k: "VD", ref: "VD-0019", proforma: "PF-2026-0031" }, "Cliente Moreira Lda", "Travessa do Sol 3, 2780-200 Oeiras", "LIS", [{ sku: "INV-H5", qty: 1 }, { sku: "CD-80", qty: 10 }]);
  a.ec("2026-10-03", { k: "CT", ref: "CT-2026-039" }, "Cliente Neves & Associados", "Rua Nova 140, 2750-300 Cascais", "LIS", [{ sku: "BC-08", qty: 2 }], true);
  a.ec("2026-10-05", { k: "manual", ref: null }, "Cliente Rocha & Irmãos", "Largo da Feira 9, 2900-050 Setúbal", "LIS", [{ sku: "TR-50", qty: 2 }, { sku: "VT-15", qty: 6 }]);
  a.ec("2026-10-06", { k: "CT", ref: "CT-2026-042" }, "Cliente Lopes Unipessoal", "Rua do Rio 21, 4400-100 Vila Nova de Gaia", "POR", [{ sku: "LR-50", qty: 40 }, { sku: "KF-10", qty: 10 }], true);
  const e92 = a.ec("2026-10-07", { k: "manual", ref: null }, "Cliente Martins & Costa", "Rua de Cima 2, 4700-200 Braga", "POR", [{ sku: "AQS-200", qty: 1 }]);
  a.ec("2026-10-08", { k: "CT", ref: "CT-2026-043" }, "Cliente Ferreira Obras", "Av. da Liberdade 400, 2800-050 Almada", "LIS", [{ sku: "TM-16", qty: 300 }, { sku: "VT-15", qty: 12 }, { sku: "PV-450", qty: 4 }], true);
  db.relogio = "2026-10-07T12:00"; criarPedidoTransf(db, { sku: "AQS-200", from: "LIS", to: "POR", qty: 1, ec: e92.id });
  db.relogio = "2026-10-08T09:30"; criarPedidoTransf(db, { sku: "RA-600", from: "POR", to: "LIS", qty: 30, ec: e87.id });
}

function reposicao(db: Inventario, a: Ajudas): void {
  const p = a.po("zeta", "LIS", "2026-09-25", [["PV-450", 60]]);
  db.relogio = "2026-09-25T09:30"; enviarPo(db, p); db.relogio = "2026-10-03T14:02"; portalVista(db, p);
  a.guia("GR 2026/312", "zeta", "2026-10-09", "LIS", [["PV-450", 60]]);
  const g = a.guia("GR 2026/284", "zeta", "2026-09-26", "LIS", [["PV-450", 60]]);
  db.relogio = "2026-09-26T10:00"; cancelarGuia(db, db.guias.find((x) => x.id === g)!, "Guia emitida em duplicado pelo fornecedor");
  a.po("gama", "LIS", "2026-10-07", [["CD-80", 5]]); a.po("alfa", "LIS", "2026-10-08", [["TM-16", 2]]); a.po("delta", "POR", "2026-10-08", [["LR-50", 10]]);
}

function contagens(db: Inventario): void {
  db.relogio = "2026-09-05T09:00";
  let c = criarContagem(db, { wh: "LIS", cat: "Canalização", init: "blank" });
  c.state = "cancelled"; c.cancelReason = "Armazém em obras";
  db.relogio = "2026-09-12T08:00";
  c = criarContagem(db, { wh: "POR", cat: "", init: "system" });
  const cs6 = c.lines.find((l) => l.sku === "CS-6");
  if (cs6) Object.assign(cs6, { counted: 18, res: "adjusted", note: "Ponta de bobine cortada" });
  db.relogio = "2026-09-12T17:30"; finalizarContagem(db, c);
  db.relogio = "2026-09-22T08:15";
  c = criarContagem(db, { wh: "LIS", cat: "Solar", init: "blank" });
  for (const l of c.lines) { if (l.sku === "INV-H5" || l.sku === "ST-04") l.counted = l.sys; if (l.sku === "CS-6") l.counted = l.sys - 2; }
  c.last = "2026-09-22T11:40";
}

function precosECatalogo(db: Inventario): void {
  const pc = (ref: string, nw: number, at: string): void => {
    const i = db.items.find((x) => x.ref === ref);
    if (i) db.prices.push({ id: proximoId(db, "PC"), sup: i.sup, itemId: i.id, cur: i.price, nw, state: "pending", at, note: "" });
  };
  pc("ALF-PV450", 124.5, "2026-10-06T10:00"); pc("ALF-CAB6-100", 99, "2026-10-06T10:00"); pc("ALF-EST4", 159, "2026-10-06T10:00"); pc("ALF-MC16-100", 142, "2026-10-07T15:20");
  pc("ZS-450M", 119, "2026-10-04T09:00"); pc("ZS-HYB5", 965, "2026-10-04T09:00"); pc("BC-AW8", 2990, "2026-10-08T11:00");
  const ct = (sup: string, ref: string, name: string, price: number, packN: number, unitLabel: string, state: "linked" | "unlinked" | "dismissed", link: string | null, sug: { sku: string; conf: string } | null = null): void => {
    db.catalog.push({ id: proximoId(db, "K"), sup, ref, name, price, packN, unitLabel, state, link, sug });
  };
  ct("alfa", "ALF-PV450", "Módulo FV 450 W monocristalino", 118, 1, "Unidade", "linked", "PV-450");
  ct("alfa", "ALF-CAB6-100", "Cabo solar 6 mm² bobine 100 m", 95, 100, "Bobine 100 m", "linked", "CS-6");
  ct("alfa", "ALF-EST4", "Estrutura cerâmica 4 módulos", 165, 1, "Kit", "linked", "ST-04");
  ct("alfa", "ALF-MC16-100", "Multicamada 16 mm rolo 100 m", 135, 100, "Rolo 100 m", "linked", "TM-16");
  ct("alfa", "ALF-PV450-BF", "Módulo FV 450 W bifacial", 132, 1, "Unidade", "unlinked", null, { sku: "PV-450", conf: "Média" });
  ct("alfa", "ALF-CAB4-100", "Cabo solar 4 mm² bobine 100 m", 72, 100, "Bobine 100 m", "unlinked", null);
  ct("alfa", "ALF-CON-MC4", "Conector MC4 (par)", 2.3, 1, "Par", "unlinked", null, { sku: "CD-80", conf: "Baixa" });
  ct("alfa", "ALF-OLD-330", "Painel 330 W (descontinuado)", 90, 1, "Unidade", "dismissed", null);
  ct("zeta", "ZS-450M", "Painel 450 W mono", 121, 1, "Unidade", "linked", "PV-450");
  ct("zeta", "ZS-HYB5", "Inversor híbrido 5 kW", 940, 1, "Unidade", "linked", "INV-H5");
  ct("zeta", "ZS-C6R", "Cabo 6 mm² rolo", 99, 100, "Bobine 100 m", "linked", "CS-6");
  ct("zeta", "ZS-ST4", "Estrutura telhado cerâmico 4 painéis", 162, 1, "Kit", "unlinked", null, { sku: "ST-04", conf: "Exata" });
  ct("zeta", "ZS-KF", "Kit fixação química", 7.1, 1, "Unidade", "unlinked", null, { sku: "KF-10", conf: "Exata" });
  ct("zeta", "ZS-BAT5", "Bateria lítio 5 kWh", 1650, 1, "Unidade", "unlinked", null);
}

/** As carrinhas da Frota que são armazéns móveis (os dados estão em carrinhas.ts, sem o motor, para a Frota os ler sem carregar o Inventário). */
export { CARRINHAS } from "./carrinhas";

/** Os artigos que só andam nas carrinhas (o tubo multicamada TM-16 já existia). */
function produtosCarrinha(db: Inventario): void {
  const pr = (sku: string, name: string, cat: string, unit: string, sale: number, cost: number): void => {
    db.products.push({ sku, ean: "", name, cat, sub: "Carrinha", unit, sale, cost, avg: 0, codes: [], deleted: false });
  };
  pr("VE-12", "Válvula de esfera 1/2\"", "Canalização", "un", 9.9, 5.4);
  pr("FT-01", "Fita de teflon", "Canalização", "un", 1.5, 0.6);
  pr("SIL-N", "Silicone neutro", "Ferragens", "un", 6.9, 3.2);
  pr("ABR-48", "Abraçadeiras 4,8 × 200", "Elétrico", "un", 0.1, 0.04);
  pr("TP-U", "Termopar universal", "Aquecimento", "un", 14.5, 7.9);
  pr("KV-C", "Kit de vedantes de caldeira", "Aquecimento", "un", 12, 6.5);
  pr("NTC-10", "Sonda NTC 10k", "Aquecimento", "un", 18, 9.6);
  pr("FUS-3", "Fusíveis 3,15 A", "Elétrico", "un", 0.8, 0.3);
  pr("TC-15", "Tubo de cobre 15 mm (metro)", "Canalização", "m", 8.4, 5.1);
  pr("CC-15", "Curvas de cobre 15 mm", "Canalização", "un", 1.9, 0.9);
  pr("SOL-K", "Solda e decapante", "Canalização", "kit", 24, 13.5);
  pr("ISO-15", "Isolamento 15 mm (metro)", "Isolamento", "m", 1.6, 0.8);
  pr("FAC-01", "Filtros de ar condicionado", "Climatização", "un", 9.5, 4.8);
  pr("R32", "Gás R32 (garrafa)", "Climatização", "un", 129, 82);
  pr("LIMP-B", "Spray de limpeza de baterias", "Climatização", "un", 8.5, 4.1);
  pr("ESC-7", "Escadote 7 degraus", "Ferramentas", "un", 129, 79);
  pr("SDS-K", "Berbequim e martelo SDS", "Ferramentas", "kit", 389, 245);
}

/** Os armazéns móveis das carrinhas e a carga inicial, com a data da abertura do inventário (01/09). Os movimentos ficam junto dos saldos iniciais no livro,
 *  para não aparecerem como "últimos movimentos"; os ids seguem os de antes (nada do que já existia muda de número). */
function carrinhas(db: Inventario): void {
  produtosCarrinha(db);
  CARRINHAS.forEach((c, i) => {
    db.warehouses.push({ id: c.id, name: `Carrinha ${c.mat}`, code: `VIA-${String(i + 1).padStart(2, "0")}`, addr: "Armazém móvel (viatura)", cp: "", city: c.cidade, lat: null, lng: null,
      manager: c.condutor, phone: "", email: "", cap: "Viatura", active: true, serves: false, deleted: false, tipo: "viatura", matricula: c.mat });
  });
  const carga: Parameters<typeof aplicarMovimentos>[1] = [];
  for (const c of CARRINHAS) for (const [sku, qty, min] of c.stock) {
    const r = linhaStock(db, sku, c.id, true);
    if (r) Object.assign(r, { loc: "Carrinha", min, max: min * 2, rop: min });
    carga.push({ type: "in", sku, wh: c.id, qty, doc: "Carga inicial", note: `Carga inicial da carrinha ${c.mat}`, cost: db.products.find((p) => p.sku === sku)?.cost, user: "Sofia Martins" });
  }
  const antes = db.moves.length;
  db.relogio = "2026-09-01T08:30";
  const novos = aplicarMovimentos(db, carga);
  db.moves.splice(antes, novos.length);
  const fimAbertura = db.moves.findIndex((m) => m.doc !== "Saldo inicial");
  db.moves.splice(fimAbertura < 0 ? db.moves.length : fimAbertura, 0, ...novos);
}

/** A base do Inventário da V2: a do mockup (criarSeed) mais os armazéns móveis das carrinhas da Frota. É a que a loja usa. */
export function criarSeedComCarrinhas(): Inventario {
  return comoSistema(() => {
    const db = construirSeed();
    carrinhas(db);
    db.relogio = null;
    mudou(db);
    return db;
  });
}

/** A base de exemplo do mockup, no estado de 09/10/2026 (sem as carrinhas: é a que se compara número a número com o mockup em seed.test.ts). */
export function criarSeed(): Inventario {
  return comoSistema(construirSeed);
}

function construirSeed(): Inventario {
  const db = baseVazia();
  produtos(db);
  armazens(db);
  fornecedores(db);
  saldosIniciais(db);
  const a = ajudas(db);
  historico(db, a);
  const [e87] = vendas(db, a);
  vendasAbertas(db, a, e87);
  reposicao(db, a);
  contagens(db);
  precosECatalogo(db);
  db.relogio = null;
  mudou(db);
  return db;
}
