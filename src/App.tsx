import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { SidebarExpandProvider } from "@/contexts/SidebarContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ClientRouteGuard, CrmRouteGuard } from "@/components/ClientRouteGuard";
import { LayoutRoute } from "@/components/Layout";

// Critical routes loaded eagerly
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

// All other routes lazy-loaded
const Dashboard = lazy(() => import("./pages/Dashboard"));


const Deals = lazy(() => import("./pages/Deals"));
const Proposals = lazy(() => import("./pages/Proposals"));


const Settings = lazy(() => import("./pages/Settings"));
const Quotes = lazy(() => import("./pages/Quotes"));
const QuoteModels = lazy(() => import("./pages/QuoteModels"));
const QuoteTemplates = lazy(() => import("./pages/QuoteTemplates"));
const ProposalTemplates = lazy(() => import("./pages/ProposalTemplates"));
const FlowBuilder = lazy(() => import("./pages/FlowBuilder"));
const CatalogItems = lazy(() => import("./pages/CatalogItems"));


const Roles = lazy(() => import("./pages/Roles"));
const ApiKeys = lazy(() => import("./pages/ApiKeys"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const CampaignDetail = lazy(() => import("./pages/CampaignDetail"));
const Channels = lazy(() => import("./pages/Channels"));
const ChannelDetail = lazy(() => import("./pages/ChannelDetail"));
const LeadSources = lazy(() => import("./pages/LeadSources"));
const LeadContactResults = lazy(() => import("./pages/LeadContactResults"));



const Products = lazy(() => import("./pages/Products"));
const ProductConfiguratorLab = lazy(() => import("./pages/ProductConfiguratorLab"));
const ProductCategories = lazy(() => import("./pages/ProductCategories"));
const ProductSubcategories = lazy(() => import("./pages/ProductSubcategories"));
const ProductAttributes = lazy(() => import("./pages/ProductAttributes"));
const Brands = lazy(() => import("./pages/Brands"));
const UnitsOfMeasure = lazy(() => import("./pages/UnitsOfMeasure"));
const Bundles = lazy(() => import("./pages/Bundles"));
const Stocks = lazy(() => import("./pages/Stocks"));
const Warehouses = lazy(() => import("./pages/Warehouses"));
const PurchaseOrders = lazy(() => import("./pages/PurchaseOrders"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const Services = lazy(() => import("./pages/Services"));
const ServiceCategories = lazy(() => import("./pages/ServiceCategories"));
const ServiceSubcategories = lazy(() => import("./pages/ServiceSubcategories"));
const ServiceCatalogItems = lazy(() => import("./pages/ServiceCatalogItems"));
const ServiceFees = lazy(() => import("./pages/ServiceFees"));

const TeamHub = lazy(() => import("./pages/TeamHub"));
const TechnicalSettings = lazy(() => import("./pages/TechnicalSettings"));
const Scheduling = lazy(() => import("./pages/Scheduling"));
const ContractTemplates = lazy(() => import("./pages/ContractTemplates"));
const ClientContracts = lazy(() => import("./pages/ClientContracts"));
const Countries = lazy(() => import("./pages/Countries"));

const OrgChart = lazy(() => import("./pages/OrgChart"));
const Home = lazy(() => import("./pages/Home"));

const WelcomeGuide = lazy(() => import("./pages/WelcomeGuide"));


const AnewLeads = lazy(() => import("./pages/AnewLeads"));
const AnewContacts = lazy(() => import("./pages/AnewContacts"));
const AnewClients = lazy(() => import("./pages/AnewClients"));
const Gallery = lazy(() => import("./pages/Gallery"));
const MarketingApi = lazy(() => import("./pages/MarketingApi"));
const MarketingIntegration = lazy(() => import("./pages/MarketingIntegration"));
const PostalCodesImport = lazy(() => import("./pages/PostalCodesImport"));
const PublicLeadForm = lazy(() => import("./pages/PublicLeadForm"));
const PublicProposal = lazy(() => import("./pages/PublicProposal"));
const TestIframe = lazy(() => import("./pages/TestIframe"));
const TestWidget = lazy(() => import("./pages/TestWidget"));
const AcquisitionHelp = lazy(() => import("./pages/AcquisitionHelp"));
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
const NotificationsPage = lazy(() => import("./pages/Notifications"));
const AlertSettings = lazy(() => import("./pages/AlertSettings"));
const ExportAudit = lazy(() => import("./pages/ExportAudit"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const ClientPortalProposals = lazy(() => import("./pages/ClientPortalProposals"));
const ClientPortalProposalDetail = lazy(() => import("./pages/ClientPortalProposalDetail"));
const ClientPortalContracts = lazy(() => import("./pages/ClientPortalContracts"));
const ClientPortalContractDetail = lazy(() => import("./pages/ClientPortalContractDetail"));
const ClientPortalDocuments = lazy(() => import("./pages/ClientPortalDocuments"));

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
        <BrowserRouter>
          <SidebarExpandProvider>
            <CompanyProvider>
              <PermissionsProvider>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public routes */}
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/form" element={<PublicLeadForm />} />
                  <Route path="/form/:formId" element={<PublicLeadForm />} />
                  <Route path="/lead-form/:formId" element={<PublicLeadForm />} />
                  <Route path="/campaign/:campaignId" element={<PublicLeadForm />} />
                  <Route path="/proposal/:token" element={<PublicProposal />} />
                  <Route path="/test-iframe" element={<TestIframe />} />
                  <Route path="/test-widget" element={<TestWidget />} />

                  {/* Client portal — guard + layout mount once for all portal routes */}
                  <Route element={<ClientRouteGuard />}>
                    <Route path="/client-portal" element={<ClientPortal />} />
                    <Route path="/client-portal/proposals" element={<ClientPortalProposals />} />
                    <Route path="/client-portal/proposals/:id" element={<ClientPortalProposalDetail />} />
                    <Route path="/client-portal/contracts" element={<ClientPortalContracts />} />
                    <Route path="/client-portal/contracts/:id" element={<ClientPortalContractDetail />} />
                    <Route path="/client-portal/documents" element={<ClientPortalDocuments />} />
                  </Route>

                  {/* CRM routes — guard + Layout mount once; pages render via Outlet */}
                  <Route element={<CrmRouteGuard />}>
                    <Route element={<LayoutRoute />}>
                      <Route path="/home" element={<Home />} />
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/anew-clients" element={<Navigate to="/clients" replace />} />
                      <Route path="/company-groups" element={<Navigate to="/organizations" replace />} />
                      <Route path="/anew-contacts" element={<Navigate to="/contacts" replace />} />
                      <Route path="/anew-leads" element={<Navigate to="/leads" replace />} />
                      <Route path="/calendar" element={<Navigate to="/scheduling" replace />} />
                      <Route path="/modelos-orcamento" element={<Navigate to="/quote-models" replace />} />
                      <Route path="/clients" element={<ProtectedRoute permission="clients.view"><AnewClients /></ProtectedRoute>} />
                      <Route path="/contacts" element={<ProtectedRoute permission="contacts.view"><AnewContacts /></ProtectedRoute>} />
                      <Route path="/leads" element={<ProtectedRoute permission="leads.view"><AnewLeads /></ProtectedRoute>} />
                      <Route path="/deals" element={<ProtectedRoute permission="deals.view"><Deals /></ProtectedRoute>} />
                      <Route path="/proposals" element={<ProtectedRoute permission="proposals.view"><Proposals /></ProtectedRoute>} />
                      <Route path="/acquisition-help" element={<AcquisitionHelp />} />
                      <Route path="/quotes" element={<ProtectedRoute permission="quotes.view"><Quotes /></ProtectedRoute>} />
                      <Route path="/quote-models" element={<ProtectedRoute permission="quote_templates.view"><QuoteModels /></ProtectedRoute>} />
                      <Route path="/proposal-templates" element={<ProposalTemplates />} />
                      <Route path="/quote-templates" element={<ProtectedRoute permission="proposals.manage"><QuoteTemplates /></ProtectedRoute>} />
                      <Route path="/catalog-items" element={<CatalogItems />} />
                      <Route path="/users" element={<ProtectedRoute permission="users.view"><UsersNew /></ProtectedRoute>} />
                      <Route path="/roles" element={<ProtectedRoute permission="roles.view"><Roles /></ProtectedRoute>} />
                      <Route path="/api-keys" element={<ProtectedRoute permission="settings.update"><ApiKeys /></ProtectedRoute>} />
                      <Route path="/forms" element={<ProtectedRoute permission="forms.view"><Forms /></ProtectedRoute>} />
                      <Route path="/campaigns" element={<ProtectedRoute permission="campaigns.view"><Campaigns /></ProtectedRoute>} />
                      <Route path="/campaigns/:id" element={<ProtectedRoute permission="campaigns.view"><CampaignDetail /></ProtectedRoute>} />
                      <Route path="/channels" element={<Channels />} />
                      <Route path="/channels/:id" element={<ProtectedRoute permission="campaigns.view"><ChannelDetail /></ProtectedRoute>} />
                      <Route path="/lead-sources" element={<LeadSources />} />
                      <Route path="/lead-contact-results" element={<LeadContactResults />} />
                      <Route path="/gallery" element={<Gallery />} />
                      <Route path="/products" element={<Products />} />
                      <Route path="/product-configurator-lab" element={<ProductConfiguratorLab />} />
                      <Route path="/product-categories" element={<ProductCategories />} />
                      <Route path="/product-subcategories" element={<ProductSubcategories />} />
                      <Route path="/product-attributes" element={<ProductAttributes />} />
                      <Route path="/brands" element={<Brands />} />
                      <Route path="/units-of-measure" element={<UnitsOfMeasure />} />
                      <Route path="/bundles" element={<Bundles />} />
                      <Route path="/stocks" element={<ProtectedRoute permission="inventory.view"><Stocks /></ProtectedRoute>} />
                      <Route path="/warehouses" element={<ProtectedRoute permission="warehouses.view"><Warehouses /></ProtectedRoute>} />
                      <Route path="/purchase-orders" element={<ProtectedRoute permission="purchase_orders.view"><PurchaseOrders /></ProtectedRoute>} />
                      <Route path="/suppliers" element={<ProtectedRoute permission="suppliers.view"><Suppliers /></ProtectedRoute>} />
                      <Route path="/services" element={<Services />} />
                      <Route path="/service-categories" element={<ServiceCategories />} />
                      <Route path="/service-subcategories" element={<ServiceSubcategories />} />
                      <Route path="/service-catalog-items" element={<ServiceCatalogItems />} />
                      <Route path="/service-fees" element={<ServiceFees />} />
                      <Route path="/settings" element={<ProtectedRoute permission="settings.update"><Settings /></ProtectedRoute>} />
                      <Route path="/alert-settings" element={<AlertSettings />} />
                      <Route path="/docs/architecture" element={<DocsArchitecture />} />
                      <Route path="/docs/user-model" element={<DocsUserModel />} />
                      <Route path="/docs/api" element={<DocsApi />} />
                      <Route path="/docs/database" element={<DocsDatabase />} />
                      <Route path="/docs/integrations" element={<DocsIntegrations />} />
                      <Route path="/docs/edge-functions" element={<DocsEdgeFunctions />} />
                      <Route path="/docs/authentication" element={<DocsAuthentication />} />
                      <Route path="/docs/guides" element={<DocsGuides />} />
                      <Route path="/docs/permissions" element={<DocsPermissions />} />
                      <Route path="/docs/auto-scheduling" element={<DocsAutoScheduling />} />
                      <Route path="/docs/translations" element={<DocsTranslations />} />
                      <Route path="/docs/invite-links" element={<DocsInviteLinks />} />
                      <Route path="/docs/embed-widget" element={<DocsEmbedWidget />} />
                      <Route path="/team-hub" element={<TeamHub />} />
                      <Route path="/technical-settings" element={<ProtectedRoute permission="settings.update"><TechnicalSettings /></ProtectedRoute>} />
                      <Route path="/scheduling" element={<Scheduling />} />
                      <Route path="/contract-templates" element={<ProtectedRoute permission="client_contracts.view"><ContractTemplates /></ProtectedRoute>} />
                      <Route path="/client-contracts" element={<ProtectedRoute permission="client_contracts.view"><ClientContracts /></ProtectedRoute>} />
                      <Route path="/countries" element={<ProtectedRoute permission="settings.update"><Countries /></ProtectedRoute>} />
                      <Route path="/org-chart" element={<OrgChart />} />
                      <Route path="/ai-learning" element={<ProtectedRoute permission="settings.update"><AILearning /></ProtectedRoute>} />
                      <Route path="/ai-assistant-admin" element={<ProtectedRoute permission="settings.update"><AIAssistantAdmin /></ProtectedRoute>} />
                      <Route path="/ai-assistant-config" element={<ProtectedRoute permission="settings.update"><AIAssistantConfig /></ProtectedRoute>} />
                      <Route path="/welcome" element={<WelcomeGuide />} />
                      <Route path="/postal-codes-import" element={<PostalCodesImport />} />
                      <Route path="/marketing-api" element={<MarketingApi />} />
                      <Route path="/marketing-integration" element={<MarketingIntegration />} />
                      <Route path="/marketing-help" element={<MarketingHelp />} />
                      <Route path="/organizations" element={<Organizations />} />
                      <Route path="/organizations/:id" element={<OrganizationDetail />} />
                      <Route path="/org-templates" element={<OrgTemplates />} />
                      <Route path="/org-help" element={<OrgHelp />} />
                      <Route path="/flow-builder" element={<ProtectedRoute permission="flow_builder.view"><FlowBuilder /></ProtectedRoute>} />
                      <Route path="/needs-assessment-config" element={<NeedsAssessmentConfig />} />
                      <Route path="/smtp-management" element={<ProtectedRoute permission="smtp.view"><SmtpManagement /></ProtectedRoute>} />
                      <Route path="/notifications" element={<NotificationsPage />} />
                      <Route path="/email-templates" element={<ProtectedRoute permission="email_templates.view"><EmailTemplates /></ProtectedRoute>} />
                      <Route path="/trash" element={<Trash />} />
                      <Route path="/export-audit" element={<ProtectedRoute permission="exports.audit.view"><ExportAudit /></ProtectedRoute>} />
                    </Route>
                  </Route>

                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              </PermissionsProvider>
            </CompanyProvider>
          </SidebarExpandProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
