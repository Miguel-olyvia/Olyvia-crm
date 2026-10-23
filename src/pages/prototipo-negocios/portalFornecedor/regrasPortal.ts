// O que o fornecedor muda no Portal do Fornecedor simulado (20/10, demo): o catálogo (novo artigo, editar, ativar/desativar) e os seus dados.
// Corre dentro de executar() do Inventário (inventario/loja.ts), por isso o CRM vê logo: a ficha do fornecedor (Compras › Fornecedores) e o
// separador Portal dela (o catálogo carregado). Um preço mudado num artigo que a empresa já compra (Artigos e preços) chega como alteração de
// preço por aprovar, como no portal real. Sem React.
import { agora, ehInteiro, falhar, fornecedor, proximoId } from "../inventario/base";
import { donoDoEmail, emailValido, submeterPortal, sugestaoPara } from "../inventario/regrasForn";
import type { Inventario, ItemCatalogo } from "../inventario/tipos";

export interface DadosArtigoPortal { ref: string; name: string; ean: string; price: string; unitLabel: string; packN: string; moq: string; lead: string }

export const artigoVazio = (sla: number): DadosArtigoPortal => ({ ref: "", name: "", ean: "", price: "", unitLabel: "Unidade", packN: "1", moq: "1", lead: String(sla) });
export const artigoParaDados = (c: ItemCatalogo): DadosArtigoPortal => ({
  ref: c.ref, name: c.name, ean: c.ean ?? "", price: String(c.price), unitLabel: c.unitLabel, packN: String(c.packN), moq: String(c.moq ?? 1), lead: String(c.lead ?? ""),
});

const num = (v: string): number => Number(String(v ?? "").trim().replace(",", "."));

/** Cria (sem `id`) ou edita um artigo do catálogo do fornecedor. Devolve o artigo e, se o preço mudou num artigo já comprado, a alteração enviada. */
export function guardarArtigoPortal(db: Inventario, sup: string, d: DadosArtigoPortal, id: string | null): { item: ItemCatalogo; precoEnviado: boolean } {
  const s = fornecedor(db, sup);
  if (!s || s.portal !== "active") return falhar("Sem acesso ativo ao portal.");
  const ref = d.ref.trim(), name = d.name.trim();
  if (!ref) falhar("Indique a referência.");
  if (!name) falhar("Indique a descrição.");
  const price = num(d.price);
  if (String(d.price).trim() === "" || Number.isNaN(price) || price < 0) falhar("Preço inválido.");
  const packN = num(d.packN), moq = num(d.moq || "1"), lead = num(d.lead || "0");
  if (!ehInteiro(packN) || packN < 1) falhar("Unidades por embalagem: inteiro ≥ 1.");
  if (!ehInteiro(moq) || moq < 1) falhar("Encomenda mínima: inteiro ≥ 1.");
  if (!ehInteiro(lead) || lead < 0) falhar("Prazo de entrega: inteiro ≥ 0 dias.");
  if (db.catalog.some((c) => c.sup === sup && c.id !== id && c.ref.toLowerCase() === ref.toLowerCase())) falhar(`Referência repetida: ${ref}.`);
  const unitLabel = d.unitLabel.trim() || "Unidade", ean = d.ean.trim();
  if (!id) {
    const item: ItemCatalogo = { id: proximoId(db, "K"), sup, ref, name, ean, price, packN, unitLabel, moq, lead, state: "unlinked", link: null, sug: sugestaoPara(db, name, ean) };
    db.catalog.push(item);
    return { item, precoEnviado: false };
  }
  const c = db.catalog.find((x) => x.id === id && x.sup === sup);
  if (!c) return falhar("Artigo inexistente.");
  // o artigo que a empresa já compra a este fornecedor (pela referência antiga): o preço novo vai como alteração por aprovar
  const comprado = db.items.find((i) => i.sup === sup && i.ref.toLowerCase() === c.ref.toLowerCase());
  let precoEnviado = false;
  if (comprado && price !== comprado.price) {
    const pend = db.prices.find((x) => x.itemId === comprado.id && x.state === "pending");
    if (pend) { pend.nw = price; pend.at = agora(db); pend.note = "Atualizado no portal"; } else db.prices.push({ id: proximoId(db, "PC"), sup, itemId: comprado.id, cur: comprado.price, nw: price, state: "pending", at: agora(db), note: "Alterado no portal" });
    precoEnviado = true;
  }
  if (comprado && ref !== c.ref) comprado.ref = ref;
  Object.assign(c, { ref, name, ean, price, packN, unitLabel, moq, lead });
  if (c.state === "unlinked") c.sug = sugestaoPara(db, name, ean);
  return { item: c, precoEnviado };
}

/** Ativa ou desativa um artigo do catálogo (um inativo deixa de contar como ativo; a empresa vê-o como "Inativo no fornecedor"). */
export function ativarArtigoPortal(db: Inventario, sup: string, id: string, ativo: boolean): void {
  const c = db.catalog.find((x) => x.id === id && x.sup === sup);
  if (!c) return falhar("Artigo inexistente.");
  c.inactive = !ativo;
}

export interface DadosFornPortal { name: string; contact: string; email: string; phone: string; addr: string; cp: string; city: string; country: string; web: string; sla: string }
export const dadosDoFornecedor = (db: Inventario, sup: string): DadosFornPortal => {
  const s = fornecedor(db, sup);
  return { name: s?.name ?? "", contact: s?.invite?.name || s?.contact || "", email: s?.email ?? "", phone: s?.phone ?? "", addr: s?.addr ?? "", cp: s?.cp ?? "", city: s?.city ?? "", country: s?.country ?? "", web: s?.web ?? "", sla: String(s?.sla ?? "") };
};

/** Grava os dados do fornecedor (a ficha que a empresa vê). O NIF não muda no portal (é a regra da ficha com portal ativo). */
export function guardarDadosPortal(db: Inventario, sup: string, d: DadosFornPortal): void {
  const s = fornecedor(db, sup);
  if (!s || s.portal !== "active") return falhar("Sem acesso ativo ao portal.");
  if (!d.name.trim()) falhar("Indique o nome da empresa.");
  if (!emailValido(d.email)) falhar("Email inválido.");
  const dono = donoDoEmail(db, d.email.trim(), sup);
  if (dono) falhar(`Email já usado por ${dono}.`);
  if (!d.addr.trim()) falhar("Indique a morada.");
  if (d.cp.trim() && !/^\d{4}-\d{3}$/.test(d.cp.trim())) falhar("Código postal no formato 0000-000.");
  if (!d.city.trim()) falhar("Indique a cidade.");
  const sla = num(d.sla);
  if (String(d.sla).trim() === "" || !ehInteiro(sla) || sla < 0) falhar("Prazo de entrega: inteiro ≥ 0 dias.");
  Object.assign(s, {
    name: d.name.trim(), contact: d.contact.trim() || s.contact, email: d.email.trim(), phone: d.phone.trim(), addr: d.addr.trim(), cp: d.cp.trim(), city: d.city.trim(),
    country: d.country.trim() || "Portugal", web: d.web.trim(), sla, dataConfirmed: true, dataUpdatedAt: agora(db), lastAccess: agora(db),
  });
  if (s.invite && d.contact.trim()) s.invite.name = d.contact.trim();
}

/** O primeiro acesso de um fornecedor convidado: define a password e confirma os dados da empresa. Usa a mesma regra do portal real
 *  (submeterPortal: o convite passa a ativo, a ficha fica confirmada) e grava o resto dos dados (nome, email). */
export function primeiroAcessoPortal(db: Inventario, sup: string, pw: { password: string; password2: string }, d: DadosFornPortal): void {
  const s = fornecedor(db, sup);
  if (!s || s.portal !== "invited") falhar("O convite não está pendente.");
  submeterPortal(db, sup, { ...pw, addr: d.addr, cp: d.cp.trim(), city: d.city, country: d.country, phone: d.phone, web: d.web, contact: d.contact, sla: d.sla }, []);
  guardarDadosPortal(db, sup, d);
}
