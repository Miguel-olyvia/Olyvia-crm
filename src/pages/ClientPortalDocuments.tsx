import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ClientPortalLayout } from "@/components/portal/ClientPortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderOpen, FileDown, Download } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface PortalDocument {
  id: string;
  name: string;
  url: string;
  bucket?: string | null; // if set, url is a storage path inside this bucket
  type: string;
  source: string;
  sourceLabel: string;
  date: string;
}

// M6: resolve the storage bucket for a document. The `documents` table has no
// `bucket` column, so we infer it: absolute URLs need no signed URL; relative
// paths live in the default "documents" bucket.
function resolveDocBucket(fileUrl: string): string | null {
  if (!fileUrl) return null;
  if (/^https?:\/\//i.test(fileUrl)) return null;
  return "documents";
}

const ClientPortalDocuments = () => {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load(uid: string | null) {
      if (!uid) {
        if (!cancelled) { setDocuments([]); setLoading(false); }
        return;
      }
      if (!cancelled) setLoading(true);

      const allDocs: PortalDocument[] = [];

      // Get portal user records
      const { data: portalUsers } = await supabase
        .from("client_portal_users")
        .select("proposal_id, contract_id, quote_id")
        .eq("auth_user_id", uid);
      if (cancelled) return;

      if (!portalUsers) {
        if (!cancelled) { setDocuments([]); setLoading(false); }
        return;
      }

      const proposalIds = Array.from(new Set(portalUsers.filter(p => p.proposal_id).map(p => p.proposal_id!)));
      const contractIds = Array.from(new Set(portalUsers.filter(p => p.contract_id).map(p => p.contract_id!)));
      const quoteIds    = Array.from(new Set(portalUsers.filter(p => p.quote_id   ).map(p => p.quote_id!   )));

      // Quotes visíveis indirectamente (via proposta ou contrato)
      const indirectQuoteIds = new Set<string>(quoteIds);
      if (proposalIds.length > 0) {
        const { data: qs } = await supabase
          .from("quotes")
          .select("id")
          .in("proposal_id", proposalIds);
        if (cancelled) return;
        (qs || []).forEach(q => indirectQuoteIds.add(q.id));
      }
      if (contractIds.length > 0) {
        const { data: cs } = await supabase
          .from("client_contracts")
          .select("quote_id")
          .in("id", contractIds)
          .not("quote_id", "is", null);
        if (cancelled) return;
        (cs || []).forEach(c => c.quote_id && indirectQuoteIds.add(c.quote_id));
      }

      // PDF gerado da proposta (proposals.document_url) — não é anexo, mantém-se à parte
      if (proposalIds.length > 0) {
        const { data: proposals } = await supabase
          .from("proposals")
          .select("id, title, proposal_number, document_url, created_at")
          .in("id", proposalIds)
          .not("document_url", "is", null);
        if (cancelled) return;

        (proposals || []).forEach(p => {
          if (p.document_url) {
            allDocs.push({
              id: `prop-${p.id}`,
              name: `Proposta ${p.proposal_number || p.title}`,
              url: p.document_url,
              type: "PDF",
              source: "proposal",
              sourceLabel: `Proposta ${p.proposal_number || ""}`,
              date: p.created_at,
            });
          }
        });
      }

      // Anexos unificados via documents (RLS trata do resto)
      const docFilters: Array<{ type: string; ids: string[] }> = [];
      if (contractIds.length > 0) docFilters.push({ type: "contract", ids: contractIds });
      if (proposalIds.length > 0) docFilters.push({ type: "proposal", ids: proposalIds });
      const allQuoteIds = Array.from(indirectQuoteIds);
      if (allQuoteIds.length > 0) docFilters.push({ type: "quote", ids: allQuoteIds });

      for (const f of docFilters) {
        const { data: docs } = await (supabase as any)
          .from("documents")
          .select("id, file_name, file_url, file_type, document_type, created_at, entity_type")
          .eq("entity_type", f.type)
          .in("entity_id", f.ids)
          .order("created_at", { ascending: false });
        if (cancelled) return;

        (docs || []).forEach((d: any) => {
          const label = f.type === "contract" ? "Contrato" : f.type === "proposal" ? "Proposta" : "Orçamento";
          allDocs.push({
            id: d.id,
            name: d.file_name,
            url: d.file_url,
            bucket: resolveDocBucket(d.file_url), // M6
            type: (d.file_type || d.document_type || "").toString().toUpperCase(),
            source: f.type,
            sourceLabel: label,
            date: d.created_at,
          });
        });
      }

      // M8: dedupe by composite key (bucket|url)
      const seen = new Set<string>();
      const deduped = allDocs.filter(d => {
        const key = `${d.bucket ?? "url"}:${d.url}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Sort by date desc
      deduped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      if (cancelled) return;
      setDocuments(deduped);
      setLoading(false);
    }

    supabase.auth.getUser().then(({ data: { user } }) => load(user?.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      load(session?.user?.id ?? null);
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  return (
    <ClientPortalLayout>
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">Documentos</h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : documents.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <FolderOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">
                Ainda não tem documentos disponíveis.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {documents.map(doc => {
              const handleDownload = async (e: React.MouseEvent) => {
                e.preventDefault();
                try {
                  if (doc.bucket && !/^https?:\/\//i.test(doc.url)) {
                    // Bucket privado — usar download() com auth (evita signed URL que pode falhar no portal)
                    const { data, error } = await supabase.storage.from(doc.bucket).download(doc.url);
                    if (error || !data) throw error || new Error("download failed");
                    const blobUrl = URL.createObjectURL(data);
                    const a = document.createElement("a");
                    a.href = blobUrl;
                    a.download = doc.name || "documento";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                    return;
                  }
                  // URL pública completa (ex: proposals.document_url)
                  const res = await fetch(doc.url);
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  const blob = await res.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = blobUrl;
                  a.download = doc.name || "documento";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                } catch (err) {
                  console.error("download failed", err);
                  toast({ title: "Erro ao descarregar", description: "Não foi possível descarregar o documento.", variant: "destructive" });
                }
              };
              return (
                <Card key={doc.id}>
                  <CardContent className="p-3">
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="w-full flex items-center gap-3 hover:bg-muted/30 rounded p-1 transition-colors text-left"
                    >
                      <FileDown className="h-5 w-5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.sourceLabel} • {doc.type} • {format(new Date(doc.date), "d MMM yyyy", { locale: pt })}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <span><Download className="h-4 w-4" /></span>
                      </Button>
                    </button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ClientPortalLayout>
  );
};

export default ClientPortalDocuments;
