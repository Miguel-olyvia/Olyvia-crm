import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export type ProductKind = "simple" | "component" | "configurable";
const VALID_KINDS: ProductKind[] = ["simple", "component", "configurable"];
const isValidKind = (v: unknown): v is ProductKind =>
  typeof v === "string" && (VALID_KINDS as string[]).includes(v);

const KIND_OPTIONS: { value: ProductKind; label: string; description: string }[] = [
  { value: "simple", label: "Simple", description: "Produto independente, sem componentes nem variantes." },
  { value: "component", label: "Component", description: "Peça que pode ser usada dentro de um produto configurável." },
  { value: "configurable", label: "Configurable", description: "Produto montado a partir de blocos, slots e opções." },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  productSku: string | null;
  currentKind: string | null;
  saving: boolean;
  onSave: (newKind: ProductKind | null) => Promise<void>;
}

export function ProductKindDialog({
  open,
  onOpenChange,
  productName,
  productSku,
  currentKind,
  saving,
  onSave,
}: Props) {
  const [pending, setPending] = useState<ProductKind | "">("");

  useEffect(() => {
    if (open) {
      setPending(isValidKind(currentKind) ? currentKind : "");
    }
  }, [open, currentKind]);

  const dirty = (currentKind ?? "") !== pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Definir tipo de produto</DialogTitle>
          <DialogDescription>
            <strong>{productName}</strong>
            {productSku ? ` · ${productSku}` : ""}
          </DialogDescription>
        </DialogHeader>

        {currentKind && !isValidKind(currentKind) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Tipo inválido (legado)</AlertTitle>
            <AlertDescription className="text-xs">
              Valor atual: <code className="font-mono">{currentKind}</code>. Escolha um dos tipos abaixo.
            </AlertDescription>
          </Alert>
        )}

        <RadioGroup
          value={pending || "__none__"}
          onValueChange={(v) => setPending(v === "__none__" ? "" : (v as ProductKind))}
          className="gap-2"
        >
          <label
            htmlFor="kd-__none__"
            className="flex items-start gap-3 border rounded-md p-3 cursor-pointer hover:bg-accent/50 transition border-dashed"
          >
            <RadioGroupItem value="__none__" id="kd-__none__" className="mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-sm">Sem tipo definido</div>
              <div className="text-xs text-muted-foreground">Use isto se ainda não tem a certeza.</div>
            </div>
          </label>
          {KIND_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              htmlFor={`kd-${opt.value}`}
              className="flex items-start gap-3 border rounded-md p-3 cursor-pointer hover:bg-accent/50 transition"
            >
              <RadioGroupItem value={opt.value} id={`kd-${opt.value}`} className="mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-sm">{opt.label}</div>
                <div className="text-xs text-muted-foreground">{opt.description}</div>
              </div>
            </label>
          ))}
        </RadioGroup>

        <div className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3 py-1">
          Os <strong>conjuntos</strong> (bundles) são geridos em <strong>Catálogo › Bundles</strong>.
          Um produto pode entrar num conjunto e continuar a vender-se sozinho.
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!dirty || saving}
            onClick={() => onSave(pending === "" ? null : pending)}
          >
            {saving ? "A guardar..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { isValidKind, KIND_OPTIONS };
