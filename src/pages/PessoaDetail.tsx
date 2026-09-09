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
import { useMemo } from "react";
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
  TrendingUp,
  User,
} from "lucide-react";
import { PessoaContratoTab } from "@/components/hr/PessoaContratoTab";
import { PessoaEmConstrucaoTab } from "@/components/hr/PessoaEmConstrucaoTab";
import { PessoaAusenciasTab } from "@/components/hr/PessoaAusenciasTab";
import { PessoaHorarioTab } from "@/components/hr/PessoaHorarioTab";
import { PessoaLaboraisTab } from "@/components/hr/PessoaLaboraisTab";
import {
  PessoaPessoaisTab,
  type PessoaPessoaisPermissoes,
} from "@/components/hr/PessoaPessoaisTab";
import { PessoaVisaoGeralTab } from "@/components/hr/PessoaVisaoGeralTab";
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
  { value: "documentos", labelKey: "hr.pessoa.tabs.documentos", icon: FolderOpen },
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

  const { locais, loading: locaisALoad } = useLocaisTrabalho();
  // Para saber se quem abre a ficha e a propria pessoa: muda o que pode pedir.
  const { pessoaId: minhaPessoaId } = useMinhaPessoa();

  const pessoa = ficha.pessoa;

  const reportaANome = useMemo(() => {
    if (!pessoa?.reporta_a_pessoa_id) return null;
    return colegas.find((c) => c.id === pessoa.reporta_a_pessoa_id)?.nome_completo ?? null;
  }, [pessoa?.reporta_a_pessoa_id, colegas]);

  const nomePorPessoaId = useMemo(
    () => new Map(colegas.map((colega) => [colega.id, colega.nome_completo])),
    [colegas],
  );

  const entidadeLegalNome = useMemo(() => {
    if (!pessoa?.entidade_legal_org_id) return null;
    return companies.find((e) => e.id === pessoa.entidade_legal_org_id)?.name ?? null;
  }, [pessoa?.entidade_legal_org_id, companies]);

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
            <Badge
              variant={pessoa.estado_contrato === "em_curso" ? "secondary" : "outline"}
              className="font-normal"
            >
              {t(`hr.estadoContrato.${pessoa.estado_contrato}`)}
            </Badge>
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
      </div>

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
          />
        </TabsContent>

        <TabsContent value="laborais">
          {podeVerLaborais ? (
            <PessoaLaboraisTab
              pessoa={pessoa}
              colegas={colegas.map((c) => ({ id: c.id, nome_completo: c.nome_completo }))}
              locais={locais}
              locaisALoad={locaisALoad}
              entidadeLegalNome={entidadeLegalNome ?? activeCompany?.name ?? null}
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
            permissoes={permissoes}
            saving={ficha.saving}
            onGuardarDadosPessoais={ficha.saveDadosPessoais}
            onGuardarIdentificacao={ficha.saveIdentificacao}
            onGuardarMorada={ficha.saveMorada}
            onGuardarEmergencia={ficha.saveEmergencia}
            onGuardarSaude={ficha.saveSaude}
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

        {TABS_EM_CONSTRUCAO.map(({ value, labelKey, icon }) => (
          <TabsContent key={value} value={value}>
            <PessoaEmConstrucaoTab titulo={t(labelKey)} icon={icon} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
