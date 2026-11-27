/**
 * A lista de ativos de um grupo: uma linha (no ecrã largo) ou um cartão (no telemóvel) por ativo, com só o que decide: o quadrado do
 * ícone do tipo, o nome (com «Comprado» ou «Alugado» e o código por baixo), o que o liga (equipamento do catálogo, pessoa ou local), a
 * micro-barra de vida (quanto já amortizou, ou onde vai o contrato), o valor atual (ou a renda) e o estado de relance. Tudo o resto
 * (datas, valor de compra, residual, manutenção, notas) e as ações abrem no detalhe: a linha toda abre-o (alvo de 44 px), pelo botão do
 * nome, que serve o teclado e o leitor de ecrã. Sem tabela e sem scroll horizontal da página.
 */
import { ChevronRight } from "lucide-react";
import { euros } from "@/components/rh-exemplo/custo/formato";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { EtiquetaEstado } from "./EtiquetaEstado";
import { MARCA_VALOR, TOM_GRUPO, iconeDoAtivo, partirTexto, vidaATerminar, vidaDaLinha, type VidaDaLinha } from "./lib/ativosUi";
import { estadoDoAtivo, motivoSemValor } from "./lib/resumoAtivo";
import type { Ativo, GrupoAtivo } from "./lib/tipos";
import { valorAtual } from "./lib/valorAtivo";

/** As colunas do ecrã largo: ativo, ligação, vida, valor, estado e a seta. */
const COLUNAS = "md:grid-cols-[minmax(0,2.3fr)_minmax(0,1.5fr)_minmax(0,1.25fr)_minmax(0,1fr)_11.5rem_1.25rem]";
const SUB = "text-xs text-muted-foreground";

interface Props {
  grupo: GrupoAtivo;
  ativos: readonly Ativo[];
  /** O mês em que se calcula o valor atual («AAAA-MM»). */
  mes: string;
  /** Sem `hr.pessoas.retribuicao.view` os nomes não se mostram, mesmo que venham. */
  rhOculto: boolean;
  aoAbrir: (a: Ativo, origem: HTMLElement) => void;
}

function Ligacao({ a, rhOculto }: { a: Ativo; rhOculto: boolean }) {
  const { t } = useTranslation();
  let principal: string | null = null;
  let secundario: string | null = null;
  let rotulo = "ativos.liga.servico";
  if (a.grupo === "servico") {
    principal = a.catEquipamento?.nome ?? null;
  } else if (a.grupo === "estrutura") {
    const tipo = a.tipo ? t(`ativos.tipo.estrutura.${a.tipo}`) : null;
    principal = a.localizacao ?? tipo;
    rotulo = a.localizacao ? "ativos.liga.local" : "ativos.liga.tipo";
    secundario = a.localizacao ? tipo : null;
  } else {
    rotulo = "ativos.liga.pessoa";
    // `ligado` sem nome: a pessoa já foi apagada (ou o RH está oculto e a chave diz que está atribuído).
    principal = rhOculto ? t("ativos.pessoa.rhOculto") : (a.atribuicao?.pessoaNome ?? (a.ligado ? t("ativos.pessoa.ligado") : null));
    secundario = a.tipo ? t(`ativos.tipo.pessoa.${a.tipo}`) : null;
  }
  if (!principal) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="flex min-w-0 flex-col">
      <span className={SUB}>{t(rotulo)}</span>
      <span className="truncate text-sm font-medium">{principal}</span>
      {secundario && <span className={cn(SUB, "truncate")}>{secundario}</span>}
    </span>
  );
}

function textoDaVida(v: VidaDaLinha, t: (k: string, p?: Record<string, string | number>) => string): string {
  switch (v.tipo) {
    case "acaba": return t("ativos.ui.vida.acaba", { fim: v.fim });
    case "concluida": return t("ativos.ui.vida.concluida", { fim: v.fim });
    case "parou": return t("ativos.ui.vida.parou", { fim: v.fim });
    case "contrato": return t("ativos.ui.vida.contratoAte", { fim: v.fim });
    case "semFim": return t("ativos.ui.vida.semFim");
    case "semTempo": return t("ativos.ui.vida.semTempo");
  }
}

/** A micro-barra de vida: o desenho é decorativo; o texto ao lado diz o mesmo em palavras. */
function Vida({ a, mes }: { a: Ativo; mes: string }) {
  const { t } = useTranslation();
  const v = vidaDaLinha(a, mes);
  const parado = a.estado === "desativado";
  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/15">
        {v.pct !== null && (
          <span
            className={cn(
              "block h-full rounded-full",
              parado ? "bg-muted-foreground/50" : vidaATerminar(v.pct) ? "bg-warning" : "bg-primary",
            )}
            style={{ width: `${Math.max(v.pct, v.pct > 0 ? 3 : 0)}%` }}
          />
        )}
      </span>
      <span className={cn(SUB, "truncate")}>
        <span className="sr-only">{t("ativos.col.vida")}: </span>
        {textoDaVida(v, t)}
      </span>
    </span>
  );
}

function Valor({ a, mes }: { a: Ativo; mes: string }) {
  const { t } = useTranslation();
  if (a.forma === "alugado") {
    const [antes, depois] = partirTexto(t("ativos.lista.rendaMes", { valor: MARCA_VALOR }), MARCA_VALOR);
    return (
      <span className="flex min-w-0 items-baseline justify-between gap-2 md:block md:text-right">
        <span className={cn(SUB, "md:sr-only")}>{t("ativos.col.renda")}</span>
        <span data-testid="valor-renda" className="tabular-nums">
          {antes}
          <span className="text-[15px] font-semibold">{euros(a.rendaMensal, "—")}</span>
          <span className={cn(SUB, "md:block")}>{depois}</span>
        </span>
      </span>
    );
  }
  const atual = valorAtual(a, mes);
  return (
    <span className="flex min-w-0 items-baseline justify-between gap-2 md:block md:text-right">
      <span className={cn(SUB, "md:hidden")}>{t("ativos.col.valorAtual")}</span>
      <span
        data-testid="valor-atual"
        className={cn("tabular-nums md:block", atual === null ? "text-sm font-medium text-muted-foreground" : "text-[15px] font-semibold")}
      >
        {atual === null ? t(motivoSemValor(a) === "porUso" ? "ativos.vida.semVida" : "ativos.vida.indefinida") : euros(atual, "—")}
      </span>
      <span aria-hidden="true" className={cn(SUB, "hidden md:block")}>{t("ativos.col.valorAtual")}</span>
    </span>
  );
}

export function ListaAtivos({ grupo, ativos, mes, rhOculto, aoAbrir }: Props) {
  const { t } = useTranslation();
  const colunaValor = ativos.every((a) => a.forma === "alugado") ? "ativos.col.renda" : ativos.some((a) => a.forma === "alugado") ? "ativos.col.valorOuRenda" : "ativos.col.valorAtual";
  return (
    <div>
      <div
        aria-hidden="true"
        className={cn("hidden items-center gap-5 border-b bg-muted/40 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground md:grid", COLUNAS)}
      >
        <span>{t("ativos.col.nome")}</span>
        <span>{t("ativos.col.liga")}</span>
        <span>{t("ativos.col.vida")}</span>
        <span className="text-right">{t(colunaValor)}</span>
        <span>{t("ativos.col.estado")}</span>
        <span />
      </div>
      <ul aria-label={t("ativos.lista.legenda", { grupo: t(`ativos.grupo.${grupo}`) })} className="space-y-2 p-3 md:space-y-0 md:p-0">
        {ativos.map((a) => {
          const alugado = a.forma === "alugado";
          const desativado = a.estado === "desativado";
          const Icone = iconeDoAtivo(a.grupo, a.tipo);
          return (
            <li
              key={a.id}
              className={cn(
                "group relative grid grid-cols-1 items-center gap-x-4 gap-y-3 rounded-xl border bg-card p-4",
                "transition-colors duration-150 hover:bg-muted/50 motion-reduce:transition-none",
                "focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring",
                "md:min-h-[4.5rem] md:gap-5 md:rounded-none md:border-0 md:border-b md:px-5 md:py-3 md:last:border-b-0",
                COLUNAS, desativado && "bg-muted/30",
              )}
            >
              <div className="order-1 flex min-w-0 items-center gap-3.5 md:order-none">
                <span aria-hidden="true" className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", TOM_GRUPO[a.grupo], desativado && "grayscale")}>
                  <Icone className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  {/* O botão estica-se sobre o cartão todo: a linha inteira abre o detalhe. */}
                  <button
                    type="button" aria-label={t("ativos.lista.abrir", { nome: a.nome })} onClick={(e) => aoAbrir(a, e.currentTarget)}
                    className={cn(
                      "block max-w-full rounded-sm text-left text-[15px] font-semibold leading-snug after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none md:after:rounded-none",
                      FOCO,
                    )}
                  >
                    <span className="line-clamp-2 break-words md:line-clamp-1">{a.nome}</span>
                  </button>
                  <span className={cn(SUB, "mt-0.5 block truncate tabular-nums")}>
                    {alugado
                      ? <span>{[t("ativos.forma.etiqueta.alugado"), a.codigo].filter(Boolean).join(" · ")}</span>
                      : (
                        <>
                          <span>{t("ativos.forma.comprado")}{a.codigo ? " · " : ""}</span>
                          {a.codigo && <span>{a.codigo}</span>}
                        </>
                      )}
                  </span>
                </div>
              </div>
              <div className="order-3 min-w-0 md:order-none"><Ligacao a={a} rhOculto={rhOculto} /></div>
              <div className="order-4 min-w-0 md:order-none"><Vida a={a} mes={mes} /></div>
              <div className="order-5 min-w-0 md:order-none"><Valor a={a} mes={mes} /></div>
              <div className="order-2 justify-self-start md:order-none"><EtiquetaEstado estado={estadoDoAtivo(a)} /></div>
              <ChevronRight
                aria-hidden="true"
                className="hidden h-5 w-5 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none md:block"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
