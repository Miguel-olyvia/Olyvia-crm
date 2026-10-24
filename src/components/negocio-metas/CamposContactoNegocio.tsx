import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FOCO } from "./estilos";
import { CHAVES_CONTACTO, type ChaveContacto, type ErrosNovoNegocio } from "./novoNegocio";
import type { DadosContactoNegocio } from "./negocioMetas";

const N = "businessGoals.new.";
const MODO: Partial<Record<ChaveContacto, "numeric" | "email">> = { email: "email", nif: "numeric", nifEmpresa: "numeric" };
const LARGO: ReadonlySet<ChaveContacto> = new Set(["morada"]);

interface Props {
  idBase: string;
  valores: DadosContactoNegocio;
  erros: ErrosNovoNegocio;
  aoMudar: (chave: ChaveContacto, valor: string) => void;
}

/** A secção "Contacto": seis campos opcionais, pré-preenchidos com os da pessoa; 1 coluna em estreito e 2 em largo. */
export function CamposContactoNegocio({ idBase, valores, erros, aoMudar }: Props) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-foreground">{t(`${N}contact`)}</legend>
      <p className="text-sm text-muted-foreground">{t(`${N}contact.hint`)}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CHAVES_CONTACTO.map((chave) => {
          const id = `${idBase}-${chave}`;
          const erro = chave === "email" || chave === "nif" || chave === "nifEmpresa" ? erros[chave] : undefined;
          return (
            <div key={chave} className={cn("space-y-1.5", LARGO.has(chave) && "sm:col-span-2")}>
              <Label htmlFor={id}>{t(`${N}contact.${chave}`)}</Label>
              <Input
                id={id} value={valores[chave]} inputMode={MODO[chave]} autoComplete="off"
                onChange={(e) => aoMudar(chave, e.target.value)} aria-invalid={erro ? true : undefined}
                aria-describedby={erro ? `${id}-erro` : undefined} className={cn("min-h-11", FOCO)}
              />
              {erro && (
                <p id={`${id}-erro`} className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t(`${N}error.${chave}.${erro}`)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
