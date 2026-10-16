// Tudo o que as abas da ficha de RH precisam de saber além da própria ficha: o que quem olha pode ver e fazer, os nomes
// (chefia, entidade legal, colegas), os catálogos (centros e cargos) e alguns valores derivados dos vínculos. É o que antes
// vivia no corpo da página da ficha; agora serve o painel lateral. Os hooks são os reais (dados da base).
//
// Os colegas vêm de fora (a lista que a página já carregou): chamar aqui `usePessoas()` repetia, a cada pessoa aberta e a
// cada «seguinte», as três consultas da organização inteira.
import { useMemo } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { useAdmissaoPendencias } from "@/hooks/useAdmissaoPendencias";
import { useCargos } from "@/hooks/useCargos";
import { useLocaisTrabalho } from "@/hooks/useLocaisTrabalho";
import { useMinhaPessoa } from "@/hooks/useMinhaPessoa";
import { usePermissions } from "@/hooks/usePermissions";
import { usePermissoesAssiduidade } from "@/hooks/usePermissoesAssiduidade";
import type { usePessoa } from "@/hooks/usePessoa";
import { useTranslation } from "@/hooks/useTranslation";
import { dataDeHojeISO } from "@/lib/hr/afectacoes";
import { derivarEstadoContrato } from "@/lib/hr/estadoContrato";
import { horasContratadasSemanaisReais } from "@/lib/hr/horas";
import type { PessoaPessoaisPermissoes } from "@/components/hr/PessoaPessoaisTab";
import type { Pessoa } from "@/types/hr";

type Ficha = ReturnType<typeof usePessoa>;
type HasPermission = ReturnType<typeof usePermissions>["hasPermission"];

/** O que a ficha precisa de saber de cada colega: quem é (o nome da chefia e o seletor de chefia). */
export interface ColegaDaFicha {
  id: string;
  nome_completo: string;
}

function permissoesPessoais(has: HasPermission): PessoaPessoaisPermissoes {
  return {
    pessoaisView: has("hr.pessoas.pessoais.view"), pessoaisEdit: has("hr.pessoas.pessoais.edit"),
    identificacaoView: has("hr.pessoas.identificacao.view"), identificacaoEdit: has("hr.pessoas.identificacao.edit"),
    identificacaoReveal: has("hr.pessoas.identificacao.reveal"), moradaView: has("hr.pessoas.morada.view"),
    moradaEdit: has("hr.pessoas.morada.edit"), emergenciaView: has("hr.pessoas.emergencia.view"),
    emergenciaEdit: has("hr.pessoas.emergencia.edit"), bancariosView: has("hr.pessoas.bancarios.view"),
    bancariosEdit: has("hr.pessoas.bancarios.edit"), saudeView: has("hr.pessoas.saude.view"),
    saudeEdit: has("hr.pessoas.saude.edit"), nucleoEdit: has("hr.pessoas.edit"),
    laboraisView: has("hr.pessoas.laborais.view"), laboraisEdit: has("hr.pessoas.laborais.edit"),
  };
}

function permissoesDeAusencias(has: HasPermission) {
  return {
    view: has("hr.ausencias.view"), pedir: has("hr.ausencias.pedir"), pedirOutros: has("hr.ausencias.pedir.outros"),
    aprovarChefia: has("hr.ausencias.aprovar.chefia"), aprovarRh: has("hr.ausencias.aprovar.rh"),
    direitosView: has("hr.ausencias.direitos.view"), ajustar: has("hr.ausencias.ajustar"),
    historicoEditar: has("hr.ausencias.historico.editar"), justificacaoView: has("hr.ausencias.justificacao.view"),
  };
}

function permissoesDeDocumentos(has: HasPermission) {
  return {
    view: has("hr.pessoas.documentos.view"), viewOwn: has("hr.pessoas.documentos.view.own"),
    edit: has("hr.pessoas.documentos.edit"), emitir: has("hr.pessoas.documentos.emitir"),
    anular: has("hr.pessoas.documentos.anular"), conteudoView: has("hr.pessoas.documentos.conteudo.view"),
    modelosView: has("hr.pessoas.documentos.modelos.view"),
  };
}

function permissoesDoTrabalho(has: HasPermission) {
  return {
    podeVerLaborais: has("hr.pessoas.laborais.view"), podeEditarLaborais: has("hr.pessoas.laborais.edit"),
    podeVerAfectacoes: has("hr.pessoas.afectacoes.view"), podeEditarAfectacoes: has("hr.pessoas.afectacoes.edit"),
    podeCorrigirAfectacoes: has("hr.pessoas.afectacoes.corrigir"), podeVerColocacao: has("hr.pessoas.colocacao.view"),
    podeEditarColocacao: has("hr.pessoas.colocacao.edit"), podeCorrigirColocacao: has("hr.pessoas.colocacao.corrigir"),
    podeVerVinculos: has("hr.pessoas.vinculos.view"), podeEditarVinculos: has("hr.pessoas.vinculos.edit"),
    podeCorrigirHorasVinculo: has("hr.pessoas.vinculos.horas.corrigir"), podeVerRetribuicao: has("hr.pessoas.retribuicao.view"),
    podeEditarRetribuicao: has("hr.pessoas.retribuicao.edit"), podeCorrigirRetribuicao: has("hr.pessoas.retribuicao.corrigir"),
    podeVerHorario: has("hr.pessoas.horario.view"), podeEditarHorario: has("hr.pessoas.horario.edit"),
    podeCorrigirHorario: has("hr.pessoas.horario.corrigir"), podeVerRealizado: has("hr.pessoas.horario_realizado.view"),
  };
}

export function useContextoFicha(ficha: Ficha, pessoa: Pessoa, colegas: readonly ColegaDaFicha[]) {
  const { t } = useTranslation();
  const { companies, activeCompany } = useCompany();
  const { hasPermission } = usePermissions();
  const { pessoaId: minhaPessoaId } = useMinhaPessoa();
  const { permissoes: permissoesAssiduidade } = usePermissoesAssiduidade();
  // `apenasAtivos: false`: a ficha mostra o local ACTUAL e o historico de horario/afectacoes, que podem apontar para um
  // centro entretanto desactivado -- desactivar nao apaga, e o nome tem de continuar legivel.
  const { locais, loading: locaisALoad } = useLocaisTrabalho({ apenasAtivos: false });
  const { cargos, periodos: periodosDosCargos, isLoading, periodosLoading, periodosError } = useCargos();
  const pendencias = useAdmissaoPendencias(pessoa.id);

  const trabalho = useMemo(() => permissoesDoTrabalho(hasPermission), [hasPermission]);
  const permissoes = useMemo(() => permissoesPessoais(hasPermission), [hasPermission]);
  const permissoesAusencias = useMemo(() => permissoesDeAusencias(hasPermission), [hasPermission]);
  const permissoesDocumentos = useMemo(() => permissoesDeDocumentos(hasPermission), [hasPermission]);
  // Quem pode ABRIR cada tipo de anexo da admissao (o servidor repete a decisao).
  const permissoesAnexos = useMemo(() => ({
    pessoasView: hasPermission("hr.pessoas.view"), viewOwn: hasPermission("hr.pessoas.view.own"),
    identificacaoReveal: hasPermission("hr.pessoas.identificacao.reveal"), bancariosEdit: hasPermission("hr.pessoas.bancarios.edit"),
  }), [hasPermission]);
  // Quem pode ANEXAR, SUBSTITUIR e REMOVER cada tipo (o servidor repete a decisao).
  const permissoesEscritaAnexos = useMemo(() => ({
    identificacaoEdit: hasPermission("hr.pessoas.identificacao.edit"), bancariosEdit: hasPermission("hr.pessoas.bancarios.edit"),
    pessoaisEdit: hasPermission("hr.pessoas.pessoais.edit"),
  }), [hasPermission]);

  // `null` quando quem olha nao pode ver vinculos -- nao se inventa "Sem contrato" para quem nao pode ler.
  const estadoContratoDerivado = trabalho.podeVerVinculos ? derivarEstadoContrato(ficha.vinculos) : null;
  const vinculoEmVigor = ficha.vinculos.find((v) => v.estado === "activo" || v.estado === "suspenso");
  const horasContratadasSemanais = trabalho.podeVerVinculos
    ? horasContratadasSemanaisReais(vinculoEmVigor?.horas_periodo ?? null, vinculoEmVigor?.horas_frequencia ?? "semanal", vinculoEmVigor?.dias_uteis ?? null)
    : null;

  /** O salario base que a pessoa tem HOJE (versao em vigor), para o aviso de "atribuir cargo" a uma ficha antiga. */
  const salarioActual = useMemo(() => {
    const r = ficha.retribuicao;
    if (!r) return null;
    const hoje = dataDeHojeISO();
    const emVigor = r.valido_de <= hoje && (r.valido_ate === null || r.valido_ate > hoje);
    return emVigor ? { salarioBase: r.valor_base, periodicidade: r.periodicidade } : null;
  }, [ficha.retribuicao]);

  const reportaANome = useMemo(
    () => (pessoa.reporta_a_pessoa_id ? colegas.find((c) => c.id === pessoa.reporta_a_pessoa_id)?.nome_completo ?? null : null),
    [pessoa.reporta_a_pessoa_id, colegas],
  );
  const nomePorPessoaId = useMemo(() => new Map(colegas.map((c) => [c.id, c.nome_completo])), [colegas]);
  const vinculosOpcoesDocumento = useMemo(
    () => ficha.vinculos.map((v) => ({ value: v.id, label: `${t(`hr.tipoContrato.${v.tipo_contrato}`)} · ${v.data_inicio}` })),
    [ficha.vinculos, t],
  );
  // A entidade legal e SEMPRE a da organizacao da ficha. A alternativa vive neste calculo, e nao em cada sitio que mostra o
  // valor: estava repetida num dos consumidores e esquecida no outro.
  const entidadeLegalNome = useMemo(() => {
    const nomeDe = (id: string | null | undefined) => (id ? companies.find((e) => e.id === id)?.name ?? null : null);
    return nomeDe(pessoa.entidade_legal_org_id) ?? nomeDe(pessoa.organization_id) ?? activeCompany?.name ?? null;
  }, [pessoa.entidade_legal_org_id, pessoa.organization_id, companies, activeCompany?.name]);

  return {
    hasPermission, trabalho, permissoes, permissoesAusencias, permissoesDocumentos, permissoesAnexos, permissoesEscritaAnexos,
    permissoesAssiduidade, colegas, minhaPessoaId, locais, locaisALoad, cargos, periodosDosCargos, periodosError,
    cargosPorChegar: isLoading || periodosLoading, pendencias, estadoContratoDerivado, vinculoActivoId: vinculoEmVigor?.id ?? null,
    horasContratadasSemanais, salarioActual, reportaANome, nomePorPessoaId, vinculosOpcoesDocumento, entidadeLegalNome,
    // A politica de SELECT de `pessoas_afectacoes` tambem deixa ver a propria ficha por `hr.pessoas.view.own`.
    podeVerAfectacoesEfectivo: trabalho.podeVerAfectacoes || minhaPessoaId === pessoa.id,
    podeVerAusenciasResumo: permissoesAusencias.view || minhaPessoaId === pessoa.id || permissoesAusencias.aprovarChefia,
  };
}

export type ContextoFicha = ReturnType<typeof useContextoFicha>;
