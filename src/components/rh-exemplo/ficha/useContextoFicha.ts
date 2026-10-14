// Tudo o que as abas da ficha de RH precisam de saber além da própria ficha: o que quem olha pode ver e fazer, os nomes
// (chefia, entidade legal, colegas), os catálogos (centros e cargos) e alguns valores derivados dos vínculos. É o que antes
// vivia no corpo da página da ficha; agora serve o painel lateral. Só memória, sem acesso a dados.
import { useMemo } from "react";
import { useAdmissaoPendencias } from "@/components/rh-exemplo/hooks/useAdmissaoPendencias";
import { useCargos } from "@/components/rh-exemplo/hooks/useCargos";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useLocaisTrabalho } from "@/components/rh-exemplo/hooks/useLocaisTrabalho";
import { useMinhaPessoa } from "@/components/rh-exemplo/hooks/useMinhaPessoa";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import type { usePessoa } from "@/components/rh-exemplo/hooks/usePessoa";
import { usePessoas } from "@/components/rh-exemplo/hooks/usePessoas";
import { dataDeHojeISO } from "@/components/rh-exemplo/lib/afectacoes";
import { derivarEstadoContrato } from "@/components/rh-exemplo/lib/estadoContrato";
import { horasContratadasSemanaisReais } from "@/components/rh-exemplo/lib/horas";
import type { PessoaPessoaisPermissoes } from "@/components/rh-exemplo/PessoaPessoaisTab";
import type { Pessoa } from "@/components/rh-exemplo/tipos";
import { useTranslation } from "@/hooks/useTranslation";

type Ficha = ReturnType<typeof usePessoa>;
type HasPermission = ReturnType<typeof usePermissions>["hasPermission"];

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

export function useContextoFicha(ficha: Ficha, pessoa: Pessoa) {
  const { t } = useTranslation();
  const { companies, activeCompany } = useCompany();
  const { hasPermission } = usePermissions();
  const { pessoas: colegas } = usePessoas();
  const { pessoaId: minhaPessoaId } = useMinhaPessoa();
  const { locais, loading: locaisALoad } = useLocaisTrabalho({ apenasAtivos: false });
  const { cargos, periodos: periodosDosCargos, isLoading, periodosLoading, periodosError } = useCargos();
  const pendencias = useAdmissaoPendencias(pessoa.id);

  const trabalho = useMemo(() => permissoesDoTrabalho(hasPermission), [hasPermission]);
  const permissoes = useMemo(() => permissoesPessoais(hasPermission), [hasPermission]);
  const permissoesAusencias = useMemo(() => permissoesDeAusencias(hasPermission), [hasPermission]);
  const permissoesDocumentos = useMemo(() => permissoesDeDocumentos(hasPermission), [hasPermission]);
  const permissoesAnexos = useMemo(() => ({
    pessoasView: hasPermission("hr.pessoas.view"), viewOwn: hasPermission("hr.pessoas.view.own"),
    identificacaoReveal: hasPermission("hr.pessoas.identificacao.reveal"), bancariosEdit: hasPermission("hr.pessoas.bancarios.edit"),
  }), [hasPermission]);
  const permissoesEscritaAnexos = useMemo(() => ({
    identificacaoEdit: hasPermission("hr.pessoas.identificacao.edit"), bancariosEdit: hasPermission("hr.pessoas.bancarios.edit"),
    pessoaisEdit: hasPermission("hr.pessoas.pessoais.edit"),
  }), [hasPermission]);

  const estadoContratoDerivado = trabalho.podeVerVinculos ? derivarEstadoContrato(ficha.vinculos) : null;
  const vinculoEmVigor = ficha.vinculos.find((v) => v.estado === "activo" || v.estado === "suspenso");
  const horasContratadasSemanais = trabalho.podeVerVinculos
    ? horasContratadasSemanaisReais(vinculoEmVigor?.horas_periodo ?? null, vinculoEmVigor?.horas_frequencia ?? "semanal", vinculoEmVigor?.dias_uteis ?? null)
    : null;

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
  const entidadeLegalNome = useMemo(() => {
    const nomeDe = (id: string | null | undefined) => (id ? companies.find((e) => e.id === id)?.name ?? null : null);
    return nomeDe(pessoa.entidade_legal_org_id) ?? nomeDe(pessoa.organization_id) ?? activeCompany?.name ?? null;
  }, [pessoa.entidade_legal_org_id, pessoa.organization_id, companies, activeCompany?.name]);

  return {
    hasPermission, trabalho, permissoes, permissoesAusencias, permissoesDocumentos, permissoesAnexos, permissoesEscritaAnexos,
    colegas, minhaPessoaId, locais, locaisALoad, cargos, periodosDosCargos, periodosError,
    cargosPorChegar: isLoading || periodosLoading, pendencias, estadoContratoDerivado, vinculoActivoId: vinculoEmVigor?.id ?? null,
    horasContratadasSemanais, salarioActual, reportaANome, nomePorPessoaId, vinculosOpcoesDocumento, entidadeLegalNome,
    podeVerAfectacoesEfectivo: trabalho.podeVerAfectacoes || minhaPessoaId === pessoa.id,
    podeVerAusenciasResumo: permissoesAusencias.view || minhaPessoaId === pessoa.id || permissoesAusencias.aprovarChefia,
  };
}

export type ContextoFicha = ReturnType<typeof useContextoFicha>;
