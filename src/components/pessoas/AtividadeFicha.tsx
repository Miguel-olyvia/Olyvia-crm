// A aba "Atividade": uma linha do tempo agrupada por dia (Hoje, Ontem ou a data). Cada registo tem ícone em chip, título,
// detalhe e hora; os feitos nesta sessão dizem "registado agora" e os de exemplo levam a marca "exemplo" em muted. O anúncio
// ao leitor de ecrã vive na ficha (sempre montada), porque esta aba só existe enquanto está aberta.
import { Clock, Mail, PhoneCall, StickyNote } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Seccao } from "@/components/ficha-comum/Seccao";
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";
import { agruparPorDia, type GrupoDia } from "./agruparAtividade";
import { textoDiaCompleto } from "./formatoPessoas";
import type { ItemAtividade, TipoAtividade } from "./pessoasTipos";

const ICONES: Record<TipoAtividade, LucideIcon> = { chamada: PhoneCall, nota: StickyNote, email: Mail, historico: Clock };

/** Um texto da atividade: o da aplicação (pela chave de tradução) ou o escrito à mão, que nunca é tratado como chave. */
const texto = (t: Traduzir, chave: string | undefined, escrito: string): string => (chave ? t(chave) : escrito);

function Item({ item }: { item: ItemAtividade }) {
  const { t } = useTranslation();
  const Icone = ICONES[item.tipo];
  const titulo = [t(`pessoasPagina.activity.type.${item.tipo}`), texto(t, item.chaveTitulo, item.titulo)].filter(Boolean).join(" · ");
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icone className="h-4 w-4 text-foreground" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-[15px] font-medium text-foreground">{titulo}</p>
        {(item.chaveDetalhe || item.detalhe) && <p className="break-words text-[15px] text-muted-foreground">{texto(t, item.chaveDetalhe, item.detalhe)}</p>}
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          {item.exemplo ? item.hora && <span className="tabular-nums">{item.hora}</span> : <span>{t("pessoasPagina.activity.now")}</span>}
          {item.exemplo && <span>{t("pessoasPagina.head.example")}</span>}
        </p>
      </div>
    </li>
  );
}

/** O título de um dia: "Hoje", "Ontem" ou "03/10/2026". */
function tituloDoDia(t: Traduzir, g: GrupoDia): string {
  if (g.relativo === "hoje") return t("pessoasPagina.activity.groupToday");
  return g.relativo === "ontem" ? t("pessoasPagina.activity.groupYesterday") : textoDiaCompleto(g.dia);
}

export function AtividadeFicha({ itens, hoje }: { itens: ItemAtividade[]; hoje: string }) {
  const { t } = useTranslation();
  if (itens.length === 0) {
    return (
      <div className="space-y-1 rounded-xl border border-dashed border-border p-4">
        <p className="text-sm font-semibold text-foreground">{t("pessoasPagina.activity.empty")}</p>
        <p className="text-sm text-muted-foreground">{t("pessoasPagina.activity.emptyHint")}</p>
      </div>
    );
  }
  return (
    <div role="group" aria-label={t("pessoasPagina.activity.title")} className="space-y-4">
      {agruparPorDia(itens, hoje).map((g) => (
        <Seccao key={g.dia} titulo={tituloDoDia(t, g)}>
          <ol className="space-y-4">{g.itens.map((i) => <Item key={i.id} item={i} />)}</ol>
        </Seccao>
      ))}
    </div>
  );
}
