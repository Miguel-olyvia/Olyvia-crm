/**
 * O armazém do Stock a que um ativo de estrutura está ligado, e quanto valem os produtos lá guardados. O nome só se vê com
 * `inventory.view` (sem ela a ficha diz que está ligado a um armazém, sem dizer qual). O valor em produtos só se vê com `inventory.view`
 * E `products.view_cost` (`podeVerValor`) e NUNCA entra nos totais dos ativos: é uma informação ao lado. Um armazém apagado no Stock
 * deixa o ativo como está e o valor fica «—».
 */
import { euros } from "@/components/rh-exemplo/custo/formato";
import { useValorStockArmazem } from "@/hooks/ativos/useValorStockArmazem";
import { useTranslation } from "@/hooks/useTranslation";
import { Linha, Seccao } from "./DetalheBlocos";
import type { Ativo } from "./lib/tipos";

function ValorEmProdutos({ armazemId }: { armazemId: string }) {
  const { t } = useTranslation();
  const { valor, aCarregar, falhou } = useValorStockArmazem(armazemId, true);
  // Uma recusa ou uma falha não se mostra como número nem como erro: a linha simplesmente não aparece.
  if (falhou) return null;
  return (
    <Linha rotulo={t("ativos.armazem.valor")} id="detalhe-armazem-valor">
      {aCarregar || valor === null ? t("ativos.armazem.valorACarregar") : euros(valor, "—")}
    </Linha>
  );
}

interface Props {
  ativo: Ativo;
  /** Tem `inventory.view` e `products.view_cost`. */
  podeVerValor: boolean;
}

export function ArmazemDoAtivoSecao({ ativo, podeVerValor }: Props) {
  const { t } = useTranslation();
  if (!ativo.armazemLigado) return null;
  const armazem = ativo.armazem;
  return (
    <div className="space-y-1" data-testid="detalhe-armazem">
      <Seccao titulo={t("ativos.detalhe.seccaoArmazem")} id="ativo-armazem">
        {armazem?.apagado ? (
          // Uma só linha: o rótulo não se repete com um «—» ao lado do aviso de que foi apagado.
          <Linha rotulo={t("ativos.armazem.nome")} id="detalhe-armazem-apagado">{t("ativos.armazem.apagado")}</Linha>
        ) : (
          <Linha rotulo={t("ativos.armazem.nome")} id="detalhe-armazem-nome">
            {armazem ? (armazem.nome ?? "—") : t("ativos.armazem.escondido")}
          </Linha>
        )}
        {podeVerValor && armazem && !armazem.apagado && <ValorEmProdutos armazemId={armazem.id} />}
        {podeVerValor && armazem?.apagado && <Linha rotulo={t("ativos.armazem.valor")} id="detalhe-armazem-valor">—</Linha>}
      </Seccao>
      {podeVerValor && armazem && <p className="text-xs text-muted-foreground">{t("ativos.armazem.valorNota")}</p>}
    </div>
  );
}
