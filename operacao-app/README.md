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
npm run supabase:aplicar     # cria as 19 tabelas ops_*, RLS e vistas
npm run supabase:permissoes  # as 15 permissões no catálogo do CRM
```

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

| Ficheiro | O que faz |
|---|---|
| `db/schema.sql` | tabelas, RLS, as duas vistas — **nada fora de `ops_*`** |
| `db/permissoes.sql` | as 15 permissões no catálogo do CRM |
| `db/pos-instalacao.sql` | permissões do papel + perfil do utilizador |
| `db/demo.sql` | dados de demonstração, só em `ops_*` |
| `db/demo-remover.sql` | desfaz a demo |

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
tools/validar-schema   corre o esquema contra Postgres, sem Docker
src/domain/            regras puras — 62 testes, sem infraestrutura
src/lib/supabase.ts    cliente próprio, storage key própria
src/lib/dados.ts       leituras; nunca engole um erro
src/auth/              sessão + resolução do utilizador Olyvia
src/components/        layout, primitivos de UI, ícones
src/pages/             Hoje · Ordens · Ficha de ordem · Locais e ativos
```

O **domínio** não sabe que existe base de dados. A máquina de estados recebe um estado e
um contexto e devolve uma decisão, por isso testa-se sem servidor nenhum — é a razão de
haver 62 testes a correr em pouco mais de um segundo.

---

## Comandos

```bash
npm run dev                     # servidor de desenvolvimento (porta 5274)
npm run test                    # 62 testes de domínio
npm run typecheck               # tsc --noEmit
npm run build                   # typecheck + build de produção

npm run validar-schema          # o esquema contra um Postgres limpo
npm run validar-instalacao      # a sequência de instalação toda, ponta a ponta

npm run supabase:verificar      # o esquema contra a tua base, com ROLLBACK
npm run supabase:aplicar        # aplica db/schema.sql
npm run supabase:permissoes     # aplica db/permissoes.sql
npm run supabase:pos-instalacao # permissões e perfil
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

## O que falta antes de abrir isto a alguém

**As transições de estado ainda são escritas pelo cliente.** O domínio valida-as e a RLS
garante que só quem tem `operations.orders.*` e está no âmbito lá chega — mas nada
garante, na base de dados, que a transição respeitou a máquina de estados. Quem tiver o
token consegue pôr uma ordem em qualquer estado.

Isso resolve-se com RPCs `SECURITY DEFINER` que imponham `avaliar()` do lado do servidor,
e é o passo seguinte. Até lá, **o módulo não deve ser aberto a utilizadores finais**.

### Fora do v1, por decisão

Identificados no levantamento, nenhum necessário para fechar o ciclo:

- agendamentos múltiplos por ordem (`RETIFICAÇÃO MEDIDAS`, `INÍCIO OBRA`)
- planos preventivos a gerar ordens (a tabela e a RRULE existem; falta o job)
- SLA por cliente × área × prioridade
- áreas, tipos e prioridades como tabelas de configuração — hoje são colunas
- medições com histórico e gráfico na ficha de ativo
- regras de notificação, portal do cliente, relatório em PDF
- ponte com a agenda do CRM (`schedule_items`) e com o Inventário
