import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X, Mail, Star } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

export interface EmailEntry {
  email: string;
  email_type: string;
  is_primary: boolean;
}

interface MultiValueEmailInputProps {
  emails: EmailEntry[];
  onChange: (emails: EmailEntry[]) => void;
  disabled?: boolean;
}

export function MultiValueEmailInput({
  emails,
  onChange,
  disabled = false,
}: MultiValueEmailInputProps) {
  const { t } = useTranslation();
  const [newEmail, setNewEmail] = useState("");
  const [newType, setNewType] = useState("personal");

  const handleAddEmail = () => {
    if (!newEmail.trim()) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) return;
    if (emails.some(e => e.email.toLowerCase() === newEmail.trim().toLowerCase())) return;

    const isPrimary = emails.length === 0;
    onChange([
      ...emails,
      { email: newEmail.trim(), email_type: newType, is_primary: isPrimary },
    ]);
    setNewEmail("");
    setNewType("personal");
  };

  const handleRemoveEmail = (index: number) => {
    const updated = emails.filter((_, i) => i !== index);
    if (updated.length > 0 && !updated.some(e => e.is_primary)) {
      updated[0].is_primary = true;
    }
    onChange(updated);
  };

  const handleSetPrimary = (index: number) => {
    const updated = emails.map((email, i) => ({
      ...email,
      is_primary: i === index,
    }));
    onChange(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Tab") {
      if (newEmail.trim()) {
        e.preventDefault();
        handleAddEmail();
      }
    }
  };

  const handleBlur = () => {
    if (newEmail.trim()) {
      handleAddEmail();
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "personal": return t("users.emailPersonal");
      case "work": return t("users.emailWork");
      case "other": return t("users.emailOther");
      default: return type;
    }
  };

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-muted-foreground" />
        {t("users.emails")} *
      </Label>
      
      {emails.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {emails.map((entry, index) => (
            <Badge
              key={index}
              variant={entry.is_primary ? "default" : "secondary"}
              className="flex items-center gap-1.5 py-1.5 px-3"
            >
              {entry.is_primary && <Star className="w-3 h-3 fill-current" />}
              <span>{entry.email}</span>
              <span className="text-xs opacity-70">({getTypeLabel(entry.email_type)})</span>
              {!entry.is_primary && (
                <Button type="button" variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => handleSetPrimary(index)} disabled={disabled}>
                  <Star className="w-3 h-3" />
                </Button>
              )}
              <Button type="button" variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => handleRemoveEmail(index)} disabled={disabled}>
                <X className="w-3 h-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input type="email" placeholder="email@exemplo.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleBlur} disabled={disabled} className="flex-1" />
        <Select value={newType} onValueChange={setNewType} disabled={disabled}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="personal">{t("users.emailPersonal")}</SelectItem>
            <SelectItem value="work">{t("users.emailWork")}</SelectItem>
            <SelectItem value="other">{t("users.emailOther")}</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="icon" onClick={handleAddEmail} disabled={disabled || !newEmail.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}