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

## Arranque

```bash
cd operacao-app
npm install
cp .env.example .env    # preencher com o projeto Supabase da Olyvia
npm run dev             # http://localhost:5274
```

Login com uma conta Olyvia. É preciso ter, nessa organização:

1. a permissão `operations.view` atribuída ao teu papel, na UI de Papéis do CRM;
2. uma linha em `ops_utilizador_perfil` com a tua função no módulo.

Sem (1) não vês nada; sem (2) a app diz-te exatamente isso em vez de mostrar um ecrã
vazio.

---

## Base de dados

O esquema está em [`db/schema.sql`](./db/schema.sql) — 19 tabelas `ops_*`, aditivo e
idempotente. Aplica-se **uma vez**:

**Supabase Studio** → SQL Editor → colar → Run
ou `psql "$DATABASE_URL" -f db/schema.sql`

Antes de aplicar, verifica sem tocar na base real e sem Docker:

```bash
npm run validar-schema
```

Corre o esquema contra um Postgres verdadeiro (PGlite, em WASM) com stubs do núcleo do
CRM, e confirma as contagens, a RLS, e o comportamento.

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
npm run dev              # servidor de desenvolvimento
npm run test             # 62 testes de domínio
npm run typecheck        # tsc --noEmit
npm run build            # typecheck + build de produção
npm run validar-schema   # valida db/schema.sql contra Postgres
```

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
