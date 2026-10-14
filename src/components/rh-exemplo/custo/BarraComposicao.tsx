/**
 * A composição do custo de um mês numa barra empilhada, sempre com texto: cada parte tem nome, valor e percentagem escritos
 * (a cor sozinha não diz nada). A barra é só decoração (`aria-hidden`); quem lê o ecrã ouve a lista.
 */
import type { ChaveParte, ParteCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";
import { useTranslation } from "@/hooks/useTranslation";
import { euros, pct } from "./formato";

/** Uma cor por parte; o texto ao lado é que diz o que é cada uma (a cor não é o único indicador). */
const ESTILO: Record<ChaveParte, string> = {
  retribuicao: "bg-primary",
  avulsos: "bg-amber-500 dark:bg-amber-400",
  encargos: "bg-sky-600 dark:bg-sky-400",
  seguro: "bg-emerald-600 dark:bg-emerald-400",
  equipamentos: "bg-rose-600 dark:bg-rose-400",
};

interface Props {
  partes: ParteCusto[];
  /** `mini` mostra só a barra e o texto da maior parte; `completa` lista todas as partes. */
  variante?: "mini" | "completa";
  titulo: string;
}

export function BarraComposicao({ partes, variante = "completa", titulo }: Props) {
  const { t } = useTranslation();
  const visiveis = partes.filter((p) => p.valor > 0);
  if (visiveis.length === 0) return <span className="text-xs text-muted-foreground">{t("rhCustos.comp.semValor")}</span>;
  const maior = visiveis.reduce((a, b) => (b.pct > a.pct ? b : a));
  // Na variante mini a barra vive dentro de um botão: só elementos de texto (`span`) são válidos ali.
  const Raiz = variante === "mini" ? "span" : "div";
  return (
    <Raiz className="block space-y-1.5">
      <span aria-hidden="true" className="flex h-2 w-full min-w-24 overflow-hidden rounded-full bg-muted">
        {visiveis.map((p) => <span key={p.chave} className={ESTILO[p.chave]} style={{ width: `${p.pct}%` }} />)}
      </span>
      {variante === "mini" ? (
        <span className="block text-xs tabular-nums text-muted-foreground">{t(`rhCustos.comp.${maior.chave}`)} {pct(maior.pct)}</span>
      ) : (
        <ul aria-label={titulo} className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {visiveis.map((p) => (
            <li key={p.chave} className="flex items-center gap-2">
              <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-sm ${ESTILO[p.chave]}`} />
              <span className="font-medium">{t(`rhCustos.comp.${p.chave}`)}</span>
              <span className="ml-auto tabular-nums text-muted-foreground">{euros(p.valor, "—")} · {pct(p.pct)}</span>
            </li>
          ))}
        </ul>
      )}
    </Raiz>
  );
}
