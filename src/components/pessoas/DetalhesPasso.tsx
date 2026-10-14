// O que o passo escolhido ainda pede: o dia e a hora (visita e "ligar numa data"), mais a morada da visita, ou o motivo ao
// perder. Aparece logo por baixo do "E agora?", sem diálogo.
import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { CamposDataHora, MensagemErro } from "./CamposDataHora";
import { type ErrosChamada } from "./chamadaPassos";
import { MoradaVisitaCampos } from "./MoradaVisitaCampos";
import type { ErroMoradaVisita } from "./moradaVisita";
import { MOTIVOS_PERDA } from "./opcoesPessoa";
import type { MoradaVisita } from "./pessoasTipos";
import type { CamposChamada } from "./useFormChamada";

const C = "pessoasPagina.call.";

interface DetalhesPassoProps {
  campos: CamposChamada;
  erros: ErrosChamada;
  /** A morada que a lead indicou (`null` sem morada) e o erro da morada da visita, depois de tentar guardar. */
  moradaLead: MoradaVisita | null;
  erroMorada: ErroMoradaVisita | null;
  hoje: string;
  aoMudar: (parcial: Partial<CamposChamada>) => void;
}

function Motivo({ campos, erros, aoMudar }: Pick<DetalhesPassoProps, "campos" | "erros" | "aoMudar">) {
  const { t } = useTranslation();
  const id = useId();
  const erro = erros.motivo ? t(`${C}error.${erros.motivo}`) : null;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t(`${C}reason`)}</Label>
      <NativeSelect
        id={id} value={campos.motivo} className={cn("min-h-11", erro && "border-destructive")} placeholder={t(`${C}reasonChoose`)}
        aria-invalid={erro ? true : undefined} aria-describedby={erro ? `${id}-erro` : undefined}
        options={MOTIVOS_PERDA.map((m) => ({ value: m, label: t(`pessoasPagina.lost.${m}`) }))}
        onValueChange={(v) => aoMudar({ motivo: v as CamposChamada["motivo"] })}
      />
      {erro && <MensagemErro id={`${id}-erro`} texto={erro} />}
    </div>
  );
}

export function DetalhesPasso({ campos, erros, moradaLead, erroMorada, hoje, aoMudar }: DetalhesPassoProps) {
  const { t } = useTranslation();
  const id = useId();
  if (campos.passo === "perder") return <Motivo campos={campos} erros={erros} aoMudar={aoMudar} />;
  if (campos.passo !== "marcarVisita" && campos.passo !== "ligarData") return null;
  const visita = campos.passo === "marcarVisita";
  return (
    <div role="group" aria-labelledby={`${id}-titulo`} className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <p id={`${id}-titulo`} className="text-sm font-semibold text-foreground">{t(visita ? `${C}whenVisit` : `${C}whenCall`)}</p>
      <CamposDataHora
        id={id} data={campos.data} hora={campos.hora} hoje={hoje} rotuloData={t(`${C}date`)} rotuloHora={t(`${C}time`)}
        erroData={erros.data ? t(`${C}error.${erros.data}`) : null} erroHora={erros.hora ? t(`${C}error.${erros.hora}`) : null}
        aoMudar={aoMudar}
      />
      {visita && (
        <MoradaVisitaCampos
          id={`${id}-morada`} moradaLead={moradaLead} valor={campos.destino} erro={erroMorada} aoMudar={(destino) => aoMudar({ destino })}
        />
      )}
    </div>
  );
}
