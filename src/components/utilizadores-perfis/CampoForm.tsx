// Peças de campo dos formulários: rótulo com "obrigatório" dito em texto e a mensagem de erro ligada ao campo.
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Label } from "@/components/ui/label";

/** Rótulo visível; o asterisco é só para a vista, o leitor de ecrã ouve "(obrigatório)". */
export function RotuloCampo({ para, texto, obrigatorio }: { para: string; texto: string; obrigatorio?: boolean }) {
  const { t } = useTranslation();
  return (
    <Label htmlFor={para}>
      {texto}
      {obrigatorio && (
        <>
          <span aria-hidden="true"> *</span>
          <span className="sr-only"> ({t("usersProfiles.form.required")})</span>
        </>
      )}
    </Label>
  );
}

/** A mensagem de erro de um campo, em ícone e texto; `codigo` é o do validador (required, format...). */
export function ErroCampo({ id, campo, codigo }: { id: string; campo: string; codigo: string | undefined }) {
  const { t } = useTranslation();
  if (!codigo) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {t(`usersProfiles.form.error.${campo}.${codigo}`)}
    </p>
  );
}

export const AJUDA_CAMPO = "text-sm text-muted-foreground";
