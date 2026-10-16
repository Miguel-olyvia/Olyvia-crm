// A aba "Contrato e local" do painel "Nova pessoa": centro de trabalho (e a filial), responsável direto, cargo e admissão, e o
// contrato (tipo, regime, modalidade, datas, período experimental). As horas e o horário estão em `ContratoHoras`. Data de
// admissão, cargo e tipo de contrato são do RH e obrigatórios; centro e responsável são opcionais.
import { useMemo } from "react";
import { CampoTexto } from "@/components/hr/form/Campos";
import { useCargos } from "@/hooks/useCargos";
import { useFiliaisDaArvore } from "@/hooks/useFiliaisDaArvore";
import { useLocaisTrabalho } from "@/hooks/useLocaisTrabalho";
import { dataFimPorDuracaoMeses } from "@/lib/hr/novaPessoaDatas";
import { numeroDe } from "@/lib/hr/numeros";
import { sugerirPeriodoExperimentalDias } from "@/lib/hr/periodoExperimental";
import {
  CATEGORIAS_FUNCAO, REGIMES_CONTRATUAIS, REGIMES_TRABALHO, TIPOS_CONTRATO, TIPOS_TRABALHO,
} from "@/types/hr";
import { useTranslation } from "@/hooks/useTranslation";
import { CampoI, CampoS, CampoT, GRELHA, LinhaCampo } from "./camposNova";
import { useNova } from "./contextoNova";
import { ContratoHoras } from "./ContratoHoras";
import { opcoes, SIM_NAO } from "./opcoesNova";
import { SeccaoNova } from "./SeccaoNova";

function LocalEChefia() {
  const { t } = useTranslation();
  const { valores, colegas } = useNova();
  const { locais } = useLocaisTrabalho();
  const { filiais } = useFiliaisDaArvore();
  const filial = useMemo(() => {
    const no = locais.find((l) => l.id === valores.laborais.local_id)?.organograma_node_id;
    return filiais.find((f) => f.id === no)?.name ?? null;
  }, [locais, filiais, valores.laborais.local_id]);
  return (
    <SeccaoNova titulo={t("rhNova.sec.local")}>
      <div className={GRELHA}>
        <CampoS
          g="laborais" k="local_id" id="hr-novo-local" codigo="local_trabalho" rotulo={t("hr.laborais.local")}
          opcoes={locais.map((l) => ({ value: l.id, label: l.nome }))} vazio={t("rhNova.semLocal")}
          ajuda={filial ? t("rhNova.h.filial", { nome: filial }) : t("rhNova.h.local")}
        />
        <CampoS
          g="laborais" k="reporta_a_pessoa_id" id="hr-novo-reporta-a" codigo="reporta_a" rotulo={t("rhNova.f.reportaA")}
          opcoes={colegas.map((c) => ({ value: c.id, label: c.nome_completo }))} vazio={t("rhNova.semResponsavel")}
          ajuda={t("rhNova.h.reportaA")}
        />
      </div>
    </SeccaoNova>
  );
}

function CargoEAdmissao() {
  const { t } = useTranslation();
  const { cargos } = useCargos();
  return (
    <SeccaoNova titulo={t("rhNova.sec.cargo")}>
      <div className={GRELHA}>
        <CampoS
          g="laborais" k="cargo_id" id="hr-novo-cargo" codigo="cargo" rotulo={t("hr.laborais.cargoCatalogo")}
          opcoes={cargos.filter((c) => c.activo).map((c) => ({ value: c.id, label: c.nome }))} ajuda={t("rhNova.h.cargo")}
        />
        <CampoT g="geral" k="numero_interno" id="hr-novo-numero-interno" rotulo={t("hr.laborais.numeroInterno")} />
        <CampoT g="laborais" k="data_admissao" id="hr-novo-data-admissao" codigo="data_admissao" tipo="date" rotulo={t("rhNova.f.dataAdmissao")} />
        <CampoT g="laborais" k="data_antiguidade" id="hr-novo-data-antiguidade" tipo="date" rotulo={t("hr.laborais.dataAntiguidade")} ajuda={t("rhNova.h.antiguidade")} />
        <CampoT g="extra" k="categoria_profissional" id="hr-novo-categoria-profissional" rotulo={t("hr.contrato.categoriaProfissional")} ajuda={t("hr.contrato.ajudaCategoriaProfissional")} />
        <CampoS
          g="extra" k="categoria_funcao" id="hr-novo-categoria-funcao" rotulo={t("hr.contrato.categoriaFuncao")}
          opcoes={opcoes(t, "hr.categoriaFuncao", CATEGORIAS_FUNCAO)} vazio={t("rhNova.semIndicacao")} ajuda={t("hr.contrato.ajudaCategoriaFuncao")}
        />
      </div>
    </SeccaoNova>
  );
}

function DuracaoEFim() {
  const { t } = useTranslation();
  const ctx = useNova();
  const c = ctx.valores.contrato;
  const recalcular = (meses: string) => {
    const n = numeroDe(meses);
    const fim = n !== null && c.data_inicio !== "" ? dataFimPorDuracaoMeses(c.data_inicio, n) : null;
    ctx.alterar("contrato", { duracao_meses: meses, ...(fim ? { data_fim: fim } : {}) });
  };
  return (
    <>
      {c.tipo_contrato === "termo_certo" && (
        <LinhaCampo id="hr-novo-duracao-meses">
          <CampoTexto
            id="hr-novo-duracao-meses" label={t("hr.contrato.duracaoMeses")} valor={c.duracao_meses} onChange={recalcular}
            tipo="number" min={1} ajuda={t("hr.contrato.ajudaDuracaoMeses")}
          />
        </LinhaCampo>
      )}
      <CampoT g="contrato" k="data_fim" id="hr-novo-data-fim" tipo="date" rotulo={t("hr.contrato.dataFim")} min={c.data_inicio || undefined} />
      <CampoS
        g="extra" k="renovavel" id="hr-novo-renovavel" rotulo={t("hr.contrato.renovavel")} opcoes={opcoes(t, "rhNova.simNao", SIM_NAO)}
        vazio={t("rhNova.porDecidir")}
      />
    </>
  );
}

function PeriodoExperimental() {
  const { t } = useTranslation();
  const { valores } = useNova();
  const c = valores.contrato;
  const sugestao = c.tipo_contrato === "" ? null : sugerirPeriodoExperimentalDias({
    tipoContrato: c.tipo_contrato, categoriaFuncao: valores.extra.categoria_funcao || "geral",
    dataInicio: c.data_inicio, dataFim: c.data_fim,
  });
  return (
    <>
      <CampoI g="contrato" k="tem_periodo_experimental" id="hr-novo-tem-experimental" rotulo={t("hr.contrato.temExperimental")} />
      {c.tem_periodo_experimental && (
        <CampoT
          g="contrato" k="periodo_experimental_dias" id="hr-novo-periodo-experimental-dias" tipo="number" min={0}
          rotulo={t("hr.contrato.periodoExperimentalDias")}
          ajuda={sugestao ? t("rhNova.h.experimentalSugestao", { dias: sugestao.dias, motivo: t(sugestao.motivoKey) }) : undefined}
        />
      )}
    </>
  );
}

function Contrato() {
  const { t } = useTranslation();
  const { valores } = useNova();
  const comTermo = valores.contrato.tipo_contrato !== "" && valores.contrato.tipo_contrato !== "sem_termo";
  return (
    <SeccaoNova titulo={t("rhNova.sec.contrato")}>
      <div className={GRELHA}>
        <CampoS g="contrato" k="tipo_contrato" id="hr-novo-tipo-contrato" codigo="tipo_contrato" rotulo={t("hr.contrato.tipoContrato")} opcoes={opcoes(t, "hr.tipoContrato", TIPOS_CONTRATO)} />
        <CampoS g="contrato" k="regime_contratual" id="hr-novo-regime-contratual" rotulo={t("hr.contrato.regimeContratual")} opcoes={opcoes(t, "hr.regimeContratual", REGIMES_CONTRATUAIS)} ajuda={t("hr.contrato.ajudaRegimeContratual")} />
        <CampoS g="contrato" k="regime" id="hr-novo-regime" rotulo={t("hr.contrato.regime")} opcoes={opcoes(t, "hr.regime", REGIMES_TRABALHO)} ajuda={t("hr.contrato.ajudaRegime")} />
        <CampoS g="contrato" k="tipo_trabalho" id="hr-novo-tipo-trabalho" rotulo={t("hr.contrato.tipoTrabalho")} opcoes={opcoes(t, "hr.tipoTrabalho", TIPOS_TRABALHO)} vazio={t("rhNova.semIndicacao")} ajuda={t("hr.contrato.ajudaTipoTrabalho")} />
        <CampoT g="contrato" k="data_inicio" id="hr-novo-data-inicio" tipo="date" rotulo={t("hr.contrato.dataInicio")} ajuda={t("rhNova.h.dataInicio")} />
        {comTermo && <DuracaoEFim />}
        <PeriodoExperimental />
      </div>
    </SeccaoNova>
  );
}

export function AbaContrato() {
  return (
    <div className="space-y-4">
      <LocalEChefia />
      <CargoEAdmissao />
      <Contrato />
      <ContratoHoras />
    </div>
  );
}
