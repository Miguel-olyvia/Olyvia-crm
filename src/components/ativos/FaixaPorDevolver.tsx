/**
 * A faixa de aviso «X pessoas saem nos próximos 30 dias com Y itens por devolver → ver»: no topo dos Ativos, em «Contratos a terminar» e
 * na ficha da pessoa (com `pessoaId`). Só aparece com X > 0 e funciona só com as contagens (`detalhe = false`). Sem sino e sem cron: vê-a
 * quem abre a página. «Ver» leva ao separador «Saídas»: é um botão (`aoVer`, dentro dos Ativos) ou uma ligação (`hrefVer`, a partir do
 * RH, só a quem tem acesso aos Ativos); sem nenhum dos dois fica só o texto. Uma recusa (42501 na ficha sem acesso completo), a RPC por
 * aplicar e um defeito não mostram nada: a faixa é um aviso, nunca um erro.
 */
import { PackageOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { resumoDaFaixa } from "@/components/ativos/lib/porDevolver";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { toneBadge } from "@/components/inventory/ui/tones";
import { useAtivosPorDevolver } from "@/hooks/ativos/useAtivosPorDevolver";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

/** O horizonte do aviso (decidido: 30 dias). */
export const DIAS_DA_FAIXA = 30;
const LIGACAO = cn("inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold underline-offset-2 hover:underline", FOCO);

interface Props {
  organizationId: string | null;
  /** Só uma pessoa (a ficha). */
  pessoaId?: string | null;
  /** «Ver» como botão (já se está nos Ativos). */
  aoVer?: () => void;
  /** «Ver» como ligação (a partir do RH). */
  hrefVer?: string;
  enabled?: boolean;
  className?: string;
}

export function FaixaPorDevolver({ organizationId, pessoaId = null, aoVer, hrefVer, enabled = true, className }: Props) {
  const { t } = useTranslation();
  const { estado, dados } = useAtivosPorDevolver({ organizationId, pessoaId, dias: DIAS_DA_FAIXA, enabled });
  const chave = estado === "ok" && dados ? resumoDaFaixa(dados) : null;
  if (!chave || !dados) return null;
  const texto = t(chave, { pessoas: dados.totalPessoas, itens: dados.totalItens, dias: DIAS_DA_FAIXA });
  const verAria = t("ativos.faixa.verAria");
  return (
    <div
      role="status" aria-label={t("ativos.faixa.nome")} data-testid="faixa-por-devolver"
      className={cn("flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium", toneBadge.warn, className)}
    >
      <PackageOpen aria-hidden="true" className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1">{texto}</span>
      {aoVer && <button type="button" onClick={aoVer} aria-label={verAria} className={LIGACAO}>{t("ativos.faixa.ver")} →</button>}
      {!aoVer && hrefVer && <Link to={hrefVer} aria-label={verAria} className={LIGACAO}>{t("ativos.faixa.ver")} →</Link>}
    </div>
  );
}
