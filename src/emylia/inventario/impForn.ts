// O que se exporta e importa nos fornecedores (XP.suppliers do mockup) e nos artigos de um fornecedor (XP.items): as mesmas colunas nos dois sentidos e as regras de cada linha. Sem React.
import { exigir, produto, proximoId } from "./base";
import type { DefImportacao, Verificacao } from "./csvInv";
import { donoDoEmail, nifValido } from "./regrasForn";
import type { Artigo, Fornecedor, Inventario } from "./tipos";

const inteiro = (t: string | undefined): boolean => /^\d+$/.test(t ?? "");
const preco = (t: string): number => Number(String(t).replace(",", "."));

/** Os fornecedores: `linhas` são os que o ecrã mostra (filtrados). */
export function defFornecedores(linhas: () => Fornecedor[]): DefImportacao<Fornecedor> {
  const achar = (db: Inventario, codigo: string): Fornecedor | undefined => db.suppliers.find((x) => x.code === codigo);
  return {
    rotulo: "fornecedores", ficheiro: "fornecedores", regra: "Fornecedores com portal ativo mantêm NIF e empresa.", linhas,
    cols: [["codigo", (s) => s.code], ["nome", (s) => s.name], ["empresa", (s) => s.company], ["nif", (s) => s.nif], ["email", (s) => s.email], ["telefone", (s) => s.phone], ["cidade", (s) => s.city], ["sla_dias", (s) => s.sla], ["ativo", (s) => (s.active ? "sim" : "nao")]],
    verificar(o, db): Verificacao {
      const key = o.codigo || "?";
      if (!o.codigo || !o.nome) return { key, st: "Erro", msg: "Código e nome obrigatórios." };
      if (o.nif && !nifValido(o.nif)) return { key: o.codigo, st: "Erro", msg: "NIF inválido (dígito de controlo)." };
      const s = achar(db, o.codigo);
      const dono = o.email ? donoDoEmail(db, o.email, s?.id) : null;
      if (dono) return { key: o.codigo, st: "Erro", msg: `Email já usado por ${dono}.` };
      if (o.sla_dias && !inteiro(o.sla_dias)) return { key: o.codigo, st: "Erro", msg: "SLA tem de ser inteiro." };
      if (!s) return { key: o.codigo, st: "Novo" };
      const igual = s.name === o.nome && s.email === o.email && s.phone === o.telefone && s.city === o.cidade && String(s.sla) === o.sla_dias && (s.active ? "sim" : "nao") === o.ativo && (s.portal === "active" || (s.nif === o.nif && s.company === o.empresa));
      return { key: o.codigo, st: igual ? "Sem alterações" : "Atualizar", msg: s.portal === "active" && (s.nif !== o.nif || s.company !== o.empresa) ? "NIF/empresa ignorados (portal ativo)." : "" };
    },
    aplicar(o, db) {
      exigir("suppliers.manage");
      let s = achar(db, o.codigo);
      if (!s) {
        s = { id: "sup" + ++db.seq, code: o.codigo, name: "", contact: "", email: "", phone: "", nif: "", company: "", sla: 5, addr: "", city: "", cp: "", country: "Portugal", web: "", notes: "", active: true, deleted: false, portal: "none", portalUsers: 0, lastAccess: null, dataConfirmed: false, invitedAt: null, awaiting: false };
        db.suppliers.push(s);
      }
      Object.assign(s, { name: o.nome, email: o.email, phone: o.telefone, city: o.cidade, sla: Number(o.sla_dias || 5), active: o.ativo !== "nao" });
      if (s.portal !== "active") { s.nif = o.nif; s.company = o.empresa || db.suppliers[0].company; }
    },
  };
}

/** Os artigos de um fornecedor. */
export function defArtigos(sid: string, linhas: () => Artigo[]): DefImportacao<Artigo> {
  const achar = (db: Inventario, ref: string): Artigo | undefined => db.items.find((x) => x.sup === sid && x.ref === ref);
  return {
    rotulo: "artigos do fornecedor", ficheiro: "artigos-fornecedor", regra: "Mudanças de preço por aqui atualizam o artigo; o custo de referência muda se for o preferido.", linhas,
    cols: [["ref_fornecedor", (i) => i.ref], ["sku", (i) => i.sku], ["unidades_por_embalagem", (i) => i.packN], ["embalagem", (i) => i.unitLabel], ["preco", (i) => i.price], ["moq", (i) => i.moq], ["prazo_dias", (i) => i.lead], ["preferido", (i) => (i.pref ? "sim" : "nao")]],
    verificar(o, db): Verificacao {
      const ref = o.ref_fornecedor;
      if (!ref) return { key: "?", st: "Erro", msg: "Ref. obrigatória." };
      if (!produto(db, o.sku)) return { key: ref, st: "Erro", msg: "SKU desconhecido: " + o.sku };
      if (!inteiro(o.unidades_por_embalagem) || Number(o.unidades_por_embalagem) < 1) return { key: ref, st: "Erro", msg: "Unidades por embalagem: inteiro ≥ 1." };
      if (Number.isNaN(preco(o.preco))) return { key: ref, st: "Erro", msg: "Preço inválido." };
      const i = achar(db, ref);
      if (!i) return { key: ref, st: "Novo" };
      const igual = i.sku === o.sku && String(i.packN) === o.unidades_por_embalagem && i.unitLabel === o.embalagem && preco(o.preco) === i.price && String(i.moq) === o.moq && String(i.lead) === o.prazo_dias && (i.pref ? "sim" : "nao") === o.preferido;
      return { key: ref, st: igual ? "Sem alterações" : "Atualizar" };
    },
    aplicar(o, db) {
      exigir("suppliers.manage");
      let i = achar(db, o.ref_fornecedor);
      if (!i) {
        i = { id: proximoId(db, "I"), sup: sid, ref: o.ref_fornecedor, sku: o.sku, packN: 1, unitLabel: "Unidade", price: 0, pref: false, moq: 1, lead: 0, history: [] };
        db.items.push(i);
      }
      const forn = db.suppliers.find((s) => s.id === sid);
      Object.assign(i, { sku: o.sku, packN: Number(o.unidades_por_embalagem), unitLabel: o.embalagem || "Unidade", price: preco(o.preco), moq: Number(o.moq || 1), lead: Number(o.prazo_dias || forn?.sla) });
      const p = produto(db, i.sku);
      if (o.preferido === "sim") { for (const x of db.items) if (x.sku === i.sku) x.pref = false; i.pref = true; if (p) p.cost = i.price / i.packN; } else i.pref = false;
    },
  };
}

