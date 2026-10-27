/**
 * O tipo de horario e as suas versoes, no topo do separador Horario da ficha, lidos do horario planeado REAL
 * (`pessoas_horario_planeado`, entregue pela ficha). Mostra a versao em vigor, as horas planeadas por semana e o aviso
 * se o total difere das horas contratadas; deixa criar uma NOVA VERSAO (padrao ou repartido, a partir de hoje) e uma
 * excepcao de um dia, e lista o historico, onde se CORRIGE o passado intervalo a intervalo (com motivo e permissao).
 *
 * O que a base nao guarda nao aparece aqui: tipos isencao/livre/banco, anexo e motivo de uma versao, e tolerancia de
 * atraso (a base nao calcula tolerancias).
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { formatarData, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { ExcecaoDeDia } from "@/components/rh-exemplo/fluxosB/horario/ExcecaoDeDia";
import { HistoricoVersoes } from "@/components/rh-exemplo/fluxosB/horario/HistoricoVersoes";
import { NovaVersaoForm } from "@/components/rh-exemplo/fluxosB/horario/NovaVersaoForm";
import { hojeIsoServidor, type LinhaPlaneadoParaGravar } from "@/components/rh-exemplo/lib/horario";
import {
  avisoContratadasMin,
  excecoesDoPlaneado,
  linhasEditaveis,
  versaoEmVigorReal,
  versoesDoPlaneado,
} from "@/components/rh-exemplo/lib/horarioReal";
import type { HorarioPlaneado } from "@/components/rh-exemplo/tipos";

interface HorarioTipoPainelProps {
  /** As linhas de `pessoas_horario_planeado` da pessoa (`ficha.horarioPlaneado`). */
  planeado: HorarioPlaneado[];
  podeEditar: boolean;
  podeCorrigir: boolean;
  horasContratadasSemanais: number | null;
  saving: boolean;
  /** ALTERAR (`savePlaneado`): devolve `null` em sucesso ou a mensagem do erro. */
  onGuardarPlaneado: (linhas: LinhaPlaneadoParaGravar[]) => Promise<string | null>;
  /** Abre a correccao (`corrigirPlaneado`) de um intervalo ja decorrido. Sem isto nao ha botao de corrigir. */
  onCorrigirLinha?: (linha: HorarioPlaneado) => void;
}

type Modo = "nova" | "excecao" | null;

export function HorarioTipoPainel({
  planeado, podeEditar, podeCorrigir, horasContratadasSemanais, saving, onGuardarPlaneado, onCorrigirLinha,
}: HorarioTipoPainelProps) {
  const { t } = useTranslation();
  const [modo, setModo] = useState<Modo>(null);
  const hoje = hojeIsoServidor();
  const versoes = useMemo(() => versoesDoPlaneado(planeado, hoje), [planeado, hoje]);
  const editaveis = useMemo(() => linhasEditaveis(planeado, hoje), [planeado, hoje]);
  const excecoes = useMemo(() => excecoesDoPlaneado(editaveis), [editaveis]);
  const vigente = versaoEmVigorReal(versoes);
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
              <Badge className="font-normal">{t(`rhExemplo.hor.tipo.${vigente.tipo}`)}</Badge>
              <span className="text-sm text-muted-foreground">
                {vigente.desde ? t("rhExemplo.hor.desde", { data: formatarData(vigente.desde) }) : t("rhExemplo.hor.real.desdeSempre")}
              </span>
              <span className="text-sm font-medium tabular-nums">
                {t("rhExemplo.hor.porSemana", { horas: formatarHorasMinutos(vigente.minutosSemana) })}
              </span>
            </div>
            {avisoContratadasMin(vigente.minutosSemana, horasContratadasSemanais) && (
              <p className="text-sm text-amber-800 dark:text-amber-300">
                {t("rhExemplo.hor.avisoContratadas", { horas: String(horasContratadasSemanais ?? 0) })}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("rhExemplo.hor.semVersao")}</p>
        )}

        {podeEditar && modo === null && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" disabled={saving} onClick={() => setModo("nova")}>
              {t("rhExemplo.hor.novaVersaoBotao")}
            </Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => setModo("excecao")}>
              {t("rhExemplo.hor.excecaoBotao")}
            </Button>
          </div>
        )}

        {modo === "nova" && (
          <NovaVersaoForm
            key="nova"
            versaoBase={vigente}
            editaveis={editaveis}
            aGravar={saving}
            onGuardar={onGuardarPlaneado}
            onFechar={fechar}
            idPrefixo="rhb-nova"
          />
        )}
        {modo === "excecao" && (
          <ExcecaoDeDia
            excecoes={excecoes}
            editaveis={editaveis}
            podeEditar={podeEditar}
            aGravar={saving}
            onGuardar={onGuardarPlaneado}
            onFechar={fechar}
          />
        )}

        <HistoricoVersoes
          versoes={versoes}
          podeCorrigir={podeCorrigir}
          onCorrigirLinha={onCorrigirLinha}
        />
      </CardContent>
    </Card>
  );
}
