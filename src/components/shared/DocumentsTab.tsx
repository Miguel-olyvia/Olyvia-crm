import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Upload, Eye, Download, Trash2, Paperclip, FileText, Image, File, Loader2 } from "lucide-react";
import { getUploadErrorMessage, parseValidateUploadResponse, resolveValidateUploadErrorMessage } from "@/lib/uploadErrors";

export type DocumentEntityType = "quote" | "proposal" | "contract";

const DOCUMENT_TYPES = [
  { value: "contract_signed", label: "Contrato Assinado (scan)", color: "bg-green-100 text-green-800" },
  { value: "id_document", label: "Identificação", color: "bg-blue-100 text-blue-800" },
  { value: "proof_address", label: "Comprovativo de Morada", color: "bg-yellow-100 text-yellow-800" },
  { value: "quote", label: "Orçamento", color: "bg-purple-100 text-purple-800" },
  { value: "proposal", label: "Proposta", color: "bg-orange-100 text-orange-800" },
  { value: "plans", label: "Plantas", color: "bg-emerald-100 text-emerald-800" },
  { value: "photos", label: "Fotografias", color: "bg-pink-100 text-pink-800" },
  { value: "other", label: "Outro", color: "bg-gray-100 text-gray-800" },
];

interface DocumentsTabProps {
  entityId: string;
  entityType: DocumentEntityType;
  organizationId: string;
  readOnly?: boolean;
}

function getDocTypeInfo(type: string) {
  return DOCUMENT_TYPES.find(d => d.value === type) || DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1];
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) return <Image className="h-5 w-5 text-pink-500" />;
  if (["pdf"].includes(ext || "")) return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

const ALLOWED_UPLOAD_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png", "gif", "webp"];
const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_FILES_PER_BATCH = 10;

function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const isExtAllowed = ALLOWED_UPLOAD_EXTENSIONS.includes(ext);
  const isMimeAllowed = !file.type || ALLOWED_UPLOAD_MIME_TYPES.includes(file.type);
  if (!isExtAllowed || !isMimeAllowed) {
    return "Tipo de ficheiro não permitido. Utilize PDF, Word, Excel ou imagem (jpg, png, gif, webp).";
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "Ficheiro demasiado grande. O tamanho máximo permitido é 20 MB.";
  }
  return null;
}

export function DocumentsTab({ entityId, entityType, organizationId, readOnly }: DocumentsTabProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState({ document_type: "other", notes: "" });
  const [selectedFiles, setSelectedFiles] = useState<{ id: string; file: File }[]>([]);
  const [uploading, setUploading] = useState(false);

  const queryKey = ["documents", entityType, entityId];

  const { data: documents = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("documents")
        .select("id, file_name, file_url, file_type, file_size, document_type, notes, uploaded_by, created_at")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!entityId && !!entityType,
  });

  const uploadSingleFile = async (file: File, uploadedBy: string | null): Promise<string | null> => {
    const validationError = validateFile(file);
    if (validationError) return validationError;

    const filePath = `${organizationId}/${entityType}/${entityId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("documents-quarantine")
      .upload(filePath, file);
    if (uploadError) return getUploadErrorMessage(uploadError);

    const { data: validateData, error: validateError } = await supabase.functions.invoke("validate-upload", {
      body: { quarantineBucket: "documents-quarantine", finalBucket: "documents", path: filePath },
    });
    const validateResult = parseValidateUploadResponse(validateData);
    if (validateError || !validateResult.ok) {
      return await resolveValidateUploadErrorMessage(validateResult, validateError);
    }

    const { error: dbError } = await (supabase as any)
      .from("documents")
      .insert({
        organization_id: organizationId,
        entity_type: entityType,
        entity_id: entityId,
        file_name: file.name,
        file_url: filePath,
        file_type: file.type || file.name.split(".").pop(),
        file_size: file.size,
        document_type: uploadData.document_type,
        notes: uploadData.notes || null,
        uploaded_by: uploadedBy,
      });
    if (dbError) {
      // Rollback do ficheiro se a row falhar
      await supabase.storage.from("documents").remove([filePath]);
      return getUploadErrorMessage(dbError);
    }

    return null;
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Não autenticado");

      // Resolver auth.uid() -> anew_users.id para consistência da identidade de negócio
      const { data: businessUser, error: userErr } = await supabase
        .from("anew_users")
        .select("id")
        .eq("auth_user_id", authData.user.id)
        .maybeSingle();
      if (userErr) throw userErr;
      const uploadedBy = businessUser?.id ?? null;

      const failures: { fileName: string; reason: string }[] = [];
      let successCount = 0;

      for (const { file } of selectedFiles) {
        const failureReason = await uploadSingleFile(file, uploadedBy);
        if (failureReason) {
          failures.push({ fileName: file.name, reason: failureReason });
        } else {
          successCount += 1;
        }
      }

      if (successCount > 0) {
        queryClient.invalidateQueries({ queryKey });
      }

      if (failures.length === 0) {
        toast.success(`${successCount} documento${successCount === 1 ? "" : "s"} anexado${successCount === 1 ? "" : "s"} com sucesso`);
      } else if (successCount > 0) {
        toast.warning(`${successCount} de ${selectedFiles.length} documentos anexados. ${failures.length} falharam.`);
        failures.forEach(failure => toast.error(`${failure.fileName}: ${failure.reason}`));
      } else {
        toast.error(`Nenhum documento foi anexado. ${failures.length} falharam.`);
        failures.forEach(failure => toast.error(`${failure.fileName}: ${failure.reason}`));
      }

      if (successCount > 0) {
        setIsUploadOpen(false);
        setSelectedFiles([]);
        setUploadData({ document_type: "other", notes: "" });
      }
    } catch (err: unknown) {
      toast.error("Erro ao anexar documentos: " + getUploadErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    e.target.value = "";
    if (!fileList) return;
    const files = Array.from(fileList);
    if (files.length > MAX_FILES_PER_BATCH) {
      toast.warning(`Só pode anexar até ${MAX_FILES_PER_BATCH} ficheiros de cada vez. Foram selecionados apenas os primeiros ${MAX_FILES_PER_BATCH}.`);
    }
    setSelectedFiles(files.slice(0, MAX_FILES_PER_BATCH).map(file => ({ id: crypto.randomUUID(), file })));
  };

  const handleRemoveSelectedFile = (id: string) => {
    setSelectedFiles(prev => prev.filter(entry => entry.id !== id));
  };

  const handleDelete = async (docId: string) => {
    const doc = documents.find((d: any) => d.id === docId);
    if (doc?.file_url) {
      await supabase.storage.from("documents").remove([doc.file_url]);
    }
    const { error } = await (supabase as any).from("documents").delete().eq("id", docId);
    if (error) { toast.error("Erro ao eliminar"); return; }
    queryClient.invalidateQueries({ queryKey });
    toast.success("Documento eliminado");
    setDeleteDocId(null);
  };

  const handleDownload = async (doc: any) => {
    const { data, error } = await supabase.storage.from("documents").download(doc.file_url);
    if (error || !data) { toast.error("Erro ao descarregar"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleView = async (doc: any) => {
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_url, 3600, { download: true });
    if (error || !data?.signedUrl) { toast.error("Erro ao abrir ficheiro"); return; }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Documentos ({documents.length})
        </h3>
        {!readOnly && (
          <Button size="sm" onClick={() => setIsUploadOpen(true)} className="gap-1.5">
            <Paperclip className="h-3.5 w-3.5" />
            Anexar Documento
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
          <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum documento anexado</p>
          {!readOnly && <p className="text-xs mt-1">Clique em "Anexar Documento" para adicionar ficheiros</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc: any) => {
            const typeInfo = getDocTypeInfo(doc.document_type);
            return (
              <div key={doc.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                {getFileIcon(doc.file_name)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.file_name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {doc.file_type?.toUpperCase()} · {formatFileSize(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString("pt-PT")}
                  </p>
                </div>
                <Badge className={`${typeInfo.color} text-[10px] shrink-0`}>{typeInfo.label}</Badge>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleView(doc)} title="Visualizar">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(doc)} title="Descarregar">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {!readOnly && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteDocId(doc.id)} title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" /> Anexar Documento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Documento *</Label>
              <Select value={uploadData.document_type} onValueChange={v => setUploadData({ ...uploadData, document_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map(dt => (
                    <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ficheiros *</Label>
              <div
                role="button"
                tabIndex={0}
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Arraste os ficheiros para aqui ou clique para seleccionar</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, Word, Excel, imagens · Máx. 20 MB por ficheiro · Máx. {MAX_FILES_PER_BATCH} ficheiros</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
                onChange={handleFilesSelected}
              />
              {selectedFiles.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {selectedFiles.map(({ id, file }) => (
                    <div key={id} className="flex items-center gap-2 p-2 border rounded-md text-sm">
                      {getFileIcon(file.name)}
                      <span className="font-medium truncate flex-1">{file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">({formatFileSize(file.size)})</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => handleRemoveSelectedFile(id)}
                        title="Remover"
                      >
                        <span aria-hidden="true">×</span>
                        <span className="sr-only">Remover {file.name}</span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Textarea
                placeholder="Ex: Contrato assinado pelo cliente"
                value={uploadData.notes}
                onChange={e => setUploadData({ ...uploadData, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadOpen(false)} disabled={uploading}>Cancelar</Button>
            <Button onClick={handleUpload} disabled={selectedFiles.length === 0 || uploading}>
              {uploading && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              <Paperclip className="h-4 w-4 mr-1.5" />
              Fazer Upload{selectedFiles.length > 0 ? ` (${selectedFiles.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteDocId} onOpenChange={(open) => !open && setDeleteDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Documento</AlertDialogTitle>
            <AlertDialogDescription>Tem a certeza que deseja eliminar este documento? Esta acção é irreversível.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteDocId && handleDelete(deleteDocId)} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
