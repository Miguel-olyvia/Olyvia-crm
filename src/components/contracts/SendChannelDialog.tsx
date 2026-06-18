import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mail, MessageCircle, Send } from "lucide-react";

interface SendChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onSelectEmail: () => void;
  onSelectWhatsApp: () => void;
}

export function SendChannelDialog({
  open,
  onOpenChange,
  title = "Como pretende enviar?",
  description,
  onSelectEmail,
  onSelectWhatsApp,
}: SendChannelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>
        {description && (
          <p className="text-sm text-muted-foreground -mt-2">{description}</p>
        )}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            variant="outline"
            className="h-24 flex-col gap-2 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all"
            onClick={() => {
              onSelectEmail();
              onOpenChange(false);
            }}
          >
            <Mail className="h-8 w-8 text-blue-600" />
            <span className="text-sm font-medium">Email</span>
          </Button>
          <Button
            variant="outline"
            className="h-24 flex-col gap-2 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 transition-all"
            onClick={() => {
              onSelectWhatsApp();
              onOpenChange(false);
            }}
          >
            <MessageCircle className="h-8 w-8 text-green-600" />
            <span className="text-sm font-medium">WhatsApp</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
