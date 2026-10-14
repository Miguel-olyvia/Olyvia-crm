// A aba "Contrato e local" do painel "Nova pessoa": centro de trabalho (e a filial a que pertence), cargo, chefia, tipo de
// contrato, datas, horas e retribuição. Centro e cargo são obrigatórios; o fim só se pede num contrato com termo.
import { useMemo } from "react";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { CampoSelect, CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { useCargos } from "@/components/rh-exemplo/hooks/useCargos";
import { useFiliaisDaArvore } from "@/components/rh-exemplo/hooks/useFiliaisDaArvore";
import { useLocaisTrabalho } from "@/components/rh-exemplo/hooks/useLocaisTrabalho";
import { TIPOS_CONTRATO, type TipoContrato } from "@/components/rh-exemplo/tipos";
import { useTranslation } from "@/hooks/useTranslation";
import { idCampo, type CamposNovaProps } from "./tiposCampos";

const GRELHA = "grid gap-4 sm:grid-cols-2";

interface ContratoProps extends CamposNovaProps {
  colegas: ReadonlyArray<{ id: string; nome_completo: string }>;
}

export function CamposContrato({ valores, definir, erro, colegas }: ContratoProps) {
  const { t } = useTranslation();
  const { cargos } = useCargos();
  const { locais } = useLocaisTrabalho();
  const { filiais } = useFiliaisDaArvore();
  const filial = useMemo(() => {
    const no = locais.find((l) => l.id === valores.localId)?.organograma_node_id;
    return filiais.find((f) => f.id === no)?.name ?? null;
  }, [locais, filiais, valores.localId]);
  const comTermo = valores.tipoContrato !== "sem_termo";
  return (
    <div className="space-y-4">
      <Seccao titulo={t("rhForm.nova.sec.local")}>
        <div className={GRELHA}>
          <CampoSelect
            id={idCampo("localId")} label={t("rhForm.nova.f.localId")} valor={valores.localId} obrigatorio
            placeholder={t("rhForm.nova.escolher")} erro={erro("localId")} onChange={(v) => definir({ localId: v })}
            ajuda={filial ? t("rhForm.nova.h.filial", { nome: filial }) : undefined}
            opcoes={locais.map((l) => ({ value: l.id, label: l.nome }))}
          />
          <CampoSelect
            id={idCampo("cargoId")} label={t("rhForm.nova.f.cargoId")} valor={valores.cargoId} obrigatorio
            placeholder={t("rhForm.nova.escolher")} erro={erro("cargoId")} onChange={(v) => definir({ cargoId: v })}
            opcoes={cargos.filter((c) => c.activo).map((c) => ({ value: c.id, label: c.nome }))}
          />
          <CampoSelect
            id="rh-nova-chefiaId" label={t("rhForm.nova.f.chefiaId")} valor={valores.chefiaId} vazioLabel={t("rhForm.nova.semChefia")}
            onChange={(v) => definir({ chefiaId: v })}
            opcoes={colegas.map((c) => ({ value: c.id, label: c.nome_completo }))}
          />
        </div>
      </Seccao>
      <Seccao titulo={t("rhForm.nova.sec.contrato")}>
        <div className={GRELHA}>
          <CampoSelect
            id="rh-nova-tipoContrato" label={t("rhForm.nova.f.tipoContrato")} valor={valores.tipoContrato}
            onChange={(v) => definir({ tipoContrato: v as TipoContrato })}
            opcoes={TIPOS_CONTRATO.map((tipo) => ({ value: tipo, label: t(`hr.tipoContrato.${tipo}`) }))}
          />
          <CampoTexto
            id={idCampo("dataInicio")} label={t("rhForm.nova.f.dataInicio")} tipo="date" valor={valores.dataInicio} obrigatorio
            erro={erro("dataInicio")} onChange={(v) => definir({ dataInicio: v })}
          />
          {comTermo && (
            <CampoTexto
              id={idCampo("dataFim")} label={t("rhForm.nova.f.dataFim")} tipo="date" valor={valores.dataFim} obrigatorio
              min={valores.dataInicio || undefined} erro={erro("dataFim")} onChange={(v) => definir({ dataFim: v })}
            />
          )}
        </div>
      </Seccao>
      <Seccao titulo={t("rhForm.nova.sec.horas")}>
        <div className={GRELHA}>
          <CampoTexto
            id={idCampo("horas")} label={t("rhForm.nova.f.horas")} tipo="text" valor={valores.horas}
            ajuda={t("rhForm.nova.h.horas")} erro={erro("horas")} onChange={(v) => definir({ horas: v })}
          />
          <CampoTexto
            id={idCampo("retribuicao")} label={t("rhForm.nova.f.retribuicao")} tipo="text" valor={valores.retribuicao}
            erro={erro("retribuicao")} onChange={(v) => definir({ retribuicao: v })}
          />
        </div>
      </Seccao>
    </div>
  );
}
