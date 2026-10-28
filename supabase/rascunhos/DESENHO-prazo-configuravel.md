# Desenho — prazo para justificar configurável por organização (e âmbito do RH)

Base RH `uetjghdkwbywbftedtth`, ramo `feature/rh-pessoas`. Escrito a 27/10. **Só desenho: nada foi aplicado.**
Catálogo lido a 27/10 a partir do worktree `rh-pessoas` (`supabase/.temp/project-ref` = `uetjghdkwbywbftedtth`),
só `SELECT` de catálogo e do catálogo de permissões; nenhum dado pessoal. Remoto: 911 migrations, a última `20261231990000`.

Decisões do utilizador (27/10), não reabertas aqui:

1. O âmbito do RH é a **organização inteira**. Os centros só dizem onde cada pessoa trabalha.
2. O prazo de 5 dias úteis passa a ser **configurável por organização**, com **5 por omissão**.

---

## 1. Âmbito do RH — só documentar

Confirmado no catálogo a 27/10:

- Zero funções `hr_*` / `rpc_hr_*` com `ambito|scope|centro|departament` no nome.
- Zero políticas de `pessoas*` / `hr_*` que filtrem por centro, departamento ou âmbito.
- Zero permissões `hr.*` com `supports_scope = true`.

Todas as políticas e RPCs do RH filtram por `has_anew_permission_in_org(..., organization_id)` (mais a própria pessoa e,
nas faltas, a chefia por `hr_ausencias_pessoa_na_minha_cadeia`). **Não há nada a mudar.** A entrada «Restringir o RH por
âmbito» que está em POR DECIDIR (citada no cabeçalho de `20261231800000_justificacao_do_dia.sql`, secção «AMBITO DO RH»)
passa a **decidida: organização inteira**. Os centros continuam a ser só um atributo da pessoa (onde trabalha).

---

## 2. Onde o prazo está fixo hoje

### Na base (versão viva no catálogo = versão mais recente nos ficheiros)

| Sítio | O que faz | Estado |
|---|---|---|
| `hr_justificacao_dia_prazo(_data date)` — `20261231800000` | `IMMUTABLE`. Devolve o 5.º dia de segunda a sexta depois de `_data` (`generate_series(1,14)`, `isodow < 6`, `OFFSET 4`). **Sem feriados.** | Vivo, corpo igual ao ficheiro. Nenhum código do cliente a chama. |
| `rpc_hr_justificacao_dia_registar(...)` — `20261231800000` (md5 vivo `fdfb898f…`) | Única chamadora: `IF NOT v_rh AND v_hoje > hr_justificacao_dia_prazo(_data)` → `justificacao_dia_fora_do_prazo`. O prazo só trava **a pessoa**; o RH (`hr.assiduidade.justificacao.edit`, sobre outra pessoa) regista fora do prazo. O comentário da função diz «dentro do prazo de 5 dias uteis». | Único ponto onde a base **impõe** o prazo. |
| `rpc_hr_falta_registar_justificacao` (md5 `3185851d…`) e `rpc_hr_falta_decidir_justificacao` (`fc84fb7f…`) — `20261207004200` | **Não têm prazo.** Só o RH (`hr.assiduidade.justificacao.edit`) as chama; registar não compara datas. | Nada a mudar. |
| `rpc_hr_justificacao_dia_listar`, `_decidir` | Não calculam prazo (as comparações de datas são de intervalo e mês fechado). | Nada a mudar. |
| CHECKs e vistas | Nenhum CHECK nem vista do RH usa o prazo de justificação. (Os que dizem «prazo» são de outros temas: `pessoas_ausencias_direitos_prazo_depois_do_inicio`, `v_hr_ausencias_direito_completo` — prazo de gozo de férias —, e duas do módulo de negócio.) | Nada a mudar. |

### No código

| Sítio | O que faz hoje |
|---|---|
| `src/components/rh-exemplo/lib/faltasB.ts:18` | `PRAZO_JUSTIFICACAO_FALTA_DIAS_UTEIS = 5`; `prazoParaJustificar(data, dias)`, `foraDoPrazoDeJustificar(...)` já recebem os dias. |
| `src/components/rh-exemplo/lib/alertasFimDia.ts:13` | `PRAZO_JUSTIFICACAO_PICAGEM_DIAS_UTEIS = 5`; `prazoDaJustificacao(data, dias = 5)`, `prazoPassou`, `diasUteisRestantes` aceitam `dias` opcional, **mas `situacaoDoPrazo(alerta, hoje)` não o recebe** e usa sempre 5. |
| `src/components/rh-exemplo/dados/lojaFluxosB.ts:26,99` | `prazoFaltaDias` no store em memória, iniciado a 5. |
| `src/components/rh-exemplo/dados/accoesAssiduidadeB.ts:204,235` | `registarJustificacaoDeFalta` lê `prazoFaltaDias`; `definirPrazoDeJustificacao` grava no store (1..30, 5 se inválido). **Não grava na base.** |
| `src/components/rh-exemplo/fluxosB/faltas/FaltasPainel.tsx:52,72-82` | Campo numérico «Prazo da organização para justificar faltas» (`rhExemplo.fal.prazoConfig`) → `definirPrazoDeJustificacao`. Cabeçalho do ficheiro: «so o prazo [...] continua em memoria». |
| `src/components/rh-exemplo/fluxosB/faltas/FaltaDetalhe.tsx:74-81,124` | Mostra o prazo e «fora do prazo» com `prazoFaltaDias`. |
| `src/components/rh-exemplo/calendarioPessoa/situacaoDoMes.ts:74`, `JustificacaoDeDiaPessoa.tsx:50` | Calendário da pessoa: `situacaoDoDia({ prazoDias })` com `prazoFaltaDias`. |
| `src/components/rh-exemplo/calendarioPessoa/JustificacaoDoDia.tsx:50` | `diasUteisRestantes(alerta.data, hoje)` e `prazoDaJustificacao(alerta.data)` **sem dias** → 5 fixo. |
| `src/components/rh-exemplo/fluxosB/alertas/JustificarFalhaDeMarcacao.tsx:170,185`, `useJustificacoesDaPessoa.ts:73,76`, `lib/vistaDaPessoa.ts:47` | `situacaoDoPrazo` / `diasUteisRestantes` / `prazoDaJustificacao` **sem dias** → 5 fixo. |
| `src/components/rh-exemplo/fluxosB/alertas/useJustificacoesDaPessoa.ts:34` | `JANELA_DE_DESVIOS_DIAS = 30` (dias de calendário para trás). Com prazo até 30 dias úteis (≈ 42 dias de calendário) a janela **fica curta** — ver 6. |
| `src/lib/hr/justificacaoDia.ts:96` | Tradução do erro `justificacao_dia_fora_do_prazo`. Fica igual. |

Incoerência que já existe hoje: mudar o campo no ecrã muda o prazo das faltas e do calendário da pessoa, mas não o dos
alertas de picagem (5 fixo) nem o da base (5 fixo). A pessoa pode ver «dentro do prazo» e a base recusar.

### Como se contam os dias úteis

Nos dois lados: **segunda a sexta, sem feriados**, a contar do dia seguinte ao da falta; o prazo é o N.º dia útil e é
**inclusivo** (`hoje > prazo` → fora). Base: `isodow < 6`. Ecrã: `somarDiasUteis` em `rh-exemplo/lib/diasUteis.ts`
(`getUTCDay` ≠ 0 e ≠ 6). Existe `schedule_holidays` (feriados do agendamento comercial) e `pessoas_vinculos.politica_feriados`,
mas nenhum entra no prazo. **Manter sem feriados** neste trabalho (ecrã e base continuam a bater); feriados no prazo fica
como pergunta à parte (secção 9).

---

## 3. Onde guardar o valor

Tabelas de configuração por organização do RH no catálogo: `hr_regras_fim_contrato` (contratos; leitura com
`hr.pessoas.vinculos.view`) e `hr_regras_subsidio_alimentacao` (vencimento; leitura com `hr.vencimento.subsidio.view`).
**Nenhuma serve**: pôr o prazo numa delas obrigava quem só pica o ponto a ter permissão de contratos ou de vencimento para
saber o próprio prazo. Não existe `hr_configuracao_*` nem `hr_organizacao_*`.

**Tabela nova, a menor possível, no padrão de `hr_regras_fim_contrato`:** `public.hr_regras_assiduidade`
(nome genérico de propósito: é onde entram futuras regras da assiduidade, sem nova tabela).

- `id uuid` PK, `organization_id uuid NOT NULL` com `UNIQUE (organization_id)` e FK a `anew_organizations ON DELETE CASCADE`.
- `prazo_justificacao_dias integer NOT NULL DEFAULT 5`, `CHECK (prazo_justificacao_dias BETWEEN 1 AND 30)`.
- `created_at`, `created_by`, `updated_at`, `updated_by` (FK a `anew_users ON DELETE SET NULL`), trigger
  `update_updated_at_column`.
- **Sem linhas semeadas.** Sem linha = 5. Assim nenhuma organização muda de comportamento com a migration.
- RLS ligada, **quatro políticas** como a de fim de contrato:
  - `SELECT` para `authenticated` se tiver na organização qualquer uma de `hr.module.access`, `hr.assiduidade.view.own`,
    `hr.assiduidade.picar` (o valor não é sensível; quem pica tem de conhecer o prazo).
  - `INSERT`, `UPDATE`, `DELETE`: `AS RESTRICTIVE ... USING (false) / WITH CHECK (false)`. Escrita só pela RPC.
- `REVOKE ALL` a `anon` e `authenticated`; `GRANT SELECT` a `authenticated`; `ALL` a `service_role`.
- Bloco de conferir no fim: RLS activa, exactamente 4 políticas, `authenticated` só com `SELECT` (padrão da 20261210320000).

---

## 4. Funções

### 4.1 Leitura interna, barata — `hr_prazo_justificacao_dias(_organization_id uuid) RETURNS integer`

`LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp`:
`SELECT coalesce((SELECT prazo_justificacao_dias FROM hr_regras_assiduidade WHERE organization_id = _organization_id), 5)`.
Uma leitura pelo índice único; nenhuma pesquisa a catálogos. `SECURITY DEFINER` para não depender da RLS quando chamada
dentro de outras funções; só devolve um número. `EXECUTE` só a `authenticated` e `service_role`.

### 4.2 Cálculo da data — sobrecarga `hr_justificacao_dia_prazo(_data date, _dias integer) RETURNS date`

`IMMUTABLE PARALLEL SAFE`, o mesmo corpo de hoje com `generate_series(1, 60)` (30 dias úteis = 42 de calendário; 60 dá
folga) e `OFFSET _dias - 1`; `_dias` fora de 1..30 → `NULL` ⇒ quem chama trata (recusa). A versão de um argumento
**fica**, redefinida como `SELECT hr_justificacao_dia_prazo(_data, 5)` e com comentário «legado; usar a de dois
argumentos» — nada no cliente a chama, mas apagá-la é uma mudança destrutiva sem ganho. Os PostgREST overloads não
colidem (aridade diferente, nenhum default).

### 4.3 RPC de ler — `rpc_hr_regras_assiduidade_ler(_organization_id uuid)`

`STABLE SECURITY DEFINER`. Devolve `TABLE(prazo_justificacao_dias integer, gravado boolean, updated_at timestamptz,
pode_alterar boolean)`. Permissão: sessão obrigatória e uma de `hr.module.access`, `hr.assiduidade.view.own`,
`hr.assiduidade.picar` na organização, senão `42501`. Sem linha → `(5, false, NULL, ...)`. `pode_alterar` =
tem a permissão de gravar (poupa ao ecrã um segundo pedido para decidir se o campo é editável; a base volta a verificar
ao gravar). O ecrã usa a RPC e não a tabela, para receber já o 5 por omissão.

### 4.4 RPC de gravar — `rpc_hr_regras_assiduidade_guardar(_organization_id uuid, _prazo_justificacao_dias integer) RETURNS integer`

`VOLATILE SECURITY DEFINER`. Upsert por `organization_id` com `updated_by` = `anew_users.id` da sessão. Valida 1..30 antes
do `CHECK` (erro legível `regras_assiduidade_prazo_invalido`, `23514`); sem sessão ou sem permissão
`regras_assiduidade_sem_permissao` (`42501`). Devolve o valor gravado.

**Permissão de gravar: `hr.assiduidade.gerir` (já existe; «Gerir assiduidade», 3 papéis, não perigosa).** Procurei no
catálogo uma permissão de configuração da assiduidade: não existe. As `*.gerir` existentes são de outros domínios
(`hr.contratos.regras.gerir`, `hr.vencimento.subsidio.gerir`, `hr.admissao.obrigatorios.gerir`, códigos e períodos de
processamento). `hr.assiduidade.gerir` é a de quem já gere faltas e a fila de desvios — os mesmos que vivem com o prazo.
Não se cria permissão nova porque não é indispensável: o efeito de mudar o prazo é limitado (1..30 dias, só abre ou fecha
a possibilidade de a pessoa justificar sozinha; o RH continua a poder registar fora do prazo). **Alternativa, se o
utilizador quiser separar quem configura de quem opera:** criar `hr.assiduidade.regras.gerir` (perigosa, sem papel por
omissão, filha de `hr.assiduidade.gerir`), como `hr.contratos.regras.gerir`. Fica em POR DECIDIR, com `hr.assiduidade.gerir`
como omissão.

Não se usa `hr.assiduidade.justificacao.edit`: quem decide as justificações não deve ser, só por isso, quem define o prazo.

### 4.5 A RPC de justificação do dia passa a ler o prazo da organização

`CREATE OR REPLACE rpc_hr_justificacao_dia_registar` com **a mesma assinatura** (10 argumentos) e o corpo vivo
(md5 `fdfb898f94b54530886bb9ac48ce83d9`) — guarda que recusa aplicar se o corpo mudou. Única alteração:

- `v_prazo_dias := hr_prazo_justificacao_dias(_organization_id)`;
  `v_prazo := hr_justificacao_dia_prazo(_data, v_prazo_dias)`;
- `IF NOT v_rh AND v_hoje > v_prazo` → `justificacao_dia_fora_do_prazo` com a data e o número de dias na mensagem;
- comentário da função: «dentro do prazo da organizacao (hr_regras_assiduidade; 5 por omissao)».

Os `REVOKE`/`GRANT` e o comentário reaplicam-se (o `CREATE OR REPLACE` mantém-nos, mas a migration repete-os, por regra).
As RPCs de faltas **não mudam**: não têm prazo e só o RH as chama.

---

## 5. Que acontece quando o prazo muda

O prazo conta-se **da data da falta / do dia**, com o valor **em vigor no momento em que a pessoa regista**. Não há
fotografia do prazo por dia (antes de registar não existe linha onde a guardar).

- **Justificações já registadas** (pendentes, aceites, recusadas) e faltas com justificação: **nada muda**. O prazo só
  trava o acto de registar; decidir não tem prazo. **Nada se reabre nem se fecha retroactivamente** — nenhuma migration
  ou gatilho percorre registos ao mudar o valor.
- **Dias ainda por justificar:** aumentar o prazo dá mais tempo também aos dias recentes (um dia cujo prazo de 5 tinha
  acabado pode voltar a estar dentro, se 8 o incluírem); diminuir encurta-o aos dias ainda não justificados. É o
  comportamento esperado de «a regra da empresa passou a ser N».
- **Recusada com prazo** (o ecrã deixa reenviar): o reenvio volta a passar pelo prazo em vigor.
- O RH continua a poder registar em nome da pessoa fora do prazo (caminho de saída inalterado).
- O ecrã deve dizer isto junto ao campo: «Aplica-se a partir de agora aos dias ainda por justificar; justificações já
  enviadas não mudam.»

---

## 6. Desempenho

- Não há caminho quente na base: o prazo só é avaliado em `rpc_hr_justificacao_dia_registar` (uma vez por envio) — uma
  leitura pelo índice único. `rpc_hr_justificacao_dia_listar` **não** passa a calcular prazo por linha.
- O calendário (modo mês) calcula o prazo **no cliente**, com o número lido **uma vez por organização** (React Query,
  `staleTime` longo, por exemplo 5 min). Nenhuma chamada por dia.
- Medir na nike, antes do push, só por `SELECT` em ciclo de 100 repetições de `hr_prazo_justificacao_dias` e de
  `hr_justificacao_dia_prazo(d, 30)`: deve ficar na ordem dos microssegundos por chamada.
- `JANELA_DE_DESVIOS_DIAS` (30 dias de calendário) tem de deixar de ser fixa: passa a
  `max(30, prazo * 7 / 5 + 7)` (com prazo 30 → 49 dias), ou um fixo de 45. Recomendo derivar do prazo.

---

## 7. Ecrã — ler e gravar

**Hook real novo `src/hooks/useRegrasAssiduidade.ts`**, no padrão de `useRegrasFimContrato.ts`:

- `useQuery(["hr-regras-assiduidade", orgId])` → `hrRpc("rpc_hr_regras_assiduidade_ler", { _organization_id })`;
  devolve `{ prazoJustificacaoDias, gravado, podeAlterar }`; sem resposta / sem permissão → 5 e `podeAlterar = false`;
  `isPermissionError` tratado como em `useRegrasSubsidioAlimentacao`; erro de rede **não** se esconde (mostrar
  `AvisoDeLeitura`, e o cálculo usa 5 com aviso).
- `useMutation` → `hrRpc("rpc_hr_regras_assiduidade_guardar", ...)`, `invalidateQueries` da mesma chave.
- Constante partilhada `PRAZO_JUSTIFICACAO_OMISSAO = 5` e limites 1..30 em `src/lib/hr/` (um só sítio; as duas constantes
  do `rh-exemplo` passam a reexportá-la).
- Tradução dos erros `regras_assiduidade_sem_permissao` / `_prazo_invalido` ao lado de `src/lib/hr/justificacaoDia.ts`.

**Wrapper no `rh-exemplo`:** um hook `usePrazoJustificacao()` em `rh-exemplo/dados/` que devolve o número do hook real.
`prazoFaltaDias` **sai** do `lojaFluxosB` e `definirPrazoDeJustificacao` **sai** de `accoesAssiduidadeB` (tirar em todo o
lado: store, acção, testes de `fluxosB.test.tsx`). Passam a usar o wrapper:

- `FaltasPainel` (campo numérico: grava ao sair do campo / botão «Guardar», desactivado sem `podeAlterar`, mostra o
  aviso da secção 5; o cabeçalho deixa de dizer «continua em memoria»), `FaltaDetalhe`, `situacaoDoMes`,
  `JustificacaoDeDiaPessoa`;
- e os que hoje ignoram o valor: `JustificacaoDoDia.tsx`, `JustificarFalhaDeMarcacao.tsx`, `useJustificacoesDaPessoa.ts`,
  `vistaDaPessoa.ts` — `situacaoDoPrazo(alerta, hoje, dias)` passa a receber os dias (parâmetro obrigatório, para o
  compilador apanhar quem ficar de fora).
- `registarJustificacaoDeFalta` recebe o prazo como argumento em vez de o ler do store.

Testes (um ficheiro de cada vez, `--maxWorkers=1`): hook com Supabase simulado (sem linha → 5; gravar chama a RPC com os
argumentos certos; erro de permissão); `situacaoDoPrazo`/`prazoDaJustificacao` com 1, 5 e 30 dias, a atravessar fins de
semana; janela de desvios derivada do prazo.

---

## 8. Migration e ordem de publicação

Rascunho a escrever (ainda não escrito) em `supabase/rascunhos/NOVO-20261231991000_hr_regras_assiduidade_prazo.sql`
(maior que `20261231990000`, o maior local e remoto a 27/10; reconfirmar com `migration list --linked` antes de mover).
Conteúdo: guardas (tabela não existe; `has_anew_permission_in_org` e as permissões `hr.assiduidade.gerir`,
`hr.module.access`, `hr.assiduidade.view.own`, `hr.assiduidade.picar` existem; md5 de `rpc_hr_justificacao_dia_registar`
e de `hr_justificacao_dia_prazo(date)` iguais aos lidos), tabela + RLS, funções 4.1–4.4, `CREATE OR REPLACE` de 4.5,
bloco de conferir (4 políticas, só `SELECT` a `authenticated`, sem linhas, `hr_justificacao_dia_prazo(d,5)` igual à de um
argumento em 2026-10-23/24/26, `hr_prazo_justificacao_dias` de uma org sem linha = 5). CRLF, conferido por bytes.

**Não parte nada sozinha**: sem linhas, o comportamento da base fica igual (5). Por isso a ordem é:

1. Revisão do rascunho por `ecc:database-reviewer` e `ecc:security-reviewer`.
2. Teste contra o remoto **antes** do push (`BEGIN; migration; teste na nike; ROLLBACK`), com autorização para escritas
   revertidas na nike: sem linha → recusa ao 6.º dia útil; gravar 8 → aceita ao 6.º; pessoa sem `hr.assiduidade.gerir`
   não grava; leitura por quem só pica funciona.
3. Listar o pendente imediatamente antes; `db push --linked` (base RH, a partir do worktree).
4. Medir (secção 6) e chamar `rpc_hr_regras_assiduidade_ler` na nike.
5. **Código no mesmo envio para o main** (o ecrã passa a chamar RPCs que só existem depois do push; publicado antes, a
   leitura falha e o hook cai em 5 com aviso — degradação aceitável, mas não se publica antes).
6. Ao vivo na nike: mudar o prazo no `/rh-exemplo`, recarregar (o valor ficou), confirmar que o calendário da pessoa e os
   alertas de picagem mudam juntos, e que a base aceita/recusa conforme.

Nada disto toca na Mudelar (base RH). Reversão à mão, sem ficheiro na pasta: repor o corpo antigo de
`rpc_hr_justificacao_dia_registar`, `DROP` das RPCs 4.3/4.4, de `hr_prazo_justificacao_dias`, da sobrecarga de dois
argumentos e da tabela (reverter `hr_justificacao_dia_prazo(date)` ao corpo próprio).

---

## 9. Para o registo de trabalho

- **POR DECIDIR — permissão para configurar o prazo:** `hr.assiduidade.gerir` (omissão, já existe, 3 papéis) ou nova
  `hr.assiduidade.regras.gerir` perigosa sem papel por omissão.
- **POR DECIDIR — feriados no prazo:** hoje nem ecrã nem base contam feriados; contar exigiria escolher a fonte
  (`schedule_holidays` é do agendamento, não do RH) e passaria a ser leitura por dia — fora deste trabalho.
- **DECIDIDO — âmbito do RH:** organização inteira; sair do POR DECIDIR.
