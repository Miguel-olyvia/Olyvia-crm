/**
 * Os anexos simulados da justificação: escolhem-se ficheiros, guardam-se só os NOMES (no máximo 4) e nada se envia.
 * Cada nome tem o seu botão de remover, com alvo de 44 px e o nome no rótulo.
 */
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_ANEXOS_JUSTIFICACAO } from "@/components/rh-exemplo/lib/justificacaoDia";
import { useTranslation } from "@/hooks/useTranslation";
import { MensagemDeErro } from "./MensagemDeErro";

interface Props {
  base: string;
  anexos: readonly string[];
  erro?: string;
  /** Os ids que descrevem o campo (ajuda e erro), já juntos. */
  descritoPor?: string;
  aoEscolher: (nomes: string[]) => void;
  aoRemover: (indice: number) => void;
}

export function CampoAnexosSimulados({ base, anexos, erro, descritoPor, aoEscolher, aoRemover }: Props) {
  const { t } = useTranslation();
  const params = { max: String(MAX_ANEXOS_JUSTIFICACAO) };
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${base}-anexos`}>{t("rhJust.form.anexos", params)}</Label>
      <Input
        id={`${base}-anexos`} type="file" multiple className="min-h-11" disabled={anexos.length >= MAX_ANEXOS_JUSTIFICACAO}
        aria-describedby={descritoPor}
        onChange={(e) => { aoEscolher(Array.from(e.target.files ?? [], (f) => f.name)); e.target.value = ""; }}
      />
      <p id={`${base}-anexos-ajuda`} className="text-xs text-muted-foreground">{t("rhJust.form.anexosAjuda")}</p>
      <MensagemDeErro id={`${base}-anexos-erro`} erro={erro} params={params} />
      {anexos.length > 0 && (
        <ul aria-label={t("rhJust.form.anexosLista")} className="space-y-1 text-sm">
          {anexos.map((nome, i) => (
            <li key={`${nome}-${i}`} className="flex items-center gap-2">
              <span className="break-all">{nome}</span>
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={t("rhJust.form.remover", { nome })} onClick={() => aoRemover(i)}>
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
