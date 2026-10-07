/**
 * O assistente de criacao de pessoa: cinco seccoes, preenchiveis de uma vez.
 *
 * (1) Informacoes gerais, (2) Detalhes pessoais, (3) Informacoes laborais,
 * (4) Informacoes de contrato, (5) Configuracoes gerais.
 *
 * NAVEGACAO LIVRE, NAO SEQUENCIAL
 * -------------------------------
 * As cinco entradas da lista sao clicaveis desde o primeiro instante. Nada
 * fica trancado atras de nada, por duas razoes concretas: os passos nao tem
 * dependencias entre si (nenhum campo do passo 4 muda de significado por causa
 * do passo 2), e quem abre o assistente so para escrever o contrato tem de
 * chegar ao passo 4 num clique -- senao deixa de usar o assistente.
 *
 * TODOS OS CAMPOS, SEMPRE. O formulario tem tudo o que o convite de admissao
 * tem; nao ha "modos". O convite e uma ACCAO (interruptor "enviar convite").
 *
 * O QUE E OBRIGATORIO: primeiro nome, apelido e cargo. "Criar ficha" fica activo
 * a partir do momento em que os nomes estao preenchidos, esteja-se no passo que
 * se estiver. Sem convite (o RH preenche) tambem os campos que a configuracao da
 * admissao poe na posicao `convite` -- se e obrigatorio, e obrigatorio. A enviar
 * convite so se exige o e-mail pessoal: a pessoa preenche o resto. Os campos de
 * posicao `ficha` ou `opcional` nunca bloqueiam. VAZIO NUNCA E ERRO FORA DISTO;
 * MALFORMADO E SEMPRE ERRO.
 *
 * A ENTIDADE LEGAL NAO SE ESCOLHE: e a da organizacao activa, e aparece como
 * texto fixo no cabecalho para nao parecer omissao. "Grupo de colaboradores"
 * nao existe.
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Check, CircleDot, Minus } from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useLocaisTrabalho } from "@/hooks/useLocaisTrabalho";
import { usePapeisDaOrganizacao } from "@/hooks/usePapeisDaOrganizacao";
import { useContasLigaveis } from "@/hooks/useContasLigaveis";
import { useCargos } from "@/hooks/useCargos";
import { usePessoaDuplicados } from "@/hooks/usePessoaDuplicados";
import { useAdmissaoPosicoesCampos } from "@/hooks/useAdmissaoPosicoesCampos";
import { useAnexosNovaPessoa } from "@/hooks/useAnexosNovaPessoa";
import { EnviarConviteDialog } from "@/components/hr/EnviarConviteDialog";
import { AnexosNovaPessoa } from "@/components/hr/anexos/AnexosNovaPessoa";
import { PessoaFormAvisos } from "@/components/hr/PessoaFormAvisos";
import { PessoaFormDescartar } from "@/components/hr/PessoaFormDescartar";
import { PessoaFormPassos } from "@/components/hr/PessoaFormPassos";
import { PessoaFormRodape } from "@/components/hr/PessoaFormRodape";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { linhasParaGravar, problemasDoHorario } from "@/lib/hr/horario";
import { formatarSalario, periodoDoCargoEm } from "@/lib/hr/cargosPeriodos";
import { dataDeHoje } from "@/lib/hr/novaPessoaDatas";
import {
  SECCOES,
  camposPorPreencherNaFicha,
  codigosObrigatoriosDoFormulario,
  payloadDoRascunho,
  problemasDoRascunho,
  rascunhoInicial,
  seccaoPreenchida,
  type NovaPessoaPayload,
  type RascunhoPessoa,
  type SeccaoId,
} from "@/lib/hr/novaPessoa";
import {
  preenchimentoDaConta,
  reverterAutoPreenchido,
  type AvisoPreenchimento,
  type CamposPreenchiveis,
} from "@/lib/hr/preenchimentoPorConta";
import { CamposTocadosProvider } from "@/components/hr/form/Campos";
import { codigosIndisponiveis } from "@/lib/hr/novaPessoaAdmissao";
import { focarQuandoExistir } from "@/lib/hr/focarCampo";
import { SeccaoConfiguracoesGerais } from "@/components/hr/form/SeccaoConfiguracoesGerais";
import { SeccaoContrato } from "@/components/hr/form/SeccaoContrato";
import { SeccaoDetalhesPessoais } from "@/components/hr/form/SeccaoDetalhesPessoais";
import { SeccaoInformacoesGerais } from "@/components/hr/form/SeccaoInformacoesGerais";
import { SeccaoInformacoesLaborais } from "@/components/hr/form/SeccaoInformacoesLaborais";
import type { ResultadoCriacao } from "@/hooks/usePessoas";

interface PessoaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pessoas da organizacao activa, para o selector de chefia. */
  colegas: Array<{ id: string; nome_completo: string }>;
  onCriar: (payload: NovaPessoaPayload) => Promise<ResultadoCriacao>;
  onCriada?: (pessoaId: string) => void;
}

export function PessoaFormDialog({
  open,
  onOpenChange,
  colegas,
  onCriar,
  onCriada,
}: PessoaFormDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const { hasPermission } = usePermissions();
  const {
    locais,
    loading: locaisALoad,
    semPermissao: semPermissaoLocais,
    criarLocal,
  } = useLocaisTrabalho();
  const { papeis, loading: papeisALoad } = usePapeisDaOrganizacao();
  const { contas, loading: contasALoad } = useContasLigaveis();
  const { cargos, periodos: periodosDosCargos, isLoading: cargosALoad } = useCargos();
  const cargosActivos = useMemo(() => cargos.filter((c) => c.activo), [cargos]);

  const [rascunho, setRascunho] = useState<RascunhoPessoa>(() => rascunhoInicial());
  /** Ficheiros escolhidos (em memoria): so seguem depois de a ficha ser criada. */
  const anexosNovos = useAnexosNovaPessoa();
  const [seccao, setSeccao] = useState<SeccaoId>("geral");
  const [aCriar, setACriar] = useState(false);
  /**
   * UI, nao dados: a ficha cria-se e o convite de admissao abre a seguir, para a
   * PESSOA preencher o resto. Ligado, so se exige o e-mail pessoal e os
   * obrigatorios deixam de bloquear; desligado, o RH preenche e os obrigatorios
   * da configuracao bloqueiam. Nunca vai para a base.
   */
  const [enviarConvite, setEnviarConvite] = useState(false);
  const [mostrarResumo, setMostrarResumo] = useState(false);
  /** O atalho do resumo: o campo a focar (o bloco recolhido que o tem abre-se). */
  const [focoPedido, setFocoPedido] = useState<{ campoId: string; n: number } | null>(null);
  /** Campos de que a pessoa ja saiu: ate la o erro de formato fica calado. */
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const [aConfirmarDescarte, setAConfirmarDescarte] = useState(false);
  /** O que a conta escolhida escreveu em cada campo (distingue palpite de escrita a mao). */
  const [autoPreenchido, setAutoPreenchido] = useState<Record<string, string>>({});
  const [avisosConta, setAvisosConta] = useState<AvisoPreenchimento[]>([]);
  /**
   * A ficha acabou de ser criada com "A pessoa, por convite": o dialogo de
   * envio abre a seguir, ja com o e-mail pessoal do formulario. So quando ele
   * fecha e que se segue para a ficha (`onCriada`) -- navegar antes tirava o
   * dialogo de debaixo de quem o ia usar (e o link, quando o e-mail falha, so
   * se mostra uma vez).
   */
  const [conviteDaNovaPessoa, setConviteDaNovaPessoa] = useState<{
    pessoaId: string;
    email: string;
  } | null>(null);

  // A configuracao da admissao: so se le com o formulario aberto.
  const {
    campos: configuracaoAdmissao,
    carregando: configuracaoACarregar,
    semAcesso: configuracaoSemAcesso,
  } = useAdmissaoPosicoesCampos(open);

  const podeLigarConta = hasPermission("hr.pessoas.conta.link");

  const {
    travoes: duplicadosTravao,
    sinais: duplicadosSinal,
    semAcesso: duplicadosSemAcesso,
    demasiadasTentativas: duplicadosDemasiadasTentativas,
    verificar: verificarDuplicados,
    limpar: limparDuplicados,
  } = usePessoaDuplicados();
  /** So se confirma quando ha SO sinais; um travao nunca se confirma. */
  const [confirmouSinal, setConfirmouSinal] = useState(false);

  /** Campos cuja alteracao pode mudar o resultado da verificacao de
   * duplicados. So estes disparam a chamada -- os outros (cargo, telefone de
   * trabalho, morada, ...) nao entram nos criterios de deteccao. */
  const CAMPOS_DUPLICADOS = useMemo(
    () =>
      new Set([
        "hr-novo-nif",
        "hr-novo-niss",
        "hr-novo-email-pessoal",
        "hr-novo-tipo-documento",
        "hr-novo-numero-documento",
        "hr-novo-primeiro-nome",
        "hr-novo-apelido",
        "hr-novo-data-nascimento",
      ]),
    [],
  );

  const tocar = useCallback(
    (campoId: string) => {
      setTocados((anteriores) => {
        if (anteriores.has(campoId)) return anteriores;
        return new Set(anteriores).add(campoId);
      });

      if (!CAMPOS_DUPLICADOS.has(campoId) || !activeCompany) return;

      setConfirmouSinal(false);
      void verificarDuplicados({
        organizationId: activeCompany.id,
        nif: rascunho.pessoais.nif,
        niss: rascunho.pessoais.niss,
        emailPessoal: rascunho.pessoais.email_pessoal,
        tipoDocumento: rascunho.pessoais.tipo_documento || null,
        numeroDocumento: rascunho.pessoais.numero_documento,
        primeiroNome: rascunho.geral.primeiro_nome,
        apelido: rascunho.geral.apelido,
        dataNascimento: rascunho.pessoais.data_nascimento || null,
        excluirPessoaId: null,
      });
    },
    [CAMPOS_DUPLICADOS, activeCompany, rascunho, verificarDuplicados],
  );

  /** Os seis campos que uma conta pode preencher, lidos do rascunho actual. */
  const camposActuais = (r: RascunhoPessoa): CamposPreenchiveis => ({
    primeiro_nome: r.geral.primeiro_nome,
    apelido: r.geral.apelido,
    email_trabalho: r.geral.email_trabalho,
    telefone_trabalho: r.geral.telefone_trabalho,
    cargo_id: r.laborais.cargo_id,
    local_id: r.laborais.local_id,
  });

  const valorDoCampo = (campoId: string): string => {
    const actuais = camposActuais(rascunho);
    switch (campoId) {
      case "hr-novo-primeiro-nome":
        return actuais.primeiro_nome;
      case "hr-novo-apelido":
        return actuais.apelido;
      case "hr-novo-email-trabalho":
        return actuais.email_trabalho;
      case "hr-novo-telefone-trabalho":
        return actuais.telefone_trabalho;
      case "hr-novo-cargo":
        return actuais.cargo_id;
      case "hr-novo-local":
        return actuais.local_id;
      default:
        return "";
    }
  };

  /** So se marca como palpite um campo que AINDA tem exactamente o valor que
   * a conta la pos -- editar (mesmo sem sair do campo) ou tocar ja o tira
   * daqui, sem apagar nada. */
  const ePalpite = (campoId: string): boolean =>
    autoPreenchido[campoId] !== undefined &&
    !tocados.has(campoId) &&
    valorDoCampo(campoId) === autoPreenchido[campoId];

  const ajudaDoPalpite = (campoId: string): string | null => {
    if (tocados.has(campoId)) return null;
    const aviso = avisosConta.find((a) => a.campoId === campoId);
    if (!aviso) return null;
    let mensagem = t(aviso.mensagemKey);
    if (aviso.parametros) {
      for (const [chave, valor] of Object.entries(aviso.parametros)) {
        mensagem = mensagem.replace(`{${chave}}`, valor);
      }
    }
    return mensagem;
  };

  /**
   * Trocar (ou limpar) a conta escolhida: primeiro REVERTE os campos que
   * ainda tem exactamente o palpite da conta ANTERIOR, so depois aplica o
   * preenchimento da conta nova -- nunca ao contrario, senao o preenchimento
   * novo seria logo desfeito pela reversao.
   */
  const aoEscolherConta = useCallback(
    (contaId: string) => {
      setRascunho((anterior) => {
        const { patchGeral: reversaoGeral, patchLaborais: reversaoLaborais } = reverterAutoPreenchido(
          camposActuais(anterior),
          autoPreenchido,
        );
        const depoisDaReversao: RascunhoPessoa = {
          ...anterior,
          geral: { ...anterior.geral, ...reversaoGeral, conta_id: contaId },
          laborais: { ...anterior.laborais, ...reversaoLaborais },
        };

        const conta = contas.find((c) => c.id === contaId);
        if (!conta) {
          setAutoPreenchido({});
          setAvisosConta([]);
          return depoisDaReversao;
        }

        const resultado = preenchimentoDaConta(
          conta,
          camposActuais(depoisDaReversao),
          {},
          locais,
          cargosActivos,
        );
        setAutoPreenchido(resultado.autoNovo);
        setAvisosConta(resultado.avisos);

        return {
          ...depoisDaReversao,
          geral: { ...depoisDaReversao.geral, ...resultado.patchGeral },
          laborais: { ...depoisDaReversao.laborais, ...resultado.patchLaborais },
        };
      });
    },
    [autoPreenchido, contas, locais, cargosActivos],
  );

  const podeCriarLocal = hasPermission("hr.locais.edit") && !semPermissaoLocais;
  const podeEditarRetribuicao = hasPermission("hr.pessoas.retribuicao.edit");

  /** O salario base do cargo escolhido, na data em que o contrato comeca (so leitura no passo 4). */
  const salarioDoCargo = useMemo(() => {
    const cargoId = rascunho.laborais.cargo_id;
    if (cargoId === "") return null;
    const data =
      rascunho.contrato.data_inicio.trim() || rascunho.laborais.data_admissao.trim() || dataDeHoje();
    const periodo = periodoDoCargoEm(periodosDosCargos, cargoId, data);
    if (!periodo) return null;
    return formatarSalario(
      { salarioBase: periodo.salario_base, periodicidade: periodo.periodicidade },
      (chave) => t(chave),
    );
  }, [
    rascunho.laborais.cargo_id,
    rascunho.laborais.data_admissao,
    rascunho.contrato.data_inicio,
    periodosDosCargos,
    t,
  ]);
  const podeVerPapeis = hasPermission("roles.view");

  // Sem `hr.pessoas.bancarios.edit` a seccao do banco fica desactivada, e sem
  // `hr.pessoas.laborais.edit` (RLS de `pessoas_fardamento`) os tamanhos de farda:
  // nao se exige o que nao se pode escrever, e fica como pendencia na ficha.
  const podeEditarBancarios = hasPermission("hr.pessoas.bancarios.edit");
  const podeEditarFardamento = hasPermission("hr.pessoas.laborais.edit");
  const podeEditarIdentificacao = hasPermission("hr.pessoas.identificacao.edit");
  const indisponiveis = useMemo(
    () => codigosIndisponiveis({ bancarios: podeEditarBancarios, laborais: podeEditarFardamento }),
    [podeEditarBancarios, podeEditarFardamento],
  );
  // Sem `hr.pessoas.convite.enviar` o interruptor fica desactivado e o formulario
  // segue o regime sem convite (o RH preenche).
  const podeEnviarConvite = hasPermission("hr.pessoas.convite.enviar");
  const comConvite = enviarConvite && podeEnviarConvite;
  const problemas = useMemo(
    () =>
      problemasDoRascunho(rascunho, {
        comConvite,
        config: configuracaoAdmissao,
        indisponiveis,
      }),
    [rascunho, comConvite, configuracaoAdmissao, indisponiveis],
  );
  // A enviar convite so o e-mail pessoal e obrigatorio (o destino do convite);
  // o asterisco e o `aria-required` acompanham-no.
  const obrigatoriosDaPessoa = useMemo(
    () =>
      comConvite
        ? new Set(["email_pessoal"])
        : codigosObrigatoriosDoFormulario(false, configuracaoAdmissao, indisponiveis),
    [comConvite, configuracaoAdmissao, indisponiveis],
  );
  /** O que a configuracao pede e fica por preencher sem bloquear: pendencia na
   * ficha, dita aqui para ninguem achar o contrario. */
  const camposPendentes = useMemo(
    () => camposPorPreencherNaFicha(configuracaoAdmissao, rascunho.pessoais, indisponiveis),
    [configuracaoAdmissao, rascunho.pessoais, indisponiveis],
  );
  /**
   * Sem convite e sem saber a configuracao: `campos = null` NAO e "sem
   * configuracao" -- os campos que a organizacao pos no convite deixariam de
   * ser exigidos e deixaria de aparecer o aviso do que fica como pendencia.
   * Enquanto carrega, o botao espera; depois de carregar, sem configuracao e
   * sem a base a ter recusado por permissao (falha de leitura, ou a leitura
   * nunca correu), o aviso e persistente (a ficha pode sair incompleta e di-se).
   */
  const aEsperarConfiguracao = !comConvite && configuracaoACarregar;
  const configuracaoNaoCarregada =
    !comConvite &&
    configuracaoAdmissao === null &&
    !configuracaoACarregar &&
    !configuracaoSemAcesso;
  const problemasHorario = useMemo(
    () =>
      rascunho.contrato.horario_variavel ? problemasDoHorario(rascunho.contrato.horario) : [],
    [rascunho.contrato.horario_variavel, rascunho.contrato.horario],
  );

  const temNomes =
    rascunho.geral.primeiro_nome.trim() !== "" && rascunho.geral.apelido.trim() !== "";

  /** Os erros de obrigatoriedade mostram-se so no resumo, para nao pintar o
   * formulario de vermelho antes de alguem escrever nada. Os de formato
   * mostram-se ao SAIR do campo -- ou no resumo, que mostra tudo. */
  const erroDe = (campoId: string): string | null => {
    const problema = problemas.find((p) => p.campoId === campoId);
    if (!problema) return null;
    if (mostrarResumo) return t(problema.mensagemKey);
    if (problema.mensagemKey === "hr.form.erroObrigatorio") return null;
    return tocados.has(campoId) ? t(problema.mensagemKey) : null;
  };

  const problemasDaSeccao = (id: SeccaoId) => {
    const doCampo = problemas.filter((p) => p.seccao === id).length;
    if (id === "contrato") return doCampo + problemasHorario.length;
    return doCampo;
  };

  const limpar = () => {
    setRascunho(rascunhoInicial());
    setSeccao("geral");
    setMostrarResumo(false);
    setTocados(new Set());
    setAConfirmarDescarte(false);
    setAutoPreenchido({});
    setAvisosConta([]);
    limparDuplicados();
    setConfirmouSinal(false);
    setEnviarConvite(false);
    setFocoPedido(null);
    anexosNovos.limpar();
  };

  const temDados = SECCOES.some((id) => seccaoPreenchida(rascunho, id)) || anexosNovos.temFicheiros;

  /** Fechar com dados preenchidos pede confirmacao: um Escape distraido nao
   * pode apagar cinco seccoes em silencio. Vazio fecha logo. */
  const tentarFechar = () => {
    // A criar, nao ha nada a confirmar: o rascunho ja foi enviado.
    if (aCriar) {
      onOpenChange(false);
      return;
    }
    if (temDados) {
      setAConfirmarDescarte(true);
      return;
    }
    limpar();
    onOpenChange(false);
  };

  const descartar = () => {
    limpar();
    onOpenChange(false);
  };

  const abrirFichaExistente = (pessoaId: string) => {
    limpar();
    onOpenChange(false);
    navigate(`/rh/pessoas/${pessoaId}`);
  };

  /** Um travao (NIF/NISS de outra ficha) bloqueia sempre. Um sinal so bloqueia
   * ate ser confirmado explicitamente -- a "coincidencia de sinal" da
   * especificacao. */
  const temDuplicadoTravao = duplicadosTravao.length > 0;
  const precisaConfirmarSinal = !temDuplicadoTravao && duplicadosSinal.length > 0 && !confirmouSinal;

  /** Porque Criar esta desactivado (so a ordem em que se resolve): o rodape di-lo. */
  const motivoCriarDesactivado = aCriar
    ? null
    : !temNomes
      ? t("hr.form.criarMotivo.nomes")
      : aEsperarConfiguracao
        ? t("hr.form.criarMotivo.configuracao")
        : temDuplicadoTravao
          ? t("hr.form.criarMotivo.duplicado")
          : precisaConfirmarSinal
            ? t("hr.form.criarMotivo.sinal")
            : null;

  /**
   * O atalho do resumo: muda de passo, pede o foco (o bloco recolhido que tem o
   * campo abre-se) e foca quando o campo ja existe no DOM. Um campo
   * desactivado ou que nao apareca nao fica com foco silencioso: o foco vai
   * para o painel do passo.
   */
  const irParaProblema = (problema: { seccao: SeccaoId; campoId: string }) => {
    setSeccao(problema.seccao);
    setFocoPedido((anterior) => ({ campoId: problema.campoId, n: (anterior?.n ?? 0) + 1 }));
    focarQuandoExistir(problema.campoId, () =>
      document.getElementById(`hr-novo-painel-${problema.seccao}`)?.focus(),
    );
  };

  const criar = async () => {
    if (problemas.length > 0 || problemasHorario.length > 0) {
      setMostrarResumo(true);
      return;
    }
    if (temDuplicadoTravao || precisaConfirmarSinal) return;
    setACriar(true);
    try {
      const payload = payloadDoRascunho(
        rascunho,
        linhasParaGravar,
        podeLigarConta,
        cargos.find((c) => c.id === rascunho.laborais.cargo_id)?.nome ?? null,
      );
      const { id, falhas } = await onCriar(payload);
      // Os anexos seguem depois de a ficha existir; nunca desfazem a ficha.
      const falhasAnexos = await anexosNovos.enviar(id);

      const pendenciaDeAcesso = falhas.find((falha) => falha.seccao === "acesso");
      const falhasReais = [...falhas.filter((falha) => falha.seccao !== "acesso"), ...falhasAnexos];

      if (falhasReais.length === 0) {
        toast.success(t("hr.sucesso.criada"));
      } else {
        // Nao ha falha silenciosa: diz-se quais as seccoes que nao ficaram
        // gravadas, e a ficha fica criada e editavel.
        toast.error(
          `${t("hr.form.criadaComFalhas")} ${falhasReais
            .map((falha) => t(`hr.form.seccoes.${falha.seccao}`))
            .join(", ")}`,
        );
      }
      if (pendenciaDeAcesso) {
        toast.warning(t("hr.acesso.convitePendente"));
      }

      // "Enviar convite": abre o envio do convite para a ficha que acabou de
      // nascer, com o e-mail pessoal escrito aqui. Sem e-mail (nao devia
      // acontecer: o formulario exige-o com convite) segue-se para a ficha.
      const emailDoConvite = payload.nucleo.email_pessoal;
      // Sem a permissao o interruptor nem se liga (`comConvite`). Quem escolheu
      // enviar e nao tem e-mail para onde o enviar nao fica a espera de um
      // convite que nunca sai: diz-se que o convite NAO foi aberto.
      const abreConvite = comConvite && emailDoConvite !== null;
      if (comConvite && !abreConvite) toast.warning(t("hr.form.conviteNaoAberto.semEmail"));

      limpar();
      onOpenChange(false);
      if (abreConvite && emailDoConvite) {
        setConviteDaNovaPessoa({ pessoaId: id, email: emailDoConvite });
      } else {
        onCriada?.(id);
      }
    } catch (e) {
      toast.error(await getFriendlyErrorMessage(e, t("hr.erros.guardar")));
    } finally {
      setACriar(false);
    }
  };

  const indice = SECCOES.indexOf(seccao);

  const iconeDoEstado = (id: SeccaoId) => {
    if (problemasDaSeccao(id) > 0 && (mostrarResumo || id !== "geral")) {
      return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
    }
    if (seccaoPreenchida(rascunho, id)) return <Check className="h-3.5 w-3.5 text-primary" />;
    if (id === seccao) return <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const estadoTextoDaSeccao = (id: SeccaoId) => {
    const avisos = problemasDaSeccao(id);
    if (avisos > 0) return t("hr.form.estado.comAvisos").replace("{n}", String(avisos));
    if (seccaoPreenchida(rascunho, id)) return t("hr.form.estado.preenchida");
    return t("hr.form.estado.vazia");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(proximo) => {
        if (!proximo) {
          tentarFechar();
          return;
        }
        onOpenChange(proximo);
      }}
    >
      <DialogContent className="max-h-[92vh] gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="space-y-1 border-b p-5">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{t("hr.pessoas.new")}</DialogTitle>
            {/* A entidade legal e SEMPRE esta. Aparece como texto para nao
                parecer omissao -- nao ha selector nenhum. */}
            {activeCompany && (
              <Badge variant="outline" className="font-normal">
                {t("hr.detalhes.entidadeLegal")}: {activeCompany.name}
              </Badge>
            )}
          </div>
          <DialogDescription>{t("hr.form.assistenteDescricao")}</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[70vh] grid-cols-1 sm:grid-cols-[15rem_1fr]">
          {/* A lista de passos e a navegacao. Cada entrada anuncia o seu estado
              em TEXTO: o ponto de aviso nao pode ser so cor. */}
          <PessoaFormPassos
            seccao={seccao}
            onSeleccionar={setSeccao}
            icone={iconeDoEstado}
            estadoTexto={estadoTextoDaSeccao}
          />

          <ScrollArea className="max-h-[70vh]">
            <CamposTocadosProvider onTocar={tocar} rotuloObrigatorio={t("hr.campos.obrigatorio")}>
              <div
                role="tabpanel"
                id={`hr-novo-painel-${seccao}`}
                aria-labelledby={`hr-novo-passo-${seccao}`}
                tabIndex={-1}
                className="space-y-4 p-5 outline-none"
              >
                <div aria-live="polite" className="sr-only">
                  {t("hr.form.a11yPasso")
                    .replace("{n}", String(indice + 1))
                    .replace("{total}", String(SECCOES.length))
                    .replace("{nome}", t(`hr.form.seccoes.${seccao}`))}
                </div>

                <PessoaFormAvisos
                  camposPendentes={camposPendentes}
                  mostrarPendentes={seccao === "acesso" || mostrarResumo}
                  mostrarResumo={mostrarResumo}
                  problemas={problemas}
                  problemasHorario={problemasHorario.length}
                  onIrParaProblema={irParaProblema}
                  duplicadosTravao={duplicadosTravao}
                  duplicadosSinal={duplicadosSinal}
                  temDuplicadoTravao={temDuplicadoTravao}
                  confirmouSinal={confirmouSinal}
                  onConfirmarSinal={setConfirmouSinal}
                  onAbrirFichaExistente={abrirFichaExistente}
                  duplicadosSemAcesso={duplicadosSemAcesso}
                  duplicadosDemasiadasTentativas={duplicadosDemasiadasTentativas}
                  configuracaoNaoCarregada={configuracaoNaoCarregada}
                  configuracaoSemAcesso={!comConvite && configuracaoSemAcesso}
                />

                {seccao === "geral" && (
                  <SeccaoInformacoesGerais
                    valor={rascunho.geral}
                    erroDe={erroDe}
                    contas={contas}
                    contasALoad={contasALoad}
                    podeLigarConta={podeLigarConta}
                    onEscolherConta={aoEscolherConta}
                    ajudaDoPalpite={ajudaDoPalpite}
                    ePalpite={ePalpite}
                    onPatch={(patch) =>
                      setRascunho((anterior) => ({
                        ...anterior,
                        geral: { ...anterior.geral, ...patch },
                      }))
                    }
                  />
                )}

                {seccao === "pessoais" && (
                  <SeccaoDetalhesPessoais
                    valor={rascunho.pessoais}
                    erroDe={erroDe}
                    obrigatorios={obrigatoriosDaPessoa}
                    podeEditarBancarios={podeEditarBancarios}
                    podeEditarFardamento={podeEditarFardamento}
                    podeEditarIdentificacao={podeEditarIdentificacao}
                    focoPedido={focoPedido}
                    onPatch={(patch) =>
                      setRascunho((anterior) => ({
                        ...anterior,
                        pessoais: { ...anterior.pessoais, ...patch },
                      }))
                    }
                  />
                )}

                {seccao === "laborais" && (
                  <SeccaoInformacoesLaborais
                    valor={rascunho.laborais}
                    erroDe={erroDe}
                    locais={locais}
                    locaisALoad={locaisALoad}
                    podeCriarLocal={podeCriarLocal}
                    onCriarLocal={criarLocal}
                    colegas={colegas}
                    cargos={cargosActivos}
                    cargosALoad={cargosALoad}
                    podeAbrirCargos={hasPermission("hr.pessoas.laborais.view")}
                    onPatch={(patch) =>
                      setRascunho((anterior) => ({
                        ...anterior,
                        laborais: { ...anterior.laborais, ...patch },
                      }))
                    }
                  />
                )}

                {seccao === "contrato" && (
                  <SeccaoContrato
                    valor={rascunho.contrato}
                    erroDe={erroDe}
                    dataAdmissao={rascunho.laborais.data_admissao}
                    locais={locais}
                    locaisALoad={locaisALoad}
                    salarioDoCargo={salarioDoCargo}
                    podeEditarRetribuicao={podeEditarRetribuicao}
                    onPatch={(patch) =>
                      setRascunho((anterior) => ({
                        ...anterior,
                        contrato: { ...anterior.contrato, ...patch },
                      }))
                    }
                  />
                )}

                {seccao === "acesso" && (
                  <SeccaoConfiguracoesGerais
                    valor={rascunho.acesso}
                    erroDe={erroDe}
                    papeis={papeis}
                    papeisALoad={papeisALoad}
                    podeVerPapeis={podeVerPapeis}
                    emailTrabalho={rascunho.geral.email_trabalho}
                    onAbrirPapeis={() => {
                      onOpenChange(false);
                      navigate("/roles");
                    }}
                    onPatch={(patch) =>
                      setRascunho((anterior) => ({
                        ...anterior,
                        acesso: { ...anterior.acesso, ...patch },
                      }))
                    }
                  />
                )}
              </div>
            </CamposTocadosProvider>
          </ScrollArea>
        </div>

        <AnexosNovaPessoa estado={anexosNovos} desactivado={aCriar} />

        <PessoaFormRodape
          enviarConvite={enviarConvite}
          onEnviarConvite={setEnviarConvite}
          podeEnviarConvite={podeEnviarConvite}
          motivoCriarDesactivado={motivoCriarDesactivado}
          aCriar={aCriar}
          primeiroPasso={indice === 0}
          ultimoPasso={indice === SECCOES.length - 1}
          criarDesactivado={aCriar || motivoCriarDesactivado !== null}
          onCancelar={tentarFechar}
          onAnterior={() => setSeccao(SECCOES[Math.max(0, indice - 1)])}
          onSeguinte={() => setSeccao(SECCOES[Math.min(SECCOES.length - 1, indice + 1)])}
          onCriar={criar}
        />
      </DialogContent>

      <PessoaFormDescartar
        open={aConfirmarDescarte}
        onOpenChange={setAConfirmarDescarte}
        onDescartar={descartar}
      />

      {/* O envio do convite da ficha acabada de criar. Fica fora do conteudo do
          assistente (que ja fechou e limpou o rascunho): e a sua propria raiz
          de dialogo, so montada aqui para nao precisar de um fragmento. Fechar
          (com ou sem envio) segue para a ficha, como se o assistente tivesse
          terminado agora. */}
      <EnviarConviteDialog
        open={conviteDaNovaPessoa !== null}
        onOpenChange={(aberto) => {
          if (aberto || conviteDaNovaPessoa === null) return;
          const { pessoaId } = conviteDaNovaPessoa;
          setConviteDaNovaPessoa(null);
          onCriada?.(pessoaId);
        }}
        pessoaId={conviteDaNovaPessoa?.pessoaId ?? ""}
        emailSugerido={conviteDaNovaPessoa?.email ?? null}
      />
    </Dialog>
  );
}
