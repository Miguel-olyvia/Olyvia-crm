// Do orçamento do negócio da Emylia (d.orc, versão atual) para as props que o QuotePDFDocument do CRM espera (quote, client, lines).
// As contas vêm do motor da Emylia (linhaCalc, ivaDaLinha); o gerador faz o resto (subtotal, desconto, IVA por taxa, total). Sem SKUs nem
// bundles: a Emylia não os tem, e nunca se inventam. Sem imports do react-pdf: este ficheiro pesa nada.
import { ivaDaLinha, linhaCalc, type LinhaOrc, type Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import { GRUPOS, linhaDeMaterial } from "@/emylia/propostaConteudo";

export interface LinhaParaPdf {
  id: string; ordem: number; section_name: string; descricao_snapshot: string; unidade: string; qt: number;
  retail_price_unit: number | null; total_sem_iva: number; iva_percent: number;
}
export interface DadosParaPdf {
  quote: { quote_number: string; created_at: string; estado: string; client_name: string; obra_endereco: string | null };
  client: { display_name: string; vat: string; email: string; phone: string; client_addresses: { street: string; is_primary: boolean }[] };
  lines: LinhaParaPdf[];
  descontoPercent: number;
}

const r2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;
const tituloDoGrupo = (k: string): string => GRUPOS.find((g) => g.k === k)?.t ?? "Geral";

function linhaParaPdf(l: LinhaOrc, i: number, S: Ctx["S"]): LinhaParaPdf {
  const total = r2(linhaCalc(l, S).preco);
  const base = { id: `l${i}`, ordem: i + 1, total_sem_iva: total, iva_percent: ivaDaLinha(l, S) };
  // o preço unitário só se dá quando qtd × unitário fecha com o total; senão o gerador calcula total ÷ qtd
  const unitario = (q: number, pu: number): number | null => (q > 0 && Math.abs(r2(q * pu) - total) < 0.011 ? r2(pu) : null);
  if (l.t === "svc") {
    const s = S.svc[l.sid];
    return { ...base, section_name: "Trabalhos", descricao_snapshot: s?.n ?? "Serviço", unidade: s?.un || "UN", qt: l.q, retail_price_unit: unitario(l.q, l.pu) };
  }
  const m = linhaDeMaterial(l.d);
  const seccao = tituloDoGrupo(m.grupo);
  if (l.livre) return { ...base, section_name: seccao, descricao_snapshot: l.d, unidade: l.livre.un || "UN", qt: l.livre.q, retail_price_unit: unitario(l.livre.q, l.livre.pu) };
  if (l.prod) return { ...base, section_name: seccao, descricao_snapshot: m.item.nome, unidade: "UN", qt: l.prod.q, retail_price_unit: unitario(l.prod.q, l.prod.precoUn) };
  return { ...base, section_name: seccao, descricao_snapshot: m.item.det ? `${m.item.nome} (${m.item.det})` : m.item.nome, unidade: "UN", qt: 1, retail_price_unit: total > 0 ? total : null };
}

/** Sem orçamento ou sem linhas devolve null: nunca se inventam linhas. */
export function dadosParaPdf(d: Negocio, S: Ctx["S"]): DadosParaPdf | null {
  const orc = d.orc;
  if (!orc || orc.linhas.length === 0) return null;
  const nome = d.f.nome_fiscal || d.nome;
  const morada = d.f.morada || d.local || "";
  return {
    // a Emylia não tem um número Q-… de orçamento: identifica-se pelo negócio e pela versão
    quote: { quote_number: `Negócio ${d.id} · versão ${(orc.versoes?.length ?? 0) + 1}`, created_at: `${new Date().toISOString().slice(0, 10)}T12:00:00`, /* só o dia: mantém os dados estáveis entre renders */ estado: "", client_name: nome, obra_endereco: d.local || null },
    client: {
      display_name: nome, vat: d.f.nif_fat || d.f.nif || "", email: d.f.email || "", phone: d.tel.includes("@") ? "" : d.tel,
      client_addresses: morada ? [{ street: morada, is_primary: true }] : [],
    },
    lines: orc.linhas.map((l, i) => linhaParaPdf(l, i, S)),
    descontoPercent: orc.desconto || 0,
  };
}
