/**
 * «Por devolver» no fim de contrato do RH, de `rpc_ativos_por_devolver`. Sem `pessoaId` é o bloco de «Contratos a terminar»: quem sai no
 * horizonte do filtro e o que ainda tem por devolver (a mesma lista do separador «Saídas» dos Ativos). Com `pessoaId` é o aviso do diálogo
 * de «Terminar»: os itens dessa pessoa, antes de confirmar. Nunca bloqueia nada: a base é que recusa o «Terminar» (HRV14); aqui, uma leitura
 * recusada ou por aplicar não mostra nada e uma falha diz-o numa linha. Sem acesso completo só se mostram as contagens.
 */
import { Lock } from "lucide-react";
import { ItensPorDevolver, ListaPorDevolver } from "@/components/ativos/ListaPorDevolver";
import { usePermissoesPorDevolver } from "@/components/rh-exemplo/fimContrato/acessoPorDevolver";
import { useAtivosPorDevolver } from "@/hooks/ativos/useAtivosPorDevolver";
import { useTranslation } from "@/hooks/useTranslation";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";

interface Props {
  organizationId: string | null;
  /** Só uma pessoa (o diálogo de Terminar). Sem ela, a organização inteira. */
  pessoaId?: string | null;
  /** O horizonte em dias. Para uma pessoa usa-se o máximo (365), porque ela pode terminar muito antes da data de fim. */
  dias: number;
  enabled?: boolean;
}

export function PorDevolverNaSaida({ organizationId, pessoaId = null, dias, enabled = true }: Props) {
  const { t } = useTranslation();
  const { acessoCompleto, ligacaoFrota } = usePermissoesPorDevolver();
  // Uma pessoa sem o acesso completo é 42501: nem se pede (a base recusa o «Terminar» à mesma).
  const pedir = enabled && (pessoaId === null || acessoCompleto);
  const { estado, dados } = useAtivosPorDevolver({ organizationId, pessoaId, dias, enabled: pedir });

  if (!pedir || estado === "recusado" || estado === "indisponivel") return null;
  if (estado === "a_carregar") return <OlyviaLoader size={16} text={t("ativos.saidas.aCarregar")} className="flex-row justify-start" />;
  if (estado === "erro" || !dados) {
    return <p className="text-sm text-muted-foreground">{t("ativos.porDevolver.erro")}</p>;
  }

  if (pessoaId) {
    const pessoa = dados.pessoas[0];
    if (!dados.detalhe) {
      if (dados.totalItens <= 0) return <p className="text-sm text-muted-foreground">{t("ativos.porDevolver.nada")}</p>;
      return (
        <p className="flex items-start gap-2 text-sm font-medium">
          <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          {dados.totalItens === 1 ? t("ativos.porDevolver.contagem.um") : t("ativos.porDevolver.contagem.varios", { n: dados.totalItens })}
        </p>
      );
    }
    if (!pessoa || pessoa.itens.length === 0) return <p className="text-sm text-muted-foreground">{t("ativos.porDevolver.nada")}</p>;
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">{t("ativos.porDevolver.titulo")}</p>
        <p className="text-sm text-muted-foreground">{t("ativos.porDevolver.aviso")}</p>
        <ItensPorDevolver itens={pessoa.itens} ligacaoFrota={ligacaoFrota} nome={pessoa.nome ?? t("ativos.saidas.semNome")} />
      </div>
    );
  }

  return (
    <section aria-label={t("ativos.porDevolver.titulo")} className="overflow-hidden rounded-xl border">
      <h3 className="border-b bg-muted/30 px-4 py-3 text-sm font-semibold">{t("ativos.porDevolver.titulo")}</h3>
      <ListaPorDevolver dados={dados} ligacaoFrota={ligacaoFrota} />
    </section>
  );
}
