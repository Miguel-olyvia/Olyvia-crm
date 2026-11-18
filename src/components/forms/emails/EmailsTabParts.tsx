import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

/** Valor do seletor para «sem modelo escolhido» (grava null). */
export const TEMPLATE_DEFAULT = "__default__";

interface ExtraEmailsFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

export function ExtraEmailsField({ id, value, onChange }: ExtraEmailsFieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">Emails adicionais a notificar</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ex: comercial@empresa.pt, outro@empresa.pt"
        rows={2}
      />
      <p className="text-[10px] text-muted-foreground">Separe vários emails por vírgula, ponto e vírgula ou linha.</p>
    </div>
  );
}

interface SwitchHeaderProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  small?: boolean;
}

export function SwitchHeader({ id, label, description, checked, onChange, small }: SwitchHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <Label htmlFor={id} className={small ? "text-xs" : undefined}>{label}</Label>
        <p className={small ? "text-[10px] text-muted-foreground" : "text-xs text-muted-foreground"}>{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
