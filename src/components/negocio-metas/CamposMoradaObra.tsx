import { Home, MapPin } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErroDoCampo, N, Rotulo } from "./PecasNovoNegocio";
import { FOCO } from "./estilos";
import { moradaDoContacto, type ChaveMorada, type MoradaObraForm } from "./moradaObra";
import type { OrigemMorada } from "./useEstadoNovoNegocio";

interface Props {
  /** A base dos ids dos campos (`<id>-rua`, `<id>-cp`, `<id>-localidade`, `<id>-andar`). */
  id: string;
  valores: MoradaObraForm;
  /** Há erro no código postal (o formato). */
  erroCodigoPostal: boolean;
  /** A morada escrita na aba Geral, para o atalho "Usar a morada do contacto". */
  moradaContacto: string;
  /** Preenchida a partir da visita (igual à morada da lead ou outra): diz-se em texto. `null` = escrita à mão. */
  origem?: OrigemMorada;
  aoMudar: (chave: ChaveMorada, valor: string) => void;
  aoPreencher: (morada: MoradaObraForm) => void;
}

const CAMPO = cn("min-h-11", FOCO);

/** A morada da obra (fica no negócio, não na pessoa): rua, código postal 0000-000, localidade e andar, com o atalho de usar a morada do contacto. */
export function MoradaObra({ id, valores, erroCodigoPostal, moradaContacto, origem = null, aoMudar, aoPreencher }: Props) {
  const { t } = useTranslation();
  const usarContacto = () => {
    if (moradaContacto.trim() === "") {
      toast.info(t(`${N}address.useContact.empty`));
      return;
    }
    aoPreencher(moradaDoContacto(moradaContacto));
    toast.info(t(`${N}address.useContact.done`));
  };
  return (
    <section aria-labelledby={`${id}-morada`} className="space-y-3">
      <h3 id={`${id}-morada`} className="text-sm font-semibold text-foreground">{t(`${N}address.title`)}</h3>
      <p className="text-sm text-muted-foreground">{t(`${N}address.note`)}</p>
      {origem && (
        <p role="note" className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-sm text-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t(`${N}address.fromVisit.${origem === "visitaIgual" ? "same" : "other"}`)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={usarContacto} className={cn("min-h-11 gap-2", FOCO)}>
          <Home className="h-4 w-4" aria-hidden="true" />
          {t(`${N}address.useContact`)}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Rotulo para={`${id}-rua`} texto={t(`${N}address.street`)} />
          <Input id={`${id}-rua`} value={valores.rua} autoComplete="street-address" className={CAMPO} onChange={(e) => aoMudar("rua", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Rotulo para={`${id}-cp`} texto={t(`${N}address.postal`)} />
          <Input
            id={`${id}-cp`} value={valores.codigoPostal} inputMode="numeric" autoComplete="postal-code" maxLength={8}
            placeholder={t(`${N}address.postal.placeholder`)} aria-invalid={erroCodigoPostal ? true : undefined}
            aria-describedby={erroCodigoPostal ? `${id}-cp-erro` : undefined} className={cn(CAMPO, erroCodigoPostal && "border-destructive")}
            onChange={(e) => aoMudar("codigoPostal", e.target.value)}
          />
          <ErroDoCampo id={`${id}-cp-erro`} chave={erroCodigoPostal ? "error.postal.invalido" : undefined} />
        </div>
        <div className="space-y-1.5">
          <Rotulo para={`${id}-localidade`} texto={t(`${N}address.city`)} />
          <Input id={`${id}-localidade`} value={valores.localidade} autoComplete="address-level2" className={CAMPO} onChange={(e) => aoMudar("localidade", e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Rotulo para={`${id}-andar`} texto={t(`${N}address.unit`)} />
          <Input
            id={`${id}-andar`} value={valores.andar} autoComplete="off" placeholder={t(`${N}address.unit.placeholder`)}
            className={CAMPO} onChange={(e) => aoMudar("andar", e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
