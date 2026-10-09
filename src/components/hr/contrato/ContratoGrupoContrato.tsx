/**
 * Grupo 1 do separador Contratos -- O contrato: o que se assina e sob que
 * categoria. Continua o MESMO cartao e o MESMO botao de gravar que os outros
 * grupos; so o titulo separa, para nao parecer que se grava cada bloco em
 * separado.
 */
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import { CamposModeloContrato } from "@/components/hr/contrato/CamposModeloContrato";
import { useTranslation } from "@/hooks/useTranslation";
import { tipoTemDuracaoEmMeses } from "@/lib/hr/contrato";
import {
  CATEGORIAS_FUNCAO,
  ESTADOS_VINCULO,
  type CategoriaFuncao,
  type EstadoVinculo,
  type TipoContrato,
} from "@/types/hr";
import type { DefinirCampo, RascunhoVinculo } from "./rascunhoVinculo";

interface ContratoGrupoContratoProps {
  rascunho: RascunhoVinculo;
  definir: DefinirCampo;
  podeEditar: boolean;
}

export function ContratoGrupoContrato({ rascunho, definir, podeEditar }: ContratoGrupoContratoProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h3 id="hr-contrato-grupo-contrato" className="text-sm font-medium">
        {t("hr.form.seccoes.vinculo")}
      </h3>
      <div
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-labelledby="hr-contrato-grupo-contrato"
      >
        <CamposModeloContrato
          idTipo="hr-contrato-tipo"
          idRegimeContratual="hr-contrato-regime-contratual"
          tipoContrato={rascunho.tipo_contrato}
          regimeContratual={rascunho.regime_contratual}
          disabled={!podeEditar}
          onTipoContrato={(tipo) => {
            // O campo do tipo deste ecra nunca fica vazio.
            if (tipo === "") return;
            definir("tipo_contrato", tipo as TipoContrato);
            // Os meses so valem no termo certo: ao sair dele esvaziam-se.
            if (!tipoTemDuracaoEmMeses(tipo)) definir("duracao_meses", "");
          }}
          onRegimeContratual={(regime) => definir("regime_contratual", regime)}
        />
        {/* Categoria do IRCT, texto livre -- NAO e `categoria_funcao`. Ver
            o comentario do tipo em `types/hr.ts`. */}
        <CampoTexto
          id="hr-contrato-categoria-profissional"
          label={t("hr.contrato.categoriaProfissional")}
          ajuda={t("hr.contrato.ajudaCategoriaProfissional")}
          valor={rascunho.categoria_profissional}
          disabled={!podeEditar}
          onChange={(v) => definir("categoria_profissional", v)}
        />
        {/* So alimenta a sugestao de periodo experimental -- ver
            `lib/hr/periodoExperimental.ts`. Nao vem de `pessoas.cargo`, que e
            texto livre. */}
        <CampoSelect
          id="hr-contrato-categoria-funcao"
          label={t("hr.contrato.categoriaFuncao")}
          ajuda={t("hr.contrato.ajudaCategoriaFuncao")}
          valor={rascunho.categoria_funcao ?? ""}
          vazioLabel={t("hr.campos.semValor")}
          disabled={!podeEditar}
          opcoes={CATEGORIAS_FUNCAO.map((categoria) => ({
            value: categoria,
            label: t(`hr.categoriaFuncao.${categoria}`),
          }))}
          onChange={(v) => definir("categoria_funcao", (v || null) as CategoriaFuncao | null)}
        />
        <CampoSelect
          id="hr-contrato-estado"
          label={t("hr.contrato.estado")}
          valor={rascunho.estado}
          disabled={!podeEditar}
          opcoes={ESTADOS_VINCULO.map((estado) => ({
            value: estado,
            label: t(`hr.estadoVinculo.${estado}`),
          }))}
          onChange={(v) => definir("estado", v as EstadoVinculo)}
        />
        <CampoSelect
          id="hr-contrato-renovavel"
          label={t("hr.contrato.renovavel")}
          valor={rascunho.renovavel}
          vazioLabel={t("hr.campos.porDecidir")}
          disabled={!podeEditar}
          opcoes={[
            { value: "sim", label: t("common.yes") },
            { value: "nao", label: t("common.no") },
          ]}
          onChange={(v) => definir("renovavel", v as "" | "sim" | "nao")}
        />
      </div>
    </div>
  );
}
