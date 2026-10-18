import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { DashboardCarregando, DashboardErro, DashboardVazio } from "./EstadosDashboard";
import { EvolucaoMensal } from "./EvolucaoMensal";
import { FunilAbordagem } from "./FunilAbordagem";
import { MetasComerciais } from "./MetasComerciais";
import { MetasMes } from "./MetasMes";
import { NumerosQuadro } from "./NumerosQuadro";
import type { DadosFunil } from "./percursoNegocio";
import { filtrarPorComercial } from "./comparativoComerciais";
import { ritmoEsperado } from "./estadoMeta";
import { FOCO } from "./estilos";
import { TRANSICAO } from "./estilosDashboard";
import { numerosDashboard } from "./logicaQuadro";
import {
  cartoesDoMes, evolucaoMensal, totaisPorComercial, type DadosNegocioMetas,
} from "./negocioMetas";

export type EstadoDashboard = "pronto" | "carregando" | "vazio" | "erro";

interface DashboardNegociosProps {
  dados: DadosNegocioMetas;
  /** Para simular carga, vazio e erro (nos testes e até haver dados reais). */
  estado?: EstadoDashboard;
  aoTentarDeNovo?: () => void;
  aoIrParaQuadro?: () => void;
  /** O funil da abordagem, à parte das metas; sem ele, a secção não aparece. */
  funil?: DadosFunil;
  /** Dia de hoje, para o ritmo esperado do mês (por omissão, a data atual). */
  hoje?: Date;
}

/** Aba Dashboard: metas do mês em foco, comparativo por comercial, números do Quadro e evolução. */
export function DashboardNegocios({
  dados, estado = "pronto", aoTentarDeNovo, aoIrParaQuadro, hoje, funil,
}: DashboardNegociosProps) {
  const { t } = useTranslation();
  const [comercial, setComercial] = useState<string | null>(null);
  const ritmo = ritmoEsperado(dados.mesAtual, hoje ?? new Date());
  const cartoes = useMemo(() => cartoesDoMes(dados.negocios, dados.metasMes), [dados]);
  const totais = useMemo(
    () => totaisPorComercial(dados.negocios, dados.metasComerciais),
    [dados],
  );
  const numeros = useMemo(
    () => numerosDashboard(filtrarPorComercial(dados.negocios, comercial)),
    [dados, comercial],
  );
  const evolucao = useMemo(() => evolucaoMensal(dados), [dados]);

  if (estado === "carregando") return <DashboardCarregando />;
  if (estado === "erro") return <DashboardErro aoTentarDeNovo={aoTentarDeNovo} />;
  if (estado === "vazio" || dados.negocios.length === 0) {
    return <DashboardVazio aoIrParaQuadro={aoIrParaQuadro} />;
  }

  return (
    <div className="space-y-6">
      {comercial !== null && (
        <button
          type="button"
          onClick={() => setComercial(null)}
          aria-label={t("businessGoals.reps.clear")}
          className={cn(
            "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-primary bg-primary/10 px-4 text-sm font-medium text-foreground hover:bg-primary/20",
            TRANSICAO, FOCO,
          )}
        >
          <span>{t("businessGoals.reps.viewing", { name: comercial })}</span>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <MetasMes
        cartoes={cartoes}
        ritmo={ritmo}
        nota={comercial ? t("businessGoals.reps.teamNote") : undefined}
      />
      <MetasComerciais
        totais={totais} ritmo={ritmo} selecionado={comercial} aoSelecionar={setComercial}
      />
      <NumerosQuadro numeros={numeros} comValor={comercial !== null} />
      {funil && <FunilAbordagem funil={funil} />}
      <EvolucaoMensal meses={evolucao} />
    </div>
  );
}
