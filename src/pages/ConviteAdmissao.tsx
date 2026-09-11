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
 * A conta bancaria JA e gravada (desde 28/11): o IBAN viaja dentro de `dados`
 * como qualquer outra chave do contrato, e a RPC guarda-o cifrado no Vault. O
 * convite so aceita IBAN -- e o unico formato que a RPC sabe gravar -- e por
 * isso nao ha formato nenhum a escolher aqui.
 *
 * TODO O CAMPO TEM ETIQUETA ASSOCIADA, e os obrigatorios sao anunciados a
 * leitor de ecra (nao so a vermelho) -- ver `obrigatorio` em `form/Campos.tsx`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
  GENEROS,
  HABILITACOES_ACADEMICAS,
  TAMANHOS_FARDAMENTO,
  TIPOS_DOCUMENTO,
} from "@/types/hr";
import {
  CODIGOS_PAGINA_2,
  campoEhObrigatorio,
  pendenciasDoRascunho,
} from "@/lib/hr/admissaoObrigatorios";
import {
  RASCUNHO_CONVITE_VAZIO,
  construirPayloadConvite,
  type RascunhoConvite,
} from "@/lib/hr/conviteAdmissaoPayload";

/** Um debounce generoso: nao vale a pena gravar a cada tecla. */
const DEBOUNCE_RASCUNHO_MS = 3000;

/**
 * O tipo do rascunho, a forma vazia e a construcao do payload vivem em
 * `conviteAdmissaoPayload.ts` -- e la que o contrato de chaves com a Edge
 * Function e com a RPC esta amarrado por teste.
 */
type Rascunho = RascunhoConvite;
const VAZIO: Rascunho = RASCUNHO_CONVITE_VAZIO;

export default function ConviteAdmissao() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const {
    estado,
    loading,
    erroInicial,
    submetendo,
    submeter,
    gravarRascunho,
    gravarRascunhoAoFechar,
  } = useConviteAdmissaoPublico(token);

  const [pagina, setPagina] = useState<1 | 2>(1);
  const [rascunho, setRascunho] = useState<Rascunho>(VAZIO);
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [concluido, setConcluido] = useState<{ avisos: string[] } | null>(null);
  const [erroSubmissao, setErroSubmissao] = useState<string | null>(null);
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false);

  const tocar = (campoId: string) =>
    setTocados((anteriores) => {
      if (anteriores.has(campoId)) return anteriores;
      return new Set(anteriores).add(campoId);
    });

  const definir = <K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) =>
    setRascunho((anterior) => ({ ...anterior, [campo]: valor }));

  // Restaura o rascunho gravado (accao "rascunho", ainda por publicar no
  // lado do servidor -- ver o cabecalho do hook) assim que o token e
  // validado. Uma so vez: depois disso e o utilizador quem manda no estado.
  useEffect(() => {
    if (rascunhoRestaurado || !estado) return;
    const bruto = estado.rascunho;
    if (bruto && typeof bruto === "object") {
      setRascunho((anterior) => {
        const restaurado = { ...anterior };
        (Object.keys(VAZIO) as Array<keyof Rascunho>).forEach((campo) => {
          // A "aceite" (declaracao de veracidade) nunca se restaura: nao se
          // pre-assinala uma declaracao legal a partir de um rascunho.
          if (campo === "aceite") return;
          const valor = (bruto as Record<string, unknown>)[campo];
          if (valor === undefined || valor === null) return;
          if (typeof VAZIO[campo] === "boolean") {
            (restaurado as Record<string, unknown>)[campo] = Boolean(valor);
          } else {
            (restaurado as Record<string, unknown>)[campo] = String(valor);
          }
        });
        return restaurado;
      });
    }
    setRascunhoRestaurado(true);
  }, [estado, rascunhoRestaurado]);

  // O rascunho a gravar: tudo menos a declaracao de veracidade, que e o
  // unico campo que nunca deve sobreviver entre visitas.
  const paraGravar = (r: Rascunho): Record<string, unknown> => {
    const { aceite: _aceite, ...resto } = r;
    return resto;
  };

  // Grava, com debounce, sempre que o rascunho muda -- so depois de o
  // restauro inicial acontecer, para nao gravar de volta o que acabou de
  // ser lido.
  const rascunhoRef = useRef(rascunho);
  rascunhoRef.current = rascunho;
  useEffect(() => {
    if (!rascunhoRestaurado || concluido) return;
    const id = setTimeout(() => {
      void gravarRascunho(paraGravar(rascunhoRef.current));
    }, DEBOUNCE_RASCUNHO_MS);
    return () => clearTimeout(id);
  }, [rascunho, rascunhoRestaurado, concluido, gravarRascunho]);

  // E ao fechar a aba -- o debounce acima pode nunca chegar a disparar.
  useEffect(() => {
    if (concluido) return;
    const aoFechar = () => gravarRascunhoAoFechar(paraGravar(rascunhoRef.current));
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "hidden") aoFechar();
    };
    window.addEventListener("pagehide", aoFechar);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      window.removeEventListener("pagehide", aoFechar);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [concluido, gravarRascunhoAoFechar]);

  // Os obrigatorios das DUAS paginas -- a lista partilhada com a base (ver
  // `admissaoObrigatorios.ts`). A base aplica a mesma lista no fim da
  // submissao, sobre a ficha ja escrita; isto aqui e so para a pessoa ver o
  // que lhe falta antes de tentar.
  const pendencias = useMemo(
    () => pendenciasDoRascunho(rascunho),
    [rascunho],
  );
  const pendenciasTodas = useMemo(() => new Set<string>(pendencias), [pendencias]);
  const pendencias1 = useMemo(
    () => new Set<string>(pendencias.filter((codigo) => !CODIGOS_PAGINA_2.has(codigo))),
    [pendencias],
  );

  const erroDe = (campoId: keyof Rascunho): string | null => {
    if (!mostrarTodos && !tocados.has(campoId)) return null;
    return pendenciasTodas.has(campoId) ? t("hr.convite.erroObrigatorio") : null;
  };

  const obrigatorio1 = (campoId: Parameters<typeof campoEhObrigatorio>[1]): boolean =>
    campoEhObrigatorio(rascunho, campoId);

  const avancar = () => {
    if (pendencias1.size > 0) {
      setMostrarTodos(true);
      return;
    }
    setMostrarTodos(false);
    void gravarRascunho(paraGravar(rascunho));
    setPagina(2);
  };

  const podeSubmeter =
    rascunho.assinatura_nome.trim() !== "" && rascunho.aceite && !submetendo;

  const submeterFormulario = async () => {
    if (!podeSubmeter) return;

    // Faltar um obrigatorio nao e erro de servidor: mostra-se onde falta e,
    // se for na pagina 1, volta-se la -- submeter assim so gastava uma ida a
    // base para ser recusado pelo portao de obrigatorios.
    if (pendenciasTodas.size > 0) {
      setMostrarTodos(true);
      setErroSubmissao(t("hr.convite.erroObrigatorio"));
      if (pendencias1.size > 0) setPagina(1);
      return;
    }

    // O payload sai inteiro do contrato partilhado, conta bancaria incluida --
    // ver `conviteAdmissaoPayload.ts`.
    const dados: DadosSubmissaoConvite = construirPayloadConvite(rascunho);

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
                  obrigatorio
                  erro={erroDe("genero")}
                  valor={rascunho.genero}
                  vazioLabel={t("hr.campos.semValor")}
                  opcoes={GENEROS.map((g) => ({ value: g, label: t(`hr.genero.${g}`) }))}
                  onChange={(v) => definir("genero", v)}
                />
                <CampoPais
                  id="convite-nacionalidade"
                  label={t("hr.campos.nacionalidade")}
                  obrigatorio
                  erro={erroDe("nacionalidade")}
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
                  obrigatorio
                  erro={erroDe("email_pessoal")}
                  valor={rascunho.email_pessoal}
                  onChange={(v) => definir("email_pessoal", v)}
                />
                <CampoSelect
                  id="convite-estado-civil"
                  label={t("hr.campos.estadoCivil")}
                  obrigatorio
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
                  obrigatorio
                  erro={erroDe("dependentes")}
                  ajuda={t("hr.convite.ajudaDependentesZero")}
                  valor={rascunho.dependentes}
                  onChange={(v) => definir("dependentes", v)}
                />
                {rascunho.estado_civil === "casado" || rascunho.estado_civil === "uniao_de_facto" ? (
                  <CampoSelect
                    id="convite-conjuge-situacao"
                    label={t("hr.campos.conjugeSituacaoProfissional")}
                    obrigatorio={obrigatorio1("conjuge_situacao_profissional")}
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
                  obrigatorio
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
                  obrigatorio
                  erro={erroDe("naturalidade_freguesia")}
                  valor={rascunho.naturalidade_freguesia}
                  onChange={(v) => definir("naturalidade_freguesia", v)}
                />
                <CampoTexto
                  id="convite-naturalidade-concelho"
                  label={t("hr.campos.naturalidadeConcelho")}
                  obrigatorio
                  erro={erroDe("naturalidade_concelho")}
                  valor={rascunho.naturalidade_concelho}
                  onChange={(v) => definir("naturalidade_concelho", v)}
                />
                <CampoPais
                  id="convite-naturalidade-pais"
                  label={t("hr.campos.naturalidadePais")}
                  obrigatorio
                  erro={erroDe("naturalidade_pais")}
                  valor={rascunho.naturalidade_pais}
                  onChange={(v) => definir("naturalidade_pais", v)}
                />
                <CampoSelect
                  id="convite-habilitacao"
                  label={t("hr.campos.habilitacaoAcademica")}
                  obrigatorio
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
                  obrigatorio
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
                  obrigatorio={obrigatorio1("validade_documento")}
                  erro={erroDe("validade_documento")}
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
                  id="convite-niss"
                  label={t("hr.campos.niss")}
                  obrigatorio
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
              </CardHeader>
              {/*
                So IBAN: e o unico formato de conta que a RPC sabe gravar, e
                oferecer os outros seis era prometer o que o servidor recusa.
                `conta_formato` fica fixo em "iban" no rascunho.
              */}
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <CampoTexto
                  id="convite-conta-numero"
                  label={t("hr.campos.iban")}
                  className="sm:col-span-2"
                  obrigatorio
                  erro={erroDe("conta_numero")}
                  valor={rascunho.conta_numero}
                  onChange={(v) => definir("conta_numero", v)}
                />
                <CampoTexto
                  id="convite-conta-titular"
                  label={t("hr.campos.titularConta")}
                  obrigatorio
                  erro={erroDe("conta_titular")}
                  valor={rascunho.conta_titular}
                  onChange={(v) => definir("conta_titular", v)}
                />
                <CampoTexto
                  id="convite-conta-banco"
                  label={t("hr.campos.banco")}
                  obrigatorio
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
                  obrigatorio
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
                  obrigatorio
                  erro={erroDe("tamanho_baixo")}
                  valor={rascunho.tamanho_baixo}
                  vazioLabel={t("hr.campos.semValor")}
                  opcoes={TAMANHOS_FARDAMENTO.map((tm) => ({
                    value: tm,
                    label: t(`hr.tamanhoFardamento.${tm}`),
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
                  id="convite-tamanho-blazer"
                  label={t("hr.fardamento.tamanhoBlazer")}
                  obrigatorio
                  erro={erroDe("tamanho_blazer")}
                  valor={rascunho.tamanho_blazer}
                  vazioLabel={t("hr.campos.semValor")}
                  opcoes={TAMANHOS_FARDAMENTO.map((tm) => ({
                    value: tm,
                    label: t(`hr.tamanhoFardamento.${tm}`),
                  }))}
                  onChange={(v) => definir("tamanho_blazer", v)}
                />
                {rascunho.tamanho_blazer === "outro" && (
                  <CampoTexto
                    id="convite-tamanho-blazer-detalhe"
                    label={t("hr.fardamento.detalhe")}
                    valor={rascunho.tamanho_blazer_detalhe}
                    onChange={(v) => definir("tamanho_blazer_detalhe", v)}
                  />
                )}
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
                    obrigatorio={obrigatorio1("sindicato")}
                    erro={erroDe("sindicato")}
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
