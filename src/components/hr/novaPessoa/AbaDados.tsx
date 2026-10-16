// A aba "Dados pessoais" do painel "Nova pessoa": ligar a uma conta existente, identificação, nascimento e naturalidade,
// documentos e números fiscais, carta de condução e anexos (cartão de cidadão e fotografia). Os nomes e as opções são os do
// assistente real.
import { LinhaCampo, CampoI, CampoP, CampoS, CampoT, GRELHA } from "./camposNova";
import { CampoConta } from "@/components/hr/form/CampoConta";
import { CampoTexto } from "@/components/hr/form/Campos";
import { temConjuge } from "@/lib/hr/novaPessoaDetalhes";
import { CONJUGE_SITUACOES_PROFISSIONAIS, ESTADOS_CIVIS, GENEROS, TIPOS_DOCUMENTO } from "@/types/hr";
import { useTranslation } from "@/hooks/useTranslation";
import { SeccaoAnexos } from "./AnexosNova";
import { useNova } from "./contextoNova";
import { opcoes } from "./opcoesNova";
import { SeccaoNova } from "./SeccaoNova";

/** Escolher uma conta de CRM preenche os campos que ela sabe; só com `hr.pessoas.conta.link` a ficha fica ligada a ela. */
function LigarConta() {
  const { t } = useTranslation();
  const { valores, conta } = useNova();
  return (
    <SeccaoNova titulo={t("rhNova.sec.conta")}>
      <CampoConta
        id="hr-novo-conta" label={t("hr.conta.label")} contas={conta.contas} valor={valores.geral.conta_id}
        loading={conta.loading} podeLigar={conta.podeLigar} onChange={conta.aoEscolher}
      />
    </SeccaoNova>
  );
}

function Identificacao() {
  const { t } = useTranslation();
  const { valores } = useNova();
  const { geral, pessoais } = valores;
  const completo = `${geral.primeiro_nome} ${geral.apelido}`.trim();
  return (
    <SeccaoNova titulo={t("rhNova.sec.identificacao")} convite="identificacao">
      <div className={GRELHA}>
        <CampoT g="geral" k="primeiro_nome" id="hr-novo-primeiro-nome" rotulo={t("rhNova.f.nome")} />
        <CampoT g="geral" k="apelido" id="hr-novo-apelido" rotulo={t("rhNova.f.apelido")} />
        <LinhaCampo id="hr-novo-nome-completo">
          <CampoTexto
            id="hr-novo-nome-completo" label={t("rhNova.f.nomeCompleto")} valor={completo} onChange={() => undefined} disabled
            ajuda={t("rhNova.h.nomeCompleto")}
          />
        </LinhaCampo>
        <CampoS
          g="pessoais" k="genero" id="hr-novo-genero" codigo="genero" rotulo={t("hr.campos.genero")}
          opcoes={opcoes(t, "hr.genero", GENEROS)} vazio={t("rhNova.semIndicacao")}
        />
        <CampoP g="pessoais" k="nacionalidade" id="hr-novo-nacionalidade" codigo="nacionalidade" rotulo={t("hr.campos.nacionalidade")} />
        <CampoS
          g="pessoais" k="estado_civil" id="hr-novo-estado-civil" codigo="estado_civil" rotulo={t("hr.campos.estadoCivil")}
          opcoes={opcoes(t, "hr.estadoCivil", ESTADOS_CIVIS)} vazio={t("rhNova.semIndicacao")}
        />
        {temConjuge(pessoais.estado_civil) && (
          <CampoS
            g="pessoais" k="conjuge_situacao_profissional" id="hr-novo-conjuge-situacao" codigo="conjuge_situacao_profissional"
            rotulo={t("rhNova.f.conjuge")} opcoes={opcoes(t, "hr.conjugeSituacaoProfissional", CONJUGE_SITUACOES_PROFISSIONAIS)}
            vazio={t("rhNova.semIndicacao")}
          />
        )}
        <CampoT g="pessoais" k="dependentes" id="hr-novo-dependentes" codigo="dependentes" rotulo={t("hr.campos.dependentes")} ajuda={t("rhNova.h.dependentes")} />
        <CampoT
          g="pessoais" k="dependentes_deficientes" id="hr-novo-dependentes-deficientes" codigo="dependentes_deficientes"
          rotulo={t("rhNova.f.dependentesDeficientes")} ajuda={t("rhNova.h.dependentes")}
        />
        <CampoI g="pessoais" k="ocultar_aniversario" id="hr-novo-ocultar-aniversario" rotulo={t("hr.campos.ocultarAniversario")} largo />
      </div>
    </SeccaoNova>
  );
}

function Nascimento() {
  const { t } = useTranslation();
  return (
    <SeccaoNova titulo={t("rhNova.sec.nascimento")} convite="nascimento">
      <div className={GRELHA}>
        <CampoT g="pessoais" k="data_nascimento" id="hr-novo-data-nascimento" codigo="data_nascimento" tipo="date" rotulo={t("rhNova.f.dataNascimento")} />
        <CampoP g="pessoais" k="naturalidade_pais" id="hr-novo-naturalidade-pais" codigo="naturalidade_pais" rotulo={t("rhNova.f.naturalidadePais")} />
        <CampoT g="pessoais" k="naturalidade_freguesia" id="hr-novo-naturalidade-freguesia" codigo="naturalidade_freguesia" rotulo={t("rhNova.f.naturalidadeFreguesia")} />
        <CampoT g="pessoais" k="naturalidade_concelho" id="hr-novo-naturalidade-concelho" codigo="naturalidade_concelho" rotulo={t("rhNova.f.naturalidadeConcelho")} />
      </div>
    </SeccaoNova>
  );
}

function Documentos() {
  const { t } = useTranslation();
  const { valores } = useNova();
  const cc = valores.pessoais.tipo_documento === "cartao_cidadao";
  return (
    <SeccaoNova titulo={t("rhNova.sec.documentos")} convite="documentos">
      <div className={GRELHA}>
        <CampoS
          g="pessoais" k="tipo_documento" id="hr-novo-tipo-documento" codigo="tipo_documento" rotulo={t("hr.campos.tipoDocumento")}
          opcoes={opcoes(t, "hr.tipoDocumento", TIPOS_DOCUMENTO)} vazio={t("rhNova.semIndicacao")}
        />
        <CampoT g="pessoais" k="numero_documento" id="hr-novo-numero-documento" codigo="numero_documento" rotulo={t("hr.campos.numeroDocumento")} />
        <CampoT
          g="pessoais" k="validade_documento" id="hr-novo-validade-documento" codigo="validade_documento" tipo="date"
          rotulo={t("hr.campos.validadeDocumento")} ajuda={cc ? t("rhNova.h.validadeCc") : t("rhNova.h.validadeOutro")}
        />
        <div className="hidden sm:block" />
        <CampoT g="pessoais" k="nif" id="hr-novo-nif" codigo="nif" rotulo={t("hr.campos.nif")} ajuda={t("rhNova.h.nif")} />
        <CampoT g="pessoais" k="niss" id="hr-novo-niss" codigo="niss" rotulo={t("hr.campos.niss")} ajuda={t("rhNova.h.niss")} />
        <CampoT g="pessoais" k="carta_conducao_numero" id="hr-novo-carta-numero" rotulo={t("rhNova.f.cartaNumero")} />
        <CampoT g="pessoais" k="carta_conducao_categorias" id="hr-novo-carta-categorias" rotulo={t("rhNova.f.cartaCategorias")} />
        <CampoT g="pessoais" k="carta_conducao_validade" id="hr-novo-carta-validade" tipo="date" rotulo={t("rhNova.f.cartaValidade")} />
      </div>
    </SeccaoNova>
  );
}

export function AbaDados() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <LigarConta />
      <Identificacao />
      <Nascimento />
      <Documentos />
      <SeccaoAnexos titulo={t("rhNova.sec.anexosDados")} tipos={["cartao_cidadao", "fotografia"]} />
    </div>
  );
}
