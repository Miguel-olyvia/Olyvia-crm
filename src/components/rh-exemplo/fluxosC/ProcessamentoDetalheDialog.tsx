/** «Como chegámos a este valor»: cada passo do fluxo 10, pela ordem do documento, com a conta e o valor. */
import { TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/hooks/useTranslation";
import { euros } from "./formatosC";
import type { ReciboCongelado } from "./salarioFecho";
import type { LinhaSalario } from "./salarioRegras";

interface Props {
  recibo: ReciboCongelado | null;
  congelado: boolean;
  aoFechar: () => void;
}

const num = (n: number, casas = 2): string => n.toFixed(casas).replace(".", ",");

function Passo({ numero, titulo, conta, valor }: { numero: string; titulo: string; conta?: string; valor?: string }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b py-2 last:border-b-0">
      <div className="min-w-0">
        <span className="text-sm font-medium">{numero} · {titulo}</span>
        {conta && <span className="block text-xs tabular-nums text-muted-foreground">{conta}</span>}
      </div>
      {valor && <span className="text-sm font-semibold tabular-nums">{valor}</span>}
    </li>
  );
}

function rotuloLinha(l: LinhaSalario, t: (k: string) => string): string {
  if (l.chave.startsWith("pontual_")) return `${t("rhFluxosC.proc.passo.pontual")}: ${l.descricao ?? ""}`;
  return t(`rhFluxosC.proc.linha.${l.chave}`);
}

export function ProcessamentoDetalheDialog({ recibo, congelado, aoFechar }: Props) {
  const { t } = useTranslation();
  if (!recibo) return null;
  const { entrada, resultado, pessoaNome } = recibo;
  const r = entrada.retribuicao;

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("rhFluxosC.proc.detalhe.titulo")}</DialogTitle>
          <DialogDescription>{pessoaNome}{congelado ? ` · ${t("rhFluxosC.proc.detalhe.congelado")}` : ""}</DialogDescription>
        </DialogHeader>
        {resultado.avisos.length > 0 && (
          <ul className="space-y-1" aria-label={t("rhFluxosC.proc.avisos")}>
            {resultado.avisos.map((a) => (
              <li key={a} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t(`rhFluxosC.proc.aviso.${a}`)}
              </li>
            ))}
          </ul>
        )}
        {r && resultado.mensal !== null && resultado.base !== null && (
          <ol className="max-h-[55vh] overflow-y-auto pr-1">
            <Passo numero="1" titulo={t("rhFluxosC.proc.passo.retribuicao")} conta={`${euros(r.valor)} · ${t(`rhFluxosC.proc.periodicidade.${r.periodicidade}`)}`} />
            <Passo numero="2" titulo={t("rhFluxosC.proc.passo.mensal")} conta={t(`rhFluxosC.proc.conversao.${r.periodicidade}`)} valor={euros(resultado.mensal)} />
            <Passo numero="3" titulo={t("rhFluxosC.proc.passo.base")} conta={`${resultado.linhas[0].formula} (${r.duodecimosPct ?? 0} %)`} valor={euros(resultado.base)} />
            <Passo numero="4" titulo={t("rhFluxosC.proc.passo.valorHora")}
              conta={resultado.valorHora === null ? t("rhFluxosC.proc.aviso.sem_horas_planeadas") : `${num(resultado.mensal)} ÷ ${num(entrada.horasPlaneadasMes, 0)} h`}
              valor={resultado.valorHora === null ? "—" : `${num(resultado.valorHora, 4)} €`} />
            {resultado.linhas.filter((l) => l.chave !== "base").map((l) => (
              <Passo key={l.chave} numero={String(l.passo)} titulo={rotuloLinha(l, t)} conta={l.formula} valor={euros(l.valor)} />
            ))}
            <li className="flex items-baseline justify-between gap-4 pt-3">
              <span className="text-sm font-semibold">9 · {t("rhFluxosC.proc.passo.total")}</span>
              <span className="text-lg font-bold tabular-nums">{euros(resultado.totalBruto ?? 0)}</span>
            </li>
          </ol>
        )}
        <p className="text-xs text-muted-foreground">{t("rhFluxosC.proc.detalhe.arredondamento")}</p>
      </DialogContent>
    </Dialog>
  );
}
