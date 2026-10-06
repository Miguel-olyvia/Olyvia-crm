/**
 * Pagina 2 do convite de admissao publico: conta bancaria, fardamento e
 * assinatura.
 *
 * A assinatura e a declaracao de veracidade sao SEMPRE obrigatorias, seja qual
 * for a configuracao da organizacao. O botao de submeter fica activo e valida ao
 * clicar: um botao desactivado nao diz a quem preenche o que lhe falta.
 */
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import { TAMANHOS_FARDAMENTO, TAMANHOS_CALCADO, TAMANHOS_CALCAS } from "@/types/hr";
import { normalizarBic } from "@/lib/hr/conta";
import type { PaginaConviteProps } from "@/components/hr/convite/tiposConvite";

/** Numeros (calcado, calcas) mostram-se como sao; letras/outro passam por i18n. */
function rotuloTamanho(t: (chave: string) => string, tamanho: string): string {
  return /^[0-9]+$/.test(tamanho) ? tamanho : t(`hr.tamanhoFardamento.${tamanho}`);
}

interface ConvitePagina2Props extends PaginaConviteProps {
  erroAssinatura: string | null;
  erroAceite: string | null;
  /**
   * O cartao de anexos (cartao de cidadao, comprovativo de IBAN, fotografia).
   * Fica entre o fardamento e a assinatura. Opcional: a pagina nao sabe nada
   * de ficheiros -- quem os envia e o hook da pagina que a monta.
   */
  anexos?: ReactNode;
}

export function ConvitePagina2({
  t,
  rascunho,
  definir,
  erroDe,
  obrigatorio,
  erroAssinatura,
  erroAceite,
  anexos,
}: ConvitePagina2Props) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("hr.pessoais.bancarios")}</CardTitle>
        </CardHeader>
        {/*
          So IBAN: e o unico formato de conta que a RPC sabe gravar, e
          oferecer os outros seis era prometer o que o servidor recusa.
          `conta_formato` fica fixo em "iban" no rascunho.
        */}
        <CardContent className="grid gap-4 sm:grid-cols-6">
          <CampoTexto
            id="convite-conta-numero"
            label={t("hr.campos.iban")}
            className="sm:col-span-4"
            obrigatorio={obrigatorio("conta_numero")}
            erro={erroDe("conta_numero")}
            valor={rascunho.conta_numero}
            onChange={(v) => definir("conta_numero", v)}
          />
          <CampoTexto
            id="convite-conta-bic"
            label={t("hr.campos.swift")}
            ajuda={t("hr.campos.bicAjuda")}
            className="sm:col-span-2"
            obrigatorio={obrigatorio("conta_bic")}
            erro={erroDe("conta_bic")}
            valor={rascunho.conta_bic}
            onChange={(v) => definir("conta_bic", normalizarBic(v).slice(0, 11))}
          />
          <CampoTexto
            id="convite-conta-titular"
            label={t("hr.campos.titularConta")}
            className="sm:col-span-3"
            obrigatorio={obrigatorio("conta_titular")}
            erro={erroDe("conta_titular")}
            valor={rascunho.conta_titular}
            onChange={(v) => definir("conta_titular", v)}
          />
          <CampoTexto
            id="convite-conta-banco"
            label={t("hr.campos.banco")}
            className="sm:col-span-3"
            obrigatorio={obrigatorio("conta_banco")}
            erro={erroDe("conta_banco")}
            valor={rascunho.conta_banco}
            onChange={(v) => definir("conta_banco", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("hr.fardamento.titulo")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <CampoSelect
            id="convite-tamanho-cima"
            label={t("hr.fardamento.tamanhoCima")}
            obrigatorio={obrigatorio("tamanho_cima")}
            erro={erroDe("tamanho_cima")}
            valor={rascunho.tamanho_cima}
            vazioLabel={t("hr.campos.semValor")}
            opcoes={TAMANHOS_FARDAMENTO.map((tm) => ({
              value: tm,
              label: t(`hr.tamanhoFardamento.${tm}`),
            }))}
            onChange={(v) => definir("tamanho_cima", v)}
          />
          {rascunho.tamanho_cima === "outro" && (
            <CampoTexto
              id="convite-tamanho-cima-detalhe"
              label={t("hr.fardamento.detalhe")}
              valor={rascunho.tamanho_cima_detalhe}
              onChange={(v) => definir("tamanho_cima_detalhe", v)}
            />
          )}
          <CampoSelect
            id="convite-tamanho-baixo"
            label={t("hr.fardamento.tamanhoBaixo")}
            obrigatorio={obrigatorio("tamanho_baixo")}
            erro={erroDe("tamanho_baixo")}
            valor={rascunho.tamanho_baixo}
            vazioLabel={t("hr.campos.semValor")}
            opcoes={TAMANHOS_CALCAS.map((tm) => ({
              value: tm,
              label: rotuloTamanho(t, tm),
            }))}
            onChange={(v) => definir("tamanho_baixo", v)}
          />
          {rascunho.tamanho_baixo === "outro" && (
            <CampoTexto
              id="convite-tamanho-baixo-detalhe"
              label={t("hr.fardamento.detalhe")}
              valor={rascunho.tamanho_baixo_detalhe}
              onChange={(v) => definir("tamanho_baixo_detalhe", v)}
            />
          )}
          <CampoSelect
            id="convite-tamanho-calcado"
            label={t("hr.fardamento.tamanhoCalcado")}
            obrigatorio={obrigatorio("tamanho_calcado")}
            erro={erroDe("tamanho_calcado")}
            valor={rascunho.tamanho_calcado}
            vazioLabel={t("hr.campos.semValor")}
            opcoes={TAMANHOS_CALCADO.map((tm) => ({
              value: tm,
              label: rotuloTamanho(t, tm),
            }))}
            onChange={(v) => definir("tamanho_calcado", v)}
          />
          {rascunho.tamanho_calcado === "outro" && (
            <CampoTexto
              id="convite-tamanho-calcado-detalhe"
              label={t("hr.fardamento.detalhe")}
              valor={rascunho.tamanho_calcado_detalhe}
              onChange={(v) => definir("tamanho_calcado_detalhe", v)}
            />
          )}
        </CardContent>
      </Card>

      {anexos}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("hr.convite.assinatura")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CampoTexto
            id="convite-assinatura-nome"
            label={t("hr.convite.assinaturaNome")}
            obrigatorio
            erro={erroAssinatura}
            valor={rascunho.assinatura_nome}
            onChange={(v) => definir("assinatura_nome", v)}
          />
          <div className="flex items-start gap-2">
            <Checkbox
              id="convite-aceite"
              checked={rascunho.aceite}
              aria-required="true"
              aria-invalid={erroAceite ? true : undefined}
              aria-describedby={erroAceite ? "convite-aceite-erro" : undefined}
              onCheckedChange={(v) => definir("aceite", v === true)}
            />
            <Label htmlFor="convite-aceite" className="font-normal">
              {t("hr.convite.declaracaoVeracidade")}
              <span aria-hidden="true" className="ml-0.5 text-destructive">
                *
              </span>
              <span className="sr-only"> ({t("hr.campos.obrigatorio")})</span>
            </Label>
          </div>
          {erroAceite && (
            <p id="convite-aceite-erro" role="alert" className="text-xs text-destructive">
              {erroAceite}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
