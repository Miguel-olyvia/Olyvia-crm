# Obras — fases, tarefas, Gantt, tempos e validação

Módulo novo de Operações, pedido na reunião de 01/10/2026. Está construído por
cima do `operacao-app` e não toca no módulo de ordens: tem tabelas próprias,
`ops_obra*`.

## Como funciona

```
Orçamento aceite ─┐
Contrato assinado ├─► Nova obra (+ modelo) ─► 4 fases ─► tarefas com tempo previsto
Em branco ────────┘                               │
                                                  ▼
             Gestor: Gantt (arrastar datas, atribuir pessoas, ver choques)
                                                  │
             Executor (telemóvel): Iniciar ─► relógio ─► Terminar
                       alerta aos 80 % / 100 % · acima de previsto + tolerância → justificação obrigatória
                                                  │
             Supervisor: fila "Validar" ─► validar | rejeitar com motivo (volta à equipa)
                                                  │
             Previsto vs real (tempo; custo só para quem tem costs.view) · Métricas · Extras
```

- **Fases.** Uma obra tem 4 fases: 1 "Preparação e demolições", 2 "Instalações
  técnicas", 3 "Acabamentos" e 4 "Limpeza e entrega". **As fases 3 e 4 não foram
  nomeadas na reunião.** Estes nomes são um default e podem ser editados por obra e
  por modelo. Ficam **a confirmar**.
- **Tarefas a partir do contrato/orçamento.** Sem modelo escolhido, cada linha
  do orçamento que seja um **serviço** vira uma tarefa (produtos ficam de fora):
  - minutos previstos = qt × horas × pessoas da ficha técnica do serviço (a
    mesma conta do custo de mão de obra no CRM). Sem horas na ficha → 60 min,
    marcada "sem ficha" na pré-visualização;
  - procedimento = "descrição da mão de obra"; materiais = materiais da ficha × qt;
  - fase por palavras-chave na categoria/nome/secção (demolição → 1,
    instalações → 2, limpeza/entrega → 4, resto → 3). É um ponto de partida.
  - A tarefa guarda `orcamento_linha_id` e `servico_id`. O ecrã "Nova obra"
    mostra a lista antes de criar (`rpc_ops_obra_previsao_orcamento`).
  - Com modelo escolhido, as tarefas vêm do modelo, como antes.
- **Modelos (Obras → Modelos).**
  - *Serviços*: cada serviço do catálogo do CRM tem os seus passos
    (`ops_obra_servico_tarefa`): fase, min/unidade + min fixos (pessoa ×
    tempo), pessoas, especialidade, "depois de" (dentro do serviço),
    procedimento/materiais/ferramentas. Na obra, cada linha vendida expande-se
    nos passos do seu serviço (tempo × quantidade), com as dependências.
    Serviço sem modelo → 1 tarefa pela ficha técnica.
  - "Gerar sugestões" (`rpc_ops_servico_modelo_sugerir`) preenche os serviços
    sem modelo a partir de uma biblioteca de famílias (demolições,
    canalização, eletricidade, AVAC, pladur, revestimentos, pintura,
    carpintaria, limpeza, genérico) e da ficha técnica (horas × pessoas por
    unidade; sem ficha, minutos por unidade da biblioteca). **Valores
    razoáveis, não medidos** — as métricas dizem depois o que corrigir.
    Refazer nunca apaga um modelo gravado à mão.
  - *Tipos de obra*: as tarefas que existem sempre. "Obra geral" (por defeito):
    reunião de arranque, proteção, limpeza final, vistoria e entrega.
  - Gerem: gestor/admin de Operações **ou** quem tem `services.edit` no CRM
    (comercial), nessa organização.
- **Planeamento automático (ao criar a obra).**
  - **Em paralelo dentro da fase**: as fases vêm em sequência; dentro da fase,
    cada tarefa começa assim que a de que depende acabou e há vagas (tantas
    quantos os técnicos/operadores ativos, de 1 a 4).
  - **Especialidade**: as tarefas que pedem uma vão primeiro a quem a tem
    (Definições → Equipa: especialidades e zona base).
  - Pessoas por tarefa = "número de pessoas" da ficha (`pessoas_previstas`). No
    calendário, a tarefa dura minutos ÷ pessoas.
  - **Supervisor**: se não for escolhido, o supervisor (senão o gestor) ativo
    com menos obras abertas.
  - **Equipa**: cada tarefa recebe logo as suas pessoas, entre técnicos e
    operadores (se não houver, entre toda a gente ativa). Preferência: sem
    choque com outras obras nesses dias → `zona_base` na morada da obra → já
    está nesta obra → menos carga aberta. Botão "Distribuir equipa" na obra
    refaz isto nas tarefas que ninguém começou (`rpc_ops_obra_distribuir`).
  - **Morada**: a do orçamento; senão a morada de obra do orçamento
    (`site_address_id`); senão a morada atual do cliente (a principal). O
    formulário vem preenchido (`rpc_ops_obra_morada_sugerida`).
- **A duração da fase é a soma das tarefas.** A barra da fase vai do primeiro
  início ao último fim das suas tarefas.
- **Planeamento inicial.** As tarefas são espalhadas uma a seguir à outra, a 480
  min por dia útil (seg–sex), a partir da data de início. O gestor ajusta depois no
  Gantt: arrasta a barra para mover e usa a pega à direita para esticar. "Replanear
  datas" volta a gerar este plano de partida.
- **Precedência simples.** Uma tarefa pode ter `depende_de`. Não se consegue
  iniciar enquanto a tarefa de que depende não estiver feita (por exemplo, não se
  regulariza antes do ensaio de pressão).
- **Tempo real por pessoa.** Cada "Iniciar" abre um registo para quem carregou no
  botão.
  - "Pausar" fecha só o registo dessa pessoa.
  - "Terminar" dá a tarefa por feita e fecha os registos de toda a gente na tarefa.
  - O real conta pessoa × tempo: duas pessoas durante 1 h dão 2 h de mão de obra.
  - Uma pessoa só pode ter um relógio a correr de cada vez.
- **Alertas.** O aviso aparece a ≥ 80 % do previsto e o estado "excedido" acima de
  100 %. Os limiares são os mesmos no ecrã (`nivelDeAlerta`) e na vista
  `ops_v_obra_alerta`.
- **Justificação obrigatória.** Se o real passar `previsto × (1 + tolerância)`
  (10 % por defeito, configurável por obra), a base recusa "Terminar" sem um motivo
  da lista:
  - secagem
  - condições do edifício
  - material em falta
  - trabalho imprevisto
  - acesso/cliente
  - outro

  "Outro" exige também uma nota. Dentro da tolerância, terminar é um toque.
- **Validação (double check).**
  - Só o supervisor, o gestor ou o admin validam.
  - **Quem registou tempo na tarefa não a pode validar.**
  - Rejeitar exige motivo. A tarefa volta à equipa, que a pode reiniciar, e o
    retrabalho soma ao real.
  - A obra só se conclui quando todas as tarefas estão validadas.
- **Choques de agenda.** O sistema avisa quando a mesma pessoa está, nos mesmos
  dias, numa tarefa de outra obra. Não impede a gravação. A sobrecarga (mais de 8 h
  planeadas no mesmo dia) é calculada no ecrã.
- **Trabalhos extra.** Seguem o fluxo registado → aprovado (gestor) → enviado ao
  comercial, ou recusado (com motivo). "Enviado" é um estado em Operações:
  **nada é escrito no CRM**. O comercial faz o orçamento adicional no CRM.
- **Atrasos e alertas do supervisor** (`obras.sql`, secção 11b).
  - *Vai atrasar*: quem está na tarefa, o supervisor da obra ou o gestor
    registam o atraso (`rpc_ops_obra_registar_atraso`): motivo, contexto
    (≥ 5 letras) e mais quanto tempo (minutos de mão de obra) ou nova data de
    fim. Guarda o plano original (`inicio_original`/`fim_original`, uma vez),
    muda `fim_planeado` e `minutos_estimativa` (`minutos_previstos` não muda),
    e empurra em cadeia as dependentes que ainda não começaram. `p_simular`
    dá o impacto sem gravar (a pré-visualização do ecrã).
  - O plano original também se guarda na 1.ª mudança de datas com a obra em
    curso (trigger `ops_obra_tarefa_baseline`: arrastar no Gantt, replanear).
  - *Cliente avisado*: `rpc_ops_obra_cliente_avisado` (supervisor da obra ou
    gestor), com nota.
  - *Alertas* (`rpc_ops_obra_alertas`): fim ultrapassado → não iniciada a
    tempo (por fazer, 60 min depois de `ops_obra.hora_inicio_dia`, 08:00 por
    defeito, hora de Lisboa) → cliente por avisar. Gestor/admin veem todas as
    obras; o supervisor, as suas; os outros, nada. Ficam em Operações: o sino
    do CRM seria a 1.ª escrita no CRM (decisão pendente).
- **Métricas.** Contam só tarefas terminadas e precisam de pelo menos 3 tarefas
  para tirar uma conclusão.
  - Por tarefa-modelo: real/previsto mostra se o default está curto ou longo, com
    uma sugestão (a mediana do real).
  - Por pessoa: real/previsto das tarefas em que trabalhou, pesado pelo tempo dela.
    Indica se é mais lento (formação?) ou mais rápido (boa prática?).

## Avisos no sino do CRM

Desde 06/10/2026, as obras avisam no sino do CRM. É a única escrita do
módulo fora de `ops_*`: linhas em `public.notifications` (`kind =
'notification'`, `user_id` = id de auth, `entity_type = 'ops_obra'`,
`data.modulo = 'operacoes'`). Há três tipos de aviso, todos **por obra**:

| Tipo | Quem recebe | Quando |
|---|---|---|
| `operacoes_obra_tarefas` | quem recebeu trabalho | ao atribuir (trigger; um aviso por pessoa e obra; quem se atribui a si não é avisado) → `/operacao/minhas-tarefas` |
| `operacoes_obra_alertas` | o supervisor da obra e os gestores/admin | quando há alertas (fora do prazo, por começar, material tarde, cliente por avisar), resumidos; resolvem-se sozinhos quando acabam → `/operacao/obras/<código>` |
| `operacoes_obra_bancada` | quem tem a especialidade **Marmorista** (e o supervisor) | quando a obra é planeada ou replaneada com tarefas de bancada: datas, medidas (ml de bancada) e local (piso, elevador, acesso) — para cortar e encomendar a pedra com antecedência. Sem ninguém com a especialidade, avisa o supervisor e os gestores a dizê-lo |

Não há duplicados: cada aviso guarda as suas "chaves" (tarefas, alertas,
datas). Se aparece uma chave nova, o mesmo aviso volta a ficar por ler. Se
não, só o texto se atualiza. A ficha da obra mostra "Bancada: avisado o
marmorista a …" (`rpc_ops_obra_aviso_bancada`, tabela `ops_obra_aviso`).

Quando corre: os triggers (atribuição, datas das tarefas de bancada), o
pg_cron de 15 em 15 minutos (`ops-obras-avisos` →
`ops_obra_sincronizar_avisos()`) e a abertura das Operações por quem
supervisiona (`rpc_ops_obra_sincronizar_avisos`, no máximo uma vez a cada 5
minutos). Um aviso que falha nunca desfaz o trabalho que o gerou.

## Perfis

| Função | Planear (criar obra, tarefas, datas, pessoas) | Executar | Validar | Extras: decidir | Custos (€) |
|---|---|---|---|---|---|
| admin / gestor | ✔ | ✔ (mesmo sem estar atribuído) | ✔ (se não trabalhou na tarefa) | ✔ | com `costs.view` |
| supervisor | ✘ | só se atribuído | ✔ | ✘ | com `costs.view` |
| técnico / operador (inclui empreiteiros e subempreiteiros) | ✘ | só nas tarefas onde está | ✘ | ✘ (só regista) | nunca na UI |

A função vem de `ops_utilizador_perfil.funcao`. O valor `supervisor` é
acrescentado à CHECK por `db/seguranca.sql`, num trabalho paralelo. Se a CHECK
ainda não o aceitar, `tools/validar-obras.mjs` acrescenta-o só no teste e avisa.

Não há códigos de permissão novos. São reutilizados os de `permissoes.sql`:

| Ação | Código |
|---|---|
| Ver | `orders.view` / `orders.view_all` |
| Criar | `orders.create` |
| Planear | `orders.edit` |
| Executar | `orders.execute` |
| Validar | `orders.confirm` |
| Decidir extras | `orders.approve` |
| Modelos | `checklists.manage` |
| Custos | `costs.view` |

As permissões são sempre verificadas **na organização da obra**, com `ops_pode()`.

## Modelo de dados (`db/obras.sql`)

| Tabela | O que é |
|---|---|
| `ops_obra_modelo`, `ops_obra_modelo_fase`, `ops_obra_modelo_tarefa` | Modelos por tipo de trabalho (procedimento, materiais, ferramentas, minutos previstos) |
| `ops_obra` | A obra. Código `OB-AAAA-00001` (via `ops_sequencia`), `cliente_id`/`orcamento_id`/`contrato_id` **sem FK**, estado `planeada/em_curso/suspensa/concluida/cancelada`, gestor, supervisor, tolerância |
| `ops_obra_fase` | Ordem 1..9 e nome |
| `ops_obra_tarefa` | Fase, ordem, ficha, minutos previstos, datas planeadas, `depende_de`, estado `por_fazer/em_curso/feita/validada/rejeitada`, motivo/nota de desvio, validação/rejeição, `modelo_tarefa_id` (para as métricas) |
| `ops_obra_tarefa_pessoa` | Quem faz a tarefa |
| `ops_obra_registo` | Tempo real, por pessoa e tarefa (início/fim). Índice único: um registo aberto por pessoa |
| `ops_obra_extra` | Trabalhos extra |

**Vistas.** Todas são `security_invoker`, para a RLS se aplicar:

| Vista | Para quê |
|---|---|
| `ops_v_obra_tarefa` | Tarefa, fase e obra, com real, quem está a trabalhar e pessoas |
| `ops_v_obra_resumo` | Lista de obras |
| `ops_v_obra_alerta` | Tarefas a ≥ 80 % |
| `ops_v_obra_conflito` | Choques de agenda |
| `ops_v_contrato` | Contratos assinados (`signed`, `assinado`, `active`). Só é criada se `client_contracts` existir |

**RPCs.** Todas são `SECURITY DEFINER` com `search_path` fixo e começam por
`ops_quem_sou(org)`:

| Área | RPCs |
|---|---|
| Criar e gerir a obra | `rpc_ops_obra_criar`, `_atualizar`, `_mudar_estado`, `_replanear` |
| Fases e tarefas | `_gravar_fase`, `_gravar_tarefa`, `_planear_tarefa`, `_apagar_tarefa`, `_atribuir_tarefa` |
| Execução e validação | `_iniciar_tarefa`, `_terminar_tarefa`, `_validar_tarefa` |
| Extras | `_registar_extra`, `_decidir_extra` |
| Custos | `_custos` (o custo só é devolvido com `costs.view`; `custo_hora` nunca sai) |
| Modelos | `_gravar_modelo`, `_semear_modelo_exemplo` |

**Segurança.**
- RLS está ligada nas 12 tabelas deste ficheiro (inclui `ops_obra_tarefa_atraso`).
- Há policies **só de SELECT**, com `ops_pode_ver_obra()`. Esta função dá acesso
  com `view_all` na organização, ou a quem é gestor, supervisor ou está em pelo
  menos uma tarefa da obra.
- Não há policies de escrita, e `INSERT/UPDATE/DELETE` está revogado a
  `authenticated`.
- Não há FK para o CRM nem escritas no CRM.
- A verificação no fim do ficheiro rebenta se alguma destas regras falhar.

## Ordem de aplicação

```
… sequência existente … → seguranca.sql → tempos.sql → obras.sql
opcional (demo): demo-obras.sql   ·   remover: demo-obras-remover.sql
```

- `npm run supabase:obras` aplica o ficheiro. **Não correr sem decisão:** é
  produção.
- O ficheiro é idempotente: `validar-instalacao` corre-o duas vezes.
- `correcoes-modelo.sql` e `schema.sql` verificam um número fixo de tabelas
  `ops_*` (26 e 19). Se forem corridos **depois** de `obras.sql`, essa verificação
  vai falhar, porque passam a existir mais 9 tabelas. Corram-se pela ordem.
- `db/demo-obras.sql` cria a obra `OB-DEMO-001` "Remodelação WC" a partir do
  modelo de exemplo. Inclui a fase 1 feita (3 tarefas validadas, 1 por validar e um
  desvio justificado), a canalização a correr a 83 % (alerta), uma precedência e um
  extra. Usa o primeiro cliente e as pessoas que já têm perfil em Operações.
- `db/demo-obras-remover.sql` apaga só a obra de demonstração. O modelo fica.

## Verificação local (sem tocar no Supabase)

```
npx tsc --noEmit
npx vitest run                  # domínio (obras, obras-gantt, obras-metricas), Gantt, justificação, páginas
node tools/validar-obras.mjs    # PGlite: 2 organizações, 5 pessoas, perfis, RLS, justificação, CRM intacto, demo
node tools/validar-instalacao.mjs
```

## Perguntas em aberto

1. **Fases 3 e 4.** Que nomes têm? São fixas ou configuráveis por tipo de obra?
   Hoje são editáveis por obra e por modelo.
2. **Subempreiteiros.** Hoje entram como utilizadores do CRM com perfil
   `tecnico`/`operador` em Operações. Falta decidir se passam a entrar pelo portal
   do fornecedor como utilizadores externos. Isto liga-se ao login único e deve ser
   alinhado com o Rafa.
3. **Extras → orçamento no CRM.** Hoje o fluxo para em "enviado ao comercial". Para
   criar o orçamento adicional automaticamente, Operações teria de escrever no CRM,
   o que é proibido por desenho. É preciso decidir: ou um botão no CRM que lê
   `ops_obra_extra`, ou uma exceção à regra.
4. **Fecho da obra.** Hoje fecha-se com todas as tarefas validadas. Falta decidir se
   é preciso a assinatura do cliente e quem fecha cada fase.
5. **Origem da obra.** Nasce do contrato assinado ou de quando o material está
   completo? Hoje o gestor cria-a quando quer, e o agendamento do início é a data
   que escolhe.
6. **Tempo por pessoa ou por equipa?** Hoje é por pessoa, em minutos.
7. **Tempos default por tarefa.** Vêm da ficha técnica dos serviços no CRM
   (horas × pessoas). Serviços sem horas entram com 1 h: é preciso preencher as
   fichas. O modelo "Remodelação casa de banho" tem tempos estimados por nós e
   deve ser revisto.
8. **Fase de cada serviço.** Hoje é adivinhada por palavras-chave. Se for para
   ficar, o certo é uma coluna "fase da obra" na categoria de serviço, no CRM.

## Limitações conhecidas

- **Feriados.** O plano automático (criar, replanear, primeira data livre)
  salta os feriados da organização e os nacionais (`schedule_holidays`) desde
  03/10/2026; o empurrar de um atraso (e de um material que chega tarde)
  também, desde 05/10/2026. Ver [planeamento.md](planeamento.md).
- **Capacidade por especialidade.** Conta só dentro da obra que se planeia:
  duas obras ao mesmo tempo podem pedir o mesmo azulejista. A distribuição
  (quem faz) não põe a mesma pessoa em dois sítios no mesmo dia, e os choques
  de agenda avisam.
- **Gantt.** O arrasto funciona com rato e toque (pointer events), mas o Gantt foi
  pensado para desktop. No telemóvel desliza na horizontal.
- **Fotografias dos extras.** A coluna `fotos` existe, mas a UI ainda não faz
  upload.
- **Choques de agenda.** Só consideram obras, não as ordens de trabalho (`ops_ordem`)
  da mesma pessoa.
- **Custo previsto.** Usa o custo/hora médio de quem está atribuído. Se não houver
  ninguém atribuído, usa a média da organização.
- **Navegação mobile.** A barra de baixo passou a deslizar na horizontal, porque com
  as obras são 10 destinos.
- **UI sem Supabase real.** Não foi experimentada contra o Supabase real, porque
  `obras.sql` não está aplicado lá. As páginas estão cobertas por testes de fumo com
  dados simulados, e o SQL pelos validadores PGlite.

## Dados de teste

`npm run gerar-dados-de-teste` escreve em `dist-sql/` dois ficheiros para colar
no SQL Editor do Supabase:

- `dados-de-teste.sql` — escolhe a organização (sozinho, se só uma tem
  Operações; senão recusa e pede o nome em `v_nome`) e corre `demo.sql`,
  `demo-obras.sql` e `demo-testes.sql`: ordens OT-DEMO-*, obras OB-DEMO-001 a
  006 em todos os estados, modelos "(demo)", tempos com ritmos diferentes por
  pessoa e extras em todos os estados. Só tabelas `ops_*`; não duplica.
- `dados-de-teste-remover.sql` — apaga tudo o que tem prefixo DEMO e os
  modelos "(demo)".

As pessoas são as que já têm perfil em Operações: atribuir funções em
Definições ANTES de gerar dá Métricas por pessoa e uma fila Validar que se
pode testar (quem fez uma tarefa não a valida). Provado em
`npm run validar-demo`.
