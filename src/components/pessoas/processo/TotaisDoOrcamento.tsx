// Os totais do orçamento no editor: sem IVA, IVA (6 % na mão de obra, 23 % nos materiais), margem e total. Mudam a cada tecla; não são
// uma região live (anunciar cada tecla seria ruído): quem não vê o ecrã ouve "Total X, margem Y %" numa região de estado só para
// leitores de ecrã, atualizada ao fim de cerca de 1 s depois da última alteração. O resultado completo diz-se na verificação.
import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { eur, pct } from "./formatoOrcamento";
import type { TotaisOrcamento } from "./orcamentoCalculo";

const P = "pessoasPagina.quote.totals.";
/** Quanto tempo o texto tem de estar quieto para o leitor de ecrã o dizer. */
const ATRASO_ANUNCIO_MS = 1000;

/** O texto, mas só depois de ficar `ATRASO_ANUNCIO_MS` sem mudar (começa com o de agora, sem anunciar nada ao abrir). */
function useTextoQuieto(texto: string): string {
  const [quieto, setQuieto] = useState(texto);
  useEffect(() => {
    const temporizador = setTimeout(() => setQuieto(texto), ATRASO_ANUNCIO_MS);
    return () => clearTimeout(temporizador);
  }, [texto]);
  return quieto;
}

export function TotaisDoOrcamento({ totais }: { totais: TotaisOrcamento }) {
  const { t } = useTranslation();
  const anuncio = useTextoQuieto(t(`${P}announce`, { total: eur(totais.total), margin: pct(totais.margem) }));
  return (
    <div role="group" aria-label={t(`${P}label`)} className="rounded-lg border border-border p-3">
      <p role="status" className="sr-only">{anuncio}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm text-foreground">
        <dt>{t(`${P}net`)}</dt>
        <dd className="text-right tabular-nums">{eur(totais.semIva)}</dd>
        <dt>{t(`${P}vat`)}</dt>
        <dd className="text-right tabular-nums">{eur(totais.iva)}</dd>
        <dt>{t(`${P}margin`)}</dt>
        <dd className="text-right tabular-nums">{pct(totais.margem)}</dd>
        <dt className="border-t border-border pt-1 text-base font-semibold">{t(`${P}total`)}</dt>
        <dd className="border-t border-border pt-1 text-right text-base font-semibold tabular-nums">{eur(totais.total)}</dd>
      </dl>
    </div>
  );
}
