/**
 * A ficha da pessoa. Doze separadores, tres com conteudo.
 *
 * Esta pagina SO orquestra: resolve permissoes, resolve nomes (chefia,
 * entidade legal) e distribui a ficha pelos separadores. Cada separador e um
 * componente proprio em `src/components/hr/` -- que e o que impede este
 * ficheiro de crescer para as mil linhas quando os nove separadores em
 * construcao forem construidos.
 *
 * Visao geral, Detalhes laborais, Detalhes pessoais, Contratos e Planeamento
 * de tempo tem conteudo real. Os outros ficam visiveis com o mesmo estado
 * vazio: a moldura ja mostra o caminho do produto sem prometer nada que nao
 * exista.
 *
 * O separador vai no URL (`?tab=`) para o link ser partilhavel.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Award,
  BookOpen,
  Briefcase,
  CalendarClock,
  CalendarRange,
  FileText,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  MoreHorizontal,
  Send,
  TrendingUp,
  User,
} from "lucide-react";
import { EnviarConviteDialog } from "@/components/hr/EnviarConviteDialog";
import { PermissionGate } from "@/components/PermissionGate";
import { PessoaContratoTab } from "@/components/hr/PessoaContratoTab";
import { PessoaDocumentosTab } from "@/components/hr/PessoaDocumentosTab";
import { PessoaEmConstrucaoTab } from "@/components/hr/PessoaEmConstrucaoTab";
import { PessoaAusenciasTab } from "@/components/hr/PessoaAusenciasTab";
import { PessoaHorarioTab } from "@/components/hr/PessoaHorarioTab";
import { PessoaLaboraisTab } from "@/components/hr/PessoaLaboraisTab";
import {
  PessoaPessoaisTab,
  type PessoaPessoaisPermissoes,
} from "@/components/hr/PessoaPessoaisTab";
import { PessoaVisaoGeralTab } from "@/components/hr/PessoaVisaoGeralTab";
import { derivarEstadoContrato } from "@/lib/hr/estadoContrato";
import { useCompany } from "@/contexts/CompanyContext";
import { useLocaisTrabalho } from "@/hooks/useLocaisTrabalho";
import { usePermissions } from "@/hooks/usePermissions";
import { useMinhaPessoa } from "@/hooks/useMinhaPessoa";
import { usePermissoesAssiduidade } from "@/hooks/usePermissoesAssiduidade";
import { usePessoa } from "@/hooks/usePessoa";
import { usePessoas } from "@/hooks/usePessoas";
import { useTranslation } from "@/hooks/useTranslation";

/** Os separadores que ficam visiveis mas vazios nesta ronda. */
const TABS_EM_CONSTRUCAO = [
  { value: "desempenho", labelKey: "hr.pessoa.tabs.desempenho", icon: TrendingUp },
  { value: "tarefas", labelKey: "hr.pessoa.tabs.tarefas", icon: ListChecks },
  { value: "competencias", labelKey: "hr.pessoa.tabs.competencias", icon: Award },
  { value: "cursos", labelKey: "hr.pessoa.tabs.cursos", icon: BookOpen },
  { value: "outros", labelKey: "hr.pessoa.tabs.outros", icon: MoreHorizontal },
] as const;

export default function PessoaDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "visaoGeral";
  const [conviteDialogoAberto, setConviteDialogoAberto] = useState(false);

  const { companies, activeCompany } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  const ficha = usePessoa(id);
  // A lista da organizacao serve duas coisas: resolver o nome de quem a pessoa
  // reporta, e alimentar o selector de chefia nos detalhes laborais.
  const { pessoas: colegas } = usePessoas();

  const permissoes: PessoaPessoaisPermissoes = useMemo(
    () => ({
      pessoaisView: hasPermission("hr.pessoas.pessoais.view"),
      pessoaisEdit: hasPermission("hr.pessoas.pessoais.edit"),
      identificacaoView: hasPermission("hr.pessoas.identificacao.view"),
      identificacaoEdit: hasPermission("hr.pessoas.identificacao.edit"),
      identificacaoReveal: hasPermission("hr.pessoas.identificacao.reveal"),
      moradaView: hasPermission("hr.pessoas.morada.view"),
      moradaEdit: hasPermission("hr.pessoas.morada.edit"),
      emergenciaView: hasPermission("hr.pessoas.emergencia.view"),
      emergenciaEdit: hasPermission("hr.pessoas.emergencia.edit"),
      bancariosView: hasPermission("hr.pessoas.bancarios.view"),
      bancariosEdit: hasPermission("hr.pessoas.bancarios.edit"),
      saudeView: hasPermission("hr.pessoas.saude.view"),
      saudeEdit: hasPermission("hr.pessoas.saude.edit"),
      nucleoEdit: hasPermission("hr.pessoas.edit"),
      laboraisView: hasPermission("hr.pessoas.laborais.view"),
      laboraisEdit: hasPermission("hr.pessoas.laborais.edit"),
      sindicalizacaoView: hasPermission("hr.pessoas.sindicalizacao.view"),
      sindicalizacaoEdit: hasPermission("hr.pessoas.sindicalizacao.edit"),
    }),
    [hasPermission],
  );

  const podeVerLaborais = hasPermission("hr.pessoas.laborais.view");
  const podeEditarLaborais = hasPermission("hr.pessoas.laborais.edit");
  const podeVerVinculos = hasPermission("hr.pessoas.vinculos.view");
  const podeEditarVinculos = hasPermission("hr.pessoas.vinculos.edit");
  const podeVerRetribuicao = hasPermission("hr.pessoas.retribuicao.view");
  const podeVerHorario = hasPermission("hr.pessoas.horario.view");
  const podeEditarHorario = hasPermission("hr.pessoas.horario.edit");
  const podeVerRealizado = hasPermission("hr.pessoas.horario_realizado.view");

  // Ausencias: oito permissoes distintas. `pedir` e para si, `pedir.outros` e
  // na ficha de outra pessoa, e sao mesmo duas -- a base verifica-as em ramos
  // diferentes da mesma RPC.
  const permissoesAusencias = useMemo(
    () => ({
      view: hasPermission("hr.ausencias.view"),
      pedir: hasPermission("hr.ausencias.pedir"),
      pedirOutros: hasPermission("hr.ausencias.pedir.outros"),
      aprovarChefia: hasPermission("hr.ausencias.aprovar.chefia"),
      aprovarRh: hasPermission("hr.ausencias.aprovar.rh"),
      direitosView: hasPermission("hr.ausencias.direitos.view"),
      ajustar: hasPermission("hr.ausencias.ajustar"),
      historicoEditar: hasPermission("hr.ausencias.historico.editar"),
      justificacaoView: hasPermission("hr.ausencias.justificacao.view"),
    }),
    [hasPermission],
  );

  // Assiduidade: catorze codigos resolvidos num hook proprio, para nao os
  // reescrever em cada um dos quatro ecras do modulo.
  const { permissoes: permissoesAssiduidade } = usePermissoesAssiduidade();

  const permissoesDocumentos = useMemo(
    () => ({
      view: hasPermission("hr.pessoas.documentos.view"),
      viewOwn: hasPermission("hr.pessoas.documentos.view.own"),
      edit: hasPermission("hr.pessoas.documentos.edit"),
      emitir: hasPermission("hr.pessoas.documentos.emitir"),
      anular: hasPermission("hr.pessoas.documentos.anular"),
      conteudoView: hasPermission("hr.pessoas.documentos.conteudo.view"),
      modelosView: hasPermission("hr.pessoas.documentos.modelos.view"),
    }),
    [hasPermission],
  );

  const { locais, loading: locaisALoad } = useLocaisTrabalho();
  // Para saber se quem abre a ficha e a propria pessoa: muda o que pode pedir.
  const { pessoaId: minhaPessoaId } = useMinhaPessoa();

  const pessoa = ficha.pessoa;

  // `null` quando quem olha nao pode ver vinculos -- nao se inventa "Sem
  // contrato" para quem simplesmente nao tem a permissao de o ler.
  const estadoContratoDerivado = podeVerVinculos
    ? derivarEstadoContrato(ficha.vinculos)
    : null;

  // O mesmo criterio de `PessoaAusenciasTab.podeVer`, para o cartao da Visao
  // geral so mostrar o numero de pendentes a quem o separador tambem mostra.
  const podeVerAusenciasResumo =
    permissoesAusencias.view ||
    minhaPessoaId === pessoa?.id ||
    permissoesAusencias.aprovarChefia;

  const reportaANome = useMemo(() => {
    if (!pessoa?.reporta_a_pessoa_id) return null;
    return colegas.find((c) => c.id === pessoa.reporta_a_pessoa_id)?.nome_completo ?? null;
  }, [pessoa?.reporta_a_pessoa_id, colegas]);

  const nomePorPessoaId = useMemo(
    () => new Map(colegas.map((colega) => [colega.id, colega.nome_completo])),
    [colegas],
  );

  // A entidade legal e SEMPRE a da organizacao da ficha -- nao se escolhe, e
  // por isso o formulario nem sequer envia `entidade_legal_org_id`: fica nulo
  // em todas as fichas criadas por aqui.
  //
  // A alternativa TEM de viver neste calculo, e nao em cada sitio que mostra o
  // valor. Estava repetida num dos dois consumidores e esquecida no outro, e o
  // resultado era o painel de detalhes a dizer "Nao preenchido" ao lado de um
  // separador que mostrava o nome da organizacao.
  const entidadeLegalNome = useMemo(() => {
    const nomeDe = (id: string | null | undefined) =>
      id ? (companies.find((e) => e.id === id)?.name ?? null) : null;
    return (
      nomeDe(pessoa?.entidade_legal_org_id) ??
      nomeDe(pessoa?.organization_id) ??
      activeCompany?.name ??
      null
    );
  }, [pessoa?.entidade_legal_org_id, pessoa?.organization_id, companies, activeCompany?.name]);

  const mudarTab = (valor: string) =>
    setSearchParams(
      (anterior) => {
        const proximos = new URLSearchParams(anterior);
        proximos.set("tab", valor);
        return proximos;
      },
      { replace: true },
    );

  if (ficha.loading || permissionsLoading) {
    return <OlyviaLoader />;
  }

  if (ficha.notFound || !pessoa) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
        <p className="text-lg font-medium">{t("hr.pessoa.notFound")}</p>
        {ficha.error && <p className="text-sm text-muted-foreground">{ficha.error}</p>}
        <Button variant="outline" onClick={() => navigate("/rh/pessoas")}>
          {t("common.back")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabecalho */}
      <div className="flex flex-wrap items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/rh/pessoas")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{pessoa.nome_completo}</h1>
            {estadoContratoDerivado && (
              <Badge
                variant={estadoContratoDerivado === "em_curso" ? "secondary" : "outline"}
                className="font-normal"
              >
                {t(`hr.estadoContrato.${estadoContratoDerivado}`)}
              </Badge>
            )}
            <Badge variant={ficha.conta ? "default" : "outline"} className="font-normal">
              {t(ficha.conta ? "hr.estadoAcesso.ativo" : "hr.estadoAcesso.semConta")}
            </Badge>
            {pessoa.estado_registo === "arquivado" && (
              <Badge variant="outline" className="font-normal">
                {t("hr.estadoRegisto.arquivado")}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-muted-foreground">
            {[pessoa.cargo, pessoa.local_trabalho].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        {/* So faz sentido convidar quem ainda nao tem conta ligada -- ver
            `hr.estadoAcesso`. */}
        {!ficha.conta && (
          <PermissionGate permission="hr.pessoas.convite.enviar">
            <Button variant="outline" className="gap-2" onClick={() => setConviteDialogoAberto(true)}>
              <Send className="h-4 w-4" />
              {t("hr.convite.enviar")}
            </Button>
          </PermissionGate>
        )}
      </div>

      <EnviarConviteDialog
        open={conviteDialogoAberto}
        onOpenChange={setConviteDialogoAberto}
        pessoaId={pessoa.id}
        emailSugerido={pessoa.email_pessoal}
      />

      <Tabs value={activeTab} onValueChange={mudarTab} className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="visaoGeral" className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              {t("hr.pessoa.tabs.visaoGeral")}
            </TabsTrigger>
            <TabsTrigger value="laborais" className="gap-2">
              <Briefcase className="h-4 w-4" />
              {t("hr.pessoa.tabs.laborais")}
            </TabsTrigger>
            <TabsTrigger value="pessoais" className="gap-2">
              <User className="h-4 w-4" />
              {t("hr.pessoa.tabs.pessoais")}
            </TabsTrigger>
            <TabsTrigger value="contratos" className="gap-2">
              <FileText className="h-4 w-4" />
              {t("hr.pessoa.tabs.contratos")}
            </TabsTrigger>
            <TabsTrigger value="planeamento" className="gap-2">
              <CalendarRange className="h-4 w-4" />
              {t("hr.pessoa.tabs.planeamento")}
            </TabsTrigger>
            <TabsTrigger value="documentos" className="gap-2">
              <FolderOpen className="h-4 w-4" />
              {t("hr.pessoa.tabs.documentos")}
            </TabsTrigger>
            <TabsTrigger value="ausencias" className="gap-2">
              <CalendarClock className="h-4 w-4" />
              {t("hr.pessoa.tabs.ausencias")}
            </TabsTrigger>
            {TABS_EM_CONSTRUCAO.map(({ value, labelKey, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-2">
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="visaoGeral">
          <PessoaVisaoGeralTab
            pessoa={pessoa}
            reportaANome={reportaANome}
            entidadeLegalNome={entidadeLegalNome}
            vinculos={ficha.vinculos}
            horarioRealizado={ficha.horarioRealizado}
            retribuicao={ficha.retribuicao}
            podeVerRealizado={podeVerRealizado}
            podeVerAusencias={podeVerAusenciasResumo}
            podeVerRetribuicao={podeVerRetribuicao}
            onAbrirSeparador={mudarTab}
          />
        </TabsContent>

        <TabsContent value="laborais">
          {podeVerLaborais ? (
            <PessoaLaboraisTab
              pessoa={pessoa}
              colegas={colegas.map((c) => ({ id: c.id, nome_completo: c.nome_completo }))}
              locais={locais}
              locaisALoad={locaisALoad}
              entidadeLegalNome={entidadeLegalNome}
              estadoContratoDerivado={estadoContratoDerivado}
              podeEditar={podeEditarLaborais}
              saving={ficha.saving}
              onGuardar={ficha.savePessoa}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {t("hr.semAcesso")}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pessoais">
          <PessoaPessoaisTab
            dadosPessoais={ficha.dadosPessoais}
            identificacao={ficha.identificacao}
            morada={ficha.morada}
            emergencia={ficha.emergencia}
            bancarios={ficha.bancarios}
            saude={ficha.saude}
            fardamento={ficha.fardamento}
            sindicalizacao={ficha.sindicalizacao}
            emailPessoal={pessoa.email_pessoal}
            permissoes={permissoes}
            saving={ficha.saving}
            onGuardarDadosPessoais={ficha.saveDadosPessoais}
            onGuardarPessoa={ficha.savePessoa}
            onGuardarIdentificacao={ficha.saveIdentificacao}
            onGuardarMorada={ficha.saveMorada}
            onGuardarEmergencia={ficha.saveEmergencia}
            onGuardarSaude={ficha.saveSaude}
            onGuardarFardamento={ficha.saveFardamento}
            onGuardarSindicalizacao={ficha.saveSindicalizacao}
            onRevelarNiss={ficha.revelarNiss}
            onDefinirNiss={ficha.definirNiss}
            onDefinirConta={ficha.definirConta}
          />
        </TabsContent>

        <TabsContent value="contratos">
          {podeVerVinculos ? (
            <PessoaContratoTab
              vinculos={ficha.vinculos}
              retribuicao={ficha.retribuicao}
              podeEditar={podeEditarVinculos}
              podeVerRetribuicao={podeVerRetribuicao}
              saving={ficha.saving}
              onGuardarVinculo={ficha.saveVinculo}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {t("hr.semAcesso")}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="planeamento">
          <PessoaHorarioTab
            planeado={ficha.horarioPlaneado}
            realizado={ficha.horarioRealizado}
            locais={locais}
            locaisALoad={locaisALoad}
            podeVerPlaneado={podeVerHorario}
            podeEditarPlaneado={podeEditarHorario}
            podeVerRealizado={podeVerRealizado}
            saving={ficha.saving}
            onGuardarPlaneado={ficha.savePlaneado}
            pessoaId={pessoa.id}
            pessoaNome={pessoa.nome_completo}
            souAPessoa={minhaPessoaId === pessoa.id}
            permissoesAssiduidade={permissoesAssiduidade}
          />
        </TabsContent>

        <TabsContent value="ausencias">
          <PessoaAusenciasTab
            pessoaId={pessoa.id}
            pessoaNome={pessoa.nome_completo}
            souAPessoa={minhaPessoaId === pessoa.id}
            aprovadorChefiaNome={reportaANome}
            nomePorPessoaId={nomePorPessoaId}
            permissoes={permissoesAusencias}
          />
        </TabsContent>

        <TabsContent value="documentos">
          <PessoaDocumentosTab
            pessoaId={pessoa.id}
            souAPessoa={minhaPessoaId === pessoa.id}
            permissoes={permissoesDocumentos}
          />
        </TabsContent>

        {TABS_EM_CONSTRUCAO.map(({ value, labelKey, icon }) => (
          <TabsContent key={value} value={value}>
            <PessoaEmConstrucaoTab titulo={t(labelKey)} icon={icon} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
