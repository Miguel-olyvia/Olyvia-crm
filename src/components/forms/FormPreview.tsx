import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Monitor, Tablet, Smartphone, ExternalLink } from "lucide-react";

interface FormPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  formName: string;
  formSlug: string;
}

export function FormPreview({ open, onOpenChange, formId, formName, formSlug }: FormPreviewProps) {
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  
  const previewUrl = `${window.location.origin}/form/${formId}`;
  
  const getDeviceWidth = () => {
    switch (device) {
      case "mobile": return "375px";
      case "tablet": return "768px";
      default: return "100%";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-6xl max-h-[95vh] sm:max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-3 sm:p-4 border-b flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <DialogTitle className="text-sm sm:text-base truncate">
              Pré-visualização - {formName}
            </DialogTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 border rounded-lg p-1">
                <Button
                  variant={device === "desktop" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setDevice("desktop")}
                  className="h-8 w-8 p-0"
                >
                  <Monitor className="h-4 w-4" />
                </Button>
                <Button
                  variant={device === "tablet" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setDevice("tablet")}
                  className="h-8 w-8 p-0"
                >
                  <Tablet className="h-4 w-4" />
                </Button>
                <Button
                  variant={device === "mobile" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setDevice("mobile")}
                  className="h-8 w-8 p-0"
                >
                  <Smartphone className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" asChild className="h-8 text-xs sm:text-sm">
                <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Abrir em Nova Janela</span>
                  <span className="sm:hidden">Abrir</span>
                </a>
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex justify-center items-start p-2 sm:p-4 bg-muted/50 overflow-auto h-[calc(95vh-100px)] sm:h-[calc(90vh-80px)]">
          <div 
            className="bg-background overflow-hidden transition-all duration-300"
            style={{ 
              width: getDeviceWidth(), 
              maxWidth: "100%",
              minWidth: device === "mobile" ? "320px" : undefined 
            }}
          >
            <iframe
              src={previewUrl}
              className="w-full border-0"
              style={{ 
                height: device === "mobile" ? "667px" : device === "tablet" ? "800px" : "700px",
                minHeight: "500px"
              }}
              title={`Preview of ${formName}`}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
