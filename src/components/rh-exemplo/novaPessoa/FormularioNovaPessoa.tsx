// O corpo do painel "Nova pessoa": seis abas sublinhadas (Dados pessoais, Contacto e morada, Contrato e local, Retribuição e
// bancário, Outros dados, Acesso e convite), o contador de erros por aba e o rodapé fixo. Os erros só aparecem depois de sair do
// campo ou de tentar criar; ao tentar com erros, abre-se a aba do primeiro e o foco vai para esse campo, e uma lista por cima das
// abas leva a cada aba com erros.
//
// Liga-se aos hooks reais (por wrappers): a configuração da admissão (a posição de cada campo: convite, ficha ou opcional), a
// verificação de duplicados, as contas de CRM que se podem ligar e as permissões de quem cria. Não grava nada: entrega ao
// `aoCriar` os dados já validados, com o payload real de `criarPessoa`.
//
// DUPLICADOS: a verificação corre ao sair de um campo que conta, MAS NÃO É SÓ DISSO que a criação depende. «Criar» espera por
// uma verificação em curso (e fica travado enquanto dura), e `tentar` verifica de novo, com os valores de agora, antes de
// entregar os dados: quem carrega em «Criar» sem ter saído do campo do NIF também é travado. Um resultado só vale para os
// valores para que foi pedido: depois de o NIF mudar, um travão antigo deixa de se mostrar.
//
// BOTÕES TRAVADOS (aria-disabled, ver `RodapeNova`): quem decide o que fazer a um clique ou a um Enter com o botão travado é
// `tentar`, que diz o motivo em `role="status"` em vez de não fazer nada.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CamposTocadosProvider } from "@/components/rh-exemplo/form/Campos";
import { useAdmissaoPosicoesCampos } from "@/components/rh-exemplo/hooks/useAdmissaoPosicoesCampos";
import type { ResultadoAnexosNovaPessoa } from "@/components/rh-exemplo/hooks/useAnexosNovaPessoa";
import { useCargos } from "@/components/rh-exemplo/hooks/useCargos";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useLocaisTrabalho } from "@/components/rh-exemplo/hooks/useLocaisTrabalho";
import { focarQuandoExistir } from "@/components/rh-exemplo/hooks/novaPessoaReal";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import {
  usePessoaDuplicados, type CandidatoDuplicado, type ValoresParaVerificar,
} from "@/components/rh-exemplo/hooks/usePessoaDuplicados";
import type { NovaPessoaExemplo } from "@/components/rh-exemplo/hooks/usePessoas";
import { dataDeHojeBase } from "@/components/rh-exemplo/lib/dataBase";
import { codigosIndisponiveis } from "@/components/rh-exemplo/lib/novaPessoaAdmissao";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { AbaAcesso } from "./AbaAcesso";
import { AbaContacto } from "./AbaContacto";
import { AbaContrato } from "./AbaContrato";
import { AbaDados } from "./AbaDados";
import { AbaOutros } from "./AbaOutros";
import { AbaRetribuicao } from "./AbaRetribuicao";
import { AbaComErros, ListaAbasNova, Tabs, TabsContent } from "./AbasNova";
import { AvisosNova } from "./AvisosNova";
import { useContaNova } from "./contaNova";
import { ProvedorNova } from "./contextoNova";
import { ErrosNova } from "./ErrosNova";
import { ABAS_NOVA, abaDoCampo, type AbaNova } from "./ids";
import { paraNovaPessoa } from "./paraStore";
import { RodapeNova } from "./RodapeNova";
import { comPatch, valoresIniciais, type AlterarNova, type ValoresNovaPessoa } from "./tiposNova";
import {
  idsObrigatorios, primeiroProblema, problemasDaNova, resumoDeProblemas, type ProblemaNova,
} from "./validacao";

/** O que o formulário entrega, já validado e sem nenhum travão de duplicado. */
export interface DadosParaCriar {
  dados: NovaPessoaExemplo;
  /** «Criar e enviar convite»: a pessoa preenche o resto e o envio do convite abre a seguir. */
  comConvite: boolean;
}

interface FormularioNovaPessoaProps {
  colegas: ReadonlyArray<{ id: string; nome_completo: string }>;
  anexos: ResultadoAnexosNovaPessoa;
  /** A ficha está a ser criada: nada se escolhe nem se retira, e os botões esperam. */
  aCriar: boolean;
  aoCriar: (dados: DadosParaCriar) => void;
  aoCancelar: () => void;
  /** Avisa que há alterações por gravar (um clique fora deixa de fechar o painel). */
  aoSujar: () => void;
  /** Um NIF ou NISS que já existe: abre a ficha dessa pessoa em vez de criar outra. */
  aoAbrirFichaExistente: (pessoaId: string) => void;
}

const ABAS_CONTEUDO: Record<AbaNova, () => JSX.Element> = {
  dados: AbaDados, contacto: AbaContacto, contrato: AbaContrato, retribuicao: AbaRetribuicao, outros: AbaOutros, acesso: AbaAcesso,
};

/** Os campos cuja alteração pode mudar o resultado da verificação de duplicados; os outros não entram nos critérios. */
const CAMPOS_DUPLICADOS: ReadonlySet<string> = new Set([
  "hr-novo-nif", "hr-novo-niss", "hr-novo-email-pessoal", "hr-novo-tipo-documento", "hr-novo-numero-documento",
  "hr-novo-primeiro-nome", "hr-novo-apelido", "hr-novo-data-nascimento",
]);

const MOTIVO_CONFIGURACAO = "hr.form.criarMotivo.configuracao";
const MOTIVO_A_VERIFICAR = "hr.form.criarMotivo.aVerificar";
const MOTIVO_DUPLICADO = "hr.form.criarMotivo.duplicado";
const MOTIVO_SINAL = "hr.form.criarMotivo.sinal";
const MOTIVO_SEM_PERMISSAO_CONVITE = "hr.form.conviteSemPermissao";

/** Só os problemas que já se mostram: o campo foi tocado, ou já se tentou criar. */
function visiveisDe(problemas: readonly ProblemaNova[], tentou: boolean, tocados: ReadonlySet<string>): ProblemaNova[] {
  return problemas.filter((p) => tentou || tocados.has(p.campoId));
}

/** O pedido de verificação de duplicados com os valores de agora. */
function pedidoDeDuplicados(organizationId: string, v: ValoresNovaPessoa): ValoresParaVerificar {
  return {
    organizationId,
    nif: v.pessoais.nif,
    niss: v.pessoais.niss,
    emailPessoal: v.pessoais.email_pessoal,
    tipoDocumento: v.pessoais.tipo_documento || null,
    numeroDocumento: v.pessoais.numero_documento,
    primeiroNome: v.geral.primeiro_nome,
    apelido: v.geral.apelido,
    dataNascimento: v.pessoais.data_nascimento || null,
    excluirPessoaId: null,
  };
}

export function FormularioNovaPessoa({ colegas, anexos, aCriar, aoCriar, aoCancelar, aoSujar, aoAbrirFichaExistente }: FormularioNovaPessoaProps) {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const organizacaoId = activeCompany.id;
  const { hasPermission } = usePermissions();
  const hoje = useMemo(() => dataDeHojeBase(), []);
  const { campos: config, carregando: configuracaoACarregar, semAcesso: configuracaoSemAcesso } = useAdmissaoPosicoesCampos(true);
  const duplicados = usePessoaDuplicados();
  const { cargos } = useCargos();
  const cargosActivos = useMemo(() => cargos.filter((c) => c.activo), [cargos]);
  const { locais } = useLocaisTrabalho();

  const [valores, setValores] = useState<ValoresNovaPessoa>(() => valoresIniciais(hoje));
  const [aba, setAba] = useState<AbaNova>("dados");
  const [tentou, setTentou] = useState(false);
  const [comConvite, setComConvite] = useState(false);
  const [tocados, setTocados] = useState<ReadonlySet<string>>(new Set());
  const [focoPedido, setFocoPedido] = useState<string | null>(null);
  /** Só se confirma quando há SÓ sinais; um travão nunca se confirma. */
  const [confirmouSinal, setConfirmouSinal] = useState(false);
  /** A chave do motivo de a última tentativa não ter criado nada: lê-se em `role="status"` até se mexer no formulário. */
  const [bloqueioAnunciado, setBloqueioAnunciado] = useState<string | null>(null);
  /** Uma tentativa está a verificar duplicados: um segundo envio (duplo clique, Enter repetido) não arranca outra. */
  const aSubmeter = useRef(false);
  const valoresAtuais = useRef(valores);
  valoresAtuais.current = valores;

  // O que quem cria pode escrever: o que não pode não se exige (fica como pendência da ficha) nem se oferece.
  const podeLigarConta = hasPermission("hr.pessoas.conta.link");
  const podeEnviarConvite = hasPermission("hr.pessoas.convite.enviar");
  const podeSaude = hasPermission("hr.pessoas.saude.edit");
  const podeSindicalizacao = hasPermission("hr.pessoas.sindicalizacao.edit");
  const podeVerPapeis = hasPermission("roles.view");
  const indisponiveis = useMemo(
    () => codigosIndisponiveis({ bancarios: hasPermission("hr.pessoas.bancarios.edit"), laborais: hasPermission("hr.pessoas.laborais.edit") }),
    [hasPermission],
  );

  const definir = useCallback((novos: ValoresNovaPessoa) => {
    aoSujar();
    setBloqueioAnunciado(null);
    setValores(novos);
  }, [aoSujar]);
  const alterar = useCallback<AlterarNova>((grupo, patch) => {
    aoSujar();
    setBloqueioAnunciado(null);
    setValores((atual) => comPatch(atual, grupo, patch));
  }, [aoSujar]);

  const conta = useContaNova({ valores, definir, tocados, locais, cargosActivos, podeLigar: podeLigarConta });

  const opcoes = useMemo(
    () => ({ comConvite, config, hoje, indisponiveis, papelDisponivel: podeVerPapeis }),
    [comConvite, config, hoje, indisponiveis, podeVerPapeis],
  );
  const problemas = useMemo(() => problemasDaNova(valores, opcoes), [valores, opcoes]);
  const visiveis = useMemo(() => visiveisDe(problemas, tentou, tocados), [problemas, tentou, tocados]);
  const resumo = useMemo(() => resumoDeProblemas(visiveis), [visiveis]);
  const obrigatorios = useMemo(() => idsObrigatorios(valores, opcoes), [valores, opcoes]);

  // Um resultado de duplicados só vale para os valores para que foi pedido: a assinatura do último pedido que chegou tem de ser
  // a de agora, senão (o NIF mudou desde então) o que o hook ainda guarda é de outra pessoa e não se mostra nem trava.
  const assinatura = useMemo(
    () => (organizacaoId ? JSON.stringify(pedidoDeDuplicados(organizacaoId, valores)) : ""),
    [organizacaoId, valores],
  );
  const [assinaturaVerificada, setAssinaturaVerificada] = useState(assinatura);
  const resultadoObsoleto = assinaturaVerificada !== assinatura;
  const travoes = useMemo(() => (resultadoObsoleto ? [] : duplicados.travoes), [resultadoObsoleto, duplicados.travoes]);
  const sinais = useMemo(() => (resultadoObsoleto ? [] : duplicados.sinais), [resultadoObsoleto, duplicados.sinais]);

  // Um travão (NIF/NISS de outra ficha) bloqueia sempre; um sinal só até ser confirmado.
  const temTravao = travoes.length > 0;
  const precisaConfirmarSinal = !temTravao && sinais.length > 0 && !confirmouSinal;
  const motivoDuplicado = temTravao ? MOTIVO_DUPLICADO : precisaConfirmarSinal ? MOTIVO_SINAL : null;
  // O RH a preencher precisa da configuração (os obrigatórios dependem dela): enquanto carrega, espera. E «Criar» espera por uma
  // verificação de duplicados em curso (o convite não: `tentar` espera por ela de qualquer maneira).
  const motivoCriar = motivoDuplicado ?? (configuracaoACarregar ? MOTIVO_CONFIGURACAO : duplicados.aVerificar ? MOTIVO_A_VERIFICAR : null);
  // Sem convite e sem saber a configuração, `campos = null` NÃO é «sem configuração»: os campos que a organização pôs no
  // convite deixariam de se exigir sem ninguém o dizer.
  const configuracaoNaoCarregada = config === null && !configuracaoACarregar && !configuracaoSemAcesso;

  useEffect(() => {
    if (focoPedido === null) return;
    // O campo pode estar numa aba que acabou de abrir: espera, quadro a quadro, até existir.
    focarQuandoExistir(focoPedido);
    setFocoPedido(null);
  }, [focoPedido]);
  useEffect(() => () => duplicados.limpar(), []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Verifica com os valores dados; só marca o resultado como de agora quando chegou mesmo (não foi ultrapassado nem falhou). */
  const verificarAgora = useCallback(async (v: ValoresNovaPessoa) => {
    if (!organizacaoId) return null;
    const pedido = pedidoDeDuplicados(organizacaoId, v);
    const lidos = (await duplicados.verificar(pedido)) ?? null;
    if (lidos !== null) setAssinaturaVerificada(JSON.stringify(pedido));
    return lidos;
  }, [organizacaoId, duplicados.verificar]); // eslint-disable-line react-hooks/exhaustive-deps

  const tocar = useCallback((campoId: string) => {
    setTocados((atual) => (atual.has(campoId) ? atual : new Set(atual).add(campoId)));
    if (!CAMPOS_DUPLICADOS.has(campoId) || !organizacaoId) return;
    setConfirmouSinal(false);
    void verificarAgora(valores);
  }, [organizacaoId, verificarAgora, valores]);

  const erro = useCallback((campoId: string): string | null => {
    const p = visiveis.find((x) => x.campoId === campoId);
    return p ? t(p.mensagemKey) : null;
  }, [visiveis, t]);
  const obrigatorio = useCallback((campoId: string) => obrigatorios.has(campoId), [obrigatorios]);

  /** O que trava esta tentativa já, sem ir à rede, ou `null`. */
  const motivoQueTrava = (convite: boolean): string | null => {
    if (convite) return podeEnviarConvite ? motivoDuplicado : MOTIVO_SEM_PERMISSAO_CONVITE;
    return motivoCriar;
  };

  /** Os travões e os sinais que travam a criação agora, a partir de uma verificação que acabou de chegar (ou do que já se sabe). */
  const motivoDeDuplicado = (lidos: CandidatoDuplicado[] | null): string | null => {
    const ativos = lidos ?? [...travoes, ...sinais];
    if (ativos.some((c) => c.forca === "travao")) return MOTIVO_DUPLICADO;
    return ativos.some((c) => c.forca === "sinal") && !confirmouSinal ? MOTIVO_SINAL : null;
  };

  const entregar = (convite: boolean) => {
    try {
      const cargoNome = cargos.find((c) => c.id === valores.laborais.cargo_id)?.nome ?? null;
      aoCriar({
        dados: paraNovaPessoa(valores, { config, comConvite: convite, cargoNome, podeLigarConta, podeSaude, podeSindicalizacao }),
        comConvite: convite,
      });
    } catch (e) {
      // Um cargo escolhido sem nome (catálogo ainda por carregar) recusa-se aqui: nada vai à base.
      toast.error(e instanceof Error ? e.message : t("hr.erros.guardar"));
    }
  };

  const tentar = async (convite: boolean) => {
    if (aSubmeter.current || aCriar) return;
    setBloqueioAnunciado(null);
    setComConvite(convite);
    setTentou(true);
    const primeiro = primeiroProblema(problemasDaNova(valores, { ...opcoes, comConvite: convite }));
    if (primeiro !== null) {
      setAba(abaDoCampo(primeiro.campoId));
      setFocoPedido(primeiro.campoId);
      return;
    }
    const travado = motivoQueTrava(convite);
    if (travado !== null) {
      setBloqueioAnunciado(travado);
      return;
    }
    aSubmeter.current = true;
    try {
      // Os valores de agora, não os do último campo de que se saiu: um NIF repetido pode não ter passado pelo `onBlur`.
      const lidos = await verificarAgora(valores);
      // Mexeu-se no formulário durante a verificação: o que foi verificado já não é o que se ia criar. Carrega-se de novo.
      if (valoresAtuais.current !== valores) return;
      const duplicado = motivoDeDuplicado(lidos);
      if (duplicado !== null) {
        setBloqueioAnunciado(duplicado);
        return;
      }
      entregar(convite);
    } finally {
      aSubmeter.current = false;
    }
  };

  const submeter = (e: FormEvent) => {
    e.preventDefault();
    void tentar(false);
  };

  const irParaAba = (destino: AbaNova) => {
    const primeiro = visiveis.find((p) => abaDoCampo(p.campoId) === destino);
    setAba(destino);
    if (primeiro) setFocoPedido(primeiro.campoId);
  };

  const valorDoContexto = useMemo(
    () => ({ valores, alterar, erro, obrigatorio, config, colegas, conta, anexos, aCriar, podeSaude, podeSindicalizacao }),
    [valores, alterar, erro, obrigatorio, config, colegas, conta, anexos, aCriar, podeSaude, podeSindicalizacao],
  );

  return (
    <CamposTocadosProvider rotuloObrigatorio={t("hr.campos.obrigatorio")} onTocar={tocar}>
      <ProvedorNova valor={valorDoContexto}>
        <form noValidate onSubmit={submeter} className="flex min-h-0 flex-1 flex-col">
          <Tabs value={aba} onValueChange={(v) => setAba(v as AbaNova)} className="flex min-h-0 flex-1 flex-col">
            <ListaAbasNova aria-label={t("rhForm.nova.tabs.label")} className="shrink-0">
              {ABAS_NOVA.map((id) => (
                <AbaComErros key={id} value={id} rotulo={t(`rhNova.tabs.${id}`)} erros={resumo.porAba[id]} />
              ))}
            </ListaAbasNova>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {tentou && <ErrosNova porAba={resumo.porAba} aoIrParaAba={irParaAba} />}
              <AvisosNova
                configuracaoNaoCarregada={configuracaoNaoCarregada} configuracaoSemAcesso={configuracaoSemAcesso}
                duplicadosTravao={travoes} duplicadosSinal={sinais}
                confirmouSinal={confirmouSinal} aoConfirmarSinal={setConfirmouSinal} aoAbrirFichaExistente={aoAbrirFichaExistente}
                duplicadosSemAcesso={duplicados.semAcesso} duplicadosDemasiadasTentativas={duplicados.demasiadasTentativas}
              />
              {ABAS_NOVA.map((id) => {
                const Conteudo = ABAS_CONTEUDO[id];
                return <TabsContent key={id} value={id} className="mt-0"><Conteudo /></TabsContent>;
              })}
            </div>
          </Tabs>
          <RodapeNova
            erros={resumo.total} aCriar={aCriar} motivoCriar={motivoCriar} conviteTravado={motivoDuplicado !== null}
            semPermissaoConvite={!podeEnviarConvite} anuncio={bloqueioAnunciado === null ? null : t(bloqueioAnunciado)}
            aoCancelar={aoCancelar} aoCriarEConvidar={() => void tentar(true)}
          />
        </form>
      </ProvedorNova>
    </CamposTocadosProvider>
  );
}
