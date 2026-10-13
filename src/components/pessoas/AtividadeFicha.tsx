// A aba "Atividade": chamadas, notas, emails e histórico, a mais recente primeiro. Os registos feitos nesta sessão
// dizem "registado agora"; os de exemplo levam a marca "exemplo". O anúncio ao leitor de ecrã vive na ficha
// (sempre montada), porque esta aba só existe enquanto está aberta.
import { Clock, Mail, PhoneCall, StickyNote } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";
import { textoDia } from "./formatoPessoas";
import type { ItemAtividade, TipoAtividade } from "./pessoasTipos";

const ICONES: Record<TipoAtividade, LucideIcon> = { chamada: PhoneCall, nota: StickyNote, email: Mail, historico: Clock };

/** Um texto da atividade: o da aplicação (pela chave de tradução) ou o escrito à mão, que nunca é tratado como chave. */
const texto = (t: Traduzir, chave: string | undefined, escrito: string): string => (chave ? t(chave) : escrito);

function Item({ item, hoje }: { item: ItemAtividade; hoje: string }) {
  const { t } = useTranslation();
  const Icone = ICONES[item.tipo];
  const titulo = [t(`pessoasPagina.activity.type.${item.tipo}`), texto(t, item.chaveTitulo, item.titulo)].filter(Boolean).join(" · ");
  const quando = item.exemplo ? textoDia(t, item.quando, hoje) : t("pessoasPagina.activity.now");
  return (
    <li className="flex gap-3 rounded-xl border border-border bg-card p-3">
      <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-foreground">{titulo}</p>
        {(item.chaveDetalhe || item.detalhe) && <p className="break-words text-sm text-muted-foreground">{texto(t, item.chaveDetalhe, item.detalhe)}</p>}
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {quando}
          {item.exemplo && <span className="rounded-sm border border-dashed border-border px-1.5">{t("pessoasPagina.head.example")}</span>}
        </p>
      </div>
    </li>
  );
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
    <ul aria-label={t("pessoasPagina.activity.title")} className="space-y-2">
      {itens.map((i) => <Item key={i.id} item={i} hoje={hoje} />)}
    </ul>
  );
}
