/**
 * Cartão «Banco de horas»: saldo (horas e euros de exemplo), limites, avisos de validade e movimentos.
 * Reutilizável: quem monta a ficha (aba Horário ou Laborais) mostra-o só quando o tipo de horário é banco de horas.
 * Uso: <CartaoBancoHoras pessoaId={id} /> (com `podeAjustar={false}` fica só em leitura).
 */
import { useMemo, useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { useFichaRh } from "@/components/rh-exemplo/dados/loja";
import { useTranslation } from "@/hooks/useTranslation";
import { creditosComRestante, formatarMinutos, saldoDoBanco, valorEmEuros } from "./bancoHorasRegras";
import { MovimentoBancoDialog } from "./MovimentoBancoDialog";
import { dataCurta, euros } from "./formatosC";
import { useFluxosC } from "./lojaFluxosC";
import { valorDaHoraDaFicha } from "./salarioContexto";

interface Props {
  pessoaId: string;
  podeAjustar?: boolean;
}

export function CartaoBancoHoras({ pessoaId, podeAjustar = true }: Props) {
  const { t } = useTranslation();
  const c = useFluxosC((e) => e);
  const ficha = useFichaRh(pessoaId);
  const [dialogo, setDialogo] = useState<"credito" | "debito" | null>(null);
  const hoje = hojeIso();

  const movs = useMemo(() => c.banco.filter((m) => m.pessoaId === pessoaId).sort((a, b) => b.data.localeCompare(a.data)), [c.banco, pessoaId]);
  const saldo = saldoDoBanco(c.banco, pessoaId);
  const avisos = useMemo(() => creditosComRestante(c.banco, pessoaId, hoje).filter((x) => x.estado !== "valido"), [c.banco, pessoaId, hoje]);
  const valorHora = ficha ? valorDaHoraDaFicha(ficha, c, Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))) : null;
  const emEuros = valorEmEuros(saldo, valorHora);
  const { maxPositivoMin, maxNegativoMin } = c.limitesBanco;

  return (
    <Card aria-labelledby={`bh-titulo-${pessoaId}`}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle id={`bh-titulo-${pessoaId}`} className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("rhFluxosC.banco.titulo")}
        </CardTitle>
        {podeAjustar && (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setDialogo("credito")}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />{t("rhFluxosC.banco.credito")}
            </Button>
            <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setDialogo("debito")}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />{t("rhFluxosC.banco.debito")}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
          <div>
            <span className="block text-xs text-muted-foreground">{t("rhFluxosC.banco.saldo")}</span>
            <span className="text-2xl font-semibold tabular-nums">{formatarMinutos(saldo)}</span>
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">{t("rhFluxosC.banco.emEuros")}</span>
            <span className="text-lg font-medium tabular-nums">{emEuros === null ? t("rhFluxosC.banco.semValorHora") : euros(emEuros)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("rhFluxosC.banco.limites").replace("{max}", formatarMinutos(maxPositivoMin)).replace("{min}", formatarMinutos(-maxNegativoMin))}
          </p>
        </div>

        {avisos.length > 0 && (
          <ul aria-label={t("rhFluxosC.banco.avisos")} className="space-y-1.5">
            {avisos.map((a) => (
              <li key={a.movimentoId} role="alert" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5 text-sm">
                {t(a.estado === "expirado" ? "rhFluxosC.banco.expirado" : "rhFluxosC.banco.aExpirar")
                  .replace("{t}", formatarMinutos(a.restanteMin)).replace("{data}", dataCurta(a.validoAte)).replace("{dias}", String(a.diasParaExpirar))}
              </li>
            ))}
          </ul>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("rhFluxosC.banco.movimentos")}</caption>
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-4">{t("rhFluxosC.he.coluna.dia")}</th>
                <th scope="col" className="py-2 pr-4">{t("rhFluxosC.banco.movimento")}</th>
                <th scope="col" className="py-2 pr-4">{t("rhFluxosC.banco.motivo")}</th>
                <th scope="col" className="py-2">{t("rhFluxosC.banco.origem")}</th>
              </tr>
            </thead>
            <tbody>
              {movs.length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">{t("rhFluxosC.banco.vazio")}</td></tr>
              ) : movs.map((m) => (
                <tr key={m.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-4 tabular-nums">{dataCurta(m.data)}</td>
                  <td className="py-2 pr-4 font-medium tabular-nums">{formatarMinutos(m.minutos)}</td>
                  <td className="py-2 pr-4">{m.motivo}</td>
                  <td className="py-2 text-muted-foreground">{t(`rhFluxosC.banco.origem.${m.origem}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">{t("rhFluxosC.banco.regraValidade")}</p>
      </CardContent>
      <MovimentoBancoDialog pessoaId={pessoaId} tipo={dialogo} aoFechar={() => setDialogo(null)} />
    </Card>
  );
}
