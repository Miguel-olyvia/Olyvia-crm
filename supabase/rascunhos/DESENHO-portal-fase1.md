# Desenho — Portal de admissão, FASE 1 (gravar tudo e submeter, com sessão OTP)

Data: 27/10. Base RH `uetjghdkwbywbftedtth` (confirmado em `supabase/.temp/project-ref`).
Só desenho: nada foi escrito em `supabase/migrations/`, nada aplicado.

Decisões do utilizador (fechadas): (a) rascunho e submeter exigem sessão OTP; o link sozinho
não escreve. (b) NISS e IBAN seguem com o formulário e ficam cifrados no Vault, nunca no
rascunho jsonb, nunca em logs/respostas; sai o botão «Guardar NISS» e o aviso «só NISS e IBAN
gravam». (c) migrations na RH autorizadas. (d) anexos ficam para a fase 2 (410 e UI desactivada).

---

## 0. O que foi confirmado (e como)

| Facto | Como |
|---|---|
| Na base viva só existe `rpc_hr_convite_admissao_rascunho(text,jsonb)` e `rpc_hr_convite_admissao_submeter(text,jsonb,text,inet,text)`, ambas só `service_role`, nenhuma com sessão | catálogo (`pg_proc`, `proacl`) |
| md5 de `pg_get_functiondef` hoje: rascunho `e1eddf2d50abda32fdf39abfdac5170a`; submeter `3e3f82880d01924d109ca35f9a1d62c9`; sensiveis_gravar `28d2e779a75308d183dc1d336ff09c6f`; sessao_exigir `a7bc9d5cc3c0a70500a75fb351dfd811` | catálogo |
| Nenhum objecto da base depende das duas RPCs (pg_depend = 0) | catálogo |
| `hr_convite_sessao_exigir(uuid,text)` existe, sem EXECUTE para ninguém (só postgres) | catálogo |
| O rascunho vivo NÃO olha para o estado do processo nem para a sessão; só used_at/revoked_at/valid_until/attempts | `pg_get_functiondef` |
| O submeter vivo lê o NISS em TEXTO de `p_dados` (`hr_json_texto(p_dados,'niss')`, escreve-o em `pessoas_identificacao.niss`) e o IBAN em texto (`p_dados->>'iban'`, cria/actualiza o segredo da ficha) | `pg_get_functiondef` |
| O submeter vivo escreve DIRECTAMENTE na ficha e marca `used_at`; o trigger `hr_convite_admissao_used_at_transitorio` passa o processo a `concluida`, grava o evento `submetido` e fecha o portal (`portal_encerrado_em`) | `pg_get_functiondef` do trigger |
| Nenhuma função da base passa um processo a `devolvida` nem a `submetida` (não há aprovar/devolver) | catálogo (lista de funções) e grep às migrations |
| `otp_verificar` passa `convidada` → `em_preenchimento`: com sessão válida o estado nunca é `convidada` | `pg_get_functiondef` |
| Migrations no remoto: a mais alta é `20261231800000` (de outro workflow) | `schema_migrations` |
| Edge: `handler.ts:778-780` responde 410 a rascunho/submeter/anexos antes de tudo; `portalAntigoAtivo` nunca é ligado em `index.ts` | código |
| Edge (defeito): `tratarSubmeter` passa `getClientIp(req)` para `p_ip inet`; esse valor pode ser `"unknown"` ou qualquer texto forjado em `x-forwarded-for` → o cast para inet falha → 500. Os anexos já usam `detectClientIp` por isso | código (`_shared/rateLimit.ts:51-58`, `handler.ts:673` vs `:738`); não reproduzido ao vivo |
| Edge (fuga menor): `registarRecusa` corre ANTES de qualquer verificação de sessão (pedido_invalido, assinatura_obrigatoria) e `rpc_hr_convite_admissao_registar_recusa` é só por token: quem só tem o link escreve `ultima_recusa_*` | código + catálogo |

---

## 1. DECISÃO QUE FALTA (vai ao utilizador antes de executar)

**O que acontece ao submeter na fase 1.** Hoje a única submissão que existe escreve logo na
ficha e conclui o processo (`concluida`). O estado `submetida` + revisão do RH + aprovar/devolver
não tem RPC de aprovação nem de devolução: se o submeter passasse a deixar o processo em
`submetida`, os dados ficariam presos (ninguém os conseguiria levar à ficha).

- **Opção A (recomendada para a fase 1):** manter o comportamento de hoje — submeter escreve na
  ficha e conclui, como no protótipo. Só muda: exige sessão, verifica estado, NISS/IBAN vêm do
  Vault. O texto do botão passa de «Submeter para análise» a «Submeter».
- **Opção B:** submeter = `submetida` (dados ficam no rascunho + Vault), e uma fase seguinte traz
  aprovar/devolver que promove para a ficha. Mais trabalho (duas RPCs novas do RH) e, até lá,
  nada chega à ficha.

O resto deste desenho assume A. Com B mudam só a secção 2.3 (o submeter não escreve na ficha,
grava `estado='submetida'`, `submetido_em`, `submetido_sha256`, sem `used_at`) e o ecrã de sucesso.

Segunda escolha, menor: **depois de concluído, o NISS/IBAN de staging no Vault apaga-se ou
fica?** A V3a deixou escrito «nada os apaga automaticamente até haver prazo validado
juridicamente». O desenho mantém (não apaga); dizer ao utilizador que ficam duas cópias
cifradas (staging e ficha).

---

## 2. (A) Base de dados — uma só migration

Ficheiro: `supabase/rascunhos/NOVO-20261231810000_hr_portal_fase1_rascunho_submeter_com_sessao.sql`
(CRLF; conferir bytes 0x0D = 0x0A). Uma só migration para o PostgREST nunca ver as duas
assinaturas ao mesmo tempo, e numa só transacção.

**Regra de cópia:** os corpos novos partem do `pg_get_functiondef` VIVO (os md5 acima), não de
nenhum ficheiro de migration. A guarda falha se o md5 tiver mudado.

### 2.1 Guardas (DO no início)

- `supabase/.temp/project-ref` não é verificável em SQL: o agente de aplicação confirma-o antes.
- Existem `rpc_hr_convite_admissao_rascunho(text,jsonb)` e `..._submeter(text,jsonb,text,inet,text)`
  com os md5 acima; senão RAISE (alguém mudou-as entretanto: refazer a cópia).
- NÃO existem ainda `rascunho(text,text,jsonb)` nem `submeter(text,text,jsonb,text,inet,text)`.
- Existem `hr_convite_sessao_exigir(uuid,text)`, `hr_convite_rascunho_valido(jsonb)`,
  `vault.decrypted_secrets`, colunas `niss_segredo_id`, `iban_segredo_id`, `submetido_em`.
- Concatenações com colunas "char" do catálogo levam `::text`.

### 2.2 `rpc_hr_convite_admissao_rascunho(p_token_hash text, p_sessao_hash text, p_rascunho jsonb) RETURNS jsonb`

`DROP FUNCTION public.rpc_hr_convite_admissao_rascunho(text, jsonb);` na mesma migration.
`LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public','pg_temp'`.

Ordem (a mesma das RPCs da V3a):
1. `SELECT id, estado, valid_until, used_at, revoked_at, portal_encerrado_em, attempts, devolucao, rascunho ... WHERE token_hash = p_token_hash FOR UPDATE`;
   não encontrado → HRA31 `nao_encontrado` (a Edge dá `convite_invalido`).
2. Portal encerrado/used_at HRA02; revogado HRA03; expirado HRA04; attempts ≥ 10 HRA05.
3. `PERFORM hr_convite_sessao_exigir(v_c.id, p_sessao_hash)` (HRA51/52/53; renova actividade).
4. `estado NOT IN ('em_preenchimento','devolvida')` → HRA38 `estado_invalido`.
5. `jsonb_typeof(p_rascunho) <> 'object'` → HRA10 `pedido_invalido`;
   `octet_length > 20000` → RAISE `rascunho_demasiado_grande` (HRA10; a Edge mapeia pela mensagem);
   `NOT hr_convite_rascunho_valido(p_rascunho)` → RAISE `rascunho_chave_invalida` (HRA10) — antes
   do UPDATE, para nunca chegar ao 23514 do CHECK (que daria erro_inesperado). O CHECK continua a
   proibir `niss`, `iban`, `conta_numero` no jsonb (defesa em profundidade).
6. Em `devolvida`: cada chave cujo valor muda (`p_rascunho->k IS DISTINCT FROM v_c.rascunho->k`,
   na união das chaves dos dois) e que não está em `devolucao->'campos'` → HRA47 `campo_bloqueado`.
   (Hoje inalcançável — nada põe `devolvida` — mas fica coerente com `portal_ler.campos_editaveis`.)
7. `UPDATE ... SET rascunho = p_rascunho WHERE id = v_c.id`.
8. `RETURN jsonb_build_object('ok', true, 'guardado_em', now())`.

Recusas por RAISE (não jsonb `{erro}` como a antiga): nada aqui precisa de sobreviver a um rollback.

### 2.3 `rpc_hr_convite_admissao_submeter(p_token_hash text, p_sessao_hash text, p_dados jsonb, p_assinatura_nome text, p_ip inet, p_user_agent text) RETURNS uuid`

`DROP FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text);`

Prefixo novo (antes de qualquer escrita):
1. SELECT ... FOR UPDATE por token (com `niss_segredo_id`, `iban_segredo_id`, `devolucao`, `estado`);
   HRA31; HRA02/03/04/05 pela mesma ordem do 2.2.
2. `hr_convite_sessao_exigir(v_c.id, p_sessao_hash)`.
3. Estado `em_preenchimento` ou `devolvida`, senão HRA38.
4. `p_dados` objecto, senão HRA10. **`p_dados ?| ARRAY['niss','iban','conta_numero']` → HRA10**
   (recusa NISS/IBAN em texto; a Edge já os retira, isto é a rede).
5. `btrim(p_assinatura_nome)` vazio ou > 200 → HRA10 (a Edge diz `assinatura_obrigatoria` antes).
6. Em `devolvida`: cada chave de `p_dados` tem de estar em `devolucao->'campos'` directamente ou
   pelo nome do rascunho (mapa fixo: `morada_linha1→linha1`, `morada_linha2→linha2`,
   `morada_codigo_postal→codigo_postal`, `morada_localidade→localidade`, `morada_distrito→distrito`,
   `morada_pais→pais`, `conta_swift→conta_bic`; o resto igual), senão HRA47.
7. **NISS e IBAN lidos do Vault (staging):**
   `SELECT decrypted_secret INTO v_niss FROM vault.decrypted_secrets WHERE id = v_c.niss_segredo_id`
   (idem `v_conta_num` com `iban_segredo_id`). Nulos se não houver segredo.

Corpo: o do submeter vivo, com estas substituições e mais nenhuma:
- o `UPDATE ... SET used_at = now(), assinatura_*, rascunho = NULL, ultima_recusa_* = NULL`
  passa a `WHERE id = v_c.id` (já sem as condições de validade, verificadas acima), acrescenta
  `submetido_em = now()`, e fica DEPOIS do prefixo; o bloco «IF NOT FOUND dar o motivo exacto»
  sai (o prefixo já o faz);
- `v_niss := hr_json_texto(p_dados,'niss')` → `v_niss` do Vault (a validação `hr_niss_valido`
  mantém-se, por defesa);
- duplicados: `coalesce(hr_json_texto(p_dados,'niss'), i.niss)` → `coalesce(v_niss, i.niss)`;
- `pessoas_identificacao`: a condição de entrada `p_dados ?| ARRAY[...,'niss',...]` passa a
  `(p_dados ?| ARRAY[... sem 'niss' ...] OR v_niss IS NOT NULL)`; no ON CONFLICT
  `niss = CASE WHEN p_dados ? 'niss'` → `CASE WHEN v_niss IS NOT NULL`;
- `v_conta_num := hr_json_texto(p_dados,'iban')` → `v_conta_num` do Vault (normalização e
  `hr_iban_valido` mantêm-se);
- tudo o resto (pendências/portão, BIC, moradas, fardamento, `hr_registar_acesso_sensivel`,
  `hr_convite_anexos_promover`, `RETURN v_pessoa_id`) igual, letra a letra.

O trigger `used_at_transitorio` continua a pôr `concluida`, o evento `submetido` e a fechar o
portal. Depois disto `portal_ler` e `sair` respondem HRA02: o cliente não volta a ler.

### 2.4 Grants e comentários

Para as duas: `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role;`
`COMMENT ON FUNCTION` a dizer: só service_role, exige sessão (HRA51-53), estados aceites, NISS/IBAN
só pelo Vault (texto recusado com HRA10), desde 20261231810000.
`sensiveis_gravar` não muda (é reutilizada pela Edge, ver 3).

### 2.5 Bloco de conferir (DO no fim, só catálogo)

- `to_regprocedure` das assinaturas antigas é NULL; das novas não é NULL;
- cada nova: `prosecdef`, `proconfig` com search_path, ACL = {postgres, service_role} e mais nada
  (`has_function_privilege('anon'|'authenticated', ..., 'EXECUTE')` falso);
- só UMA função com cada nome em `public` (o PostgREST não pode ficar com duas);
- o corpo novo do submeter não contém `p_dados, 'niss'` nem `p_dados, 'iban'` e contém
  `niss_segredo_id`, `iban_segredo_id`, `hr_convite_sessao_exigir`;
- `hr_convite_sessao_exigir` continua sem EXECUTE para service_role.

### 2.6 Testes da base (antes do push, contra o remoto ainda por corrigir, sem o partir)

Integração por chamada real, NUNCA regex ao `.sql`. Como as RPCs só servem service_role e a regra
proíbe service_role em ficheiros, os testes de comportamento são os da Edge com Supabase simulado
(secção 3) mais a verificação ao vivo na nike depois do push (secção 5). Assumir esta lacuna.
O teste de contrato `src/lib/hr/__tests__/conviteAdmissaoContrato.test.ts` (lê a migration que
define o submeter) vai deixar de ver `niss`/`iban` lidos de `p_dados`: actualizar a expectativa
(passam a vir do Vault), não apagar o teste.

---

## 3. (B) Edge `convite-admissao`

### 3.1 Despacho (`handler.ts`)

- Sai `portalAntigoAtivo` de `DepsConvite` e do teste (`handler.vitest.test.ts:160`).
- Linha 778: só `eAccaoAnexo(accao)` → 410 `portal_em_atualizacao`, incondicional (fase 2).
- `rascunho` e `submeter` seguem para `tratarPublica` (rate limit por IP e por token_hash como hoje).
- Em `tratarPublica`, para `rascunho`/`submeter`: `lerSessaoDoPedido(req, payload)`; sem sessão ou
  formato inválido → 401 `sessao_ausente` sem tocar na base; `sessaoHash = sha256Hex(sessao)` (o de
  `otp.ts`). Reutilizar o padrão de `accoesPortal.ts:280-288`.
- Erros de RPC sempre por `respostaErroRpc` de `accoesPortal.ts` (HRA31→`convite_invalido`,
  `sessao_substituida`→`sessao_expirada`, inesperado reportado só com tipo e SQLSTATE).
- Tectos por hora (inalterados): rascunho 240, submeter 10, ler 120, sensiveis 30.

### 3.2 Acção `rascunho`

Corpo: `{action, token, rascunho: {...45 chaves...}, niss?: string, iban?: string}` (+ sessão no
cabeçalho `x-portal-sessao`).
1. `prepararRascunho(payload.rascunho)` (já retira niss/iban/conta_numero e recusa o resto).
2. `niss`, `iban` por `textoOpcional` (máx. 32 / 64), como `sensiveis`.
3. RPC `rpc_hr_convite_admissao_rascunho(p_token_hash, p_sessao_hash, p_rascunho)`.
4. Só se `niss` ou `iban` vierem: RPC `rpc_hr_convite_admissao_sensiveis_gravar` (reutilizada, com
   o mesmo `sessaoHash`). Se recusar com `niss_invalido`, `iban_invalido` ou `campo_bloqueado`, o
   rascunho JÁ ficou gravado: responde 200 `{ok:true, guardado_em, sensivel_recusado: <código>}`.
   Qualquer outro erro → `respostaErroRpc`.
5. Sucesso: `{ok:true, guardado_em, niss_ultimos4?, iban_ultimos4?}`. Nunca o valor.

Extrair para uma função partilhada (`gravarSensiveisNoVault(svc, tokenHash, sessaoHash, niss, iban)`)
o corpo de `sensiveis()` em `accoesPortal.ts`, usada pela acção `sensiveis`, por `rascunho` e por
`submeter`. A acção pública `sensiveis` mantém-se NESTE deploy (o frontend antigo ainda a chama no
intervalo entre Edge e frontend, ver 5); retira-se num deploy seguinte, quando o novo frontend estiver
publicado (regra «tira-se em todo o lado»).

### 3.3 Acção `submeter`

Corpo: `{action, token, dados: {...CAMPOS_CONVITE...}, assinatura_nome, declaracao: true}`.
1. Sessão (3.1). `dados` objecto, senão `pedido_invalido`; `assinatura_nome` não vazia, senão
   `assinatura_obrigatoria`; `declaracao === true`, senão `pedido_invalido`. **Estas recusas
   prévias NÃO chamam `registarRecusa`** (corrige a escrita sem sessão).
2. Tirar `niss` e `iban` de `dados`; o resto passa por `soCampos(dados, CAMPOS_CONVITE)` com
   `niss` e `iban` FORA da lista branca.
3. Se vierem `niss`/`iban` não vazios: `gravarSensiveisNoVault` primeiro (transacção própria; o
   staging é o sítio certo deles mesmo que a submissão falhe). Recusa → código (e aqui sim
   `registarRecusa`, a sessão já foi aceite pela base).
4. RPC `rpc_hr_convite_admissao_submeter(p_token_hash, p_sessao_hash, p_dados, p_assinatura_nome,
   p_ip, p_user_agent)` com **`p_ip = detectClientIp(req)`** (IP válido ou null, nunca "unknown").
5. Erro → como hoje (`admissao_incompleta` com `campos`; conflitos nunca saem); `registarRecusa`
   só para códigos de `CODIGOS_RECUSA_SUBMISSAO` devolvidos pela base (logo, com sessão válida).
6. Sucesso → `{ok:true}`.

### 3.4 Testes da Edge (vitest, um ficheiro de cada vez, com o bloqueio)

- `portal.vitest.test.ts:941-968` («o link sozinho não escreve»): passa a provar que rascunho e
  submeter SEM sessão dão 401 `sessao_ausente` sem chamar nenhuma RPC; anexos continuam 410.
- Novos: rascunho com sessão chama a RPC nova com `p_sessao_hash` = SHA-256 da sessão e nunca leva
  niss/iban no `p_rascunho`; niss/iban vão a `sensiveis_gravar`; `sensivel_recusado` com o
  rascunho gravado; submeter nunca manda `niss`/`iban` em `p_dados`; `p_ip` null com
  `x-forwarded-for: lixo`; recusas prévias não chamam `registar_recusa`; `sessao_substituida` →
  `sessao_expirada`; nenhuma resposta contém o NISS/IBAN (procurar o valor no corpo serializado).
- `erros.ts`: `portal_em_atualizacao` continua (anexos).

---

## 4. (C) Cliente

### 4.1 Hook real `src/hooks/useConviteAdmissaoPublico.ts`

Novas funções (todas `comSessao = true`, todas tratam `CODIGOS_DE_SESSAO_PERDIDA` com
`encerrarLocalmente`, todas renovam `atividadeRef`):
- `gravarRascunho(rascunho, sensiveis?: {niss?, iban?})` → acção `rascunho`. Devolve
  `{ok, guardadoEm, codigo?, sensivelRecusado?}`; actualiza `dados.niss_ultimos4/iban_ultimos4`.
  Estado novo exposto: `rascunhoGuardadoEm: string | null`, `aGravar: boolean`, `erroRascunho`.
  Fila de um: se uma gravação está em curso, a seguinte espera e só a última vai.
- `gravarRascunhoAoFechar(rascunho)`: em `pagehide`/`visibilitychange=hidden`, `fetch` com
  `keepalive: true` ao URL da função, com a chave publicável e o cabeçalho `x-portal-sessao`
  (`sendBeacon` não leva cabeçalhos). SEM niss/iban (não se manda dado sensível num pedido que
  ninguém confirma).
- `submeter(dados, assinaturaNome)` → acção `submeter` com `declaracao: true`. Sucesso: limpa a
  sessão localmente SEM chamar `sair` (a base já fechou o portal; daria HRA02) e põe
  `concluido = true`. Erro: devolve `{ok:false, codigo, campos?}`.
- Retirar `gravarSensiveis` e `ResultadoSensiveis` (o botão sai).
- Cabeçalho do ficheiro: deixa de dizer «gravar NISS e IBAN» à parte e «V3b».

O NISS/IBAN completos continuam só no estado do formulário enquanto a sessão dura; o hook envia-os
na gravação automática só quando passam o dígito de controlo / mod-97 no cliente e diferem do último
valor enviado (referência em memória, não em estado persistido). Nunca vão para `localStorage`,
`sessionStorage`, registo de erros nem rascunho.

### 4.2 Interface (`src/components/hr/portal/*`, `src/pages/ConviteAdmissao.tsx`)

- `PortalFormulario`: o debounce de 3 s (como o protótipo `RhConviteAdmissao.tsx:233-239`) chama
  `gravarRascunho` com o rascunho sem `aceite`, `niss`, `conta_numero`, e os sensíveis à parte;
  regista `pagehide`/`visibilitychange` só depois de preenchido a partir da `ler`; não grava um
  rascunho igual ao lido. Em `devolvida` envia só as chaves de `campos_editaveis` alteradas.
- Indicador discreto `role="status"` «Rascunho guardado às HH:MM» / «A guardar…» / erro traduzido.
- Página 2: botão **Submeter** real (assinatura e declaração obrigatórias, validação local como o
  protótipo, `admissao_incompleta` leva à página e ao campo). No submeter, `construirPayloadConvite`
  e, em `devolvida`, só as chaves editáveis.
- Ecrã de sucesso dentro do `PortalMoldura` (título h1, foco nele), como o protótipo
  (`hr.convite.sucessoTitulo`/`sucessoDescricao`). Recarregar depois mostra o cartão «encerrado».
- Sai: `PortalSensiveis.tsx` (e o uso em `aposCampo`), `aoGravarSensiveis` de `PortalSessaoAtiva`,
  `aoGuardado` que limpava o campo. A máscara «guardado ****1234» continua na saudação.
- `PortalProximaFase`: saem «Gravar rascunho» e «Submeter»; ficam desactivados e honestos
  «Enviar documentos», «Ver contrato e assinar», «Pedidos de documentos» (e «Corrigir» sai: corrigir
  é o próprio formulário). `PortalDocumentos`: continua só lista + botão desactivado, com o texto a
  dizer «o envio de documentos chega numa próxima fase».
- Traduções (pt, en, es, fr, de): reescrever `portal.formulario.aviso` (o formulário grava
  automaticamente; NISS e IBAN ficam cifrados), `portal.proxima.descricao`/`razao`; novas chaves
  para «Rascunho guardado às {hora}», «A guardar…», «Não foi possível guardar»; `submeter` →
  «Submeter»; remover as chaves só do botão de NISS. Procurar e remover TODAS as variantes.
- `src/lib/hr/portalAdmissao.ts` e `errosAdmissao.ts:167`: comentários V3b, mensagens novas
  (`sensivel_recusado` reutiliza `niss_invalido`/`iban_invalido`). `CODIGOS_DE_ERRO_DO_PORTAL`
  ganha `rascunho_chave_invalida`, `rascunho_demasiado_grande`, `admissao_incompleta`, etc.
- Testes a actualizar: `src/hooks/__tests__/useConviteAdmissaoPublico.test.tsx`,
  `src/pages/__tests__/ConviteAdmissao.test.tsx` e `.anexos.test.tsx` (anexos continuam desactivados).

Fora do âmbito (outro workflow): `src/components/rh-exemplo` fora de `portal/` (o protótipo antigo
chama rascunho/submeter só com o token; vai passar a receber `sessao_ausente`).

---

## 5. (D) Ordem de publicação

1. **Testes da Edge e do cliente a vermelho/verde** no worktree (um ficheiro de cada vez).
2. **Migration** `20261231810000`: listar pendentes (`migration list --linked`) imediatamente antes;
   `db push --linked`. Entre 2 e 3: a Edge publicada ainda responde 410 a rascunho/submeter antes de
   chamar a base, por isso largar as assinaturas antigas não parte nada que esteja vivo. O portal
   continua como hoje (ler + Guardar NISS).
3. **Edge** `convite-admissao`. Entre 3 e 4: o frontend antigo não chama rascunho/submeter (botões
   desactivados) e o «Guardar NISS» continua a funcionar porque a acção `sensiveis` se mantém.
   Nada parte.
4. **Frontend**. Depois: verificação ao vivo com um convite de admissão da org nike
   (b6ffce4f-...; confirmar o organization_id antes): abrir link → OTP → escrever → «Rascunho guardado às» → recarregar, novo OTP,
   ver o rascunho e a máscara do NISS → submeter → sucesso → ficha com NISS e conta → link mostra
   «encerrado». Confirmar por leitura que `rascunho` não tem `niss`/`iban`.
5. Deploy seguinte da Edge: retirar a acção pública `sensiveis`.

Se a migration falhar no push, nada muda (transacção única). Se a Edge falhar no deploy, a base nova
fica sem chamador (inofensivo). Reverter a Edge para a versão anterior é seguro (volta a 410).
Mudelar: estas RPCs e esta Edge são as da base RH; nada disto toca na base principal.

---

## 6. (E) O que a revisão de segurança tem de ver

1. Nenhum caminho escreve com só o token: rascunho, submeter e `registar_recusa` (só depois de a
   base aceitar a sessão). Anexos continuam 410 antes de tudo.
2. As RPCs novas: SECURITY DEFINER, search_path fixo, só service_role; antigas largadas; uma
   função por nome.
3. Ordem das recusas: estado do portal → sessão → estado do processo, sem oráculo novo
   (HRA31 sai como `convite_invalido`, HRA53 como `sessao_expirada`).
4. NISS/IBAN: nunca no `rascunho` (CHECK + Edge), nunca em `p_dados` (Edge + HRA10 na base),
   nunca em resposta, log, Sentry, `error.details`, `captureFlowError`, storage do browser, nem no
   pedido `keepalive`. Só últimos 4 voltam.
5. `devolvida`: só as chaves devolvidas mudam (rascunho e submeter), igual a `sensiveis_gravar`.
6. `p_ip` só IP válido ou null; o user-agent truncado.
7. Vault: o submeter lê `vault.decrypted_secrets` como dono; nenhum grant novo a anon/authenticated.
8. A sessão nunca vai no corpo de um pedido que fique registado nem no URL; o `keepalive` leva-a no
   cabeçalho.
9. Concorrência: duas gravações e um submeter ao mesmo tempo — o `FOR UPDATE` serializa; um
   rascunho que chegue depois do submeter recebe HRA02 (não ressuscita o rascunho).
10. Rate limit: rascunho 240/h por IP e por token; o `sensiveis_gravar` interno não tem balde próprio
    — o cliente só o pede quando o valor muda e é válido.
