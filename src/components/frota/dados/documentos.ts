// Anexar um ficheiro à viatura pela mesma via do DocumentsTab (ficha › Documentos): quarentena → validate-upload →
// bucket "documents" → linha em documents (entity_type='vehicle', entity_id=<viatura>, visible_to_client=false).
// Usado no "Renovar documento" para o comprovativo, que fica ligado à renovação por p_document_id.
import { supabase } from "@/integrations/supabase/client";
import { validateFile } from "@/components/shared/DocumentsTab";
import { getUploadErrorMessage, parseValidateUploadResponse, resolveValidateUploadErrorMessage } from "@/lib/uploadErrors";
import { generateSecureFileName } from "@/utils/secureFileUpload";
import { ErroFrota } from "./api";

export interface DocumentoAnexado { id: string; caminho: string }

/** O ficheiro serve? (tipo e tamanho, as mesmas regras do DocumentsTab). null = serve. */
export const problemaFicheiro = (f: File): string | null => validateFile(f);

const sb = supabase as unknown as {
  from: (t: string) => any;
  storage: typeof supabase.storage;
  functions: typeof supabase.functions;
  auth: typeof supabase.auth;
};

/** Carrega o ficheiro e cria a linha em documents. Erro → ErroFrota com a mensagem em português (nada fica para trás). */
export async function anexarDocumentoViatura(p: { org: string; vid: string; ficheiro: File; tipo?: string; nota?: string | null }): Promise<DocumentoAnexado> {
  const invalido = validateFile(p.ficheiro);
  if (invalido) throw new ErroFrota(invalido);
  const caminho = `${p.org}/vehicle/${p.vid}/${generateSecureFileName(p.ficheiro)}`;
  const { error: erroUpload } = await sb.storage.from("documents-quarantine").upload(caminho, p.ficheiro);
  if (erroUpload) throw new ErroFrota(`O comprovativo não foi carregado: ${getUploadErrorMessage(erroUpload)}`);

  const { data: dv, error: ev } = await sb.functions.invoke("validate-upload", {
    body: { quarantineBucket: "documents-quarantine", finalBucket: "documents", path: caminho },
  });
  const validacao = parseValidateUploadResponse(dv);
  if (ev || !validacao.ok) throw new ErroFrota(`O comprovativo foi recusado: ${await resolveValidateUploadErrorMessage(validacao, ev)}`);

  // uploaded_by é o anew_users.id (identidade de negócio), como no DocumentsTab
  let autor: string | null = null;
  const { data: auth } = await sb.auth.getUser();
  if (auth?.user) {
    const { data: u } = await sb.from("anew_users").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
    autor = (u as { id?: string } | null)?.id ?? null;
  }
  const { data: linha, error: erroLinha } = await sb.from("documents").insert({
    organization_id: p.org, entity_type: "vehicle", entity_id: p.vid,
    file_name: p.ficheiro.name, file_url: caminho, file_type: p.ficheiro.type || p.ficheiro.name.split(".").pop(), file_size: p.ficheiro.size,
    document_type: p.tipo ?? "other", notes: p.nota ?? null, uploaded_by: autor,
    // documents.visible_to_client é DEFAULT true: escrever sempre false (a viatura nunca vai ao portal do cliente)
    visible_to_client: false,
  }).select("id").single();
  if (erroLinha || !linha?.id) {
    await sb.storage.from("documents").remove([caminho]);
    throw new ErroFrota(`O comprovativo não foi gravado: ${getUploadErrorMessage(erroLinha ?? new Error("sem resposta"))}`);
  }
  return { id: String(linha.id), caminho };
}

/** Desfaz um anexo (a renovação falhou depois do carregamento): apaga a linha e o ficheiro. Não lança. */
export async function desfazerDocumentoViatura(d: DocumentoAnexado): Promise<void> {
  try {
    await sb.from("documents").delete().eq("id", d.id);
    await sb.storage.from("documents").remove([d.caminho]);
  } catch {
    /* fica um anexo solto na ficha › Documentos, que se pode apagar à mão */
  }
}
