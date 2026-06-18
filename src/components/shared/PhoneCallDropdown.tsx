import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Phone, PhoneCall, ClipboardList } from "lucide-react";

interface PhoneCallDropdownProps {
  phoneNumber?: string | null;
  phoneCountryCode?: string | null;
  onRegisterActivity: () => void;
  /** Button variant/size customization */
  buttonVariant?: "ghost" | "outline" | "default";
  buttonSize?: "sm" | "icon";
  buttonClassName?: string;
  /** Label next to icon (optional) */
  label?: string;
  /** For leads: "Registar Contacto" instead of "Registar Atividade" */
  registerLabel?: string;
}

export function PhoneCallDropdown({
  phoneNumber,
  phoneCountryCode,
  onRegisterActivity,
  buttonVariant = "outline",
  buttonSize = "sm",
  buttonClassName,
  label,
  registerLabel = "Registar atividade",
}: PhoneCallDropdownProps) {
  const fullNumber = phoneNumber
    ? `${phoneCountryCode || "+351"}${phoneNumber}`.replace(/\s/g, "")
    : null;

  const handleCallAndRegister = () => {
    if (fullNumber) {
      // Use an anchor click to trigger tel: — avoids browser "open app?" popup on desktop
      const a = document.createElement("a");
      a.href = `tel:${fullNumber}`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Show register modal after a short delay
      setTimeout(() => {
        onRegisterActivity();
      }, 600);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={buttonVariant} size={buttonSize} className={buttonClassName}>
          <Phone className="h-3.5 w-3.5" />
          {label && <span className="ml-1">{label}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 z-[9999]">
        <DropdownMenuItem
          disabled={!fullNumber}
          onClick={handleCallAndRegister}
          className="gap-2"
        >
          <PhoneCall className="h-4 w-4" />
          {fullNumber ? (
            <span>Ligar para {fullNumber}</span>
          ) : (
            <span className="text-muted-foreground">Sem número</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onRegisterActivity} className="gap-2">
          <ClipboardList className="h-4 w-4" />
          {registerLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
