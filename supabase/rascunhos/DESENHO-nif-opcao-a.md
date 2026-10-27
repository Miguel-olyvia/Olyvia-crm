# Desenho — NIF opção (a): só o nif-write-proxy grava, com service_role e actor verificado

Base RH `uetjghdkwbywbftedtth` (confirmado em `supabase/.temp/project-ref`). Só desenho:
nada aplicado. Lido no catálogo vivo a 27/10 (pg_get_functiondef, information_schema,
pg_default_acl, pg_roles, pg_trigger); nenhum dado pessoal lido.
Decisões do utilizador (26/10), não reabertas: opção (a) e contador na base.

---

## 1. Como as verificações dependem hoje do utilizador actual (lido na base)

| Função | Como obtém o utilizador | Com service_role (auth.uid() nulo) |
|---|---|---|
| `auth.uid()` | `coalesce(request.jwt.claim.sub, request.jwt.claims->>'sub')` — **claim.sub tem precedência** (md5 da definição `ea3b41bf29e2ad573067939329aa088e`) | NULL |
| `has_anew_permission(_auth_uid, code)` | parâmetro; une anew_users → memberships activas → role_permissions | false (fecha) |
| `get_user_crm_org_ids(_auth_uid)` | parâmetro; memberships activas e não-cliente | vazio (fecha) |
| `crm_scope_keys(code)` | `auth.uid()` interno → `resolve_lead_access_context` | `ARRAY[]` (fecha) |
| `resolve_lead_access_context` | `auth.uid()` interno; admin (system/super + hierarquia), ORG/TEAM/OWNED, equipas | RAISE (fecha) |
| `fn_neg_tem_permissao_org` | `auth.uid()` + crm_scope_keys | false (fecha) |
| `fn_neg_pessoa_por_negocio` | `auth.uid()` | false (fecha) |
| `fn_neg_exigir_pessoa` | ambito 'view' **ou** pessoa_por_negocio | depende de fn_neg_pessoa_no_ambito (abaixo) |
| **`fn_neg_pessoa_no_ambito`** | `auth.uid()`; **`IF v_uid IS NULL THEN RETURN true`** | **ABRE** |
| `fn_negocios_actor`, `current_business_user_id` | `auth.uid()` | NULL |
| `fn_neg_exigir_config`, `fn_neg_entidade_partilhada`, `fn_nif_key` | não usam sessão | iguais |

Gatilhos em `anew_entities` (os que o UPDATE do NIF dispara): 4 de search_text (não usam
sessão) e `trg_audit_anew_entities` → `fn_generic_entity_audit`, que usa `auth.uid()` e o
actor de negócio para registar quem alterou.

**Consequência.** Mudar só o GRANT e chamar com service_role seria fechado nos passos 3 e 5
(o `has_anew_permission(NULL…)` recusa), mas tem dois defeitos: (1) nunca grava, porque
recusa toda a gente; (2) qualquer caminho que chegue a `fn_neg_pessoa_no_ambito` com
`auth.uid()` nulo abre — no passo 8 o NG030/NG031 passaria a dizer «está noutra pessoa»
mesmo a quem não a vê (o oráculo que o NG031 existe para tapar). A auditoria ficaria sem
autor. Por isso o actor tem de ficar estabelecido **antes** de qualquer verificação.

## 2. As duas formas de validar o actor, e a escolhida

**(i) Reescrever as verificações com o actor explícito** (cópias de has_anew_permission,
crm_scope_keys, resolve_lead_access_context, fn_neg_pessoa_no_ambito,
fn_neg_pessoa_por_negocio, fn_neg_tem_permissao_org com um parâmetro de actor).
- A favor: nada depende de GUCs.
- Contra: ~250 linhas duplicadas das regras de âmbito (admin por hierarquia, ORG/TEAM/OWNED,
  líderes de equipa, os dois ids legado). As cópias divergem na primeira alteração às
  originais e deixam de ser «exactamente as mesmas verificações». Um erro numa cópia
  passa a ser uma fuga só neste caminho. A auditoria continua sem autor.

**(ii) Assumir a identidade do actor dentro da função, com `set_config(..., true)`**
(local à transacção), e chamar os helpers que já existem sem os tocar.
- A favor: as verificações ficam literalmente as de hoje (mesmas funções, mesmo md5); a
  auditoria regista o actor real; nada é duplicado.
- Riscos e como se fecham:
  1. *Alguém escolher o actor.* Só service_role tem EXECUTE (secção 4); o proxy tira
     `p_actor_auth_uid` dos parâmetros do cliente e põe-no a partir do JWT que validou
     (`auth.getUser`). O conferir prova que mais nenhuma função chama esta (uma DEFINER do
     mesmo dono passaria por cima do ACL): hoje **0** funções a mencionam.
  2. *Fail-open de `fn_neg_pessoa_no_ambito` com uid nulo.* Logo depois do set_config,
     `IF auth.uid() IS DISTINCT FROM p_actor_auth_uid THEN RAISE` — se a precedência de
     `auth.uid()` mudar um dia, a função falha em vez de correr com uid nulo. A guarda
     confere também o md5 de `auth.uid()`.
  3. *A identidade «vazar» para o resto da transacção.* É `is_local = true`: acaba no fim
     da transacção do PostgREST (um pedido = uma transacção) e é desfeita num ROLLBACK ou
     num erro. Ainda assim a função guarda os valores anteriores e repõe-nos antes de cada
     RETURN (há um só ponto de saída: as recusas NG030/NG031 também passam por ele).
  4. *Claims incompletos.* Os claims que se põem são só `{sub, role: 'authenticated'}`.
     Há 22 funções em `public` que leem `auth.jwt()`/`auth.role()`/`request.jwt`; **nenhuma
     está no caminho desta RPC** (lidos todos os helpers acima e os 5 gatilhos de
     anew_entities: só usam `auth.uid()`). O conferir não o pode provar para sempre;
     fica como risco aceite e escrito no cabeçalho.
  5. *Chamada por quem já tem sessão.* Antes de assumir a identidade, exige-se
     `auth.uid() IS NULL` e `auth.role() = 'service_role'` (defesa em profundidade: se um
     dia o GRANT regredir para authenticated, a chamada directa falha em vez de deixar o
     utilizador gravar em nome de outro).

**Escolhida: (ii), com pré-validação explícita do actor.** As verificações de
existência e de pertença à organização fazem-se à mão, com o parâmetro (são curtas e não
dependem de regras de âmbito); as de permissão e âmbito, pelos helpers existentes depois
de assumida a identidade.

## 3. Nova assinatura e ordem das verificações

A função **não existe** na RH (lido: 0 assinaturas), por isso muda sem criar sobrecarga.
`p_nif_tokens` sai (o proxy já não os calcula nem passa para esta RPC). Sem DEFAULTs:
o proxy passa sempre os seis (hash e cifra a NULL explícito quando limpa).

```
public.neg_guardar_nif_pessoa(
  p_actor_auth_uid  uuid,   -- auth.users.id, SÓ definido pelo proxy
  p_organization_id uuid,
  p_entity_id       uuid,
  p_nif             text,
  p_nif_hash        text,
  p_nif_encrypted   text)
RETURNS jsonb  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path = public, pg_temp
```

Ordem (o que muda em relação ao rascunho 600000 está em negrito):
1. Valores (NG009), igual.
2. **Chamador:** `auth.uid() IS NULL` e `auth.role() = 'service_role'`; senão
   `insufficient_privilege`.
3. **Actor:** `p_actor_auth_uid` não nulo; existe `anew_users` com
   `auth_user_id = p_actor_auth_uid AND deleted_at IS NULL` (índice único
   `anew_users_auth_user_id_unique`); tem membership `status='active' AND role_is_client IS
   NOT TRUE` em `p_organization_id`. Qualquer falha: a mesma mensagem genérica
   `insufficient_privilege` (não distingue «não existe» de «não é membro»).
   Nota: os helpers de hoje não olham para `anew_users.status`; para manter paridade
   também não se olha. Se se quiser recusar utilizadores com estado inactivo, é decisão à
   parte (os valores possíveis de `status` não foram lidos).
4. **Assumir identidade:** guardar `request.jwt.claim.sub`, `request.jwt.claim.role` e
   `request.jwt.claims` actuais; `set_config` local dos três para o actor
   (`claims = jsonb_build_object('sub', actor, 'role', 'authenticated')`);
   **afirmar `auth.uid() = p_actor_auth_uid`**, senão RAISE.
5. Passos 3 a 6 do rascunho, sem alterações (organização com pessoas.view e configuração;
   fn_neg_exigir_pessoa; não é ficha de organização; pessoas.edit + âmbito 'edit';
   entidade não partilhada; bloqueio FOR NO KEY UPDATE).
6. Limpar (NIF vazio): igual; não conta tentativa.
7. **Contador** (secção 5), com `actor = p_actor_auth_uid`.
8. Repetido: NG030 (a outra pessoa está no âmbito 'view' do actor) / NG031 genérico,
   **devolvidos** para o contador ficar.
9. Escrita; `unique_violation` → NG031 devolvido.
10. **Repor os três GUCs** e devolver (ponto de saída único).

## 4. GRANT / REVOKE

O default ACL do schema `public` (lido em `pg_default_acl`) dá EXECUTE a `anon`,
`authenticated` e `service_role` em cada função nova criada pelo `postgres`, por isso
`REVOKE … FROM PUBLIC` sozinho não chega:

```
REVOKE ALL ON FUNCTION public.neg_guardar_nif_pessoa(uuid, uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.neg_guardar_nif_pessoa(uuid, uuid, uuid, text, text, text)
  TO service_role;
```

Tabela do contador: `REVOKE ALL … FROM PUBLIC, anon, authenticated` (o default dá-lhes
`arwdDxtm`); service_role mantém o que o default lhe dá (tem BYPASSRLS; é o que a
decisão permite).

## 5. Contador na base (decisão do utilizador)

- Tabela `public.neg_nif_tentativas (actor uuid NOT NULL, janela timestamptz NOT NULL,
  n integer NOT NULL DEFAULT 1 CHECK (n > 0), PRIMARY KEY (actor, janela))`. Não guarda
  NIF nem hash. RLS ligada, sem políticas.
- `k_max constant integer := 10` (nome da constante: `k_max_tentativas_minuto`).
- Limpeza barata: `DELETE … WHERE actor = p_actor_auth_uid AND janela < v_janela - interval
  '1 hour'` — só as linhas do próprio actor, pelo prefixo da chave primária.
- Incremento atómico: `INSERT … VALUES (actor, date_trunc('minute', now()), 1)
  ON CONFLICT (actor, janela) DO UPDATE SET n = t.n + 1 RETURNING t.n`. Pedidos
  concorrentes do mesmo actor serializam na linha.
- `n > k_max` → `RAISE … USING ERRCODE = 'NG032'` (o ROLLBACK desfaz só esse incremento;
  a linha fica em 10, as seguintes no mesmo minuto também falham). O proxy já devolve 429.
- Conta as tentativas que chegam à comparação do NIF, **incluindo NG030/NG031** (são
  devolvidas, não lançadas, para a contagem ficar). As recusas por permissão/âmbito são
  lançadas e não contam: não revelam nada sobre o NIF.
- Limitações aceites (já no rascunho): janela fixa (até 20 em dois segundos na fronteira);
  limite por actor.
- O limite em memória do proxy fica como camada extra.

## 6. Bloco de conferir (acrescentar ao do rascunho)

1. Uma só assinatura; identity args exactamente
   `p_actor_auth_uid uuid, p_organization_id uuid, p_entity_id uuid, p_nif text, p_nif_hash text, p_nif_encrypted text`;
   DEFINER com `search_path=public, pg_temp`.
2. Quem tem EXECUTE: por `aclexplode(proacl)` o conjunto de grantees com EXECUTE é
   exactamente {service_role, dono}; nenhuma entrada com grantee 0 (PUBLIC);
   `has_function_privilege('anon', oid, 'EXECUTE')` e
   `has_function_privilege('authenticated', oid, 'EXECUTE')` falsos;
   `has_function_privilege('service_role', oid, 'EXECUTE')` verdadeiro.
   (O 9b do rascunho, que exigia EXECUTE para authenticated, é substituído.)
3. Nenhuma outra função em `pg_proc` menciona `neg_guardar_nif_pessoa` no `prosrc`.
4. Guarda (antes): md5 de `pg_get_functiondef('auth.uid()')` =
   `ea3b41bf29e2ad573067939329aa088e`, e md5 de `crm_scope_keys`, `has_anew_permission`,
   `get_user_crm_org_ids`, `resolve_lead_access_context`, `fn_neg_pessoa_por_negocio` (a
   lista do rascunho já tem os outros). Conferir (depois): os mesmos md5 inalterados.
5. Tabela `neg_nif_tentativas`: RLS ligada, 0 políticas, 0 privilégios para PUBLIC/anon/
   authenticated (o 9f do rascunho), colunas exactamente `actor, janela, n`, chave primária
   `(actor, janela)`.
6. Os testes SQL (`TESTE-teste-nif-e-dono.sql`) têm de passar a chamar como service_role
   com `p_actor_auth_uid`, e acrescentar: actor nulo, actor inexistente, actor de outra
   organização, actor sem pessoas.edit, actor sem âmbito 'edit' → recusa; chamada como
   authenticated → `permission denied`; 11.ª tentativa no minuto → NG032.

## 7. O que muda no nif-write-proxy

- `handler.ts`
  - Nova lista `SERVER_ONLY_PARAM_KEYS = ['p_actor_auth_uid']`, removida dos params do
    cliente em **todas** as RPCs (como já se faz com os derivados do NIF).
  - Para `neg_guardar_nif_pessoa`: se `caller.isServiceRole` (o `resolveCallerIdentity`
    aceita a chave service_role e o `CRON_SHARED_SECRET`, que dão `authUid` =
    `'service_role'`/`'db_trigger'`) → 403 sem chamar a base; exigir que `caller.authUid`
    seja um UUID; `finalParams.p_actor_auth_uid = caller.authUid`.
  - Chamar esta RPC com o cliente service_role (`deps.supabaseAdmin`, ou uma dep nova
    `serviceClient` para o teste o distinguir), **sem** reencaminhar o `Authorization` do
    utilizador (senão o PostgREST corria como authenticated e recusava). As outras 8 RPCs
    continuam com `createUserClient(authHeader)`.
  - Mapear `42501`/`insufficient_privilege` para 403; NG032 → 429 (já existe); NG030/NG031
    devolvidos → 409 (já existe).
  - Actualizar o comentário da dep `supabaseAdmin` («never used to perform the actual RPC
    write» deixa de ser verdade para esta RPC).
- `index.ts`: criar o cliente com `getServiceRoleKey()` de `_shared/auth.ts` (falha clara
  se faltar a variável).
- `handler.vitest.test.ts`: esta RPC vai ao cliente de serviço e não ao do utilizador;
  `p_actor_auth_uid` vem da identidade e o do cliente é descartado (também noutras RPCs);
  chamador service_role/cron → 403 sem RPC; as outras RPCs continuam no cliente do
  utilizador; erro 42501 → 403.
- Frontend: `src/hooks/pessoas/useGuardarNifPessoa.ts` já chama o proxy
  (`functions.invoke('nif-write-proxy')`); não muda.

**Migration e proxy entram juntos:** com a migration aplicada e o proxy antigo, todas as
gravações de NIF falham (authenticated deixa de ter EXECUTE); com o proxy novo e sem a
migration, falham por assinatura inexistente. Publicar o proxy logo a seguir ao db push.

## 8. Riscos que ficam

- Quem tiver a chave service_role pode gravar em nome de qualquer actor; é o mesmo poder
  que já tem sobre a base inteira.
- Os claims assumidos só têm `sub` e `role`; uma função futura no caminho que leia outro
  claim (email, app_metadata, aal) vê-o vazio.
- Recusas por permissão não contam no limite (são lançadas).
- `anew_users.status` não é verificado (paridade com os helpers de hoje).
