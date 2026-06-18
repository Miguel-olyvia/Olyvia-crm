import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Settings2, 
  MapPin, 
  Clock, 
  Users, 
  Zap, 
  Calendar,
  Route,
  CheckCircle2,
  AlertCircle,
  ArrowRight
} from 'lucide-react';

export default function DocsAutoScheduling() {
  return (
    <>
      <div className="max-w-4xl mx-auto space-y-8 pb-12">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Settings2 className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Manual de Auto-Agendamento</h1>
              <p className="text-muted-foreground">
                Guia completo para configurar regras de agendamento automático
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Introduction */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Introdução
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            O módulo de Auto-Agendamento permite automatizar a atribuição de agendamentos aos recursos 
            (técnicos, veículos, equipamentos) com base em critérios como proximidade geográfica, 
            disponibilidade e carga de trabalho. Utiliza a API do Google Maps para calcular distâncias 
            e tempos de viagem reais.
          </p>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Principais Funcionalidades</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Cálculo de distâncias via Google Maps</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Seleção automática do recurso mais próximo</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Respeito por horários de trabalho e capacidade</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Múltiplas estratégias de distribuição</span>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Creating Rules */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" />
            Criar uma Regra
          </h2>
          
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Para criar uma nova regra, aceda a <strong>Agendamentos → Regras → Nova Regra</strong>.
            </p>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Campos Obrigatórios</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="p-3 border rounded-lg">
                    <h4 className="font-medium mb-1">Nome da Regra</h4>
                    <p className="text-sm text-muted-foreground">
                      Identificador único para a regra. Ex: "Agendamento Lisboa Norte"
                    </p>
                  </div>
                  
                  <div className="p-3 border rounded-lg">
                    <h4 className="font-medium mb-1">Gatilho</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Define quando a regra é executada:
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Manual</Badge>
                        <span>Via API ou botão</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Ao criar</Badge>
                        <span>Automático na criação</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Mudança status</Badge>
                        <span>Ao mudar estado</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Por data</Badge>
                        <span>Em data específica</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 border rounded-lg">
                    <h4 className="font-medium mb-1">Estratégia de Seleção</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Como escolher o recurso:
                    </p>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <Badge className="mt-0.5">Mais próximo</Badge>
                        <span className="text-muted-foreground">
                          Usa Google Maps para encontrar o recurso com menor tempo de viagem
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Badge variant="secondary" className="mt-0.5">Primeiro disponível</Badge>
                        <span className="text-muted-foreground">
                          Seleciona o primeiro recurso com slot livre
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Badge variant="secondary" className="mt-0.5">Rotativo</Badge>
                        <span className="text-muted-foreground">
                          Distribui equitativamente entre recursos
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Badge variant="secondary" className="mt-0.5">Menos ocupado</Badge>
                        <span className="text-muted-foreground">
                          Prioriza recursos com menos agendamentos
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Time Settings */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            Configurações de Tempo
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Duração</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Tempo padrão em minutos para cada agendamento. 
                  Usado quando o item não tem duração definida.
                </p>
                <div className="mt-2 p-2 bg-muted rounded text-sm font-mono">
                  Exemplo: 60 min (1 hora)
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Horário de Trabalho</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Define o intervalo de horas permitido para agendamentos.
                </p>
                <div className="mt-2 p-2 bg-muted rounded text-sm font-mono">
                  Exemplo: 09:00 - 18:00
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Buffer Antes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Tempo extra antes de cada agendamento para preparação ou deslocação.
                </p>
                <div className="mt-2 p-2 bg-muted rounded text-sm font-mono">
                  Exemplo: 15 min
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Buffer Depois</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Tempo extra após cada agendamento para finalização ou transição.
                </p>
                <div className="mt-2 p-2 bg-muted rounded text-sm font-mono">
                  Exemplo: 10 min
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Days and Resources */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            Dias e Recursos
          </h2>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dias Permitidos</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Selecione os dias da semana em que a regra pode agendar:
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Dom</Badge>
                <Badge>Seg</Badge>
                <Badge>Ter</Badge>
                <Badge>Qua</Badge>
                <Badge>Qui</Badge>
                <Badge>Sex</Badge>
                <Badge variant="outline">Sáb</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Badges a cheio = selecionados | Badges outline = não selecionados
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5" />
                Recursos Preferidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Opcionalmente, limite a regra a um conjunto específico de recursos. 
                Se vazio, todos os recursos ativos serão considerados.
              </p>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium mb-1">💡 Dica</p>
                <p className="text-xs text-muted-foreground">
                  Use recursos preferidos para criar equipas especializadas. 
                  Ex: "Técnicos de AC" apenas para serviços de climatização.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Google Maps Integration */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Route className="h-6 w-6 text-primary" />
            Integração Google Maps
          </h2>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  A estratégia <strong>"Mais próximo"</strong> utiliza a API Distance Matrix do Google Maps 
                  para calcular distâncias e tempos de viagem reais.
                </p>

                <div className="grid gap-3">
                  <div className="flex items-start gap-3 p-3 border rounded-lg">
                    <MapPin className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <h4 className="font-medium">Código Postal do Cliente</h4>
                      <p className="text-sm text-muted-foreground">
                        O sistema usa o código postal do agendamento como destino
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 border rounded-lg">
                    <Users className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <h4 className="font-medium">Localização dos Recursos</h4>
                      <p className="text-sm text-muted-foreground">
                        Cada recurso deve ter um código postal ou morada configurada
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 border rounded-lg">
                    <Clock className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <h4 className="font-medium">Tempo de Viagem</h4>
                      <p className="text-sm text-muted-foreground">
                        O tempo de viagem é guardado nos metadados do agendamento
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-800 dark:text-amber-200">Requisitos</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    A API do Google Maps requer uma chave válida configurada nas variáveis de ambiente 
                    (GOOGLE_MAPS_API_KEY). Contacte o administrador se não estiver configurada.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* API Usage */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Utilização via API
          </h2>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Endpoint de Auto-Agendamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-muted rounded-lg font-mono text-sm">
                POST /functions/v1/auto-schedule
              </div>

              <div>
                <h4 className="font-medium mb-2">Parâmetros do Body</h4>
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-3 gap-2 p-2 bg-muted/50 rounded">
                    <span className="font-mono">postal_code</span>
                    <span className="text-muted-foreground">string</span>
                    <span>Código postal do local</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-2 bg-muted/50 rounded">
                    <span className="font-mono">preferred_date</span>
                    <span className="text-muted-foreground">string (ISO)</span>
                    <span>Data preferida</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-2 bg-muted/50 rounded">
                    <span className="font-mono">duration_minutes</span>
                    <span className="text-muted-foreground">number</span>
                    <span>Duração em minutos</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-2 bg-muted/50 rounded">
                    <span className="font-mono">use_proximity</span>
                    <span className="text-muted-foreground">boolean</span>
                    <span>Usar Google Maps</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Exemplo de Resposta</h4>
                <pre className="p-3 bg-muted rounded-lg text-xs overflow-x-auto">
{`{
  "success": true,
  "item_id": "uuid-do-agendamento",
  "scheduled_start": "2024-01-15T10:00:00Z",
  "scheduled_end": "2024-01-15T11:00:00Z",
  "resource_id": "uuid-do-recurso",
  "resource_details": {
    "name": "João Silva",
    "distance_km": 12.5,
    "travel_time_minutes": 18
  }
}`}
                </pre>
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
                    <span className="text-lg">1</span>
                  </div>
                  <div>
                    <h4 className="font-medium">Configure Buffers Realistas</h4>
                    <p className="text-sm text-muted-foreground">
                      Adicione tempo de buffer suficiente para deslocações e imprevistos. 
                      Considere o trânsito em horas de ponta.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                    <span className="text-lg">2</span>
                  </div>
                  <div>
                    <h4 className="font-medium">Mantenha Recursos Atualizados</h4>
                    <p className="text-sm text-muted-foreground">
                      Atualize regularmente a localização e disponibilidade dos recursos 
                      para garantir cálculos precisos.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                    <span className="text-lg">3</span>
                  </div>
                  <div>
                    <h4 className="font-medium">Use Prioridades</h4>
                    <p className="text-sm text-muted-foreground">
                      Se tiver múltiplas regras, configure prioridades para definir 
                      qual regra tem precedência em caso de conflito.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                    <span className="text-lg">4</span>
                  </div>
                  <div>
                    <h4 className="font-medium">Teste com "Manual" Primeiro</h4>
                    <p className="text-sm text-muted-foreground">
                      Configure novas regras como "Manual" primeiro para testar 
                      antes de as tornar automáticas.
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
