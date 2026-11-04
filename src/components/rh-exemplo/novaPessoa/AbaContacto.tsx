// A aba "Contacto e morada" do painel "Nova pessoa": e-mail e telefone pessoais, morada completa e contacto de
// emergência.
import { useTranslation } from "@/hooks/useTranslation";
import { seVazio, useMoradaPorCodigoPostal } from "@/hooks/useMoradaPorCodigoPostal";
import { ehPortugal } from "@/lib/addresses/procurarCodigoPostal";
import { useNova } from "./contextoNova";
import { INDICATIVOS_SMS_CONTRATO } from "@/lib/phone/indicativosRh";
import { CampoP, CampoT, CampoTel, GRELHA } from "./camposNova";
import { SeccaoNova } from "./SeccaoNova";

function Contactos() {
  const { t } = useTranslation();
  return (
    <SeccaoNova titulo={t("rhNova.sec.contactos")} convite="contactos">
      <div className={GRELHA}>
        <CampoT g="pessoais" k="email_pessoal" id="hr-novo-email-pessoal" codigo="email_pessoal" tipo="email" rotulo={t("hr.campos.emailPessoal")} ajuda={t("rhNova.h.emailPessoal")} />
        <CampoTel g="pessoais" k="telefone_pessoal" id="hr-novo-telefone-pessoal" codigo="telefone_pessoal" rotulo={t("hr.campos.telefonePessoal")} ajuda={t("rhNova.h.telefonePessoal")} indicativos={INDICATIVOS_SMS_CONTRATO} />
      </div>
    </SeccaoNova>
  );
}

function Morada() {
  const { t } = useTranslation();
  const { valores, alterar } = useNova();
  const p = valores.pessoais as unknown as Record<string, unknown>;
  const txt = (k: string) => String(p[k] ?? "");
  // Código postal completo: procura a rua, a localidade e o distrito e preenche o que está vazio (reunião de 30/10).
  useMoradaPorCodigoPostal(txt("morada_codigo_postal"), (m) => {
    (alterar as (grupo: "pessoais", patch: Record<string, unknown>) => void)("pessoais", {
      morada_linha1: seVazio(txt("morada_linha1"), m.rua),
      morada_localidade: seVazio(txt("morada_localidade"), m.localidade),
      morada_distrito: seVazio(txt("morada_distrito"), m.distrito),
    });
  }, ehPortugal(txt("morada_pais")));
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
        <CampoTel g="pessoais" k="emergencia_telefone" id="hr-novo-emergencia-telefone"rotulo={t("rhNova.f.emergenciaTelefone")} ajuda={t("rhNova.h.telefone")} />
        <CampoTel g="extra" k="emergencia_telefone_alt" id="hr-novo-emergencia-telefone-alt"rotulo={t("hr.campos.telefoneAlternativo")} />
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
