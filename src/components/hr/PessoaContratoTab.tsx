/**
 * O separador Contratos da ficha: o vinculo activo, editavel, e o historico.
 *
 * PORQUE O HISTORICO NAO SE EDITA
 * -------------------------------
 * `pessoas_vinculos` guarda versoes: um vinculo EM VIGOR por pessoa -- activo
 * ou suspenso, indice unico parcial `idx_pessoas_vinculos_um_em_vigor` -- e os
 * anteriores em
 * `terminado`. Mudar de 40h para 20h nao e editar o passado -- e fechar o
 * vinculo e abrir outro. Aqui edita-se o ACTIVO; os outros mostram-se em
 * leitura, e o DELETE esta bloqueado por politica na base.
 *
 * O tempo de trabalho (modalidade, frequencia, FTE, dias uteis, feriados,
 * maximos) vive na MESMA linha do contrato, e nao numa tabela ao lado, por
 * isso mesmo: se vivesse noutra tabela, uma alteracao de jornada nao criava
 * versao nova de contrato.
 *
 * DOIS ROTULOS QUE NAO CORRESPONDEM AO NOME DA COLUNA
 * ---------------------------------------------------
 * "Tipo de trabalho" e `regime` (tempo integral / parcial) e "Modalidade" e
 * `tipo_trabalho` (presencial / remoto / hibrido). Sao os nomes que o
 * utilizador usa; as colunas nao mudaram de nome.
 *
 * E ESTE ECRA VALIDA NO CLIENTE
 * -----------------------------
 * Ate agora `gravar()` so verificava a data de inicio: os numeros iam
 * directos, e o `max` dos inputs e um atributo HTML que nao impede colagem
 * nem entrada programatica. A unica barreira real era o CHECK da base, que
 * devolve uma mensagem que ninguem entende. As validacoes sao AS MESMAS do
 * assistente, importadas de `lib/hr/contrato` -- nao uma segunda copia.
 *
 * O ESTADO DO VINCULO PASSA A EDITAR-SE AQUI
 * -------------------------------------------
 * `estado_contrato` (o campo de negocio, mostrado em Detalhes laborais) e
 * agora SEMPRE derivado do `estado` do vinculo -- ver `lib/hr/estadoContrato.ts`.
 * Quem quiser marcar um contrato como suspenso, terminado ou por iniciar muda
 * o `estado` aqui, nao um enum solto na ficha. Sem RPC nova: grava-se pelo
 * mesmo `onGuardarVinculo` que ja existia. Terminar sem `data_fim` bloqueia-se
 * no cliente -- a mesma perda que a migration de backfill recusa fazer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import {
  CamposTocadosProvider,
  CampoSelect,
  CampoTexto,
} from "@/components/hr/form/Campos";
import {
  problemasDosNumerosDoContrato,
  regimeAoMudarTipoContrato,
  regimeContradizTipoContrato,
  type CampoNumericoContrato,
} from "@/lib/hr/contrato";
import {
  equivalenteParaMostrar,
  horasImplausiveis,
  maximoDaFrequencia,
} from "@/lib/hr/horas";
import {
  DIAS_SEMANA,
  ESTADOS_VINCULO,
  HORAS_FREQUENCIAS,
  PERIODICIDADES,
  POLITICAS_FERIADOS,
  REGIMES_TRABALHO,
  TIPOS_CONTRATO,
  TIPOS_TRABALHO,
  type DiaSemana,
  type EstadoVinculo,
  type HorasFrequencia,
  type Periodicidade,
  type PessoaRetribuicao,
  type PessoaVinculo,
  type PoliticaFeriados,
  type RegimeTrabalho,
  type TipoContrato,
  type TipoTrabalho,
} from "@/types/hr";

interface PessoaContratoTabProps {
  vinculos: PessoaVinculo[];
  retribuicao: PessoaRetribuicao | null;
  podeEditar: boolean;
  /** `hr.pessoas.retribuicao.view`: o salario tem permissao propria. */
  podeVerRetribuicao: boolean;
  saving: boolean;
  onGuardarVinculo: (
    vinculoId: string | null,
    patch: Partial<PessoaVinculo>,
  ) => Promise<string | null>;
}

type Rascunho = {
  tipo_contrato: TipoContrato;
  regime: RegimeTrabalho;
  estado: EstadoVinculo;
  /**
   * UI, nao dados: se o regime foi escolhido A MAO nesta sessao de edicao. E o
   * que a base nao consegue saber (`regime` e NOT NULL DEFAULT 'tempo_inteiro')
   * e o que decide se o regime pode seguir o tipo de contrato. Nao e gravado.
   */
  regime_manual: boolean;
  data_inicio: string;
  data_fim: string;
  motivo_termo: string;
  periodo_experimental_dias: string;
  periodo_experimental_ate: string;
  tipo_trabalho: string;
  /** A quantidade, na unidade de `horas_frequencia`. Nao necessariamente semanal. */
  horas_periodo: string;
  horas_frequencia: HorasFrequencia;
  tempo_trabalho_pct: string;
  politica_feriados: PoliticaFeriados;
  horas_anuais_maximas: string;
  horas_semanais_maximas: string;
  dias_uteis: DiaSemana[];
};

/** Um contrato "tem periodo experimental" se algum dos dois campos vier
 *  preenchido. Nao ha coluna que o diga -- e derivado, e e de proposito: uma
 *  coluna booleana podia contradizer os valores ao lado dela. */
function temAlgumExperimental(rascunho: Rascunho): boolean {
  return (
    rascunho.periodo_experimental_dias.trim() !== "" ||
    rascunho.periodo_experimental_ate.trim() !== ""
  );
}

function rascunhoDe(vinculo: PessoaVinculo | null): Rascunho {
  return {
    tipo_contrato: vinculo?.tipo_contrato ?? "sem_termo",
    regime: vinculo?.regime ?? "tempo_inteiro",
    estado: vinculo?.estado ?? "activo",
    regime_manual: false,
    data_inicio: vinculo?.data_inicio ?? "",
    data_fim: vinculo?.data_fim ?? "",
    motivo_termo: vinculo?.motivo_termo ?? "",
    periodo_experimental_dias:
      vinculo?.periodo_experimental_dias == null ? "" : String(vinculo.periodo_experimental_dias),
    periodo_experimental_ate: vinculo?.periodo_experimental_ate ?? "",
    tipo_trabalho: vinculo?.tipo_trabalho ?? "",
    horas_periodo: vinculo?.horas_periodo == null ? "" : String(vinculo.horas_periodo),
    horas_frequencia: vinculo?.horas_frequencia ?? "semanal",
    tempo_trabalho_pct:
      vinculo?.tempo_trabalho_pct == null ? "" : String(vinculo.tempo_trabalho_pct),
    politica_feriados: vinculo?.politica_feriados ?? "nao_laboral",
    horas_anuais_maximas:
      vinculo?.horas_anuais_maximas == null ? "" : String(vinculo.horas_anuais_maximas),
    horas_semanais_maximas:
      vinculo?.horas_semanais_maximas == null ? "" : String(vinculo.horas_semanais_maximas),
    dias_uteis: vinculo?.dias_uteis ?? [],
  };
}

/** Onde vive, NESTE ecra, cada numero validado por `lib/hr/contrato`. */
const CAMPOS_NUMERICOS: Record<CampoNumericoContrato, string> = {
  horas: "hr-contrato-horas-periodo",
  maximoSemanal: "hr-contrato-horas-semanais-maximas",
  maximoAnual: "hr-contrato-horas-anuais-maximas",
  fte: "hr-contrato-tempo-trabalho-pct",
  experimental: "hr-contrato-periodo-experimental-dias",
};

function numeroOuNull(valor: string): number | null {
  const limpo = valor.trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function textoOuNull(valor: string): string | null {
  return valor.trim() === "" ? null : valor.trim();
}

export function PessoaContratoTab({
  vinculos,
  retribuicao,
  podeEditar,
  podeVerRetribuicao,
  saving,
  onGuardarVinculo,
}: PessoaContratoTabProps) {
  const { t } = useTranslation();
  // "Em vigor" e activo OU suspenso, e NAO so activo. Um contrato suspenso
  // continua a ser a relacao laboral vigente -- esta parada, nao acabada.
  //
  // Procurar so por `activo` tinha uma consequencia que nao e cosmetica: no
  // instante em que alguem marcasse um contrato como suspenso, ele caia para
  // o historico, o cartao voltava a "Novo contrato", e o proximo Gravar
  // inseria um contrato NOVO em vez de editar aquele -- indo bater no indice
  // unico de um contrato em vigor por pessoa, com um erro cru de base.
  const activo = useMemo(
    () =>
      vinculos.find(
        (vinculo) => vinculo.estado === "activo" || vinculo.estado === "suspenso",
      ) ?? null,
    [vinculos],
  );
  const historico = useMemo(
    () => vinculos.filter((vinculo) => vinculo.id !== activo?.id),
    [vinculos, activo?.id],
  );

  const [rascunho, setRascunho] = useState<Rascunho>(() => rascunhoDe(activo));
  useEffect(() => {
    setRascunho(rascunhoDe(activo));
  }, [activo]);

  /**
   * Ha contratos sem periodo experimental nenhum, e a maioria dos que se criam
   * a mao sao esses. Dois campos sempre a vista, sempre vazios, leem-se como
   * coisa por preencher e nao como coisa que nao se aplica.
   *
   * O interruptor NAO e um dado novo na base: e a leitura de haver ou nao
   * valores. Comeca ligado se o contrato ja tiver algum dos dois -- senao
   * abrir um contrato existente escondia o que la esta.
   */
  const [temExperimental, setTemExperimental] = useState(
    () => temAlgumExperimental(rascunhoDe(activo)),
  );
  useEffect(() => {
    setTemExperimental(temAlgumExperimental(rascunhoDe(activo)));
  }, [activo]);

  /** Desligar limpa os dois campos: e a unica leitura honesta de "nao tem". */
  const alternarExperimental = (ligado: boolean) => {
    setTemExperimental(ligado);
    if (!ligado) {
      setRascunho((anterior) => ({
        ...anterior,
        periodo_experimental_dias: "",
        periodo_experimental_ate: "",
      }));
    }
  };

  /** Campos de que se saiu: o erro de formato so aparece depois disso. */
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const tocar = useCallback((campoId: string) => {
    setTocados((anteriores) => {
      if (anteriores.has(campoId)) return anteriores;
      return new Set(anteriores).add(campoId);
    });
  }, []);
  /** Ao submeter mostram-se todos, mesmo os campos em que ninguem entrou. */
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const definir = <K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) =>
    setRascunho((anterior) => ({ ...anterior, [campo]: valor }));

  /**
   * "Tempo parcial" e tipo de contrato E regime: escolher o tipo leva o regime
   * atras, a menos que ele ja tenha sido escolhido a mao -- ai fica como esta e
   * o aviso encarrega-se do resto. Ver `lib/hr/contrato`.
   */
  const escolherTipoContrato = (tipo: TipoContrato) =>
    setRascunho((anterior) => ({
      ...anterior,
      tipo_contrato: tipo,
      regime: regimeAoMudarTipoContrato(tipo, anterior.regime, anterior.regime_manual),
    }));

  const regimeContradiz = regimeContradizTipoContrato(rascunho.tipo_contrato, rascunho.regime);

  const problemasNumericos = useMemo(
    () =>
      problemasDosNumerosDoContrato({
        horas: rascunho.horas_periodo,
        horas_frequencia: rascunho.horas_frequencia,
        horas_semanais_maximas: rascunho.horas_semanais_maximas,
        horas_anuais_maximas: rascunho.horas_anuais_maximas,
        tempo_trabalho_pct: rascunho.tempo_trabalho_pct,
        periodo_experimental_dias: rascunho.periodo_experimental_dias,
      }),
    [rascunho],
  );

  const erroDe = (campoId: string): string | null => {
    const problema = problemasNumericos.find(
      (candidato) => CAMPOS_NUMERICOS[candidato.campo] === campoId,
    );
    if (!problema) return null;
    if (!mostrarTodos && !tocados.has(campoId)) return null;
    return t(problema.mensagemKey);
  };

  // O tecto do campo de horas segue a UNIDADE escolhida: 16 por dia, 80 por
  // semana, 346,67 por mes, 4160 por ano -- todos derivados do mesmo factor
  // que a coluna gerada da base usa.
  const maximoDeHoras = maximoDaFrequencia(rascunho.horas_frequencia);
  const horasNumero = Number(rascunho.horas_periodo.replace(",", "."));
  const horasLegiveis = rascunho.horas_periodo.trim() !== "" && Number.isFinite(horasNumero);
  const equivalente = horasLegiveis
    ? equivalenteParaMostrar(horasNumero, rascunho.horas_frequencia)
    : null;
  const horasSuspeitas =
    horasLegiveis && horasImplausiveis(horasNumero, rascunho.horas_frequencia);

  const gravar = async () => {
    if (rascunho.data_inicio.trim() === "") {
      setMostrarTodos(true);
      toast.error(t("hr.contrato.erroSemDataInicio"));
      return;
    }
    // Nao se manda a base o que ela vai recusar: a mensagem de um CHECK nao
    // diz a ninguem qual o campo nem qual o limite.
    if (problemasNumericos.length > 0) {
      setMostrarTodos(true);
      toast.error(t(problemasNumericos[0].mensagemKey));
      return;
    }
    // Terminar sem data e a mesma perda que a migration de backfill recusa
    // fazer: a data de fim e o unico registo de quando o contrato acabou.
    if (rascunho.estado === "terminado" && rascunho.data_fim.trim() === "") {
      toast.error(t("hr.contrato.erroTerminadoSemDataFim"));
      return;
    }
    const erro = await onGuardarVinculo(activo?.id ?? null, {
      tipo_contrato: rascunho.tipo_contrato,
      regime: rascunho.regime,
      estado: rascunho.estado,
      data_inicio: rascunho.data_inicio,
      data_fim: textoOuNull(rascunho.data_fim),
      motivo_termo: textoOuNull(rascunho.motivo_termo),
      periodo_experimental_dias: numeroOuNull(rascunho.periodo_experimental_dias),
      periodo_experimental_ate: textoOuNull(rascunho.periodo_experimental_ate),
      tipo_trabalho:
        rascunho.tipo_trabalho === "" ? null : (rascunho.tipo_trabalho as TipoTrabalho),
      horas_periodo: numeroOuNull(rascunho.horas_periodo),
      horas_frequencia: rascunho.horas_frequencia,
      tempo_trabalho_pct: numeroOuNull(rascunho.tempo_trabalho_pct),
      politica_feriados: rascunho.politica_feriados,
      horas_anuais_maximas: numeroOuNull(rascunho.horas_anuais_maximas),
      horas_semanais_maximas: numeroOuNull(rascunho.horas_semanais_maximas),
      dias_uteis: rascunho.dias_uteis.length > 0 ? rascunho.dias_uteis : null,
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          {/* O titulo diz o estado; a etiqueta ao lado so existe quando ha
              mesmo contrato. Dizer "Contrato em vigor" com uma etiqueta a
              dizer "Sem contrato" e um botao a dizer "Criar" era o mesmo
              cartao a afirmar tres coisas incompativeis. */}
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {activo ? t("hr.contrato.activoTitulo") : t("hr.contrato.novoTitulo")}
          </CardTitle>
          {activo && (
            <Badge variant="secondary" className="font-normal">
              {t("hr.estadoVinculo.activo")}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <CamposTocadosProvider onTocar={tocar}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <CampoSelect
              id="hr-contrato-tipo"
              label={t("hr.contrato.tipoContrato")}
              valor={rascunho.tipo_contrato}
              disabled={!podeEditar}
              opcoes={TIPOS_CONTRATO.map((tipo) => ({
                value: tipo,
                label: t(`hr.tipoContrato.${tipo}`),
              }))}
              onChange={(v) => escolherTipoContrato(v as TipoContrato)}
            />
            {/* `regime` na base; "Tipo de trabalho" no ecra. Ver cabecalho. */}
            <div className="space-y-1.5">
              <CampoSelect
                id="hr-contrato-regime"
                label={t("hr.contrato.regime")}
                ajuda={t("hr.contrato.ajudaRegime")}
                valor={rascunho.regime}
                disabled={!podeEditar}
                opcoes={REGIMES_TRABALHO.map((regime) => ({
                  value: regime,
                  label: t(`hr.regime.${regime}`),
                }))}
                onChange={(v) =>
                  setRascunho((anterior) => ({
                    ...anterior,
                    regime: v as RegimeTrabalho,
                    regime_manual: true,
                  }))
                }
              />
              {regimeContradiz && (
                <p className="text-xs text-amber-600 dark:text-amber-500" role="status">
                  {t("hr.form.avisoRegimeContradizTipoContrato")}
                </p>
              )}
            </div>
            {/* `tipo_trabalho` na base; "Modalidade" no ecra. Ver cabecalho. */}
            <CampoSelect
              id="hr-contrato-tipo-trabalho"
              label={t("hr.contrato.tipoTrabalho")}
              ajuda={t("hr.contrato.ajudaTipoTrabalho")}
              valor={rascunho.tipo_trabalho}
              vazioLabel={t("hr.campos.semValor")}
              disabled={!podeEditar}
              opcoes={TIPOS_TRABALHO.map((tipo) => ({
                value: tipo,
                label: t(`hr.tipoTrabalho.${tipo}`),
              }))}
              onChange={(v) => definir("tipo_trabalho", v)}
            />
            <CampoSelect
              id="hr-contrato-estado"
              label={t("hr.contrato.estado")}
              valor={rascunho.estado}
              disabled={!podeEditar}
              opcoes={ESTADOS_VINCULO.map((estado) => ({
                value: estado,
                label: t(`hr.estadoVinculo.${estado}`),
              }))}
              onChange={(v) => definir("estado", v as EstadoVinculo)}
            />
            <CampoTexto
              id="hr-contrato-data-inicio"
              label={t("hr.contrato.dataInicio")}
              tipo="date"
              valor={rascunho.data_inicio}
              disabled={!podeEditar}
              onChange={(v) => definir("data_inicio", v)}
            />
            <CampoTexto
              id="hr-contrato-data-fim"
              label={t("hr.contrato.dataFim")}
              tipo="date"
              valor={rascunho.data_fim}
              disabled={!podeEditar}
              onChange={(v) => definir("data_fim", v)}
            />
            <CampoTexto
              id="hr-contrato-motivo-termo"
              label={t("hr.contrato.motivoTermo")}
              valor={rascunho.motivo_termo}
              disabled={!podeEditar}
              onChange={(v) => definir("motivo_termo", v)}
            />
            {/* O interruptor ocupa uma celula da grelha; os dois campos so
                aparecem depois dele, e so quando ha mesmo periodo. */}
            <div className="flex items-center gap-2 self-end pb-2">
              {/* `aria-labelledby` e nao so `htmlFor`: o Switch do Radix e um
                  <button>, e o nome acessivel de um botao NAO vem de uma
                  <label for>. Sem isto o interruptor chega a quem usa leitor
                  de ecra sem nome nenhum. */}
              <Switch
                id="hr-contrato-tem-experimental"
                aria-labelledby="hr-contrato-tem-experimental-rotulo"
                checked={temExperimental}
                disabled={!podeEditar}
                onCheckedChange={alternarExperimental}
              />
              <Label
                id="hr-contrato-tem-experimental-rotulo"
                htmlFor="hr-contrato-tem-experimental"
                className="font-normal"
              >
                {t("hr.contrato.temExperimental")}
              </Label>
            </div>
            {temExperimental && (
              <>
                <CampoTexto
                  id="hr-contrato-periodo-experimental-dias"
                  label={t("hr.contrato.periodoExperimentalDias")}
                  erro={erroDe("hr-contrato-periodo-experimental-dias")}
                  tipo="number"
                  min={0}
                  max={1095}
                  valor={rascunho.periodo_experimental_dias}
                  disabled={!podeEditar}
                  onChange={(v) => definir("periodo_experimental_dias", v)}
                />
                <CampoTexto
                  id="hr-contrato-periodo-experimental-ate"
                  label={t("hr.contrato.periodoExperimentalAte")}
                  ajuda={t("hr.contrato.ajudaExperimentalDuasColunas")}
                  tipo="date"
                  valor={rascunho.periodo_experimental_ate}
                  disabled={!podeEditar}
                  onChange={(v) => definir("periodo_experimental_ate", v)}
                />
              </>
            )}
            <CampoTexto
              id="hr-contrato-horas-periodo"
              label={t("hr.contrato.horasTrabalho")}
              erro={erroDe("hr-contrato-horas-periodo")}
              ajuda={
                equivalente
                  ? t("hr.contrato.ajudaEquivalenteSemanal", { horas: equivalente })
                  : undefined
              }
              tipo="number"
              min={0}
              max={maximoDeHoras}
              step="0.5"
              valor={rascunho.horas_periodo}
              disabled={!podeEditar}
              onChange={(v) => definir("horas_periodo", v)}
            />
            <CampoSelect
              id="hr-contrato-horas-frequencia"
              label={t("hr.contrato.horasFrequencia")}
              valor={rascunho.horas_frequencia}
              disabled={!podeEditar}
              opcoes={HORAS_FREQUENCIAS.map((f) => ({
                value: f,
                label: t(`hr.horasFrequencia.${f}`),
              }))}
              onChange={(v) => definir("horas_frequencia", v as HorasFrequencia)}
            />
            {horasSuspeitas && (
              <p className="text-xs text-amber-600 dark:text-amber-500" role="status">
                {t("hr.form.avisoHorasImplausiveis", { horas: equivalente ?? "" })}
              </p>
            )}
            <CampoTexto
              id="hr-contrato-tempo-trabalho-pct"
              label={t("hr.contrato.tempoTrabalhoPct")}
              erro={erroDe("hr-contrato-tempo-trabalho-pct")}
              tipo="number"
              min={0}
              max={100}
              valor={rascunho.tempo_trabalho_pct}
              disabled={!podeEditar}
              onChange={(v) => definir("tempo_trabalho_pct", v)}
            />
            <CampoSelect
              id="hr-contrato-politica-feriados"
              label={t("hr.contrato.politicaFeriados")}
              valor={rascunho.politica_feriados}
              disabled={!podeEditar}
              opcoes={POLITICAS_FERIADOS.map((p) => ({
                value: p,
                label: t(`hr.politicaFeriados.${p}`),
              }))}
              onChange={(v) => definir("politica_feriados", v as PoliticaFeriados)}
            />
            <CampoTexto
              id="hr-contrato-horas-anuais-maximas"
              label={t("hr.contrato.horasAnuaisMaximas")}
              erro={erroDe("hr-contrato-horas-anuais-maximas")}
              tipo="number"
              min={0}
              max={4000}
              valor={rascunho.horas_anuais_maximas}
              disabled={!podeEditar}
              onChange={(v) => definir("horas_anuais_maximas", v)}
            />
            <CampoTexto
              id="hr-contrato-horas-semanais-maximas"
              label={t("hr.contrato.horasSemanaisMaximas")}
              erro={erroDe("hr-contrato-horas-semanais-maximas")}
              tipo="number"
              min={0}
              max={80}
              step="0.5"
              valor={rascunho.horas_semanais_maximas}
              disabled={!podeEditar}
              onChange={(v) => definir("horas_semanais_maximas", v)}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("hr.contrato.diasUteis")}</legend>
            <div className="flex flex-wrap gap-3">
              {DIAS_SEMANA.map((dia) => {
                const id = `hr-contrato-dia-util-${dia}`;
                return (
                  <div key={dia} className="flex items-center gap-1.5">
                    <Checkbox
                      id={id}
                      checked={rascunho.dias_uteis.includes(dia)}
                      disabled={!podeEditar}
                      onCheckedChange={(marcado) =>
                        definir(
                          "dias_uteis",
                          marcado === true
                            ? [...rascunho.dias_uteis, dia]
                            : rascunho.dias_uteis.filter((outro) => outro !== dia),
                        )
                      }
                    />
                    <Label htmlFor={id} className="text-sm font-normal">
                      {t(`hr.dias.${dia}`)}
                    </Label>
                  </div>
                );
              })}
            </div>
          </fieldset>

          {podeEditar && (
            <Button size="sm" onClick={gravar} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {activo ? t("employees.form.update") : t("employees.form.create")}
            </Button>
          )}
          </CamposTocadosProvider>
        </CardContent>
      </Card>

      {podeVerRetribuicao && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("hr.contrato.retribuicao")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {retribuicao ? (
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span className="tabular-nums font-medium">
                  {retribuicao.valor_base} {retribuicao.moeda}
                </span>
                <span className="text-muted-foreground">
                  {t(`hr.periodicidade.${retribuicao.periodicidade}`)}
                </span>
                <span className="text-muted-foreground">
                  {t("hr.contrato.validoDe")}: {retribuicao.valido_de}
                </span>
              </div>
            ) : (
              <p className="text-muted-foreground">{t("hr.contrato.semRetribuicao")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {historico.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("hr.contrato.historico")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("hr.contrato.tipoContrato")}</TableHead>
                    <TableHead>{t("hr.contrato.dataInicio")}</TableHead>
                    <TableHead>{t("hr.contrato.dataFim")}</TableHead>
                    <TableHead>{t("hr.contrato.estado")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.map((vinculo) => (
                    <TableRow key={vinculo.id}>
                      <TableCell>{t(`hr.tipoContrato.${vinculo.tipo_contrato}`)}</TableCell>
                      <TableCell className="tabular-nums">{vinculo.data_inicio}</TableCell>
                      <TableCell className="tabular-nums">{vinculo.data_fim ?? "—"}</TableCell>
                      <TableCell>{t(`hr.estadoVinculo.${vinculo.estado}`)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
