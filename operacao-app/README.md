# Operações — app separada

Aplicação **independente** do sistema Olyvia, no mesmo molde do [`duc-app`](../duc-app).
Partilha o **mesmo backend Supabase** (mesma base de dados, mesmos utilizadores, mesmos
clientes), mas **não altera nada** do que já existe — nem no código do CRM, nem no
esquema da base de dados.

Servida em `olyvia-ai.com/operacao`.

---

## O que substitui

O Infraspeak, usado hoje pelo Grupo BMLar. Não por falta de funcionalidades — por
excesso de conceitos. O levantamento da instância de produção está em
`~/Downloads/olyvia/docs/infraspeak/` e é a fonte de cada decisão deste módulo.

Os quatro achados que mais moldaram o desenho:

| No Infraspeak | Aqui |
|---|---|
| **Ocorrência** e **Pedido**: o mesmo objeto em dois ecrãs, com dois conjuntos de estados e dois catálogos de motivos de pausa. A rota de "Pedidos" é `/failures`. | Uma tabela `ops_ordem` com `origem`, uma lista, uma ficha, uma máquina de estados. |
| O cronómetro corre do início ao fecho, noites incluídas — vi `5303:05:34` numa ordem. O custo de mão de obra dá **0,00 €** em todas as ordens. | `ops_sessao_trabalho`: alguém começou, alguém parou. O custo sai daí. |
| Contactos e combinações com o cliente em texto livre no campo "Observações", com dados pessoais à mistura e sem forma de filtrar. | `contacto_nome`, `contacto_telefone`, `janela_inicio`, `janela_fim` — campos próprios. |
| Um plano chamado `PMP CORRETIVA`: os utilizadores contornam o modelo porque a separação rígida preventiva/corretiva não corresponde à operação real. | Três origens na mesma ordem, sem ecrãs separados. |

---

## Instalação, do zero ao ecrã com dados

### 1. Dependências e ambiente

```bash
cd operacao-app
npm install
cp .env.example .env
```

Preenche o `.env`. São dois grupos de variáveis, com propósitos diferentes:

| Variável | Onde a obter | Para quê |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → **API** | a app, no browser |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | idem | a app, no browser |
| `DATABASE_URL` | Supabase → Project Settings → **Database** → Connection string → URI | **só** os scripts de instalação |

> `DATABASE_URL` contém a password da base de dados. Não tem prefixo `VITE_`, por isso
> nunca chega ao browser, e o `.env` está no `.gitignore`. Se a tua rede bloquear IPv6,
> usa a connection string do **Session pooler** em vez da Direct connection.

### 2. Ensaiar antes de aplicar

```bash
npm run validar-instalacao   # a sequência toda contra um Postgres limpo, sem Docker
npm run supabase:verificar   # o esquema contra a TUA base, dentro de uma transação revertida
```

O primeiro corre `schema → pós-instalação → demo → remoção da demo` contra uma PGlite
com stubs do CRM, e verifica o resultado de cada passo. O segundo liga-se mesmo ao teu
Supabase, corre o esquema e faz `ROLLBACK` — confirma que corre na tua base sem gravar
nada.

### 3. Aplicar

```bash
npm run supabase:aplicar        # 19 tabelas ops_*, RLS e as duas vistas
npm run supabase:rpcs           # a máquina de estados, e a fechadura
npm run supabase:rpcs-tarefas   # responder a tarefas + a corretiva automática
npm run supabase:planos         # RRULE e a janela de 120 dias
npm run supabase:permissoes     # as 15 permissões no catálogo do CRM
```

Por esta ordem: cada ficheiro verifica se o anterior correu, e pára com uma mensagem
legível se não.

Tudo dentro de uma transação: ou entra o ficheiro inteiro, ou não entra nada.

São dois comandos e não um de propósito. O `schema.sql` **não escreve uma única
linha fora de `ops_*`** — podes correr só esse e o CRM fica byte a byte como
estava. O `permissoes.sql` é o único ficheiro do módulo que acrescenta algo a
uma tabela do CRM (15 linhas em `anew_permissions`), e serve para as permissões
aparecerem na UI de Papéis em vez de terem de ser atribuídas à mão por SQL.

### 4. Dar acesso a alguém

Edita o bloco `CONFIGURAÇÃO` no topo de [`db/pos-instalacao.sql`](./db/pos-instalacao.sql)
— o teu email e o nome do papel que recebe as permissões — e corre:

```bash
npm run supabase:pos-instalacao
```

Atribui as 15 permissões `operations.*` ao papel e cria o teu perfil no módulo. Se
preferires atribuir as permissões pela UI de Papéis do CRM, deixa `papel` a `NULL` que o
ficheiro salta essa parte.

### 5. Correr

```bash
npm run dev                  # http://localhost:5274
```

Login com a tua conta Olyvia — as mesmas credenciais.

### 6. Opcional: dados para ver alguma coisa

```bash
npm run supabase:demo            # 5 locais, 2 ativos, 5 ordens, 2h47m de trabalho
npm run supabase:demo-remover    # tira tudo o que a linha de cima pôs
```

A demo escreve **exclusivamente** em tabelas `ops_*` e usa um cliente que já existe — não
cria clientes nem utilizadores. Tudo leva prefixo `DEMO-`, por isso sai com um comando.

As cinco ordens foram escolhidas para que cada ecrã tenha o que mostrar: uma em curso e
atrasada, uma por aprovar, uma fechada à espera de confirmação, uma pausada com a retoma
já ultrapassada, e a corretiva que nasceu de uma tarefa não conforme.

---

## Base de dados

O esquema está em [`db/schema.sql`](./db/schema.sql) — 19 tabelas `ops_*`, aditivo e
idempotente. Correr duas vezes não estraga nada, e isso é verificado.

| Ficheiro | O que faz | Escreve fora de `ops_*`? |
|---|---|---|
| `db/schema.sql` | 19 tabelas, RLS, as duas vistas | **não** |
| `db/rpcs.sql` | a máquina de estados, e o trigger que a torna obrigatória | **não** |
| `db/rpcs-tarefas.sql` | responder a tarefas, e a corretiva que daí nasce | **não** |
| `db/planos.sql` | RRULE e a janela de 120 dias | **não** |
| `db/correcoes-modelo.sql` | As 5 correções vindas do Infraspeak real: especialidades, horários, medições, natureza da tarefa, recorrência dinâmica | **não** |
| `db/medicoes.sql` | Responder a medições: o veredicto sai dos limites, e a tarefa acerta-se sozinha | **não** |
| `db/despacho.sql` | Criar, atribuir e agendar — o caso do telefone a tocar | **não** |
| `db/orcamentos.sql` | Do orçamento aceite à obra, e o previsto contra o gasto | **não** (só lê `quotes`) |
| `db/anexos.sql` | Fotos e ficheiros | **sim** — cria o bucket `operacoes` em `storage` |
| `db/permissoes.sql` | as 15 permissões no catálogo | sim — `anew_permissions` |
| `db/pos-instalacao.sql` | permissões do papel + perfil | sim — `anew_role_permissions` |
| `db/criar-utilizador.sql` | perfil de CRM para uma conta de autenticação | sim — 3 tabelas |
| `db/copiar-acessos.sql` | replica as organizações de outra pessoa | sim — `anew_memberships` |
| `db/restringir-permissoes.sql` | estreita um alargamento acidental | sim — `anew_role_permissions` |
| `db/demo.sql` · `demo-remover.sql` | dados de demonstração | não |
| `db/diagnostico-*.sql` · `verificar-acesso.sql` | só leem | não |

A coluna da direita é a que interessa quando alguém pergunta se isto mexe no CRM. Os
**quatro ficheiros que constroem o módulo** não escrevem uma linha fora de `ops_*`, e há
um teste que falha se isso mudar.

### A garantia que este esquema dá

`FK para fora do módulo: 0`. Nenhuma tabela `ops_*` tem foreign key para uma tabela do
CRM, e a verificação falha se alguém acrescentar uma.

Isto não é desleixo. `public.purge_entity_facet()` faz `DELETE FROM public.anew_clients`
— um hard delete já em produção. Com uma foreign key normal, essa função passaria a
rebentar sempre que o cliente tivesse dados de Operações: uma área que funciona hoje
deixava de funcionar. Com `ON DELETE CASCADE` seria pior — apagava ordens de trabalho em
silêncio. O validador testa exatamente isto:

```
✓ apagar um cliente do CRM com dados de Operações a apontar-lhe
✓ a ordem sobrevive ao apagamento do cliente
```

### As duas vistas, e porque têm `security_invoker`

`ops_v_cliente` existe porque `anew_clients` **não tem coluna de nome** — o nome vive em
`anew_entities.display_name`. Sem a vista, cada ecrã repetia esse join e mais cedo ou
mais tarde um deles esquecia-se do `deleted_at`.

`ops_v_equipa` existe porque uma policy filtra **linhas, não colunas**: é a vista, sem
`custo_hora`, que faz valer a regra de o técnico nunca ver custo/hora.

Ambas declaram `WITH (security_invoker = true)`. Sem isso, uma vista corre com os
privilégios de quem a criou e ignoraria a RLS que o CRM já tem em `anew_clients` e
`anew_users`.

---

## Estrutura

```
db/schema.sql          19 tabelas ops_*, RLS, permissões, as duas vistas
db/correcoes-modelo    +7 tabelas: especialidades, horários, medições
db/medicoes.sql        responder a leituras, com o veredicto na base
tools/validar-*        6 validadores contra Postgres real, sem Docker
src/domain/            regras puras — 93 testes, sem infraestrutura
src/lib/supabase.ts    cliente próprio, storage key própria
src/lib/dados.ts       leituras + as 3 RPCs de escrita; nunca engole um erro
src/auth/              sessão + resolução do utilizador Olyvia
src/components/        layout, primitivos de UI, ícones, PainelTarefas
src/pages/             Hoje · Ordens · Ficha de ordem · Locais e ativos
```

O **domínio** não sabe que existe base de dados. A máquina de estados recebe um estado e
um contexto e devolve uma decisão, por isso testa-se sem servidor nenhum — é a razão de
haver 93 testes a correr em pouco mais de um segundo.

### As três escritas, e só três

A app não faz `INSERT` nem `UPDATE` em tabela nenhuma. Tudo o que muda estado passa por
uma destas RPCs, e cada uma tem um trigger do outro lado que recusa o caminho direto:

| RPC | O que muda | Fechadura |
|---|---|---|
| `rpc_ops_transitar_ordem` | o estado da ordem, a sessão de trabalho, o custo | `ops_ordem_guarda_estado` |
| `rpc_ops_responder_tarefa` | o estado de uma tarefa, e a corretiva que daí nasce | `ops_tarefa_guarda_estado` |
| `rpc_ops_responder_medicao` | uma leitura, o seu veredicto, e a tarefa que se acerta | `ops_medicao_guarda` |
| `rpc_ops_criar_ordem` | uma ordem nova, com alvo, tarefas e medições | o código sai de uma função só |
| `rpc_ops_atribuir_ordem` | quem é responsável e quem mais vai | — |
| `rpc_ops_agendar_ordem` | data, janela, e o aviso de choque | — |

O browser calcula as mesmas regras — que botões mostrar, que veredicto um valor vai ter —
mas só para responder de imediato. Quando os dois discordarem, quem manda é a base.

As três primeiras têm trigger porque o que escrevem é um **veredicto**: um estado forjado
por fora nunca mais se distingue de um verdadeiro. As três últimas não têm, e é de
propósito — uma atribuição ou uma data erradas veem-se na lista e corrigem-se num clique.
Trancar tudo por simetria só acrescentaria atrito onde não há nada a proteger.

---

## Comandos

```bash
npm run dev                     # servidor de desenvolvimento (porta 5274)
npm run test                    # 62 testes de domínio
npm run typecheck               # tsc --noEmit
npm run build                   # typecheck + build de produção

npm run validar-schema          # o esquema contra um Postgres limpo
npm run validar-instalacao      # a sequência de instalação toda, ponta a ponta
npm run validar-rpcs            # a máquina de estados é MESMO imposta na base?
npm run validar-planos          # a RRULE e a janela de 120 dias
npm run validar-restricao       # restringir permissões não corta quem o corre

npm run supabase:verificar      # o esquema contra a tua base, com ROLLBACK
npm run supabase:aplicar        # db/schema.sql
npm run supabase:rpcs           # db/rpcs.sql
npm run supabase:rpcs-tarefas   # db/rpcs-tarefas.sql
npm run supabase:planos         # db/planos.sql
npm run supabase:correcoes      # db/correcoes-modelo.sql (depois de planos)
npm run supabase:medicoes       # db/medicoes.sql (depois das correcoes)
npm run supabase:despacho       # db/despacho.sql
npm run supabase:orcamentos     # db/orcamentos.sql
npm run supabase:anexos         # db/anexos.sql (por último)
npm run supabase:permissoes     # db/permissoes.sql
npm run supabase:pos-instalacao # permissões do papel e perfil
npm run supabase:restringir     # estreita permissões alargadas por engano
npm run supabase:demo           # dados de demonstração
npm run supabase:demo-remover   # remove-os
```

Os `validar-*` correm sem Docker, sem Supabase e sem rede. Os `supabase:*` precisam de
`DATABASE_URL` no `.env` e mostram sempre a que base se vão ligar antes de escrever.

### Nota sobre a versão do rollup

`overrides.rollup` está fixo em `4.62.2`, a mesma versão que o CRM usa. Não é
arbitrário: as versões mais recentes trazem um binário nativo que o Controlo de
Aplicações do Windows bloqueia em máquinas com essa política ligada, e o `vitest` deixa
de arrancar com `ERR_DLOPEN_FAILED`. Alinhar com o CRM resolve e mantém uma só versão da
ferramenta de build no repositório.

---

## Como a autorização está montada

Três camadas, cada uma a responder a uma pergunta diferente:

| Camada | Responde a | Onde |
|---|---|---|
| **Permissões** | tens direito a isto? | `has_anew_permission()`, do CRM |
| **RLS** | podes ver esta linha? | policies em cada tabela `ops_*` |
| **RPCs + triggers** | podes fazer-lhe **isto**? | `rpc_ops_*` e as guardas |

A terceira é a que costuma faltar, e é a que mais importa: a RLS limita QUEM chega à
linha, nunca O QUE lhe pode fazer. Sem ela, um `UPDATE` direto punha uma ordem em
qualquer estado, saltando as guardas, as sessões de trabalho e o histórico.

- o estado de uma **ordem** só muda por `rpc_ops_transitar_ordem()`
- o estado de uma **tarefa** só muda por `rpc_ops_responder_tarefa()`
- editar título, descrição ou responsável por `UPDATE` direto continua a funcionar —
  não é o estado, não precisa de cerimónia

As guardas existem em dois sítios de propósito: em TypeScript, para desenhar os botões
certos e responder de imediato; em `plpgsql`, porque é essa que manda. Se divergirem,
vale a da base.

### O ciclo que se fecha sozinho

Marcar uma tarefa como não conforme cria a ordem corretiva, herda o cliente, o local, o
ativo e o que o técnico escreveu, e deixa as duas ligadas por `gerada_por_tarefa_id`.

No Infraspeak isso não acontece: o histórico dos ativos está cheio de relatos de portões
avariados e geradores que não arrancam, escritos pelos técnicos, que nunca viraram ordem
nenhuma. A informação existia; faltava o mecanismo.

Uma medição fora dos limites é não conformidade **sem ninguém decidir**, e a descrição da
ordem nova diz o valor lido e o limite violado — porque "não conforme" sozinho não chega
para alguém agir.

Uma leitura gera trabalho **uma vez**. A pergunta que a base faz não é "já estava mal?",
é "já saiu uma ordem daqui?" — guardada em `corretiva_ordem_id`. Sem isso, corrigir um
engano de dedo abria uma segunda ordem, e piorar de "ilegível" para "não conforme" não
abria nenhuma.

### O ecrã onde o trabalho acontece

`PainelTarefas` é onde o técnico passa 90% do tempo, com o telemóvel numa mão e o
equipamento na outra. Três decisões que vêm daí:

- **Uma resposta, um toque.** Escolher "Conforme" grava. Não há escolher-e-depois-gravar,
  que é um passo que ninguém dá em pé.
- **O veredicto aparece antes de gravar.** Escrever 8 numa gama de 10–15 mostra logo "vai
  ficar não conforme". No Infraspeak só se sabe depois, e quem se enganou já gerou uma
  ordem que ninguém pediu. Uma opção que abre corretiva diz isso no próprio botão.
- **A corretiva aparece com link, ali.** É o instante em que essa informação vale alguma
  coisa; no relatório de amanhã já não vale.

Uma tarefa com medições responde-se pelas medições e acerta-se sozinha quando a última
entra — ninguém diz duas vezes a mesma coisa. Uma tarefa sem medições responde-se à mão.
Quando não se pode responder, o ecrã diz **o passo em falta** ("Inicia a ordem para
começares a responder"), não só que não se pode.

### Os planos guardam a regra, não as ocorrências

O Infraspeak materializa ocorrências até 2033: milhares de linhas futuras a afogar o que
é para esta semana. Aqui guarda-se a RRULE e materializa-se uma janela de 120 dias.

`rpc_ops_materializar_planos()` é idempotente — correr dez vezes gera o mesmo que correr
uma. Deve correr **uma vez por dia**. Um plano com regra inválida é ignorado com aviso na
resposta, e não impede os outros de gerar.

O expansor cobre `DAILY`, `WEEKLY`, `MONTHLY` e `YEARLY` com `INTERVAL`, `BYDAY`,
`BYMONTHDAY`, `COUNT` e `UNTIL`. Uma regra fora disso é **recusada em voz alta** em vez de
interpretada mal — que é o modo de falhar que mais custa a detetar. Dia 31 num mês de 30
salta, em vez de escorregar para o mês seguinte.

---

## Fora do v1, por decisão

Identificados no levantamento, nenhum necessário para fechar o ciclo:

- os ecrãs de Planos, Agenda, Análises e Definições — o modelo suporta-os, falta a
  interface
- agendamentos múltiplos por ordem (`RETIFICAÇÃO MEDIDAS`, `INÍCIO OBRA`)
- SLA por cliente × área × prioridade
- áreas, tipos e prioridades como tabelas de configuração — hoje são colunas
- histórico e gráfico das medições na ficha de ativo (as leituras já ficam gravadas)
- regras de notificação, portal do cliente, relatório em PDF
- ponte com a agenda do CRM (`schedule_items`) e com o Inventário
