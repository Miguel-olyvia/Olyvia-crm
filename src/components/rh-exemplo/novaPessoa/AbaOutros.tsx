// A aba "Outros dados" do painel "Nova pessoa": habilitações, saúde (incapacidade e adaptações, nunca diagnósticos),
// sindicalização e fardamento. São os dados que a ficha real tem e que quase nunca se sabem no primeiro dia.
import { ShieldAlert } from "lucide-react";
import { HABILITACOES_ACADEMICAS, TAMANHOS_CALCADO, TAMANHOS_CALCAS, TAMANHOS_FARDAMENTO } from "@/components/rh-exemplo/tipos";
import { useTranslation } from "@/hooks/useTranslation";
import { CampoLongo, CampoS, CampoT, GRELHA } from "./camposNova";
import { useNova } from "./contextoNova";
import { opcoes, SIM_NAO } from "./opcoesNova";
import { SeccaoNova } from "./SeccaoNova";

function Habilitacoes() {
  const { t } = useTranslation();
  return (
    <SeccaoNova titulo={t("rhNova.sec.habilitacoes")} convite="habilitacoes">
      <div className={GRELHA}>
        <CampoS
          g="pessoais" k="habilitacao_academica" id="hr-novo-habilitacao" codigo="habilitacao_academica"
          rotulo={t("rhNova.f.habilitacao")} opcoes={opcoes(t, "hr.habilitacaoAcademica", HABILITACOES_ACADEMICAS)} vazio={t("rhNova.semIndicacao")}
        />
        <CampoT g="pessoais" k="habilitacao_data_conclusao" id="hr-novo-habilitacao-data" codigo="habilitacao_data_conclusao" tipo="date" rotulo={t("rhNova.f.habilitacaoData")} />
      </div>
    </SeccaoNova>
  );
}

function Saude() {
  const { t } = useTranslation();
  return (
    <SeccaoNova titulo={t("rhNova.sec.saude")}>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t("hr.saude.aviso")}
      </p>
      <div className={GRELHA}>
        <CampoT g="extra" k="saude_incapacidade" id="hr-novo-saude-incapacidade" rotulo={t("hr.campos.incapacidade")} ajuda={t("hr.form.erroPercentagem")} />
        <CampoT g="extra" k="saude_validade" id="hr-novo-saude-validade" tipo="date" rotulo={t("hr.campos.incapacidadeValidade")} />
        <CampoLongo g="extra" k="saude_adaptacoes" id="hr-novo-saude-adaptacoes" rotulo={t("hr.campos.necessidadesAdaptacao")} />
        <CampoLongo g="extra" k="saude_observacoes" id="hr-novo-saude-observacoes" rotulo={t("rhNova.f.saudeObservacoes")} />
      </div>
    </SeccaoNova>
  );
}

function Sindicalizacao() {
  const { t } = useTranslation();
  return (
    <SeccaoNova titulo={t("rhNova.sec.sindicalizacao")}>
      <div className={GRELHA}>
        <CampoS
          g="extra" k="sindicalizado" id="hr-novo-sindicalizado" rotulo={t("hr.pendencias.campo.sindicalizado")}
          opcoes={opcoes(t, "rhNova.simNao", SIM_NAO)} vazio={t("rhNova.porDecidir")}
        />
        <CampoT g="extra" k="sindicato" id="hr-novo-sindicato" rotulo={t("hr.pendencias.campo.sindicato")} />
        <CampoT g="extra" k="sindicato_quota" id="hr-novo-sindicato-quota" rotulo={t("rhNova.f.quota")} ajuda={t("hr.form.erroPercentagem")} />
      </div>
    </SeccaoNova>
  );
}

function Fardamento() {
  const { t } = useTranslation();
  const { valores } = useNova();
  const p = valores.pessoais;
  return (
    <SeccaoNova titulo={t("hr.fardamento.titulo")} convite="fardamento">
      <p className="text-xs text-muted-foreground">{t("hr.fardamento.detalhe")}</p>
      <div className={GRELHA}>
        <CampoS g="pessoais" k="tamanho_cima" id="hr-novo-tamanho-cima" codigo="tamanho_cima" rotulo={t("hr.fardamento.tamanhoCima")} opcoes={opcoes(t, "hr.tamanhoFardamento", TAMANHOS_FARDAMENTO)} vazio={t("rhNova.semIndicacao")} />
        {p.tamanho_cima === "outro" && <CampoT g="pessoais" k="tamanho_cima_detalhe" id="hr-novo-tamanho-cima-detalhe" rotulo={t("rhNova.f.tamanhoDetalhe")} />}
        <CampoS g="pessoais" k="tamanho_baixo" id="hr-novo-tamanho-baixo" codigo="tamanho_baixo" rotulo={t("hr.fardamento.tamanhoBaixo")} opcoes={opcoes(t, "hr.tamanhoFardamento", TAMANHOS_CALCAS)} vazio={t("rhNova.semIndicacao")} />
        {p.tamanho_baixo === "outro" && <CampoT g="pessoais" k="tamanho_baixo_detalhe" id="hr-novo-tamanho-baixo-detalhe" rotulo={t("rhNova.f.tamanhoDetalhe")} />}
        <CampoS g="pessoais" k="tamanho_calcado" id="hr-novo-tamanho-calcado" codigo="tamanho_calcado" rotulo={t("hr.fardamento.tamanhoCalcado")} opcoes={opcoes(t, "hr.tamanhoFardamento", TAMANHOS_CALCADO)} vazio={t("rhNova.semIndicacao")} />
        {p.tamanho_calcado === "outro" && <CampoT g="pessoais" k="tamanho_calcado_detalhe" id="hr-novo-tamanho-calcado-detalhe" rotulo={t("rhNova.f.tamanhoDetalhe")} />}
      </div>
    </SeccaoNova>
  );
}

export function AbaOutros() {
  // Saúde e sindicalização (art. 9.º do RGPD) têm permissão própria de escrita: quem não a tem não vê os campos (e
  // `paraPayload` também deixa de levar o satélite).
  const { podeSaude, podeSindicalizacao } = useNova();
  return (
    <div className="space-y-4">
      <Habilitacoes />
      {podeSaude && <Saude />}
      {podeSindicalizacao && <Sindicalizacao />}
      <Fardamento />
    </div>
  );
}
