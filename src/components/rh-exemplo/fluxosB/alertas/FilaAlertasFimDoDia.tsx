/**
 * Os alertas de FIM DO DIA (fluxo 5): onde as horas feitas nao batem com as planeadas. Cinco tipos, com chips de
 * texto: planeado sem realizado, parcialmente realizado, realizado sem planeado, pendente de par e fora do
 * local. O RH trata cada um: Corrigir (motivo), Pedir justificacao, Marcar falta (motivo) ou Aceitar a diferenca;
 * e decide as justificacoes que as pessoas enviaram (aceitar, ou recusar com motivo).
 *
 * Substitui a fila antiga de desvios neste ecra: o filtro «por tratar / todos» esta sempre visivel, para uma fila
 * vazia nunca passar por «esta tudo em ordem» quando so esta escondida.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import {
  decidirJustificacaoDePicagem,
  tratarAlerta,
  type ResultadoAccao,
} from "@/components/rh-exemplo/dados/accoesAssiduidadeB";
import { AlertaLinha } from "@/components/rh-exemplo/fluxosB/alertas/AlertaLinha";
import { MotivoMinimoDialog } from "@/components/rh-exemplo/fluxosB/MotivoMinimoDialog";
import { formatarData } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import {
  accaoExigeMotivo,
  alertasPorTratar,
  type AccaoAlerta,
  type AlertaDia,
  type JustificacaoPicagem,
} from "@/components/rh-exemplo/lib/alertasFimDia";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";

type Pedido = { tipo: "accao"; alerta: AlertaDia; accao: AccaoAlerta } | { tipo: "recusar"; justificacao: JustificacaoPicagem } | null;

export function FilaAlertasFimDoDia() {
  const { t } = useTranslation();
  const alertas = useFluxosB((e) => e.alertas);
  const justificacoes = useFluxosB((e) => e.justificacoesPicagem);
  const fichas = useEstadoRh((e) => e.fichas);
  const [filtro, setFiltro] = useState<"por_tratar" | "todos">("por_tratar");
  const [pedido, setPedido] = useState<Pedido>(null);
  const [feedback, setFeedback] = useState<{ texto: string; erro: boolean } | null>(null);
  const hoje = hojeIso();

  const visiveis = useMemo(() => (filtro === "todos" ? alertas : alertasPorTratar(alertas)), [alertas, filtro]);
  const grupos = useMemo(() => {
    const porData = new Map<string, AlertaDia[]>();
    for (const alerta of visiveis) porData.set(alerta.data, [...(porData.get(alerta.data) ?? []), alerta]);
    return [...porData.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [visiveis]);

  const nomeDe = (pessoaId: string): string => fichas[pessoaId]?.pessoa.nome_completo ?? pessoaId;

  const mostrar = (resultado: ResultadoAccao, sucesso: string): string | null => {
    if (resultado.erro) {
      setFeedback({ texto: t(resultado.erro, { detalhe: resultado.detalhe ?? "" }), erro: true });
      return resultado.erro;
    }
    setFeedback({ texto: sucesso, erro: false });
    toast.success(sucesso);
    return null;
  };

  const aoEscolherAccao = (alerta: AlertaDia, accao: AccaoAlerta) => {
    if (accaoExigeMotivo(accao)) {
      setPedido({ tipo: "accao", alerta, accao });
      return;
    }
    mostrar(tratarAlerta(alerta.id, accao, ""), t(`rhExemplo.pic.feito.${accao}`));
  };

  const aoDecidir = (justificacao: JustificacaoPicagem, aceitar: boolean) => {
    if (!aceitar) {
      setPedido({ tipo: "recusar", justificacao });
      return;
    }
    mostrar(decidirJustificacaoDePicagem(justificacao.id, true, ""), t("rhExemplo.pic.feito.justificacaoAceite"));
  };

  const confirmar = (motivo: string): string | null => {
    if (!pedido) return null;
    const resultado =
      pedido.tipo === "accao"
        ? tratarAlerta(pedido.alerta.id, pedido.accao, motivo)
        : decidirJustificacaoDePicagem(pedido.justificacao.id, false, motivo);
    const sucesso = pedido.tipo === "accao" ? t(`rhExemplo.pic.feito.${pedido.accao}`) : t("rhExemplo.pic.feito.justificacaoRecusada");
    return mostrar(resultado, sucesso);
  };

  const tituloDialogo =
    pedido?.tipo === "accao" ? t(`rhExemplo.pic.accao.${pedido.accao}`) : t("rhExemplo.pic.recusarJustificacao");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("rhExemplo.pic.filaTitulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("rhExemplo.pic.filaAjuda")}</p>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="rhb-fila-filtro">{t("rhExemplo.pic.mostrar")}</Label>
            <NativeSelect
              id="rhb-fila-filtro"
              className="w-56"
              value={filtro}
              onValueChange={(valor) => setFiltro(valor === "todos" ? "todos" : "por_tratar")}
              options={[
                { value: "por_tratar", label: t("rhExemplo.pic.filtroPorTratar") },
                { value: "todos", label: t("rhExemplo.pic.filtroTodos") },
              ]}
            />
          </div>
          <p aria-live="polite" className="pb-2 text-sm text-muted-foreground">
            {t("rhExemplo.pic.contagem", { quantos: String(visiveis.length) })}
          </p>
        </div>
        {feedback && (
          <p role={feedback.erro ? "alert" : "status"} className={`text-sm font-medium ${feedback.erro ? "text-destructive" : "text-foreground"}`}>
            {feedback.texto}
          </p>
        )}
      </CardHeader>

      <CardContent>
        {grupos.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("rhExemplo.pic.filaVazia")}</p>
        ) : (
          <div className="space-y-4">
            {grupos.map(([data, doDia]) => (
              <section key={data} aria-label={formatarData(data)}>
                <h3 className="pb-1 text-sm font-semibold tabular-nums">{formatarData(data)}</h3>
                <ul className="divide-y">
                  {doDia.map((alerta) => (
                    <AlertaLinha
                      key={alerta.id}
                      alerta={alerta}
                      nome={nomeDe(alerta.pessoaId)}
                      justificacao={justificacoes.find((j) => j.alertaId === alerta.id && j.estado === "pendente") ?? null}
                      hoje={hoje}
                      onAccao={aoEscolherAccao}
                      onDecidir={aoDecidir}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </CardContent>

      <MotivoMinimoDialog
        aberto={pedido !== null}
        titulo={tituloDialogo}
        descricao={t(pedido?.tipo === "accao" ? "rhExemplo.pic.motivoDescricao" : "rhExemplo.pic.recusarDescricao")}
        rotuloConfirmar={tituloDialogo}
        onConfirmar={confirmar}
        onFechar={() => setPedido(null)}
        idPrefixo="rhb-fila-motivo"
      />
    </Card>
  );
}
