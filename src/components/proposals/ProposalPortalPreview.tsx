import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";
import { ProposalPortalDocument } from "@/components/proposals/ProposalPortalDocument";
import { loadProposalPortalData, type ProposalPortalData } from "@/components/proposals/proposalPortalData";
import { generateProposalPdfBlob, downloadBlob } from "@/utils/generateProposalPdfBlob";
import { useToast } from "@/hooks/use-toast";

interface ProposalPortalPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
}

export function ProposalPortalPreview({ open, onOpenChange, proposalId }: ProposalPortalPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [portalData, setPortalData] = useState<ProposalPortalData | null>(null);
  const { toast } = useToast();

  const handleDownloadPdf = async () => {
    try {
      const { blob, fileName } = await generateProposalPdfBlob(proposalId);
      downloadBlob(blob, fileName);
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e?.message || "Tenta novamente.", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!open || !proposalId) {
      return;
    }

    let cancelled = false;
    // M5: reset stale data so the previous proposal doesn't flash through
    setPortalData(null);
    setLoading(true);

    (async () => {
      const data = await loadProposalPortalData(proposalId);
      if (cancelled) return;
      setPortalData(data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, proposalId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Preview — Visão do Cliente no Portal
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Esta é a visualização que o cliente terá ao abrir esta proposta no portal.
            {portalData?.template && <Badge variant="secondary" className="ml-2">{portalData.template.name}</Badge>}
          </p>
        </DialogHeader>

        <div className="max-h-[calc(90vh-100px)] overflow-y-auto px-6 pb-6">
          {loading ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : !portalData?.proposal ? (
            <p className="py-8 text-center text-muted-foreground">Proposta não encontrada. Guarde a proposta primeiro.</p>
          ) : (
            <div className="py-4">
              {(() => {
                const STATUS_LABELS: Record<string, string> = {
                  sent: "A aguardar decisão",
                  pending: "A aguardar decisão",
                  draft: "Rascunho",
                  accepted: "Proposta aceite",
                  rejected: "Proposta rejeitada",
                  expired: "Proposta expirada",
                };
                const status = portalData.proposal.status;
                const canActOnProposal = !["accepted", "rejected", "expired"].includes(status);
                const statusLabel =
                  status === "draft" && canActOnProposal
                    ? "A aguardar decisão"
                    : STATUS_LABELS[status] || status;
                return (
                  <ProposalPortalDocument
                    proposal={portalData.proposal}
                    template={portalData.template}
                    quotes={portalData.quotes}
                    quoteLines={portalData.quoteLines}
                    commercial={portalData.commercial}
                    company={portalData.company}
                    mode="preview"
                    statusLabel={statusLabel}
                    canActOnProposal={canActOnProposal}
                    onDownloadPdf={handleDownloadPdf}
                  />
                );
              })()}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
