import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { IndicadorGravacao } from "@/emylia/IndicadorGravacao";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { PortalCompanyProvider } from "@/contexts/PortalCompanyContext";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { SidebarExpandProvider } from "@/contexts/SidebarContext";
import { FornecedorFonteDenunciasReal } from "@/components/canal-denuncias/hooks/FonteDenunciasReal";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PessoasRota } from "@/components/pessoas-lista/PessoasRota";
import { RedirectPreservandoPesquisa } from "@/components/pessoas-lista/RedirectPreservandoPesquisa";
import { ClientRouteGuard, CrmRouteGuard, SupplierRouteGuard } from "@/components/ClientRouteGuard";
import { LayoutRoute } from "@/components/Layout";
import { RotaNegocios } from "@/components/RotaNegocios";
import { RedirectRh } from "@/components/RedirectRh";

// Critical routes loaded eagerly
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ChooseAccess from "./pages/ChooseAccess";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

// All other routes lazy-loaded
const Dashboard = lazy(() => import("./pages/Dashboard"));


const Proposals = lazy(() => import("./pages/Proposals"));


const Settings = lazy(() => import("./pages/Settings"));
const Quotes = lazy(() => import("./pages/Quotes"));
const QuoteModels = lazy(() => import("./pages/QuoteModels"));
const QuoteTemplates = lazy(() => import("./pages/QuoteTemplates"));
const ProposalTemplates = lazy(() => import("./pages/ProposalTemplates"));
const FlowBuilder = lazy(() => import("./pages/FlowBuilder"));


const ApiKeys = lazy(() => import("./pages/ApiKeys"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const CampaignDetail = lazy(() => import("./pages/CampaignDetail"));
const Channels = lazy(() => import("./pages/Channels"));
const ChannelDetail = lazy(() => import("./pages/ChannelDetail"));
const LeadSources = lazy(() => import("./pages/LeadSources"));
const LeadContactResults = lazy(() => import("./pages/LeadContactResults"));



const Stocks = lazy(() => import("./pages/Stocks"));
const InventoryToday = lazy(() => import("./pages/InventoryToday"));
const StockMovements = lazy(() => import("./pages/StockMovements"));
const Warehouses = lazy(() => import("./pages/Warehouses"));
const Frota = lazy(() => import("./pages/frota/Frota"));
const PurchaseOrders = lazy(() => import("./pages/PurchaseOrders"));
const Receiving = lazy(() => import("./pages/Receiving"));
const ClientOrders = lazy(() => import("./pages/ClientOrders"));
const StockCounts = lazy(() => import("./pages/StockCounts"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const CatalogoCustos = lazy(() => import("./pages/CatalogoCustos"));
const NegociosEmylia = lazy(() => import("./pages/NegociosEmylia"));

const TeamHub = lazy(() => import("./pages/TeamHub"));
const TechnicalSettings = lazy(() => import("./pages/TechnicalSettings"));
const Scheduling = lazy(() => import("./pages/Scheduling"));
const Atividades = lazy(() => import("./pages/Atividades"));
const ContractTemplates = lazy(() => import("./pages/ContractTemplates"));
const ClientContracts = lazy(() => import("./pages/ClientContracts"));
const Countries = lazy(() => import("./pages/Countries"));

const OrgChart = lazy(() => import("./pages/OrgChart"));
const Home = lazy(() => import("./pages/Home"));
const HojeInicio = lazy(() => import("./pages/HojeInicio"));

const WelcomeGuide = lazy(() => import("./pages/WelcomeGuide"));


const PessoasCrm = lazy(() => import("./pages/PessoasCrm"));
const PessoasPipeline = lazy(() => import("./pages/PessoasPipeline"));
const UtilizadoresPerfis = lazy(() => import("./pages/UtilizadoresPerfis"));
const PessoaRhDetalhe = lazy(() => import("./pages/rh-exemplo/PessoaRhDetalhe"));
const RhAssiduidadeEAusencias = lazy(() => import("./pages/rh-exemplo/RhAssiduidadeEAusencias"));
const RhMinhasAusencias = lazy(() => import("./pages/rh-exemplo/RhMinhasAusencias"));
const RhMeuPonto = lazy(() => import("./pages/rh-exemplo/RhMeuPonto"));
const RhMeusDocumentos = lazy(() => import("./pages/rh-exemplo/RhMeusDocumentos"));
const RhCentrosTrabalho = lazy(() => import("./pages/rh-exemplo/RhCentrosTrabalho"));
const RhOrganizacao = lazy(() => import("./pages/rh-exemplo/RhOrganizacao"));
const RhModelosDocumentos = lazy(() => import("./pages/rh-exemplo/RhModelosDocumentos"));
const RhProcessamentoSalarial = lazy(() => import("./pages/rh-exemplo/RhProcessamentoSalarial"));
const RhConfiguracaoAdmissao = lazy(() => import("./pages/rh-exemplo/RhConfiguracaoAdmissao"));
const RhCustos = lazy(() => import("./pages/rh-exemplo/RhCustos"));
const RhRegrasFimContrato = lazy(() => import("./pages/rh-exemplo/RhRegrasFimContrato"));
const RhConviteAdmissao = lazy(() => import("./pages/rh-exemplo/RhConviteAdmissao"));
const RhPortalColaborador = lazy(() => import("./pages/rh-exemplo/RhPortalColaborador"));
const RhAdmissaoIndice = lazy(() => import("./pages/rh-exemplo/RhAdmissaoIndice"));
const NovaDenuncia = lazy(() => import("./pages/canal-denuncias/NovaDenuncia"));
const AcompanharDenuncia = lazy(() => import("./pages/canal-denuncias/AcompanharDenuncia"));
const RhMinhasDenuncias = lazy(() => import("./pages/rh-exemplo/RhMinhasDenuncias"));
const RhDenuncias = lazy(() => import("./pages/rh-exemplo/RhDenuncias"));
const PendingFormSubmissions = lazy(() => import("./pages/PendingFormSubmissions"));
// AnewContacts page retired: Contacto merged into Lead lifecycle (Fase 1). Route removed from routing, file kept on disk for reference.
const Gallery = lazy(() => import("./pages/Gallery"));
const MarketingApi = lazy(() => import("./pages/MarketingApi"));
const MarketingIntegration = lazy(() => import("./pages/MarketingIntegration"));
const PostalCodesImport = lazy(() => import("./pages/PostalCodesImport"));
const PublicLeadForm = lazy(() => import("./pages/PublicLeadForm"));
const TestIframe = lazy(() => import("./pages/TestIframe"));
const TestWidget = lazy(() => import("./pages/TestWidget"));
const MarketingHelp = lazy(() => import("./pages/MarketingHelp"));
const Forms = lazy(() => import("./pages/Forms"));
const AILearning = lazy(() => import("./pages/AILearning"));
const AIAssistantAdmin = lazy(() => import("./pages/AIAssistantAdmin"));
const AIAssistantConfig = lazy(() => import("./pages/AIAssistantConfig"));
const DocsArchitecture = lazy(() => import("./pages/docs/DocsArchitecture"));
const DocsUserModel = lazy(() => import("./pages/docs/DocsUserModel"));
const DocsApi = lazy(() => import("./pages/docs/DocsApi"));
const DocsDatabase = lazy(() => import("./pages/docs/DocsDatabase"));
const DocsIntegrations = lazy(() => import("./pages/docs/DocsIntegrations"));
const DocsEdgeFunctions = lazy(() => import("./pages/docs/DocsEdgeFunctions"));
const DocsAuthentication = lazy(() => import("./pages/docs/DocsAuthentication"));
const DocsGuides = lazy(() => import("./pages/docs/DocsGuides"));
const DocsPermissions = lazy(() => import("./pages/docs/DocsPermissions"));
const DocsAutoScheduling = lazy(() => import("./pages/docs/DocsAutoScheduling"));
const DocsTranslations = lazy(() => import("./pages/docs/DocsTranslations"));
const DocsInviteLinks = lazy(() => import("./pages/docs/DocsInviteLinks"));
const DocsEmbedWidget = lazy(() => import("./pages/docs/DocsEmbedWidget"));
const Landing = lazy(() => import("./pages/Landing"));
const Organizations = lazy(() => import("./pages/Organizations"));
const OrganizationDetail = lazy(() => import("./pages/OrganizationDetail"));
const OrgTemplates = lazy(() => import("./pages/OrgTemplates"));
const OrgHelp = lazy(() => import("./pages/OrgHelp"));
const NeedsAssessmentConfig = lazy(() => import("./pages/NeedsAssessmentConfig"));
const UsersNew = lazy(() => import("./pages/UsersNew"));
const SmtpManagement = lazy(() => import("./pages/SmtpManagement"));
const EmailTemplates = lazy(() => import("./pages/EmailTemplates"));
const Trash = lazy(() => import("./pages/Trash"));
const SendFailures = lazy(() => import("./pages/SendFailures"));
const NotificationsPage = lazy(() => import("./pages/Notifications"));
const AlertSettings = lazy(() => import("./pages/AlertSettings"));
const ExportAudit = lazy(() => import("./pages/ExportAudit"));
const SupportAccess = lazy(() => import("./pages/SupportAccess"));
const AuthAuditLog = lazy(() => import("./pages/AuthAuditLog"));
const DataErasureRequests = lazy(() => import("./pages/DataErasureRequests"));
const BookingManage = lazy(() => import("./pages/BookingManage"));
const ConviteAdmissao = lazy(() => import("./pages/ConviteAdmissao"));
const BookingConfirm = lazy(() => import("./pages/BookingConfirm"));
const PrototipoNegocios = lazy(() => import("./pages/prototipo-negocios/PrototipoNegocios"));
// 4/11: a chamada em direto sem conta (o painel do «Tudo na chamada» com um negócio de exemplo)
const PrototipoChamada = lazy(() => import("./pages/prototipo-negocios/PrototipoChamada"));
// 5/11 (Rúben): o Estúdio do projeto (o antes, o estilo, o depois, o 3D e a proposta), com um catálogo de teste, sem conta
const EstudioProjeto = lazy(() => import("./pages/prototipo-estudio/EstudioProjeto"));
const PrototipoEstudioPlano = lazy(() => import("./pages/prototipo-estudio/PrototipoEstudioPlano"));
const PrototipoNegocioSimples = lazy(() => import("./pages/prototipo-estudio/PrototipoNegocioSimples"));
const EquipasObra = lazy(() => import("./pages/EquipasObra"));
const PlaneadorCozinha = lazy(() => import("./pages/prototipo-estudio/cozinha/PlaneadorCozinha"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const ClientPortalProposalDetail = lazy(() => import("./pages/ClientPortalProposalDetail"));
const ClientPortalNegocios = lazy(() => import("./pages/ClientPortalNegocios"));
const ClientPortalNegocio = lazy(() => import("./pages/ClientPortalNegocio"));
const ClientPortalContractDetail = lazy(() => import("./pages/ClientPortalContractDetail"));
const ClientPortalDocuments = lazy(() => import("./pages/ClientPortalDocuments"));
// Portal do Fornecedor (F3.1): contexto sp_whoami + layout montados uma vez.
const SupplierPortalShell = lazy(() => import("./components/supplier-portal/SupplierPortalLayout"));
const SupplierPortal = lazy(() => import("./pages/SupplierPortal"));
const SupplierPortalCatalog = lazy(() => import("./pages/SupplierPortalCatalog"));
const SupplierPortalOrders = lazy(() => import("./pages/SupplierPortalOrders"));
const SupplierPortalOrderDetail = lazy(() => import("./pages/SupplierPortalOrderDetail"));
const SupplierPortalProfile = lazy(() => import("./pages/SupplierPortalProfile"));
const SupplierPortalContract = lazy(() => import("./pages/SupplierPortalContract"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Empresa ativa do portal — monta uma só vez para todas as rotas do portal,
// fora do CRM: uma conta de portal não tem work-orgs e o CompanyProvider não
// lhe serve de nada (ver src/contexts/PortalCompanyContext.tsx).
const PortalCompanyRoute = () => (
  <PortalCompanyProvider>
    <Outlet />
  </PortalCompanyProvider>
);

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ErrorBoundary>
        <Toaster />
        <Sonner />
        {/* 9/11: a gravação da visita continua por toda a app (o Estúdio); o indicador em baixo */}
        <IndicadorGravacao />
        <BrowserRouter>
          <SidebarExpandProvider>
            <CompanyProvider>
              <PermissionsProvider>
              {/* Canal de denúncias: a fonte REAL (RPCs e Edge) por baixo de tudo, menu incluído. Sem ela os ecrãs do canal
                  usariam a loja de exemplo: nunca se monta o canal real sem este fornecedor (ver FonteDenunciasReal.tsx). */}
              <FornecedorFonteDenunciasReal>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public routes */}
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/escolher-acesso" element={<ChooseAccess />} />
                  <Route path="/form" element={<PublicLeadForm />} />
                  <Route path="/form/:formId" element={<PublicLeadForm />} />
                  <Route path="/lead-form/:formId" element={<PublicLeadForm />} />
                  <Route path="/campaign/:campaignId" element={<PublicLeadForm />} />
                  {/* Páginas de teste do iframe e do widget (desenvolvimento): só o administrador de sistema. */}
                  <Route path="/test-iframe" element={<ProtectedRoute systemAdminOnly><TestIframe /></ProtectedRoute>} />
                  <Route path="/test-widget" element={<ProtectedRoute systemAdminOnly><TestWidget /></ProtectedRoute>} />
                  <Route path="/booking/manage" element={<BookingManage />} />
                  <Route path="/booking/cancel" element={<BookingManage />} />
                  {/* O convite de admissao abre-se SEM sessao, pelo link do e-mail:
                      fica fora do ProtectedRoute de proposito. Quem manda e a
                      validade do token, verificada na Edge Function. */}
                  <Route path="/admissao/:token" element={<ConviteAdmissao />} />
                  <Route path="/booking/confirm" element={<BookingConfirm />} />
                  {/* Protótipo de Negócios (08/10/2026): dados de exemplo, sem sessão nem base de dados */}
                  <Route path="/prototipo/negocios" element={<PrototipoNegocios />} />
                  <Route path="/prototipo/chamada" element={<PrototipoChamada />} />
                  <Route path="/prototipo/estudio" element={<EstudioProjeto />} />
                  <Route path="/prototipo/estudio-plano" element={<PrototipoEstudioPlano />} />
                  <Route path="/prototipo/negocio-simples" element={<PrototipoNegocioSimples />} />
                  <Route path="/equipas-obra" element={<EquipasObra />} />
                  <Route path="/prototipo/cozinha" element={<PlaneadorCozinha />} />
                  {/* Portal do colaborador de exemplo (página pública, sem sessão: acesso temporário pelo link) */}
                  <Route path="/rh-exemplo/portal-colaborador/:token" element={<RhPortalColaborador />} />
                  {/* O endereço antigo do link de admissão redireciona para o portal */}
                  <Route path="/rh-exemplo/admissao/:token" element={<RhConviteAdmissao />} />
                  {/* Canal de denúncias de exemplo: páginas públicas (sem sessão), dados em memória */}
                  <Route path="/canal-denuncias/nova" element={<NovaDenuncia />} />
                  <Route path="/canal-denuncias/acompanhar" element={<AcompanharDenuncia />} />

                  {/* Client portal — guard + layout mount once for all portal routes */}
                  <Route element={<ClientRouteGuard />}>
                    <Route element={<PortalCompanyRoute />}>
                      <Route path="/client-portal" element={<ClientPortal />} />
                      <Route path="/client-portal/negocios" element={<ClientPortalNegocios />} />
                      <Route path="/client-portal/negocios/:id" element={<ClientPortalNegocio />} />
                      <Route path="/client-portal/proposals" element={<Navigate to="/client-portal/negocios" replace />} />
                      <Route path="/client-portal/proposals/:id" element={<ClientPortalProposalDetail />} />
                      <Route path="/client-portal/contracts" element={<Navigate to="/client-portal/negocios" replace />} />
                      <Route path="/client-portal/contracts/:id" element={<ClientPortalContractDetail />} />
                      <Route path="/client-portal/documents" element={<ClientPortalDocuments />} />
                    </Route>
                  </Route>

                  {/* Portal do Fornecedor — só contas supplier_only (sem anew_users); só RPCs sp_* */}
                  <Route element={<SupplierRouteGuard />}>
                    <Route element={<SupplierPortalShell />}>
                      <Route path="/supplier-portal" element={<SupplierPortal />} />
                      <Route path="/supplier-portal/catalog" element={<SupplierPortalCatalog />} />
                      <Route path="/supplier-portal/orders" element={<SupplierPortalOrders />} />
                      <Route path="/supplier-portal/orders/:id" element={<SupplierPortalOrderDetail />} />
                      <Route path="/supplier-portal/profile" element={<SupplierPortalProfile />} />
                      <Route path="/supplier-portal/contract" element={<SupplierPortalContract />} />
                    </Route>
                  </Route>

                  {/* CRM routes — guard + Layout mount once; pages render via Outlet */}
                  <Route element={<CrmRouteGuard />}>
                    <Route element={<LayoutRoute />}>
                      <Route path="/home" element={<HojeInicio />} />
                      <Route path="/dashboard" element={<ProtectedRoute permission="dashboard.view" allowWithoutCompany><Dashboard /></ProtectedRoute>} />
                      <Route path="/anew-clients" element={<RedirectPreservandoPesquisa />} />
                      <Route path="/company-groups" element={<Navigate to="/organizations" replace />} />
                      <Route path="/anew-contacts" element={<RedirectPreservandoPesquisa />} />
                      <Route path="/anew-leads" element={<RedirectPreservandoPesquisa />} />
                      <Route path="/calendar" element={<Navigate to="/scheduling" replace />} />
                      <Route path="/modelos-orcamento" element={<Navigate to="/quote-models" replace />} />
                      <Route path="/clients" element={<RedirectPreservandoPesquisa />} />
                      <Route path="/contacts" element={<RedirectPreservandoPesquisa />} />
                      <Route path="/atividades" element={<ProtectedRoute permission="scheduling.items.view"><Atividades /></ProtectedRoute>} />
                      <Route path="/leads" element={<RedirectPreservandoPesquisa />} />
                      <Route path="/pessoas" element={<ProtectedRoute permission="pessoas.view"><PessoasRota><PessoasCrm /></PessoasRota></ProtectedRoute>} />
                      <Route path="/pipeline" element={<ProtectedRoute permission="pessoas.view"><PessoasRota><PessoasPipeline /></PessoasRota></ProtectedRoute>} />
                      <Route path="/negocios" element={<RotaNegocios><NegociosEmylia /></RotaNegocios>} />
                      {/* Utilizadores e Roles num só ecrã: entra quem tem users.view OU roles.view; cada separador pede a sua. */}
                      <Route path="/utilizadores-perfis" element={<ProtectedRoute permissions={["users.view", "roles.view"]}><UtilizadoresPerfis /></ProtectedRoute>} />
                      {/* Uma só rota (`:id?`): abrir e fechar a ficha muda o endereço PELO ROUTER sem remontar a página. */}
                      <Route path="/rh-exemplo/pessoas/:id?" element={<ProtectedRoute permissions={["hr.pessoas.view", "hr.pessoas.view.own"]}><PessoaRhDetalhe /></ProtectedRoute>} />
                      <Route path="/rh-exemplo/assiduidade-e-ausencias" element={<ProtectedRoute permissions={["hr.ausencias.view", "hr.ausencias.aprovar.chefia", "hr.ausencias.aprovar.rh", "hr.assiduidade.view", "hr.assiduidade.equipa.view"]}><RhAssiduidadeEAusencias /></ProtectedRoute>} />
                      <Route path="/rh-exemplo/ausencias" element={<ProtectedRoute permissions={["hr.ausencias.view.own", "hr.ausencias.pedir"]}><RhMinhasAusencias /></ProtectedRoute>} />
                      <Route path="/rh-exemplo/assiduidade" element={<ProtectedRoute permissions={["hr.assiduidade.view.own", "hr.assiduidade.picar"]}><RhMeuPonto /></ProtectedRoute>} />
                      <Route path="/rh-exemplo/documentos" element={<ProtectedRoute permissions={["hr.pessoas.documentos.view.own", "hr.pessoas.documentos.view"]}><RhMeusDocumentos /></ProtectedRoute>} />
                      <Route path="/rh-exemplo/centros" element={<ProtectedRoute permission="hr.locais.view"><RhCentrosTrabalho /></ProtectedRoute>} />
                      <Route path="/rh-exemplo/organizacao" element={<ProtectedRoute permission="hr.pessoas.colocacao.view"><RhOrganizacao /></ProtectedRoute>} />
                      <Route path="/rh-exemplo/documentos/modelos" element={<ProtectedRoute permission="hr.pessoas.documentos.modelos.view"><RhModelosDocumentos /></ProtectedRoute>} />
                      <Route path="/rh-exemplo/processamento-salarial" element={<ProtectedRoute permissions={["hr.processamento.periodo.view", "hr.vencimento.codigos.view", "hr.vencimento.subsidio.view"]}><RhProcessamentoSalarial /></ProtectedRoute>} />
                      {/* Link antigo: as horas extra da pessoa passaram a ser uma aba de «O meu ponto». */}
                      <Route path="/rh-exemplo/minhas-horas-extra" element={<Navigate to="/rh-exemplo/assiduidade?aba=horas-extra" replace />} />
                      <Route path="/rh-exemplo/custos" element={<ProtectedRoute permission="hr.pessoas.retribuicao.view"><RhCustos /></ProtectedRoute>} />
                      <Route path="/rh-exemplo/admissao" element={<ProtectedRoute permissions={["hr.pessoas.convite.enviar", "hr.onboarding.approve"]}><RhAdmissaoIndice /></ProtectedRoute>} />
                      <Route path="/rh-exemplo/admissao/configuracao" element={<ProtectedRoute permission="hr.admissao.obrigatorios.gerir"><RhConfiguracaoAdmissao /></ProtectedRoute>} />
                      <Route path="/rh-exemplo/contratos/configuracao" element={<ProtectedRoute permission="hr.contratos.regras.gerir"><RhRegrasFimContrato /></ProtectedRoute>} />
                      {/* Canal de denúncias de exemplo, dentro da app: A minha área (Denúncias: denunciar num painel e acompanhar) e a gestão no RH */}
                      <Route path="/rh-exemplo/denunciar" element={<Navigate to="/rh-exemplo/minhas-denuncias?nova=1" replace />} />
                      {/* As denúncias da própria pessoa: só sessão (o menu também não pede permissão). */}
                      <Route path="/rh-exemplo/minhas-denuncias" element={<RhMinhasDenuncias />} />
                      <Route path="/rh-exemplo/denuncias" element={<ProtectedRoute permission="hr.denuncias.gerir"><RhDenuncias /></ProtectedRoute>} />
                      <Route path="/canal-denuncias/gestao" element={<Navigate to="/rh-exemplo/denuncias" replace />} />
                      <Route path="/leads/pending-submissions" element={<ProtectedRoute permission="platform.pending_submissions.view"><PendingFormSubmissions /></ProtectedRoute>} />
                      {/* 06/11: os Pedidos de Proposta são do CRM antigo; /deals e /negocio-metas levam para /negocios (as páginas ficam em disco). */}
                      <Route path="/deals" element={<Navigate to="/negocios" replace />} />
                      <Route path="/negocio-metas" element={<Navigate to="/negocios" replace />} />
                      <Route path="/proposals" element={<ProtectedRoute permission="proposals.view"><Proposals /></ProtectedRoute>} />
                      {/* 03/11: a Aquisição saiu do menu (o Negócios substitui-a). A ajuda e a Venda Direta antiga levam para /negocios; /quotes, /proposals e /client-contracts ficam vivas (a ficha do /pessoas ainda as usa). */}
                      <Route path="/acquisition-help" element={<Navigate to="/negocios" replace />} />
                      <Route path="/quotes" element={<ProtectedRoute permission="quotes.view"><Quotes /></ProtectedRoute>} />
                      <Route path="/quote-models" element={<ProtectedRoute permission="quote_templates.view"><QuoteModels /></ProtectedRoute>} />
                      <Route path="/proposal-templates" element={<ProtectedRoute permission="proposals.manage"><ProposalTemplates /></ProtectedRoute>} />
                      <Route path="/quote-templates" element={<ProtectedRoute permission="quotes.manage"><QuoteTemplates /></ProtectedRoute>} />
                      <Route path="/direct-sales" element={<Navigate to="/negocios" replace />} />
                      {/* 03/11/2026: as páginas antigas do catálogo (produtos, serviços, marcas, pacotes, categorias, atributos, unidades, taxas, itens de catálogo) deram lugar ao Catálogo e custos. */}
                      <Route path="/catalog-items" element={<Navigate to="/catalogo-custos" replace />} />
                      <Route path="/users" element={<ProtectedRoute permission="users.view"><UsersNew /></ProtectedRoute>} />
                      {/* O editor antigo de roles deu lugar ao separador Roles de /utilizadores-perfis (que já pede roles.view). */}
                      <Route path="/roles" element={<Navigate to="/utilizadores-perfis?aba=roles" replace />} />
                      <Route path="/api-keys" element={<ProtectedRoute permissions={["settings.update", "api_keys.view"]}><ApiKeys /></ProtectedRoute>} />
                      <Route path="/forms" element={<ProtectedRoute permission="forms.view"><Forms /></ProtectedRoute>} />
                      <Route path="/campaigns" element={<ProtectedRoute permission="campaigns.view"><Campaigns /></ProtectedRoute>} />
                      <Route path="/campaigns/:id" element={<ProtectedRoute permission="campaigns.view"><CampaignDetail /></ProtectedRoute>} />
                      <Route path="/channels" element={<ProtectedRoute permission="campaigns.view"><Channels /></ProtectedRoute>} />
                      <Route path="/channels/:id" element={<ProtectedRoute permission="campaigns.view"><ChannelDetail /></ProtectedRoute>} />
                      <Route path="/lead-sources" element={<ProtectedRoute permission="lead_sources.view"><LeadSources /></ProtectedRoute>} />
                      <Route path="/lead-contact-results" element={<ProtectedRoute permission="leads.config"><LeadContactResults /></ProtectedRoute>} />
                      <Route path="/gallery" element={<ProtectedRoute systemAdminOnly><Gallery /></ProtectedRoute>} />
                      <Route path="/products" element={<Navigate to="/catalogo-custos" replace />} />
                      <Route path="/product-configurator-lab" element={<Navigate to="/catalogo-custos" replace />} />
                      <Route path="/product-categories" element={<Navigate to="/catalogo-custos" replace />} />
                      <Route path="/product-subcategories" element={<Navigate to="/catalogo-custos" replace />} />
                      <Route path="/product-attributes" element={<Navigate to="/catalogo-custos" replace />} />
                      <Route path="/brands" element={<Navigate to="/catalogo-custos" replace />} />
                      <Route path="/units-of-measure" element={<Navigate to="/catalogo-custos" replace />} />
                      <Route path="/bundles" element={<Navigate to="/catalogo-custos" replace />} />
                      {/* Inventário › Hoje e Movimentos (livro stock_movements): mesma permissão de leitura que a RLS exige (inventory.view). */}
                      <Route path="/inventory" element={<ProtectedRoute permission="inventory.view"><InventoryToday /></ProtectedRoute>} />
                      <Route path="/stock-movements" element={<ProtectedRoute permission="inventory.view"><StockMovements /></ProtectedRoute>} />
                      <Route path="/stocks" element={<ProtectedRoute permission="inventory.view"><Stocks /></ProtectedRoute>} />
                      <Route path="/warehouses" element={<ProtectedRoute permission="warehouses.view"><Warehouses /></ProtectedRoute>} />
                      {/* Frota de exemplo (dados em memória/localStorage, sem tabelas): ainda não há permissões fleet.*, por isso usa as do
                          Inventário — inventory.view para ver (as carrinhas são armazéns móveis) e inventory.edit, dentro do ecrã, para registar. */}
                      <Route path="/frota" element={<Navigate to="/frota/hoje" replace />} />
                      <Route path="/frota/hoje" element={<ProtectedRoute permissions={["fleet.view", "fleet.self"]}><Frota key="hoje" ecra="hoje" /></ProtectedRoute>} />
                      <Route path="/frota/viaturas" element={<ProtectedRoute permissions={["fleet.view", "fleet.self"]}><Frota key="viaturas" ecra="viaturas" /></ProtectedRoute>} />
                      <Route path="/frota/atribuicoes" element={<ProtectedRoute permissions={["fleet.view", "fleet.self"]}><Frota key="atribuicoes" ecra="atribuicoes" /></ProtectedRoute>} />
                      <Route path="/frota/condutores" element={<ProtectedRoute permissions={["fleet.view", "fleet.self"]}><Frota key="condutores" ecra="condutores" /></ProtectedRoute>} />
                      <Route path="/frota/manutencao" element={<ProtectedRoute permissions={["fleet.view", "fleet.self"]}><Frota key="manutencao" ecra="manutencao" /></ProtectedRoute>} />
                      <Route path="/frota/custos" element={<ProtectedRoute permissions={["fleet.view", "fleet.self"]}><Frota key="custos" ecra="custos" /></ProtectedRoute>} />
                      <Route path="/frota/ocorrencias" element={<ProtectedRoute permissions={["fleet.view", "fleet.self"]}><Frota key="ocorrencias" ecra="ocorrencias" /></ProtectedRoute>} />
                      <Route path="/frota/documentos" element={<ProtectedRoute permissions={["fleet.view", "fleet.self"]}><Frota key="documentos" ecra="documentos" /></ProtectedRoute>} />
                      <Route path="/frota/relatorios" element={<ProtectedRoute permissions={["fleet.view", "fleet.self"]}><Frota key="relatorios" ecra="relatorios" /></ProtectedRoute>} />
                      <Route path="/frota/atividade" element={<ProtectedRoute permissions={["fleet.view", "fleet.self"]}><Frota key="atividade" ecra="atividade" /></ProtectedRoute>} />
                      <Route path="/frota/ligacoes" element={<ProtectedRoute permissions={["fleet.view", "fleet.self"]}><Frota key="ligacoes" ecra="ligacoes" /></ProtectedRoute>} />
                      <Route path="/purchase-orders" element={<ProtectedRoute permission="purchase_orders.view"><PurchaseOrders /></ProtectedRoute>} />
                      {/* Receção por código (Fase 2): permissão própria receiving.view (categoria 'receiving'). O servidor exige ainda purchase_orders.view OU .receive para consultar (rpc_receiving_lookup) e receiving.receive + purchase_orders.receive + inventory.edit para receber (can_receive / rpc_receive_by_code); sem isso o ecrã fica em modo consulta. */}
                      <Route path="/receiving" element={<ProtectedRoute permission="receiving.view"><Receiving /></ProtectedRoute>} />
                      {/* Permissão própria client_orders.view — o armazém vê as encomendas sem precisar de ver contratos. Mesma verificação dos RPCs (rpc_list_client_order_documents/rpc_get_client_order_document). */}
                      <Route path="/client-orders" element={<ProtectedRoute permission="client_orders.view"><ClientOrders /></ProtectedRoute>} />
                      {/* Fase 5.4: acesso ao ecrã só exige inventory.view — inventory.count/inventory.edit controlam ações DENTRO da página (contar/resolver/finalizar), não o acesso à rota. */}
                      <Route path="/stock-counts" element={<ProtectedRoute permission="inventory.view"><StockCounts /></ProtectedRoute>} />
                      <Route path="/suppliers" element={<ProtectedRoute permission="suppliers.view"><Suppliers /></ProtectedRoute>} />
                      <Route path="/services" element={<Navigate to="/catalogo-custos" replace />} />
                      <Route path="/catalogo-custos" element={<ProtectedRoute permission="services.view"><CatalogoCustos /></ProtectedRoute>} />
                      <Route path="/service-categories" element={<Navigate to="/catalogo-custos" replace />} />
                      <Route path="/service-subcategories" element={<Navigate to="/catalogo-custos" replace />} />
                      <Route path="/service-catalog-items" element={<Navigate to="/catalogo-custos" replace />} />
                      <Route path="/service-fees" element={<Navigate to="/catalogo-custos" replace />} />
                      <Route path="/settings" element={<ProtectedRoute permission="settings.update"><Settings /></ProtectedRoute>} />
                      <Route path="/alert-settings" element={<ProtectedRoute permission="settings.update"><AlertSettings /></ProtectedRoute>} />
                      <Route path="/docs/architecture" element={<ProtectedRoute systemAdminOnly><DocsArchitecture /></ProtectedRoute>} />
                      <Route path="/docs/user-model" element={<ProtectedRoute systemAdminOnly><DocsUserModel /></ProtectedRoute>} />
                      <Route path="/docs/api" element={<ProtectedRoute systemAdminOnly><DocsApi /></ProtectedRoute>} />
                      <Route path="/docs/database" element={<ProtectedRoute systemAdminOnly><DocsDatabase /></ProtectedRoute>} />
                      <Route path="/docs/integrations" element={<ProtectedRoute systemAdminOnly><DocsIntegrations /></ProtectedRoute>} />
                      <Route path="/docs/edge-functions" element={<ProtectedRoute systemAdminOnly><DocsEdgeFunctions /></ProtectedRoute>} />
                      <Route path="/docs/authentication" element={<ProtectedRoute systemAdminOnly><DocsAuthentication /></ProtectedRoute>} />
                      <Route path="/docs/guides" element={<ProtectedRoute systemAdminOnly><DocsGuides /></ProtectedRoute>} />
                      <Route path="/docs/permissions" element={<ProtectedRoute systemAdminOnly><DocsPermissions /></ProtectedRoute>} />
                      <Route path="/docs/auto-scheduling" element={<ProtectedRoute permissions={["scheduling.items.view", "scheduling.boards.view", "scheduling.resources.view"]}><DocsAutoScheduling /></ProtectedRoute>} />
                      <Route path="/docs/translations" element={<ProtectedRoute systemAdminOnly><DocsTranslations /></ProtectedRoute>} />
                      <Route path="/docs/invite-links" element={<ProtectedRoute permission="users.view"><DocsInviteLinks /></ProtectedRoute>} />
                      <Route path="/docs/embed-widget" element={<ProtectedRoute systemAdminOnly><DocsEmbedWidget /></ProtectedRoute>} />
                      {/* Team Hub (Beta, no cabeçalho de todos): só sessão — o servidor deixa qualquer autenticado ler e cada um escrever as suas entradas. */}
                      <Route path="/team-hub" element={<TeamHub />} />
                      <Route path="/technical-settings" element={<ProtectedRoute permission="settings.update"><TechnicalSettings /></ProtectedRoute>} />
                      <Route path="/scheduling" element={<ProtectedRoute permissions={["scheduling.items.view", "scheduling.boards.view", "scheduling.resources.view"]}><Scheduling /></ProtectedRoute>} />
                      <Route path="/contract-templates" element={<ProtectedRoute permissions={["client_contracts.view", "client_contracts.manage_templates"]}><ContractTemplates /></ProtectedRoute>} />
                      <Route path="/client-contracts" element={<ProtectedRoute permission="client_contracts.view"><ClientContracts /></ProtectedRoute>} />
                      <Route path="/countries" element={<ProtectedRoute permission="settings.update"><Countries /></ProtectedRoute>} />
                      <Route path="/org-chart" element={<ProtectedRoute permission="organizations.view"><OrgChart /></ProtectedRoute>} />
                      <Route path="/ai-learning" element={<ProtectedRoute permission="settings.update"><AILearning /></ProtectedRoute>} />
                      <Route path="/ai-assistant-admin" element={<ProtectedRoute permission="settings.update"><AIAssistantAdmin /></ProtectedRoute>} />
                      <Route path="/ai-assistant-config" element={<ProtectedRoute permission="settings.update"><AIAssistantConfig /></ProtectedRoute>} />
                      {/* Guia de boas-vindas, ajuda do marketing e documentação da API do marketing: páginas estáticas (só lêem o nome da própria pessoa) — só sessão. */}
                      <Route path="/welcome" element={<WelcomeGuide />} />
                      <Route path="/postal-codes-import" element={<ProtectedRoute systemAdminOnly><PostalCodesImport /></ProtectedRoute>} />
                      <Route path="/marketing-api" element={<MarketingApi />} />
                      <Route path="/marketing-integration" element={<ProtectedRoute permission="settings.update"><MarketingIntegration /></ProtectedRoute>} />
                      <Route path="/marketing-help" element={<MarketingHelp />} />
                      {/* 03/11/2026: o RH antigo (/rh/*) deixou de montar as páginas antigas; cada rota leva ao equivalente em /rh-exemplo/*
                          (RedirectRh mantém o :id, a query e o hash). Quem decide o acesso é a rota de destino. */}
                      <Route path="/rh/pessoas/:id?" element={<RedirectRh para="/rh-exemplo/pessoas/:id?" />} />
                      <Route path="/rh/documentos" element={<RedirectRh para="/rh-exemplo/documentos" />} />
                      <Route path="/rh/ausencias" element={<RedirectRh para="/rh-exemplo/ausencias" />} />
                      <Route path="/rh/ausencias/aprovacoes" element={<RedirectRh para="/rh-exemplo/assiduidade-e-ausencias?dominio=ausencias&tab=aprovacoes" />} />
                      <Route path="/rh/ausencias/organizacao" element={<RedirectRh para="/rh-exemplo/assiduidade-e-ausencias?dominio=ausencias" />} />
                      <Route path="/rh/assiduidade" element={<RedirectRh para="/rh-exemplo/assiduidade" />} />
                      <Route path="/rh/assiduidade/organizacao" element={<RedirectRh para="/rh-exemplo/assiduidade-e-ausencias?dominio=assiduidade" />} />
                      <Route path="/rh/assiduidade-e-ausencias" element={<RedirectRh para="/rh-exemplo/assiduidade-e-ausencias" />} />
                      <Route path="/rh/centros" element={<RedirectRh para="/rh-exemplo/centros" />} />
                      <Route path="/rh/admissao/configuracao" element={<RedirectRh para="/rh-exemplo/admissao/configuracao" />} />
                      <Route path="/rh/contratos/configuracao" element={<RedirectRh para="/rh-exemplo/contratos/configuracao" />} />
                      <Route path="/rh/cargos" element={<RedirectRh para="/rh-exemplo/pessoas?tab=cargos" />} />
                      <Route path="/rh/documentos/modelos" element={<RedirectRh para="/rh-exemplo/documentos/modelos" />} />
                      <Route path="/rh/documentos/clausulas" element={<RedirectRh para="/rh-exemplo/documentos/modelos" />} />
                      <Route path="/rh/processamento-salarial" element={<RedirectRh para="/rh-exemplo/processamento-salarial" />} />
                      <Route path="/organizations" element={<ProtectedRoute permission="organizations.view" allowWithoutCompany><Organizations /></ProtectedRoute>} />
                      <Route path="/organizations/:id" element={<ProtectedRoute permission="organizations.view"><OrganizationDetail /></ProtectedRoute>} />
                      <Route path="/org-templates" element={<ProtectedRoute permission="organizations.view"><OrgTemplates /></ProtectedRoute>} />
                      <Route path="/org-help" element={<ProtectedRoute permission="organizations.view"><OrgHelp /></ProtectedRoute>} />
                      <Route path="/flow-builder" element={<ProtectedRoute permission="flow_builder.view"><FlowBuilder /></ProtectedRoute>} />
                      <Route path="/needs-assessment-config" element={<ProtectedRoute permission="settings.update"><NeedsAssessmentConfig /></ProtectedRoute>} />
                      <Route path="/smtp-management" element={<ProtectedRoute permission="smtp.view"><SmtpManagement /></ProtectedRoute>} />
                      {/* Notificações: só as da própria pessoa (RLS user_id = auth.uid()) — só sessão, sem código de permissão. */}
                      <Route path="/notifications" element={<NotificationsPage />} />
                      <Route path="/email-templates" element={<ProtectedRoute permission="email_templates.view"><EmailTemplates /></ProtectedRoute>} />
                      <Route path="/trash" element={<ProtectedRoute permission="trash.view"><Trash /></ProtectedRoute>} />
                      <Route path="/send-failures" element={<ProtectedRoute permission="smtp.view"><SendFailures /></ProtectedRoute>} />
                      <Route path="/export-audit" element={<ProtectedRoute permission="exports.audit.view"><ExportAudit /></ProtectedRoute>} />
                      <Route path="/platform/support-access" element={<ProtectedRoute permission="platform.support_access.view"><SupportAccess /></ProtectedRoute>} />
                      <Route path="/platform/auth-audit-log" element={<ProtectedRoute permission="platform.auth_audit_log.view"><AuthAuditLog /></ProtectedRoute>} />
                      <Route path="/platform/data-erasure-requests" element={<ProtectedRoute permission="rgpd.erasure.manage"><DataErasureRequests /></ProtectedRoute>} />
                    </Route>
                  </Route>

                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              </FornecedorFonteDenunciasReal>
              </PermissionsProvider>
            </CompanyProvider>
          </SidebarExpandProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
