import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, Building2, Users, Mail, Key, Settings } from "lucide-react";

export default function DocsGuides() {
  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">Guias de Configuração</h1>
          <p className="text-muted-foreground mt-2">
            Guias passo-a-passo para configuração do sistema
          </p>
        </div>

        <Separator />

        {/* Initial Setup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuração Inicial
            </CardTitle>
            <CardDescription>
              Primeiros passos após criação de empresa
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-3">
              <li className="text-sm">
                <strong>Completar dados da empresa</strong>
                <p className="text-muted-foreground ml-6">
                  Aceder a Administração → Empresas e preencher todos os dados (NIF, morada, contactos)
                </p>
              </li>
              <li className="text-sm">
                <strong>Carregar logo</strong>
                <p className="text-muted-foreground ml-6">
                  Upload do logo da empresa para aparecer em documentos
                </p>
              </li>
              <li className="text-sm">
                <strong>Configurar unidades de negócio</strong>
                <p className="text-muted-foreground ml-6">
                  Se aplicável, criar filiais/departamentos em Administração → Unidades de Negócio
                </p>
              </li>
              <li className="text-sm">
                <strong>Adicionar funcionários</strong>
                <p className="text-muted-foreground ml-6">
                  Criar funcionários em RH → Funcionários antes de criar utilizadores
                </p>
              </li>
              <li className="text-sm">
                <strong>Criar utilizadores</strong>
                <p className="text-muted-foreground ml-6">
                  Administração → Utilizadores - associar a funcionários existentes
                </p>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* User Creation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Criar Utilizadores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-medium mb-2">Pré-requisitos:</h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Funcionário já criado (para Company Admins)</li>
                <li>Role definida (Sales_Full, Viewer_Global, etc.)</li>
              </ul>
            </div>

            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Aceder a Administração → Utilizadores</li>
              <li>Clicar "+ Novo Utilizador"</li>
              <li>Preencher email e password temporária</li>
              <li>Selecionar tipo de utilizador</li>
              <li>Selecionar role apropriada</li>
              <li>Associar funcionário (obrigatório para Company Admins)</li>
              <li>Gravar - utilizador recebe acesso imediato</li>
            </ol>

            <div className="border rounded-lg p-4 bg-yellow-50 dark:bg-yellow-950">
              <p className="text-sm">
                <strong>Nota:</strong> Não é enviado email de confirmação. 
                Comunique as credenciais diretamente ao utilizador.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* SMTP Setup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Configurar Email (SMTP)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Para enviar emails (orçamentos, notificações), configure o servidor SMTP da empresa.
            </p>

            <div className="space-y-3">
              <div className="border rounded-lg p-3">
                <div className="font-medium text-sm">Gmail / Google Workspace</div>
                <div className="text-xs text-muted-foreground mt-1 space-y-1">
                  <div>Host: <code>smtp.gmail.com</code></div>
                  <div>Porta: <code>587</code> (TLS)</div>
                  <div>Requer: App Password (não a password normal)</div>
                </div>
              </div>

              <div className="border rounded-lg p-3">
                <div className="font-medium text-sm">Microsoft 365 / Outlook</div>
                <div className="text-xs text-muted-foreground mt-1 space-y-1">
                  <div>Host: <code>smtp.office365.com</code></div>
                  <div>Porta: <code>587</code> (TLS)</div>
                </div>
              </div>

              <div className="border rounded-lg p-3">
                <div className="font-medium text-sm">Servidor Próprio</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Usar dados fornecidos pelo administrador de sistemas
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Keys */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Configurar API Keys
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              API Keys permitem integrações externas (websites, formulários) enviarem dados para o sistema.
            </p>

            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Aceder a Administração → API Keys</li>
              <li>Clicar "+ Nova API Key"</li>
              <li>Dar um nome descritivo (ex: "Website Principal")</li>
              <li>Copiar a chave gerada (formato: olv_...)</li>
              <li>Usar no endpoint /insert-lead</li>
            </ol>

            <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm">
{`// Exemplo de uso em website externo
fetch('https://[project].supabase.co/functions/v1/insert-lead', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    api_key: 'olv_sua_chave_aqui',
    first_name: document.getElementById('nome').value,
    email: document.getElementById('email').value,
    source: 'website'
  })
});`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Products & Services */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Configurar Produtos e Serviços
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">1. Criar Categorias</h4>
                <p className="text-sm text-muted-foreground">
                  Produtos → Categorias - organizar produtos por tipo
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-2">2. Criar Marcas (opcional)</h4>
                <p className="text-sm text-muted-foreground">
                  Produtos → Marcas - se vender produtos de marcas específicas
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-2">3. Adicionar Produtos</h4>
                <p className="text-sm text-muted-foreground">
                  Produtos → Produtos - criar produtos com preços, SKU, etc.
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-2">4. Adicionar Serviços</h4>
                <p className="text-sm text-muted-foreground">
                  Serviços → Serviços - criar serviços prestados
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-2">5. Taxas de Serviço (opcional)</h4>
                <p className="text-sm text-muted-foreground">
                  Serviços → Taxas - taxas adicionais aplicáveis em orçamentos
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quotes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Criar Orçamentos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Aceder a Vendas → Orçamentos</li>
              <li>Clicar "+ Novo Orçamento"</li>
              <li>Selecionar cliente (criar se não existir)</li>
              <li>Adicionar produtos/serviços</li>
              <li>Ajustar quantidades, descontos, IVA</li>
              <li>Adicionar taxas de serviço (se aplicável)</li>
              <li>Preencher notas/observações</li>
              <li>Gravar e exportar PDF</li>
            </ol>

            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-medium mb-2">Numeração automática:</h4>
              <p className="text-sm text-muted-foreground">
                Formato: <code>Q-YYYY-NNNN</code> (ex: Q-2025-0001)
                <br />
                Gerado automaticamente, sequencial por ano.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
