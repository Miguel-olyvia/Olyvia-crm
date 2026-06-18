import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Link2, 
  Users, 
  Building, 
  Globe, 
  Layers, 
  FolderTree,
  Shield,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  UserPlus,
  Mail,
  Key,
  ListTree
} from 'lucide-react';

export default function DocsInviteLinks() {
  return (
    <>
      <div className="max-w-4xl mx-auto space-y-8 pb-12">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Link2 className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Manual de Links de Convite</h1>
              <p className="text-muted-foreground">
                Guia completo para criação e gestão de convites de utilizadores
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Introduction */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-primary" />
            Introdução
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            O sistema de Links de Convite permite criar links personalizados para convidar novos utilizadores 
            para a plataforma. Cada link pode pré-definir a organização, empresa, unidade de negócio, 
            departamento e role do novo utilizador, simplificando o processo de onboarding.
          </p>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Principais Funcionalidades</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Associação multi-organizacional (múltiplas empresas/BUs/departamentos)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Atribuição granular de roles por entidade</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Pré-definição de dados do colaborador (salário, posição, departamento)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Expiração configurável dos links</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Opção de criar apenas registo de colaborador (sem conta de utilizador)</span>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Hierarchy Flow */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <ListTree className="h-6 w-6 text-primary" />
            Fluxo de Seleção Hierárquico
          </h2>
          
          <p className="text-muted-foreground">
            A criação de convites segue um fluxo em cascata onde a seleção de entidades pai filtra as opções 
            disponíveis para entidades filha:
          </p>

          <div className="grid gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-amber-500" />
                    <span className="font-medium">Organização</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center gap-2">
                    <Building className="h-5 w-5 text-blue-500" />
                    <span className="font-medium">Empresa</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-green-500" />
                    <span className="font-medium">Unidade de Negócio</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center gap-2">
                    <FolderTree className="h-5 w-5 text-purple-500" />
                    <span className="font-medium">Departamento</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="h-5 w-5 text-amber-500" />
                    Organizações
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Selecione uma ou mais organizações. Ao selecionar, as empresas disponíveis serão 
                    filtradas para mostrar apenas as que pertencem às organizações selecionadas.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building className="h-5 w-5 text-blue-500" />
                    Empresas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Selecione empresas das organizações escolhidas. As unidades de negócio serão 
                    filtradas para mostrar apenas as que pertencem às empresas selecionadas.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="h-5 w-5 text-green-500" />
                    Unidades de Negócio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Selecione unidades de negócio das empresas escolhidas. Os departamentos serão 
                    filtrados por associação às unidades selecionadas.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FolderTree className="h-5 w-5 text-purple-500" />
                    Departamentos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Selecione departamentos para associar o novo utilizador a equipas específicas 
                    dentro das unidades de negócio.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <Separator />

        {/* Role Assignment */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Key className="h-6 w-6 text-primary" />
            Atribuição de Roles
          </h2>

          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground mb-4">
                Os roles são atribuídos de forma <strong>exclusiva</strong> ao nível mais granular selecionado. 
                Isto previne conflitos onde um utilizador poderia ter roles contraditórios (ex: worker numa empresa 
                e admin numa BU).
              </p>

              <div className="space-y-4">
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      Nível Organização
                    </Badge>
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Se apenas organizações estão selecionadas (sem empresas), os roles disponíveis são 
                    roles de <code className="bg-muted px-1 rounded">tenant_admin</code>.
                  </p>
                </div>

                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      Nível Empresa
                    </Badge>
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Se empresas estão selecionadas (sem BUs), os roles disponíveis são filtrados para 
                    <code className="bg-muted px-1 rounded">company_admin</code> e 
                    <code className="bg-muted px-1 rounded">worker_user</code>.
                  </p>
                </div>

                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Nível Unidade de Negócio
                    </Badge>
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Se BUs estão selecionadas (sem departamentos), os roles disponíveis são filtrados para 
                    <code className="bg-muted px-1 rounded">business_unit_admin</code> e 
                    <code className="bg-muted px-1 rounded">worker_user</code>.
                  </p>
                </div>

                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                      Nível Departamento
                    </Badge>
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Se departamentos estão selecionados, os roles disponíveis são filtrados para 
                    <code className="bg-muted px-1 rounded">department_admin</code> e 
                    <code className="bg-muted px-1 rounded">worker_user</code>.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-800 dark:text-blue-200">Nota Importante</h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    O <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">user_type</code> do utilizador 
                    é automaticamente derivado do role selecionado, não do nível hierárquico. Por exemplo, 
                    mesmo selecionando uma BU, se escolher um role de worker, o utilizador será criado como 
                    <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">worker_user</code>.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* User Creation Option */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Criação de Conta de Utilizador
          </h2>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <p className="text-muted-foreground">
                O formulário de convite inclui uma opção "Criar conta de utilizador para este colaborador" 
                que controla se o convite irá criar um utilizador com acesso à plataforma.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 border rounded-lg bg-green-50/50 dark:bg-green-950/20">
                  <h4 className="font-medium text-green-800 dark:text-green-200 mb-2 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Com Conta de Utilizador
                  </h4>
                  <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
                    <li>• Fluxo completo de seleção organizacional</li>
                    <li>• Atribuição de roles obrigatória</li>
                    <li>• Acesso à plataforma após registo</li>
                    <li>• Credenciais de login criadas</li>
                  </ul>
                </div>

                <div className="p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Apenas Registo de Colaborador
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Recolha de dados do colaborador</li>
                    <li>• Sem seleção de organização/roles</li>
                    <li>• Sem acesso à plataforma</li>
                    <li>• Útil para RH e cadastro de pessoal</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Admin Scope */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Âmbito Administrativo
          </h2>

          <p className="text-muted-foreground">
            As opções visíveis no formulário de convite dependem do nível administrativo do utilizador:
          </p>

          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium">Tipo de Admin</th>
                      <th className="text-left py-2 px-3 font-medium">Organizações</th>
                      <th className="text-left py-2 px-3 font-medium">Empresas</th>
                      <th className="text-left py-2 px-3 font-medium">BUs</th>
                      <th className="text-left py-2 px-3 font-medium">Departamentos</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 px-3 font-medium">System Admin</td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-green-600">Todas</Badge></td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-green-600">Todas</Badge></td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-green-600">Todas</Badge></td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-green-600">Todos</Badge></td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 px-3 font-medium">Tenant Admin</td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-blue-600">Geridas</Badge></td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-blue-600">Das orgs</Badge></td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-blue-600">Das empresas</Badge></td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-blue-600">Todos</Badge></td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 px-3 font-medium">Company Admin</td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-muted-foreground">—</Badge></td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-blue-600">Própria</Badge></td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-blue-600">Da empresa</Badge></td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-blue-600">Todos</Badge></td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 px-3 font-medium">BU Admin</td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-muted-foreground">—</Badge></td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-muted-foreground">—</Badge></td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-blue-600">Própria(s)</Badge></td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-blue-600">Das BUs</Badge></td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Dept Admin</td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-muted-foreground">—</Badge></td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-muted-foreground">—</Badge></td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-muted-foreground">—</Badge></td>
                      <td className="py-2 px-3"><Badge variant="outline" className="text-blue-600">Próprio(s)</Badge></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Pre-filled Data */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            Dados Pré-definidos
          </h2>

          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground mb-4">
                Os links de convite podem incluir dados pré-definidos que são preenchidos automaticamente 
                no formulário de registo do colaborador:
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm">Dados Pessoais</h4>
                  <p className="text-xs text-muted-foreground mt-1">Nome, email, telefone, morada</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm">Dados Profissionais</h4>
                  <p className="text-xs text-muted-foreground mt-1">Posição, departamento, gestor direto</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm">Dados Contratuais</h4>
                  <p className="text-xs text-muted-foreground mt-1">Salário, tipo de contrato, data de início</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm">Configurações</h4>
                  <p className="text-xs text-muted-foreground mt-1">Idioma preferido, role atribuído</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-800 dark:text-amber-200">Segurança dos Dados</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Dados sensíveis (salário, NIF) são protegidos via função <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">SECURITY DEFINER</code> e 
                    não são expostos publicamente. O formulário de registo só revela estes campos 
                    após o colaborador os preencher.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Best Practices */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            Boas Práticas
          </h2>

          <div className="grid gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h4 className="font-medium">Definir Expiração Adequada</h4>
                    <p className="text-sm text-muted-foreground">
                      Configure uma data de expiração razoável para os links de convite (7-30 dias) 
                      para evitar links órfãos.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h4 className="font-medium">Usar Roles Específicos</h4>
                    <p className="text-sm text-muted-foreground">
                      Em vez de usar roles genéricos, crie roles específicos para cada função 
                      (ex: "Técnico de Manutenção", "Gestor de Vendas") com permissões adequadas.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h4 className="font-medium">Pré-definir Dados Quando Possível</h4>
                    <p className="text-sm text-muted-foreground">
                      Utilize os campos de dados pré-definidos para acelerar o onboarding e 
                      garantir consistência nos registos de colaboradores.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h4 className="font-medium">Monitorizar Links Ativos</h4>
                    <p className="text-sm text-muted-foreground">
                      Reveja periodicamente os links de convite ativos e elimine aqueles que 
                      já não são necessários.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </>
  );
}