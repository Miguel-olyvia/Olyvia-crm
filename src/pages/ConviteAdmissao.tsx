/**
 * O formulario do convite de admissao -- pagina publica, SEM sessao, aberta
 * pelo link que o e-mail de convite leva. Duas paginas:
 *
 *  1. Dados pessoais, identificacao e morada.
 *  2. Dados bancarios, fardamento, sindicalizacao e assinatura.
 *
 * O QUE NAO SE PEDE AQUI
 * ------------------------
 * A filiacao sindical NUNCA se revela a quem reenvia este link (nao ha forma
 * mascarada -- e tudo ou nada, ver `PessoaSindicalizacaoCard.tsx`), mas o
 * CAMPO de escrita existe: quem preenche o convite pode DECLARAR a sua
 * filiacao, que so a base volta a mostrar a quem tiver
 * `hr.pessoas.sindicalizacao.view`.
 *
 * O numero da conta bancaria fica capturado mas NAO gravado nesta ronda --
 * ver o comentario no topo da Edge Function `convite-admissao`. O aviso
 * devolvido pela submissao aparece no ecra de sucesso, nao como erro.
 *
 * TODO O CAMPO TEM ETIQUETA ASSOCIADA, e os obrigatorios sao anunciados a
 * leitor de ecra (nao so a vermelho) -- ver `obrigatorio` em `form/Campos.tsx`.
 */
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useConviteAdmissaoPublico,
  type DadosSubmissaoConvite,
} from "@/hooks/useConviteAdmissaoPublico";
import {
  CamposTocadosProvider,
  CampoInterruptor,
  CampoPais,
  CampoSelect,
  CampoTexto,
} from "@/components/hr/form/Campos";
import {
  CONJUGE_SITUACOES_PROFISSIONAIS,
  ESTADOS_CIVIS,
  FORMATOS_CONTA,
  GENEROS,
  HABILITACOES_ACADEMICAS,
  TAMANHOS_FARDAMENTO,
  TIPOS_DOCUMENTO,
} from "@/types/hr";

type Rascunho = {
  // Pagina 1 -- pessoas_dados_pessoais, pessoas_identificacao, pessoas_moradas.
  data_nascimento: string;
  genero: string;
  nacionalidade: string;
  telefone_pessoal: string;
  email_pessoal: string;
  estado_civil: string;
  dependentes: string;
  naturalidade_freguesia: string;
  naturalidade_concelho: string;
  naturalidade_pais: string;
  conjuge_situacao_profissional: string;
  dependentes_deficientes: string;
  habilitacao_academica: string;
  habilitacao_data_conclusao: string;
  tipo_documento: string;
  numero_documento: string;
  validade_documento: string;
  nif: string;
  carta_conducao_numero: string;
  carta_conducao_categorias: string;
  carta_conducao_validade: string;
  linha1: string;
  linha2: string;
  codigo_postal: string;
  localidade: string;
  distrito: string;
  pais: string;
  // Pagina 2 -- conta bancaria (nao gravada, ver cabecalho), fardamento,
  // sindicalizacao, assinatura.
  conta_formato: string;
  conta_numero: string;
  conta_titular: string;
  conta_banco: string;
  tamanho_cima: string;
  tamanho_baixo: string;
  tamanho_blazer: string;
  sindicalizado: boolean;
  sindicato: string;
  assinatura_nome: string;
  aceite: boolean;
};

const VAZIO: Rascunho = {
  data_nascimento: "",
  genero: "",
  nacionalidade: "",
  telefone_pessoal: "",
  email_pessoal: "",
  estado_civil: "",
  dependentes: "",
  naturalidade_freguesia: "",
  naturalidade_concelho: "",
  naturalidade_pais: "",
  conjuge_situacao_profissional: "",
  dependentes_deficientes: "",
  habilitacao_academica: "",
  habilitacao_data_conclusao: "",
  tipo_documento: "",
  numero_documento: "",
  validade_documento: "",
  nif: "",
  carta_conducao_numero: "",
  carta_conducao_categorias: "",
  carta_conducao_validade: "",
  linha1: "",
  linha2: "",
  codigo_postal: "",
  localidade: "",
  distrito: "",
  pais: "PT",
  conta_formato: "",
  conta_numero: "",
  conta_titular: "",
  conta_banco: "",
  tamanho_cima: "",
  tamanho_baixo: "",
  tamanho_blazer: "",
  sindicalizado: false,
  sindicato: "",
  assinatura_nome: "",
  aceite: false,
};

function ouNull(valor: string): string | null {
  return valor.trim() === "" ? null : valor.trim();
}

export default function ConviteAdmissao() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const { estado, loading, erroInicial, submetendo, submeter } = useConviteAdmissaoPublico(token);

  const [pagina, setPagina] = useState<1 | 2>(1);
  const [rascunho, setRascunho] = useState<Rascunho>(VAZIO);
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [concluido, setConcluido] = useState<{ avisos: string[] } | null>(null);
  const [erroSubmissao, setErroSubmissao] = useState<string | null>(null);

  const tocar = (campoId: string) =>
    setTocados((anteriores) => {
      if (anteriores.has(campoId)) return anteriores;
      return new Set(anteriores).add(campoId);
    });

  const definir = <K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) =>
    setRascunho((anterior) => ({ ...anterior, [campo]: valor }));

  // Obrigatorios da pagina 1: o minimo para a ficha ficar utilizavel -- nao
  // sao exigencias da base (essas ja se aplicam do lado de la), sao a
  // fasquia deste formulario.
  const erroPagina1 = useMemo(() => {
    const erros: Partial<Record<keyof Rascunho, string>> = {};
    if (rascunho.data_nascimento.trim() === "") erros.data_nascimento = t("hr.convite.erroObrigatorio");
    if (rascunho.telefone_pessoal.trim() === "") erros.telefone_pessoal = t("hr.convite.erroObrigatorio");
    if (rascunho.nif.trim() === "") erros.nif = t("hr.convite.erroObrigatorio");
    if (rascunho.tipo_documento.trim() === "") erros.tipo_documento = t("hr.convite.erroObrigatorio");
    if (rascunho.numero_documento.trim() === "") erros.numero_documento = t("hr.convite.erroObrigatorio");
    if (rascunho.linha1.trim() === "") erros.linha1 = t("hr.convite.erroObrigatorio");
    if (rascunho.codigo_postal.trim() === "") erros.codigo_postal = t("hr.convite.erroObrigatorio");
    if (rascunho.localidade.trim() === "") erros.localidade = t("hr.convite.erroObrigatorio");
    return erros;
  }, [rascunho, t]);

  const erroDe = (campoId: keyof Rascunho): string | null => {
    if (!mostrarTodos && !tocados.has(campoId)) return null;
    return erroPagina1[campoId] ?? null;
  };

  const avancar = () => {
    if (Object.keys(erroPagina1).length > 0) {
      setMostrarTodos(true);
      return;
    }
    setMostrarTodos(false);
    setPagina(2);
  };

  const podeSubmeter =
    rascunho.assinatura_nome.trim() !== "" && rascunho.aceite && !submetendo;

  const submeterFormulario = async () => {
    if (!podeSubmeter) return;
    const dados: DadosSubmissaoConvite = {
      data_nascimento: ouNull(rascunho.data_nascimento),
      genero: ouNull(rascunho.genero),
      nacionalidade: ouNull(rascunho.nacionalidade)?.toUpperCase() ?? null,
      telefone_pessoal: ouNull(rascunho.telefone_pessoal),
      email_pessoal: ouNull(rascunho.email_pessoal),
      estado_civil: ouNull(rascunho.estado_civil),
      dependentes: rascunho.dependentes.trim() === "" ? null : Number(rascunho.dependentes),
      naturalidade_freguesia: ouNull(rascunho.naturalidade_freguesia),
      naturalidade_concelho: ouNull(rascunho.naturalidade_concelho),
      naturalidade_pais: ouNull(rascunho.naturalidade_pais)?.toUpperCase() ?? null,
      conjuge_situacao_profissional: ouNull(rascunho.conjuge_situacao_profissional),
      dependentes_deficientes:
        rascunho.dependentes_deficientes.trim() === ""
          ? null
          : Number(rascunho.dependentes_deficientes),
      habilitacao_academica: ouNull(rascunho.habilitacao_academica),
      habilitacao_data_conclusao: ouNull(rascunho.habilitacao_data_conclusao),
      tipo_documento: ouNull(rascunho.tipo_documento),
      numero_documento: ouNull(rascunho.numero_documento),
      validade_documento: ouNull(rascunho.validade_documento),
      nif: ouNull(rascunho.nif),
      carta_conducao_numero: ouNull(rascunho.carta_conducao_numero),
      carta_conducao_categorias: ouNull(rascunho.carta_conducao_categorias),
      carta_conducao_validade: ouNull(rascunho.carta_conducao_validade),
      linha1: ouNull(rascunho.linha1),
      linha2: ouNull(rascunho.linha2),
      codigo_postal: ouNull(rascunho.codigo_postal),
      localidade: ouNull(rascunho.localidade),
      distrito: ouNull(rascunho.distrito),
      pais: ouNull(rascunho.pais)?.toUpperCase() ?? "PT",
      tamanho_cima: ouNull(rascunho.tamanho_cima),
      tamanho_baixo: ouNull(rascunho.tamanho_baixo),
      tamanho_blazer: ouNull(rascunho.tamanho_blazer),
      sindicalizado: rascunho.sindicalizado,
      sindicato: rascunho.sindicalizado ? ouNull(rascunho.sindicato) : null,
      // So existe para a Edge Function detectar e avisar que nao foi gravada
      // -- ver o cabecalho deste ficheiro.
      conta:
        rascunho.conta_formato.trim() !== "" || rascunho.conta_numero.trim() !== ""
          ? {
              formato: rascunho.conta_formato,
              numero: rascunho.conta_numero,
              titular: ouNull(rascunho.conta_titular),
              banco: ouNull(rascunho.conta_banco),
            }
          : undefined,
    };

    setErroSubmissao(null);
    const resultado = await submeter(dados, rascunho.assinatura_nome.trim());
    if (!resultado.ok) {
      setErroSubmissao(resultado.erro ?? t("hr.convite.erroSubmeter"));
      return;
    }
    setConcluido({ avisos: resultado.avisos });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (erroInicial || !estado) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("hr.convite.tokenInvalidoTitulo")}</CardTitle>
            <CardDescription>{t("hr.convite.tokenInvalidoDescricao")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (concluido) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <CheckCircle2 className="h-10 w-10 text-primary" />
            <CardTitle>{t("hr.convite.sucessoTitulo")}</CardTitle>
            <CardDescription>{t("hr.convite.sucessoDescricao")}</CardDescription>
          </CardHeader>
          {concluido.avisos.includes("conta_nao_gravada") && (
            <CardContent>
              <p className="text-center text-sm text-muted-foreground" role="status">
                {t("hr.convite.avisoContaNaoGravada")}
              </p>
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">{t("hr.convite.tituloPagina")}</h1>
        <p className="text-muted-foreground">
          {estado.nome
            ? t("hr.convite.saudacao", { nome: estado.nome })
            : t("hr.convite.subtituloPagina")}
        </p>
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          {t("hr.convite.paginaDe", { atual: String(pagina), total: "2" })}
        </p>
      </div>

      <CamposTocadosProvider onTocar={tocar}>
        {pagina === 1 && (
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
                  obrigatorio
                  erro={erroDe("data_nascimento")}
                  valor={rascunho.data_nascimento}
                  onChange={(v) => definir("data_nascimento", v)}
                />
                <CampoSelect
                  id="convite-genero"
                  label={t("hr.campos.genero")}
                  valor={rascunho.genero}
                  vazioLabel={t("hr.campos.semValor")}
                  opcoes={GENEROS.map((g) => ({ value: g, label: t(`hr.genero.${g}`) }))}
                  onChange={(v) => definir("genero", v)}
                />
                <CampoPais
                  id="convite-nacionalidade"
                  label={t("hr.campos.nacionalidade")}
                  valor={rascunho.nacionalidade}
                  onChange={(v) => definir("nacionalidade", v)}
                />
                <CampoTexto
                  id="convite-telefone-pessoal"
                  label={t("hr.campos.telefonePessoal")}
                  obrigatorio
                  erro={erroDe("telefone_pessoal")}
                  valor={rascunho.telefone_pessoal}
                  onChange={(v) => definir("telefone_pessoal", v)}
                />
                <CampoTexto
                  id="convite-email-pessoal"
                  label={t("hr.campos.emailPessoal")}
                  tipo="email"
                  valor={rascunho.email_pessoal}
                  onChange={(v) => definir("email_pessoal", v)}
                />
                <CampoSelect
                  id="convite-estado-civil"
                  label={t("hr.campos.estadoCivil")}
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
                  valor={rascunho.dependentes}
                  onChange={(v) => definir("dependentes", v)}
                />
                {rascunho.estado_civil === "casado" || rascunho.estado_civil === "uniao_de_facto" ? (
                  <CampoSelect
                    id="convite-conjuge-situacao"
                    label={t("hr.campos.conjugeSituacaoProfissional")}
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
                  valor={rascunho.naturalidade_freguesia}
                  onChange={(v) => definir("naturalidade_freguesia", v)}
                />
                <CampoTexto
                  id="convite-naturalidade-concelho"
                  label={t("hr.campos.naturalidadeConcelho")}
                  valor={rascunho.naturalidade_concelho}
                  onChange={(v) => definir("naturalidade_concelho", v)}
                />
                <CampoPais
                  id="convite-naturalidade-pais"
                  label={t("hr.campos.naturalidadePais")}
                  valor={rascunho.naturalidade_pais}
                  onChange={(v) => definir("naturalidade_pais", v)}
                />
                <CampoSelect
                  id="convite-habilitacao"
                  label={t("hr.campos.habilitacaoAcademica")}
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
                  obrigatorio
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
                  obrigatorio
                  erro={erroDe("numero_documento")}
                  valor={rascunho.numero_documento}
                  onChange={(v) => definir("numero_documento", v)}
                />
                <CampoTexto
                  id="convite-validade-documento"
                  label={t("hr.campos.validadeDocumento")}
                  tipo="date"
                  valor={rascunho.validade_documento}
                  onChange={(v) => definir("validade_documento", v)}
                />
                <CampoTexto
                  id="convite-nif"
                  label={t("hr.campos.nif")}
                  obrigatorio
                  erro={erroDe("nif")}
                  valor={rascunho.nif}
                  onChange={(v) => definir("nif", v)}
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
                  obrigatorio
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
                  obrigatorio
                  erro={erroDe("codigo_postal")}
                  valor={rascunho.codigo_postal}
                  onChange={(v) => definir("codigo_postal", v)}
                />
                <CampoTexto
                  id="convite-localidade"
                  label={t("hr.campos.localidade")}
                  obrigatorio
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

            <div className="flex justify-end">
              <Button onClick={avancar}>{t("hr.convite.seguinte")}</Button>
            </div>
          </div>
        )}

        {pagina === 2 && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("hr.pessoais.bancarios")}</CardTitle>
                <CardDescription>{t("hr.convite.avisoContaProvisoria")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <CampoSelect
                  id="convite-conta-formato"
                  label={t("hr.campos.formatoConta")}
                  valor={rascunho.conta_formato}
                  vazioLabel={t("hr.campos.semValor")}
                  opcoes={FORMATOS_CONTA.map((f) => ({ value: f, label: t(`hr.formatoConta.${f}`) }))}
                  onChange={(v) => definir("conta_formato", v)}
                />
                <CampoTexto
                  id="convite-conta-numero"
                  label={t("hr.campos.numeroConta")}
                  valor={rascunho.conta_numero}
                  onChange={(v) => definir("conta_numero", v)}
                />
                <CampoTexto
                  id="convite-conta-titular"
                  label={t("hr.campos.titularConta")}
                  valor={rascunho.conta_titular}
                  onChange={(v) => definir("conta_titular", v)}
                />
                <CampoTexto
                  id="convite-conta-banco"
                  label={t("hr.campos.banco")}
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
                  valor={rascunho.tamanho_cima}
                  vazioLabel={t("hr.campos.semValor")}
                  opcoes={TAMANHOS_FARDAMENTO.map((tm) => ({
                    value: tm,
                    label: t(`hr.tamanhoFardamento.${tm}`),
                  }))}
                  onChange={(v) => definir("tamanho_cima", v)}
                />
                <CampoSelect
                  id="convite-tamanho-baixo"
                  label={t("hr.fardamento.tamanhoBaixo")}
                  valor={rascunho.tamanho_baixo}
                  vazioLabel={t("hr.campos.semValor")}
                  opcoes={TAMANHOS_FARDAMENTO.map((tm) => ({
                    value: tm,
                    label: t(`hr.tamanhoFardamento.${tm}`),
                  }))}
                  onChange={(v) => definir("tamanho_baixo", v)}
                />
                <CampoSelect
                  id="convite-tamanho-blazer"
                  label={t("hr.fardamento.tamanhoBlazer")}
                  valor={rascunho.tamanho_blazer}
                  vazioLabel={t("hr.campos.semValor")}
                  opcoes={TAMANHOS_FARDAMENTO.map((tm) => ({
                    value: tm,
                    label: t(`hr.tamanhoFardamento.${tm}`),
                  }))}
                  onChange={(v) => definir("tamanho_blazer", v)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("hr.sindicalizacao.titulo")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CampoInterruptor
                  id="convite-sindicalizado"
                  label={t("hr.campos.sindicalizado")}
                  checked={rascunho.sindicalizado}
                  onChange={(v) => definir("sindicalizado", v)}
                />
                {rascunho.sindicalizado && (
                  <CampoTexto
                    id="convite-sindicato"
                    label={t("hr.campos.sindicato")}
                    valor={rascunho.sindicato}
                    onChange={(v) => definir("sindicato", v)}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("hr.convite.assinatura")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CampoTexto
                  id="convite-assinatura-nome"
                  label={t("hr.convite.assinaturaNome")}
                  obrigatorio
                  valor={rascunho.assinatura_nome}
                  onChange={(v) => definir("assinatura_nome", v)}
                />
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="convite-aceite"
                    checked={rascunho.aceite}
                    aria-required="true"
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
                {erroSubmissao && (
                  <p role="alert" className="text-sm text-destructive">
                    {erroSubmissao}
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setPagina(1)} disabled={submetendo}>
                {t("hr.convite.anterior")}
              </Button>
              <Button onClick={submeterFormulario} disabled={!podeSubmeter}>
                {submetendo && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {t("hr.convite.submeter")}
              </Button>
            </div>
          </div>
        )}
      </CamposTocadosProvider>
    </div>
  );
}
