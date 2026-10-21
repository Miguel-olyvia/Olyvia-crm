import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { TituloPainel } from "./CamposPainel";
import { N } from "./PecasNovoNegocio";
import type { LevantamentoNegocio } from "./negocioMetas";
import { formatarData } from "./negocioPainel";

/**
 * O levantamento escrito ao criar o negócio, só para ler: estado, data e quem fez, a lista de linhas e as observações.
 * Não mostra visitas: diz sempre o seu próprio estado, data e quem fez, haja ou não visitas no negócio.
 */
export function LevantamentoResumo({ levantamento }: { levantamento: LevantamentoNegocio }) {
  const { t } = useTranslation();
  const id = useId();
  const { linhas } = levantamento;
  return (
    <section aria-labelledby={id} className="space-y-1.5">
      <TituloPainel id={id}>{t(`${N}survey.title`)}</TituloPainel>
      <p className="text-sm text-foreground">
        {t(`${N}survey.summary`, {
          estado: t(`${N}survey.status.${levantamento.estado}`), data: formatarData(levantamento.data), quem: levantamento.feitoPor,
        })}
      </p>
      {linhas.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          {linhas.map((l, i) => (
            <li key={i}>
              {t(`${N}survey.item`, { divisao: l.divisao, trabalho: l.trabalho, medida: l.medida, unidade: l.unidade })}
              {l.observacoes && <span className="text-muted-foreground"> ({l.observacoes})</span>}
            </li>
          ))}
        </ul>
      )}
      {levantamento.observacoes && <p className="text-sm text-muted-foreground">{levantamento.observacoes}</p>}
    </section>
  );
}
