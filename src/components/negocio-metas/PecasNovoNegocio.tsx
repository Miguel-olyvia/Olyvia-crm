import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Label } from "@/components/ui/label";

/** O prefixo das chaves de texto de "Novo negócio". */
export const N = "businessGoals.new.";
/** Uma opção de lista com alvo de 44 px. */
export const ITEM = "min-h-11 cursor-pointer";

/** A mensagem de erro de um campo: ícone e texto (a cor nunca é o único sinal), ligada ao campo por aria-describedby. */
export function ErroDoCampo({ id, chave }: { id: string; chave: string | undefined }) {
  const { t } = useTranslation();
  if (!chave) return null;
  return (
    <p id={id} className="flex items-center gap-1.5 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      {t(`${N}${chave}`)}
    </p>
  );
}

/** Rótulo com "obrigatório" dito em texto (o asterisco é só para a vista). */
export function Rotulo({ para, texto, obrigatorio }: { para: string; texto: string; obrigatorio?: boolean }) {
  const { t } = useTranslation();
  return (
    <Label htmlFor={para}>
      {texto}
      {obrigatorio && (
        <>
          <span aria-hidden="true"> *</span>
          <span className="sr-only"> ({t(`${N}required`)})</span>
        </>
      )}
    </Label>
  );
}
