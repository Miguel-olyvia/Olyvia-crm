import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Building, ArrowRight } from "lucide-react";
import olyviaIcon from "@/assets/olyvia-icon.png";
import { supabase } from "@/integrations/supabase/client";

interface WelcomeOrgDialogProps {
  open: boolean;
  onClose: () => void;
}

export function WelcomeOrgDialog({ open, onClose }: WelcomeOrgDialogProps) {
  const navigate = useNavigate();
  const [closing, setClosing] = useState(false);

  const dismissForUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      localStorage.setItem(`welcomeOrgDismissed_${session.user.id}`, "true");
    }
  };

  const handleCreateNow = async () => {
    setClosing(true);
    await dismissForUser();
    onClose();
    navigate("/organizations");
  };

  const handleLater = async () => {
    setClosing(true);
    await dismissForUser();
    onClose();
  };

  return (
    <Dialog open={open && !closing} onOpenChange={(v) => { if (!v) handleLater(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center space-y-3">
          <img src={olyviaIcon} alt="Olyvia" className="h-14 w-14 mx-auto" />
          <DialogTitle className="text-xl">Bem-vindo à Olyvia! 🎉</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            A sua conta foi criada com sucesso. Registe a sua empresa agora para começar a utilizar todas as funcionalidades.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-2">
          <Button onClick={handleCreateNow} className="w-full gap-2">
            <Building className="w-4 h-4" />
            Registar a Minha Empresa
            <ArrowRight className="w-4 h-4 ml-auto" />
          </Button>
          <Button variant="ghost" onClick={handleLater} className="w-full text-muted-foreground">
            Mais tarde
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
