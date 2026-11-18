import { useId, useState } from "react";
import { Check, ChevronDown, Equal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { useNomeParaFrase } from "./nomeParaFrase";
import type { EstadoDeVerificacao, LinhaDeVerificacao } from "./versoesDoTemplate";

interface Props {
  linhas: LinhaDeVerificacao[];
  /** Código do idioma base (o texto que se mostra ao lado). */
  base: string;
}

const ESTILO: Record<EstadoDeVerificacao, { classe: string; Icone: typeof Check }> = {
  traduzido: { classe: "text-emerald-700 dark:text-emerald-400", Icone: Check },
  igual: { classe: "text-amber-700 dark:text-amber-400", Icone: Equal },
  falta: { classe: "text-destructive", Icone: X },
};

/**
 * O que falta traduzir na versão ativa: um estado por texto (escrito por extenso, não só por cor) e, num
 * painel recolhível, o texto no idioma base ao lado. Sem linhas (idioma base) não mostra nada.
 */
export function ListaDeVerificacaoDaVersao({ linhas, base }: Props) {
  const { t } = useTranslation();
  const nomeParaFrase = useNomeParaFrase();
  const titulo = useId();
  const lista = useId();
  const [aberto, setAberto] = useState(false);

  if (linhas.length === 0) return null;
  const nomeBase = nomeParaFrase(base);
  const tudoFeito = linhas.every((l) => l.estado === "traduzido");

  return (
    <section aria-labelledby={titulo} className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={titulo} className="text-sm font-semibold">{t("contractTemplates.versoes.checklist.titulo")}</h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 gap-1 text-xs"
          aria-expanded={aberto}
          aria-controls={lista}
          onClick={() => setAberto((v) => !v)}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", aberto && "rotate-180")} aria-hidden="true" />
          {t(aberto ? "contractTemplates.versoes.checklist.esconderBase" : "contractTemplates.versoes.checklist.mostrarBase", { base: nomeBase })}
        </Button>
      </div>

      {tudoFeito && <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("contractTemplates.versoes.checklist.completo")}</p>}

      <ul id={lista} className="space-y-2">
        {linhas.map((linha) => {
          const { classe, Icone } = ESTILO[linha.estado];
          const nome = t(`contractTemplates.versoes.checklist.${linha.chave}`);
          return (
            <li key={linha.chave} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Icone className={cn("h-4 w-4 shrink-0", classe)} aria-hidden="true" />
                <span>{linha.pendentes > 1 ? `${nome} (${linha.pendentes})` : nome}</span>{" "}
                <span className={cn("text-xs font-medium", classe)}>{t(`contractTemplates.versoes.checklist.${linha.estado}`, { base: nomeBase })}</span>
              </div>
              {aberto && linha.textoBase && (
                <blockquote lang={base} className="mt-1 max-h-24 overflow-auto rounded border-l-2 border-muted-foreground/30 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                  {linha.textoBase}
                </blockquote>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
