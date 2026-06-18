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
import { useTranslation } from "@/hooks/useTranslation";

interface ProductPriceHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
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

interface PriceHistoryDisplay extends PriceHistory {
  changed_by_name?: string | null;
}

export default function ProductPriceHistoryDialog({
  open,
  onOpenChange,
  productId,
  productName,
}: ProductPriceHistoryDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<PriceHistoryDisplay[]>([]);

  useEffect(() => {
    if (open && productId) {
      loadHistory();
    }
  }, [open, productId]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("product_price_history")
        .select("id, price_type, old_price, new_price, currency, changed_at, changed_by")
        .eq("product_id", productId)
        .order("changed_at", { ascending: false });

      if (error) throw error;

      const userIds = [...new Set((data || []).map((item) => item.changed_by).filter(Boolean))];
      const userNameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("anew_users")
          .select("id, name")
          .in("id", userIds);

        users?.forEach((user: any) => {
          if (user.id) userNameMap.set(user.id, user.name || user.id);
        });
      }

      setHistory((data || []).map((item) => ({
        ...item,
        changed_by_name: userNameMap.get(item.changed_by) || item.changed_by,
      })));
    } catch (error: any) {
      toast({
        title: t('priceHistory.toast.loadError'),
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

  const getPriceTypeLabel = (priceType: string) => {
    const key = `priceHistory.priceType.${priceType}` as const;
    return t(key) || priceType;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {t('priceHistory.title').replace('{{name}}', productName)}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t('priceHistory.noHistory')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('priceHistory.table.date')}</TableHead>
                <TableHead>{t('priceHistory.table.type')}</TableHead>
                <TableHead>{t('priceHistory.table.oldPrice')}</TableHead>
                <TableHead>{t('priceHistory.table.newPrice')}</TableHead>
                <TableHead>{t('priceHistory.table.variation')}</TableHead>
                <TableHead>{t('priceHistory.table.changedBy')}</TableHead>
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
                        {getPriceTypeLabel(item.price_type)}
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
                      {item.changed_by_name || item.changed_by}
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