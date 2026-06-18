import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Upload, Eye, Download, Trash2, Paperclip, FileText, Image, File, Loader2, Search, Filter } from "lucide-react";

const DOCUMENT_TYPES = [
  { value: "contract_signed", label: "Contrato Assinado", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  { value: "id_document", label: "Identificação", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "proof_address", label: "Comprovativo de Morada", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  { value: "quote", label: "Orçamento", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
  { value: "proposal", label: "Proposta", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
  { value: "plans", label: "Plantas", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" },
  { value: "photos", label: "Fotografias", color: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400" },
  { value: "other", label: "Outro", color: "bg-muted text-muted-foreground" },
];

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
  if (ext === "xlsx" || ext === "xls") return <File className="h-5 w-5 text-green-600" />;
  if (ext === "doc" || ext === "docx") return <File className="h-5 w-5 text-blue-600" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

interface ContractsDocumentsViewProps {
  contracts: any[];
}

export function ContractsDocumentsView({ contracts }: ContractsDocumentsViewProps) {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [contractFilter, setContractFilter] = useState("all");
  const [uploadData, setUploadData] = useState({ contract_id: "", document_type: "other", notes: "" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["all-contract-documents", activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany?.id) return [];
      const contractIds = contracts.map(c => c.id);
      if (contractIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("documents")
        .select("id, file_name, file_url, file_type, file_size, document_type, notes, uploaded_by, created_at, entity_id, organization_id")
        .eq("entity_type", "contract")
        .in("entity_id", contractIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Alias entity_id -> contract_id para compatibilidade com o resto do componente
      return (data || []).map((d: any) => ({ ...d, contract_id: d.entity_id }));
    },
    enabled: !!activeCompany?.id && contracts.length > 0,
  });

  // Resolve uploader names (uploaded_by guarda anew_users.id)
  const { data: uploaderNames = {} } = useQuery({
    queryKey: ["doc-uploader-names", documents.map((d: any) => d.uploaded_by).join(",")],
    queryFn: async () => {
      const ids = [...new Set(documents.map((d: any) => d.uploaded_by).filter(Boolean))];
      if (ids.length === 0) return {};
      const { data } = await (supabase as any)
        .from("anew_users")
        .select("id, name")
        .in("id", ids);
      const map: Record<string, string> = {};
      (data || []).forEach((u: any) => { map[u.id] = u.name || "—"; });
      return map;
    },
    enabled: documents.length > 0,
  });

  const contractMap = new Map(contracts.map(c => [c.id, c]));

  // KPIs
  const totalDocs = documents.length;
  const contractsWithDocs = new Set(documents.map((d: any) => d.contract_id)).size;
  const contractsWithoutDocs = contracts.length - contractsWithDocs;
  const typeCount = new Set(documents.map((d: any) => d.document_type)).size;

  // Filters
  const filtered = documents.filter((doc: any) => {
    if (typeFilter !== "all" && doc.document_type !== typeFilter) return false;
    if (contractFilter !== "all" && doc.contract_id !== contractFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const contract = contractMap.get(doc.contract_id);
      const matchesFile = doc.file_name?.toLowerCase().includes(q);
      const matchesContract = contract?.contract_number?.toLowerCase().includes(q);
      const matchesClient = contract?._clientName?.toLowerCase().includes(q);
      if (!matchesFile && !matchesContract && !matchesClient) return false;
    }
    return true;
  });

  const handleUpload = async () => {
    if (!selectedFile || !uploadData.contract_id) return;
    setUploading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Não autenticado");

      // Resolver auth.uid() -> anew_users.id (consistência da identidade de negócio)
      const { data: businessUser } = await supabase
        .from("anew_users")
        .select("id")
        .eq("auth_user_id", authData.user.id)
        .maybeSingle();

      const contract = contractMap.get(uploadData.contract_id);
      const orgId = contract?.organization_id || activeCompany?.id;
      const filePath = `${orgId}/contract/${uploadData.contract_id}/${Date.now()}_${selectedFile.name}`;

      const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, selectedFile);
      if (uploadError) throw uploadError;

      const { error: dbError } = await (supabase as any)
        .from("documents")
        .insert({
          organization_id: orgId,
          entity_type: "contract",
          entity_id: uploadData.contract_id,
          file_name: selectedFile.name,
          file_url: filePath,
          file_type: selectedFile.type || selectedFile.name.split(".").pop(),
          file_size: selectedFile.size,
          document_type: uploadData.document_type,
          notes: uploadData.notes || null,
          uploaded_by: businessUser?.id ?? null,
        });
      if (dbError) {
        await supabase.storage.from("documents").remove([filePath]);
        throw dbError;
      }

      queryClient.invalidateQueries({ queryKey: ["all-contract-documents"] });
      toast.success("Documento anexado com sucesso");
      setIsUploadOpen(false);
      setSelectedFile(null);
      setUploadData({ contract_id: "", document_type: "other", notes: "" });
    } catch (err: any) {
      toast.error("Erro ao anexar documento: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    const doc = documents.find((d: any) => d.id === docId);
    if (doc?.file_url) {
      await supabase.storage.from("documents").remove([doc.file_url]);
    }
    const { error } = await (supabase as any).from("documents").delete().eq("id", docId);
    if (error) { toast.error("Erro ao eliminar"); return; }
    queryClient.invalidateQueries({ queryKey: ["all-contract-documents"] });
    toast.success("Documento eliminado");
    setDeleteDocId(null);
  };

  const handleDownload = async (doc: any) => {
    const { data, error } = await supabase.storage.from("documents").download(doc.file_url);
    if (error || !data) { toast.error("Erro ao descarregar"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = doc.file_name; a.click();
    URL.revokeObjectURL(url);
  };

  const handleView = async (doc: any) => {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.file_url, 3600);
    if (error || !data?.signedUrl) { toast.error("Erro ao abrir ficheiro"); return; }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Documentos</p>
          <p className="text-2xl font-bold">{totalDocs}</p>
          <p className="text-xs text-muted-foreground">Em {contractsWithDocs} contratos</p>
        </div>
        <div className="border rounded-lg p-3 border-green-200 dark:border-green-900">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Contratos c/ Docs</p>
          <p className="text-2xl font-bold text-green-600">{contractsWithDocs}</p>
          <p className="text-xs text-muted-foreground">de {contracts.length} contratos</p>
        </div>
        <div className={`border rounded-lg p-3 ${contractsWithoutDocs > 0 ? "border-orange-200 dark:border-orange-900" : ""}`}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Contratos s/ Docs</p>
          <p className={`text-2xl font-bold ${contractsWithoutDocs > 0 ? "text-orange-500" : "text-muted-foreground"}`}>{contractsWithoutDocs}</p>
          {contractsWithoutDocs > 0 && <p className="text-xs text-orange-500">⚠ Sem scan anexado</p>}
        </div>
        <div className="border rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tipos</p>
          <p className="text-2xl font-bold">{typeCount}</p>
          <p className="text-xs text-muted-foreground">Categorias</p>
        </div>
      </div>

      {/* Filters + Upload */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Procurar por ficheiro, cliente, contrato..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {DOCUMENT_TYPES.map(dt => (
              <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={contractFilter} onValueChange={setContractFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Contrato" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos contratos</SelectItem>
            {contracts.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.contract_number}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={() => setIsUploadOpen(true)} className="gap-1.5">
          <Paperclip className="h-4 w-4" /> Anexar Documento
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
          <Paperclip className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Nenhum documento encontrado</p>
          <p className="text-xs mt-1">Anexe documentos aos contratos</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase">Ficheiro</TableHead>
                <TableHead className="text-[10px] uppercase">Tipo Documento</TableHead>
                <TableHead className="text-[10px] uppercase">Contrato</TableHead>
                <TableHead className="text-[10px] uppercase">Cliente</TableHead>
                <TableHead className="text-[10px] uppercase">Tamanho</TableHead>
                <TableHead className="text-[10px] uppercase">Upload por</TableHead>
                <TableHead className="text-[10px] uppercase">Data</TableHead>
                <TableHead className="text-[10px] uppercase text-right">Acções</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((doc: any) => {
                const typeInfo = getDocTypeInfo(doc.document_type);
                const contract = contractMap.get(doc.contract_id);
                const uploaderName = (uploaderNames as Record<string, string>)[doc.uploaded_by];
                const shortName = uploaderName ? uploaderName.split(" ").map((w: string, i: number) => i === 0 ? w : w[0] + ".").join(" ") : "—";
                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getFileIcon(doc.file_name)}
                        <div>
                          <p className="text-sm font-medium truncate max-w-[250px]">{doc.file_name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {doc.file_type?.split("/").pop()?.toUpperCase() || doc.file_name.split(".").pop()?.toUpperCase()}
                            {doc.notes && ` · ${doc.notes}`}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${typeInfo.color} text-[10px]`}>{typeInfo.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-primary">{contract?.contract_number || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{contract?._clientName || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{shortName}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString("pt-PT")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleView(doc)} title="Visualizar">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(doc)} title="Descarregar">
                          <Download className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteDocId(doc.id)} title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
              <Label>Contrato *</Label>
              <Select value={uploadData.contract_id} onValueChange={v => setUploadData({ ...uploadData, contract_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar contrato..." /></SelectTrigger>
                <SelectContent>
                  {contracts.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.contract_number} — {c._clientName || "—"} ({c.total_value ? `€${c.total_value.toFixed(2)}` : "—"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                    <Paperclip className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
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
            <Button onClick={handleUpload} disabled={!selectedFile || !uploadData.contract_id || uploading}>
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
