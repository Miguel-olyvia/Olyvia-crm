import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MapPin, Building2, Check, Home, Laptop } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

export interface OrgAddressOption {
  id: string;
  street: string;
  number: string;
  floor?: string;
  unit?: string;
  postal_code: string;
  city: string;
  district?: string;
  country: string;
  extra?: string;
  is_fiscal: boolean;
}

interface OrgAddressPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationName: string;
  addresses: OrgAddressOption[];
  onSelect: (address: OrgAddressOption) => void;
  onSkip?: () => void;
  onRemoteWork?: () => void;
}

export function OrgAddressPickerDialog({
  open,
  onOpenChange,
  organizationName,
  addresses,
  onSelect,
  onSkip,
  onRemoteWork,
}: OrgAddressPickerDialogProps) {
  const { t } = useTranslation();
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setSelectedAddressId(addresses.find(a => a.is_fiscal)?.id || addresses[0]?.id || "");
  }, [open, addresses]);

  const formatAddress = (addr: OrgAddressOption) => {
    const parts = [
      addr.street,
      addr.number,
      addr.floor ? `${addr.floor}º` : null,
      addr.unit,
    ].filter(Boolean).join(" ");
    
    const location = [addr.postal_code, addr.city].filter(Boolean).join(" ");
    return { main: parts, location };
  };

  const handleConfirm = () => {
    const selectedAddress = addresses.find(a => a.id === selectedAddressId);
    if (selectedAddress) {
      onSelect(selectedAddress);
    }
    onOpenChange(false);
  };

  const handleSkip = () => {
    onSkip?.();
    onOpenChange(false);
  };

  const handleRemoteWork = () => {
    onRemoteWork?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            {t("users.selectOrgAddress")}
          </DialogTitle>
          <DialogDescription>
            {t("users.selectOrgAddressDesc", { org: organizationName })}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <RadioGroup
            value={selectedAddressId}
            onValueChange={setSelectedAddressId}
            className="space-y-3"
          >
            {addresses.map((addr) => {
              const formatted = formatAddress(addr);
              return (
                <div
                  key={addr.id}
                  className={`relative flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedAddressId === addr.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedAddressId(addr.id)}
                >
                  <RadioGroupItem value={addr.id} id={addr.id} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={addr.id}
                      className="flex items-start gap-2 cursor-pointer"
                    >
                      <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-medium leading-tight">{formatted.main}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatted.location}
                        </p>
                        {addr.extra && (
                          <p className="text-xs text-muted-foreground italic">
                            {addr.extra}
                          </p>
                        )}
                      </div>
                    </Label>
                  </div>
                  {addr.is_fiscal && (
                    <Badge variant="secondary" className="shrink-0">
                      {t("addresses.fiscal")}
                    </Badge>
                  )}
                </div>
              );
            })}
          </RadioGroup>

          {/* Remote Work Option */}
          {onRemoteWork && (
            <div className="pt-2 border-t">
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={handleRemoteWork}
              >
                <Laptop className="w-5 h-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium">{t("users.remoteWork") || "Teletrabalho"}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("users.remoteWorkDesc") || "Trabalha a partir de casa ou remotamente"}
                  </p>
                </div>
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={handleSkip}>
            {t("common.skip")}
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedAddressId}>
            <Check className="w-4 h-4 mr-2" />
            {t("users.useAsWorkAddress")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
