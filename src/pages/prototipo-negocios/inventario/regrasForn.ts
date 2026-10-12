// As regras dos fornecedores que o mockup tem fora dos cadastros: NIF e emails únicos, convite ao portal, o que o fornecedor faz no portal, as edições na própria célula,
// o gravar da ficha e as ações em massa. Cada função onde o mockup chama need() chama exigir(). Sem React.
import { agora, ehInteiro, exigir, falhar, fornecedor, nifCompleto, produto, proximoId } from "./base";
import { ligarCatalogo, type DadosArtigo } from "./cadastros";
import { poOpen, poRem } from "./po";
import type { Artigo, Fornecedor, Inventario, ItemCatalogo } from "./tipos";

/** As pessoas da equipa e os clientes de exemplo: o email de um fornecedor não pode ser o de nenhuma delas (DB.people do mockup). */
export const PESSOAS: readonly { email: string; kind: string; name: string }[] = [
  { email: "equipa@olyvia-demo.pt", kind: "Equipa", name: "T. Marques" }, { email: "compras@olyvia-demo.pt", kind: "Equipa", name: "Comprador Demo" },
  { email: "cliente.silva@exemplo.pt", kind: "Cliente", name: "Cliente Silva & Filhos" }, { email: "geral@moreira.exemplo", kind: "Cliente", name: "Cliente Moreira Lda" },
];

const PREFIXOS_NIF = /^(45|70|71|72|74|75|77|79|90|91|98|99)/;
/** NIF português: 9 dígitos, começa por um dígito válido e o último é o de controlo. */
export function nifValido(n: string | null | undefined): boolean {
  const t = String(n || "").replace(/\s/g, "");
  if (!/^\d{9}$/.test(t)) return false;
  if (!"1235689".includes(t[0]) && !PREFIXOS_NIF.test(t)) return false;
  return nifCompleto(t.slice(0, 8)) === t;
}
export const emailValido = (e: string | null | undefined): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || "").trim());
/** Quem já usa este email (equipa, cliente ou outro fornecedor), ou nada. */
export function donoDoEmail(db: Inventario, email: string, exceto?: string | null): string | null {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  const p = PESSOAS.find((x) => x.email.toLowerCase() === e);
  if (p) return `${p.kind} (${p.name})`;
  const s = db.suppliers.find((x) => !x.deleted && x.id !== exceto && String(x.email || "").toLowerCase() === e);
  return s ? `outro fornecedor (${s.name})` : null;
}

export interface NovoForn { company: string; name: string; nif: string; email: string; contactName: string }
export type ErrosNovoForn = Partial<Record<keyof NovoForn, string>>;
/** Valida o convite (ou o rascunho): erros por campo e avisos (NIF repetido). */
export function validarNovoForn(db: Inventario, d: NovoForn, comPortal: boolean): { errs: ErrosNovoForn; warns: string[] } {
  const errs: ErrosNovoForn = {}, warns: string[] = [];
  const nif = String(d.nif || "").trim(), email = String(d.email || "").trim();
  if (!String(d.name || "").trim()) errs.name = "Obrigatório.";
  if (!d.company) errs.company = "Obrigatório.";
  if (comPortal && !nif) errs.nif = "NIF obrigatório para convidar.";
  else if (nif && !nifValido(d.nif)) errs.nif = "NIF inválido (9 dígitos com dígito de controlo).";
  if (comPortal && !email) errs.email = "Email obrigatório para convidar.";
  else if (email) { if (!emailValido(email)) errs.email = "Email inválido."; else { const o = donoDoEmail(db, email); if (o) errs.email = `Email já usado por ${o}.`; } }
  if (comPortal && !String(d.contactName || "").trim()) errs.contactName = "Indique quem recebe o acesso.";
  if (nifValido(d.nif)) { const dup = db.suppliers.find((x) => !x.deleted && x.nif === nif); if (dup) warns.push(`NIF já usado por ${dup.name}. Confirme que não é o mesmo fornecedor.`); }
  return { errs, warns };
}
export function primeiroErro(e: ErrosNovoForn): string | undefined { return Object.values(e)[0]; }

export function proximoCodigoForn(db: Inventario): string {
  let n = db.suppliers.length + 1, c: string;
  do { c = "FOR-" + String(n++).padStart(3, "0"); } while (db.suppliers.some((s) => s.code === c));
  return c;
}

/** Criar um fornecedor é convidá-lo para o portal (inviteSupplier do mockup). */
export function convidarFornecedor(db: Inventario, d: NovoForn): Fornecedor {
  exigir("suppliers.manage", "criar fornecedores");
  const e = primeiroErro(validarNovoForn(db, d, true).errs);
  if (e) falhar(e);
  const t = agora(db), email = d.email.trim(), contacto = d.contactName.trim();
  const s: Fornecedor = {
    id: "sup" + ++db.seq, name: d.name.trim(), code: proximoCodigoForn(db), company: d.company, nif: String(d.nif).trim(), email, contact: contacto, phone: "", addr: "", city: "", cp: "", country: "Portugal", web: "", notes: "", sla: 5,
    active: true, deleted: false, portal: "invited", portalUsers: 0, lastAccess: null, dataConfirmed: false, invitedAt: t, awaiting: true,
    invite: { email, name: contacto, state: "pending", at: t }, emails: [{ at: t, to: email, t: "Convite para o portal do fornecedor", ok: true }],
  };
  db.suppliers.push(s);
  return s;
}

/** Convidar, reenviar ou revogar o acesso ao portal de um fornecedor que já existe. */
export function acessoPortal(db: Inventario, sid: string, kind: "invite" | "resend" | "revoke"): void {
  exigir("suppliers.manage");
  const s = fornecedor(db, sid);
  if (!s) return falhar("Fornecedor inexistente.");
  if (kind === "revoke") { s.portal = "revoked"; s.portalUsers = 0; s.awaiting = false; if (s.invite) s.invite.state = "revoked"; return; }
  if (kind === "invite") {
    if (!emailValido(s.email)) falhar("O fornecedor não tem email válido: complete em Dados.");
    const o = donoDoEmail(db, s.email, s.id);
    if (o) falhar(`Email já usado por ${o}.`);
    if (!nifValido(s.nif)) falhar("NIF inválido: necessário para o portal (corrija em Dados).");
    const t = agora(db);
    s.portal = "invited"; s.invitedAt = t; s.awaiting = !s.dataConfirmed; s.invite = { email: s.email, name: s.contact || s.name, state: "pending", at: t };
    return;
  }
  s.emails = [...(s.emails ?? []), { at: agora(db), to: s.email, t: "Reenvio de acesso", ok: true }];
}

export type CampoForn = "name" | "code" | "contact" | "email" | "phone" | "city" | "sla" | "active" | "nif" | "company" | "addr" | "cp" | "country" | "web" | "notes";
/** A edição de um campo do fornecedor na própria célula (setSupField do mockup). */
export function definirCampoForn(db: Inventario, sid: string, k: CampoForn, valor: string | boolean): void {
  exigir("suppliers.manage", "editar fornecedores");
  const s = fornecedor(db, sid);
  if (!s) return falhar("Fornecedor inexistente.");
  if ((k === "nif" || k === "company") && s.portal === "active") falhar("Bloqueado com portal ativo: revogue o acesso para editar.");
  let v: string | number | boolean = typeof valor === "string" ? valor.trim() : valor;
  if (k === "name" && !v) falhar("Nome obrigatório.");
  if (k === "code") { if (!v) falhar("Código obrigatório."); if (db.suppliers.some((x) => x.id !== sid && x.code.toLowerCase() === String(v).toLowerCase())) falhar("Código já usado."); }
  if (k === "email" && v) { if (!emailValido(String(v))) falhar("Email inválido."); const o = donoDoEmail(db, String(v), sid); if (o) falhar(`Email já usado por ${o}.`); }
  if (k === "nif" && v && !nifValido(String(v))) falhar("NIF inválido (9 dígitos com dígito de controlo).");
  if (k === "sla") { v = Number(v); if (!ehInteiro(v) || v < 0) falhar("Prazo SLA: inteiro ≥ 0."); }
  if (k === "cp" && v && !/^\d{4}-\d{3}$/.test(String(v))) falhar("Código postal no formato 0000-000.");
  if (k === "active") v = !!v;
  (s as unknown as Record<string, unknown>)[k] = v;
}

export type CampoArtigo = "ref" | "unitLabel" | "packN" | "price" | "moq" | "lead";
/** A edição de um campo de um artigo do fornecedor na própria célula (setItemField do mockup). */
export function definirCampoArtigo(db: Inventario, iid: string, k: CampoArtigo, valor: string): void {
  exigir("suppliers.manage", "editar artigos");
  const i = db.items.find((x) => x.id === iid);
  if (!i) return falhar("Artigo inexistente.");
  const p = produto(db, i.sku);
  const t = String(valor).trim();
  if (k === "ref" || k === "unitLabel") {
    if (!t) falhar(k === "ref" ? "Referência obrigatória." : "Indique a embalagem.");
    if (k === "ref" && db.items.some((x) => x.sup === i.sup && x.id !== iid && x.ref.toLowerCase() === t.toLowerCase())) falhar("Referência já existe neste fornecedor.");
    i[k] = t;
    return;
  }
  if (k === "price") {
    if (t === "") falhar("Preço obrigatório.");
    const v = Number(t.replace(",", "."));
    if (Number.isNaN(v) || v < 0) falhar("Preço inválido.");
    i.history = [...(i.history ?? []), { at: agora(db), from: i.price, to: v }];
    if (i.pref && p) p.cost = v / i.packN;
    i.price = v;
    return;
  }
  const v = Number(t);
  if (k === "moq" && (!ehInteiro(v) || v < 1)) falhar("MOQ: inteiro ≥ 1.");
  if (k === "lead" && (!ehInteiro(v) || v < 0)) falhar("Prazo: inteiro ≥ 0 dias.");
  if (k === "packN") {
    if (!ehInteiro(v) || v < 1) falhar("Unidades por embalagem: inteiro ≥ 1.");
    if (db.pos.some((o) => poOpen(o) && o.lines.some((l) => l.itemId === iid && poRem(l) > 0))) falhar("Há encomendas em aberto com esta embalagem: receba-as ou anule o resto primeiro.");
    if (i.pref && p) p.cost = i.price / v;
  }
  i[k] = v;
}

/** A sugestão de produto para um artigo do catálogo: por EAN (exata) ou por palavras do nome (alta, média, baixa). */
export function sugestaoPara(db: Inventario, nome: string, ean?: string): ItemCatalogo["sug"] {
  if (ean) { const p = db.products.find((x) => x.ean === String(ean).trim() && !x.deleted); if (p) return { sku: p.sku, conf: "Exata" }; }
  const palavras = (s: string): string[] => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const a = new Set(palavras(nome));
  let melhor: string | null = null, bs = 0;
  for (const p of db.products.filter((x) => !x.kit && !x.deleted)) {
    const b = palavras(p.name), sc = b.filter((w) => a.has(w)).length / Math.max(1, Math.min(a.size, b.length));
    if (sc > bs) { bs = sc; melhor = p.sku; }
  }
  if (!melhor || bs < 0.25) return null;
  return { sku: melhor, conf: bs >= 0.75 ? "Alta" : bs >= 0.5 ? "Média" : "Baixa" };
}

/** Cria o produto a partir de um artigo do catálogo por ligar e liga-o; devolve o SKU. */
export function criarProdutoDoCatalogo(db: Inventario, cid: string): string {
  exigir("suppliers.manage", "criar produtos");
  const c = db.catalog.find((x) => x.id === cid);
  if (!c) return falhar("Artigo inexistente.");
  if (c.state !== "unlinked") falhar("Só artigos por ligar.");
  let sku = c.ref.replace(/^[A-Z]+-/, "").slice(0, 10);
  while (produto(db, sku)) sku += "X";
  db.products.push({ sku, ean: "", name: c.name, cat: "Sem categoria", sub: "", unit: "un", sale: Math.round((c.price / c.packN) * 1.45 * 100) / 100, cost: c.price / c.packN, avg: 0, codes: [], deleted: false });
  ligarCatalogo(db, cid, sku);
  return sku;
}

export interface FichaPortal { password: string; password2: string; addr: string; cp: string; city: string; country: string; phone: string; web: string; contact: string; sla: string | number }
export interface ArtigoPortal { ref: string; name: string; ean: string; price: string; unit: string; packN: string | number; moq: string | number; lead: string | number }
/** O que o fornecedor faz no portal: define a password, confirma a ficha e carrega o catálogo (portalSubmit do mockup); devolve quantos artigos enviou. */
export function submeterPortal(db: Inventario, sid: string, f: FichaPortal, artigos: readonly ArtigoPortal[]): number {
  const s = fornecedor(db, sid);
  if (!s || s.portal !== "invited") return falhar("O convite não está pendente.");
  if (!f.password || f.password.length < 8) falhar("Password com pelo menos 8 caracteres.");
  if (f.password !== f.password2) falhar("As passwords não coincidem.");
  if (!String(f.addr || "").trim()) falhar("Indique a morada.");
  if (!/^\d{4}-\d{3}$/.test(f.cp || "")) falhar("Código postal no formato 0000-000.");
  if (!String(f.city || "").trim()) falhar("Indique a cidade.");
  if (f.sla === "" || !ehInteiro(Number(f.sla)) || Number(f.sla) < 0) falhar("Prazo de entrega: inteiro ≥ 0 dias.");
  const its = artigos.filter((i) => String(i.ref || "").trim() || String(i.name || "").trim());
  const vistas = new Set<string>();
  for (const i of its) {
    if (!String(i.ref).trim() || !String(i.name).trim()) falhar("Cada artigo precisa de referência e nome.");
    if (i.price === "" || Number.isNaN(Number(i.price)) || Number(i.price) < 0) falhar(`Preço inválido em ${i.ref}.`);
    if (!ehInteiro(Number(i.packN)) || Number(i.packN) < 1) falhar(`Unidades por embalagem inválidas em ${i.ref}.`);
    if (!ehInteiro(Number(i.moq || 1)) || Number(i.moq || 1) < 1) falhar(`MOQ inválido em ${i.ref}.`);
    const r = i.ref.trim().toLowerCase();
    if (vistas.has(r) || db.catalog.some((c) => c.sup === sid && c.ref.toLowerCase() === r)) falhar(`Referência repetida: ${i.ref}`);
    vistas.add(r);
  }
  const t = agora(db);
  Object.assign(s, { addr: f.addr.trim(), cp: f.cp, city: f.city.trim(), country: f.country || "Portugal", phone: f.phone || "", web: f.web || "", contact: String(f.contact || "").trim() || s.contact, sla: Number(f.sla) });
  Object.assign(s, { portal: "active", portalUsers: 1, lastAccess: t, dataConfirmed: true, awaiting: false, dataUpdatedAt: t });
  if (s.invite) s.invite.state = "active";
  for (const i of its) {
    db.catalog.push({ id: proximoId(db, "K"), sup: sid, ref: i.ref.trim(), name: i.name.trim(), ean: String(i.ean || "").trim(), price: Number(i.price), packN: Number(i.packN) || 1, unitLabel: i.unit || "Unidade", moq: Number(i.moq) || 1, lead: Number(i.lead) || Number(f.sla), state: "unlinked", link: null, sug: sugestaoPara(db, i.name, i.ean) });
  }
  return its.length;
}

export interface DadosForn { company: string; name: string; code: string; contact: string; email: string; phone: string; nif: string; sla: string | number; addr: string; city: string; cp: string; country: string; web: string; notes: string; active: boolean }
export type ErrosForn = Partial<Record<"name" | "code" | "email" | "nif" | "sla" | "cp", string>>;
/** Valida a ficha do fornecedor (existente, com `id`, ou rascunho); `convidar` é o "Enviar acesso ao portal ao gravar" do rascunho. */
export function errosFicha(db: Inventario, d: DadosForn, id: string | null, convidar: boolean): ErrosForn {
  const e: ErrosForn = {};
  const s = id ? fornecedor(db, id) : undefined;
  if (!String(d.name).trim()) e.name = "Obrigatório.";
  if (!String(d.code).trim()) e.code = "Obrigatório.";
  else if (db.suppliers.some((x) => x.code.toLowerCase() === String(d.code).trim().toLowerCase() && x.id !== id)) e.code = "Código já usado.";
  if (d.email) { if (!emailValido(d.email)) e.email = "Email inválido."; else { const o = donoDoEmail(db, d.email, id); if (o) e.email = `Email já usado por ${o}.`; } }
  if (d.nif && !(s && s.portal === "active") && !nifValido(String(d.nif))) e.nif = "NIF inválido (9 dígitos com dígito de controlo).";
  if (d.sla === "" || !ehInteiro(Number(d.sla)) || Number(d.sla) < 0) e.sla = "Inteiro ≥ 0.";
  if (d.cp && !/^\d{4}-\d{3}$/.test(d.cp)) e.cp = "Formato 0000-000.";
  if (!s && convidar) { if (!nifValido(d.nif)) e.nif = "NIF válido obrigatório para convidar."; if (!emailValido(d.email)) e.email = e.email || "Email obrigatório para convidar."; }
  return e;
}

export type ArtigoRascunho = Omit<Artigo, "id" | "sup" | "pref" | "history">;
const CAMPOS_FICHA: (keyof DadosForn)[] = ["company", "name", "code", "contact", "email", "phone", "nif", "sla", "addr", "city", "cp", "country", "web", "notes", "active"];
/** Grava a ficha: atualiza o fornecedor (NIF e empresa ficam com portal ativo) ou cria-o com os artigos do rascunho (supSave do mockup). */
export function gravarFicha(db: Inventario, d: DadosForn, id: string | null, rascunho: { items: readonly ArtigoRascunho[]; enviar: boolean }): Fornecedor {
  exigir("suppliers.manage");
  const val = (k: keyof DadosForn): string | number | boolean => (k === "sla" ? Number(d[k]) : typeof d[k] === "string" ? (d[k] as string).trim() : d[k]);
  const s = id ? fornecedor(db, id) : undefined;
  if (s) {
    for (const k of CAMPOS_FICHA) { if ((k === "nif" || k === "company") && s.portal === "active") continue; (s as unknown as Record<string, unknown>)[k] = val(k); }
    return s;
  }
  const n = { id: "sup" + ++db.seq, portal: "none", portalUsers: 0, lastAccess: null, dataConfirmed: false, deleted: false, awaiting: false, invitedAt: null, emails: [] } as unknown as Fornecedor;
  for (const k of CAMPOS_FICHA) (n as unknown as Record<string, unknown>)[k] = val(k);
  db.suppliers.push(n);
  for (const it of rascunho.items) {
    const temPref = db.items.some((i) => i.sku === it.sku && i.pref);
    db.items.push({ ...it, id: proximoId(db, "I"), sup: n.id, pref: !temPref, history: [], lead: it.lead || n.sla });
  }
  if (rascunho.enviar) { const t = agora(db); n.portal = "invited"; n.invitedAt = t; n.awaiting = true; n.invite = { email: n.email, name: n.contact || n.name, state: "pending", at: t }; }
  return n;
}

export type AcaoMassa = "state" | "company" | "delete";
/** Aplica uma ação a vários fornecedores; os que as regras não deixam mexer contam como ignorados. */
export function emMassa(db: Inventario, ids: readonly string[], kind: AcaoMassa, valor: string): { n: number; skip: number } {
  exigir("suppliers.manage");
  let n = 0, skip = 0;
  for (const id of ids) {
    const s = fornecedor(db, id);
    if (!s) continue;
    if (kind === "state") { s.active = valor === "active"; n++; }
    else if (kind === "company") { if (s.portal === "active") { skip++; continue; } s.company = valor; n++; }
    else { if (db.pos.some((p) => p.sup === id && poOpen(p))) { skip++; continue; } s.deleted = true; n++; }
  }
  return { n, skip };
}


/** Repor um artigo dispensado do catálogo como "por ligar". */
export function reporCatalogo(db: Inventario, cid: string): void {
  const c = db.catalog.find((x) => x.id === cid);
  if (c) c.state = "unlinked";
}

/** Verifica um artigo novo contra os já preparados no rascunho e devolve-o pronto a gravar com o fornecedor (addItem do mockup com `draft`). */
export function novoArtigoRascunho(db: Inventario, d: DadosArtigo, lista: readonly ArtigoRascunho[]): ArtigoRascunho {
  exigir("suppliers.manage");
  const ref = d.ref.trim();
  if (!produto(db, d.sku)) falhar("Escolha um produto válido.");
  if (!ref) falhar("Indique a referência do fornecedor.");
  if (!ehInteiro(d.packN) || d.packN < 1) falhar("Unidades por embalagem: inteiro ≥ 1.");
  if (d.price == null || Number.isNaN(d.price) || d.price < 0) falhar("Indique o preço.");
  if (lista.some((i) => i.ref.toLowerCase() === ref.toLowerCase())) falhar("Referência já existe neste fornecedor.");
  return { sku: d.sku, ref, packN: d.packN, unitLabel: d.unitLabel || "Unidade", price: d.price, moq: d.moq || 1, lead: d.lead || 0 };
}

const ESTADO_PORTAL: Record<Fornecedor["portal"], string> = { none: "Sem acesso", invited: "Convidado", active: "Ativo", revoked: "Revogado" };
/** Só se simula a entrada de quem tem um convite pendente (senão o aviso do mockup). */
export function podeSimular(db: Inventario, id: string, avisar: (t: string, erro?: boolean) => void): boolean {
  const s = fornecedor(db, id);
  if (s && s.portal === "invited") return true;
  avisar(`O fornecedor não tem convite pendente (estado: ${s ? ESTADO_PORTAL[s.portal] : "—"}).`, true);
  return false;
}
