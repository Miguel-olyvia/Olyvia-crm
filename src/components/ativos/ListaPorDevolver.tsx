/**
 * As pessoas que saem e o que ainda têm por devolver, por ordem de saída: nome, data, dias que faltam («já saiu» a vermelho) e os itens
 * (equipamento do RH e viaturas da Frota, com a etiqueta de cada um). Só apresenta: o que cada pessoa vê decide-se na base. Sem o acesso
 * completo (`detalhe = false`) não há pessoas nem itens, só as contagens e a explicação. Partilhada pelo separador «Saídas» dos Ativos e
 * pelo bloco «Por devolver» do RH.
 */
import { Car, CalendarClock, Laptop, Lock, TriangleAlert, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { dataPt } from "@/components/rh-exemplo/custo/formato";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { toneBadge } from "@/components/inventory/ui/tones";
import { chaveDiasRestantes, ordenarPorSaida, ROTA_FROTA, type ItemPorDevolver, type PessoaPorDevolver, type PorDevolver } from "@/components/ativos/lib/porDevolver";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

/** Quando faltam tantos dias (ou menos) a saída ganha o tom de aviso. */
const DIAS_DE_AVISO = 7;

function tomDosDias(dias: number | null): { classes: string; Icone: LucideIcon } {
  if (dias !== null && dias < 0) return { classes: toneBadge.bad, Icone: TriangleAlert };
  if (dias !== null && dias <= DIAS_DE_AVISO) return { classes: toneBadge.warn, Icone: CalendarClock };
  return { classes: toneBadge.neutral, Icone: CalendarClock };
}

function EtiquetaDias({ dias }: { dias: number | null }) {
  const { t } = useTranslation();
  const { classes, Icone } = tomDosDias(dias);
  return (
    <span className={cn("inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", classes)}>
      <Icone aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
      {t(chaveDiasRestantes(dias), { n: dias ?? 0 })}
    </span>
  );
}

function LinhaItem({ item, ligacaoFrota }: { item: ItemPorDevolver; ligacaoFrota: boolean }) {
  const { t } = useTranslation();
  const frota = item.origem === "frota";
  const Icone = frota ? Car : Laptop;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted/40 px-3 py-2.5 text-sm">
      <Icone aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", frota ? toneBadge.info : toneBadge.neutral)}>
        {t(frota ? "ativos.saidas.item.frota" : "ativos.saidas.item.ativo")}
      </span>
      {item.codigo && <span className="font-mono text-xs font-semibold tabular-nums">{item.codigo}</span>}
      <span className="min-w-0 flex-1 font-medium">{item.nome ?? t("ativos.saidas.item.semNome")}</span>
      {item.desde && <span className="text-xs text-muted-foreground">{t("ativos.saidas.item.desde", { data: dataPt(item.desde) })}</span>}
      {frota && ligacaoFrota && (
        <Link to={ROTA_FROTA} className={cn("rounded-md px-1 text-xs font-semibold text-primary underline-offset-2 hover:underline", FOCO)}>
          {t("ativos.saidas.item.verFrota")}
        </Link>
      )}
    </li>
  );
}

/** Só os itens de uma pessoa (no diálogo de Terminar, onde o nome e a data já se sabem). */
export function ItensPorDevolver({ itens, ligacaoFrota, nome }: { itens: readonly ItemPorDevolver[]; ligacaoFrota: boolean; nome: string }) {
  const { t } = useTranslation();
  return (
    <ul aria-label={t("ativos.saidas.item.lista", { nome })} className="space-y-1.5">
      {itens.map((i) => <LinhaItem key={`${i.origem}-${i.itemId}`} item={i} ligacaoFrota={ligacaoFrota} />)}
    </ul>
  );
}

function CartaoPessoa({ p, ligacaoFrota }: { p: PessoaPorDevolver; ligacaoFrota: boolean }) {
  const { t } = useTranslation();
  const nome = p.nome ?? t("ativos.saidas.semNome");
  const n = p.itens.length || p.nItens;
  return (
    <li data-pessoa={p.pessoaId} className="space-y-3 border-b p-4 last:border-b-0 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-base font-semibold">{nome}</p>
          <p className="text-xs text-muted-foreground">
            {p.saidaPrevista && <><span>{t("ativos.saidas.sai", { data: dataPt(p.saidaPrevista) })}</span>{" · "}</>}
            <span>{t(`ativos.saidas.origem.${p.origem}`)}</span>
          </p>
        </div>
        <EtiquetaDias dias={p.diasRestantes} />
        <span className="text-sm font-semibold tabular-nums">{n === 1 ? t("ativos.saidas.itens.um") : t("ativos.saidas.itens.varios", { n })}</span>
      </div>
      <ItensPorDevolver itens={p.itens} ligacaoFrota={ligacaoFrota} nome={nome} />
    </li>
  );
}

export function ListaPorDevolver({ dados, ligacaoFrota }: { dados: PorDevolver; ligacaoFrota: boolean }) {
  const { t } = useTranslation();
  if (!dados.detalhe) {
    return (
      <div className="space-y-2 p-5 text-sm">
        <p className="font-semibold tabular-nums">{t("ativos.saidas.contagens", { pessoas: dados.totalPessoas, itens: dados.totalItens })}</p>
        <p className="flex items-start gap-2 text-muted-foreground">
          <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {t("ativos.saidas.soContagens")}
        </p>
      </div>
    );
  }
  if (dados.pessoas.length === 0) {
    return <p className="px-5 py-12 text-center text-sm text-muted-foreground">{t("ativos.saidas.vazio", { n: dados.dias })}</p>;
  }
  return (
    <ul>
      {ordenarPorSaida(dados.pessoas).map((p) => <CartaoPessoa key={p.pessoaId} p={p} ligacaoFrota={ligacaoFrota} />)}
    </ul>
  );
}
