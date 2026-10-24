/**
 * O tipo de horario e as suas versoes (fluxo 4), no topo do separador Horario da ficha. Mostra o tipo em vigor,
 * as horas planeadas por semana, a regra de tolerancia de atraso e o aviso se o total difere das horas
 * contratadas; deixa criar uma NOVA VERSAO (com motivo), uma excepcao de um dia e CORRIGIR o passado (com
 * autorizacao); e lista o historico de versoes, que nunca se apaga.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { formatarData, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { ExcecaoDeDia } from "@/components/rh-exemplo/fluxosB/horario/ExcecaoDeDia";
import { HistoricoVersoes } from "@/components/rh-exemplo/fluxosB/horario/HistoricoVersoes";
import { NovaVersaoForm } from "@/components/rh-exemplo/fluxosB/horario/NovaVersaoForm";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import {
  TOLERANCIA_ATRASO_MINUTOS,
  avisoContratadas,
  configInicial,
  minutosPlaneadosDaSemana,
  versaoEmVigor,
  type HorarioPessoa,
  type VersaoHorario,
} from "@/components/rh-exemplo/lib/horarioTipos";

interface HorarioTipoPainelProps {
  pessoaId: string;
  podeEditar: boolean;
  podeCorrigir: boolean;
  horasContratadasSemanais: number | null;
}

type Modo = { tipo: "nova" } | { tipo: "corrigir"; versao: VersaoHorario } | { tipo: "excecao" } | null;

const SEM_HORARIO: HorarioPessoa = { versoes: [], excecoes: [] };

export function HorarioTipoPainel({ pessoaId, podeEditar, podeCorrigir, horasContratadasSemanais }: HorarioTipoPainelProps) {
  const { t } = useTranslation();
  const horario = useFluxosB((e) => e.horarios[pessoaId]) ?? SEM_HORARIO;
  const [modo, setModo] = useState<Modo>(null);
  const hoje = hojeIso();
  const vigente = versaoEmVigor(horario, hoje);
  const fechar = () => setModo(null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("rhExemplo.hor.titulo")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {vigente ? (
          <div className="space-y-2" data-testid="rhb-horario-vigente">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="font-normal">{t(`rhExemplo.hor.tipo.${vigente.config.tipo}`)}</Badge>
              <span className="text-sm text-muted-foreground">
                {t("rhExemplo.hor.desde", { data: formatarData(vigente.desde) })}
              </span>
              <span className="text-sm font-medium tabular-nums">
                {t("rhExemplo.hor.porSemana", { horas: formatarHorasMinutos(minutosPlaneadosDaSemana(vigente.config)) })}
              </span>
            </div>
            {vigente.config.tipo === "isencao" && (
              <Badge variant="outline" className="font-normal">
                {t("rhExemplo.hor.marcaIsencao")}
              </Badge>
            )}
            {avisoContratadas(vigente.config, horasContratadasSemanais) && (
              <p className="text-sm text-amber-800 dark:text-amber-300">
                {t("rhExemplo.hor.avisoContratadas", { horas: String(horasContratadasSemanais ?? 0) })}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("rhExemplo.hor.semVersao")}</p>
        )}

        <p className="rounded-md border border-dashed p-3 text-sm">
          <span className="font-medium">{t("rhExemplo.hor.tolerancia")}: </span>
          {t("rhExemplo.hor.toleranciaRegra", { minutos: String(TOLERANCIA_ATRASO_MINUTOS) })}
        </p>

        {podeEditar && modo === null && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" onClick={() => setModo({ tipo: "nova" })}>
              {t("rhExemplo.hor.novaVersaoBotao")}
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setModo({ tipo: "excecao" })}>
              {t("rhExemplo.hor.excecaoBotao")}
            </Button>
          </div>
        )}

        {modo?.tipo === "nova" && (
          <NovaVersaoForm key="nova" pessoaId={pessoaId} configBase={vigente?.config ?? configInicial()} onFechar={fechar} idPrefixo="rhb-nova" />
        )}
        {modo?.tipo === "corrigir" && (
          <NovaVersaoForm key={modo.versao.id} pessoaId={pessoaId} configBase={modo.versao.config} corrigir={modo.versao} onFechar={fechar} idPrefixo="rhb-corr" />
        )}
        {modo?.tipo === "excecao" && (
          <ExcecaoDeDia pessoaId={pessoaId} excecoes={horario.excecoes} podeEditar={podeEditar} onFechar={fechar} />
        )}

        <HistoricoVersoes
          versoes={horario.versoes}
          hoje={hoje}
          podeCorrigir={podeCorrigir}
          onCorrigir={(versao) => setModo({ tipo: "corrigir", versao })}
        />
      </CardContent>
    </Card>
  );
}
