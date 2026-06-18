import { useState } from "react";
import { BookOpen, ChevronRight, Building, Users, Network, Link2, MapPin, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/hooks/useTranslation";

interface OrganizationsHelpDialogProps {
  className?: string;
}

export function OrganizationsHelpDialog({ className }: OrganizationsHelpDialogProps) {
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(false);

  const content = getContent(language);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-9 w-9 rounded-full shrink-0 ${className || ''}`}
          title={t("common.documentation")}
        >
          <BookOpen className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Building className="h-5 w-5 text-primary" />
            {content.title}
          </SheetTitle>
          <SheetDescription>{content.description}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-6 pr-4">
          <div className="space-y-6">
            {/* Introduction */}
            <div>
              <Badge variant="secondary" className="mb-3">
                {content.overviewBadge}
              </Badge>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {content.intro}
              </p>
            </div>

            <Separator />

            {/* Organizations */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Building className="h-5 w-5 text-primary" />
                {content.organizations.title}
              </h3>
              <p className="text-sm text-muted-foreground">{content.organizations.description}</p>
              <ul className="space-y-2">
                {content.organizations.types.map((type, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <ChevronRight className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                    <div>
                      <span className="font-medium">{type.name}</span>
                      <span className="text-muted-foreground"> - {type.description}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <span className="font-medium text-primary">💡 </span>
                {content.organizations.tip}
              </div>
            </div>

            <Separator />

            {/* Relationships */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Network className="h-5 w-5 text-primary" />
                {content.relationships.title}
              </h3>

              {/* Members */}
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  {content.relationships.members.title}
                </h4>
                <p className="text-sm text-muted-foreground">{content.relationships.members.description}</p>
                <ul className="space-y-1.5 ml-6">
                  {content.relationships.members.types.map((type, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <div>
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{type.code}</code>
                        <span className="text-muted-foreground"> - {type.description}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Hierarchy */}
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  {content.relationships.hierarchy.title}
                </h4>
                <p className="text-sm text-muted-foreground">{content.relationships.hierarchy.description}</p>
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <span className="font-medium text-primary">💡 </span>
                  {content.relationships.hierarchy.tip}
                </div>
              </div>

              {/* Relations */}
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  {content.relationships.relations.title}
                </h4>
                <p className="text-sm text-muted-foreground">{content.relationships.relations.description}</p>
                <ul className="space-y-1.5 ml-6">
                  {content.relationships.relations.examples.map((example, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground">{example}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <Separator />

            {/* Addresses */}
            <div className="space-y-2">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                {content.addresses.title}
              </h3>
              <p className="text-sm text-muted-foreground">{content.addresses.description}</p>
              <ul className="space-y-1.5">
                {content.addresses.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <ChevronRight className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Separator />

            {/* Best Practices */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">{content.bestPractices.title}</h3>
              <ul className="space-y-2">
                {content.bestPractices.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-primary font-medium">{i + 1}.</span>
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// Multi-language content
function getContent(language: string) {
  const contents: Record<string, any> = {
    pt: {
      title: "Gestão de Organizações",
      description: "Sistema flexível para estruturar a sua empresa",
      overviewBadge: "Visão Geral",
      intro: "O sistema de organizações permite criar qualquer estrutura empresarial de forma flexível. Pode criar holdings, empresas, departamentos, equipas e qualquer outro tipo de entidade organizacional, ligando-as através de hierarquias e relações.",
      organizations: {
        title: "Organizações",
        description: "Uma organização pode representar qualquer entidade na sua estrutura:",
        types: [
          { name: "Empresa", description: "Entidade jurídica principal" },
          { name: "Holding", description: "Grupo que controla outras empresas" },
          { name: "Departamento", description: "Divisão funcional dentro de uma empresa" },
          { name: "Equipa", description: "Grupo de trabalho operacional" },
          { name: "Filial", description: "Unidade em localização diferente" },
          { name: "Projeto", description: "Iniciativa temporária com equipa dedicada" },
        ],
        tip: "O campo 'tipo' é apenas uma etiqueta descritiva e não afeta o comportamento do sistema. Pode usar qualquer nome que faça sentido para si.",
      },
      relationships: {
        title: "Tipos de Relações",
        members: {
          title: "Membros",
          description: "Utilizadores podem pertencer ou gerir organizações:",
          types: [
            { code: "BELONGS_TO", description: "Utilizador pertence à organização" },
            { code: "MANAGES", description: "Utilizador gere/coordena a organização" },
          ],
        },
        hierarchy: {
          title: "Hierarquia (Pais/Filhos)",
          description: "Crie estruturas hierárquicas ilimitadas. Uma organização pode ter múltiplos pais e múltiplos filhos.",
          tip: "Exemplo: 'Equipa Norte' é filha de 'Departamento Comercial' que é filho de 'Olyvia Portugal'.",
        },
        relations: {
          title: "Relações Customizadas",
          description: "Ligações flexíveis entre organizações que não são hierárquicas:",
          examples: [
            "Parcerias entre empresas",
            "Prestadores de serviços",
            "Fornecedores",
            "Clientes internos",
          ],
        },
      },
      addresses: {
        title: "Moradas",
        description: "Cada organização pode ter múltiplas moradas associadas:",
        features: [
          "Endereços com rua, número, andar, fração",
          "Código postal e cidade",
          "Marcação de morada fiscal para faturação",
          "Histórico de moradas com datas de validade",
        ],
      },
      bestPractices: {
        title: "Boas Práticas",
        items: [
          "Comece pela estrutura de topo (holding/empresa principal) e vá descendo",
          "Use tipos descritivos que façam sentido para a sua organização",
          "Associe utilizadores às organizações onde trabalham diretamente",
          "Use relações para ligações que não são hierárquicas (parcerias, prestadores)",
          "Mantenha as moradas atualizadas para relatórios corretos",
        ],
      },
    },
    en: {
      title: "Organization Management",
      description: "Flexible system to structure your company",
      overviewBadge: "Overview",
      intro: "The organization system allows you to create any business structure flexibly. You can create holdings, companies, departments, teams, and any other type of organizational entity, linking them through hierarchies and relationships.",
      organizations: {
        title: "Organizations",
        description: "An organization can represent any entity in your structure:",
        types: [
          { name: "Company", description: "Main legal entity" },
          { name: "Holding", description: "Group that controls other companies" },
          { name: "Department", description: "Functional division within a company" },
          { name: "Team", description: "Operational work group" },
          { name: "Branch", description: "Unit in a different location" },
          { name: "Project", description: "Temporary initiative with dedicated team" },
        ],
        tip: "The 'type' field is just a descriptive label and doesn't affect system behavior. You can use any name that makes sense for you.",
      },
      relationships: {
        title: "Relationship Types",
        members: {
          title: "Members",
          description: "Users can belong to or manage organizations:",
          types: [
            { code: "BELONGS_TO", description: "User belongs to the organization" },
            { code: "MANAGES", description: "User manages/coordinates the organization" },
          ],
        },
        hierarchy: {
          title: "Hierarchy (Parents/Children)",
          description: "Create unlimited hierarchical structures. An organization can have multiple parents and multiple children.",
          tip: "Example: 'North Team' is child of 'Sales Department' which is child of 'Olyvia Portugal'.",
        },
        relations: {
          title: "Custom Relations",
          description: "Flexible links between organizations that are not hierarchical:",
          examples: [
            "Partnerships between companies",
            "Service providers",
            "Suppliers",
            "Internal clients",
          ],
        },
      },
      addresses: {
        title: "Addresses",
        description: "Each organization can have multiple associated addresses:",
        features: [
          "Addresses with street, number, floor, unit",
          "Postal code and city",
          "Fiscal address marking for billing",
          "Address history with validity dates",
        ],
      },
      bestPractices: {
        title: "Best Practices",
        items: [
          "Start with the top structure (holding/main company) and work down",
          "Use descriptive types that make sense for your organization",
          "Associate users to organizations where they work directly",
          "Use relations for non-hierarchical links (partnerships, providers)",
          "Keep addresses updated for accurate reports",
        ],
      },
    },
    es: {
      title: "Gestión de Organizaciones",
      description: "Sistema flexible para estructurar su empresa",
      overviewBadge: "Visión General",
      intro: "El sistema de organizaciones permite crear cualquier estructura empresarial de forma flexible. Puede crear holdings, empresas, departamentos, equipos y cualquier otro tipo de entidad organizacional, vinculándolas a través de jerarquías y relaciones.",
      organizations: {
        title: "Organizaciones",
        description: "Una organización puede representar cualquier entidad en su estructura:",
        types: [
          { name: "Empresa", description: "Entidad jurídica principal" },
          { name: "Holding", description: "Grupo que controla otras empresas" },
          { name: "Departamento", description: "División funcional dentro de una empresa" },
          { name: "Equipo", description: "Grupo de trabajo operacional" },
          { name: "Sucursal", description: "Unidad en ubicación diferente" },
          { name: "Proyecto", description: "Iniciativa temporal con equipo dedicado" },
        ],
        tip: "El campo 'tipo' es solo una etiqueta descriptiva y no afecta el comportamiento del sistema. Puede usar cualquier nombre que tenga sentido para usted.",
      },
      relationships: {
        title: "Tipos de Relaciones",
        members: {
          title: "Miembros",
          description: "Los usuarios pueden pertenecer o gestionar organizaciones:",
          types: [
            { code: "BELONGS_TO", description: "Usuario pertenece a la organización" },
            { code: "MANAGES", description: "Usuario gestiona/coordina la organización" },
          ],
        },
        hierarchy: {
          title: "Jerarquía (Padres/Hijos)",
          description: "Cree estructuras jerárquicas ilimitadas. Una organización puede tener múltiples padres y múltiples hijos.",
          tip: "Ejemplo: 'Equipo Norte' es hijo de 'Departamento Comercial' que es hijo de 'Olyvia Portugal'.",
        },
        relations: {
          title: "Relaciones Personalizadas",
          description: "Enlaces flexibles entre organizaciones que no son jerárquicas:",
          examples: [
            "Asociaciones entre empresas",
            "Proveedores de servicios",
            "Proveedores",
            "Clientes internos",
          ],
        },
      },
      addresses: {
        title: "Direcciones",
        description: "Cada organización puede tener múltiples direcciones asociadas:",
        features: [
          "Direcciones con calle, número, piso, unidad",
          "Código postal y ciudad",
          "Marcación de dirección fiscal para facturación",
          "Historial de direcciones con fechas de validez",
        ],
      },
      bestPractices: {
        title: "Mejores Prácticas",
        items: [
          "Comience por la estructura superior (holding/empresa principal) y vaya bajando",
          "Use tipos descriptivos que tengan sentido para su organización",
          "Asocie usuarios a organizaciones donde trabajan directamente",
          "Use relaciones para enlaces no jerárquicos (asociaciones, proveedores)",
          "Mantenga las direcciones actualizadas para informes correctos",
        ],
      },
    },
    fr: {
      title: "Gestion des Organisations",
      description: "Système flexible pour structurer votre entreprise",
      overviewBadge: "Aperçu",
      intro: "Le système d'organisations vous permet de créer n'importe quelle structure d'entreprise de manière flexible. Vous pouvez créer des holdings, des entreprises, des départements, des équipes et tout autre type d'entité organisationnelle, en les reliant par des hiérarchies et des relations.",
      organizations: {
        title: "Organisations",
        description: "Une organisation peut représenter n'importe quelle entité dans votre structure:",
        types: [
          { name: "Entreprise", description: "Entité juridique principale" },
          { name: "Holding", description: "Groupe qui contrôle d'autres entreprises" },
          { name: "Département", description: "Division fonctionnelle au sein d'une entreprise" },
          { name: "Équipe", description: "Groupe de travail opérationnel" },
          { name: "Filiale", description: "Unité dans un lieu différent" },
          { name: "Projet", description: "Initiative temporaire avec équipe dédiée" },
        ],
        tip: "Le champ 'type' n'est qu'une étiquette descriptive et n'affecte pas le comportement du système. Vous pouvez utiliser n'importe quel nom qui a du sens pour vous.",
      },
      relationships: {
        title: "Types de Relations",
        members: {
          title: "Membres",
          description: "Les utilisateurs peuvent appartenir ou gérer des organisations:",
          types: [
            { code: "BELONGS_TO", description: "L'utilisateur appartient à l'organisation" },
            { code: "MANAGES", description: "L'utilisateur gère/coordonne l'organisation" },
          ],
        },
        hierarchy: {
          title: "Hiérarchie (Parents/Enfants)",
          description: "Créez des structures hiérarchiques illimitées. Une organisation peut avoir plusieurs parents et plusieurs enfants.",
          tip: "Exemple: 'Équipe Nord' est enfant de 'Département Commercial' qui est enfant de 'Olyvia Portugal'.",
        },
        relations: {
          title: "Relations Personnalisées",
          description: "Liens flexibles entre organisations qui ne sont pas hiérarchiques:",
          examples: [
            "Partenariats entre entreprises",
            "Prestataires de services",
            "Fournisseurs",
            "Clients internes",
          ],
        },
      },
      addresses: {
        title: "Adresses",
        description: "Chaque organisation peut avoir plusieurs adresses associées:",
        features: [
          "Adresses avec rue, numéro, étage, unité",
          "Code postal et ville",
          "Marquage d'adresse fiscale pour la facturation",
          "Historique des adresses avec dates de validité",
        ],
      },
      bestPractices: {
        title: "Meilleures Pratiques",
        items: [
          "Commencez par la structure supérieure (holding/entreprise principale) et descendez",
          "Utilisez des types descriptifs qui ont du sens pour votre organisation",
          "Associez les utilisateurs aux organisations où ils travaillent directement",
          "Utilisez les relations pour les liens non hiérarchiques (partenariats, prestataires)",
          "Gardez les adresses à jour pour des rapports précis",
        ],
      },
    },
    de: {
      title: "Organisationsverwaltung",
      description: "Flexibles System zur Strukturierung Ihres Unternehmens",
      overviewBadge: "Übersicht",
      intro: "Das Organisationssystem ermöglicht es Ihnen, jede Unternehmensstruktur flexibel zu erstellen. Sie können Holdings, Unternehmen, Abteilungen, Teams und jede andere Art von Organisationseinheit erstellen und sie durch Hierarchien und Beziehungen verbinden.",
      organizations: {
        title: "Organisationen",
        description: "Eine Organisation kann jede Entität in Ihrer Struktur repräsentieren:",
        types: [
          { name: "Unternehmen", description: "Hauptrechtseinheit" },
          { name: "Holding", description: "Gruppe, die andere Unternehmen kontrolliert" },
          { name: "Abteilung", description: "Funktionale Einheit innerhalb eines Unternehmens" },
          { name: "Team", description: "Operative Arbeitsgruppe" },
          { name: "Filiale", description: "Einheit an einem anderen Standort" },
          { name: "Projekt", description: "Temporäre Initiative mit dediziertem Team" },
        ],
        tip: "Das 'Typ'-Feld ist nur ein beschreibendes Label und beeinflusst das Systemverhalten nicht. Sie können jeden Namen verwenden, der für Sie sinnvoll ist.",
      },
      relationships: {
        title: "Beziehungstypen",
        members: {
          title: "Mitglieder",
          description: "Benutzer können zu Organisationen gehören oder sie verwalten:",
          types: [
            { code: "BELONGS_TO", description: "Benutzer gehört zur Organisation" },
            { code: "MANAGES", description: "Benutzer verwaltet/koordiniert die Organisation" },
          ],
        },
        hierarchy: {
          title: "Hierarchie (Eltern/Kinder)",
          description: "Erstellen Sie unbegrenzte hierarchische Strukturen. Eine Organisation kann mehrere Eltern und mehrere Kinder haben.",
          tip: "Beispiel: 'Nord-Team' ist Kind von 'Vertriebsabteilung', die Kind von 'Olyvia Portugal' ist.",
        },
        relations: {
          title: "Benutzerdefinierte Beziehungen",
          description: "Flexible Verbindungen zwischen Organisationen, die nicht hierarchisch sind:",
          examples: [
            "Partnerschaften zwischen Unternehmen",
            "Dienstleister",
            "Lieferanten",
            "Interne Kunden",
          ],
        },
      },
      addresses: {
        title: "Adressen",
        description: "Jede Organisation kann mehrere zugehörige Adressen haben:",
        features: [
          "Adressen mit Straße, Nummer, Etage, Einheit",
          "Postleitzahl und Stadt",
          "Steueradress-Markierung für die Abrechnung",
          "Adresshistorie mit Gültigkeitsdaten",
        ],
      },
      bestPractices: {
        title: "Best Practices",
        items: [
          "Beginnen Sie mit der obersten Struktur (Holding/Hauptunternehmen) und arbeiten Sie sich nach unten",
          "Verwenden Sie beschreibende Typen, die für Ihre Organisation sinnvoll sind",
          "Ordnen Sie Benutzer den Organisationen zu, in denen sie direkt arbeiten",
          "Verwenden Sie Beziehungen für nicht-hierarchische Verbindungen (Partnerschaften, Anbieter)",
          "Halten Sie die Adressen für genaue Berichte aktuell",
        ],
      },
    },
  };

  return contents[language] || contents.en;
}
