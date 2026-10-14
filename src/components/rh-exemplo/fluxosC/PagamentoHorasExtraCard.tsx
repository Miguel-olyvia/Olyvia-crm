/** Como se paga uma hora extra confirmada (coeficientes do documento) e o que cada pessoa leva este mês. */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useTranslation } from "@/hooks/useTranslation";
import { euros, minutosEmHoras, nomeDoMes } from "./formatosC";
import { pagamentoHorasExtra, type CodigoPagamentoHE } from "./horasExtraRegras";
import { mesAtual } from "./dadosFluxosC";
import { useFluxosC } from "./lojaFluxosC";
import { valorDaHoraDaFicha } from "./salarioContexto";
import { arredondarCentimo } from "./salarioRegras";

const REGRAS: Array<{ codigo: CodigoPagamentoHE; chavePct: "primeiraHoraPct" | "seguintesPct" | "nocturnoPct" | "feriadoPct" | "descansoPct" }> = [
  { codigo: "primeira_hora", chavePct: "primeiraHoraPct" },
  { codigo: "seguintes", chavePct: "seguintesPct" },
  { codigo: "nocturno", chavePct: "nocturnoPct" },
  { codigo: "feriado", chavePct: "feriadoPct" },
  { codigo: "descanso", chavePct: "descansoPct" },
];

export function PagamentoHorasExtraCard() {
  const { t } = useTranslation();
  const c = useFluxosC((e) => e);
  const fichas = useEstadoRh((e) => e.fichas);
  const mes = mesAtual();
  const [ano, m] = mes.split("-").map(Number);

  const linhas = useMemo(() => {
    const ids = [...new Set(c.horasExtra.filter((h) => h.estado === "confirmada" && h.data.startsWith(mes)).map((h) => h.pessoaId))];
    return ids.flatMap((id) => {
      const ficha = fichas[id];
      if (!ficha) return [];
      const delas = c.horasExtra.filter((h) => h.pessoaId === id && h.data.startsWith(mes));
      const vh = valorDaHoraDaFicha(ficha, c, ano, m);
      const pag = pagamentoHorasExtra(delas, vh, c.regras);
      const total = pag.reduce((s, l) => s + arredondarCentimo(l.valor), 0);
      return [{ id, nome: ficha.pessoa.nome_completo, minutos: pag.reduce((s, l) => s + (l.codigo === "nocturno" ? 0 : l.minutos), 0), total, semValor: vh === null }];
    });
  }, [c, fichas, mes, ano, m]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("rhFluxosC.he.pagamento.titulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("rhFluxosC.he.pagamento.ajuda")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-5">
          {REGRAS.map(({ codigo, chavePct }) => (
            <li key={codigo} className="rounded-md border p-3">
              <span className="block text-xs text-muted-foreground">{t(`rhFluxosC.he.pagamento.regra.${codigo}`)}</span>
              <span className="text-lg font-semibold tabular-nums">{c.regras[chavePct]} %</span>
            </li>
          ))}
        </ul>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="mb-2 text-left text-xs text-muted-foreground">
              {t("rhFluxosC.he.pagamento.tabela").replace("{mes}", nomeDoMes(mes))}
            </caption>
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-4">{t("rhFluxosC.he.coluna.pessoa")}</th>
                <th scope="col" className="py-2 pr-4">{t("rhFluxosC.he.pagamento.confirmado")}</th>
                <th scope="col" className="py-2 text-right">{t("rhFluxosC.he.pagamento.valor")}</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 ? (
                <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">{t("rhFluxosC.he.pagamento.vazio")}</td></tr>
              ) : linhas.map((l) => (
                <tr key={l.id} className="border-b last:border-b-0">
                  <th scope="row" className="py-2 pr-4 text-left font-medium">{l.nome}</th>
                  <td className="py-2 pr-4 tabular-nums">{minutosEmHoras(l.minutos)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{l.semValor ? t("rhFluxosC.he.pagamento.semValorHora") : euros(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
