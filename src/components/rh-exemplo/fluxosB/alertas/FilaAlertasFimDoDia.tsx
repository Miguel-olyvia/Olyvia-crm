/**
 * A fila de FIM DO DIA: os desvios REAIS que a base propoe (`hr_assiduidade_desvios`) -- turno planeado sem horas,
 * horas sem turno planeado, picagem por emparelhar e falta que passou a estar coberta por ausencia aprovada. A lista
 * vem do ecra de tras (o mesmo mes que o mapa le); aqui trata-se: Corrigir, Marcar falta e Anular a falta coberta,
 * todos por RPCs reais.
 *
 * O tipo «parcialmente realizado» (`planeado_parcialmente_realizado`, migration 20261207015900, aplicada no remoto)
 * aparece com Marcar falta. Nao ha aqui o tipo «fora do local», nem Pedir justificacao, Aceitar a diferenca ou a
 * justificacao de picagem: a base nao os tem. O filtro de minutos e deste ecra (a base nao filtra tolerancias) e fica
 * sempre visivel com a contagem, para uma fila vazia nunca passar por «esta tudo em ordem» quando so esta escondida.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useTranslation } from "@/hooks/useTranslation";
import { AvisoDeLeitura, leituraFalhou, type EstadoDeLeitura } from "@/components/rh-exemplo/AvisoDeLeitura";
import { AlertaLinha } from "@/components/rh-exemplo/fluxosB/alertas/AlertaLinha";
import { AccaoDoDesvio } from "@/components/rh-exemplo/fluxosB/alertas/AccaoDoDesvio";
import { formatarData } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import {
  TOLERANCIAS_DESVIO,
  accoesDoDesvio,
  agruparDesviosPorDia,
  chaveDoDesvio,
  filtrarDesviosPorTolerancia,
  type AccaoDesvio,
} from "@/components/rh-exemplo/lib/alertasFimDia";
import type { Desvio, PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";
import type { LocalTrabalho } from "@/components/rh-exemplo/tipos";

interface FilaAlertasFimDoDiaProps {
  desvios: readonly Desvio[];
  nomePorPessoaId: ReadonlyMap<string, string>;
  locais: LocalTrabalho[];
  permissoes: PermissoesAssiduidade;
  /** Para o ecra de tras reler os desvios depois de a base gravar. */
  onAlterado: () => void;
  /** Se a leitura dos desvios foi recusada ou falhou: nesse caso a lista vazia nao prova que esta tudo em ordem. */
  leitura?: EstadoDeLeitura;
  onTentarDeNovo?: () => void;
}

interface Pedido {
  desvio: Desvio;
  accao: AccaoDesvio;
}

/** As accoes de um desvio que esta conta pode fazer: corrigir exige `corrigir`; faltas exigem `faltasEdit`. */
function accoesPermitidas(desvio: Desvio, permissoes: PermissoesAssiduidade): AccaoDesvio[] {
  return accoesDoDesvio(desvio).filter((accao) => (accao === "corrigir" ? permissoes.corrigir : permissoes.faltasEdit));
}

export function FilaAlertasFimDoDia({
  desvios,
  nomePorPessoaId,
  locais,
  permissoes,
  onAlterado,
  leitura,
  onTentarDeNovo,
}: FilaAlertasFimDoDiaProps) {
  const { t } = useTranslation();
  const [tolerancia, setTolerancia] = useState<string>("0");
  const [pedido, setPedido] = useState<Pedido | null>(null);

  const minutosMinimos = Number(tolerancia);
  const visiveis = useMemo(() => filtrarDesviosPorTolerancia(desvios, minutosMinimos), [desvios, minutosMinimos]);
  const grupos = useMemo(() => agruparDesviosPorDia(visiveis), [visiveis]);
  const nomeDe = (pessoaId: string): string => nomePorPessoaId.get(pessoaId) ?? pessoaId;
  const falhou = leituraFalhou(leitura);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("rhExemplo.pic.filaTitulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("rhExemplo.pic.real.ajuda")}</p>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="rhb-fila-tolerancia">{t("hr.assiduidade.desvios.tolerancia")}</Label>
            <NativeSelect
              id="rhb-fila-tolerancia"
              className="w-56"
              value={tolerancia}
              onValueChange={setTolerancia}
              options={TOLERANCIAS_DESVIO.map((valor) => ({
                value: valor,
                label: valor === "0" ? t("hr.assiduidade.desvios.semTolerancia") : t("hr.assiduidade.desvios.ignorarAbaixoDe", { minutos: valor }),
              }))}
            />
          </div>
          {!falhou && (
            <p aria-live="polite" className="pb-2 text-sm text-muted-foreground">
              {minutosMinimos > 0
                ? t("hr.assiduidade.desvios.contagemFiltrada", { quantos: String(visiveis.length), minutos: tolerancia })
                : t("hr.assiduidade.desvios.contagem", { quantos: String(visiveis.length) })}
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {pedido && (
          <AccaoDoDesvio
            key={chaveDoDesvio(pedido.desvio, 0) + pedido.accao}
            desvio={pedido.desvio}
            accao={pedido.accao}
            nome={nomeDe(pedido.desvio.pessoa_id)}
            locais={locais}
            onAlterado={onAlterado}
            onFechar={() => setPedido(null)}
          />
        )}

        {leitura && <AvisoDeLeitura estado={leitura} onTentarDeNovo={onTentarDeNovo} />}

        {grupos.length === 0 ? falhou ? null : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {minutosMinimos > 0
              ? t("hr.assiduidade.desvios.vazioFiltrado", { minutos: tolerancia })
              : t("hr.assiduidade.desvios.vazio")}
          </p>
        ) : (
          <div className="space-y-4">
            {grupos.map(([data, doDia]) => (
              <section key={data} aria-label={formatarData(data)}>
                <h3 className="pb-1 text-sm font-semibold tabular-nums">{formatarData(data)}</h3>
                <ul className="divide-y">
                  {doDia.map((desvio, indice) => {
                    const chave = chaveDoDesvio(desvio, indice);
                    return (
                      <AlertaLinha
                        key={chave}
                        desvio={desvio}
                        chave={chave}
                        nome={nomeDe(desvio.pessoa_id)}
                        accoes={accoesPermitidas(desvio, permissoes)}
                        onAccao={(d, accao) => setPedido({ desvio: d, accao })}
                      />
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
