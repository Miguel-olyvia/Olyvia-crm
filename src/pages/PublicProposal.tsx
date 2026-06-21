import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2, XCircle, Shield, Loader2, AlertCircle
} from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProposalPortalDocument } from "@/components/proposals/ProposalPortalDocument";
import { loadProposalPortalData, type ProposalPortalData } from "@/components/proposals/proposalPortalData";
import { generateProposalPdfBlob, downloadBlob } from "@/utils/generateProposalPdfBlob";

interface RejectionReason {
  id: string;
  code: string;
  label: string;
  description: string | null;
}

export default function PublicProposal() {
  const { token } = useParams<{ token: string }>();
  const [portalData, setPortalData] = useState<ProposalPortalData | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  
  // Verification states
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [verificationAction, setVerificationAction] = useState<"accept" | "reject">("accept");
  const [verificationDestination, setVerificationDestination] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  
  // Rejection states
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
  const [selectedRejectionReason, setSelectedRejectionReason] = useState("");
  const [rejectionNotes, setRejectionNotes] = useState("");

  useEffect(() => {
    if (token) {
      fetchProposal();
    }
  }, [token]);

  const fetchProposal = async () => {
    try {
      // First resolve the proposal ID from the public token
      const { data: tokenData, error: fetchError } = await supabase
        .from("proposals")
        .select("id, public_link_enabled")
        .eq("public_token", token)
        .maybeSingle();

      if (fetchError) throw fetchError;
      
      if (!tokenData) {
        setError("Proposta não encontrada");
        return;
      }

      if (!tokenData.public_link_enabled) {
        setError("Esta proposta não está disponível para visualização");
        return;
      }

      setProposalId(tokenData.id);

      // Use the shared data loader
      const data = await loadProposalPortalData(tokenData.id);
      if (!data) {
        setError("Erro ao carregar dados da proposta");
        return;
      }

      setPortalData(data);

      // Track view via edge function
      try {
        await supabase.functions.invoke("track-proposal-view", {
          body: {
            proposal_id: tokenData.id,
            event: "view",
          },
        });
      } catch (trackErr) {
        console.log("Tracking error (non-critical):", trackErr);
      }

      if (!data.proposal.viewed_at) {
        await supabase
          .from("proposals")
          .update({ viewed_at: new Date().toISOString() })
          .eq("id", tokenData.id);
      }
    } catch (err: any) {
      setError(err.message || "Erro ao carregar proposta");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptClick = () => {
    const template = portalData?.template;
    if (template?.accept_verification_method && template.accept_verification_method !== "none") {
      setVerificationAction("accept");
      setShowVerificationDialog(true);
    } else {
      handleDirectAccept();
    }
  };

  const handleRejectClick = () => {
    setShowRejectionDialog(true);
    if (portalData?.proposal?.organization_id) {
      fetchRejectionReasons();
    }
  };

  const fetchRejectionReasons = async () => {
    if (!portalData?.proposal?.organization_id) return;
    const { data } = await (supabase
      .from("proposal_rejection_reasons") as any)
      .select("id, code, label, description")
      .eq("organization_id", portalData.proposal.organization_id)
      .eq("is_active", true)
      .order("sort_order");
    if (data) setRejectionReasons(data);
  };

  const handleDirectAccept = async () => {
    if (!portalData?.proposal) return;
    setAccepting(true);
    try {
      const { data, error } = await supabase
        .from("proposals")
        .update({ 
          status: "accepted",
          accepted_at: new Date().toISOString(),
          acceptance_ip: "client",
          acceptance_user_agent: navigator.userAgent
        })
        .eq("id", portalData.proposal.id)
        .in("status", ["draft", "sent", "pending"])
        .select("id");
      
      if (error) throw error;
      if (!data || data.length === 0) {
        console.warn("Proposal already actioned — no rows updated");
        return;
      }
      setPortalData({
        ...portalData,
        proposal: { ...portalData.proposal, status: "accepted" },
      });
    } catch (err: any) {
      console.error("Error accepting proposal:", err);
    } finally {
      setAccepting(false);
    }
  };

  const handleSendVerificationCode = async () => {
    if (!portalData?.proposal || !verificationDestination) return;
    
    setSendingCode(true);
    try {
      const { error } = await supabase.functions.invoke("send-verification-code", {
        body: {
          proposal_id: portalData.proposal.id,
          method: "email",
          destination: verificationDestination,
          action: verificationAction,
          rejection_reason_code: verificationAction === "reject" ? selectedRejectionReason : null,
          rejection_notes: verificationAction === "reject" ? rejectionNotes : null,
        },
      });
      
      if (error) throw error;
      setCodeSent(true);
    } catch (err: any) {
      console.error("Error sending verification code:", err);
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!portalData?.proposal || !verificationCode) return;
    
    setVerifyingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-verification-code/verify", {
        body: {
          proposal_id: portalData.proposal.id,
          code: verificationCode,
        },
      });
      
      if (error) throw error;
      
      // Update proposal status based on action
      const newStatus = data?.action === "reject" ? "rejected" : "accepted";
      setPortalData({
        ...portalData,
        proposal: { ...portalData.proposal, status: newStatus },
      });
      setShowVerificationDialog(false);
      
      // Reset states
      setVerificationCode("");
      setCodeSent(false);
      setSelectedRejectionReason("");
      setRejectionNotes("");
    } catch (err: any) {
      console.error("Error verifying code:", err);
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleDirectReject = async () => {
    if (!portalData?.proposal || !selectedRejectionReason) return;
    setRejecting(true);
    try {
      const selectedReason = rejectionReasons.find(r => r.code === selectedRejectionReason);
      const { error } = await supabase.functions.invoke("reject-proposal", {
        body: {
          proposal_id:           portalData.proposal.id,
          public_token:          token,
          rejection_reason_code: selectedRejectionReason,
          rejection_reason:      selectedReason?.label || null,
          rejection_notes:       rejectionNotes || null,
        },
      });
      if (error) throw error;
      setPortalData({
        ...portalData,
        proposal: { ...portalData.proposal, status: "rejected" },
      });
      setShowRejectionDialog(false);
    } catch (err: any) {
      console.error("Error rejecting proposal:", err);
    } finally {
      setRejecting(false);
    }
  };

  const handleConfirmRejection = () => {
    const template = portalData?.template;
    if (template?.accept_verification_method && template.accept_verification_method !== "none") {
      setVerificationAction("reject");
      setShowRejectionDialog(false);
      setShowVerificationDialog(true);
    } else {
      handleDirectReject();
    }
  };

  const handleAcceptQuote = async (quoteId: string) => {
    try {
      const { data, error } = await supabase
        .from("quotes")
        .update({ estado: "aceite" })
        .eq("id", quoteId)
        .neq("estado", "aceite")
        .neq("estado", "rejeitado")
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        console.warn("Quote already actioned — no rows updated");
        return;
      }
      if (portalData) {
        setPortalData({
          ...portalData,
          quotes: portalData.quotes.map(q => q.id === quoteId ? { ...q, estado: "aceite" } : q),
        });
      }
    } catch (err) {
      console.error("Error accepting quote:", err);
    }
  };

  const handleRejectQuote = async (quoteId: string) => {
    try {
      const { data, error } = await supabase
        .from("quotes")
        .update({ estado: "rejeitado" })
        .eq("id", quoteId)
        .neq("estado", "aceite")
        .neq("estado", "rejeitado")
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        console.warn("Quote already actioned — no rows updated");
        return;
      }
      if (portalData) {
        setPortalData({
          ...portalData,
          quotes: portalData.quotes.map(q => q.id === quoteId ? { ...q, estado: "rejeitado" } : q),
        });
      }
    } catch (err) {
      console.error("Error rejecting quote:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <OlyviaLoader size={48} text="A carregar proposta..." />
      </div>
    );
  }

  if (error || !portalData?.proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Proposta não disponível</h2>
            <p className="text-muted-foreground">{error || "Esta proposta não existe ou foi removida."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const proposal = portalData.proposal;
  const canActOnProposal = !["accepted", "rejected", "expired"].includes(proposal.status);
  const statusLabel = canActOnProposal ? "A aguardar decisão" : (
    proposal.status === "accepted" ? "Aceite" :
    proposal.status === "rejected" ? "Rejeitada" :
    proposal.status
  );

  return (
    <div 
      className="min-h-screen py-8 px-4"
      style={{ backgroundColor: portalData.template?.background_color || "#ffffff" }}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <ProposalPortalDocument
          proposal={proposal}
          template={portalData.template}
          quotes={portalData.quotes}
          quoteLines={portalData.quoteLines}
          quoteFees={portalData.quoteFees}
          commercial={portalData.commercial}
          company={portalData.company}
          mode="portal"
          statusLabel={statusLabel}
          canActOnProposal={canActOnProposal}
          actionLoading={accepting || rejecting}
          onAcceptQuote={handleAcceptQuote}
          onRejectQuote={handleRejectQuote}
          onSignProposal={handleAcceptClick}
          onRejectProposal={handleRejectClick}
          onDownloadPdf={async () => {
            try {
              const { blob, fileName } = await generateProposalPdfBlob(proposal.id);
              downloadBlob(blob, fileName);
            } catch (e: any) {
              alert(e?.message || "Erro ao gerar PDF");
            }
          }}
        />
      </div>

      {/* Verification Dialog */}
      <Dialog open={showVerificationDialog} onOpenChange={setShowVerificationDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Verificação de Identidade
            </DialogTitle>
            <DialogDescription>
              Para {verificationAction === "accept" ? "aceitar" : "recusar"} a proposta, precisamos verificar a sua identidade.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {!codeSent ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="destination">Email para verificação</Label>
                  <Input
                    id="destination"
                    value={verificationDestination}
                    onChange={(e) => setVerificationDestination(e.target.value)}
                    placeholder="seu@email.com"
                  />
                </div>
                
                <Button 
                  onClick={handleSendVerificationCode} 
                  disabled={sendingCode || !verificationDestination}
                  className="w-full"
                >
                  {sendingCode && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Enviar Código
                </Button>
              </>
            ) : (
              <>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Código enviado para <strong>{verificationDestination}</strong>
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="code">Código de verificação</Label>
                  <Input
                    id="code"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="123456"
                    className="text-center text-2xl tracking-widest"
                    maxLength={6}
                  />
                </div>
                
                <Button 
                  onClick={handleVerifyCode} 
                  disabled={verifyingCode || verificationCode.length !== 6}
                  className="w-full"
                >
                  {verifyingCode && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Verificar e {verificationAction === "accept" ? "Aceitar" : "Recusar"}
                </Button>
                
                <Button 
                  variant="ghost" 
                  onClick={() => setCodeSent(false)}
                  className="w-full"
                >
                  Enviar novo código
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={showRejectionDialog} onOpenChange={setShowRejectionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Recusar Proposta
            </DialogTitle>
            <DialogDescription>
              Por favor, indique o motivo da recusa para nos ajudar a melhorar.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label>Motivo da recusa *</Label>
              <Select value={selectedRejectionReason} onValueChange={setSelectedRejectionReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um motivo..." />
                </SelectTrigger>
                <SelectContent>
                  {rejectionReasons.map((reason) => (
                    <SelectItem key={reason.code} value={reason.code}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRejectionReason && (
                <p className="text-xs text-muted-foreground">
                  {rejectionReasons.find(r => r.code === selectedRejectionReason)?.description}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="rejectionNotes">Notas adicionais (opcional)</Label>
              <Textarea
                id="rejectionNotes"
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                placeholder="Descreva em mais detalhe o motivo da recusa..."
                rows={3}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button 
                variant="outline" 
                onClick={() => setShowRejectionDialog(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button 
                variant="destructive"
                onClick={handleConfirmRejection}
                disabled={!selectedRejectionReason || rejecting}
                className="flex-1"
              >
                {rejecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirmar Recusa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
