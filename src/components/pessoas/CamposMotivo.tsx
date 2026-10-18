// O motivo de encerrar a abordagem: um da lista fixa, ou «Outro» com o texto escrito à mão. Partilhado pela chamada («sem interesse»), pelo
// painel «Encerrar a abordagem» e pelo resultado da visita. O erro diz-se em texto, ligado ao campo, sem depender da cor.
import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FOCO } from "@/components/negocio-metas/estilos";
import { MAX_MOTIVO_OUTRO, MOTIVOS_ENCERRAMENTO } from "./acoesEncerrar";
import { MensagemErro } from "./CamposDataHora";
import type { MotivoEncerramento } from "./pessoasTipos";

/** O que pode estar mal no motivo: falta escolher um, ou o «Outro» está sem texto. */
export type ErroMotivo = "motivoVazio" | "outroVazio";

interface CamposMotivoProps {
  motivo: MotivoEncerramento | "";
  motivoOutro: string;
  erro: ErroMotivo | null;
  aoMudar: (parcial: { motivo?: MotivoEncerramento | ""; motivoOutro?: string }) => void;
  /** O rótulo do seletor; sem ele, «Motivo». */
  rotulo?: string;
}

const rotuloDoMotivo = (t: ReturnType<typeof useTranslation>["t"], m: string): string =>
  t(m === "outro" ? "pessoasPagina.close.reason.other" : `pessoasPagina.lost.${m}`);

export function CamposMotivo({ motivo, motivoOutro, erro, aoMudar, rotulo }: CamposMotivoProps) {
  const { t } = useTranslation();
  const id = useId();
  const erroMotivo = erro === "motivoVazio" ? t("pessoasPagina.call.error.motivoVazio") : null;
  const erroOutro = erro === "outroVazio" ? t("pessoasPagina.close.error.otherEmpty") : null;
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={id}>{rotulo ?? t("pessoasPagina.call.reason")}</Label>
        <NativeSelect
          id={id} value={motivo} className={cn("min-h-11", erroMotivo && "border-destructive")} placeholder={t("pessoasPagina.call.reasonChoose")}
          aria-invalid={erroMotivo ? true : undefined} aria-describedby={erroMotivo ? `${id}-erro` : undefined}
          options={MOTIVOS_ENCERRAMENTO.map((m) => ({ value: m, label: rotuloDoMotivo(t, m) }))}
          onValueChange={(v) => aoMudar({ motivo: v as MotivoEncerramento })}
        />
        {erroMotivo && <MensagemErro id={`${id}-erro`} texto={erroMotivo} />}
      </div>
      {motivo === "outro" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-outro`}>{t("pessoasPagina.close.reasonOtherLabel")}</Label>
          <Input
            id={`${id}-outro`} value={motivoOutro} maxLength={MAX_MOTIVO_OUTRO} autoComplete="off" className={cn("min-h-11", FOCO)}
            aria-invalid={erroOutro ? true : undefined} aria-describedby={erroOutro ? `${id}-outro-erro` : undefined}
            onChange={(e) => aoMudar({ motivoOutro: e.target.value })}
          />
          {erroOutro && <MensagemErro id={`${id}-outro-erro`} texto={erroOutro} />}
        </div>
      )}
    </div>
  );
}

/** O erro do motivo, para um formulário que o valida: falta escolher um, ou o «Outro» sem texto aparado. */
export function erroDoMotivo(motivo: MotivoEncerramento | "", motivoOutro: string): ErroMotivo | null {
  if (motivo === "") return "motivoVazio";
  return motivo === "outro" && motivoOutro.trim() === "" ? "outroVazio" : null;
}
