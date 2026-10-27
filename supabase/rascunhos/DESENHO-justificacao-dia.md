# Desenho — onde guardar a «justificação do dia»

Estado: **desenho, não é migration**. Nada disto foi aplicado. Base de referência: RH
(`uetjghdkwbywbftedtth`), lida só no catálogo a 27/10 (897 migrations aplicadas, a última
`20261231600000`).

---

## 1. O problema, em linguagem de negócio

A pessoa justifica um atraso ou uma falta **sugerida** (ainda não existe falta marcada). O RH
aceita (paga / não paga) ou recusa com motivo. Hoje:

- aceitar já escreve uma falta real na base (`rpc_hr_falta_marcar` + `rpc_hr_falta_registar_justificacao`
  + `rpc_hr_falta_decidir_justificacao`, chamadas uma a uma pelo browser em `AceitarComFaltaReal`);
- mas a **justificação em si** (o pedido da pessoa, o estado, a recusa, o «quem leu») vive em
  `src/components/rh-exemplo/dados/lojaJustificacaoDia.ts` e perde-se ao recarregar. Uma recusa não
  fica registada em lado nenhum; uma justificação pendente desaparece da fila do RH.

O RH real só tem justificações **de uma falta que já existe** (`pessoas_faltas_justificacoes`,
`falta_id NOT NULL`) e **de um pedido de ausência** (`pessoas_ausencias_justificacoes`). Não há
sítio para «a pessoa justifica antes de haver falta».

## 2. O que se reutiliza (e o que não)

| Peça existente | Reutiliza-se? | Como |
|---|---|---|
| `pessoas_faltas` + `rpc_hr_falta_marcar` / `_decidir_justificacao` | Sim, tal e qual | A decisão «aceitar» chama-as **dentro** da RPC nova, na mesma transacção. Os triggers de coerência (falta x falta, falta x realizado, falta x ausência aprovada) continuam a ser a guarda. |
| `pessoas_faltas_justificacoes` + `rpc_hr_falta_registar_justificacao` | Sim | Ao aceitar, o texto da pessoa passa para a justificação da falta (`tipo_documento = 'declaracao_propria'`), como o ecrã já faz hoje em `argumentosDaFalta`. Assim a falta aceite aparece com papel no ecrã normal de faltas (`JustificacaoFalta`). |
| `hr_registar_acesso_sensivel` + `pessoas_acessos_sensiveis` | Sim | «Ver texto» regista como o NISS/IBAN/atestado da falta. **Exige alargar o CHECK de `campo`** — ver secção 7, há um defeito real aí. |
| `hr_periodos_processamento` (estado aberto/fechado) | Sim, só leitura | É o fecho do mês real. Usa-se para saber se o mês está fechado no momento da decisão. |
| Códigos de permissão `hr.assiduidade.*` | Sim, nenhum código novo | Ver secção 4. |
| `pessoas_faltas_justificacoes` como tabela para o pedido do dia | **Não** | `falta_id NOT NULL` com FK composta; afrouxá-la mudava o significado da tabela e a política de leitura que a protege. |
| Tabela de anexos à parte | **Não** | Hoje só há nomes (até 4), sem ficheiro; o bucket está fechado ao cliente (`20261207004300`). Uma coluna `text[]` chega. Quando houver upload, segue o padrão `ficheiro_*` de `pessoas_faltas_justificacoes`. |
| `v_hr_assiduidade_desvios` / `hr_assiduidade_desvios(org, de, ate)` | Só propõe | Continua a só propor. Ver 6.4 (validação opcional do período). |

## 3. A tabela nova: `pessoas_justificacoes_dia`

Uma linha = **um envio** da pessoa para um dia (append-only; reenviar depois de uma recusa é
uma linha nova, a recusada fica como histórico). Sem `deleted_at`, sem DELETE.

Colunas (espelham o contrato `JustificacaoDia` de `lib/justificacaoDia.ts`):

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `organization_id`, `pessoa_id` | uuid NOT NULL | FK composta `(pessoa_id, organization_id) → pessoas(id, organization_id)` ON DELETE CASCADE, como em `pessoas_faltas` |
| `data` | date NOT NULL | o dia justificado |
| `tipo` | text NOT NULL | CHECK `IN ('consulta_medica','transporte','assunto_pessoal','outro')` |
| `de_atraso` | boolean NOT NULL | atraso (motivo da falta = `atraso`) ou falta sugerida |
| `periodo_inicio`, `periodo_fim` | time NOT NULL | CHECK `periodo_fim > periodo_inicio` (a mesma regra da meia-noite de `pessoas_faltas`) |
| `minutos` | integer GENERATED ALWAYS (mesma expressão de `pessoas_faltas.minutos`) | não escrevível: uma só fonte de verdade |
| `hora_real` | time NULL | hora real de chegada/saída, se indicada |
| `motivo` | text NOT NULL | CHECK `char_length(btrim(motivo)) >= 3` (= `MOTIVO_MINIMO_CARACTERES`). **Coluna sem GRANT de leitura** (ver 5) |
| `anexos_nomes` | text[] NOT NULL default `'{}'` | CHECK `cardinality(anexos_nomes) <= 4` e nenhum nome vazio ou > 255 caracteres. Só nomes; nada é enviado |
| `estado` | text NOT NULL default `'pendente'` | CHECK `IN ('pendente','aceite_paga','aceite_nao_paga','recusada')` |
| `decidida_por` | uuid NULL → `anew_users(id)` | |
| `decidida_em` | timestamptz NULL | |
| `motivo_recusa` | text NULL | |
| `falta_id` | uuid NULL | FK composta `(falta_id, pessoa_id, organization_id) → pessoas_faltas(id, pessoa_id, organization_id)` ON DELETE NO ACTION |
| `mes_fechado_na_decisao` | boolean NOT NULL default false | fotografia do fecho no momento da decisão (o ecrã mostra o aviso) |
| `created_at`, `updated_at`, `created_by`, `updated_by` | padrão do módulo | `created_by` = quem enviou; trigger `update_updated_at_column` e `hr_satelite_ancora_imutavel` (pessoa/organização imutáveis) |

CHECKs de coerência (a regra vive na base, não só na RPC):

- `pendente` ⇒ `decidida_por`, `decidida_em`, `motivo_recusa`, `falta_id` todos NULL;
- `estado <> 'pendente'` ⇒ `decidida_por` e `decidida_em` NOT NULL;
- `recusada` ⇔ `motivo_recusa` preenchido (≥ 3 caracteres) e `falta_id` NULL;
- `aceite_paga` / `aceite_nao_paga` ⇒ `falta_id` NOT NULL.

Unique de pares compostos: `UNIQUE (id, organization_id)` e `UNIQUE (id, pessoa_id, organization_id)`, como as vizinhas.

### Constraint «uma justificação activa por pessoa e dia/hora»

```
UNIQUE INDEX uq_justificacao_dia_activa
  ON pessoas_justificacoes_dia (pessoa_id, data, periodo_inicio)
  WHERE estado <> 'recusada'
```

Uma recusada não bloqueia o reenvio; uma pendente ou aceite bloqueia. Nota: o ecrã lê **por dia**
(`situacaoDoDia` usa a última do dia); com o índice por início de período, dois períodos no mesmo
dia continuam possíveis na base — o ecrã mostra o último. Ficar por dia (`(pessoa_id, data)`) seria
mais estrito; fica a escolha em 9.

### Índices

- `(organization_id, created_at) WHERE estado = 'pendente'` — a fila do RH e o contador do separador;
- `(pessoa_id, data DESC)` — o calendário da pessoa (mês);
- `(falta_id) WHERE falta_id IS NOT NULL` — chegar da falta à justificação que a originou.

## 4. Permissões — nenhum código novo

| Acção | Código | Porquê |
|---|---|---|
| A pessoa envia a sua | `hr.assiduidade.picar` **e** pessoa = `hr_pessoa_do_utilizador(auth.uid(), org)` | É a permissão de escrita de self-service da assiduidade («registar as suas próprias…»), já depende de `view.own`. Alternativa em 9. |
| A pessoa vê as suas | `hr.assiduidade.view.own` + pessoa própria | igual ao ramo próprio de `pessoas_faltas_justificacoes` |
| RH vê a fila e decide | `hr.assiduidade.justificacao.edit` | «Registar e decidir justificações». Aceitar também precisa de `hr.assiduidade.faltas.edit` — já é dependência do código no catálogo, e `rpc_hr_falta_marcar` verifica-a por si |
| RH envia em nome da pessoa | `hr.assiduidade.justificacao.edit` | mesma autoridade de `rpc_hr_falta_registar_justificacao` |
| «Ver texto» de consulta médica | `hr.assiduidade.justificacao.view` (`is_dangerous = true`, confirmado no catálogo) | o mesmo código que revela o atestado da falta |
| Chefia (`equipa.view`) | **nada** | como em `pessoas_faltas_justificacoes`: a chefia vê a falta quando existir, não o pedido nem o motivo |

## 5. RLS e GRANTs (as quatro operações)

- `REVOKE ALL … FROM anon, authenticated`; `GRANT ALL … TO service_role`.
- `GRANT SELECT (todas as colunas excepto motivo) TO authenticated` — **por coluna**, sem `GRANT
  SELECT` de tabela (que cobriria `motivo`). A migration leva no bloco de conferir a comparação
  entre colunas concedidas e colunas da tabela, e falha se divergirem (regra de 9/10 Setembro).
- SELECT (PERMISSIVE): `has_anew_permission_in_org(uid,'hr.assiduidade.justificacao.edit',org)`
  OR `…justificacao.view…` OR (`…view.own…` AND `pessoa_id = hr_pessoa_do_utilizador(uid, org)`).
  Sempre `has_anew_permission_in_org`, nunca `get_user_visible_org_ids` nem a global.
- INSERT / UPDATE / DELETE: três políticas RESTRICTIVE a `false`. Escrita só por RPC SECURITY DEFINER.
- Bloco de conferir igual ao de `20261207004200`: RLS activo, 4 políticas, 3 restritivas, sem GRANT
  de escrita a `authenticated`, política sem ramo de chefia, sem `deleted_at`, e a RPC de revelar
  contém `hr_registar_acesso_sensivel`.

O motivo **não** se lê pela tabela por ninguém (nem pela própria pessoa) — lê-se pelas RPCs, que
decidem quando o devolvem. É mais estrito do que `pessoas_faltas_justificacoes` (onde quem tem a
permissão lê a linha sem rasto), e é o que o contrato pede: o RH que decide não tem de ter a
permissão perigosa para despachar um atraso por transporte.

## 6. As RPCs (todas SECURITY DEFINER, `search_path = public, pg_temp`, REVOKE de PUBLIC/anon, GRANT a authenticated e service_role)

### 6.1 `rpc_hr_justificacao_dia_registar(_organization_id, _pessoa_id, _data, _tipo, _de_atraso, _periodo_inicio, _periodo_fim, _motivo, _hora_real DEFAULT NULL, _anexos_nomes DEFAULT '{}') → uuid`

1. sessão; permissão (própria com `picar`, ou `justificacao.edit`); pessoa existe na org e não apagada;
2. `_data <= hoje` (Europe/Lisbon) e dentro do prazo: `hoje <= _data + 5 dias úteis (seg–sex)` —
   a mesma regra de `prazoParaJustificar`/`somarDiasUteis` (sem feriados). Fora do prazo:
   `justificacao_dia_fora_do_prazo` (23514). O RH (`justificacao.edit`) pode registar fora do prazo? — ver 9;
3. não pode existir **falta activa** que cruze o período (comparação semi-aberta, a de
   `hr_faltas_sem_sobreposicao`): se existe, a justificação faz-se pela falta
   (`justificacao_dia_ja_ha_falta`). É o «temDesvio sem falta marcada» do ecrã;
4. INSERT; a unique parcial dá `23505` se já houver uma pendente/aceite — a RPC traduz para
   `justificacao_dia_ja_enviada`.

### 6.2 `rpc_hr_justificacao_dia_listar(_organization_id, _pessoa_id DEFAULT NULL, _de DEFAULT NULL, _ate DEFAULT NULL, _so_pendentes DEFAULT false) → TABLE(...)`

- Sem permissão de RH, força `_pessoa_id` = a própria pessoa (ou erro se pediu outra).
- Devolve todas as colunas do contrato. `motivo`: devolvido se o chamador é a própria pessoa, ou se
  `tipo <> 'consulta_medica'`; para consulta médica a quem não é a pessoa devolve NULL e
  `texto_sensivel = true` (o ecrã mostra «Ver texto»).
- `decidida_por_nome` por junção a `anew_users` (o ecrã mostra o nome).
- Volátil = STABLE; serve a fila (org, só pendentes) e o calendário (pessoa, mês). Limitada ao
  intervalo pedido (e a fila a pendentes) — nada de varrer a org inteira.

### 6.3 `rpc_hr_justificacao_dia_decidir(_justificacao_id, _decisao, _motivo DEFAULT NULL) → TABLE(falta_id uuid, mes_fechado boolean)`

Tudo numa transacção (a RPC é uma só chamada):

1. sessão; `SELECT … FOR UPDATE` da justificação (duas pessoas do RH a carregar ao mesmo tempo
   não criam duas faltas); permissão `justificacao.edit` na org da linha; estado tem de ser
   `pendente` (`justificacao_dia_ja_decidida`); `_decisao IN ('aceitar_paga','aceitar_nao_paga','recusar')`;
2. `mes_fechado` = existe `hr_periodos_processamento` da org, ano e mês de `data`, com `estado = 'fechado'`;
3. **recusar**: motivo ≥ 3 caracteres obrigatório; UPDATE estado/decidida_*; não toca em faltas;
4. **aceitar**:
   - procura falta **activa** da pessoa no mesmo dia com o mesmo `hora_inicio` (o caso idempotente que
     o ecrã já trata). Se existe e `remunerada` ≠ a decisão, ou `hora_fim` ≠ `periodo_fim`, **falha**
     com `justificacao_dia_falta_divergente` — hoje o ecrã decide-a como justificada e mantém o
     `remunerada` antigo em silêncio (ver riscos);
   - se não existe: `PERFORM rpc_hr_falta_marcar(org, pessoa, data, periodo_inicio, periodo_fim,
     CASE de_atraso THEN 'atraso' ELSE mapa(tipo) END, NULL, remunerada := decisão = 'aceitar_paga',
     desconta_saldo := false)` — mapa = o de `MOTIVO_DA_FALTA` (consulta_medica→doenca,
     assunto_pessoal→assuntos_pessoais, transporte/outro→outro);
   - `rpc_hr_falta_registar_justificacao(falta, 'declaracao_propria', NULL, motivo)` — só se a falta
     ainda não tem justificação não anulada;
   - `rpc_hr_falta_decidir_justificacao(falta, 'justificada', NULL)`;
   - UPDATE da justificação: estado, decidida_*, `falta_id`, `mes_fechado_na_decisao`.
   As RPCs de faltas são chamadas como estão: `auth.uid()` continua a ser o do utilizador dentro de
   funções SECURITY DEFINER aninhadas, e cada uma volta a verificar a sua permissão. Se qualquer
   passo falhar (trigger de sobreposição, ausência aprovada, horas trabalhadas), **nada** fica
   escrito — acaba o estado «falta marcada mas justificação por decidir» que hoje o ecrã tem de gerir.

**Mês fechado**: não bloqueia (é o contrato do ecrã: «a decisão fica registada e a falta nasce na
mesma, mas o fecho congela os recibos»). Fica guardado em `mes_fechado_na_decisao` e devolvido para
o aviso. Não há reabertura auditada (o trigger `hr_processamento_periodo_imutavel_fechado` diz que
está por construir) — ver 9.

### 6.4 Validação do período contra os desvios (opcional, recomendada)

Na 6.1, confirmar que `hr_assiduidade_desvios(org, data, data)` devolve, para a pessoa, um desvio
que contenha `[periodo_inicio, periodo_fim)`. Impede que a pessoa justifique (e depois o RH aceite
sem reparar) um período maior do que o desvio. A vista continua a só propor. Custo por medir na nike
antes do push; se for alto, fica de fora e o RH vê o período no ecrã antes de aceitar.

### 6.5 `rpc_hr_justificacao_dia_ver_texto(_justificacao_id) → text`

- exige `hr.assiduidade.justificacao.view` (a própria pessoa não precisa desta RPC: recebe o motivo no `_listar`);
- `PERFORM hr_registar_acesso_sensivel(pessoa, org, 'justificacao_dia', 'revelar')` **antes** de devolver;
- devolve `motivo`.

### 6.6 «Quem leu» — `rpc_hr_justificacao_dia_acessos(_justificacao_id) → TABLE(quem text, quando timestamptz)`

`pessoas_acessos_sensiveis` não tem referência ao registo (só pessoa + campo), e lê-se só com
`hr.pessoas.acessos_sensiveis.view`. A RPC (exige `justificacao.view`) devolve os acessos
`campo = 'justificacao_dia'` dessa pessoa desde `created_at` da justificação. **Imprecisão
assumida**: se a pessoa tiver duas justificações médicas, uma leitura aparece nas duas. A versão
exacta (coluna de referência na tabela de acessos) fica em 9.

## 7. Pré-requisito que é uma CORRECÇÃO (defeito real, lido no catálogo)

`pessoas_acessos_sensiveis_campo_valido` na base RH aceita só:
`niss, iban, conta_bancaria, incapacidade, retribuicao, documento, sindicalizacao,
horas_contratadas, anexo_cartao_cidadao, anexo_comprovativo_iban`.

Mas `rpc_hr_falta_ver_justificacao` regista `'falta_justificacao'` e `rpc_hr_ausencia_ver_justificacao`
regista `'ausencia_justificacao'` (definições lidas com `pg_get_functiondef`). O INSERT viola o
CHECK, e a excepção acontece antes do `RETURN QUERY`: **as duas RPCs de «ver justificação» que existem
hoje devem falhar em todas as chamadas.** Verificado por leitura do catálogo, não por chamada (a
chamada escreveria na base) — confirmar ao vivo na nike antes de corrigir, como manda a regra.

A migration da justificação do dia tem de, de qualquer forma, acrescentar `'justificacao_dia'`;
reescreve-se a lista **completa** (os 10 actuais + `falta_justificacao`, `ausencia_justificacao`,
`justificacao_dia`) — esta constraint já perdeu `conta_bancaria` duas vezes por listas de cor — e o
bloco de conferir verifica os 13 valores. Recomenda-se uma migration própria e anterior, só para o
CHECK, porque corrige duas funcionalidades existentes e não só a nova.

## 8. Ordem de publicação

1. Ler o remoto imediatamente antes: `migration list --linked` e confirmar que `pessoas_justificacoes_dia`
   e as RPCs `rpc_hr_justificacao_dia_*` não existem; confirmar `rpc_hr_falta_marcar` (9 argumentos) e
   `rpc_hr_falta_decidir_justificacao` (3) como estão hoje. Timestamps depois de `20261231600000`
   e dos rascunhos já reservados (`…700000`), por exemplo `20261231800000` e `20261231810000`.
2. **Migration A** — CHECK de `pessoas_acessos_sensiveis.campo` (lista completa, 13 valores). Antes do
   push, reproduzir o defeito na nike (chamar `rpc_hr_falta_ver_justificacao` numa falta da nike com
   justificação, como utilizador com `justificacao.view`) — é aí que o vermelho existe legitimamente.
3. **Migration B** — tabela, índices, GRANT por coluna, RLS, as 5 RPCs, bloco de conferir.
   Não precisa de código novo para não partir nada (é só aditiva) — pode ir antes do código.
4. **Código, junto com B no mesmo envio para o main**: `lojaJustificacaoDia`/`accoesJustificacaoDia`
   passam a ler de `_listar` e escrever por `_registar`/`_decidir`/`_ver_texto`/`_acessos`;
   `AceitarComFaltaReal` deixa de fazer as três chamadas e a procura do id (`faltaCriada`,
   `faltaActivaDoDia`) — a RPC devolve o `falta_id`; `useDecisaoDoDia` fica com uma só chamada;
   os 3 exemplos `p-ines/p-andre/p-beatriz` saem do caminho real (ficam só nos testes);
   `mesFechado` passa a vir da base em vez de `lerFluxosC().fechos`.
5. Depois do push: abrir o calendário da pessoa (modo mês) e a fila do RH na nike, enviar, recarregar,
   aceitar paga, recarregar, recusar com motivo, «Ver texto» e ver o registo.

Nada disto toca na Mudelar (é a base RH), mas as RPCs de faltas são partilhadas: a B não as altera,
só as chama.

## 9. Por decidir (do utilizador)

1. **Permissão de envio próprio**: `hr.assiduidade.picar` (reutiliza; quem pica pode justificar o
   seu dia) vs. um código novo `hr.assiduidade.justificar.own` (mais claro no ecrã de Papéis, um
   código a mais). Recomendo `picar`.
2. **Prazo de 5 dias úteis**: constante na base (como o ecrã) vs. configurável por organização (não
   existe tabela de configuração de RH na base; seria coluna/tabela nova). E se o RH pode registar
   fora do prazo em nome da pessoa.
3. **Uma activa por dia** ou **por dia e hora de início** (o desenho usa a segunda; o ecrã só mostra uma por dia).
4. **Mês fechado**: deixar decidir e só avisar (desenho, igual ao ecrã) vs. bloquear a aceitação até
   haver reabertura auditada (que não existe).
5. **«Quem leu» exacto por justificação**: acrescentar uma coluna de referência a
   `pessoas_acessos_sensiveis` (mexe numa tabela partilhada por todo o módulo) vs. a imprecisão de 6.6.
