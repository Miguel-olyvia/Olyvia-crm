# O mapa do módulo

> Tudo o que existe, num sítio só. Serve para responder a três perguntas sem
> ter de abrir código: **o que é que este ecrã faz**, **onde é que isto está
> guardado**, e **quem é que pode fazer isto**.
>
> O [`README.md`](../README.md) explica como se instala e como está montado por
> dentro. Este ficheiro é o inventário.

---

## 1. Os ecrãs

Dez ecrãs. A coluna **Quem vê** é imposta na base de dados, não no ecrã.

| Rota | O que faz | Quem vê |
|---|---|---|
| `/` · **Hoje** | O que espera por mim e o que está a correr mal. Nada de filtros antes de mostrar. Ao abrir, quem coordena dispara a verificação de atrasos. | todos |
| `/ordens` · **Ordens** | A lista, com filtros por estado, origem e pessoa. | todos (só as suas, se técnico) |
| `/ordens/nova` · **Nova ordem** | Quatro campos obrigatórios; o resto atrás de um clique. | todos (técnico → fica `por_aprovar`) |
| `/ordens/:codigo` · **Ficha da ordem** | Onde o trabalho acontece: tarefas, medições, fotos, custos, despacho, histórico. | quem está na ordem, e quem coordena |
| `/ordens/:codigo/relatorio` · **Relatório** | O PDF para o cliente, pela impressão do browser. Sem custos, sem tarefas privadas. | quem coordena |
| `/locais` · **Locais** | A árvore de sítios e os equipamentos lá dentro. | todos |
| `/planos` · **Planos** | Os planos preventivos, com a regra em português e as próximas seis datas. | quem coordena |
| `/orcamentos` · **Orçamentos** | Os orçamentos aceites no CRM, prontos a virar obra. | quem coordena |
| `/analises` · **Análises** | Três separadores: PMP cumprido por cliente e por mês; ficha de um equipamento com a evolução das leituras; exportar leituras para folha de cálculo. | **admin, gestor, operador** |
| `/definicoes` · **Definições** | Equipa, locais, categorias, medições, checklists, códigos. | quem coordena |
| `/ajuda` · **Ajuda** | Três portas: porquê mudar (para quem decide), como funciona, como se usa. | todos |

**A entrada de Análises não aparece a um técnico.** Não é só permissão: no
telemóvel a navegação é uma barra fixa, e cada entrada a mais rouba largura às
outras.

---

## 2. As 27 tabelas

Todas com prefixo `ops_`, todas com RLS ligada, **zero chaves estrangeiras para
fora do módulo**. Há um teste que falha se alguém criar uma.

### Equipa e âmbito

| Tabela | O que guarda |
|---|---|
| `ops_utilizador_perfil` | função em Operações (`admin` · `gestor` · `operador` · `tecnico`), custo/hora, zona base |
| `ops_utilizador_cliente` | que clientes é que cada pessoa vê. Default restritivo |
| `ops_skill` · `ops_utilizador_skill` | especialidades, e quem as tem |
| `ops_horario` | horários-tipo, para os planos com janela |

### Hierarquia física

| Tabela | O que guarda |
|---|---|
| `ops_local` | **auto-referencial**: morada › edifício › piso › espaço, tantos níveis quantos fizerem falta |
| `ops_categoria_ativo` | tipos de equipamento (Extintor, AVAC, Elevador) |
| `ops_ativo` | os equipamentos, com marca, modelo, série, criticidade |

### Procedimento

| Tabela | O que guarda |
|---|---|
| `ops_checklist` · `ops_checklist_tarefa` | a lista de tarefas, **versionada**. Publicar congela |
| `ops_medicao_def` · `ops_medicao_opcao` | o que se lê, e as opções de escolha múltipla |
| `ops_checklist_tarefa_medicao` | que medições cada tarefa recolhe |

### Planeamento

| Tabela | O que guarda |
|---|---|
| `ops_plano` · `ops_plano_alvo` | a **regra** de recorrência (RRULE), não as ocorrências. Materializa 120 dias |

### O trabalho

| Tabela | O que guarda |
|---|---|
| `ops_ordem` | a ordem. `origem` ∈ preventiva · corretiva · obra. Sete estados |
| `ops_ordem_alvo` | a que equipamento/local/checklist a ordem se dirige |
| `ops_ordem_pessoa` | quem está na ordem, e com que papel |
| `ops_ordem_tarefa` | as tarefas, **copiadas** da checklist com a versão congelada |
| `ops_ordem_tarefa_medicao` | cada leitura, com os limites congelados no momento em que nasceu |
| `ops_sessao_trabalho` | quem começou, quando, quando parou. **É daqui que sai o custo real** |
| `ops_custo` · `ops_ordem_previsto` | o que se gastou, e o que estava orçamentado |
| `ops_anexo` | fotos e ficheiros. `privada` = não sai no relatório |
| `ops_mensagem` | conversa dentro da ordem |
| `ops_evento` | o histórico. Quem fez o quê, com o antes e o depois |
| `ops_sequencia` | de onde saem os códigos `OT-2026-00842` |

---

## 3. As vistas

Todas com **`security_invoker = true`**. Sem isso uma vista corre com os
privilégios de quem a criou e mostra os dados de todas as organizações a toda a
gente — sem dar erro, só com mais linhas.

| Vista | Para quê |
|---|---|
| `ops_v_cliente` | nome do cliente, resolvendo o join a `anew_entities` uma vez só |
| `ops_v_equipa` · `ops_v_pessoas` | a equipa **sem a coluna de custo/hora** — um técnico nunca a vê |
| `ops_v_morada_cliente` · `ops_v_contacto_cliente` | morada e contacto, vindos do CRM |
| `ops_v_orcamento` | orçamentos aceites, prontos a virar obra |
| `ops_v_catalogo` · `ops_v_compra_linha` | material do catálogo e de compras, para lançar custos |
| `ops_v_ordem_custo` · `ops_v_custo_por_item` | previsto contra gasto |
| `ops_v_ativo_intervencao` | todas as visitas a um equipamento |
| `ops_v_ativo_leitura` | todas as leituras feitas a um equipamento |
| `ops_v_pmp` | uma linha por ordem preventiva prevista, com `cumprida` · `a_horas` · `em_atraso` |
| `ops_v_leitura` | **todas** as leituras com o contexto numa linha, para exportar. Não exige equipamento — uma medição a um local conta na mesma |

---

## 4. As 20 operações de escrita

A aplicação **não faz `INSERT` nem `UPDATE` em tabela nenhuma**. Tudo passa por
uma destas.

### O trabalho

| Operação | O que muda | Fechadura |
|---|---|---|
| `rpc_ops_criar_ordem` | uma ordem nova, com alvo, tarefas e medições | o código sai de uma função só |
| `rpc_ops_atribuir_ordem` | responsável e equipa. **Avisa quem recebe** | — |
| `rpc_ops_agendar_ordem` | data e janela. **Avisa de choques, férias e feriados** | — |
| `rpc_ops_transitar_ordem` | o estado, a sessão de trabalho, o custo de mão de obra | `ops_ordem_guarda_estado` |
| `rpc_ops_responder_tarefa` | o estado de uma tarefa, e a corretiva que daí nasce | `ops_tarefa_guarda_estado` |
| `rpc_ops_responder_medicao` | uma leitura, o veredicto, e a tarefa que se acerta | `ops_medicao_guarda` |

### Custos e anexos

| Operação | O que muda |
|---|---|
| `rpc_ops_lancar_custo` · `rpc_ops_remover_custo` | material e serviços, do catálogo ou de uma compra |
| `rpc_ops_registar_anexo` · `rpc_ops_remover_anexo` | fotos e ficheiros, depois de subirem ao storage |
| `rpc_ops_obra_de_orcamento` | um orçamento aceite vira obra, com o previsto congelado |

### Configuração

| Operação | O que muda |
|---|---|
| `rpc_ops_criar_local` | um sítio novo, criado onde se precisa dele |
| `rpc_ops_gravar_perfil` | quem entra em Operações, e com que função |
| `rpc_ops_gravar_checklist` | checklists e tarefas. Publicar cria a versão seguinte |
| `rpc_ops_gravar_medicao` | medições e as suas opções |
| `rpc_ops_gravar_plano` | um plano preventivo |
| `rpc_ops_experimentar_regra` | as próximas seis datas de uma regra, **antes** de gravar |
| `rpc_ops_proximo_codigo` | o próximo código de uma sequência |

### Automáticas

| Operação | Quando corre |
|---|---|
| `rpc_ops_materializar_planos` | todos os dias, ou à mão. Cria as ordens dos próximos 120 dias |
| `rpc_ops_avisar_atrasos` | de hora a hora pelo `pg_cron`, e ao abrir o **Hoje** |

### As três fechaduras

`ops_ordem_guarda_estado`, `ops_tarefa_guarda_estado` e `ops_medicao_guarda`
recusam qualquer escrita que não venha da RPC certa. A RPC levanta uma bandeira
de transação antes de escrever; sem essa bandeira, o `UPDATE` é recusado —
mesmo vindo de quem falasse diretamente com o servidor.

---

## 5. Os avisos

Escritos em `public.notifications`, a tabela do CRM. **É a única escrita do
módulo fora de `ops_*`**, e é só `INSERT`.

| Quando | Quem recebe | Tipo |
|---|---|---|
| Uma ordem passa a ser tua | quem a recebe | `operacoes_ordem_atribuida` |
| Uma não conformidade gerou trabalho | quem coordena | `operacoes_corretiva_gerada` |
| Passou da hora e não começou | o responsável, ou quem coordena | `operacoes_ordem_atrasada` |
| A pausa expirou | o responsável **e** quem coordena | `operacoes_pausa_expirada` |
| Um plano falhou a gerar ordens | quem coordena | `operacoes_plano_falhou` |

**Três coisas que se descobriram a ler o CRM, e que matavam isto em silêncio:**

1. `kind` tem de ser `'notification'`. O default da coluna é `'alert'`, e o sino
   filtra pelo primeiro — com o default a linha entra, não dá erro, e nunca
   aparece a ninguém.
2. `user_id` é o id de **autenticação**, não de `anew_users`.
3. `cleanup_duplicate_notifications()` do CRM resolve duplicados por
   `(type, entity_id, user_id)`. Com `entity_id` nulo, os avisos do mesmo tipo
   matavam-se uns aos outros.

Um aviso nunca desfaz o trabalho que o gerou: `ops_notificar()` apanha qualquer
erro e devolve `false`. Há um teste que esconde a tabela e verifica que atribuir
uma ordem continua a funcionar.

---

## 6. O que vem do CRM

Tudo **só leitura**, exceto as duas exceções da linha de baixo.

| O que vem de lá | Tabelas | Para quê |
|---|---|---|
| Clientes, moradas e contactos | `anew_clients` · `anew_entities` · `anew_addresses` · `anew_entity_addresses` · `anew_entity_phones` · `anew_entity_emails` | abrir uma ordem sem escrever a morada à mão |
| Pessoas e permissões | `anew_users` · `anew_memberships` · `anew_roles` · `anew_role_permissions` · `anew_permissions` · `anew_organizations` | quem entra, e o que cada um pode fazer |
| Orçamentos aceites | `quotes` · `quote_lines` | um clique transforma-o em obra, com o previsto congelado |
| Catálogo de material | `catalog_items` | lançar custos sem inventar preços |
| Compras a fornecedores | `purchase_orders` · `purchase_order_items` | o material que se comprou para aquela obra |
| Férias, horários, feriados | `schedule_resources` · `resource_time_off` · `resource_availability_rules` · `schedule_holidays` | avisar antes de marcar uma visita a quem não está |
| **Notificações** | `notifications` | **ESCREVE** — uma linha por aviso, só `INSERT` |
| **Ficheiros** | `storage` | **ESCREVE** — num balde próprio, `operacoes` |

E também três funções de autorização do CRM, reutilizadas em vez de
reimplementadas: `get_user_visible_org_ids()`, `has_anew_permission()`,
`is_system_admin_user()` e `current_business_user_id()`.

---

## 6b. A agenda do CRM

Só leitura, quatro tabelas: `schedule_resources`, `resource_time_off`,
`resource_availability_rules`, `schedule_holidays`.

**Não foi preciso tabela de mapa nenhuma.** `schedule_resources.user_id` já
aponta para `anew_users.id`, que é o mesmo id que Operações usa.

⚠ **Privacidade.** `resource_time_off` guarda `title`, `reason` e `notes`. Uma
ausência pode ser uma baixa médica, e quem marca uma visita não tem que saber
porquê. Daqui **só saem datas** — nenhuma dessas três colunas é lida, e há um
teste que falha se alguma palavra do motivo aparecer na resposta.

Duas decisões que evitam avisos falsos:

- só ausências **aprovadas** impedem. Um pedido por aprovar ainda pode ser
  recusado;
- quem **não tem horário declarado** não gera aviso nenhum. O silêncio quer
  dizer "não sabemos", não "não trabalha".

Nenhum destes avisos impede a marcação. Quem coordena é que decide.

---

## 7. Os 15 validadores

Correm SQL contra um Postgres a sério (PGlite, sem Docker). `npm run validar-*`.

| Validador | O que prova |
|---|---|
| `validar-schema` | 27 tabelas, RLS em todas, zero FK para fora |
| `validar-instalacao` | a sequência inteira corre de ponta a ponta — **e cada ficheiro volta a correr sozinho numa base já completa** |
| `validar-rpcs` | a máquina de estados, e que o trigger recusa o caminho direto |
| `validar-planos` | RRULE, incluindo `1MO` e `-1FR` |
| `validar-medicoes` | o veredicto sai dos limites; a corretiva nasce uma vez só; o contador não desce; a ordem inicia-se sozinha |
| `validar-despacho` | criar, atribuir, agendar, e o aviso de choque |
| `validar-agenda` | férias, horários, feriados — e que o motivo da ausência não sai |
| `validar-notificacoes` | o aviso chega ao sino certo, uma vez, e nunca trava o trabalho |
| `validar-analises` | os números do PMP, e que uma vista não fura a RLS |
| `validar-orcamentos` | do orçamento aceite à obra, com o previsto congelado |
| `validar-anexos` | o caminho do ficheiro tem de bater certo |
| `validar-config` | checklists versionadas, medições, equipa |
| `validar-custos` | material e serviços, e que o técnico não vê custo/hora |
| `validar-cliente-crm` | morada e contacto, sem escrever no CRM |
| `validar-restricao` | as permissões que ficaram fechadas |

Mais **147 testes de domínio** (`npm test`), sobre funções puras — sem base de
dados, a correr em pouco mais de um segundo.

---

## 8. A ordem de instalação

Importa. Cada ficheiro é re-executável sozinho numa base já completa — isso é
testado, e foi a razão de um deploy falhado.

```
schema.sql → permissoes.sql → notificacoes.sql → rpcs.sql → rpcs-tarefas.sql
  → planos.sql → correcoes-modelo.sql → medicoes.sql → agenda.sql
  → despacho.sql → orcamentos.sql → anexos.sql → planos-crud.sql
  → config.sql → custos.sql → analises.sql → cliente-crm.sql
  → pos-instalacao.sql
```

`notificacoes.sql` e `agenda.sql` vêm antes de quem os chama, mas a chamada está
atrás de um `to_regprocedure`: sem eles o módulo funciona na mesma, só sem
avisos.

---

## 9. Onde está o resto

| | |
|---|---|
| [`../README.md`](../README.md) | instalação, comandos, a autorização em três camadas |
| [`onde-estamos.md`](onde-estamos.md) | o estado, e o que custou a descobrir |
| [`a-seguir.md`](a-seguir.md) | o que vem a seguir, com custo e evidência |
| [`deploy-falhado.md`](deploy-falhado.md) | o deploy que falhou, e porquê |
| [`portal-do-cliente.md`](portal-do-cliente.md) | o cliente a pedir assistência sozinho |
| `/ajuda` na app | o mesmo, para quem decide e para quem usa — com fluxogramas |
