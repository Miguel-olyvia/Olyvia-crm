import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Upload, Eye, Download, Trash2, Paperclip, FileText, Image, File, Loader2 } from "lucide-react";

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

interface ContractDocumentsTabProps {
  contractId: string;
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

export function ContractDocumentsTab({ contractId, organizationId, readOnly }: ContractDocumentsTabProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState({ document_type: "other", notes: "" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["contract-documents", contractId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contract_documents")
        .select("*")
        .eq("contract_id", contractId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!contractId,
  });

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Não autenticado");

      const filePath = `${organizationId}/${contractId}/${Date.now()}_${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("contract-documents")
        .upload(filePath, selectedFile);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("contract-documents")
        .getPublicUrl(filePath);

      const { error: dbError } = await (supabase as any)
        .from("contract_documents")
        .insert({
          contract_id: contractId,
          organization_id: organizationId,
          file_name: selectedFile.name,
          file_url: filePath,
          file_type: selectedFile.type || selectedFile.name.split(".").pop(),
          file_size: selectedFile.size,
          document_type: uploadData.document_type,
          notes: uploadData.notes || null,
          uploaded_by: user.user.id,
        });
      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ["contract-documents", contractId] });
      toast.success("Documento anexado com sucesso");
      setIsUploadOpen(false);
      setSelectedFile(null);
      setUploadData({ document_type: "other", notes: "" });
    } catch (err: any) {
      toast.error("Erro ao anexar documento: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    const doc = documents.find((d: any) => d.id === docId);
    if (doc?.file_url) {
      await supabase.storage.from("contract-documents").remove([doc.file_url]);
    }
    const { error } = await (supabase as any).from("contract_documents").delete().eq("id", docId);
    if (error) { toast.error("Erro ao eliminar"); return; }
    queryClient.invalidateQueries({ queryKey: ["contract-documents", contractId] });
    toast.success("Documento eliminado");
    setDeleteDocId(null);
  };

  const handleDownload = async (doc: any) => {
    const { data, error } = await supabase.storage
      .from("contract-documents")
      .download(doc.file_url);
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
      .from("contract-documents")
      .createSignedUrl(doc.file_url, 3600);
    if (error || !data?.signedUrl) { toast.error("Erro ao abrir ficheiro"); return; }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Documentos deste Contrato ({documents.length})
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

      {/* Upload Dialog */}
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
              <Label>Ficheiro *</Label>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2">
                    {getFileIcon(selectedFile.name)}
                    <span className="text-sm font-medium">{selectedFile.name}</span>
                    <span className="text-xs text-muted-foreground">({formatFileSize(selectedFile.size)})</span>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Arraste o ficheiro para aqui ou clique para seleccionar</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, Word, Excel, imagens · Máx. 25 MB</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
                onChange={e => setSelectedFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Textarea
                placeholder="Ex: Scan do contrato assinado pelo cliente e pela empresa"
                value={uploadData.notes}
                onChange={e => setUploadData({ ...uploadData, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadOpen(false)} disabled={uploading}>Cancelar</Button>
            <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
              {uploading && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              <Paperclip className="h-4 w-4 mr-1.5" />
              Fazer Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
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
