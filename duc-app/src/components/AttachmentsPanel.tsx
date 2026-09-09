import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { Badge, Button, Card, ConfirmDialog, Spinner } from "./ui";
import { Download, Image, Paperclip, Sheet, FileText, Trash, Upload } from "./icons";
import { ATTACHMENT_CATEGORIES } from "../lib/ducSchema";
import type { AttachmentCategory, DucAttachment } from "../lib/types";

const BUCKET = "duc-attachments";

function formatBytes(n: number | null): string {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(att: DucAttachment) {
  const mime = att.mime_type ?? "";
  const name = (att.file_name ?? "").toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/.test(name))
    return <Image width={16} height={16} className="text-violet-500" />;
  if (/sheet|excel|csv/.test(mime) || /\.(xlsx?|csv)$/.test(name))
    return <Sheet width={16} height={16} className="text-emerald-500" />;
  return <FileText width={16} height={16} className="text-slate-400" />;
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
}

export function AttachmentsPanel({
  ducId,
  orgId,
  businessUserId,
}: {
  ducId: string;
  orgId: string;
  businessUserId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DucAttachment[]>([]);
  const [uploadingCat, setUploadingCat] = useState<AttachmentCategory | null>(null);
  const [toDelete, setToDelete] = useState<DucAttachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("anew_client_duc_attachments")
      .select("*")
      .eq("duc_id", ducId)
      .order("created_at", { ascending: false });
    if (err) {
      setError(err.message);
    } else {
      setItems((data ?? []) as DucAttachment[]);
    }
    setLoading(false);
  }, [ducId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (category: AttachmentCategory, file: File) => {
    setUploadingCat(category);
    setError(null);
    const path = `${ducId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (upErr) {
      setError(`Falha no upload: ${upErr.message}`);
      setUploadingCat(null);
      return;
    }
    const { error: insErr } = await supabase.from("anew_client_duc_attachments").insert({
      duc_id: ducId,
      organization_id: orgId,
      category,
      file_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      created_by: businessUserId,
    });
    if (insErr) {
      // rollback do binário para não deixar ficheiro órfão
      await supabase.storage.from(BUCKET).remove([path]);
      setError(`Falha a registar o anexo: ${insErr.message}`);
    }
    setUploadingCat(null);
    void load();
  };

  const download = async (att: DucAttachment) => {
    const { data, error: err } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(att.file_path, 60);
    if (err || !data?.signedUrl) {
      setError("Não foi possível gerar o link do ficheiro.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const remove = async (att: DucAttachment) => {
    setError(null);
    // Apaga primeiro o registo (a barreira RLS); só depois o binário. Se o
    // registo falhar, não removemos o ficheiro e mostramos o erro em vez de o
    // engolir (evita linha órfã sem sinal para o utilizador).
    const { error: delErr } = await supabase
      .from("anew_client_duc_attachments")
      .delete()
      .eq("id", att.id);
    if (delErr) {
      setError(`Falha a remover o anexo: ${delErr.message}`);
      return;
    }
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove([att.file_path]);
    if (rmErr) {
      setError(`Registo removido, mas o ficheiro não foi apagado do storage: ${rmErr.message}`);
    }
    void load();
  };

  if (loading) return <Spinner label="A carregar anexos…" />;

  return (
    <>
    <Card className="p-5 print:border-0 print:shadow-none">
      <div className="mb-1 flex items-center gap-2">
        <Paperclip width={18} height={18} className="text-brand" />
        <h2 className="text-base font-semibold text-slate-800">Anexos</h2>
        <Badge className="bg-slate-50 text-slate-500 ring-slate-200">{items.length}</Badge>
      </div>
      <p className="mb-5 text-xs text-slate-500">
        Ficheiros que fazem parte do DUC. Guardados no bucket privado — só quem tem acesso ao DUC os vê.
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-100">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {ATTACHMENT_CATEGORIES.map((cat) => {
          const files = items.filter((i) => i.category === cat.key);
          const isUploading = uploadingCat === cat.key;
          return (
            <div key={cat.key} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">{cat.label}</h3>
                  {cat.example && <p className="text-xs text-slate-400">ex.: {cat.example}</p>}
                </div>
                <div className="print:hidden">
                  <input
                    ref={(el) => (inputRefs.current[cat.key] = el)}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(cat.key, f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={isUploading}
                    onClick={() => inputRefs.current[cat.key]?.click()}
                  >
                    <Upload width={14} height={14} />
                    {isUploading ? "A enviar…" : "Carregar"}
                  </Button>
                </div>
              </div>

              {files.length === 0 ? (
                <p className="text-xs text-slate-400">Sem ficheiros.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {files.map((att) => (
                    <li key={att.id} className="flex items-center gap-3 py-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-100">
                        {fileIcon(att)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-700">{att.file_name}</p>
                        <p className="text-xs text-slate-400">
                          {formatBytes(att.size_bytes)} ·{" "}
                          {new Date(att.created_at).toLocaleDateString("pt-PT")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 print:hidden">
                        <button
                          onClick={() => void download(att)}
                          title="Descarregar"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand"
                        >
                          <Download width={15} height={15} />
                        </button>
                        <button
                          onClick={() => setToDelete(att)}
                          title="Remover"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash width={15} height={15} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Card>

    {toDelete && (
      <ConfirmDialog
        title="Remover anexo"
        confirmLabel="Remover"
        message={
          <>
            Remover <span className="font-medium text-slate-800">{toDelete.file_name}</span>? O
            ficheiro é apagado do storage.
          </>
        }
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const att = toDelete;
          setToDelete(null);
          void remove(att);
        }}
      />
    )}
    </>
  );
}
