/**
 * As justificações de dias com falta sugerida ou atraso, por decidir, como linhas da fila de trabalho do RH (separador
 * «Fila de trabalho» do mapa de assiduidade): chip de texto, pessoa, dia, tipo, motivo resumido, há quanto tempo e os
 * botões Aceitar e Recusar. Decidida, a linha sai daqui; o calendário da pessoa, o mapa e o cálculo do mês acompanham.
 * Um motivo de consulta médica é dado de saúde: não se mostra na fila, só no dia da pessoa com «Ver texto».
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { decidirJustificacaoDeDia } from "@/components/rh-exemplo/dados/accoesJustificacaoDia";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useJustificacaoDia } from "@/components/rh-exemplo/dados/lojaJustificacaoDia";
import { formatarData } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import {
  diasDesdeEnvio,
  resumoDoMotivo,
  textoEhSensivel,
  type DecisaoJustificacaoDia,
  type JustificacaoDia,
} from "@/components/rh-exemplo/lib/justificacaoDia";
import { useTranslation } from "@/hooks/useTranslation";
import { DialogosDecisaoDia, type PedidoDecisaoDia } from "./DialogosDecisaoDia";
import { porDecidir } from "./usePendentesJustificacaoDia";
import { textoDaDecisao } from "./textoDaDecisao";

interface LinhaProps {
  j: JustificacaoDia;
  nome: string;
  hoje: string;
  aoPedir: (j: JustificacaoDia, tipo: "aceitar" | "recusar") => void;
}

function Linha({ j, nome, hoje, aoPedir }: LinhaProps) {
  const { t } = useTranslation();
  const dias = diasDesdeEnvio(j.enviadaEm, hoje);
  const dia = formatarData(j.data);
  return (
    <li data-testid={`rhjd-fila-${j.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
      <span className="min-w-40 font-medium">{nome}</span>
      <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
        {t("rhJust.fila.chip")}
      </span>
      <span className="tabular-nums text-muted-foreground">{dia}</span>
      <span>{t(`rhJust.tipo.${j.tipo}`)}</span>
      <span className="min-w-0 flex-1 basis-60 text-muted-foreground">{textoEhSensivel(j) ? t("rhJust.rh.textoReservado") : resumoDoMotivo(j.motivo)}</span>
      <span className="text-xs text-muted-foreground">{dias === 0 ? t("rhJust.fila.hoje") : t("rhJust.fila.haDias", { n: String(dias) })}</span>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button type="button" size="sm" className="min-h-11" aria-label={t("rhJust.rh.ariaAceitar", { pessoa: nome, dia })} onClick={() => aoPedir(j, "aceitar")}>
          {t("rhJust.rh.aceitar")}
        </Button>
        <Button type="button" size="sm" variant="outline" className="min-h-11" aria-label={t("rhJust.rh.ariaRecusar", { pessoa: nome, dia })} onClick={() => aoPedir(j, "recusar")}>
          {t("rhJust.rh.recusar")}
        </Button>
      </div>
    </li>
  );
}

export function FilaJustificacoesDoDia() {
  const { t } = useTranslation();
  const todas = useJustificacaoDia((e) => e.justificacoes);
  const fichas = useEstadoRh((e) => e.fichas);
  const [pedido, setPedido] = useState<PedidoDecisaoDia | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const pendentes = useMemo(() => todas.filter(porDecidir).sort((a, b) => b.data.localeCompare(a.data)), [todas]);
  const nome = (id: string): string => fichas[id]?.pessoa.nome_completo ?? id;

  const decidir = (j: JustificacaoDia, decisao: DecisaoJustificacaoDia, motivo: string): string | null => {
    const resultado = decidirJustificacaoDeDia(j.id, decisao, motivo);
    if (resultado.erro) return resultado.erro;
    setAviso(textoDaDecisao(t, decisao, resultado));
    return null;
  };

  return (
    <Card aria-labelledby="rhjd-fila-titulo" data-testid="rhjd-fila">
      <CardHeader className="pb-3">
        <CardTitle id="rhjd-fila-titulo" className="text-base">{t("rhJust.fila.titulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("rhJust.fila.ajuda")}</p>
        <p aria-live="polite" className="text-sm text-muted-foreground">{t("rhJust.fila.contagem", { n: String(pendentes.length) })}</p>
        {aviso && <p role="status" className="text-sm font-medium" data-testid="rhjd-fila-aviso">{aviso}</p>}
      </CardHeader>
      <CardContent>
        {pendentes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("rhJust.fila.vazia")}</p>
        ) : (
          <ul className="divide-y">
            {pendentes.map((j) => (
              <Linha
                key={j.id} j={j} nome={nome(j.pessoaId)} hoje={hojeIso()}
                aoPedir={(x, tipo) => setPedido({ justificacao: x, tipo, pessoaNome: nome(x.pessoaId) })}
              />
            ))}
          </ul>
        )}
      </CardContent>
      <DialogosDecisaoDia pedido={pedido} aoFechar={() => setPedido(null)} aoDecidir={decidir} />
    </Card>
  );
}
