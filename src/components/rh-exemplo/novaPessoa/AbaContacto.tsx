// A aba "Contacto e morada" do painel "Nova pessoa": e-mail e telefone (pessoais e profissionais), morada completa e contacto de
// emergência.
import { useTranslation } from "@/hooks/useTranslation";
import { CampoP, CampoT, GRELHA } from "./camposNova";
import { SeccaoNova } from "./SeccaoNova";

function Contactos() {
  const { t } = useTranslation();
  return (
    <SeccaoNova titulo={t("rhNova.sec.contactos")} convite="contactos">
      <div className={GRELHA}>
        <CampoT g="pessoais" k="email_pessoal" id="hr-novo-email-pessoal" codigo="email_pessoal" tipo="email" rotulo={t("hr.campos.emailPessoal")} ajuda={t("rhNova.h.emailPessoal")} />
        <CampoT g="pessoais" k="telefone_pessoal" id="hr-novo-telefone-pessoal" codigo="telefone_pessoal" tipo="tel" rotulo={t("hr.campos.telefonePessoal")} ajuda={t("rhNova.h.telefone")} />
        <CampoT g="geral" k="email_trabalho" id="hr-novo-email-trabalho" tipo="email" rotulo={t("hr.laborais.emailTrabalho")} ajuda={t("rhNova.h.emailTrabalho")} />
        <CampoT g="geral" k="telefone_trabalho" id="hr-novo-telefone-trabalho" tipo="tel" rotulo={t("hr.laborais.telefoneTrabalho")} ajuda={t("rhNova.h.telefone")} />
      </div>
    </SeccaoNova>
  );
}

function Morada() {
  const { t } = useTranslation();
  return (
    <SeccaoNova titulo={t("rhNova.sec.morada")} convite="morada">
      <div className={GRELHA}>
        <CampoT g="pessoais" k="morada_linha1" id="hr-novo-morada-linha1" codigo="linha1" rotulo={t("hr.campos.linha1")} />
        <CampoT g="pessoais" k="morada_linha2" id="hr-novo-morada-linha2" rotulo={t("hr.campos.linha2")} />
        <CampoT g="pessoais" k="morada_codigo_postal" id="hr-novo-morada-codigo-postal" codigo="codigo_postal" rotulo={t("rhNova.f.codigoPostal")} placeholder="0000-000" ajuda={t("rhNova.h.codigoPostal")} />
        <CampoT g="pessoais" k="morada_localidade" id="hr-novo-morada-localidade" codigo="localidade" rotulo={t("hr.campos.localidade")} />
        <CampoT g="pessoais" k="morada_distrito" id="hr-novo-morada-distrito" rotulo={t("rhNova.f.distrito")} />
        <CampoP g="pessoais" k="morada_pais" id="hr-novo-morada-pais" rotulo={t("rhNova.f.pais")} />
      </div>
    </SeccaoNova>
  );
}

function Emergencia() {
  const { t } = useTranslation();
  return (
    <SeccaoNova titulo={t("hr.pessoais.emergencia")}>
      <div className={GRELHA}>
        <CampoT g="pessoais" k="emergencia_nome" id="hr-novo-emergencia-nome" rotulo={t("rhNova.f.emergenciaNome")} />
        <CampoT g="pessoais" k="emergencia_relacao" id="hr-novo-emergencia-relacao" rotulo={t("hr.campos.relacao")} ajuda={t("rhNova.h.relacao")} />
        <CampoT g="pessoais" k="emergencia_telefone" id="hr-novo-emergencia-telefone" tipo="tel" rotulo={t("rhNova.f.emergenciaTelefone")} ajuda={t("rhNova.h.telefone")} />
        <CampoT g="extra" k="emergencia_telefone_alt" id="hr-novo-emergencia-telefone-alt" tipo="tel" rotulo={t("hr.campos.telefoneAlternativo")} />
        <CampoT g="extra" k="emergencia_email" id="hr-novo-emergencia-email" tipo="email" rotulo={t("rhNova.f.emergenciaEmail")} />
      </div>
    </SeccaoNova>
  );
}

export function AbaContacto() {
  return (
    <div className="space-y-4">
      <Contactos />
      <Morada />
      <Emergencia />
    </div>
  );
}
