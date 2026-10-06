/**
 * Pagina 1 do convite de admissao publico: dados pessoais, naturalidade e
 * habilitacao, documento e numeros, morada.
 *
 * So apresenta. Quem decide o que e obrigatorio e o que esta em erro e a
 * pagina (`ConviteAdmissao`), que recebe do servidor a lista de campos que ESTA
 * organizacao pede no convite: aqui todo o campo pergunta `obrigatorio(codigo)`
 * em vez de trazer o asterisco fixo -- um campo que a organizacao passou para a
 * ficha ou para opcional deixa de ter asterisco e de travar a submissao.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CampoPais, CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import {
  CONJUGE_SITUACOES_PROFISSIONAIS,
  ESTADOS_CIVIS,
  GENEROS,
  HABILITACOES_ACADEMICAS,
  TIPOS_DOCUMENTO,
} from "@/types/hr";
import type { PaginaConviteProps } from "@/components/hr/convite/tiposConvite";

export function ConvitePagina1({ t, rascunho, definir, erroDe, obrigatorio }: PaginaConviteProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("hr.pessoais.geral")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            id="convite-data-nascimento"
            label={t("employees.form.birthDate")}
            tipo="date"
            obrigatorio={obrigatorio("data_nascimento")}
            erro={erroDe("data_nascimento")}
            valor={rascunho.data_nascimento}
            onChange={(v) => definir("data_nascimento", v)}
          />
          <CampoSelect
            id="convite-genero"
            label={t("hr.campos.genero")}
            obrigatorio={obrigatorio("genero")}
            erro={erroDe("genero")}
            valor={rascunho.genero}
            vazioLabel={t("hr.campos.semValor")}
            opcoes={GENEROS.map((g) => ({ value: g, label: t(`hr.genero.${g}`) }))}
            onChange={(v) => definir("genero", v)}
          />
          <CampoPais
            id="convite-nacionalidade"
            label={t("hr.campos.nacionalidade")}
            obrigatorio={obrigatorio("nacionalidade")}
            erro={erroDe("nacionalidade")}
            valor={rascunho.nacionalidade}
            onChange={(v) => definir("nacionalidade", v)}
          />
          <CampoTexto
            id="convite-telefone-pessoal"
            label={t("hr.campos.telefonePessoal")}
            obrigatorio={obrigatorio("telefone_pessoal")}
            erro={erroDe("telefone_pessoal")}
            valor={rascunho.telefone_pessoal}
            onChange={(v) => definir("telefone_pessoal", v)}
          />
          <CampoTexto
            id="convite-email-pessoal"
            label={t("hr.campos.emailPessoal")}
            tipo="email"
            obrigatorio={obrigatorio("email_pessoal")}
            erro={erroDe("email_pessoal")}
            valor={rascunho.email_pessoal}
            onChange={(v) => definir("email_pessoal", v)}
          />
          <CampoSelect
            id="convite-estado-civil"
            label={t("hr.campos.estadoCivil")}
            obrigatorio={obrigatorio("estado_civil")}
            erro={erroDe("estado_civil")}
            valor={rascunho.estado_civil}
            vazioLabel={t("hr.campos.semValor")}
            opcoes={ESTADOS_CIVIS.map((e) => ({ value: e, label: t(`hr.estadoCivil.${e}`) }))}
            onChange={(v) => definir("estado_civil", v)}
          />
          <CampoTexto
            id="convite-dependentes"
            label={t("hr.campos.dependentes")}
            tipo="number"
            min={0}
            max={30}
            obrigatorio={obrigatorio("dependentes")}
            erro={erroDe("dependentes")}
            ajuda={t("hr.convite.ajudaDependentesZero")}
            valor={rascunho.dependentes}
            onChange={(v) => definir("dependentes", v)}
          />
          {rascunho.estado_civil === "casado" || rascunho.estado_civil === "uniao_de_facto" ? (
            <CampoSelect
              id="convite-conjuge-situacao"
              label={t("hr.campos.conjugeSituacaoProfissional")}
              obrigatorio={obrigatorio("conjuge_situacao_profissional")}
              erro={erroDe("conjuge_situacao_profissional")}
              valor={rascunho.conjuge_situacao_profissional}
              vazioLabel={t("hr.campos.semValor")}
              opcoes={CONJUGE_SITUACOES_PROFISSIONAIS.map((s) => ({
                value: s,
                label: t(`hr.conjugeSituacaoProfissional.${s}`),
              }))}
              onChange={(v) => definir("conjuge_situacao_profissional", v)}
            />
          ) : null}
          <CampoTexto
            id="convite-dependentes-deficientes"
            label={t("hr.campos.dependentesDeficientes")}
            tipo="number"
            min={0}
            max={30}
            obrigatorio={obrigatorio("dependentes_deficientes")}
            erro={erroDe("dependentes_deficientes")}
            ajuda={t("hr.convite.ajudaDependentesZero")}
            valor={rascunho.dependentes_deficientes}
            onChange={(v) => definir("dependentes_deficientes", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("hr.convite.naturalidadeHabilitacao")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            id="convite-naturalidade-freguesia"
            label={t("hr.campos.naturalidadeFreguesia")}
            obrigatorio={obrigatorio("naturalidade_freguesia")}
            erro={erroDe("naturalidade_freguesia")}
            valor={rascunho.naturalidade_freguesia}
            onChange={(v) => definir("naturalidade_freguesia", v)}
          />
          <CampoTexto
            id="convite-naturalidade-concelho"
            label={t("hr.campos.naturalidadeConcelho")}
            obrigatorio={obrigatorio("naturalidade_concelho")}
            erro={erroDe("naturalidade_concelho")}
            valor={rascunho.naturalidade_concelho}
            onChange={(v) => definir("naturalidade_concelho", v)}
          />
          <CampoPais
            id="convite-naturalidade-pais"
            label={t("hr.campos.naturalidadePais")}
            obrigatorio={obrigatorio("naturalidade_pais")}
            erro={erroDe("naturalidade_pais")}
            valor={rascunho.naturalidade_pais}
            onChange={(v) => definir("naturalidade_pais", v)}
          />
          <CampoSelect
            id="convite-habilitacao"
            label={t("hr.campos.habilitacaoAcademica")}
            obrigatorio={obrigatorio("habilitacao_academica")}
            erro={erroDe("habilitacao_academica")}
            valor={rascunho.habilitacao_academica}
            vazioLabel={t("hr.campos.semValor")}
            opcoes={HABILITACOES_ACADEMICAS.map((h) => ({
              value: h,
              label: t(`hr.habilitacaoAcademica.${h}`),
            }))}
            onChange={(v) => definir("habilitacao_academica", v)}
          />
          <CampoTexto
            id="convite-habilitacao-data"
            label={t("hr.campos.habilitacaoDataConclusao")}
            tipo="date"
            obrigatorio={obrigatorio("habilitacao_data_conclusao")}
            erro={erroDe("habilitacao_data_conclusao")}
            valor={rascunho.habilitacao_data_conclusao}
            onChange={(v) => definir("habilitacao_data_conclusao", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("hr.pessoais.documento")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <CampoSelect
            id="convite-tipo-documento"
            label={t("hr.campos.tipoDocumento")}
            obrigatorio={obrigatorio("tipo_documento")}
            erro={erroDe("tipo_documento")}
            valor={rascunho.tipo_documento}
            vazioLabel={t("hr.campos.semValor")}
            opcoes={TIPOS_DOCUMENTO.map((tp) => ({
              value: tp,
              label: t(`hr.tipoDocumento.${tp}`),
            }))}
            onChange={(v) => definir("tipo_documento", v)}
          />
          <CampoTexto
            id="convite-numero-documento"
            label={t("hr.campos.numeroDocumento")}
            obrigatorio={obrigatorio("numero_documento")}
            erro={erroDe("numero_documento")}
            valor={rascunho.numero_documento}
            onChange={(v) => definir("numero_documento", v)}
          />
          <CampoTexto
            id="convite-validade-documento"
            label={t("hr.campos.validadeDocumento")}
            tipo="date"
            obrigatorio={obrigatorio("validade_documento")}
            erro={erroDe("validade_documento")}
            valor={rascunho.validade_documento}
            onChange={(v) => definir("validade_documento", v)}
          />
          <CampoTexto
            id="convite-nif"
            label={t("hr.campos.nif")}
            obrigatorio={obrigatorio("nif")}
            erro={erroDe("nif")}
            valor={rascunho.nif}
            onChange={(v) => definir("nif", v)}
          />
          <CampoTexto
            id="convite-niss"
            label={t("hr.campos.niss")}
            obrigatorio={obrigatorio("niss")}
            erro={erroDe("niss")}
            valor={rascunho.niss}
            onChange={(v) => definir("niss", v.replace(/\s+/g, ""))}
          />
          <CampoTexto
            id="convite-carta-numero"
            label={t("hr.campos.cartaConducaoNumero")}
            valor={rascunho.carta_conducao_numero}
            onChange={(v) => definir("carta_conducao_numero", v)}
          />
          <CampoTexto
            id="convite-carta-categorias"
            label={t("hr.campos.cartaConducaoCategorias")}
            placeholder="B, B1"
            valor={rascunho.carta_conducao_categorias}
            onChange={(v) => definir("carta_conducao_categorias", v)}
          />
          <CampoTexto
            id="convite-carta-validade"
            label={t("hr.campos.cartaConducaoValidade")}
            tipo="date"
            valor={rascunho.carta_conducao_validade}
            onChange={(v) => definir("carta_conducao_validade", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("hr.pessoais.morada")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            id="convite-linha1"
            label={t("hr.campos.linha1")}
            className="sm:col-span-2"
            obrigatorio={obrigatorio("linha1")}
            erro={erroDe("linha1")}
            valor={rascunho.linha1}
            onChange={(v) => definir("linha1", v)}
          />
          <CampoTexto
            id="convite-linha2"
            label={t("hr.campos.linha2")}
            className="sm:col-span-2"
            valor={rascunho.linha2}
            onChange={(v) => definir("linha2", v)}
          />
          <CampoTexto
            id="convite-codigo-postal"
            label={t("employees.form.postalCode")}
            obrigatorio={obrigatorio("codigo_postal")}
            erro={erroDe("codigo_postal")}
            valor={rascunho.codigo_postal}
            onChange={(v) => definir("codigo_postal", v)}
          />
          <CampoTexto
            id="convite-localidade"
            label={t("hr.campos.localidade")}
            obrigatorio={obrigatorio("localidade")}
            erro={erroDe("localidade")}
            valor={rascunho.localidade}
            onChange={(v) => definir("localidade", v)}
          />
          <CampoTexto
            id="convite-distrito"
            label={t("employees.form.district")}
            valor={rascunho.distrito}
            onChange={(v) => definir("distrito", v)}
          />
          <CampoPais
            id="convite-pais"
            label={t("employees.form.country")}
            valor={rascunho.pais}
            onChange={(v) => definir("pais", v)}
          />
        </CardContent>
      </Card>

    </div>
  );
}
