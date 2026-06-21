import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CatalogItem {
  id: string;
  descricao: string;
  custo_material: number;
  custo_mao_obra: number;
  margem_default: number;
  iva_default: number;
  int_default: number;
}

interface QuoteLine {
  catalog_item_id: string;
  qt: number;
  margem_percent: number;
  iva_percent: number;
  int_percent: number;
  custo_material_unit: number;
  custo_mao_obra_unit: number;
}

interface QuoteSectionProps {
  items: CatalogItem[];
  lines: QuoteLine[];
  onLineChange: (itemId: string, field: string, value: any) => void;
  getLineValue: (itemId: string, field: string) => any;
}

export function QuoteSection({
  items,
  lines,
  onLineChange,
  getLineValue,
}: QuoteSectionProps) {
  const calculateLineTotal = (item: CatalogItem) => {
    const qt = getLineValue(item.id, "qt") || 0;
    if (qt === 0) return 0;

    const margem = getLineValue(item.id, "margem_percent") || item.margem_default;
    const int = getLineValue(item.id, "int_percent") || item.int_default;
    const iva = getLineValue(item.id, "iva_percent") || item.iva_default;

    const custoUnit = item.custo_material + item.custo_mao_obra;
    const precoSemIva =
      custoUnit * (1 + margem / 100) * (1 + int / 100) * qt;
    const ivaValor = precoSemIva * (iva / 100);

    return precoSemIva + ivaValor;
  };

  if (items.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No items in this category
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Description</TableHead>
            <TableHead className="w-[80px]">QTY</TableHead>
            <TableHead className="w-[100px]">Cost Mat.</TableHead>
            <TableHead className="w-[100px]">Cost Labor</TableHead>
            <TableHead className="w-[80px]">Margin %</TableHead>
            <TableHead className="w-[80px]">VAT %</TableHead>
            <TableHead className="w-[80px]">Int. %</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const qt = getLineValue(item.id, "qt") || 0;
            const total = calculateLineTotal(item);

            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.descricao}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={qt}
                    onChange={(e) =>
                      onLineChange(item.id, "qt", Number(e.target.value))
                    }
                    className="w-full"
                  />
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    €{item.custo_material.toFixed(2)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    €{item.custo_mao_obra.toFixed(2)}
                  </span>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={
                      getLineValue(item.id, "margem_percent") ||
                      item.margem_default
                    }
                    onChange={(e) =>
                      onLineChange(
                        item.id,
                        "margem_percent",
                        Number(e.target.value)
                      )
                    }
                    className="w-full"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={
                      getLineValue(item.id, "iva_percent") || item.iva_default
                    }
                    onChange={(e) =>
                      onLineChange(item.id, "iva_percent", Number(e.target.value))
                    }
                    className="w-full"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={
                      getLineValue(item.id, "int_percent") || item.int_default
                    }
                    onChange={(e) =>
                      onLineChange(item.id, "int_percent", Number(e.target.value))
                    }
                    className="w-full"
                  />
                </TableCell>
                <TableCell className="text-right font-medium">
                  {qt > 0 ? `€${total.toFixed(2)}` : "-"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
