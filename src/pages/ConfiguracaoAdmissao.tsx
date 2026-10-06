/**
 * Configuracao, por organizacao, do que a admissao pede a cada campo.
 *
 * Dois separadores:
 * - "Campos da pessoa": cada campo tem UMA de tres posicoes -- no convite (a
 *   pessoa tem de o preencher para submeter), na ficha (a pessoa pode submeter
 *   sem ele e fica pendencia para o RH completar) ou opcional (nunca pendente).
 *   Agrupados como a folha de cadastro e pela ordem de
 *   `CAMPOS_OBRIGATORIOS_ADMISSAO`, nao por ordem alfabetica.
 * - "Campos do RH": so leitura. Sao preenchidos pelo RH, nao aparecem no
 *   convite e nao se configuram.
 *
 * A sindicalizacao e a carta de conducao NAO aparecem aqui, de proposito: estao
 * de fora por decisao de RGPD e nunca sao obrigatorias.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useConfiguracaoObrigatoriosAdmissao,
  type ConfiguracaoCampo,
  type PosicaoCampoPessoa,
} from "@/hooks/useConfiguracaoObrigatoriosAdmissao";
import { CAMPOS_OBRIGATORIOS_ADMISSAO } from "@/lib/hr/admissaoObrigatorios";
import {
  CAMPOS_RH_OBRIGATORIOS,
  CAMPOS_RH_OPCIONAIS,
  chaveEtiquetaCampo,
  type CampoRhAdmissao,
} from "@/lib/hr/admissaoCamposRh";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

const POSICOES: readonly PosicaoCampoPessoa[] = ["convite", "ficha", "opcional"];

/** Grupos da folha de cadastro: pagina 1 (pessoais, documentos, morada) e pagina 2 (farda, conta). */
const GRUPOS: ReadonlyArray<{ chave: string; codigos: readonly string[] }> = [
  {
    chave: "hr.admissao.grupo.dadosPessoais",
    codigos: [
      "data_nascimento",
      "genero",
      "nacionalidade",
      "telefone_pessoal",
      "email_pessoal",
      "estado_civil",
      "dependentes",
      "dependentes_deficientes",
      "conjuge_situacao_profissional",
      "naturalidade_freguesia",
      "naturalidade_concelho",
      "naturalidade_pais",
      "habilitacao_academica",
      "habilitacao_data_conclusao",
    ],
  },
  {
    chave: "hr.admissao.grupo.documentos",
    codigos: ["nif", "niss", "tipo_documento", "numero_documento", "validade_documento"],
  },
  { chave: "hr.admissao.grupo.morada", codigos: ["linha1", "codigo_postal", "localidade"] },
  {
    chave: "hr.admissao.grupo.farda",
    codigos: ["tamanho_cima", "tamanho_baixo", "tamanho_calcado"],
  },
  {
    chave: "hr.admissao.grupo.conta",
    codigos: ["conta_numero", "conta_titular", "conta_banco", "conta_bic"],
  },
];

/** Nota por baixo do rotulo dos campos cuja obrigatoriedade depende de outro. */
const NOTA_CONDICIONAL: Record<string, string> = {
  conjuge_situacao_profissional: "hr.admissao.configCondicional.conjuge",
  validade_documento: "hr.admissao.configCondicional.validadeDocumento",
  nif: "hr.admissao.configCondicional.nifNiss",
  niss: "hr.admissao.configCondicional.nifNiss",
};

/** A posicao da base, com `convite` como omissao (a de sempre). */
function posicaoDe(campo: ConfiguracaoCampo): PosicaoCampoPessoa {
  return campo.posicao === "ficha" || campo.posicao === "opcional" ? campo.posicao : "convite";
}

/** Mensagem de erro de definir a posicao, com os codigos estaveis da base traduzidos. */
async function mensagemDeErroPosicao(
  erro: unknown,
  t: (chave: string) => string,
): Promise<string> {
  const texto = erro instanceof Error ? erro.message : (erro as { message?: unknown })?.message;
  if (typeof texto === "string") {
    if (texto.includes("posicao_invalida")) return t("hr.admissao.configErroPosicaoInvalida");
    if (texto.includes("codigo_nao_configuravel")) {
      return t("hr.admissao.configErroNaoConfiguravel");
    }
  }
  return getFriendlyErrorMessage(erro);
}

export default function ConfiguracaoAdmissao() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const podeGerir = hasPermission("hr.admissao.obrigatorios.gerir");

  const { campos, isLoading, isSaving, definirPosicao, erro } =
    useConfiguracaoObrigatoriosAdmissao();

  // So os campos da pessoa que o convite conhece, pela ordem da lista fixa
  // (a da folha de cadastro). Um codigo de origem 'rh' nunca entra aqui.
  const camposPorCodigo = useMemo(() => {
    const mapa = new Map<string, ConfiguracaoCampo>();
    for (const campo of campos) {
      if (campo.origem === "pessoa") mapa.set(campo.codigo, campo);
    }
    return mapa;
  }, [campos]);

  const grupos = useMemo(() => {
    return GRUPOS.map((grupo) => ({
      chave: grupo.chave,
      campos: CAMPOS_OBRIGATORIOS_ADMISSAO.map((c) => c.codigo as string)
        .filter((codigo) => grupo.codigos.includes(codigo))
        .map((codigo) => camposPorCodigo.get(codigo))
        .filter((campo): campo is ConfiguracaoCampo => campo !== undefined),
    })).filter((grupo) => grupo.campos.length > 0);
  }, [camposPorCodigo]);

  // A escolha aparece logo, sem esperar pela RPC e pelo refetch (com latencia,
  // o radio voltava ao valor antigo e parecia que o clique tinha falhado).
  // Sai daqui quando a base ja o confirma, ou ao falhar (volta ao valor antigo).
  const [pendentes, setPendentes] = useState<Readonly<Record<string, PosicaoCampoPessoa>>>({});
  /** O resultado da ultima gravacao, para a regiao anunciada (o toast sozinho nao chega ao leitor de ecra). */
  const [anuncio, setAnuncio] = useState("");

  useEffect(() => {
    setPendentes((anteriores) => {
      const restantes = Object.entries(anteriores).filter(([codigo, posicao]) => {
        const doServidor = camposPorCodigo.get(codigo);
        return !doServidor || posicaoDe(doServidor) !== posicao;
      });
      return restantes.length === Object.keys(anteriores).length
        ? anteriores
        : Object.fromEntries(restantes);
    });
  }, [camposPorCodigo]);

  const posicaoMostrada = (campo: ConfiguracaoCampo): PosicaoCampoPessoa =>
    pendentes[campo.codigo] ?? posicaoDe(campo);

  const mudarPosicao = async (campo: ConfiguracaoCampo, posicao: string) => {
    if (!POSICOES.includes(posicao as PosicaoCampoPessoa)) return;
    // Enquanto ja se grava outra posicao ignora-se o clique: o grupo NAO se
    // desactiva (um radio desactivado perde o foco e o teclado recomecava do topo).
    if (isSaving) return;
    if (posicao === posicaoMostrada(campo)) return;
    const nova = posicao as PosicaoCampoPessoa;
    const etiqueta = t(chaveEtiquetaCampo(campo.codigo));
    setPendentes((anteriores) => ({ ...anteriores, [campo.codigo]: nova }));
    try {
      await definirPosicao(campo.codigo, nova);
      const guardado = t("hr.admissao.configGuardado");
      toast.success(guardado);
      setAnuncio(`${etiqueta}: ${t(`hr.admissao.posicao.${nova}`)}. ${guardado}`);
    } catch (e) {
      setPendentes(({ [campo.codigo]: _revertida, ...restantes }) => restantes);
      const mensagem = await mensagemDeErroPosicao(e, t);
      toast.error(mensagem);
      setAnuncio(mensagem);
    }
  };

  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (!podeGerir) return <SemAcessoCard className="m-6" />;

  const renderCampoPessoa = (campo: ConfiguracaoCampo) => {
    const etiqueta = t(chaveEtiquetaCampo(campo.codigo));
    const chaveNota = NOTA_CONDICIONAL[campo.codigo];
    const posicao = posicaoMostrada(campo);
    return (
      <div
        key={campo.codigo}
        className="flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      >
        <div className="min-w-0">
          <p className="text-sm">{etiqueta}</p>
          {chaveNota && <p className="text-xs text-muted-foreground">{t(chaveNota)}</p>}
        </div>
        <RadioGroup
          aria-label={etiqueta}
          value={posicao}
          aria-busy={isSaving}
          onValueChange={(valor) => mudarPosicao(campo, valor)}
          className="flex flex-row flex-wrap gap-4"
        >
          {POSICOES.map((opcao) => {
            const id = `admissao-posicao-${campo.codigo}-${opcao}`;
            return (
              <div key={opcao} className="flex items-center gap-1.5">
                <RadioGroupItem id={id} value={opcao} />
                <Label htmlFor={id} className="text-sm font-normal">
                  {t(`hr.admissao.posicao.${opcao}`)}
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      </div>
    );
  };

  const renderCampoRh = (campo: CampoRhAdmissao) => (
    <li key={campo.codigo} className="border-b py-3 last:border-b-0">
      <p className="text-sm">{t(chaveEtiquetaCampo(campo.codigo))}</p>
      {campo.nota && <p className="text-xs text-muted-foreground">{t(campo.nota)}</p>}
    </li>
  );

  const rhObrigatorios = CAMPOS_RH_OBRIGATORIOS.filter((c) => c.disponivel !== false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("hr.admissao.configTitulo")}</h1>
        <p className="text-muted-foreground">{t("hr.admissao.configSubtitulo")}</p>
      </div>

      {/* Anuncia o resultado de cada gravacao a leitores de ecra. */}
      <div role="status" aria-live="polite" className="sr-only">
        {anuncio}
      </div>

      {erro && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{erro}</CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex justify-center">
              <OlyviaLoader size={32} />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="pessoa" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pessoa">{t("hr.admissao.configTabPessoa")}</TabsTrigger>
            <TabsTrigger value="rh">{t("hr.admissao.configTabRh")}</TabsTrigger>
          </TabsList>

          <TabsContent value="pessoa" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("hr.admissao.configSeccaoPessoa")}</CardTitle>
                <dl className="grid gap-1 text-sm text-muted-foreground">
                  {POSICOES.map((opcao) => (
                    <div key={opcao} className="flex flex-wrap gap-x-2">
                      <dt className="font-medium text-foreground">
                        {t(`hr.admissao.posicao.${opcao}`)}
                      </dt>
                      <dd>{t(`hr.admissao.posicao.${opcao}Ajuda`)}</dd>
                    </div>
                  ))}
                </dl>
              </CardHeader>
            </Card>

            {grupos.map((grupo) => (
              <Card key={grupo.chave}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-base">{t(grupo.chave)}</CardTitle>
                </CardHeader>
                <CardContent>{grupo.campos.map(renderCampoPessoa)}</CardContent>
              </Card>
            ))}

            <Card>
              <CardContent className="space-y-2 py-4">
                <p className="text-sm">{t("hr.admissao.configAssinaturaSempre")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("hr.admissao.configNuncaObrigatorios")}
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rh" className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("hr.admissao.configRhAjuda")}</p>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">{t("hr.admissao.configRhObrigatorios")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul>{rhObrigatorios.map(renderCampoRh)}</ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">{t("hr.admissao.configRhOpcionais")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul>{CAMPOS_RH_OPCIONAIS.map(renderCampoRh)}</ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
