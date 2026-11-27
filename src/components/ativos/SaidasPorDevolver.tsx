/**
 * O separador «Saídas» dos Ativos: quem sai nos próximos dias (30, 60, 90 ou 180; 90 por omissão) e o que ainda tem por devolver, por
 * ordem de saída. Lê só `rpc_ativos_por_devolver` (a organização inteira): com o acesso completo vem a lista; só com `ativos.view` vêm as
 * contagens e a explicação de que o detalhe pede acesso ao RH. Cliente tolerante: a RPC por aplicar, a recusa e o defeito dizem-no, e
 * nada disto bloqueia o resto do ecrã. As viaturas da Frota aparecem na lista (não se duplicam nos Ativos).
 */
import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { ListaPorDevolver } from "@/components/ativos/ListaPorDevolver";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { useAtivosPorDevolver } from "@/hooks/ativos/useAtivosPorDevolver";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

/** Os horizontes que o filtro oferece (a base aceita de 0 a 365). */
const HORIZONTES = [30, 60, 90, 180] as const;
const HORIZONTE_OMISSAO = 90;
const ID_HORIZONTE = "ativos-saidas-horizonte";
const CARTAO = "rounded-2xl border bg-card shadow-sm";

interface Props {
  organizationId: string;
  /** `fleet.view`: só então a viatura leva a ligação à Frota. */
  ligacaoFrota: boolean;
}

export function SaidasPorDevolver({ organizationId, ligacaoFrota }: Props) {
  const { t } = useTranslation();
  const [dias, setDias] = useState<number>(HORIZONTE_OMISSAO);
  const leitura = useAtivosPorDevolver({ organizationId, dias });

  const aviso = (titulo: string, ajuda: string) => (
    <div role="status" className="space-y-1 p-6">
      <p className="font-semibold">{t(titulo)}</p>
      <p className="text-sm text-muted-foreground">{t(ajuda)}</p>
    </div>
  );

  return (
    <section aria-labelledby="ativos-saidas-titulo" className={cn(CARTAO, "overflow-hidden")}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4 sm:px-5">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id="ativos-saidas-titulo" className="text-lg font-semibold">{t("ativos.saidas.titulo")}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{t("ativos.saidas.sub")}</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Label htmlFor={ID_HORIZONTE} className="shrink-0 text-sm font-normal text-muted-foreground">{t("ativos.saidas.horizonte")}</Label>
          <div className="min-w-0 flex-1 sm:w-36 sm:flex-none">
            <NativeSelect
              id={ID_HORIZONTE} className={cn("h-11 rounded-xl", FOCO)} value={String(dias)} onValueChange={(v) => setDias(Number(v))}
              options={HORIZONTES.map((n) => ({ value: String(n), label: t("ativos.saidas.horizonte.n", { n }) }))}
            />
          </div>
        </div>
      </div>

      {leitura.estado === "a_carregar" && (
        <div className="p-5">
          <OlyviaLoader size={16} text={t("ativos.saidas.aCarregar")} className="flex-row justify-start" />
        </div>
      )}
      {leitura.estado === "indisponivel" && aviso("ativos.saidas.indisponivel", "ativos.saidas.indisponivelAjuda")}
      {leitura.estado === "recusado" && aviso("ativos.saidas.semAcesso", "ativos.saidas.semAcessoAjuda")}
      {leitura.estado === "erro" && (
        <div role="alert" className="m-4 flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm font-medium text-red-700 dark:text-red-400">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{leitura.mensagem ?? t("ativos.saidas.erroLer")}</span>
          <Button type="button" variant="outline" onClick={leitura.refazer} className={cn("min-h-11 rounded-xl", FOCO)}>{t("ativos.tentarDeNovo")}</Button>
        </div>
      )}
      {leitura.estado === "ok" && leitura.dados && (
        <div aria-busy={leitura.aAtualizar}>
          <ListaPorDevolver dados={leitura.dados} ligacaoFrota={ligacaoFrota} />
        </div>
      )}
    </section>
  );
}
