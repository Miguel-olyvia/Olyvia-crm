/**
 * O historico de versoes do horario semanal, lido da base: nunca se apaga nem se reescreve. Cada linha mostra o tipo,
 * o periodo, as horas por semana e se contem uma correcao. Corrigir o passado e feito intervalo a intervalo
 * (`rpc_hr_planeado_corrigir`, motivo obrigatorio e permissao propria): o botao abre a lista dos intervalos da versao e
 * cada um abre o painel de correcao da ficha. So as versoes ja fechadas se corrigem; as que estao em vigor alteram-se.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { formatarData, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { DESDE_SEMPRE, type VersaoReal } from "@/components/rh-exemplo/lib/horarioReal";
import type { HorarioPlaneado } from "@/components/rh-exemplo/tipos";

interface HistoricoVersoesProps {
  versoes: VersaoReal[];
  /** Mostra «Corrigir» nas versoes que ja cobrem so o passado. */
  podeCorrigir: boolean;
  onCorrigirLinha?: (linha: HorarioPlaneado) => void;
}

function IntervalosCorrigiveis({ versao, onCorrigirLinha }: { versao: VersaoReal; onCorrigirLinha: (linha: HorarioPlaneado) => void }) {
  const { t } = useTranslation();
  const linhas = [...versao.linhas].sort((a, b) => ((a.dia_semana ?? 0) + 6) % 7 - (((b.dia_semana ?? 0) + 6) % 7) || a.ordem - b.ordem);
  return (
    <ul className="space-y-1" aria-label={t("rhExemplo.hor.real.corrigirIntervalos")}>
      {linhas.map((linha) => {
        const dia = t(`rhExemplo.hor.dia.${linha.dia_semana ?? 0}`);
        return (
          <li key={linha.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
            <span className="tabular-nums">
              {linha.nao_trabalha
                ? t("rhExemplo.hor.real.intervaloFolga", { dia })
                : t("rhExemplo.hor.real.intervalo", { dia, inicio: (linha.hora_inicio ?? "").slice(0, 5), fim: (linha.hora_fim ?? "").slice(0, 5) })}
            </span>
            <Button type="button" size="sm" variant="ghost" className="ml-auto min-h-11" onClick={() => onCorrigirLinha(linha)}>
              {t("rhExemplo.hor.corrigirBotao")}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export function HistoricoVersoes({ versoes, podeCorrigir, onCorrigirLinha }: HistoricoVersoesProps) {
  const { t } = useTranslation();
  const [aberta, setAberta] = useState<string | null>(null);

  return (
    <section aria-labelledby="rhb-hist-titulo" className="space-y-2">
      <h3 id="rhb-hist-titulo" className="text-sm font-medium text-muted-foreground">
        {t("rhExemplo.hor.historicoTitulo")}
      </h3>
      {versoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("rhExemplo.hor.real.semHistorico")}</p>
      ) : (
        <ul className="space-y-2">
          {versoes.map((versao) => {
            const corrigivel = podeCorrigir && onCorrigirLinha !== undefined && versao.estado === "fechada";
            return (
              <li key={versao.chave} className="space-y-2 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={versao.estado === "em_vigor" ? "default" : "outline"} className="font-normal">
                    {t(`rhExemplo.hor.estadoVersao.${versao.estado}`)}
                  </Badge>
                  <span className="font-medium">{t(`rhExemplo.hor.tipo.${versao.tipo}`)}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {versao.desde && versao.desde !== DESDE_SEMPRE ? formatarData(versao.desde) : t("rhExemplo.hor.real.desdeSempre")}
                    {" — "}
                    {versao.ate ? formatarData(versao.ate) : t("rhExemplo.hor.emAberto")}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {t("rhExemplo.hor.porSemana", { horas: formatarHorasMinutos(versao.minutosSemana) })}
                  </span>
                  {versao.corrigida && (
                    <Badge variant="outline" className="border-amber-600 font-normal text-amber-800 dark:text-amber-300">
                      {t("rhExemplo.hor.real.correccaoMarcada")}
                    </Badge>
                  )}
                  {corrigivel && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="ml-auto min-h-11"
                      aria-expanded={aberta === versao.chave}
                      onClick={() => setAberta(aberta === versao.chave ? null : versao.chave)}
                    >
                      {t("rhExemplo.hor.corrigirBotao")}
                    </Button>
                  )}
                </div>
                {versao.motivoCorreccao && (
                  <p className="text-xs text-muted-foreground">{t("rhExemplo.hor.real.correccaoMotivo", { motivo: versao.motivoCorreccao })}</p>
                )}
                {corrigivel && aberta === versao.chave && onCorrigirLinha && (
                  <IntervalosCorrigiveis versao={versao} onCorrigirLinha={onCorrigirLinha} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
