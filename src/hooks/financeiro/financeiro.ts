// Financeiro — tipos, regras puras e chamadas à base.
//
// A Olyvia NÃO emite faturas (em Portugal isso exige software certificado pela
// AT). A fatura é emitida no PHC, Moloni, Eticadata… e aqui só se REGISTA:
// número, data, valor, tranche, ATCUD e o PDF. Depois o Financeiro VALIDA o
// pagamento (sai o recibo). O 1.º pagamento validado de um contrato avisa as
// Operações ("Criar obra") e o Armazém ("Materiais da obra").
//
// A escrita passa SEMPRE pelas RPCs rpc_fin_* da migration
// 20261214100000_financeiro_faturas_recibos.sql — as tabelas não têm policies
// de escrita. `(supabase as any)`: as tabelas e RPCs novas ainda não estão em
// src/integrations/supabase/types.ts (tipos por regenerar), mesmo padrão de
// directSales.

import { supabase } from "@/integrations/supabase/client";
import {
  parseValidateUploadResponse,
  resolveValidateUploadErrorMessage,
} from "@/lib/uploadErrors";
import { generateSecureFileName } from "@/utils/secureFileUpload";

export const ORIGENS_FATURA = ["PHC", "Moloni", "Eticadata", "Outro"] as const;
export type OrigemFatura = (typeof ORIGENS_FATURA)[number];

/** Uma tranche de um contrato assinado ainda sem fatura ativa. */
export interface TranchePorFaturar {
  contract_id: string;
  contrato_numero: string | null;
  cliente_nome: string;
  contrato_valor: number | null;
  condicoes_pagamento: string | null;
  assinado_em: string | null;
  tranche_ordem: number;
  tranche_descricao: string;
  percentagem: number;
  valor_sugerido: number;
  n_tranches: number;
  /** Ainda não houve pagamento neste contrato: o 1.º põe a obra a andar. */
  dispara_obra: boolean;
}

/** Uma fatura registada à espera de o pagamento ser validado. */
export interface FaturaPorValidar {
  invoice_id: string;
  numero: string;
  data: string;
  valor: number;
  origem: OrigemFatura;
  atcud: string | null;
  pdf_path: string | null;
  contract_id: string;
  contrato_numero: string | null;
  cliente_nome: string;
  tranche_descricao: string;
  dispara_obra: boolean;
}

export interface FilaFinanceiro {
  por_faturar: TranchePorFaturar[];
  por_validar: FaturaPorValidar[];
  faturar_desde: string | null;
}

export interface DadosFatura {
  numero: string;
  data: string; // YYYY-MM-DD
  valor: string; // como vem do input (aceita vírgula)
  origem: OrigemFatura | "";
  atcud: string;
}

export const PDF_MAX_BYTES = 20 * 1024 * 1024;

/* ───────────────────────────── regras puras ───────────────────────────── */

/** Data de hoje (local) em YYYY-MM-DD, como o <input type="date">. */
export function hojeIso(agora: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

/** "1.234,5" / "1234.50" / " 5000 " → número; vazio ou lixo → NaN. */
export function lerValor(texto: string): number {
  const t = texto.trim().replace(/\s/g, "");
  if (!t) return NaN;
  // Com vírgula, a vírgula é decimal e os pontos são milhares.
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^-?\d+(\.\d+)?$/.test(normal)) return NaN;
  return Number(normal);
}

/** Valor para o input: 5000.01 → "5000,01". */
export function valorParaInput(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "";
  return Number(n).toFixed(2).replace(".", ",");
}

/**
 * O que falta ou está mal no formulário de registo (a mesma regra da RPC, para
 * avisar antes de ir à base). null = pode registar.
 */
export function problemaNaFatura(d: DadosFatura, hoje: string = hojeIso()): string | null {
  if (!d.numero.trim()) return "Falta o número da fatura.";
  if (!d.data) return "Falta a data da fatura.";
  if (d.data > hoje) return "A data da fatura não pode ser no futuro.";
  const v = lerValor(d.valor);
  if (!Number.isFinite(v) || v <= 0) return "O valor tem de ser maior do que zero.";
  if (!d.origem) return "Escolha o programa onde a fatura foi emitida.";
  return null;
}

/** Só PDF, até 20 MB (o validate-upload confirma a assinatura do ficheiro). */
export function problemaNoPdf(f: File | null): string | null {
  if (!f) return null;
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext !== "pdf" || (f.type && f.type !== "application/pdf")) return "A fatura tem de ser um PDF.";
  if (f.size > PDF_MAX_BYTES) return "O PDF é demasiado grande (máximo 20 MB).";
  return null;
}

/** Pasta do PDF: <org>/client_invoice/<contrato>/<uuid>.pdf — a RPC recusa outra organização. */
export function caminhoDoPdf(orgId: string, contractId: string, ficheiro: string): string {
  return `${orgId}/client_invoice/${contractId}/${ficheiro}`;
}

/** Diferença entre o valor escrito e o sugerido da tranche, quando não bate. */
export function avisoDeValor(valorTexto: string, sugerido: number): string | null {
  const v = lerValor(valorTexto);
  if (!Number.isFinite(v)) return null;
  const dif = Math.round((v - Number(sugerido)) * 100) / 100;
  if (Math.abs(dif) < 0.005) return null;
  return dif > 0 ? "Acima do valor da tranche." : "Abaixo do valor da tranche.";
}

/** Os números vêm da base como texto (numeric) ou número: normaliza. */
export function normalizarFila(raw: unknown): FilaFinanceiro {
  const r = (raw ?? {}) as Partial<FilaFinanceiro>;
  return {
    por_faturar: (r.por_faturar ?? []).map((t) => ({
      ...t,
      contrato_valor: t.contrato_valor == null ? null : Number(t.contrato_valor),
      percentagem: Number(t.percentagem),
      valor_sugerido: Number(t.valor_sugerido),
      tranche_ordem: Number(t.tranche_ordem),
      n_tranches: Number(t.n_tranches),
    })),
    por_validar: (r.por_validar ?? []).map((f) => ({ ...f, valor: Number(f.valor) })),
    faturar_desde: r.faturar_desde ?? null,
  };
}

/** Mensagem da base sem o prefixo técnico. */
export function mensagemDeErro(e: unknown, padrao: string): string {
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === "string" && m.trim() ? m : padrao;
}

/* ───────────────────────────── chamadas ───────────────────────────── */

const db = supabase as any;

export async function lerFila(orgId: string): Promise<FilaFinanceiro> {
  const { data, error } = await db.rpc("rpc_fin_fila", { p_org: orgId });
  if (error) throw error;
  return normalizarFila(data);
}

/**
 * Envia o PDF pelo caminho de sempre: quarentena → validate-upload → bucket
 * `documents`. Devolve o caminho final.
 */
export async function enviarPdfDaFatura(orgId: string, contractId: string, ficheiro: File): Promise<string> {
  const caminho = caminhoDoPdf(orgId, contractId, generateSecureFileName(ficheiro));
  const { error: erroUpload } = await supabase.storage.from("documents-quarantine").upload(caminho, ficheiro);
  if (erroUpload) throw erroUpload;
  const { data, error } = await supabase.functions.invoke("validate-upload", {
    body: { quarantineBucket: "documents-quarantine", finalBucket: "documents", path: caminho },
  });
  const r = parseValidateUploadResponse(data);
  if (error || !r.ok) {
    throw new Error(`O PDF foi recusado: ${await resolveValidateUploadErrorMessage(r, error)}`);
  }
  return caminho;
}

export async function apagarPdf(caminho: string): Promise<void> {
  await supabase.storage.from("documents").remove([caminho]);
}

export async function abrirPdf(caminho: string): Promise<void> {
  // A janela abre já (no clique), senão o bloqueador de pop-ups apanha-a
  // depois do await; o endereço assinado chega a seguir.
  const janela = typeof window !== "undefined" ? window.open("", "_blank") : null;
  if (janela) janela.opener = null;
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(caminho, 600);
  if (error || !data?.signedUrl) {
    janela?.close();
    throw error ?? new Error("Não foi possível abrir o PDF.");
  }
  if (janela) janela.location.href = data.signedUrl;
  else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export interface RegistarArgs {
  orgId: string;
  tranche: Pick<TranchePorFaturar, "contract_id" | "tranche_ordem">;
  dados: DadosFatura;
  pdf: File | null;
}

export async function registarFatura({ orgId, tranche, dados, pdf }: RegistarArgs): Promise<void> {
  const problema = problemaNaFatura(dados) ?? problemaNoPdf(pdf);
  if (problema) throw new Error(problema);
  const caminho = pdf ? await enviarPdfDaFatura(orgId, tranche.contract_id, pdf) : null;
  const { error } = await db.rpc("rpc_fin_registar_fatura", {
    p_contract_id: tranche.contract_id,
    p_tranche_ordem: tranche.tranche_ordem,
    p_numero: dados.numero.trim(),
    p_data: dados.data,
    p_valor: lerValor(dados.valor),
    p_origem: dados.origem,
    p_atcud: dados.atcud.trim() || null,
    p_pdf_path: caminho,
  });
  if (error) {
    // A fatura não ficou registada: o PDF não fica órfão no bucket.
    if (caminho) await apagarPdf(caminho).catch(() => {});
    throw error;
  }
}

export interface ValidacaoPagamento {
  receipt_id: string;
  primeiro_pagamento: boolean;
  avisos: number;
}

export async function validarPagamento(invoiceId: string, dataPagamento: string): Promise<ValidacaoPagamento> {
  const { data, error } = await db.rpc("rpc_fin_validar_pagamento", {
    p_invoice_id: invoiceId,
    p_data_pagamento: dataPagamento,
  });
  if (error) throw error;
  return data as ValidacaoPagamento;
}

export async function anularFatura(invoiceId: string, motivo: string): Promise<void> {
  const { error } = await db.rpc("rpc_fin_anular_fatura", { p_invoice_id: invoiceId, p_motivo: motivo });
  if (error) throw error;
}
