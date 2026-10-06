/**
 * Fotos das tarefas de obra (db/obras-fotos.sql).
 *
 * O mesmo bucket privado das ordens (`operacoes`), com o caminho
 * <organização>/<obra>/<tarefa>/<ficheiro>. Duas escritas, como nos anexos das
 * ordens: se o registo falhar, o ficheiro sai do storage.
 */
import { supabase } from "./supabase";
import { ErroDeDados, ErroDeEscrita, nomeSorteado } from "./dados";

const BUCKET = "operacoes";

export interface FotoTarefa {
  id: string;
  tarefa_id: string;
  obra_id: string;
  caminho: string;
  nome: string;
  mime: string | null;
  legenda: string | null;
  carregado_por: string | null;
  carregado_em: string;
}

export async function fotosDasTarefas(tarefaIds: readonly string[]): Promise<FotoTarefa[]> {
  if (tarefaIds.length === 0) return [];
  const { data, error } = await supabase
    .from("ops_obra_tarefa_foto")
    .select("id, tarefa_id, obra_id, caminho, nome, mime, legenda, carregado_por, carregado_em")
    .in("tarefa_id", [...tarefaIds])
    .order("carregado_em");
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[Obras] carregar as fotos:", error);
    throw new ErroDeDados("Não foi possível carregar as fotos.");
  }
  return (data ?? []) as unknown as FotoTarefa[];
}

export async function enviarFotoTarefa(args: {
  organizationId: string;
  obraId: string;
  tarefaId: string;
  ficheiro: File;
}): Promise<void> {
  const f = args.ficheiro;
  const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")).toLowerCase() : "";
  const caminho = `${args.organizationId}/${args.obraId}/${args.tarefaId}/${nomeSorteado()}${ext}`;

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, f, { contentType: f.type || undefined, upsert: false });
  if (erroUpload) {
    // eslint-disable-next-line no-console
    console.error("[Obras] falha a enviar a foto:", erroUpload);
    const m = erroUpload.message ?? "";
    throw new ErroDeEscrita(
      m.includes("exceeded") || m.includes("too large")
        ? "A foto é grande demais. O limite é 25 MB."
        : m.includes("row-level security") || m.includes("Unauthorized")
          ? "Sem permissão para juntar fotos a esta tarefa."
          : m || "Não foi possível enviar a foto."
    );
  }

  const { error } = await supabase.rpc("rpc_ops_obra_registar_foto", {
    p_tarefa_id: args.tarefaId,
    p_caminho: caminho,
    p_nome: f.name,
    p_mime: f.type || null,
    p_tamanho: f.size,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([caminho]);
    throw new ErroDeEscrita(error.message || "Não foi possível registar a foto.");
  }
}

export async function removerFotoTarefa(fotoId: string): Promise<void> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_remover_foto", { p_foto_id: fotoId });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível apagar a foto.");
  const r = data as unknown as { caminho?: string };
  if (r?.caminho) await supabase.storage.from(BUCKET).remove([r.caminho]);
}
