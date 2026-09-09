/**
 * Passo 2 -- Detalhes pessoais: o passo do "copiar do cartao de cidadao".
 *
 * Quem o preenche tem um documento aberto a frente e transcreve. E por isso
 * que o documento, o NIF e o NISS estao aqui juntos, apesar de caírem em
 * `pessoas_identificacao`, tabela diferente de `pessoas_dados_pessoais`: a
 * fronteira mental de quem escreve e "o que esta no documento", nao a tabela
 * de destino.
 *
 * A morada e o contacto de emergencia ficam no fim, recolhidos, porque sao o
 * que mais vezes nao se tem no momento da admissao.
 *
 * O NISS NAO SE GRAVA POR INSERT. A coluna esta revogada ao `authenticated`
 * (20261120040000) e o unico caminho e `rpc_hr_definir_niss` -- uma chamada
 * separada, que pode falhar sozinha sem levar o resto da ficha atras.
 */
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { CampoInterruptor, CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import type { RascunhoPessoais } from "@/lib/hr/novaPessoa";
import {
  ESTADOS_CIVIS,
  GENEROS,
  TIPOS_DOCUMENTO,
  type EstadoCivil,
  type Genero,
  type TipoDocumento,
} from "@/types/hr";

interface SeccaoDetalhesPessoaisProps {
  valor: RascunhoPessoais;
  onPatch: (patch: Partial<RascunhoPessoais>) => void;
  erroDe: (campoId: string) => string | null;
}

export function SeccaoDetalhesPessoais({
  valor,
  onPatch,
  erroDe,
}: SeccaoDetalhesPessoaisProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoTexto
          id="hr-novo-data-nascimento"
          label={t("employees.form.birthDate")}
          tipo="date"
          valor={valor.data_nascimento}
          onChange={(v) => onPatch({ data_nascimento: v })}
        />
        <CampoSelect
          id="hr-novo-genero"
          label={t("hr.campos.genero")}
          valor={valor.genero}
          vazioLabel={t("hr.campos.semValor")}
          opcoes={GENEROS.map((g) => ({ value: g, label: t(`hr.genero.${g}`) }))}
          onChange={(v) => onPatch({ genero: v as Genero | "" })}
        />
        <CampoTexto
          id="hr-novo-pronomes"
          label={t("hr.campos.pronomes")}
          valor={valor.pronomes}
          onChange={(v) => onPatch({ pronomes: v })}
        />
        <CampoTexto
          id="hr-novo-nacionalidade"
          label={t("hr.campos.nacionalidade")}
          valor={valor.nacionalidade}
          onChange={(v) => onPatch({ nacionalidade: v })}
        />
        <CampoSelect
          id="hr-novo-estado-civil"
          label={t("hr.campos.estadoCivil")}
          valor={valor.estado_civil}
          vazioLabel={t("hr.campos.semValor")}
          opcoes={ESTADOS_CIVIS.map((e) => ({ value: e, label: t(`hr.estadoCivil.${e}`) }))}
          onChange={(v) => onPatch({ estado_civil: v as EstadoCivil | "" })}
        />
        <CampoTexto
          id="hr-novo-dependentes"
          label={t("hr.campos.dependentes")}
          tipo="number"
          min={0}
          valor={valor.dependentes}
          erro={erroDe("hr-novo-dependentes")}
          onChange={(v) => onPatch({ dependentes: v })}
        />
        <CampoTexto
          id="hr-novo-telefone-pessoal"
          label={t("hr.campos.telefonePessoal")}
          tipo="tel"
          valor={valor.telefone_pessoal}
          onChange={(v) => onPatch({ telefone_pessoal: v })}
        />
        <CampoTexto
          id="hr-novo-email-pessoal"
          label={t("hr.laborais.emailPessoal")}
          tipo="email"
          valor={valor.email_pessoal}
          erro={erroDe("hr-novo-email-pessoal")}
          onChange={(v) => onPatch({ email_pessoal: v })}
        />
      </div>

      <CampoInterruptor
        id="hr-novo-ocultar-aniversario"
        label={t("hr.campos.ocultarAniversario")}
        descricao={t("hr.form.ajudaOcultarAniversario")}
        checked={valor.ocultar_aniversario}
        onChange={(v) => onPatch({ ocultar_aniversario: v })}
      />

      <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-medium">{t("hr.pessoais.documento")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoSelect
            id="hr-novo-tipo-documento"
            label={t("hr.campos.tipoDocumento")}
            valor={valor.tipo_documento}
            vazioLabel={t("hr.campos.semValor")}
            opcoes={TIPOS_DOCUMENTO.map((d) => ({
              value: d,
              label: t(`hr.tipoDocumento.${d}`),
            }))}
            onChange={(v) => onPatch({ tipo_documento: v as TipoDocumento | "" })}
          />
          <CampoTexto
            id="hr-novo-numero-documento"
            label={t("hr.campos.numeroDocumento")}
            valor={valor.numero_documento}
            onChange={(v) => onPatch({ numero_documento: v })}
          />
          <CampoTexto
            id="hr-novo-validade-documento"
            label={t("hr.campos.validadeDocumento")}
            tipo="date"
            valor={valor.validade_documento}
            onChange={(v) => onPatch({ validade_documento: v })}
          />
          <CampoTexto
            id="hr-novo-nif"
            label={t("hr.campos.nif")}
            valor={valor.nif}
            erro={erroDe("hr-novo-nif")}
            onChange={(v) => onPatch({ nif: v })}
          />
          <CampoTexto
            id="hr-novo-niss"
            label={t("hr.campos.niss")}
            ajuda={t("hr.form.ajudaNiss")}
            valor={valor.niss}
            erro={erroDe("hr-novo-niss")}
            onChange={(v) => onPatch({ niss: v })}
          />
        </div>
      </div>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="gap-1.5">
            <ChevronDown className="h-4 w-4" />
            {t("hr.pessoais.morada")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 grid gap-4 sm:grid-cols-2">
          <CampoTexto
            id="hr-novo-morada-linha1"
            label={t("hr.campos.linha1")}
            className="sm:col-span-2"
            valor={valor.morada_linha1}
            onChange={(v) => onPatch({ morada_linha1: v })}
          />
          <CampoTexto
            id="hr-novo-morada-linha2"
            label={t("hr.campos.linha2")}
            className="sm:col-span-2"
            valor={valor.morada_linha2}
            onChange={(v) => onPatch({ morada_linha2: v })}
          />
          <CampoTexto
            id="hr-novo-morada-codigo-postal"
            label={t("employees.form.postalCode")}
            valor={valor.morada_codigo_postal}
            onChange={(v) => onPatch({ morada_codigo_postal: v })}
          />
          <CampoTexto
            id="hr-novo-morada-localidade"
            label={t("hr.campos.localidade")}
            valor={valor.morada_localidade}
            onChange={(v) => onPatch({ morada_localidade: v })}
          />
          <CampoTexto
            id="hr-novo-morada-distrito"
            label={t("employees.form.district")}
            valor={valor.morada_distrito}
            onChange={(v) => onPatch({ morada_distrito: v })}
          />
          <CampoTexto
            id="hr-novo-morada-pais"
            label={t("employees.form.country")}
            valor={valor.morada_pais}
            onChange={(v) => onPatch({ morada_pais: v })}
          />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="gap-1.5">
            <ChevronDown className="h-4 w-4" />
            {t("hr.pessoais.emergencia")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 grid gap-4 sm:grid-cols-2">
          <CampoTexto
            id="hr-novo-emergencia-nome"
            label={t("employees.form.emergencyContactName")}
            valor={valor.emergencia_nome}
            onChange={(v) => onPatch({ emergencia_nome: v })}
          />
          <CampoTexto
            id="hr-novo-emergencia-relacao"
            label={t("hr.campos.relacao")}
            valor={valor.emergencia_relacao}
            onChange={(v) => onPatch({ emergencia_relacao: v })}
          />
          <CampoTexto
            id="hr-novo-emergencia-telefone"
            label={t("employees.form.emergencyContactPhone")}
            ajuda={t("hr.form.ajudaEmergencia")}
            tipo="tel"
            valor={valor.emergencia_telefone}
            onChange={(v) => onPatch({ emergencia_telefone: v })}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
