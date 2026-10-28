# Desenho — Canal de denúncias com lógica real (base RH)

Data: 28/10/2026. Estado: **desenho, nada aplicado**. Base alvo: RH (`uetjghdkwbywbftedtth`), worktree `rh-pessoas`.
Fonte funcional: `vault/ficheiros/crm/olyvia_arquitetura_nova_base_v2.html` (aba «Canal de denúncias») e o protótipo em memória
(`src/components/canal-denuncias/lib/*`, `dados/loja.ts`). Desenho do vault de partida: `nova-base/ajustes/05_rh_ajustes.sql` §8 —
**adaptado, não copiado** (usa `anew_memberships`/`membro_id` e `fn_nucleo_*`, que a base RH não tem).

## 0. O que foi confirmado na base RH (só SELECT de catálogo, 28/10)

| Facto | Resultado |
|---|---|
| Tabelas `public.*denunc*` | 0 |
| Funções `public.*denunc*` | 0 |
| Permissões `anew_permissions.code ILIKE '%denunc%'` | 0 |
| Última migration aplicada | `20261231990000` (rascunho do prazo usa `20261231991000`; este desenho começa em `20261231992000`) |
| Códigos de erro `RH09x`, `RH1xx`, `HRD*` em funções vivas | nenhum (os usados são `HR010/011/911/920`, `HRA*`, `HRC*`, `HRV*`) → **família nova `HRD01..HRD30`** |
| `anew_organizations` tem slug/identificador público? | **Não** (id, name, type, …, deleted_at) |
| `rate_limit_attempts` | `id, bucket, identifier, success, created_at` |
| `pessoas_contas` | `pessoa_id, organization_id, anew_user_id, estado, …` |
| Extensões | `pgcrypto`, `pg_cron`, `supabase_vault`, `pg_net` presentes |
| Buckets | `hr-documentos(-quarantine)` 10 MB, `hr-justificacoes`, … nenhum de denúncias |
| Assinaturas reutilizáveis | `has_anew_permission_in_org(_auth_uid, _permission_code, _organization_id)`, `hr_pessoa_do_utilizador(_auth_uid, _organization_id)` |

## 1. Princípios (o que molda tudo o resto)

1. **Tabelas fechadas, tudo por RPC.** Todas as tabelas do canal ficam com RLS ligada, `REVOKE ALL` a `anon` e `authenticated`, e
   políticas RESTRICTIVE `block_select/insert/update/delete` (padrão RH). Nada se lê por PostgREST directo; as RPCs `SECURITY DEFINER`
   fazem a autorização. Assim não há armadilha de `GRANT` por coluna (não há concessão nenhuma a manter) e a identidade não tem caminho
   de fuga. O bloco de conferir verifica que `has_table_privilege('authenticated', t, 'SELECT')` é falso para cada tabela do canal.
2. **A identidade vive numa tabela à parte** (`denuncias_identidade`), que só existe para denúncias identificadas. Uma anónima não tem
   linha — «a identidade de uma anónima não existe em lado nenhum», garantido por gatilho e não só pela RPC.
3. **Quem trata é designado, não herdado de um papel.** O acesso aos casos vem da tabela `denuncias_responsaveis` (designação explícita
   por organização) **e** da permissão `denuncias.gerir`. Ter todas as permissões (super-admin) **não** dá acesso aos casos — confidencialidade
   (Lei 93/2021, a confirmar com o jurídico).
4. **Os impedidos não veem o caso.** Quem é visado ou declarou conflito deixa de ver a denúncia (lista, contador, abrir, ações), e nunca
   pode ser responsável.
5. **O PIN nunca é guardado, nem em hash simples.** HMAC-SHA-256 com *pepper* do servidor (segredo da Edge) e o id da denúncia como sal.
   A base sozinha não chega para quebrar o PIN offline.
6. **A Edge pública não guarda nada do denunciante**: nem IP em claro (só HMAC com *pepper* próprio, para o limite de pedidos), nem
   user-agent, nem corpo nos registos/Sentry.
7. **As regras puras do protótipo são a fonte de verdade** (`lib/estados.ts`, `acoes.ts`, `prazos.ts`, `conflito.ts`, `formulario.ts`,
   `codigos.ts`): a base repete-as, o cliente continua a validá-las antes de chamar. Os **códigos de valores ficam os do protótipo**
   (`mais_info`, `dados`, `conflito`, gravidades `baixa|media|alta`), para não mexer em 245 chaves de tradução nem nos testes.

## 2. Modelo de dados

Todas: `organization_id uuid NOT NULL REFERENCES anew_organizations(id)`, `UNIQUE (id, organization_id)` onde há filhos, FKs compostas
`(x_id, organization_id)` para impedir mistura entre organizações. Ninguém elimina linhas excepto o job de conservação (§2.10).

### 2.1 `denuncias_canal` — configuração por organização (1 linha por org)
- `organization_id` PK; `ativo boolean NOT NULL DEFAULT false`; `slug_publico text UNIQUE NOT NULL` (CHECK `^[a-z0-9-]{4,40}$`) — é o
  `?org=` da página pública (hoje é o id de exemplo); `ultimo_ano int`, `ultimo_numero int` (contador do código, ver 3.2);
  `atualizado_por uuid → anew_users`, `atualizado_em`.
- Prazos **não** configuráveis nesta entrega: 7 dias e 3 meses são constantes da função `denuncias_prazos()` (os mesmos de `prazos.ts`).
  Ver decisão D9.

### 2.2 `denuncias_responsaveis` — quem trata os casos
- `id`, `organization_id`, `anew_user_id → anew_users NOT NULL`, `ativo boolean`, `designado_por`, `designado_em`, `removido_em`.
- `UNIQUE (organization_id, anew_user_id)`. Remover = `ativo=false` (o histórico mantém o nome).
- Substitui a lista fixa `RESPONSAVEIS` (r1..r4) e o `RESPONSAVEL_ATUAL`.

### 2.3 `denuncias` — o caso (sem identidade, sem PIN)
| Coluna | Notas |
|---|---|
| `id`, `organization_id` | |
| `codigo text NOT NULL` | `DEN-AAAA-NNNN`; `UNIQUE (organization_id, codigo)` |
| `anonima boolean NOT NULL DEFAULT true` | gatilho: nunca passa de `true` a `false` (HRD20) |
| `origem text CHECK IN ('publica','aplicacao')` | |
| `tipo text CHECK IN ('assedio','discriminacao','corrupcao','fraude','seguranca','dados','conflito','outro')` | valores do protótipo |
| `descricao text CHECK length(btrim) BETWEEN 30 AND 4000` | |
| `resumo text` (≤ 200) | o protótipo mostra-o na lista; derivado da descrição se vier vazio |
| `quando text NOT NULL` (≤ 200) | texto livre como no protótipo — **D6** (o HTML pede data) |
| `onde`, `envolvidos` text (≤ 1000) | |
| `ainda_acontece`, `testemunhas` text CHECK IN ('sim','nao','nao_sei') | |
| `ja_reportado text` (≤ 1000) | |
| `boa_fe boolean NOT NULL CHECK (boa_fe)` | declaração obrigatória |
| `estado text DEFAULT 'recebida' CHECK IN ('recebida','em_analise','mais_info','concluida','arquivada')` | |
| `gravidade text DEFAULT 'media' CHECK IN ('baixa','media','alta')` | `critica` fica para D10 |
| `avaliacao_inicial text` (≤ 2000) | existe no tipo e não há ação que a escreva: entra em `rpc_denuncia_avaliacao` (opcional, D11) |
| `responsavel_id uuid` | FK a `anew_users(id)`; a RPC e o gatilho verificam que é responsável activo da org e não impedido |
| `recebida_em timestamptz NOT NULL DEFAULT now()` | |
| `prazo_confirmar date NOT NULL`, `prazo_seguimento date NOT NULL` | gravados na criação: `recebida_em::date + 7`, `+ 3 meses` (dias corridos/meses de calendário, como `prazos.ts`) |
| `confirmada_em timestamptz` | reabrir mantém-na |
| `resultado text CHECK IN ('procedente','parcialmente_procedente','improcedente','sem_competencia')`, `medidas text`, `fundamentacao text`, `decidida_em` | |
| `motivo_arquivo text` | |
| `fechada_em timestamptz`, `conservar_ate date` | `conservar_ate = fechada_em::date + 5 anos`; reabrir limpa-o |
| `criada_em`, `atualizada_em` | |

CHECKs (do vault, ajustados): concluída ⇔ resultado e fundamentação (≥ 3); arquivada ⇔ motivo (≥ 3); fechada ⇔ `fechada_em` e
`conservar_ate`; sai de `recebida` para `em_analise` só com `confirmada_em`. Gatilho `denuncias_regras` (BEFORE UPDATE): transições de
`estados.ts` (HRD01), responsável nunca impedido (HRD03), anónima nunca identificada (HRD20), `organization_id` imutável.
Índices: `(organization_id, estado, recebida_em)`, `(organization_id, responsavel_id)`, `(conservar_ate) WHERE conservar_ate IS NOT NULL`.

### 2.4 `denuncias_acesso` — segredo e sessão do acompanhamento (1:1)
- `denuncia_id` PK (FK composta), `organization_id`, `pin_hash text NOT NULL CHECK length = 64` (hex HMAC), `tentativas_falhadas int`,
  `bloqueada_ate timestamptz`, `bloqueios int` (para o escalonamento), `sessao_hash text`, `sessao_expira_em timestamptz`.
- Separada para que nenhuma RPC de gestão toque no PIN por engano; só as RPCs de serviço a leem.

### 2.5 `denuncias_identidade` — só identificadas
- `denuncia_id` PK, `organization_id`, `anew_user_id uuid` (preenchido quando veio de dentro da app), `pessoa_id uuid` (FK composta a
  `pessoas`, opcional), `nome`, `email` (CHECK formato), `telefone`, `pode_contactar boolean`, `so_responsavel boolean DEFAULT true`.
- CHECK: `pode_contactar ⇒ email ou telefone`. Gatilho BEFORE INSERT: recusa se a denúncia é anónima (HRD20).
- Índice `(organization_id, anew_user_id) WHERE anew_user_id IS NOT NULL` (para «As minhas»).

### 2.6 `denuncias_mensagens` — conversa (o que o denunciante vê)
- `id`, `organization_id`, `denuncia_id`, `autor text CHECK IN ('canal','denunciante')`, `autor_user_id uuid` (só `canal`; CHECK
  `autor='denunciante' ⇒ autor_user_id IS NULL`), `pedido_informacao boolean`, `texto` (1..4000), `criada_em`.
- O denunciante vê «Canal» como autor, nunca o nome de quem escreveu (a confirmar: D12).

### 2.7 `denuncias_notas` — notas internas (nunca chegam ao denunciante)
- `id`, `organization_id`, `denuncia_id`, `autor_user_id NOT NULL`, `texto` (1..4000), `criada_em`. Tabela separada de propósito: uma
  RPC pública esquecida de um filtro `tipo <> 'nota'` deixaria passar notas; uma tabela que nenhuma RPC pública lê, não.

### 2.8 `denuncias_eventos` — histórico e auditoria (só acrescenta)
- `id`, `organization_id`, `denuncia_id`, `tipo` CHECK IN (`recebida`, `rececao_confirmada`, `responsavel_atribuido`,
  `responsavel_libertado`, `conflito_declarado`, `visado_registado`, `gravidade_alterada`, `mensagem_enviada`, `informacao_pedida`,
  `denunciante_respondeu`, `nota_adicionada`, `concluida`, `arquivada`, `reaberta`, `identidade_vista`, `exportada`, `anexo_aberto`),
  `quem_user_id uuid` (nulo = denunciante, CHECK casado com o tipo), `dados jsonb` (só metadados curtos: gravidade antes/depois,
  resultado, motivo de arquivo/identidade/exportação; **nunca** o texto das mensagens nem identidade), `criado_em`.
- **Registo de acessos à identidade = eventos `identidade_vista` com `dados.motivo` obrigatório** (quem, quando, porquê). Não se cria
  tabela à parte nem se usa `pessoas_acessos_sensiveis` (essa exige `pessoa_id` e tem `campo`/`accao` fechados). Padrão reutilizado:
  tabela só-acrescenta + função interna que resolve `anew_users` por `auth.uid()`.
- O historial da UI («quem» como texto) passa a ser o nome resolvido de `quem_user_id` na leitura.

### 2.9 `denuncias_impedidos` — visados e conflitos
- `id`, `organization_id`, `denuncia_id`, `anew_user_id NOT NULL`, `motivo CHECK IN ('visado','conflito')`, `registado_por` (nulo se veio
  do denunciante no formulário, D3), `registado_em`. `UNIQUE (denuncia_id, anew_user_id)`.
- Substitui `denunciados[]` e `conflitos[]` do protótipo. Índice `(denuncia_id, anew_user_id)`.

### 2.10 `denuncias_anexos` — provas (tabela própria, **não** `pessoas_anexos`)
- Mesmo ciclo do portal (`DESENHO-portal-fase2-anexos.md`): `pendente → ligado`, `apagado`; `quarentena_path` `denuncia/<id>/<anexo_id>`,
  `final_path`, `nome_exibicao` (D7), `mime_type`, `tamanho_bytes` real, `sha256`, `autor CHECK IN ('denunciante','canal')`,
  `reservado_em`, `ligado_em`, `apagado_em`. **Sem IP, sem nome original no caminho.** Limite 5 por denúncia do denunciante (HRD13; o
  formulário tem `MAX_FICHEIROS=5`), 3 por resposta (como a UI de acompanhamento).
- Buckets novos privados `denuncias-quarantine` e `denuncias` (10 MB, pdf/jpeg/png), políticas `block_*` a `authenticated`/`anon`; só a
  Edge escreve e serve (URL de 60 s, `Content-Disposition: attachment`, evento `anexo_aberto` **antes** do URL).
- Porque não `pessoas_anexos`: está aplicada e partilhada com a admissão (`pessoa_id NOT NULL`, `tipo` fechado, `upload_ip`); um `ALTER`
  arrisca as 4 RPCs do portal e mistura perímetros (RH vs canal).

### 2.11 Conservação (5 anos)
- `rpc_denuncias_conservacao_executar()` (só `postgres`/cron): apaga em cascata (anexos no Storage pela Edge de limpeza, depois linhas)
  as denúncias com `conservar_ate < current_date`, deixando um contador anónimo por organização/ano se o jurídico o exigir.
  **Job mensal `pg_cron` só depois de D8**; até lá nada se apaga (o que é o comportamento seguro). A confirmar com o jurídico: prazo,
  suspensão durante processos judiciais, o que se apaga e o que se anonimiza.

## 3. Autorização e RPCs

### 3.1 Permissões novas (catálogo `anew_permissions`, sem atribuir a ninguém)
| Código | Para quê | Porquê indispensável |
|---|---|---|
| `denuncias.gerir` | rota `/rh-exemplo/denuncias`, menu, contador; condição necessária (não suficiente) para tratar casos | hoje a gestão usa `users.view`, que é demasiado larga e não é de RH |
| `denuncias.configurar` (`is_dangerous`) | designar responsáveis, ligar o canal, definir o `slug_publico` | sem ela não há forma de criar a lista de responsáveis |

Categoria `denuncias`, `scope 'organization'`, `supports_scope=false`. Nenhuma `hr.*` entra em políticas do canal, nenhuma `denuncias.*`
em políticas de `pessoas*` (regra do vault). **Não** se cria permissão para ver identidade nem para exportar: é o responsável do caso que
o faz, com motivo e registo; uma permissão a mais seria atribuída por papel e furaria o princípio 3. «As minhas denúncias» não precisa de
permissão: basta sessão (D4 propõe tirar o `users.view` dessa rota).

### 3.2 Funções internas (não expostas)
- `denuncias_eu(org) → anew_user_id`: resolve `anew_users.auth_user_id = auth.uid()` (padrão de `hr_registar_acesso_sensivel`).
- `denuncias_sou_responsavel(org) → boolean`: tem `denuncias.gerir` **e** linha activa em `denuncias_responsaveis`. Calculada **uma vez**
  por chamada de listagem (nunca por linha).
- `denuncias_posso_tratar(org, denuncia) → boolean`: sou responsável, não estou em `denuncias_impedidos` desta denúncia, e
  (`responsavel_id IS NULL` ou `= eu`) — a regra do vault, **D1**. Falha ⇒ HRD09 «não encontrada» (não se distingue de inexistente).
- `denuncias_proximo_codigo(org) → text`: `UPDATE denuncias_canal SET ultimo_numero = CASE WHEN ultimo_ano = ano THEN ultimo_numero+1
  ELSE 1 END, ultimo_ano = ano … RETURNING` — transaccional, sem colisões (o protótipo calcula no cliente).
- `denuncias_evento(…)`: grava o evento; todas as RPCs de escrita o chamam na mesma transacção.

### 3.3 RPCs do gestor (`authenticated`, `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `EXECUTE` só a `authenticated`)
Todas recebem `p_organization_id` e `p_denuncia_id`, fazem `SELECT … FOR UPDATE` filtrado por id **e** org, verificam
`denuncias_posso_tratar`, e devolvem a denúncia actualizada (o mesmo formato de `abrir`) para o cliente não ter de reler.

| RPC | Regra (= `lib/acoes.ts`) | Erros |
|---|---|---|
| `rpc_denuncias_listar(org)` | lista do que posso ver (não impedido; meu ou sem responsável — D1): código, tipo, resumo, estado, gravidade, origem, anónima, responsável (id+nome), datas e prazos, nº de mensagens por ler. **Sem descrição completa, sem identidade.** | HRD09 se não sou responsável → lista vazia |
| `rpc_denuncias_por_confirmar(org) → int` | contagem do menu (estado `recebida`, visível para mim) | — |
| `rpc_denuncia_abrir(org, id)` | tudo menos identidade: descrição, campos, mensagens, notas, eventos (com nomes), anexos (metadados), impedidos | HRD09 |
| `rpc_denuncia_confirmar_rececao(org, id, p_mensagem text DEFAULT NULL)` | `recebida→em_analise`, `confirmada_em=now()`; mensagem opcional ao denunciante | HRD01 |
| `rpc_denuncia_gravidade(org, id, g)` | igual = não faz nada | — |
| `rpc_denuncia_atribuir(org, id, p_user)` | `p_user` responsável activo e não impedido; o mesmo = nada | HRD02 denunciado, HRD03 conflito, HRD14 não é responsável |
| `rpc_denuncia_impedir(org, id, p_user, p_motivo)` | `conflito`: só `p_user = eu` (declarar o próprio conflito); `visado`: qualquer responsável regista outro. Idempotente. Se o impedido era o responsável ⇒ `responsavel_id = NULL` + evento `responsavel_libertado` (o caso volta à fila, §5) | HRD15 |
| `rpc_denuncia_pedir_informacao(org, id, texto)` | só de `em_analise`; ⇒ `mais_info`; cria mensagem com `pedido_informacao` | HRD01, HRD04 |
| `rpc_denuncia_mensagem(org, id, texto)` | recusa fechada; **recusa em `recebida`** (D5) | HRD08, HRD04, HRD10 |
| `rpc_denuncia_nota(org, id, texto)` | só gestão | HRD04 |
| `rpc_denuncia_concluir(org, id, resultado, medidas, fundamentacao)` | só `em_analise`/`mais_info` | HRD01, HRD06, HRD07 |
| `rpc_denuncia_arquivar(org, id, motivo)` | motivo ≥ 3; de `recebida`/`em_analise`/`mais_info` | HRD05 |
| `rpc_denuncia_reabrir(org, id)` | fechada ⇒ `em_analise`; limpa decisão, motivo, `fechada_em`, `conservar_ate`; mantém `confirmada_em` (ou põe agora) | HRD01 |
| `rpc_denuncia_identidade_ver(org, id, p_motivo)` | só identificada; motivo ≥ 3; se `so_responsavel`, só o responsável atribuído; regista `identidade_vista` **antes** de devolver; cada chamada regista | HRD11 anónima, HRD12 motivo, HRD16 só o responsável |
| `rpc_denuncia_exportar(org, id, p_motivo)` | JSON do caso (sem identidade, sem PIN); evento `exportada` com motivo | HRD12 |
| `rpc_denuncias_responsaveis(org)` | lista activa (id, nome) para o selector e para «impedidos» | — |
| `rpc_denuncias_canal_ler / _guardar(org, ativo, slug)`, `rpc_denuncias_responsavel_designar / _remover(org, user)` | `denuncias.configurar`; remover um responsável com casos atribuídos liberta-os (evento) | HRD17 sem permissão, HRD18 slug em uso |

### 3.4 RPCs do denunciante identificado («As minhas», `authenticated`)
- `rpc_denuncias_minhas(org)`: denúncias com `denuncias_identidade.anew_user_id = eu` **nesta organização**; devolve só o que a
  `VistaAcompanhamento` mostra (estado, 3 datas, desfecho, conversa, anexos do denunciante). Nunca notas, gravidade, avaliação, responsável.
- `rpc_denuncia_minha_responder(org, id, texto)`: recusa fechada; se `mais_info` ⇒ `em_analise`; evento `denunciante_respondeu`
  (`quem_user_id` nulo, como no protótipo).
- As anónimas feitas dentro da app **não** aparecem aqui (não há ligação); acompanham-se com código + PIN pela Edge (aba «Anónimas»).

### 3.5 RPCs de serviço (`EXECUTE` só a `service_role`; só a Edge as chama)
- `rpc_denuncia_publica_reservar_codigo(p_slug)`: devolve `{organization_id, codigo}` (§4.2).
- `rpc_denuncia_publica_criar(p_slug, p_codigo, p_dados jsonb, p_pin_hash, p_identidade jsonb, p_anew_user_id)`: resolve org por slug com canal
  activo; valida o formulário (= `formulario.ts`); se anónima **descarta** `p_identidade` e `p_anew_user_id`; se identificada vinda da app,
  nome/email vêm da pessoa ligada (`pessoaLigada.ts`) e não do corpo; impedidos indicados no formulário (D3); devolve `{codigo}`.
- `rpc_denuncia_publica_entrar(p_slug, p_codigo, p_pin_hash, p_sessao_hash) → boolean`: com bloqueio (§4.3). Devolve `false` igual para
  código inexistente, PIN errado e bloqueado.
- `rpc_denuncia_publica_ler(p_sessao_hash)`, `rpc_denuncia_publica_responder(p_sessao_hash, texto)`.
- Anexos: `rpc_denuncia_anexo_reservar / _ligar / _descartar` (por sessão pública ou por `auth.uid()` do responsável/denunciante
  identificado) e `rpc_denuncia_anexo_para_abrir(org, anexo)` (regista `anexo_aberto`).
- `rpc_denuncias_limpar()`: sessões expiradas, `rate_limit_attempts` dos baldes `denuncias:*` com mais de 24 h, anexos `pendente` > 3 h.

### 3.6 Catálogo de erros (`HRDxx` ⇒ `ErroAcao` do cliente)
`HRD01 transicao_invalida`, `HRD02 denunciado`, `HRD03 conflito`, `HRD04 texto_vazio`, `HRD05 motivo_curto`, `HRD06 resultado_em_falta`,
`HRD07 fundamentacao_em_falta`, `HRD08 fechada` (os oito já existem em `acoes.ts` e nas traduções) e novos: `HRD09 nao_encontrada`,
`HRD10 confirmar_primeiro`, `HRD11 anonima`, `HRD12 motivo_identidade`, `HRD13 limite_anexos`, `HRD14 nao_e_responsavel`,
`HRD15 impedimento_invalido`, `HRD16 so_responsavel`, `HRD17 sem_permissao`, `HRD18 slug_em_uso`, `HRD19 canal_inativo`,
`HRD20 anonima_imutavel`. Os novos entram em `canalDenunciasPt.ts`/`En.ts` e na lista fixa de `traducoes.test.ts`.
`RAISE … USING ERRCODE`; mensagens sem `%` por escapar; concatenações com catálogo em `::text`.

## 4. Edge pública `canal-denuncias` (`verify_jwt = false`)

Molde: `supabase/functions/convite-admissao/handler.ts` (contexto com dependências injectáveis, `erros.ts`, testes vitest com cliente
simulado). Um só ponto de entrada `POST` com `accao`.

### 4.1 Acções
| Acção | Entrada | Saída |
|---|---|---|
| `canal` | `slug` | `{ativo, nome_org}` (para a página dizer «canal indisponível» em vez de cair na organização activa) |
| `criar` | `slug`, formulário, `modo` | `{codigo, pin}` **uma só vez**; o PIN é gerado na Edge (`crypto.getRandomValues`, sem viés, como `otp.ts`) e só o HMAC vai para a base |
| `entrar` | `slug`, `codigo`, `pin` | `{sessao}` (32 bytes aleatórios; base guarda só o SHA-256; 30 min, renova com actividade) ou `codigo_ou_pin_invalido` |
| `ler` | cabeçalho `x-denuncia-sessao` | vista do acompanhamento |
| `responder` | sessão, texto | vista actualizada |
| `anexo_url` / `anexo_confirmar` / `anexo_remover` | sessão (ou JWT do responsável/denunciante identificado) | fluxo de quarentena do portal (fase 2, §6) |
| `anexo_abrir` | JWT do responsável | URL 60 s |

**Criação dentro da app passa pela mesma Edge** (é ela que tem o *pepper*): anónima ⇒ o cliente chama **sem** `Authorization` (só
`apikey`), e a Edge ignora qualquer JWT; identificada ⇒ com JWT, a Edge valida-o (`auth.getUser`), confirma que o utilizador tem conta
activa na organização do slug (`pessoas_contas` ou associação à org) e passa `p_anew_user_id`.

### 4.2 PIN
`pin_hash = HMAC-SHA-256(DENUNCIAS_PIN_PEPPER, 'den-pin|' || organization_id || '|' || codigo_normalizado || '|' || pin)`, em hex.
O sal é `organização + código` (único por denúncia) e não o id, para que a entrada se faça numa só chamada sem a Edge ter de perguntar
antes se o código existe. Criação em duas chamadas de serviço: `rpc_denuncia_publica_reservar_codigo(p_slug) → {organization_id, codigo}`
(avança o contador) e depois `rpc_denuncia_publica_criar(…, p_codigo, p_pin_hash)`, que recusa um código já usado ou com número acima do
contador da org (duas reservas em simultâneo continuam ambas válidas). Uma criação que falhe entre as duas deixa um salto na numeração (aceitável: o código é referência, não
contabilidade). Segredo com ≥ 32 caracteres, falha fechada se faltar.
Comparação na base com tempo constante (`=` entre dois hex de 64 caracteres; para código inexistente compara com um hash fixo).

### 4.3 Bloqueio e limites (falha fechada)
- **Por denúncia** (na RPC, sob `FOR UPDATE`): 5 falhas ⇒ bloqueio de 15 min; cada novo bloqueio dobra (15 min, 30, 1 h, … máx. 24 h);
  acerto zera `tentativas_falhadas` mas não `bloqueios`. **Não** é bloqueio definitivo: com códigos sequenciais, um bloqueio definitivo
  deixava qualquer pessoa trancar todas as denúncias de uma organização (D2).
- **Por IP**: baldes `denuncias:entrar` (20/h) e `denuncias:criar` (5/h) em `rate_limit_attempts`, `identifier = HMAC(DENUNCIAS_IP_PEPPER, ip)`;
  ip de `detectClientIp` (nunca `'unknown'`; sem IP válido ⇒ balde partilhado `sem-ip`). Limpeza a 24 h.
- O `checkRateLimit` de `_shared/rateLimit.ts` **falha aberto** em erro de leitura; a Edge usa um invólucro local que falha fechado
  (`indisponivel`), sem alterar o `_shared` (usado por outras funções).
- Resposta e tempo iguais para código inexistente, PIN errado e denúncia bloqueada: `401 codigo_ou_pin_invalido`.

### 4.4 Higiene
CORS restrito à origem da aplicação; corpo ≤ 64 KB; validação de tipos; erros só por código do catálogo (`erros.ts`), sem detalhe; Sentry
só com acção e SQLSTATE; **nunca** PIN, sessão, descrição, IP ou JWT nos registos; `orgScopedQuery` em toda a consulta `service_role`;
a organização vem sempre do `slug` validado na base, nunca do corpo. Segredos novos: `DENUNCIAS_PIN_PEPPER`, `DENUNCIAS_IP_PEPPER`.

## 5. Conflito de interesses

- Registar: o próprio declara conflito (`rpc_denuncia_impedir` com `p_user = eu`), outro responsável marca um visado; o denunciante pode
  indicar no formulário responsáveis do canal envolvidos (D3) — evita que o visado veja o caso **antes** da triagem.
- Efeito imediato: o impedido deixa de ver a denúncia (lista, contador, abrir, ações → HRD09), e se era o responsável o caso fica sem
  responsável e volta à fila de quem pode tratar (evento `responsavel_libertado`).
- «Passa a outro»: recomendo **voltar à fila** (sem atribuição automática). Se só existir um responsável não impedido, o ecrã de gestão
  mostra a esse o caso sem responsável como hoje mostra os novos. Se **nenhum** responsável puder tratar (todos impedidos), a listagem do
  `denuncias.configurar` mostra um aviso «N casos sem quem os possa tratar» (só contagem, sem conteúdo) para se designar outra pessoa.
- Ninguém retira um impedimento (só acrescenta), e a base recusa atribuir um impedido (gatilho, HRD02/HRD03).

## 6. Cliente

### 6.1 Ligar sem partir a guarda `semBase.test.ts`
- Novo contrato `FonteDenuncias` em `components/canal-denuncias/dados/fonte.ts` (interface + contexto React) com as **mesmas funções da
  loja** (`useDenunciasDaOrganizacao`, `useDenuncia`, `submeter`, `confirmarRececaoDe`, `atribuirA`, `declararConflitoDe`, `enviarMensagemA`,
  `pedirInformacaoEm`, `responderComoDenunciante`, `mudarGravidade`, `notaEm`, `concluirDenuncia`, `arquivarDenuncia`, `reabrirDenuncia`,
  `verIdentidade`) mais `responsaveis`, `porConfirmar`, `minhas`, `acompanhar`. As acções passam a **assíncronas** (`Promise<ResultadoAcao>`).
- A loja em memória passa a ser **uma implementação** do contrato (`fonteMemoria`), por omissão no contexto: os testes continuam a usar
  `repor()`/`lerDenuncias`/`submeter` através dela.
- A implementação real `useFonteDenunciasReal` vive em `src/components/rh-exemplo/hooks/` (onde `semBase` do rh-exemplo autoriza
  `@/hooks`, `@/integrations/supabase`), com react-query (chaves `['denuncias', org, …]`, invalidação depois de cada acção, erros
  `HRDxx → ErroAcao` e `captureFlowError` sem dados do caso). O fornecedor é posto em `App.tsx` à volta das rotas do canal (fora das pastas
  vigiadas). **A guarda fica como está**, e continua a proibir storage e `fetch` nos componentes.

### 6.2 Ecrã a ecrã
| Ecrã | Muda |
|---|---|
| `/canal-denuncias/nova` (público) | `?org=<slug>`; chama `canal`: inactivo/desconhecido ⇒ «canal indisponível» (deixa de cair na org activa). Submeter via Edge; confirmação com código+PIN igual. Passo «Provas»: na fase 1 sem anexos reais (D7). |
| `/canal-denuncias/acompanhar` | `FormularioAcesso` ⇒ `entrar`; sessão só em memória; mensagem de erro única como hoje; resposta com anexos só na fase 2. |
| Minha área — Identificadas | `rpc_denuncias_minhas`; painel responde com `rpc_denuncia_minha_responder`. Sem ficha/conta ⇒ `RhSemFichaDenuncias` como hoje. |
| Minha área — Anónimas | `CodigosGuardados` (memória, sem PIN, como hoje) + `FormularioAcesso` pela Edge. |
| Gestão | rota e menu com `denuncias.gerir`; lista, totais, abas e filtros continuam no cliente (`filtros.ts`) sobre `rpc_denuncias_listar`; painel com `rpc_denuncia_abrir`; `SeccaoIdentidade` passa a pedir **motivo** num diálogo antes de revelar (chaves novas); `SeccaoResponsavel` usa `rpc_denuncias_responsaveis` e ganha «Marcar como visado»; «Enviar» desactivado em `recebida` com a razão em texto (D5); botão «Exportar» com motivo (opcional, D11). |
| `FaixaResponsavel` | para quem tem `denuncias.configurar`: «Responsáveis do canal» (designar/remover) e «Ligar canal / endereço público». É o único ecrã novo, e é indispensável: sem ele ninguém é responsável. |
| Menu | `ContadorDenuncias` ⇒ `rpc_denuncias_por_confirmar` (react-query, `staleTime` 60 s, sem *polling* agressivo). |

### 6.3 Rascunho do formulário
Fica **em memória** (`dados/rascunho.ts`), como hoje e por decisão explícita do ficheiro: nunca `localStorage`/`sessionStorage`
(computadores partilhados, confidencialidade). Antes de guardar remove sempre `modo`, `identidade` e `pessoaId` — o rascunho nunca
guarda identidade. Perde-se ao recarregar; a UI já o diz. (D13 se quiserem persistência.)

## 7. Ordem de publicação e o que falha entre passos

| # | Passo | Se parar aqui |
|---|---|---|
| 0 | Decisões D1–D13 e parecer do jurídico (§8) | nada muda |
| 1 | `NOVO-20261231992000_denuncias_permissoes.sql` (catálogo, sem papéis) | nada visível |
| 2 | `NOVO-20261231993000_denuncias_tabelas.sql` (tabelas, gatilhos, RLS fechada, buckets) + `NOVO-20261231994000_denuncias_rpcs.sql` (internas, gestor, minhas, serviço). Testes **antes** do push: chamadas reais às RPCs na nike dentro de `BEGIN … ROLLBACK` (bloco de conferir: privilégios a `authenticated` nulos, transições, impedido não vê, anónima sem identidade, bloqueio do PIN). Listar pendentes imediatamente antes do `db push`. | a UI continua em memória; ninguém é afectado |
| 3 | Segredos `DENUNCIAS_PIN_PEPPER`, `DENUNCIAS_IP_PEPPER`; publicar a Edge `canal-denuncias` + `config.toml` | Edge sem segredos falha fechada (`indisponivel`); Edge antes do passo 2 ⇒ 500 em todas as acções |
| 4 | Cliente (contrato, fonte real, ecrãs, traduções) **no mesmo envio** que troca a rota/menu para `denuncias.gerir` | se a rota mudar antes do passo 5, ninguém vê a gestão em nenhuma organização da base RH; se o cliente chegar antes do passo 3, a página pública dá erro |
| 5 | Na nike: atribuir `denuncias.gerir`/`configurar` a um papel, designar responsáveis, ligar o canal com slug | acto consciente do utilizador; nas outras organizações o canal fica desligado (página diz «indisponível») |
| 6 | Verificação ao vivo na nike: caso do Paulo do HTML de ponta a ponta, como visitante sem sessão e como responsável; dois responsáveis, um declara conflito e deixa de ver | só então conta como feito |
| 7 | Fase 2 — anexos reais (depende de D10 do portal: segredos do Vault para o cron de limpeza) | até lá «Provas» diz que se podem enviar depois |
| 8 | Job de conservação 5 anos (depende de D8 e do jurídico) | nada se apaga |

Mudelar: a base RH é outra; nada disto toca a base principal nem a Mudelar.

## 8. DECISÕES DO UTILIZADOR

1. **Quem vê cada caso.** A) Só o responsável atribuído, e os sem responsável todos os responsáveis (regra do vault). B) Todos os
   responsáveis não impedidos veem todos. **Recomendo A**: menos pessoas leem cada denúncia; o filtro «responsável» da UI continua a servir
   a quem tem vários.
2. **Bloqueio do PIN.** A) Temporário e escalonado (5 falhas ⇒ 15 min, a dobrar até 24 h). B) Definitivo após 5 (o vault). **Recomendo
   A**: com códigos sequenciais, B deixa qualquer pessoa trancar o acompanhamento de todas as denúncias.
3. **Indicar no formulário responsáveis envolvidos** (ficam impedidos desde a entrada). A) Sim, lista opcional dos responsáveis do canal.
   B) Não, só a gestão regista visados. **Recomendo A** (o visado não chega a ver o caso); custa um passo a mais no formulário e mostra ao
   público os nomes dos responsáveis.
4. **«As minhas denúncias» sem `users.view`.** A) Qualquer pessoa com sessão na org. B) `hr.pessoas.view.own`. **Recomendo A**.
5. **Mensagens do canal em `recebida`.** A) Recusar até confirmar a receção (a confirmação pode levar uma mensagem). B) Deixar como o
   protótipo. **Recomendo A**. O denunciante pode sempre acrescentar informação.
6. **«Quando aconteceu».** A) Texto livre obrigatório (protótipo). B) Data obrigatória (HTML). C) Data opcional + texto. **Recomendo A**
   (situações continuadas não têm uma data).
7. **Nome dos anexos de anónimas.** A) Guardar como «anexo-1.pdf». B) Guardar o nome original. **Recomendo A**; e limpar EXIF das imagens
   (como D4 do portal). E: **entregar a fase 1 sem anexos reais?** Recomendo sim (dependem do cron que falta).
8. **Conservação.** O que acontece ao fim de 5 anos sobre o fecho: apagar tudo / apagar e manter contagem anónima / anonimizar. **Recomendo
   apagar e manter contagem**, depois do parecer jurídico; até lá nada se apaga.
9. **Prazos configuráveis por organização?** **Recomendo não** (7 dias e 3 meses são o máximo legal; encurtar não traz nada agora).
10. **Gravidade `critica`.** **Recomendo não** nesta entrega (o protótipo e as traduções têm três).
11. **Avaliação inicial editável e botão Exportar.** **Recomendo** avaliação sim (já é mostrada, ninguém a escreve) e exportar sim, com motivo.
12. **O denunciante vê o nome de quem lhe responde?** A) «Canal de denúncias». B) O nome. **Recomendo A**.
13. **Rascunho do formulário persistido no navegador?** **Recomendo não** (fica em memória, como hoje).
14. **Permissões novas** `denuncias.gerir` e `denuncias.configurar` e quem as recebe na nike (passo 5).

### A confirmar com o jurídico (interpretação legal, Lei 93/2021)
- Contagem dos 3 meses: desde a receção (como o protótipo) ou desde a confirmação; dias corridos.
- Se o denunciante pode pedir o resultado da análise depois da conclusão (prazo de resposta a esse pedido).
- Conservação 5 anos: início da contagem (fecho), suspensão durante processos judiciais, o que se apaga ou anonimiza.
- Se o super-admin da organização pode ficar sem acesso aos casos (princípio 3) e se basta um responsável designado.
- Guardar o HMAC do IP 24 h para limitar abusos é compatível com o anonimato.
- Protecção contra retaliação: nada se constrói nesta entrega (é processo, não sistema); confirmar que não se exige registo próprio.
- Denúncias de quem não é trabalhador (fornecedores, candidatos) pela página pública: âmbito do canal.
