// A aba «Geral» do «Novo negócio» da ficha real: o título (obrigatório), as notas, a lead a que o negócio corresponde (um seletor quando a
// pessoa tem mais de uma aberta) e «Reabrir a abordagem» quando a lead escolhida tem a abordagem encerrada (sem isso a base recusa: NG002).
// O contacto e a qualificação do protótipo não são do negócio (são da pessoa e do levantamento, P5): ficam só no exemplo.
import type { RefObject } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LeadAbertaCostura } from "@/components/negocio-metas/costuraNegocio";
import { FOCO } from "@/components/negocio-metas/estilos";
import { SeletorLead } from "@/components/negocio-metas/SeletorLead";

const C = "pessoasPagina.neg.create.";
export const MAX_TITULO_NEGOCIO = 200;
export const MAX_NOTAS_NEGOCIO = 5000;

export interface ErrosGeralReal {
  titulo?: boolean;
  reabrir?: boolean;
}

interface Props {
  id: string;
  titulo: string;
  notas: string;
  lead: string;
  reabrir: boolean;
  leads: readonly LeadAbertaCostura[];
  erros: ErrosGeralReal;
  tituloRef: RefObject<HTMLInputElement>;
  reabrirRef: RefObject<HTMLInputElement>;
  aoMudar: (parcial: { titulo?: string; notas?: string; lead?: string; reabrir?: boolean }) => void;
}

/** O erro de um campo: ícone e texto (a cor nunca é o único sinal), ligado ao campo por aria-describedby. */
function Erro({ id, texto }: { id: string; texto: string }) {
  return (
    <p id={id} role="alert" className="flex items-center gap-1.5 text-sm text-foreground">
      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      {texto}
    </p>
  );
}

export function AbaGeralNovoNegocioReal({ id, titulo, notas, lead, reabrir, leads, erros, tituloRef, reabrirRef, aoMudar }: Props) {
  const { t } = useTranslation();
  const escolhida = leads.find((l) => l.id === lead);
  const pedeReabrir = escolhida?.encerrada === true;
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-titulo`}>
          {t(`${C}name`)}
          <span aria-hidden="true"> *</span>
          <span className="sr-only"> ({t("businessGoals.new.required")})</span>
        </Label>
        <Input
          ref={tituloRef} id={`${id}-titulo`} value={titulo} maxLength={MAX_TITULO_NEGOCIO} autoComplete="off" data-foco-inicial=""
          aria-required="true" aria-invalid={erros.titulo ? true : undefined} aria-describedby={erros.titulo ? `${id}-titulo-erro` : `${id}-titulo-dica`}
          className={cn("min-h-11", FOCO, erros.titulo && "border-destructive")} onChange={(e) => aoMudar({ titulo: e.target.value })}
        />
        <p id={`${id}-titulo-dica`} className="text-sm text-muted-foreground">{t(`${C}name.hint`)}</p>
        {erros.titulo && <Erro id={`${id}-titulo-erro`} texto={t(`${C}name.error`)} />}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-notas`}>{t(`${C}notes`)}</Label>
        <Textarea
          id={`${id}-notas`} value={notas} maxLength={MAX_NOTAS_NEGOCIO} rows={4} className={FOCO} onChange={(e) => aoMudar({ notas: e.target.value })}
        />
      </div>
      {leads.length > 1 && <SeletorLead leads={leads} valor={lead} rotulo={t(`${C}lead`)} aoMudar={(v) => aoMudar({ lead: v, reabrir: false })} />}
      {pedeReabrir && (
        <div className="space-y-1.5">
          <div className="flex min-h-11 items-start gap-3 py-1">
            <input
              ref={reabrirRef} id={`${id}-reabrir`} type="checkbox" checked={reabrir} onChange={(e) => aoMudar({ reabrir: e.target.checked })}
              aria-invalid={erros.reabrir ? true : undefined} aria-describedby={`${id}-reabrir-dica${erros.reabrir ? ` ${id}-reabrir-erro` : ""}`}
              className={cn("mt-0.5 h-5 w-5 shrink-0 rounded-sm border-input accent-primary", FOCO)}
            />
            <label htmlFor={`${id}-reabrir`} className="cursor-pointer text-sm font-medium text-foreground">{t(`${C}reopen`)}</label>
          </div>
          <p id={`${id}-reabrir-dica`} className="text-sm text-muted-foreground">{t(`${C}reopen.hint`)}</p>
          {erros.reabrir && <Erro id={`${id}-reabrir-erro`} texto={t(`${C}reopen.error`)} />}
        </div>
      )}
    </div>
  );
}
