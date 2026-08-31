# O que vem a seguir

> Levantado em agosto de 2026, depois das primeiras horas de uso real no
> terreno. Nada aqui está construído.
>
> Cada ideia traz **o que já existe** (verificado no esquema, não suposto), o
> que falta, e quanto custa. As que não valem a pena estão marcadas como tal —
> uma lista só de boas ideias não ajuda a decidir.
>
> Ver também [`portal-do-cliente.md`](portal-do-cliente.md).

---

## Em duas linhas

O ganho maior não está em construir coisas novas. Está em **usar o que o CRM
já tem** e nunca chegou a Operações: notificações, agenda, contactos, catálogo.

A segunda maior é **tirar decisões de cima do técnico** — cada campo que ele
não tem de preencher em cima de um telhado é meio minuto e um erro a menos.

---

## 1. Notificações — usar as do CRM

**Prioridade: alta. É a falha mais sentida.**

Hoje ninguém é avisado de nada. Um pedido fica parado até alguém abrir a
aplicação.

### O que já existe

O CRM tem `notifications`, e a tabela é **genérica**:

```
user_id · type (texto livre) · title · message · link
entity_type · entity_id · priority · organization_id · data (jsonb)
is_read · is_dismissed · is_resolved
```

Há também `notification_settings`, por organização, com interruptores por tipo.

**Isto quer dizer que não é preciso construir um sistema de notificações.**
Basta escrever uma linha, e a pessoa vê-a no sino que já usa todos os dias no
CRM — com `link` a apontar para `/operacao/ordens/OT-2026-00842`.

### O que avisar, e a quem

| Quando | Quem recebe |
|---|---|
| Uma ordem é-me atribuída | o responsável |
| Uma não conformidade gerou uma corretiva | quem coordena |
| Uma ordem passou a data agendada e não começou | quem coordena |
| Uma ordem está em pausa e a data de retoma passou | quem a pausou |
| Um plano falhou ao materializar | quem gere planos |

Os dois últimos são os que hoje se perdem em silêncio.

### O custo

Pequeno: uma função `ops_notificar(...)` chamada de dentro das RPCs que já
existem. Meio dia.

### A decisão

**Escreve numa tabela do CRM.** É a primeira vez que este módulo o faria (fora
o bucket de storage). Escrever numa tabela genérica feita para isto é
diferente de alterar uma tabela de negócio — mas continua a ser uma decisão a
tomar de propósito.

*Alternativa sem escrever no CRM:* uma tabela `ops_notificacao` própria, com
sino próprio dentro de Operações. Funciona, mas passam a ser dois sinos, e
ninguém olha para o segundo.

---

## 2. Ligar à agenda do CRM

**Prioridade: alta para quem coordena.**

### O que já existe

Um motor de despacho completo, que Operações ignora:

| Tabela | O que sabe |
|---|---|
| `resource_availability_rules` | horário de cada pessoa, por dia da semana |
| `resource_time_off` | férias e ausências, com aprovação |
| `resource_service_areas` | zonas por prefixo de código postal, com distância máxima |
| `schedule_holidays` | feriados |
| `auto_schedule_rules` | regras de atribuição automática |
| `find_nearest_resources()` | quem está mais perto |
| `check_schedule_conflict()` | choques de agenda |

### O problema

Hoje, o aviso de choque que fizemos **só olha para ordens de Operações**.

Não sabe que o técnico está de férias. Não sabe que ele não trabalha às
sextas. Não sabe que a obra é em Braga e ele cobre Lisboa.

### O que falta

Uma correspondência entre **utilizador de Operações** e **recurso de agenda**.
São conceitos diferentes e ninguém os ligou.

```sql
CREATE TABLE public.ops_utilizador_recurso (
  utilizador_id uuid,   -- → anew_users.id
  resource_id   uuid,   -- → resources.id, sem FK
  PRIMARY KEY (utilizador_id)
);
```

Feito isso, `ops_conflitos_de_agenda` passa a consultar também férias,
horários e feriados. Sem inventar nada.

### O custo

Meio dia para o mapa e a consulta. Mais um ou dois dias se se quiser o ecrã de
agenda por dia com todos os técnicos lado a lado.

---

## 3. Relatórios

**Prioridade: média. Um já existe e chega para o piloto.**

### O que o Infraspeak tem

Templates configuráveis em `Definições › Relatórios`, com **onze** tipos:
Pedidos, Trabalho Preventivo, Auditorias, Trabalho Especial, Pedido de Compra,
Venda, Requisição, Movimento de Stock, Cliente, Orçamento, Ficha de ocorrência,
Ativo.

Em cada um escolhe-se que campos saem no PDF. Gera-se a partir da ocorrência,
do pedido, do ativo, e há download por ativo dentro da ocorrência. Mais
*Enviar por email*, com registo do destinatário no histórico.

Do lado das análises: resumo de atividade do edifício, exportar PMP do
edifício, relatório de atividade do utilizador, **exportar medições**.

### O que nós temos

Um: o relatório de intervenção, por ordem, em PDF pela impressão do browser.

### O que vale a pena acrescentar

**a) Relatório do ativo** ⭐

Todas as intervenções feitas a um equipamento, com a evolução das leituras.

É o que responde a *"este extintor tem dado problemas?"*, e o que sustenta a
decisão de substituir em vez de reparar. Os dados já estão todos gravados —
`ops_ordem_tarefa_medicao` guarda cada leitura com data e autor. Falta o ecrã.

**b) PMP cumprido** ⭐

A percentagem de manutenção preventiva feita, por cliente e por período.

**É o indicador contratual** — é por ele que um cliente de manutenção decide se
renova. Temos os dados e não os somamos: ordens preventivas geradas contra
ordens preventivas fechadas, no período.

**c) Exportar medições**

Todas as leituras de um tipo, em folha de cálculo, para quem tem de entregar
dados a uma entidade reguladora.

### O que eu NÃO copiaria

**Os templates configuráveis.** Onze tipos de documento com campos à escolha é
muita máquina — e foi assim que a árvore de definições do Infraspeak acabou num
caixote com fichas comerciais lá dentro.

Poucos relatórios bem feitos valem mais do que um construtor que ninguém sabe
configurar. Se depois fizerem falta variantes, fazem-se.

---

## 4. WhatsApp Business para pedidos de clientes

**Prioridade: a decidir. Ideia do Ruben, registada para avaliar.**

> O cliente manda mensagem no WhatsApp → nasce uma ordem por aprovar.

### O que já existe

**Nada de WhatsApp.** Procurei: não há integração, nem tabelas, nem tokens.
Existe `sms_otp_codes` (para códigos de acesso) e `email_logs`, mas não
mensagens instantâneas.

Existe `notifications`, `internal_chat_*` (chat interno entre colegas) e
`ai_assistant_conversations` — nenhum serve para falar com clientes.

### O que seria preciso

1. Conta de **WhatsApp Business Platform** (Meta), com número verificado
2. Um *webhook* público que receba as mensagens
3. Uma tabela `ops_pedido_recebido` — a mensagem crua, antes de virar ordem
4. Uma maneira de saber **de quem é o número** → `anew_entity_phones` já tem os
   telefones dos clientes, o que resolve metade do problema
5. Uma RPC que transforma um pedido aceite em ordem `por_aprovar`

### O que me preocupa

**a) A mensagem não é um pedido estruturado.** *"bom dia, o portão está outra
vez a fazer barulho"* não diz o local, nem o equipamento, nem a urgência.
Alguém tem de ler e completar — o que é trabalho, não automação.

**b) O número pode não estar na ficha.** Se o inquilino manda mensagem de um
número que o CRM não conhece, o pedido fica órfão.

**c) O WhatsApp cria expectativa de resposta.** Quem manda mensagem espera
resposta em minutos. Sem alguém a olhar para a caixa, é pior do que não ter.

### Uma versão mais barata que testa a mesma ideia

Um **formulário público** (o CRM já tem construtor: `forms`, `form_fields`,
`form_steps`, `form_submissions`), com um link que se manda por WhatsApp à
mão.

O cliente recebe o link no WhatsApp — que é onde ele já está — mas responde
num formulário que **pergunta o que é preciso**: onde, o quê, uma foto.

Isso dá 80 % do valor por 10 % do trabalho, e diz-nos se os clientes usam de
todo. Se usarem muito, aí a integração a sério justifica-se.

---

## 5. O que mais o CRM tem e Operações ainda não usa

Levantado tabela a tabela.

| No CRM | O que daria a Operações | Custo |
|---|---|---|
| `anew_contacts` (pessoas, com `position`) | escolher a pessoa de contacto no local de uma lista, em vez de a escrever | pequeno |
| `client_contract_*` | um contrato de manutenção gerar os planos preventivos dele | médio |
| `client_contract_signature_requests` | o cliente **assinar** a folha de obra no telemóvel do técnico, com valor legal | médio |
| ~~`scheduled_emails`~~ | ~~mandar o relatório ao cliente sozinho~~ — **feito** (31 ago), ao **confirmar** e não ao fechar; ver `db/relatorio-automatico.sql` | — |
| `product_stock`, `stocks` | saber se há material em armazém antes de o comprar | médio |
| `email_templates` | o texto do email do relatório editável, sem mexer em código | pequeno |

**A assinatura merece destaque.** Hoje o relatório tem uma linha para assinar a
caneta. O CRM já sabe recolher assinaturas com validade legal — e o técnico já
tem o telemóvel na mão. É a diferença entre um papel que se perde e uma prova.

---

## 6. Tirar trabalho de cima de quem está no terreno

Estas não vêm do CRM. Vêm de olhar para o que o técnico tem de fazer.

### a) Modo offline ⭐

**É a falha que mais depressa mata um piloto.**

Uma garagem −2 não tem rede. Hoje, o técnico responde a seis tarefas e não
grava nenhuma — a app avisa, e o valor fica no ecrã, mas se ele fechar a app,
perde tudo.

O que é preciso: guardar as respostas no telemóvel e sincronizar quando houver
rede. Não é pouco trabalho — é a coisa mais cara desta lista — mas é a que
separa uma app de escritório de uma app de terreno.

### b) Ordenar o dia por proximidade — **feito** (31 ago)

> A agenda, na vista de dia, mostra o dia de cada pessoa pela estrada: os
> quilómetros pela hora marcada, os quilómetros pela melhor ordem, e quantas
> visitas teriam de ser remarcadas para os poupar. Não reordena nada sozinho.
>
> Sem geocodificação e sem serviço pago: as coordenadas entram à mão em
> `ops_local` (ver `db/mapa.sql`), e a distância calcula-se com haversine.
>
> O texto abaixo é o levantamento original, e fica como registo.



Hoje as ordens do dia aparecem por hora. Se forem quatro em pontos diferentes
da cidade, o técnico decide o caminho de cabeça.

`resource_service_areas` já trabalha com prefixos de código postal, e
`ops_local` já guarda o código postal quando a morada vem do CRM. Dava para
agrupar o dia por zona sem geolocalização nenhuma.

**Para o fazer a sério** faltam coordenadas em `ops_local` — nem o CRM as tem
em `anew_addresses`. Seria preciso geocodificar.

### c) A foto tirada não devia precisar de legenda

Hoje a legenda escreve-se depois. Bem — mas quase ninguém escreve.

Uma ideia: transcrever uma nota de voz. O técnico carrega, fala cinco segundos,
e a legenda escreve-se sozinha. O bucket já aceita áudio.

### d) Ler o código do equipamento com a câmara

O Infraspeak usa etiquetas NFC nos ativos. Um QR code impresso é mais barato e
funciona em qualquer telemóvel: aponta-se ao extintor e abre a ordem daquele
equipamento.

`ops_ativo.codigo` já é único por organização — bastaria imprimir e ler.

### e) O passo que ninguém dá: iniciar a ordem

Uma ordem só se responde depois de "Iniciar". Quem chega ao local esquece-se, e
descobre quando tenta responder.

**Iniciar sozinha ao abrir a primeira tarefa** tira um passo e não perde nada:
a sessão de trabalho começa na mesma, e o tempo continua certo.

---

## 7. O que eu faria, e por que ordem

Assumindo que o piloto corre e a equipa fica a usar:

1. ~~**Notificações**~~ — **feito** (31 ago). No sino do CRM; ver `db/notificacoes.sql`
2. ~~**Iniciar a ordem sozinha**~~ — **feito** (31 ago). A primeira resposta inicia-a
3. ~~**Relatório do ativo**~~ — **feito** (31 ago). `/analises` › Equipamento
4. ~~**Agenda: férias e horários**~~ — **feito** (31 ago). Não foi preciso tabela de
   mapa nenhuma: `schedule_resources.user_id` já aponta para `anew_users.id`.
   O **ecrã de agenda por dia** também ficou feito, em `/agenda`
5. ~~**PMP cumprido**~~ — **feito** (31 ago). `/analises` › Manutenção preventiva
6. ~~**Assinatura do cliente no telemóvel**~~ — **feito** (31 ago). Com nome e
   qualidade. Não é assinatura qualificada, e o ecrã di-lo
7. ~~**Exportar medições**~~ — **feito** (31 ago). `/analises` › Exportar medições
8. **Offline** — quando o piloto disser quantas vezes falhou por falta de rede

E, em paralelo, o **formulário público mandado por WhatsApp** — como teste
barato da ideia do WhatsApp a sério.

---

## O que deixei de fora, e porquê

**Templates de relatório configuráveis** — máquina a mais, ver §3.

**Gerar ordens a partir de compras** — uma compra não sabe o cliente nem o
local; a ordem nasceria meio vazia. A ligação certa vai ao contrário: a compra
chega e desbloqueia uma ordem em pausa à espera de material.

**Stock e requisições** — a empresa não usa essas áreas no Infraspeak, e não
há sinal de que faça falta.

**Um construtor de dashboards** — antes de haver dados de uso a sério, seria
desenhar gráficos para números inventados.
