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
  /** Escolhida para o acompanhamento do cliente (acompanhamento-cliente.sql). Sem o SQL, não vem. */
  visivel_cliente?: boolean;
}

export async function fotosDasTarefas(tarefaIds: readonly string[]): Promise<FotoTarefa[]> {
  if (tarefaIds.length === 0) return [];
  const { data, error } = await supabase
    .from("ops_obra_tarefa_foto")
    // "*": a coluna visivel_cliente só existe com o acompanhamento-cliente.sql —
    // pedi-la pelo nome partia este ecrã numa base sem ele.
    .select("*")
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
  /** Ex.: a nota ditada ("O técnico fala…"). */
  legenda?: string | null;
}): Promise<void> {
  const f = args.ficheiro;
  await registarFotoTarefaNoCaminho({
    tarefaId: args.tarefaId,
    caminho: caminhoDaFoto({ ...args, nome: f.name }),
    nome: f.name,
    mime: f.type || null,
    ficheiro: f,
    legenda: args.legenda ?? null,
  });
}

/** Onde a foto vai ficar no storage. Decide-se UMA vez (também sem rede). */
export function caminhoDaFoto(args: { organizationId: string; obraId: string; tarefaId: string; nome: string }): string {
  const ext = args.nome.includes(".") ? args.nome.slice(args.nome.lastIndexOf(".")).toLowerCase() : "";
  return `${args.organizationId}/${args.obraId}/${args.tarefaId}/${nomeSorteado()}${ext}`;
}

/**
 * Envia a foto para um caminho já decidido e regista-a. Serve também à fila
 * sem rede: se um envio anterior chegou ao storage e a rede caiu antes do
 * registo, o reenvio encontra o ficheiro lá ("already exists") e só regista.
 */
export async function registarFotoTarefaNoCaminho(args: {
  tarefaId: string;
  caminho: string;
  nome: string;
  mime: string | null;
  ficheiro: Blob;
  /** Ex.: a nota ditada ("O técnico fala…"). */
  legenda?: string | null;
}): Promise<void> {
  const f = args.ficheiro;
  const caminho = args.caminho;
  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, f, { contentType: args.mime || undefined, upsert: false });
  if (erroUpload && /already exists|duplicate/i.test(erroUpload.message ?? "")) {
    // Já lá está (de um envio anterior): segue para o registo.
  } else if (erroUpload) {
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
    p_nome: args.nome,
    p_mime: args.mime,
    p_tamanho: f.size,
    // Só se manda quando há (a assinatura antiga também a aceita, com DEFAULT NULL).
    ...(args.legenda?.trim() ? { p_legenda: args.legenda.trim() } : {}),
  });
  if (error) {
    // Sem rede o ficheiro fica no storage: o reenvio só tem de o registar.
    if (!/failed to fetch|networkerror|load failed|fetch failed/i.test(error.message ?? "")) {
      await supabase.storage.from(BUCKET).remove([caminho]);
    }
    throw new ErroDeEscrita(error.message || "Não foi possível registar a foto.");
  }
}

export async function removerFotoTarefa(fotoId: string): Promise<void> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_remover_foto", { p_foto_id: fotoId });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível apagar a foto.");
  const r = data as unknown as { caminho?: string };
  if (r?.caminho) await supabase.storage.from(BUCKET).remove([r.caminho]);
}
