import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

interface ServicePriceHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceId: string;
  serviceName: string;
}

interface PriceHistory {
  id: string;
  price_type: string;
  old_price: number;
  new_price: number;
  currency: string;
  changed_at: string;
  changed_by: string;
}

const priceTypeLabels: Record<string, string> = {
  purchase: "Compra",
  retail: "Retalho",
  wholesale: "Grossista",
  distributor: "Distribuidor",
  promotional: "Promocional",
};

export default function ServicePriceHistoryDialog({
  open,
  onOpenChange,
  serviceId,
  serviceName,
}: ServicePriceHistoryDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<PriceHistory[]>([]);

  useEffect(() => {
    if (open && serviceId) {
      loadHistory();
    }
  }, [open, serviceId]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("service_price_history")
        .select("*")
        .eq("service_id", serviceId)
        .order("changed_at", { ascending: false });

      if (error) throw error;

      setHistory(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar histórico",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: currency || "EUR",
    }).format(price);
  };

  const getPriceChange = (oldPrice: number, newPrice: number) => {
    const change = newPrice - oldPrice;
    const percentChange = (change / oldPrice) * 100;
    return { change, percentChange };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            Histórico de Preços - {serviceName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum histórico de preços disponível
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Preço Anterior</TableHead>
                <TableHead>Novo Preço</TableHead>
                <TableHead>Variação</TableHead>
                <TableHead>Alterado Por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((item) => {
                const priceChange = getPriceChange(item.old_price, item.new_price);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {format(new Date(item.changed_at), "dd/MM/yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {priceTypeLabels[item.price_type] || item.price_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatPrice(item.old_price, item.currency)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatPrice(item.new_price, item.currency)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span
                          className={
                            priceChange.change > 0
                              ? "text-green-600"
                              : priceChange.change < 0
                              ? "text-red-600"
                              : ""
                          }
                        >
                          {priceChange.change > 0 ? "+" : ""}
                          {formatPrice(priceChange.change, item.currency)}
                        </span>
                        <span
                          className={`text-xs ${
                            priceChange.percentChange > 0
                              ? "text-green-600"
                              : priceChange.percentChange < 0
                              ? "text-red-600"
                              : ""
                          }`}
                        >
                          ({priceChange.percentChange > 0 ? "+" : ""}
                          {priceChange.percentChange.toFixed(1)}%)
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.changed_by}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
