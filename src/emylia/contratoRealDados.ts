// O contrato real, assinado, em PDF (27/11/2026, pedido do Rúben: «preciso dos contratos reais aqui»).
//
// A janela «Contrato de empreitada» mostrava só a minuta que a app gera a partir da proposta aceite. Os contratos que o cliente
// assinou são PDFs (digitalizados). Ficam no mesmo sítio dos outros anexos do negócio: o ficheiro no bucket «documents» (passa pela
// quarentena e pela validate-upload, como em DocumentosParaCliente e ContractsDocumentsView) e a linha em `documents` ligada ao
// contrato do negócio (ou à proposta, antes do contrato), com document_type = 'contrato_assinado'. As regras de acesso são as dos
// anexos: só os membros da organização (policies de documents e do bucket). visible_to_client = false: é interno, não vai ao portal.
// Não há tabela nem bucket novos. Se houver mais do que um, vale o mais recente (trocar o PDF não apaga o anterior).
import { supabase } from "@/integrations/supabase/client";
import { getUploadErrorMessage, parseValidateUploadResponse, resolveValidateUploadErrorMessage } from "@/lib/uploadErrors";
import { generateSecureFileName } from "@/utils/secureFileUpload";

export const DOC_CONTRATO_ASSINADO = "contrato_assinado";
export const MAX_MB_CONTRATO = 20;
const BUCKET = "documents";
const QUARENTENA = "documents-quarantine";

export interface ContratoReal { id: string; nome: string; caminho: string; quando: string; tamanho: number | null }
interface Ligacoes { negocio: string; contratos: string[]; propostas: string[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sbAny = supabase as any;

/** 27/11: só PDF e até 20 MB (o limite do bucket). Devolve a razão para recusar, ou null. */
export function porqueRecusarPdf(f: Pick<File, "name" | "type" | "size">): string | null {
  const ePdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  if (!ePdf) return "O contrato assinado tem de ser um PDF.";
  if (f.size <= 0) return "O ficheiro está vazio.";
  if (f.size > MAX_MB_CONTRATO * 1024 * 1024) return `O ficheiro passa de ${MAX_MB_CONTRATO} MB.`;
  return null;
}

/** 27/11: o tamanho para mostrar («3,5 MB», «820 KB»). */
export function tamanhoLegivel(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} MB`;
}

/** O negócio (pelo número), os contratos e as propostas dele: é a eles que os anexos se ligam. */
async function ligacoesDoNegocio(org: string, numero: number): Promise<Ligacoes | null> {
  const n = await sbAny.from("negocios").select("id").eq("organization_id", org).eq("numero", numero).is("deleted_at", null).maybeSingle();
  const negocio = n.data?.id as string | undefined;
  if (!negocio) return null;
  const [c, p] = await Promise.all([
    sbAny.from("client_contracts").select("id").eq("negocio_id", negocio).order("created_at", { ascending: false }),
    sbAny.from("proposals").select("id").eq("negocio_id", negocio).order("created_at", { ascending: false }),
  ]);
  const ids = (r: { data?: { id: string }[] | null }) => (r.data ?? []).map((x) => x.id);
  return { negocio, contratos: ids(c), propostas: ids(p) };
}

/** O contrato assinado (PDF) mais recente do negócio, ou null. */
export async function lerContratoReal(org: string, numero: number): Promise<ContratoReal | null> {
  const l = await ligacoesDoNegocio(org, numero);
  if (!l) return null;
  const ids = [...l.contratos, ...l.propostas];
  if (!ids.length) return null;
  const r = await sbAny.from("documents").select("id, file_name, file_url, file_size, created_at")
    .eq("organization_id", org).eq("document_type", DOC_CONTRATO_ASSINADO).in("entity_id", ids)
    .order("created_at", { ascending: false }).limit(1);
  if (r.error) throw r.error;
  const x = (r.data ?? [])[0] as { id: string; file_name: string; file_url: string; file_size: number | null; created_at: string } | undefined;
  if (!x) return null;
  return { id: x.id, nome: x.file_name, caminho: x.file_url, quando: new Date(x.created_at).toLocaleDateString("pt-PT"), tamanho: x.file_size };
}

/** O PDF para ver e descarregar na própria app (blob: é o que a CSP deixa pôr numa moldura). */
export async function pdfDoContrato(caminho: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(caminho);
  if (error || !data) throw error ?? new Error("Não foi possível ler o PDF.");
  return data.type === "application/pdf" ? data : new Blob([data], { type: "application/pdf" });
}

/**
 * 27/11: anexa o contrato assinado ao negócio. O ficheiro vai para a quarentena, a validate-upload confirma que é mesmo um PDF e
 * passa-o para «documents», e a linha fica ligada ao contrato do negócio (ou à proposta). Erros em português, prontos a mostrar.
 */
export async function anexarContratoReal(org: string, numero: number, f: File): Promise<ContratoReal> {
  const recusa = porqueRecusarPdf(f);
  if (recusa) throw new Error(recusa);
  const l = await ligacoesDoNegocio(org, numero);
  if (!l) throw new Error("Este negócio ainda não está gravado na base.");
  const alvo = l.contratos[0] ? { tipo: "contract", id: l.contratos[0] } : l.propostas[0] ? { tipo: "proposal", id: l.propostas[0] } : null;
  if (!alvo) throw new Error("Este negócio ainda não tem a proposta gravada na base.");
  const caminho = `${org}/${alvo.tipo}/${alvo.id}/${generateSecureFileName(f)}`;
  try {
    const { data: u } = await supabase.auth.getUser();
    const quem = u.user ? (await sbAny.from("anew_users").select("id").eq("auth_user_id", u.user.id).maybeSingle()).data?.id ?? null : null;
    const up = await supabase.storage.from(QUARENTENA).upload(caminho, f, { contentType: "application/pdf" });
    if (up.error) throw up.error;
    const v = await supabase.functions.invoke("validate-upload", { body: { quarantineBucket: QUARENTENA, finalBucket: BUCKET, path: caminho } });
    const vr = parseValidateUploadResponse(v.data);
    if (v.error || !vr.ok) throw new Error(await resolveValidateUploadErrorMessage(vr, v.error));
    const ins = await sbAny.from("documents").insert({
      organization_id: org, entity_type: alvo.tipo, entity_id: alvo.id, file_name: f.name, file_url: caminho,
      file_type: "application/pdf", file_size: f.size, document_type: DOC_CONTRATO_ASSINADO,
      notes: `Contrato assinado (PDF) do negócio ${numero}`, uploaded_by: quem, visible_to_client: false,
    }).select("id, created_at").single();
    if (ins.error) { await supabase.storage.from(BUCKET).remove([caminho]); throw ins.error; }
    return { id: ins.data.id, nome: f.name, caminho, quando: new Date(ins.data.created_at).toLocaleDateString("pt-PT"), tamanho: f.size };
  } catch (e) {
    throw new Error(getUploadErrorMessage(e));
  }
}
