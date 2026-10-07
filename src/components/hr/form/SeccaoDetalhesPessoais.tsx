/**
 * Passo 2 -- Detalhes pessoais: o passo do "copiar do cartao de cidadao".
 *
 * Quem o preenche tem um documento aberto a frente e transcreve. E por isso
 * que o documento, o NIF e o NISS estao aqui juntos, apesar de caírem em
 * `pessoas_identificacao`, tabela diferente de `pessoas_dados_pessoais`: a
 * fronteira mental de quem escreve e "o que esta no documento", nao a tabela
 * de destino.
 *
 * O endereco, as informacoes bancarias e o contacto de emergencia ficam no
 * fim, recolhidos, porque sao o que mais vezes nao se tem no momento da
 * admissao.
 *
 * DOIS CAMPOS NAO SE GRAVAM POR INSERT
 * ------------------------------------
 * O NISS (coluna revogada ao `authenticated`, 20261120040000) e o numero da
 * CONTA BANCARIA (tabela com a escrita revogada e tres politicas restritivas,
 * 20261120070000). Cada um tem a sua RPC -- `rpc_hr_definir_niss` e
 * `rpc_hr_definir_conta` -- e cada um pode falhar sozinho sem levar o resto da
 * ficha atras. E de proposito: o numero da conta vai para o Vault e a
 * aplicacao nunca o volta a ver.
 *
 * "Pronomes" saiu por decisao do utilizador e a coluna foi largada em
 * 20261120210000.
 */
import { useEffect, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  CampoInterruptor,
  CampoPais,
  CampoSelect,
  CampoTexto,
} from "@/components/hr/form/Campos";
import { chaveDoRotuloDaConta, normalizarBic } from "@/lib/hr/conta";
import type { RascunhoPessoais } from "@/lib/hr/novaPessoa";
import { patchEstadoCivil, patchTamanho, temConjuge } from "@/lib/hr/novaPessoaDetalhes";
import {
  CONJUGE_SITUACOES_PROFISSIONAIS,
  ESTADOS_CIVIS,
  FORMATOS_CONTA,
  GENEROS,
  HABILITACOES_ACADEMICAS,
  TAMANHOS_CALCADO,
  TAMANHOS_CALCAS,
  TAMANHOS_FARDAMENTO,
  TIPOS_DOCUMENTO,
  type EstadoCivil,
  type FormatoConta,
  type Genero,
  type TipoDocumento,
} from "@/types/hr";

/** Numeros (calcado, calcas) mostram-se como sao; letras e "outro" passam por i18n. */
function rotuloTamanho(t: (chave: string) => string, tamanho: string): string {
  return /^[0-9]+$/.test(tamanho) ? tamanho : t(`hr.tamanhoFardamento.${tamanho}`);
}

interface SeccaoDetalhesPessoaisProps {
  valor: RascunhoPessoais;
  onPatch: (patch: Partial<RascunhoPessoais>) => void;
  erroDe: (campoId: string) => string | null;
  /**
   * Os codigos de admissao que ESTE formulario exige agora (ver
   * `codigosObrigatoriosDoFormulario`): nenhum a enviar convite (a pessoa
   * preenche); os da posicao `convite` quando e o RH a preencher.
   */
  obrigatorios?: ReadonlySet<string>;
  /**
   * Quem nao tem `hr.pessoas.bancarios.edit` nao pode escrever a conta: a
   * seccao do banco fica desactivada, com a explicacao, em vez de perder o que
   * se escrevesse em silencio.
   */
  podeEditarBancarios?: boolean;
  /**
   * Os tamanhos de farda vivem em `pessoas_fardamento`, cuja RLS exige
   * `hr.pessoas.laborais.edit`: sem ela desactivam-se, com a explicacao.
   */
  podeEditarFardamento?: boolean;
  /** A carta de conducao vive em `pessoas_identificacao` (`hr.pessoas.identificacao.edit`). */
  podeEditarIdentificacao?: boolean;
  /**
   * O atalho do resumo de problemas: um campo a focar. Se vive num bloco
   * recolhido, o bloco abre (o foco em si e de quem pede, depois do render).
   * `n` distingue dois pedidos seguidos para o mesmo campo.
   */
  focoPedido?: { campoId: string; n: number } | null;
}

const PREFIXO_MORADA = "hr-novo-morada-";
const PREFIXO_CONTA = "hr-novo-conta-";

export function SeccaoDetalhesPessoais({
  valor,
  onPatch,
  erroDe,
  obrigatorios,
  podeEditarBancarios = true,
  podeEditarFardamento = true,
  podeEditarIdentificacao = true,
  focoPedido = null,
}: SeccaoDetalhesPessoaisProps) {
  const { t } = useTranslation();
  const obr = (codigo: string): boolean => obrigatorios?.has(codigo) ?? false;
  // Titular e banco so se gravam com conta: a RPC exige o numero.
  const temConta = valor.conta_numero.trim() !== "";
  const titularBancoOff = !podeEditarBancarios || !temConta;
  const ajudaTitularBanco =
    podeEditarBancarios && !temConta ? t("hr.form.ajudaTitularBanco") : undefined;

  // Os blocos recolhiveis nao escondem o que falta: abrem sozinhos quando um dos
  // seus campos tem um erro ou um obrigatorio por preencher, e quando o resumo de
  // problemas aponta para um deles. Titular e banco so contam com numero de conta.
  const emFalta = (campoId: string, codigo: string, texto: string, activo = true): boolean =>
    erroDe(campoId) !== null || (activo && obr(codigo) && texto.trim() === "");
  const precisaMorada =
    emFalta("hr-novo-morada-linha1", "linha1", valor.morada_linha1) ||
    emFalta("hr-novo-morada-localidade", "localidade", valor.morada_localidade) ||
    emFalta("hr-novo-morada-codigo-postal", "codigo_postal", valor.morada_codigo_postal);
  const precisaBanco =
    podeEditarBancarios &&
    (emFalta("hr-novo-conta-numero", "conta_numero", valor.conta_numero) ||
      emFalta("hr-novo-conta-bic", "conta_bic", valor.conta_bic) ||
      emFalta("hr-novo-conta-titular", "conta_titular", valor.conta_titular, temConta) ||
      emFalta("hr-novo-conta-banco", "conta_banco", valor.conta_banco, temConta));
  const [moradaAberta, setMoradaAberta] = useState(precisaMorada);
  const [bancoAberto, setBancoAberto] = useState(precisaBanco);
  useEffect(() => {
    if (precisaMorada) setMoradaAberta(true);
  }, [precisaMorada]);
  useEffect(() => {
    if (precisaBanco) setBancoAberto(true);
  }, [precisaBanco]);
  useEffect(() => {
    if (!focoPedido) return;
    if (focoPedido.campoId.startsWith(PREFIXO_MORADA)) setMoradaAberta(true);
    if (focoPedido.campoId.startsWith(PREFIXO_CONTA)) setBancoAberto(true);
  }, [focoPedido]);

  /** Um tamanho de farda, com o detalhe a seguir SO quando e "outro". */
  const tamanho = (
    campo: "cima" | "baixo" | "calcado",
    rotulo: string,
    lista: readonly string[],
  ) => {
    const chave = `tamanho_${campo}` as const;
    const chaveDetalhe = `tamanho_${campo}_detalhe` as const;
    return (
      <>
        <CampoSelect
          id={`hr-novo-tamanho-${campo}`}
          obrigatorio={obr(chave) && podeEditarFardamento}
          disabled={!podeEditarFardamento}
          erro={erroDe(`hr-novo-tamanho-${campo}`)}
          label={rotulo}
          valor={valor[chave]}
          vazioLabel={t("hr.campos.semValor")}
          opcoes={lista.map((tm) => ({ value: tm, label: rotuloTamanho(t, tm) }))}
          onChange={(v) => onPatch(patchTamanho(campo, v))}
        />
        {valor[chave] === "outro" && (
          <CampoTexto
            id={`hr-novo-tamanho-${campo}-detalhe`}
            label={t("hr.fardamento.detalhe")}
            valor={valor[chaveDetalhe]}
            onChange={(v) => onPatch({ [chaveDetalhe]: v } as Partial<RascunhoPessoais>)}
          />
        )}
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoTexto
          id="hr-novo-data-nascimento"
          obrigatorio={obr("data_nascimento")}
          erro={erroDe("hr-novo-data-nascimento")}
          label={t("employees.form.birthDate")}
          tipo="date"
          valor={valor.data_nascimento}
          onChange={(v) => onPatch({ data_nascimento: v })}
        />
        <CampoSelect
          id="hr-novo-genero"
          obrigatorio={obr("genero")}
          erro={erroDe("hr-novo-genero")}
          label={t("hr.campos.genero")}
          valor={valor.genero}
          vazioLabel={t("hr.campos.semValor")}
          opcoes={GENEROS.map((g) => ({ value: g, label: t(`hr.genero.${g}`) }))}
          onChange={(v) => onPatch({ genero: v as Genero | "" })}
        />
        {/* Nacionalidade e pais da morada usam o MESMO componente e a mesma
            fonte (`countries`): para a base ambos sao duas letras maiusculas. */}
        <CampoPais
          id="hr-novo-nacionalidade"
          obrigatorio={obr("nacionalidade")}
          erro={erroDe("hr-novo-nacionalidade")}
          label={t("hr.campos.nacionalidade")}
          valor={valor.nacionalidade}
          onChange={(v) => onPatch({ nacionalidade: v })}
        />
        <CampoSelect
          id="hr-novo-estado-civil"
          obrigatorio={obr("estado_civil")}
          erro={erroDe("hr-novo-estado-civil")}
          label={t("hr.campos.estadoCivil")}
          valor={valor.estado_civil}
          vazioLabel={t("hr.campos.semValor")}
          opcoes={ESTADOS_CIVIS.map((e) => ({ value: e, label: t(`hr.estadoCivil.${e}`) }))}
          onChange={(v) => onPatch(patchEstadoCivil(v as EstadoCivil | ""))}
        />
        <CampoTexto
          id="hr-novo-dependentes"
          obrigatorio={obr("dependentes")}
          label={t("hr.campos.dependentes")}
          tipo="number"
          min={0}
          valor={valor.dependentes}
          erro={erroDe("hr-novo-dependentes")}
          onChange={(v) => onPatch({ dependentes: v })}
        />
        <CampoTexto
          id="hr-novo-dependentes-deficientes"
          obrigatorio={obr("dependentes_deficientes")}
          label={t("hr.campos.dependentesDeficientes")}
          tipo="number"
          min={0}
          max={30}
          valor={valor.dependentes_deficientes}
          erro={erroDe("hr-novo-dependentes-deficientes")}
          onChange={(v) => onPatch({ dependentes_deficientes: v })}
        />
        {/* So se pergunta a quem tem conjuge ou unido de facto (como o convite). */}
        {temConjuge(valor.estado_civil) && (
          <CampoSelect
            id="hr-novo-conjuge-situacao"
            obrigatorio={obr("conjuge_situacao_profissional")}
            erro={erroDe("hr-novo-conjuge-situacao")}
            label={t("hr.campos.conjugeSituacaoProfissional")}
            valor={valor.conjuge_situacao_profissional}
            vazioLabel={t("hr.campos.semValor")}
            opcoes={CONJUGE_SITUACOES_PROFISSIONAIS.map((c) => ({
              value: c,
              label: t(`hr.conjugeSituacaoProfissional.${c}`),
            }))}
            onChange={(v) =>
              onPatch({
                conjuge_situacao_profissional: v as RascunhoPessoais["conjuge_situacao_profissional"],
              })
            }
          />
        )}
        <CampoTexto
          id="hr-novo-telefone-pessoal"
          obrigatorio={obr("telefone_pessoal")}
          erro={erroDe("hr-novo-telefone-pessoal")}
          label={t("hr.campos.telefonePessoal")}
          tipo="tel"
          valor={valor.telefone_pessoal}
          onChange={(v) => onPatch({ telefone_pessoal: v })}
        />
        <CampoTexto
          id="hr-novo-email-pessoal"
          obrigatorio={obr("email_pessoal")}
          label={t("hr.campos.emailPessoal")}
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
        <p className="text-sm font-medium">{t("hr.convite.naturalidadeHabilitacao")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            id="hr-novo-naturalidade-freguesia"
            obrigatorio={obr("naturalidade_freguesia")}
            erro={erroDe("hr-novo-naturalidade-freguesia")}
            label={t("hr.campos.naturalidadeFreguesia")}
            valor={valor.naturalidade_freguesia}
            onChange={(v) => onPatch({ naturalidade_freguesia: v })}
          />
          <CampoTexto
            id="hr-novo-naturalidade-concelho"
            obrigatorio={obr("naturalidade_concelho")}
            erro={erroDe("hr-novo-naturalidade-concelho")}
            label={t("hr.campos.naturalidadeConcelho")}
            valor={valor.naturalidade_concelho}
            onChange={(v) => onPatch({ naturalidade_concelho: v })}
          />
          <CampoPais
            id="hr-novo-naturalidade-pais"
            obrigatorio={obr("naturalidade_pais")}
            erro={erroDe("hr-novo-naturalidade-pais")}
            label={t("hr.campos.naturalidadePais")}
            valor={valor.naturalidade_pais}
            onChange={(v) => onPatch({ naturalidade_pais: v })}
          />
          <CampoSelect
            id="hr-novo-habilitacao"
            obrigatorio={obr("habilitacao_academica")}
            erro={erroDe("hr-novo-habilitacao")}
            label={t("hr.campos.habilitacaoAcademica")}
            valor={valor.habilitacao_academica}
            vazioLabel={t("hr.campos.semValor")}
            opcoes={HABILITACOES_ACADEMICAS.map((h) => ({
              value: h,
              label: t(`hr.habilitacaoAcademica.${h}`),
            }))}
            onChange={(v) =>
              onPatch({ habilitacao_academica: v as RascunhoPessoais["habilitacao_academica"] })
            }
          />
          <CampoTexto
            id="hr-novo-habilitacao-data"
            obrigatorio={obr("habilitacao_data_conclusao")}
            erro={erroDe("hr-novo-habilitacao-data")}
            label={t("hr.campos.habilitacaoDataConclusao")}
            tipo="date"
            valor={valor.habilitacao_data_conclusao}
            onChange={(v) => onPatch({ habilitacao_data_conclusao: v })}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-medium">{t("hr.pessoais.documento")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoSelect
            id="hr-novo-tipo-documento"
            obrigatorio={obr("tipo_documento")}
            erro={erroDe("hr-novo-tipo-documento")}
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
            obrigatorio={obr("numero_documento")}
            erro={erroDe("hr-novo-numero-documento")}
            label={t("hr.campos.numeroDocumento")}
            valor={valor.numero_documento}
            onChange={(v) => onPatch({ numero_documento: v })}
          />
          <CampoTexto
            id="hr-novo-validade-documento"
            obrigatorio={obr("validade_documento") && valor.tipo_documento !== "cartao_cidadao"}
            erro={erroDe("hr-novo-validade-documento")}
            label={t("hr.campos.validadeDocumento")}
            tipo="date"
            valor={valor.validade_documento}
            onChange={(v) => onPatch({ validade_documento: v })}
          />
          <CampoTexto
            id="hr-novo-nif"
            obrigatorio={obr("nif")}
            label={t("hr.campos.nif")}
            valor={valor.nif}
            erro={erroDe("hr-novo-nif")}
            onChange={(v) => onPatch({ nif: v })}
          />
          <CampoTexto
            id="hr-novo-niss"
            obrigatorio={obr("niss")}
            label={t("hr.campos.niss")}
            ajuda={t("hr.form.ajudaNiss")}
            valor={valor.niss}
            erro={erroDe("hr-novo-niss")}
            onChange={(v) => onPatch({ niss: v })}
          />
          {/* A carta de conducao nao esta na configuracao da admissao: nunca e obrigatoria. */}
          {!podeEditarIdentificacao && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {t("hr.form.semPermissaoIdentificacao")}
            </p>
          )}
          <CampoTexto
            id="hr-novo-carta-numero"
            label={t("hr.campos.cartaConducaoNumero")}
            disabled={!podeEditarIdentificacao}
            valor={valor.carta_conducao_numero}
            onChange={(v) => onPatch({ carta_conducao_numero: v })}
          />
          <CampoTexto
            id="hr-novo-carta-categorias"
            label={t("hr.campos.cartaConducaoCategorias")}
            disabled={!podeEditarIdentificacao}
            placeholder="B, B1"
            valor={valor.carta_conducao_categorias}
            onChange={(v) => onPatch({ carta_conducao_categorias: v })}
          />
          <CampoTexto
            id="hr-novo-carta-validade"
            label={t("hr.campos.cartaConducaoValidade")}
            disabled={!podeEditarIdentificacao}
            tipo="date"
            valor={valor.carta_conducao_validade}
            onChange={(v) => onPatch({ carta_conducao_validade: v })}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-medium">{t("hr.fardamento.titulo")}</p>
        {!podeEditarFardamento && (
          <p className="text-xs text-muted-foreground">{t("hr.form.semPermissaoFardamento")}</p>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          {tamanho("cima", t("hr.fardamento.tamanhoCima"), TAMANHOS_FARDAMENTO)}
          {tamanho("baixo", t("hr.fardamento.tamanhoBaixo"), TAMANHOS_CALCAS)}
          {tamanho("calcado", t("hr.fardamento.tamanhoCalcado"), TAMANHOS_CALCADO)}
        </div>
      </div>

      <Collapsible open={moradaAberta} onOpenChange={setMoradaAberta}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="gap-1.5">
            <ChevronDown className="h-4 w-4" />
            {t("hr.pessoais.endereco")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 grid gap-4 sm:grid-cols-2">
          {/* A morada e de linhas livres na base (`linha1`/`linha2`): nao ha
              colunas separadas de rua e numero, e por isso o rotulo pede as
              duas coisas na mesma linha. */}
          <CampoTexto
            id="hr-novo-morada-linha1"
            obrigatorio={obr("linha1")}
            erro={erroDe("hr-novo-morada-linha1")}
            label={t("hr.campos.enderecoRua")}
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
            id="hr-novo-morada-localidade"
            obrigatorio={obr("localidade")}
            erro={erroDe("hr-novo-morada-localidade")}
            label={t("hr.campos.cidade")}
            valor={valor.morada_localidade}
            onChange={(v) => onPatch({ morada_localidade: v })}
          />
          <CampoTexto
            id="hr-novo-morada-codigo-postal"
            obrigatorio={obr("codigo_postal")}
            erro={erroDe("hr-novo-morada-codigo-postal")}
            label={t("employees.form.postalCode")}
            valor={valor.morada_codigo_postal}
            onChange={(v) => onPatch({ morada_codigo_postal: v })}
          />
          <CampoTexto
            id="hr-novo-morada-distrito"
            label={t("hr.campos.provincia")}
            valor={valor.morada_distrito}
            onChange={(v) => onPatch({ morada_distrito: v })}
          />
          <CampoPais
            id="hr-novo-morada-pais"
            label={t("employees.form.country")}
            valor={valor.morada_pais}
            onChange={(v) => onPatch({ morada_pais: v })}
          />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={bancoAberto} onOpenChange={setBancoAberto}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="gap-1.5">
            <ChevronDown className="h-4 w-4" />
            {t("hr.pessoais.bancarios")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 grid gap-4 sm:grid-cols-2">
          {!podeEditarBancarios && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {t("hr.form.semPermissaoBancarios")}
            </p>
          )}
          <CampoSelect
            id="hr-novo-conta-formato"
            label={t("hr.campos.formatoConta")}
            disabled={!podeEditarBancarios}
            valor={valor.conta_formato}
            opcoes={FORMATOS_CONTA.map((formato) => ({
              value: formato,
              label: t(`hr.formatoConta.${formato}`),
            }))}
            onChange={(v) => onPatch({ conta_formato: v as FormatoConta })}
          />
          {/* O rotulo acompanha o formato: quem escolheu CLABE nao devia estar
              a ler "IBAN" em cima do campo. */}
          <CampoTexto
            id="hr-novo-conta-numero"
            obrigatorio={obr("conta_numero")}
            label={t(chaveDoRotuloDaConta(valor.conta_formato))}
            ajuda={t("hr.form.ajudaConta")}
            disabled={!podeEditarBancarios}
            valor={valor.conta_numero}
            erro={erroDe("hr-novo-conta-numero")}
            onChange={(v) => onPatch({ conta_numero: v })}
          />
          {/* O BIC aplica-se a todos os formatos e grava-se mesmo sem numero. */}
          <CampoTexto
            id="hr-novo-conta-bic"
            obrigatorio={obr("conta_bic")}
            label={t("hr.campos.swift")}
            ajuda={t("hr.campos.bicAjuda")}
            disabled={!podeEditarBancarios}
            valor={valor.conta_bic}
            erro={erroDe("hr-novo-conta-bic")}
            onChange={(v) => onPatch({ conta_bic: normalizarBic(v).slice(0, 11) })}
          />
          <CampoTexto
            id="hr-novo-conta-titular"
            obrigatorio={obr("conta_titular") && temConta}
            erro={erroDe("hr-novo-conta-titular")}
            label={t("hr.campos.titularConta")}
            ajuda={ajudaTitularBanco}
            disabled={titularBancoOff}
            valor={valor.conta_titular}
            onChange={(v) => onPatch({ conta_titular: v })}
          />
          <CampoTexto
            id="hr-novo-conta-banco"
            obrigatorio={obr("conta_banco") && temConta}
            erro={erroDe("hr-novo-conta-banco")}
            label={t("hr.campos.banco")}
            ajuda={ajudaTitularBanco}
            disabled={titularBancoOff}
            valor={valor.conta_banco}
            onChange={(v) => onPatch({ conta_banco: v })}
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
