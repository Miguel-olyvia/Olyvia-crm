/**
 * O historico de versoes do horario: nunca se apaga nem se reescreve. Cada linha mostra o tipo, o periodo, o
 * motivo, quem e quando, o anexo, e se foi uma correccao autorizada (marcada) ou foi substituida por uma.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { formatarData, formatarDataHora, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { minutosPlaneadosDaSemana, type VersaoHorario } from "@/components/rh-exemplo/lib/horarioTipos";

interface HistoricoVersoesProps {
  versoes: VersaoHorario[];
  hoje: string;
  /** Mostra «Corrigir» nas versoes que ja cobrem o passado. */
  podeCorrigir: boolean;
  onCorrigir: (versao: VersaoHorario) => void;
}

function estadoDaVersao(versao: VersaoHorario, hoje: string): "substituida" | "em_vigor" | "futura" | "fechada" {
  if (versao.substituidaPor) return "substituida";
  if (versao.desde > hoje) return "futura";
  return versao.ate === null || versao.ate >= hoje ? "em_vigor" : "fechada";
}

export function HistoricoVersoes({ versoes, hoje, podeCorrigir, onCorrigir }: HistoricoVersoesProps) {
  const { t } = useTranslation();
  const ordenadas = [...versoes].sort((a, b) => b.desde.localeCompare(a.desde) || b.criadaEm.localeCompare(a.criadaEm));

  return (
    <section aria-labelledby="rhb-hist-titulo" className="space-y-2">
      <h3 id="rhb-hist-titulo" className="text-sm font-medium text-muted-foreground">
        {t("rhExemplo.hor.historicoTitulo")}
      </h3>
      <ul className="space-y-2">
        {ordenadas.map((versao) => {
          const estado = estadoDaVersao(versao, hoje);
          const esbatida = estado === "substituida";
          return (
            <li key={versao.id} className={`space-y-1 rounded-md border p-3 text-sm ${esbatida ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={estado === "em_vigor" ? "default" : "outline"} className="font-normal">
                  {t(`rhExemplo.hor.estadoVersao.${estado}`)}
                </Badge>
                <span className="font-medium">{t(`rhExemplo.hor.tipo.${versao.config.tipo}`)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatarData(versao.desde)} — {versao.ate ? formatarData(versao.ate) : t("rhExemplo.hor.emAberto")}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {t("rhExemplo.hor.porSemana", { horas: formatarHorasMinutos(minutosPlaneadosDaSemana(versao.config)) })}
                </span>
                {versao.correccao && (
                  <Badge variant="outline" className="border-amber-600 font-normal text-amber-800 dark:text-amber-300">
                    {t("rhExemplo.hor.correccaoAutorizada", { quem: versao.autorizadaPor ?? "" })}
                  </Badge>
                )}
                {podeCorrigir && !esbatida && versao.desde < hoje && (
                  <Button type="button" size="sm" variant="ghost" className="ml-auto min-h-11" onClick={() => onCorrigir(versao)}>
                    {t("rhExemplo.hor.corrigirBotao")}
                  </Button>
                )}
              </div>
              <p>
                <span className="text-muted-foreground">{t("rhExemplo.hor.motivo")}: </span>
                {versao.motivo}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("rhExemplo.hor.registadoPor", { quem: versao.autor, quando: formatarDataHora(versao.criadaEm) })}
                {versao.anexoNome ? ` · ${t("rhExemplo.hor.anexo")}: ${versao.anexoNome}` : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
