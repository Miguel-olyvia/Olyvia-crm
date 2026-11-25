/**
 * A lista de ativos de um grupo: uma linha (no ecrã largo) ou um cartão empilhado (no telemóvel) por ativo, com só o que decide:
 * nome (com o código por baixo), o que o liga (equipamento do catálogo, pessoa ou local), o valor atual e o estado de relance.
 * Tudo o resto (datas, valor de compra, vida, residual, manutenção, notas) e as ações abrem no detalhe: a linha toda abre-o
 * (alvo de 44 px), pelo botão do nome, que serve o teclado e o leitor de ecrã. Sem scroll horizontal da página.
 */
import { MapPin, UserRound, Wrench, type LucideIcon } from "lucide-react";
import { euros } from "@/components/rh-exemplo/custo/formato";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { EtiquetaEstado } from "./EtiquetaEstado";
import { estadoDoAtivo } from "./lib/resumoAtivo";
import type { Ativo, GrupoAtivo } from "./lib/tipos";
import { valorAtual } from "./lib/valorAtivo";

/** As quatro colunas do ecrã largo: nome, ligação, valor atual, estado. */
const COLUNAS = "md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_8rem_13rem]";

interface Props {
  grupo: GrupoAtivo;
  ativos: readonly Ativo[];
  /** O mês em que se calcula o valor atual («AAAA-MM»). */
  mes: string;
  /** Sem `hr.pessoas.retribuicao.view` os nomes não se mostram, mesmo que venham. */
  rhOculto: boolean;
  aoAbrir: (a: Ativo) => void;
}

function Ligacao({ a, rhOculto }: { a: Ativo; rhOculto: boolean }) {
  const { t } = useTranslation();
  let principal: string | null = null;
  let secundario: string | null = null;
  let Icone: LucideIcon = Wrench;
  if (a.grupo === "servico") {
    principal = a.catEquipamento?.nome ?? null;
  } else if (a.grupo === "estrutura") {
    Icone = MapPin;
    const tipo = a.tipo ? t(`ativos.tipo.estrutura.${a.tipo}`) : null;
    principal = a.localizacao ?? tipo;
    secundario = a.localizacao ? tipo : null;
  } else {
    Icone = UserRound;
    principal = rhOculto ? t("ativos.pessoa.rhOculto") : (a.atribuicao?.pessoaNome ?? null);
    secundario = a.tipo ? t(`ativos.tipo.pessoa.${a.tipo}`) : null;
  }
  if (!principal) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="flex min-w-0 items-start gap-2 text-sm">
      <Icone aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{principal}</span>
        {secundario && <span className="truncate text-xs text-muted-foreground">{secundario}</span>}
      </span>
    </span>
  );
}

export function ListaAtivos({ grupo, ativos, mes, rhOculto, aoAbrir }: Props) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div aria-hidden="true" className={cn("hidden gap-4 px-4 text-xs font-medium text-muted-foreground md:grid", COLUNAS)}>
        <span>{t("ativos.col.nome")}</span>
        <span>{t("ativos.col.liga")}</span>
        <span className="text-right">{t("ativos.col.valorAtual")}</span>
        <span>{t("ativos.col.estado")}</span>
      </div>
      <ul aria-label={t("ativos.lista.legenda", { grupo: t(`ativos.grupo.${grupo}`) })} className="space-y-2">
        {ativos.map((a) => {
          const atual = valorAtual(a, mes);
          return (
            <li
              key={a.id}
              className={cn(
                "relative grid gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50 motion-reduce:transition-none md:items-center md:gap-4",
                "focus-within:ring-2 focus-within:ring-ring", COLUNAS, a.estado === "desativado" && "bg-muted/30",
              )}
            >
              <div className="min-w-0">
                {/* O botão estica-se sobre o cartão todo: a linha inteira abre o detalhe. */}
                <button
                  type="button" aria-label={t("ativos.lista.abrir", { nome: a.nome })} onClick={() => aoAbrir(a)}
                  className={cn("min-h-11 max-w-full rounded-sm text-left text-base font-semibold leading-tight after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none", FOCO)}
                >
                  <span className="break-words">{a.nome}</span>
                </button>
                {a.codigo && <span className="-mt-2 block text-xs text-muted-foreground">{a.codigo}</span>}
              </div>
              <Ligacao a={a} rhOculto={rhOculto} />
              <div className="flex items-baseline justify-between gap-2 md:flex-col md:items-end md:justify-center md:gap-0">
                <span className="text-xs text-muted-foreground md:sr-only">{t("ativos.col.valorAtual")}</span>
                <span data-testid="valor-atual" className={cn("font-semibold tabular-nums", atual === null && "text-sm font-medium text-muted-foreground")}>
                  {atual === null ? t("ativos.vida.semVida") : euros(atual, "—")}
                </span>
              </div>
              <div><EtiquetaEstado estado={estadoDoAtivo(a, rhOculto)} /></div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
