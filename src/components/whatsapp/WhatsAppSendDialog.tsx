import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageCircle, Send, BookmarkPlus } from "lucide-react";
import { useWhatsApp, type WhatsAppContext, buildWhatsAppMessage } from "@/hooks/useWhatsApp";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface WhatsAppSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: WhatsAppContext | null;
  initialMessage?: string;
}

export function WhatsAppSendDialog({ open, onOpenChange, context, initialMessage }: WhatsAppSendDialogProps) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { openWhatsApp, registerInTimeline, formatWhatsAppPhone } = useWhatsApp();
  const { activeCompany } = useCompany();
  const { toast } = useToast();

  // Generate default message when dialog opens
  const generateMessage = async () => {
    if (!context) return;
    if (initialMessage) {
      setMessage(initialMessage);
      return;
    }
    let commercialName = "Equipa Comercial";
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: anewUser } = await supabase
          .from("anew_users")
          .select("name")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        if (anewUser?.name) commercialName = anewUser.name;
      }
    } catch {}
    const msg = buildWhatsAppMessage(context, commercialName, activeCompany?.name || "");
    setMessage(msg);
  };

  const handleOpen = () => {
    if (open && context) {
      setSent(false);
      generateMessage();
    }
  };

  useEffect(() => {
    if (open && context) {
      setSent(false);
      generateMessage();
    }
  }, [open, context]);

  const handleSend = () => {
    if (!context || !phone || !message) return;
    const opened = openWhatsApp(phone, message);
    if (opened) setSent(true);
  };

  const handleRegisterTimeline = async () => {
    if (!context) {
      console.info("[WhatsAppSendDialog] Missing context when registering timeline");
      return;
    }

    console.info("[WhatsAppSendDialog] Register timeline click", {
      module: context.module,
      entityId: context.entityId,
      organizationId: context.organizationId,
      leadId: context.leadId,
    });

    const success = await registerInTimeline(context, message);
    console.info("[WhatsAppSendDialog] Register timeline result", { success });
    if (!success) return;
    onOpenChange(false);
    setMessage("");
    setSent(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    setMessage("");
    setSent(false);
  };

  if (!context) return null;

  const phone = context.recipientPhone 
    ? formatWhatsAppPhone(context.recipientPhone, context.recipientPhoneCountryCode)
    : "";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            Enviar WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Para:</span>
            <span className="font-medium text-foreground">{context.recipientName}</span>
            {phone && <span className="text-xs">(+{phone})</span>}
          </div>

          {!sent ? (
            <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Mensagem</Label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="A gerar mensagem..."
                  className="resize-none"
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleSend}
                  disabled={!message || loading || !phone}
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Send className="h-4 w-4" />
                  Abrir WhatsApp
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                O WhatsApp foi aberto. Deseja registar na timeline?
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={handleClose}>
                  Não registar
                </Button>
                <Button onClick={handleRegisterTimeline} className="gap-2">
                  <BookmarkPlus className="h-4 w-4" />
                  Registar na timeline
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
