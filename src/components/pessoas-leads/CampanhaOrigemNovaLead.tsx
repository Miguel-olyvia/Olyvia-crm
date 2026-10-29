import { ExternalLink, FileText, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { FormularioLido, OrigemLida } from "@/hooks/pessoas/novaLead/leituraNovaLead";
import { useTranslation } from "@/hooks/useTranslation";

const N = "pessoasPagina.real.newLead.";
/** O valor do seletor de origem para «sem fonte específica». */
export const SEM_ORIGEM = "none";

interface CampanhaOrigemProps {
  formularios: readonly FormularioLido[];
  formularioId: string;
  aoMudarFormulario: (id: string) => void;
  /** O nome da campanha ligada ao formulário escolhido; vazio quando o formulário não tem campanha. */
  campanhaNome: string;
  nCamposExtra: number;
  origens: readonly OrigemLida[];
  origemId: string;
  aoMudarOrigem: (id: string) => void;
  aoCriarFormulario: () => void;
}

/** Campanha (opcional), formulário em uso e fonte da lead. Só dados e callbacks. */
export function CampanhaOrigemNovaLead(p: CampanhaOrigemProps) {
  const { t } = useTranslation();
  return (
    <>
      <section aria-labelledby="nl-campanha-titulo" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="nl-campanha-titulo" className="text-sm font-semibold text-foreground">{t(`${N}campaign.title`)}</h3>
          <Button type="button" variant="outline" size="sm" className={`min-h-11 gap-1.5 text-xs ${FOCO}`} onClick={p.aoCriarFormulario}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t(`${N}campaign.createForm`)}
            <ExternalLink className="ml-0.5 h-3 w-3" aria-hidden="true" />
          </Button>
        </div>
        <Label htmlFor="nl-formulario" className="sr-only">{t(`${N}campaign.label`)}</Label>
        <NativeSelect
          id="nl-formulario"
          value={p.formularioId}
          placeholder={t(`${N}campaign.placeholder`)}
          onValueChange={p.aoMudarFormulario}
          options={[
            ...(p.formularioId ? [{ value: "", label: t(`${N}campaign.noCampaign`) }] : []),
            ...p.formularios.map((f) => ({ value: f.id, label: f.name })),
          ]}
        />
        {!p.formularioId && <p className="text-xs text-muted-foreground">{t(`${N}campaign.none`)}</p>}
      </section>

      {p.formularioId && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
          {p.campanhaNome && (
            <p className="flex-1 text-sm">
              <span className="text-muted-foreground">{t(`${N}campaign.linkedCampaign`)}:</span>
              <span className="ml-2 font-medium">{p.campanhaNome}</span>
            </p>
          )}
          <Badge variant="secondary" className="text-xs">{t(`${N}campaign.extraCount`, { n: p.nCamposExtra })}</Badge>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="nl-origem">{t(`${N}source.label`)}</Label>
        <NativeSelect
          id="nl-origem"
          value={p.origemId}
          placeholder={t(`${N}source.placeholder`)}
          onValueChange={p.aoMudarOrigem}
          options={[{ value: SEM_ORIGEM, label: t(`${N}source.none`) }, ...p.origens.map((o) => ({ value: o.id, label: o.name }))]}
        />
      </div>
    </>
  );
}
