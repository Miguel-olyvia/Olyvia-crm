import { useState, type FormEvent } from "react";
import { Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { mascararTelemovel } from "@/lib/supplierContracts/portal";
import { SpMobileField } from "./SpMobileField";
import { useSpMobileInput } from "./useSpMobileInput";

/** «Os meus dados» → telemóvel pessoal do utilizador do portal (para o SMS da assinatura). */
export function SpMyPhoneCard() {
  const { toast } = useToast();
  const mobile = useSpMobileInput({ required: true });
  const [saving, setSaving] = useState(false);

  if (!mobile.available) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const ok = await mobile.save();
    setSaving(false);
    if (ok) toast({ title: "Telemóvel guardado", description: "Os códigos SMS da assinatura de contratos seguem para este número." });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" aria-hidden="true" />
          O seu telemóvel
        </CardTitle>
        <CardDescription>
          {mobile.saved ? `Atual: ${mascararTelemovel(mobile.saved)}` : "Ainda não indicou o seu telemóvel."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          <SpMobileField
            id="sp-profile-mobile"
            label="Telemóvel"
            value={mobile.value}
            onChange={mobile.setValue}
            error={mobile.error}
            disabled={saving || mobile.loading}
            required
          />
          <div className="flex justify-end">
            <Button type="submit" className="h-11 w-full sm:w-auto gap-2" disabled={saving || mobile.loading}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {saving ? "A guardar…" : "Guardar telemóvel"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
