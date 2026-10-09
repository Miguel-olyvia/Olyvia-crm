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
 *
 * ESTE FICHEIRO FOI PARTIDO (tinha mais de 1100 linhas, o limite e 800): os
 * tres grupos de campos, os atalhos de documentos e os dois cartoes de
 * historico vivem em `components/hr/contrato/`. Aqui ficam o rascunho, a
 * validacao e o `gravar()`.
 *
 * O MODELO DO CONTRATO sao o "Tipo de contrato" (sem termo, termo certo, termo
 * incerto, duracao muito curta, temporario) e o "Regime contratual"
 * (individual ou coletivo, `regime_contratual`). "Tempo parcial" ja nao e um
 * tipo: e o "Tipo de trabalho". A DURACAO EM MESES (termo certo) recalcula a
 * data de fim ao mudar o inicio ou os meses -- `useFimDoContratoPorMeses`.
 *
 * AS HORAS DE TRABALHO SO SE EDITAM AQUI AO CRIAR O CONTRATO (20261130120000,
 * corrigido 20261213)
 * -------------------------------------------------------------------
 * `horas_periodo`/`horas_frequencia` do vinculo sao agora DERIVADOS por
 * trigger a partir da versao em aberto de `pessoas_vinculos_horas` --
 * escreve-los directamente num UPDATE do vinculo e recusado pela base
 * (`pessoas_vinculos_horas_e_derivado`). Isso NAO quer dizer que os dois
 * campos fiquem sempre em leitura aqui: um contrato NOVO ainda nao tem versao
 * em vigor nenhuma para o cartao "Horas contratadas" alterar, por isso
 * `criandoContrato` (sem vinculo em vigor) e o UNICO momento em que ficam
 * editaveis, e `onGuardarVinculo`/`usePessoa.saveVinculo` grava-os como a
 * primeira versao de `pessoas_vinculos_horas`. Ao EDITAR um contrato ja
 * existente continuam SO EM LEITURA (mostram o valor em vigor, que continua a
 * vir de `activo`); quem os quer mudar usa o cartao "Horas contratadas", mais
 * abaixo (`PessoaVinculoHorasCard`), que distingue ALTERAR (fecha a versao em
 * vigor e abre outra, com data de efeito) de CORRIGIR (reescreve uma versao
 * ja decorrida) -- a mesma distincao de `PessoaAfectacoesSeccao`.
 *
 * "ANEXAR CONTRATO JA ASSINADO" TAMBEM APARECE AQUI (20261215)
 * --------------------------------------------------------------
 * O mesmo atalho de criar um documento sem modelo, para um contrato ja
 * assinado em papel, que existe no separador Documentos
 * (`PessoaDocumentosTab`) -- aqui e que se trata do contrato, e obrigar a
 * saltar de separador so para anexar o papel assinado era o mesmo atrito que
 * a ficha ja evita nos outros fluxos. O fluxo dos dois passos (criar +
 * anexar ficheiro) vive em `AnexarContratoAssinadoDialog`, reaproveitado sem
 * duplicar nada; este ecra so lhe fornece uma instancia PROPRIA de
 * `usePessoaDocumentos` (o mesmo padrao que `PessoaVinculoHorasCard` ja usa
 * para ler `documentos`) e o botao, gated pela MESMA permissao
 * (`hr.pessoas.documentos.emitir`) que o abre em Documentos. A LISTAGEM dos
 * documentos continua so em Documentos -- este separador nunca a mostra,
 * so o atalho de criacao.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { type OpcaoVinculoDocumento } from "@/components/hr/AnexarContratoAssinadoDialog";
import { CamposTocadosProvider } from "@/components/hr/form/Campos";
import { ContratoAtalhosDocumentos } from "@/components/hr/contrato/ContratoAtalhosDocumentos";
import { ContratoGrupoContrato } from "@/components/hr/contrato/ContratoGrupoContrato";
import { ContratoGrupoDatas } from "@/components/hr/contrato/ContratoGrupoDatas";
import { ContratoGrupoTempoTrabalho } from "@/components/hr/contrato/ContratoGrupoTempoTrabalho";
import { ContratosAnterioresCard } from "@/components/hr/contrato/ContratosAnterioresCard";
import { FimContratoCard } from "@/components/hr/fimContrato/FimContratoCard";
import { HistoricoAlteracoesCard } from "@/components/hr/contrato/HistoricoAlteracoesCard";
import {
  CAMPOS_NUMERICOS,
  numeroOuNull,
  rascunhoDe,
  textoOuNull,
  type DefinirCampo,
  type RascunhoVinculo,
} from "@/components/hr/contrato/rascunhoVinculo";
import { useExperimentalDoContrato } from "@/components/hr/contrato/useExperimentalDoContrato";
import { useFimDoContratoPorMeses } from "@/hooks/useFimDoContratoPorMeses";
import { problemasDosNumerosDoContrato } from "@/lib/hr/contrato";
import { PessoaVinculoHorasCard } from "@/components/hr/PessoaVinculoHorasCard";
import { PessoaRetribuicaoCard } from "@/components/hr/PessoaRetribuicaoCard";
import type { PessoaRetribuicao, PessoaVinculo, TipoTrabalho } from "@/types/hr";
import type { HrCargo } from "@/hooks/useCargos";
import type { HrCargoPeriodo } from "@/lib/hr/cargosPeriodos";

interface PessoaContratoTabProps {
  pessoaId: string;
  organizationId: string;
  vinculos: PessoaVinculo[];
  retribuicao: PessoaRetribuicao | null;
  podeEditar: boolean;
  /** `hr.pessoas.retribuicao.view`: o salario tem permissao propria. */
  podeVerRetribuicao: boolean;
  /**
   * `hr.pessoas.retribuicao.edit`: ALTERAR a retribuicao (fechar a versao em
   * vigor e abrir outra, com data de efeito) e permissao propria, diferente
   * de `podeEditar` (que so cobre o vinculo) -- ver `PessoaRetribuicaoCard`.
   */
  podeEditarRetribuicao: boolean;
  /**
   * `hr.pessoas.retribuicao.corrigir`: CORRIGIR uma versao ja decorrida de
   * `pessoas_retribuicoes` e permissao a parte, mais perigosa que ALTERAR
   * (20261201040000) -- ver `PessoaRetribuicaoCard`.
   */
  podeCorrigirRetribuicao: boolean;
  /** Cargo desta pessoa (`pessoas.cargo_id`), ou `null` sem cargo estruturado
   *  -- ver `PessoaRetribuicaoCard`: com cargo, o salario fica imposto. */
  cargo: HrCargo | null;
  /** Os periodos do salario dos cargos -- de onde `PessoaRetribuicaoCard` tira o valor base. */
  periodosDosCargos: HrCargoPeriodo[];
  /** Os cargos ou os seus periodos ainda a carregar: o cartao nao diz "sem cargo". */
  periodosLoading?: boolean;
  /** Falhou a leitura dos cargos ou dos periodos. */
  periodosError?: boolean;
  /** Depois de definir ou corrigir a retribuicao: o pai recarrega a ficha. */
  onRetribuicaoMudou?: () => void;
  /** Depois de renovar, terminar ou mudar a excepcao de fim de contrato: o pai recarrega a ficha. */
  onContratoMudou?: () => void;
  /**
   * `hr.pessoas.vinculos.horas.corrigir`: CORRIGIR uma versao ja decorrida de
   * `pessoas_vinculos_horas` e permissao a parte, mais perigosa que ALTERAR
   * (essa reaproveita `podeEditar`) -- ver `PessoaVinculoHorasCard`.
   */
  podeCorrigirHoras: boolean;
  /**
   * `hr.pessoas.documentos.emitir`: a MESMA permissao que abre "Anexar
   * contrato ja assinado" em `PessoaDocumentosTab` -- e a mesma classe de
   * accao, "criar um documento novo para esta pessoa", so que acedida a
   * partir deste separador.
   */
  podeAnexarContratoAssinado: boolean;
  /** Vinculos desta pessoa, para o selector opcional do dialogo -- a MESMA
   *  lista que `PessoaDetail` ja calcula para `PessoaDocumentosTab`. */
  vinculosOpcoesDocumento: OpcaoVinculoDocumento[];
  saving: boolean;
  onGuardarVinculo: (
    vinculoId: string | null,
    patch: Partial<PessoaVinculo>,
  ) => Promise<string | null>;
}

export function PessoaContratoTab({
  pessoaId,
  organizationId,
  vinculos,
  podeEditar,
  podeVerRetribuicao,
  podeEditarRetribuicao,
  podeCorrigirRetribuicao,
  cargo,
  periodosDosCargos,
  periodosLoading,
  periodosError,
  onRetribuicaoMudou,
  onContratoMudou,
  podeCorrigirHoras,
  podeAnexarContratoAssinado,
  vinculosOpcoesDocumento,
  saving,
  onGuardarVinculo,
}: PessoaContratoTabProps) {
  const { t } = useTranslation();
  // "Em vigor" e activo OU suspenso, e NAO so activo. Um contrato suspenso
  // continua a ser a relacao laboral vigente -- esta parado, nao acabado.
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
  /**
   * Sem vinculo em vigor: o cartao esta em modo "Novo contrato", e e o UNICO
   * momento em que `horas_periodo`/`horas_frequencia` se escrevem aqui -- ver
   * `ContratoGrupoTempoTrabalho` e `usePessoa.saveVinculo`.
   */
  const criandoContrato = activo === null;

  const [rascunho, setRascunho] = useState<RascunhoVinculo>(() => rascunhoDe(activo));
  useEffect(() => {
    setRascunho(rascunhoDe(activo));
  }, [activo]);

  const experimental = useExperimentalDoContrato(rascunho, setRascunho, activo);

  // Termo certo: a data de fim acompanha o inicio e os meses (a vespera do dia
  // correspondente). Escrever a data a mao acerta os meses -- ver o grupo das datas.
  useFimDoContratoPorMeses({
    tipoContrato: rascunho.tipo_contrato,
    inicioEfectivo: rascunho.data_inicio,
    duracaoMeses: rascunho.duracao_meses,
    dataFim: rascunho.data_fim,
    onDataFim: (data_fim) => setRascunho((anterior) => ({ ...anterior, data_fim })),
  });

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
  /** Muda a cada gravacao feita: o historico de alteracoes recarrega. */
  const [versaoHistorico, setVersaoHistorico] = useState(0);

  const definir: DefinirCampo = (campo, valor) =>
    setRascunho((anterior) => ({ ...anterior, [campo]: valor }));

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
    if (
      rascunho.formacao_inicio.trim() !== "" &&
      rascunho.formacao_fim.trim() !== "" &&
      rascunho.formacao_fim < rascunho.formacao_inicio
    ) {
      setMostrarTodos(true);
      toast.error(t("hr.contrato.erroFormacaoFimAntesInicio"));
      return;
    }
    const erro = await onGuardarVinculo(activo?.id ?? null, {
      tipo_contrato: rascunho.tipo_contrato,
      regime: rascunho.regime,
      regime_contratual: rascunho.regime_contratual,
      estado: rascunho.estado,
      data_inicio: rascunho.data_inicio,
      data_fim: textoOuNull(rascunho.data_fim),
      motivo_termo: textoOuNull(rascunho.motivo_termo),
      periodo_experimental_dias: numeroOuNull(rascunho.periodo_experimental_dias),
      periodo_experimental_ate: textoOuNull(rascunho.periodo_experimental_ate),
      categoria_funcao: rascunho.categoria_funcao,
      periodo_experimental_origem: experimental.temExperimental
        ? rascunho.periodo_experimental_origem
        : null,
      tipo_trabalho:
        rascunho.tipo_trabalho === "" ? null : (rascunho.tipo_trabalho as TipoTrabalho),
      // horas_periodo/horas_frequencia SO vao aqui ao CRIAR o primeiro
      // vinculo: sao derivadas de `pessoas_vinculos_horas` desde
      // 20261130120000, e escreve-las no UPDATE de um vinculo existente e
      // recusado pela base -- por isso so entram no patch quando
      // `criandoContrato`. `usePessoa.saveVinculo` grava a primeira versao
      // em `pessoas_vinculos_horas` a partir destas duas; para ALTERAR ou
      // CORRIGIR um contrato ja existente usa-se `PessoaVinculoHorasCard`.
      ...(criandoContrato
        ? {
            horas_periodo: numeroOuNull(rascunho.horas_periodo),
            horas_frequencia: rascunho.horas_frequencia,
          }
        : {}),
      // Sempre 100%, sem excepcao -- ver a mesma nota em novaPessoa.ts.
      // Grava-se 100 mesmo que o rascunho mostre outro valor (contrato
      // antigo, de antes desta regra), a partir do primeiro guardar.
      tempo_trabalho_pct: 100,
      politica_feriados: rascunho.politica_feriados,
      horas_anuais_maximas: numeroOuNull(rascunho.horas_anuais_maximas),
      horas_semanais_maximas: numeroOuNull(rascunho.horas_semanais_maximas),
      dias_uteis: rascunho.dias_uteis.length > 0 ? rascunho.dias_uteis : null,
      categoria_profissional: textoOuNull(rascunho.categoria_profissional),
      renovavel: rascunho.renovavel === "" ? null : rascunho.renovavel === "sim",
      isencao_horario: rascunho.isencao_horario,
      formacao_inicio: textoOuNull(rascunho.formacao_inicio),
      formacao_fim: textoOuNull(rascunho.formacao_fim),
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    setVersaoHistorico((v) => v + 1);
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
          <div className="flex flex-wrap items-center gap-2">
            {activo && (
              <Badge variant="secondary" className="font-normal">
                {t("hr.estadoVinculo.activo")}
              </Badge>
            )}
            <ContratoAtalhosDocumentos
              pessoaId={pessoaId}
              organizationId={organizationId}
              podeAnexarContratoAssinado={podeAnexarContratoAssinado}
              vinculosOpcoesDocumento={vinculosOpcoesDocumento}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <CamposTocadosProvider onTocar={tocar}>
            <ContratoGrupoContrato rascunho={rascunho} definir={definir} podeEditar={podeEditar} />
            <ContratoGrupoDatas
              rascunho={rascunho}
              definir={definir}
              podeEditar={podeEditar}
              temExperimental={experimental.temExperimental}
              onAlternarExperimental={experimental.alternar}
              sugestaoExperimental={experimental.sugestao}
              onAceitarSugestao={experimental.aceitarSugestao}
              onDefinirCampoExperimental={experimental.definirCampo}
              erroDe={erroDe}
            />
            <ContratoGrupoTempoTrabalho
              rascunho={rascunho}
              definir={definir}
              podeEditar={podeEditar}
              criandoContrato={criandoContrato}
              erroDe={erroDe}
            />
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
        <PessoaRetribuicaoCard
          pessoaId={pessoaId}
          organizationId={organizationId}
          vinculoActivoId={activo?.id ?? null}
          podeAlterar={podeEditarRetribuicao}
          podeCorrigir={podeCorrigirRetribuicao}
          cargo={cargo}
          periodosDoCargo={periodosDosCargos}
          periodosLoading={periodosLoading}
          periodosError={periodosError}
          onMudou={onRetribuicaoMudou}
        />
      )}

      <PessoaVinculoHorasCard
        pessoaId={pessoaId}
        organizationId={organizationId}
        vinculoActivoId={activo?.id ?? null}
        podeAlterar={podeEditar}
        podeCorrigir={podeCorrigirHoras}
      />

      <FimContratoCard
        organizationId={organizationId}
        vinculo={activo}
        podeEditar={podeEditar}
        onMudou={onContratoMudou}
      />

      <ContratosAnterioresCard historico={historico} />

      <HistoricoAlteracoesCard key={versaoHistorico} pessoaId={pessoaId} />
    </div>
  );
}
