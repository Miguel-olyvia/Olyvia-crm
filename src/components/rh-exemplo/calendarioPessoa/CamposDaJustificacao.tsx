/**
 * Os campos de texto do formulário de justificação (tipo, motivo e hora real), cada um com a sua etiqueta, a sua ajuda e o seu
 * erro ligados por `aria-describedby`. Alvos de 44 px.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TIPOS_JUSTIFICACAO_DIA } from "@/components/rh-exemplo/lib/justificacaoDia";
import { useTranslation } from "@/hooks/useTranslation";
import { MensagemDeErro } from "./MensagemDeErro";

interface CampoProps {
  base: string;
  valor: string;
  erro?: string;
  /** Os ids que descrevem o campo (ajuda e erro), já juntos. */
  descritoPor?: string;
  aoMudar: (valor: string) => void;
  params: Record<string, string>;
}

export function CampoTipo({ base, valor, erro, descritoPor, aoMudar, params }: CampoProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${base}-tipo`}>{t("rhJust.form.tipo")}</Label>
      <NativeSelect
        id={`${base}-tipo`} className="min-h-11" value={valor} placeholder={t("rhJust.form.tipoPlaceholder")}
        aria-invalid={Boolean(erro)} aria-describedby={descritoPor} onValueChange={aoMudar}
        options={TIPOS_JUSTIFICACAO_DIA.map((tipo) => ({ value: tipo, label: t(`rhJust.tipo.${tipo}`) }))}
      />
      <MensagemDeErro id={`${base}-tipo-erro`} erro={erro} params={params} />
    </div>
  );
}

export function CampoMotivo({ base, valor, erro, descritoPor, aoMudar, params }: CampoProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${base}-motivo`}>{t("rhJust.form.motivo")}</Label>
      <Textarea
        id={`${base}-motivo`} rows={3} value={valor} onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={Boolean(erro)} aria-describedby={descritoPor}
      />
      <p id={`${base}-contador`} className="text-xs tabular-nums text-muted-foreground">
        {t("rhJust.form.contador", { n: String(valor.trim().length), ...params })}
      </p>
      <MensagemDeErro id={`${base}-motivo-erro`} erro={erro} params={params} />
    </div>
  );
}

export function CampoHoraReal({ base, valor, erro, descritoPor, aoMudar, params }: CampoProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${base}-hora`}>{t("rhJust.form.horaReal")}</Label>
      <Input
        id={`${base}-hora`} type="time" className="min-h-11" value={valor} onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={Boolean(erro)} aria-describedby={descritoPor}
      />
      <p id={`${base}-hora-ajuda`} className="text-xs text-muted-foreground">{t("rhJust.form.horaRealAjuda")}</p>
      <MensagemDeErro id={`${base}-horaReal-erro`} erro={erro} params={params} />
    </div>
  );
}
