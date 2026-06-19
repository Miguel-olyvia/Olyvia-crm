import { useState, useEffect } from "react";
import { 
  Mail, Eye, Clock, MapPin, Monitor, Smartphone, Tablet,
  XCircle, Globe, Calendar, User
} from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface QuoteSend {
  id: string;
  sent_at: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string | null;
  status: string;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  location_country: string | null;
  location_city: string | null;
  total_view_time_seconds: number;
}

interface QuoteSendHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string | null;
  quoteTitle?: string;
}

export function QuoteSendHistory({ 
  open, 
  onOpenChange, 
  quoteId,
  quoteTitle 
}: QuoteSendHistoryProps) {
  const [sends, setSends] = useState<QuoteSend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && quoteId) {
      loadSendHistory();
    }
  }, [open, quoteId]);

  const loadSendHistory = async () => {
    if (!quoteId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("quote_sends")
        .select("*")
        .eq("quote_id", quoteId)
        .order("sent_at", { ascending: false });

      if (error) throw error;
      setSends(data || []);
    } catch (error) {
      console.error("Error loading quote send history:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDeviceIcon = (deviceType: string | null) => {
    switch (deviceType?.toLowerCase()) {
      case "mobile":
        return <Smartphone className="h-4 w-4" />;
      case "tablet":
        return <Tablet className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Histórico de Envios
            {quoteTitle && (
              <span className="text-muted-foreground font-normal text-sm">
                - {quoteTitle}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <OlyviaLoader size={40} />
            </div>
          ) : sends.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Nenhum envio registado</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sends.map((send, index) => (
                <div key={send.id}>
                  {index > 0 && <Separator className="my-4" />}
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {send.recipient_name || send.recipient_email}
                          </span>
                          {send.recipient_name && (
                            <span className="text-sm text-muted-foreground">
                              ({send.recipient_email})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(send.sent_at), "dd MMM yyyy 'às' HH:mm", { locale: pt })}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {send.open_count > 0 ? (
                          <Badge variant="default" className="bg-green-600">
                            <Eye className="h-3 w-3 mr-1" />
                            Visto {send.open_count}x
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <XCircle className="h-3 w-3 mr-1" />
                            Não visto
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Tracking details */}
                    {send.first_opened_at && (
                      <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-muted-foreground">Primeira visualização:</span>
                            <div className="font-medium">
                              {format(new Date(send.first_opened_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                            </div>
                          </div>
                          {send.last_opened_at && send.last_opened_at !== send.first_opened_at && (
                            <div>
                              <span className="text-muted-foreground">Última visualização:</span>
                              <div className="font-medium">
                                {format(new Date(send.last_opened_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-4">
                          {send.total_view_time_seconds > 0 && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span>Tempo total: {formatDuration(send.total_view_time_seconds)}</span>
                            </div>
                          )}
                          
                          {send.device_type && (
                            <div className="flex items-center gap-1">
                              {getDeviceIcon(send.device_type)}
                              <span>{send.device_type}</span>
                              {send.browser && <span className="text-muted-foreground">({send.browser})</span>}
                            </div>
                          )}

                          {(send.location_city || send.location_country) && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span>
                                {[send.location_city, send.location_country].filter(Boolean).join(", ")}
                              </span>
                            </div>
                          )}

                          {send.ip_address && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Globe className="h-3 w-3" />
                              <span>{send.ip_address}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Subject */}
                    {send.subject && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Assunto:</span>{" "}
                        {send.subject}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
