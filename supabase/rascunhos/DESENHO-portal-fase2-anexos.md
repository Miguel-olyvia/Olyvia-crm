# Desenho — portal do colaborador, fase 2: os anexos

Estado: **desenho, não é migration**. Nada disto foi aplicado nem se aplica daqui. Base de
referência: RH (`uetjghdkwbywbftedtth`, confirmado em `supabase/.temp/project-ref`), lida **só no
catálogo** a 27/10 (`storage.buckets`, `pg_proc`, `pg_policies`, `cron.job`,
`supabase_migrations.schema_migrations`). Nenhum dado pessoal lido. A Mudelar está noutra base e não
foi tocada.

As marcas **[DECISÃO Dn]** são escolhas que só o utilizador pode fazer; estão juntas na secção 7.
Tudo o resto é proposta técnica com o caminho já escolhido.

---

## 0. O que existe hoje (lido, não suposto)

| Peça | Estado real | Onde |
|---|---|---|
| Tabela `pessoas_anexos` (pendente → ligado → promovido / apagado; `caminho_quarentena`, `limpeza_tentativas`) | aplicada | `20261210050000` (+ `origem`, `apagado_por` em `20261210250000`) |
| 5 RPCs do convite: `rpc_hr_convite_anexo_reservar`, `_contexto`, `_ligar`, `_descartar`, `rpc_hr_convite_anexos_listar` | **vivas, só `service_role`, SECURITY DEFINER, só com o token** — nenhuma chama `hr_convite_sessao_exigir` (lido em `pg_proc.prosrc`) | `20261210060000` (versão única: nenhuma migration posterior as redefine) |
| Convite "vivo" para os anexos | `hr_convite_anexos_motivo`: só `used_at`, `revoked_at`, `valid_until`, `attempts`. **Não olha para `estado` nem para `portal_encerrado_em`** (lido no catálogo: `ve_encerrado = false`) | `20261210060000:82` |
| Promoção | `hr_convite_anexos_promover` (substitui os do RH do mesmo tipo, D1-A) — **chamada hoje dentro de `rpc_hr_convite_admissao_submeter`** (catálogo: `promove = true`) | `20261210070000`, `20261210270000` |
| Limpeza | `hr_convite_anexos_limpar` (a: só convites legado; b: pendentes > 3 h; c: devolve o que a Edge apaga; d: repete promoções falhadas) | redefinida em `20261210420000:1464` |
| **Job de limpeza dos anexos** | **NÃO existe** em `cron.job` (só `hr-convites-admissao-limpar`). A `20261210080000` está aplicada mas não agendou: os segredos `project_functions_url` e `cron_service_role_key` não aparecem em `vault.secrets` nesta base. pg_cron e pg_net existem. | `20261210080000` |
| Sessão do portal | `hr_convite_sessao_exigir(uuid, text)` — interna, sem EXECUTE para ninguém; aceita `p_sessao_hash` ou o cabeçalho `x-portal-sessao`; HRA51/52/53/31; renova a actividade | `20261210430000:476` |
| Leitura do portal | `rpc_hr_convite_admissao_portal_ler` já devolve `anexos [{id, tipo, nome, estado}]` (pendentes e ligados) e `documentos_editaveis` | `20261210430000:1073` |
| Edge | `accoesAnexos.ts` completo (reservar → URL assinado → confirmar por bytes → copiar → ligar → remover); `handler.ts:778-780` responde **410 `portal_em_atualizacao`** às três acções (`portalAntigoAtivo` nunca é ligado em `index.ts`) | `supabase/functions/convite-admissao/` |
| Leitura do conteúdo | `hr-anexo-url`: só `promovido`, matriz por tipo, auditoria antes do URL, TTL 60 s (cartão, IBAN) / 300 s (fotografia) | `supabase/functions/hr-anexo-url/` |
| Frontend | `useConviteAnexos` chama as três acções **sem sessão** e, ao perder a resposta do confirmar, relista pela acção `estado` — que desde a V3a **já não devolve anexos** | `src/hooks/useConviteAnexos.ts:187` |

**Buckets (lido em `storage.buckets`):**

| Bucket | Público | Limite | Tipos permitidos |
|---|---|---|---|
| `hr-documentos-quarantine` | não | 10 485 760 | `application/pdf`, `image/jpeg`, `image/png` |
| `hr-documentos` | não | 10 485 760 | `application/pdf`, `image/jpeg`, `image/png` |

**Políticas de storage (lido em `pg_policies`):** `hr-documentos` tem `hr_documentos_block_select/insert/update/delete`
para `authenticated` (fechado ao cliente); a quarentena só tem `hr_documentos_quarentena_insert` para
`authenticated` com um caminho de 4 UUIDs (`org/pessoa/x/anexo.ext`, dos anexos do RH) — o caminho da
admissão `admissao/<convite>/<anexo>.<ext>` **não casa**, e `anon` não tem política nenhuma. Ou seja:
o browser só escreve na quarentena com o token de upload assinado que a Edge emite.

**O que conclui a leitura:** quase tudo já está construído. A fase 2 é (1) pôr a sessão e o estado do
processo nas 4 RPCs, (2) tirar os anexos do portão 410 da Edge e passar a sessão, (3) ligar o ecrã, e
(4) pôr a limpeza a correr nesta base. Não se desenha nada de raiz.

---

## 1. O fluxo completo

```
 Browser (portal, com sessão OTP)        Edge convite-admissao                 Base (RPC service_role)             Storage
 ─────────────────────────────────       ──────────────────────                ───────────────────────             ───────
 1. escolhe ficheiro (tipo, nome,
    tamanho, mime declarado)
    pré-validação no ecrã (só UX)
         │ action=anexo_url + token
         │ + x-portal-sessao
         ▼
                                         2. rate limit IP + token_hash
                                            sessão presente e bem formada?
                                            validarPedidoAnexo (1.ª recusa)
                                            sanitizarNomeOriginal
                                                     │
                                                     ▼
                                                                               3. _reservar(token, sessao_hash,…)
                                                                                  lock convite; portal activo;
                                                                                  sessao_exigir; estado editável;
                                                                                  tipo/limites; INSERT pendente
                                                                                  bucket=quarentena
                                                     ◄──── {anexo_id, caminho}
                                         4. createSignedUploadUrl(quarentena,
                                            caminho, upsert:false) ─────────────────────────────────────────────► token 2 h
                                            (falhou? descartar upload_abandonado)
         ◄── {anexo_id, caminho, upload_token, upload_url}
 5. PUT directo para a quarentena
    (XHR → progresso real) ───────────────────────────────────────────────────────────────────────────────────► objecto em
                                                                                                                quarentena
    (o Storage recusa > 10 MB e
     content-type fora da lista)
         │ action=anexo_confirmar + anexo_id
         ▼
                                         6. _contexto(token, sessao_hash, id)  ──► pendente deste convite? org/pessoa
                                         7. download da quarentena; tamanho REAL;
                                            assinatura REAL (bytes); limites;
                                            [D2/D3 verificações extra]
                                            recusa → descartar + remove
                                         8. SHA-256; caminho final
                                            <org>/<pessoa>/admissao/<id>.<ext REAL>
                                            upload hr-documentos (upsert:false) ─────────────────────────────────► objecto final
                                         9. _ligar(token, sessao_hash, id, caminho_final, mime, tamanho, hash)
                                                                               repete tudo com os valores REAIS;
                                                                               exige o caminho exacto; ligado
                                            recusa → desfazer (descarta linha, só então
                                            apaga o final e a quarentena)
                                        10. remove a cópia da quarentena (falha = limpeza)
         ◄── {anexo:{id,tipo,nome_original,tamanho_bytes,mime_type}}
 11. remover: action=anexo_remover
                                        12. _descartar(token, sessao_hash, id, 'removido_pela_pessoa')
                                            → {bucket, caminho, caminho_quarentena}; remove os dois
 13. reabrir/recuperar: action=ler (portal_ler devolve os pendentes e ligados)

 Submissão (fase 1): os anexos ligados ficam ligados ao processo (submetida).
 Aprovação (RH): hr_convite_anexos_promover → promovido (visível na ficha).  [D8]
```

**Regras que já estão no código e não mudam** (`accoesAnexos.ts`, cabeçalho):

- o objecto final existe **antes** de a linha passar a `ligado`; se a base recusar, desfaz-se;
- o objecto final só se apaga **depois** de a base confirmar o descarte (nunca há linha ligada sem objecto);
- nenhuma resposta traz `organization_id`, `pessoa_id` nem o caminho final; erros só por código;
- o tipo e o tamanho que contam são os **lidos dos bytes**, nunca os declarados.

**Quarentena → final:** a cópia faz-se na Edge (download + upload com `cacheControl: "0"`), não por
`move`, porque o caminho final é noutro bucket e a extensão vem do tipo real. A cópia da quarentena é
removida logo a seguir a ligar; se falhar, `caminho_quarentena` + `quarentena_removida_em` nulo fazem a
limpeza apanhá-la depois de 3 h (quando o token de upload de 2 h já não vale).

**Mudanças propostas ao fluxo (pequenas):**

1. `anexo_url` devolve também o `signedUrl` que `createSignedUploadUrl` já dá, para o ecrã fazer o
   PUT por `XMLHttpRequest` com `upload.onprogress` (o `uploadToSignedUrl` do supabase-js não dá
   progresso). O caminho continua a sair (é o da quarentena, tem o id do convite e do anexo; não tem
   organização nem pessoa).
2. A recuperação de uma resposta perdida do `anexo_confirmar` passa a usar a acção `ler` (a `estado`
   já não traz anexos): se o id aparece `ligado`, deu certo; se aparece `pendente`, repete-se o
   confirmar (é idempotente: `copiarParaFinal` aceita o objecto final já existente com o mesmo hash).

---

## 2. As RPCs: o que muda e o que fica igual

### 2.1 Uma interna nova (o "abrir" comum)

`hr_convite_anexos_abrir(p_token_hash text, p_sessao_hash text, p_exigir_sessao boolean) RETURNS record`
— **interna, sem EXECUTE para nenhum papel** (como `hr_convite_sessao_exigir`), SECURITY DEFINER não é
precisa porque só corre dentro das RPCs (que já são). Faz, por esta ordem, e **igual à `portal_ler`**:

1. `SELECT … FROM pessoas_convites_admissao WHERE token_hash = p_token_hash FOR UPDATE`;
   não existe → `RAISE nao_encontrado HRA31` (a Edge mostra `convite_invalido`);
2. `portal_encerrado_em` ou `used_at` → `HRA02`; `revoked_at` → `HRA03`; `valid_until <= now()` →
   `HRA04`; `attempts >= 10` → `HRA05`;
3. se `p_exigir_sessao`: `PERFORM hr_convite_sessao_exigir(id, p_sessao_hash)` (HRA51/52/53, renova a actividade);
4. `estado NOT IN ('em_preenchimento','devolvida')` → `HRA38 estado_invalido`
   (`convidada` não chega aqui: `otp_verificar` passa-a a `em_preenchimento` ao abrir a sessão);
5. devolve `id, organization_id, pessoa_id, estado, devolucao`.

**Ordem e modo de bloqueio (corrigido na revisão, R6):** uma só ordem em todas as RPCs do portal —
**convite primeiro (`FOR UPDATE`), depois a sessão (dentro de `sessao_exigir`), depois o anexo
(`FOR UPDATE` por `id` + `convite_id` + `organization_id`)** —, igual à `portal_ler` e à `submeter`.
Um só modo: `FOR UPDATE`. Não há `FOR SHARE` em nenhuma RPC de anexos. A serialização dos 4 envios em
paralelo no convite é aceitável: as RPCs são curtas e o download/hash do confirmar corre **entre** RPCs,
sem lock.

Porquê RAISE e não `{erro}` em jsonb como hoje: as RPCs de anexos não incrementam nada que tenha de
sobreviver (não mexem em `attempts`), e a sessão já recusa por RAISE dentro de `sessao_exigir`. Fica
**um só** padrão para portal/sessão/estado (o da `portal_ler` e da `sensiveis_gravar`, que a Edge já
traduz com `respostaErroRpc`), e o jsonb fica só para as recusas de negócio dos anexos (`anexo_*`),
que a Edge já traduz. Ganha-se também o `portal_encerrado_em`, que hoje os anexos ignoram.

### 2.2 As quatro RPCs: nova assinatura com `p_sessao_hash`, a antiga largada na MESMA migration

Na mesma migration: `DROP FUNCTION` da assinatura antiga **e** `CREATE FUNCTION` da nova (não
`CREATE OR REPLACE`, que com argumentos diferentes cria uma sobrecarga e deixa o PostgREST sem saber
qual escolher — o erro que já parou o botão de resolver submissões). Guarda no topo: a assinatura antiga
tem de existir com o corpo de `20261210060000` (procurar `hr_convite_anexos_motivo` no `prosrc`).

| RPC | Assinatura nova | O que muda no corpo | O que fica igual |
|---|---|---|---|
| `rpc_hr_convite_anexo_reservar` | `(p_token_hash text, p_sessao_hash text, p_tipo text, p_nome_original text, p_tamanho_declarado bigint, p_mime_declarado text, p_ip inet)` | abre por `hr_convite_anexos_abrir(…, true)`; **em `devolvida`, o tipo tem de estar em `devolucao.documentos`** (senão `anexo_tipo_bloqueado`, código novo, 409); nome: além dos `[[:cntrl:]]`, tira os controlos bidireccionais e de largura zero (paridade com `sanitizarNomeOriginal`); filtra `pessoas_anexos` também por `organization_id` do convite | ordem das recusas `anexo_*`, limites 4 / 2-1-1 / 10 MB / 5 MB foto, tecto de reservas [D5], caminho da quarentena, nunca devolve org nem pessoa |
| `rpc_hr_convite_anexo_contexto` | `(p_token_hash text, p_sessao_hash text, p_anexo_id uuid)` | abre com sessão **e estado**, `FOR UPDATE` como as outras (R6: sem `FOR SHARE`); em `devolvida`, repete a verificação do tipo contra `devolucao.documentos` (R7) | `anexo_nao_encontrado` para anexo de outro convite; só `pendente`; devolve org e pessoa só à Edge |
| `rpc_hr_convite_anexo_ligar` | `(p_token_hash text, p_sessao_hash text, p_anexo_id uuid, p_caminho_final text, p_mime text, p_tamanho bigint, p_hash text)` | abre com sessão **e estado**: é aqui que se fecha a corrida com a submissão (o `FOR UPDATE` do convite põe ligar e submeter em fila; depois de submeter, o estado é `submetida` → HRA38 → a Edge desfaz a cópia); em `devolvida`, repete a verificação do tipo contra `devolucao.documentos` → `anexo_tipo_bloqueado` (R7, fecha a janela em que o RH devolve outra lista entre reservar e ligar) | todas as verificações com valores reais; caminho final exacto `<org>/<pessoa>/admissao/<id>.<ext>` construído da linha |
| `rpc_hr_convite_anexo_descartar` | `(p_token_hash text, p_sessao_hash text, p_anexo_id uuid, p_motivo text)` | `removido_pela_pessoa`: abre **com sessão e estado** e, em `devolvida`, só tipos de `devolucao.documentos`; os motivos internos (`formato_invalido`, `demasiado_grande`, `upload_abandonado` — a Edge a desfazer o próprio trabalho) **não chamam `hr_convite_anexos_abrir`** (corrigido, R3): fazem só `SELECT … FOR UPDATE` do convite pelo `token_hash` (sem verificar used/revoked/expirado/bloqueado/encerrado, sem sessão, sem estado) e filtram o anexo por `convite_id` + `organization_id`, como a `060000:497-507` faz hoje de propósito — o desfazer tem de funcionar num convite que acabou de morrer; `upload_abandonado` só aceita linhas `pendente` ou `ligado`, nunca `promovido` | nunca apaga `promovido`; idempotente para a Edge; devolve `{bucket, caminho, caminho_quarentena}` |

**Porque é seguro deixar os motivos internos sem sessão:** a RPC é só `service_role`; a única acção
pública que descarta (`anexo_remover`) fixa o motivo `removido_pela_pessoa` no código da Edge; o browser
nunca escolhe o motivo.

**`rpc_hr_convite_anexos_listar`: largar** (recomendado). Lido: não tem nenhum chamador na Edge nem no
`src` (só a sua própria migration); a `portal_ler` já devolve a lista com sessão. Deixá-la viva é uma
leitura dos nomes dos ficheiros só com o token, sem sessão — exactamente o que a V3a fechou na `estado`.

**`hr_convite_anexos_motivo`: largar** depois de recriar as quatro (fica sem uso). O bloco de conferir
procura `hr_convite_anexos_motivo` no `prosrc` de todas as funções de `public` antes do `DROP` e falha
se encontrar alguma. (Hoje é executável por `service_role` — lido —, inofensivo mas desnecessário.)

Ordem dentro da migration (R9): guardas → `CREATE hr_convite_anexos_abrir` → `DROP` das 4 antigas +
`CREATE` das 4 novas → `DROP rpc_hr_convite_anexos_listar` → só então procurar
`hr_convite_anexos_motivo` no `prosrc` e largá-la. Antes de escrever o `DROP`, reler o corpo em vigor
em `pg_proc` (só SELECT de catálogo).

**Mudam também (corrigido, R2 e R11):** `hr_convite_anexos_limpar` — o passo (d) (promove todo o
`ligado` cujo convite tenha `used_at`, `20261210420000:1573-1582`) passa a exigir
`convite.estado = 'aprovada'`, ou sai quando a promoção for para a aprovação (D8); e acrescenta-se o
passo de retenção (R11, ver a secção de revisões). Sem isto, quando o job começar a correr nesta base
(pela primeira vez), promove para a ficha anexos ainda não aprovados.

**Não mudam:** a tabela `pessoas_anexos` e as suas colunas/grants/RLS; `hr_convite_anexos_promover`
(ver D8/D9 para *onde* é chamada); `hr_convite_anexos_transferir`;
`_objecto_removido`, `_limpeza_estado`; `portal_ler`; `hr_convite_sessao_exigir`; os buckets e as
políticas de storage; as RPCs dos anexos do RH (`rpc_hr_anexo_rh_*`).

---

## 3. Limites e validação no servidor

| Regra | Ecrã (só UX) | Edge (1.ª recusa) | Base (a verdade) | Storage |
|---|---|---|---|---|
| Tipos: `cartao_cidadao` ≤ 2, `comprovativo_iban` ≤ 1, `fotografia` ≤ 1, ≤ 4 activos | sim | — | reservar e ligar (contam pendente + ligado, sob `FOR UPDATE` do convite) | — |
| Em `devolvida`, só os tipos devolvidos | esconde os outros | — | reservar e descartar (novo) | — |
| Formato declarado: pdf/png/jpeg; fotografia só png/jpeg | `accept` | `validarPedidoAnexo` | reservar | `allowed_mime_types` (pelo cabeçalho) |
| **Formato real** pelos bytes (`%PDF-`, `\x89PNG…`, `FF D8 FF`) | — | `detectSignature` + `validarFicheiroReal` no confirmar | ligar repete com o mime real | — |
| Tamanho 10 MB; fotografia 5 MB; vazio recusado | sim | declarado e **real** (`bytes.length`) | reservar (declarado) e ligar (real); CHECK `tamanho_bytes <= 10485760` | `file_size_limit` 10 MB |
| Reservas na vida do convite (apagadas contam) | — | — | 12 hoje [D5] | — |
| Nome do ficheiro | — | `sanitizarNomeOriginal` (base, sem pastas, sem controlo/bidi/largura zero, ≤ 200) | reservar repete (com bidi novo); CHECK 1–200 | **nunca entra no caminho** (o caminho usa o id) |
| Hash | — | SHA-256 dos bytes reais | CHECK hex 64 | — |

**Detecção por conteúdo:** já existe e é por bytes (`_shared/fileSignature.ts`). A extensão e o
`mime_type` gravados vêm da assinatura, nunca do nome nem do declarado. Propostas além disso, todas
**[DECISÃO]** porque custam e mudam o que a pessoa consegue enviar:

- **[D3] — passa a OBRIGATÓRIO antes de abrir o portal (corrigido, R10):** PDF com conteúdo activo:
  recusar (`anexo_conteudo_recusado`) se os bytes contêm `/JavaScript`, `/JS`, `/Launch`,
  `/EmbeddedFile` ou `/OpenAction` com acção (verificação textual barata na Edge, não é um antivírus).
  Os ficheiros são abertos por pessoal do RH: sem isto, um PDF malicioso é um vector de ataque a
  funcionários. **A quarentena não analisa nada** — é só um bucket de passagem até a Edge ler os bytes;
  a única análise é a assinatura de bytes mais esta verificação;
- **[D2]** imagens: recodificar para tirar EXIF (a localização GPS de uma fotografia de telemóvel) e
  qualquer dado anexado depois do fim da imagem (ficheiros poliglotas). Custa CPU na Edge e uma
  dependência de imagem em Deno;
- **[D1]** HEIC (fotografias de iPhone): hoje recusado em três sítios (ecrã, Edge, bucket). O Safari
  costuma converter para JPEG quando o `accept` não inclui HEIC, por isso a recomendação é **não**
  aceitar e manter o `accept` restrito.

Antivírus a sério (ClamAV ou serviço externo) fica fora: não existe na infraestrutura.

---

## 4. Quem lê os anexos depois

| Momento | Quem | Por onde | Regra |
|---|---|---|---|
| A preencher (`em_preenchimento`, `devolvida`) | a própria pessoa | `ler` (com sessão) | só `{id, tipo, nome, estado}`; **sem conteúdo** [D6] |
| Submetido, em revisão (`ligado`) | o RH aprovador | `rpc_hr_admissao_rever_ler` lista `{id, tipo, criado_em, visivel}` por domínio; **abrir o conteúdo não existe hoje** (`hr-anexo-url` só aceita `promovido`) | **[D7]** |
| Aprovado (`promovido`) | RH com a permissão do tipo; a própria pessoa (`view.own`) | `hr-anexo-url` (existe) | matriz em `regras.ts`; auditoria em `pessoas_acessos_sensiveis` **antes** do URL; TTL 60 s / 300 s |
| Cancelado ou rejeitado | só `hr.onboarding.restrito` + `.sensitive` (decisão 10) | ainda não existe | fora desta fase |

**O bucket continua fechado ao cliente:** nada nesta fase cria políticas de storage nem dá SELECT a
colunas novas. Ninguém lê `hr-documentos` directamente (as políticas `block_*` mantêm-se); o conteúdo
só sai por URL assinado curto emitido por uma Edge depois da permissão e da auditoria. A quarentena só
recebe escrita pelo token de upload assinado (2 h, de um só caminho, `upsert:false`).

**[D7] em detalhe — há uma divergência real a decidir:** a revisão (`rever_ler`) mostra o cartão a
quem tem `identificacao.view`, o comprovativo a quem tem `bancarios.view` e a fotografia a quem tem
`pessoais.view`; o `hr-anexo-url` abre o cartão com `identificacao.reveal`, o comprovativo com
`bancarios.edit` e a fotografia com `hr.pessoas.view`. Se a revisão passar a abrir ficheiros `ligado`,
proposta: estender `hr-anexo-url` com um segundo caso — linha `ligado`, convite em `submetida` ou
`devolvida`, `hr.onboarding.approve` **e** a permissão de abertura do tipo (a do `hr-anexo-url`, a mais
forte), auditado com os mesmos campos. É só Edge (lê a tabela com a chave de serviço, filtrando por
`organization_id` da linha); não precisa de migration.

---

## 5. Isolamento, rate limit, erros, órfãos e expiração

**Isolamento por organização (derivado do convite, nunca do pedido):**

- o browser só manda o token, a sessão, o tipo, o nome, o tamanho, o mime e o `anexo_id`;
- a organização e a pessoa saem da linha do convite (`token_hash` → convite), e cada anexo é procurado
  por `id` **e** `convite_id` (proposta: também `organization_id = convite.organization_id`, como a
  `portal_ler` já faz);
- o caminho final é construído pela Edge a partir da linha e a `_ligar` **recusa qualquer outro**;
- a Edge não consulta tabelas directamente nestas acções (só RPCs), por isso a regra do `orgScoped`
  não se aplica; a extensão do `hr-anexo-url` [D7] tem de filtrar por `organization_id`.

**Rate limit (já existe, mantém-se):** por acção, por IP **e** por `token_hash`, 30 por hora
(`handler.ts:560` `tectoPorHora`; `handler.ts:785-801` — **confirmado por leitura a 27/10: dois baldes
separados, um por IP e outro por `token_hash`**, porque o `x-forwarded-for` forja-se). Cobre 4 ficheiros com repetições (cada ficheiro = 1 url + 1 confirmar). O
tecto de reservas por convite [D5] trava o ciclo "carregar e remover". A sessão acrescenta uma
barreira que o link sozinho não tem.

**Erros por código (catálogo `erros.ts`; os novos a marcar):**

| Código | HTTP | Origem |
|---|---|---|
| `sessao_ausente` | 401 | Edge (antes da RPC) ou HRA51 |
| `sessao_expirada` (também para HRA53, como em `respostaErroRpc`) | 401 | HRA52 / HRA53 |
| `convite_invalido` (HRA31 público), `convite_ja_usado`, `convite_revogado`, `convite_expirado`, `convite_bloqueado` | como hoje | HRA31, HRA02–05 |
| `estado_invalido` | 409 | HRA38 |
| `anexo_tipo_bloqueado` **(novo)** | 409 | tipo fora de `devolucao.documentos` em `devolvida` |
| `anexo_tipo_invalido`, `anexo_formato_invalido`, `anexo_fotografia_formato`, `anexo_vazio` | 422 | Edge / RPC |
| `anexo_demasiado_grande`, `anexo_fotografia_demasiado_grande` | 413 | Edge / RPC |
| `anexo_maximo_ficheiros`, `anexo_tipo_cheio`, `anexo_limite_convite` | 409 | RPC |
| `anexo_nao_encontrado` 404, `anexo_nao_carregado` 409, `anexo_estado_invalido` 409, `anexo_falha_envio` | como hoje | |
| `anexo_conteudo_recusado` **(novo, só com D3)** | 422 | Edge |
| `demasiadas_tentativas` | 429 | Edge |

Mudança necessária na Edge: hoje `accoesAnexos.ts` trata **qualquer** `error` de RPC como
`erro_inesperado`; passa a traduzi-lo com `mapearErroRpc`/`respostaErroRpc` (HRA31 → `convite_invalido`,
HRA53 → `sessao_expirada`), reportando ao Sentry só o inesperado.

**Que erros desfazem e quais não (corrigido, R1).** Hoje `ligarOuDesfazer` (`accoesAnexos.ts:358-367`)
chama `desfazerCopia` para **qualquer** erro da RPC — lido. Com a sessão nas RPCs, uma sessão que expira
a meio de um envio (30 min de inactividade / 4 h no total, `20261210430000:461-462`) destruiria um ficheiro
já enviado e gastaria uma das reservas do convite. Regra nova, no `contexto` e no `ligar`:

| Erro | Desfaz? | O que a Edge faz |
|---|---|---|
| HRA51, HRA52, HRA53 (sessão) e HRA31 | **não** | devolve `sessao_ausente`/`sessao_expirada`/`convite_invalido`; a linha fica `pendente`, o objecto fica na quarentena **e** o final já copiado fica (a limpeza (c) apanha-o se nunca for ligado). A pessoa abre nova sessão, a `ler` mostra o `pendente` e o ecrã repete o `anexo_confirmar` (idempotente: `copiarParaFinal` aceita o final com o mesmo hash) |
| HRA38 (`estado_invalido`, ex.: já submetida), HRA02–05 (convite morto) | sim | `desfazerCopia` |
| recusas de negócio `anexo_*` | sim | `desfazerCopia` |
| erro inesperado / excepção de rede | **não** | `erro_inesperado`; a limpeza (b+c) trata ao fim de 3 h |

Consequência no cliente (C7.2 ponto 6): um `pendente` vindo da `ler` **é retomável por confirmar**
enquanto o objecto estiver na quarentena (até 3 h); "Envio por concluir" passa a ter "Concluir envio"
(repete `anexo_confirmar`) além de "Remover"; se o confirmar responder `anexo_nao_carregado`, fica só
"Remover". Teste vitest obrigatório: `ligar` com HRA53 **não** chama `descartar` nem `remove`.

**Motivo de descarte nunca vem do pedido (R14):** a lista é fechada na Edge
(`removido_pela_pessoa` em `anexo_remover`; os internos só dentro de `accoesAnexos.ts`). Teste: um
corpo com `motivo` é ignorado; a RPC recusa `removido_pela_pessoa` sem sessão ou com estado errado.

**Órfãos e expiração:**

| Caso | Quem limpa |
|---|---|
| URL emitido e nunca confirmado | passo (b): pendente > 3 h → `apagado upload_abandonado`; (c) devolve a quarentena **e** os três caminhos finais possíveis |
| Cópia da quarentena que ficou depois de ligar | (c), pela `caminho_quarentena` |
| Removido pela pessoa e o `remove` do Storage falhou | (c), linha apagada sem `objecto_removido_em` |
| Edge morreu entre copiar e ligar | (c), os três caminhos finais da linha apagada |
| Promoção falhada | (d) repete-a |
| Processo novo expirado, cancelado, rejeitado ou convite revogado | **corrigido (R11):** passo novo (e) do job — passado o prazo de retenção [decisão 3 da lista final], apaga objecto e linha (`apagado`, motivo `retencao`), com auditoria. Até haver prazo aprovado, o portal não abre ao público |
| Objecto carregado pelo token reutilizado depois de a linha ser apagada, ou chegado à quarentena depois de submeter | a regra das 3 h de (c); um objecto que chega depois é apanhado pela volta seguinte. **Corrigido (R13):** (c) passa também a varrer a quarentena por prefixo `admissao/<convite>/` e apaga objectos com mais de 3 h sem linha `pendente` correspondente (não só por linhas) |

**Defeito real encontrado (lido no catálogo):** nesta base **o job `hr-convite-anexos-limpar` não
existe** e os dois segredos de que a `20261210080000` depende não estão no Vault. Sem isso nenhuma das
linhas acima acontece: os pendentes nunca passam a apagados e os objectos nunca saem do Storage. A
fase 2 não deve abrir os anexos ao público sem o job a correr. **[D10]**

---

## 6. Migrations e ordem de publicação

**Numeração:** a mais alta aplicada no remoto é `20261231800000` (lido em
`supabase_migrations.schema_migrations`); a fase 1 está a escrever as suas. Usar a partir de
`20261231830000`, e **listar o remoto imediatamente antes** (`supabase migration list --linked`, a partir
deste worktree) para não colidir com a fase 1.

| Versão | Ficheiro | Conteúdo |
|---|---|---|
| `20261231830000` | `hr_portal_anexos_sessao.sql` | guardas (assinaturas antigas com o corpo de 060000; `hr_convite_sessao_exigir(uuid,text)` existe; a fase 1 já tirou a promoção de dentro de `submeter` — ver abaixo); `hr_convite_anexos_abrir` (interna, sem EXECUTE); DROP + CREATE das 4 RPCs (só `service_role`, SECURITY DEFINER, `search_path` fixo); `DROP rpc_hr_convite_anexos_listar`; `DROP hr_convite_anexos_motivo` (com verificação de que nada a usa); `anexo_tipo_bloqueado` documentado. Conferir de estrutura (uma só assinatura por nome, grants, `prosecdef`, `proconfig`) e **conferir ao vivo só na nike** com a sentinela HR900: convite de teste com sessão aberta à mão, reservar sem sessão → HRA51, com sessão diferente → HRA53, em `submetida` → HRA38, em `devolvida` com tipo fora da lista → `anexo_tipo_bloqueado`, ciclo reservar/contexto/ligar/descartar com sessão; tudo desfeito |
| `20261231840000` | `hr_anexos_limpeza_reagendar.sql` | o bloco de agendar de `20261210080000`, idempotente (`cron.unschedule` se existir, depois `schedule`), mas a **falhar** (não só WARNING) se os segredos não existirem — desta vez o job é pré-requisito do portal. Também: `hr_convite_anexos_limpar` com (d) restringido a `aprovada` e os passos (c) por prefixo e (e) de retenção. **Corrigido (R5):** este ficheiro **só entra na pasta das migrations depois de D10 feito e verificado**; até lá vive em `rascunhos/`, para não prender o `db push` das outras (a 830000 e as da fase 1) |

**Dependência com a fase 1 (não lhe toco, só a registo):** a `submeter` viva chama
`hr_convite_anexos_promover`. No modelo B2 a submissão não escreve na ficha; se a fase 1 mantiver essa
chamada, os ficheiros ficam visíveis na ficha **antes** da aprovação. A promoção tem de ir para a
aprovação (`hr_convite_admissao_promover`, como diz o plano de 16/10: "a aprovação confirma que não
ficaram anexos `ligado`"). **[D8]**

**Ordem de publicação:**

1. Pré-requisitos: as migrations da fase 1 aplicadas (sessão em rascunho/submeter; promoção fora da
   `submeter`; a `submeter` trata os `pendente` — ver revisões, R4); os dois segredos no Vault desta
   base [D10]; a Edge `convite-admissao-limpeza` publicada.
   **Verificação dos segredos ANTES do push (R5):** `SELECT name FROM vault.secrets WHERE name IN
   ('project_functions_url','cron_service_role_key')` — só a existência, **nunca** `decrypted_secret`.
   Se faltar algum, a 840000 não vai para a pasta.
2. Testes **antes** do push, contra o remoto ainda por corrigir: o "vermelho" de base já está medido
   por leitura (as 4 RPCs vivas não chamam `hr_convite_sessao_exigir`); o vermelho executável é o vitest
   da Edge com o Supabase simulado (anexo sem sessão tem de dar `sessao_ausente`; RPC com HRA53 tem de
   dar `sessao_expirada`; descartar interno sem sessão continua a funcionar). Não se volta atrás depois.
3. Listar o pendente → `db push` de `830000` e `840000`. **É seguro fazer o push antes da Edge:** a
   Edge viva responde 410 às três acções de anexos antes de chegar à base, por isso nada chama as
   assinaturas antigas nem as novas nesse intervalo.
4. Deploy de `convite-admissao`: anexos fora do portão 410 (passam a exigir sessão em vez do
   `portalAntigoAtivo`); `p_sessao_hash` nas 4 chamadas; tradução dos erros RAISE; `upload_url` na
   resposta; [D3] se decidido. Deploy de `hr-anexo-url` só se [D7].
5. Ecrã: `PortalDocumentos` activo, `useConviteAnexos` com `x-portal-sessao`, recuperação pela `ler`,
   progresso por XHR, `documentos_editaveis` a mandar no que se mostra.
6. Verificar ao vivo na nike, **como visitante** (sem sessão de utilizador): carregar 2 cartões, 1 IBAN,
   1 fotografia; 3.º cartão recusado; PNG renomeado para `.pdf` aceite como PNG; ficheiro de texto
   renomeado `.pdf` recusado; remover; segundo dispositivo → o primeiro recebe "sessão terminou";
   submeter; e confirmar no dia seguinte que o job de limpeza correu (`hr_convite_anexos_limpeza_estado`
   e `cron.job_run_details`). Alarme se o job ficar mais de 24 h sem correr (R11-bis).
7. **Portão de abertura ao público (R12):** só se retira o 410 dos anexos no mesmo deploy em que a guarda
   de sessão da Edge entra; teste automático (vitest da Edge **e** chamada real na nike) prova que
   `anexo_url` sem sessão dá `sessao_ausente` e que a assinatura antiga já não existe em `pg_proc`.
   `portalAntigoAtivo` nunca se liga.

**Impacto na Mudelar:** nenhum agora (está noutra base). As 4 RPCs e a `submeter` são partilhadas com o
portal de admissão da principal: publicar lá exige o mesmo pacote no mesmo push e autorização explícita.

---

## 7. Decisões do utilizador

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| **D1** | Aceitar HEIC (iPhone)? | não (hoje) / sim (bucket, Edge, conversão) | não |
| **D2** | Limpar EXIF/GPS e dados anexados das imagens? | não / recodificar na Edge | sim para a fotografia, se o custo em Deno for aceitável |
| **D3** | Recusar PDF com conteúdo activo? | não / sim (`anexo_conteudo_recusado`) | sim, verificação textual barata |
| **D4** | Anexos obrigatórios para submeter? | nenhum (hoje) / cartão de cidadão / cartão + comprovativo quando há IBAN | por decidir com o RH |
| **D5** | Tecto de reservas por convite com várias devoluções | manter 12 / subir para 20 / repor a cada devolução | subir para 20 (simples) |
| **D6** | A pessoa pode abrir os próprios ficheiros no portal antes de submeter? | não / sim (URL 60 s, com sessão) | não (nome e estado chegam) |
| **D7** | O RH abre ficheiros `ligado` na revisão? Com que permissões (as da revisão ou as do `hr-anexo-url`)? | não / sim com `approve` + permissão de abertura do tipo | sim, com a permissão mais forte |
| **D8** | Onde se promovem os anexos: na submissão (hoje) ou na aprovação (B2)? | — | na aprovação; combinar com a fase 1 |
| **D9** | Reentrada: o ficheiro do convite substitui o que o RH anexou (D1-A, hoje) ou o aprovador escolhe? | — | por decidir (o plano de 16/10 propõe o aprovador) |
| **D10** | Criar os segredos `project_functions_url` e `cron_service_role_key` no Vault da base RH (sem eles não há limpeza) | pelo painel do Supabase, por quem tem acesso | obrigatório antes de abrir os anexos |
| **D11** | Largar `rpc_hr_convite_anexos_listar` | largar / manter | largar (sem chamadores; lê nomes sem sessão) |
| **D12** | Sessão por argumento `p_sessao_hash` (este desenho, como `portal_ler`) ou pelo cabeçalho sem mudar assinaturas (o plano de 16/10) | — | argumento: explícito e testável; o cabeçalho fica como reserva da `sessao_exigir` |

---

# Parte C (secções C7 a C10) — cliente e interface (anexos do portal, fase 2)

Desenho só do browser; o servidor (secções 1 a 6) não é meu. O que o cliente exige dele está em C7.5. Estado: DESENHO. Tudo vem de leitura de código; o que não confirmei está dito.

**Cruzamento com a secção 7 do servidor.** Esta parte usa a numeração C7 a C10 e as decisões C1 a C4, para não colidir com as doze decisões do servidor. C1 é a mesma pergunta que a decisão quatro do servidor (anexos obrigatórios): responde-se uma vez.
Relações: o tecto de 12 reservas (decisão cinco do servidor) pesa nos retries de C7.2; a decisão seis (não abrir ficheiros no portal) é o que este desenho assume (só miniatura local); a decisão oito (promover na aprovação) muda C9.6: se os anexos ficarem `ligado` após submeter, a `ler` ainda os lista e o sucesso pode usá-la; a decisão doze (sessão por argumento) é compatível com C7.2.
Legenda: **[DECISÃO DO UTILIZADOR]** = precisa de escolha. **[PROPOSTA]** = escolha técnica minha.

## C7. O hook de upload

### C7.1 O que já existe e se reutiliza

`src/hooks/useConviteAnexos.ts` (327 linhas) já é o motor: validação local -> `anexo_url` (reserva + URL assinado) -> PUT com progresso para a quarentena (XHR, 120 s) -> `anexo_confirmar`.
Liberta a reserva se o PUT falha; trata a confirmação incerta; `emCurso` trava a submissão; nunca lança; erro por linha em `envios[id].codigoErro`.

O hook do protótipo (`rh-exemplo/hooks/useConviteAnexos.ts`) é simulação em memória: nada a aproveitar.
O cartão do protótipo é, por diff, IGUAL ao real (`src/components/hr/convite/ConviteAnexosCard.tsx`) salvo os imports; logo a "UI da pré-visualização" é o cartão real, que NÃO tem miniatura de imagem. A miniatura local existe à parte: `MiniaturaLocal` + `usePreviewLocal`.

### C7.2 O que o portal muda no hook

1. **Sessão em cada chamada.** `chamarEdge` (linha 83) envia só o token. Na fase 2 cada `anexo_*` leva o cabeçalho `x-portal-sessao` (`CABECALHO_SESSAO`, `lerSessao()`).
   PROPOSTA: terceiro parâmetro `transporte` (assinatura de `chamarEdge`), por omissão o actual; o portal passa um que junta o cabeçalho. Uma só cópia da lógica; o convite antigo não muda.
2. **Sessão perdida.** `sessao_ausente`, `sessao_expirada`, `sessao_substituida` (já em `errosAdmissao.ts`) vão para um novo `erroSessao`, irmão de `erroConvite`.
   `PortalSessaoAtiva` encerra como já faz com a `ler`; os envios em curso são abortados.
3. **Cancelar** (não existe). PROPOSTA: `sinal?: AbortSignal` opcional em `enviarParaQuarentenaComMotivo` (o `onabort` já resolve `falha`); o hook guarda um `AbortController` por envio e expõe `cancelar(id)`, só em `a_enviar`.
   Cancelar liberta a reserva (`anexo_remover`), retira o envio e NÃO mostra erro. Em `a_verificar` não há cancelar (curta; o servidor está a ler os bytes).
4. **Tentar de novo.** Hoje a pessoa escolhe o ficheiro outra vez. PROPOSTA: guardar o `File` em memória (ref, nunca em storage) enquanto o envio está em erro e expor `tentarNovamente(id)`.
   Só para falhas de rede/tempo (`anexo_falha_envio`, tempo esgotado, 5xx), nunca para recusas de negócio (formato, tamanho, limite).
   **Sem repetição automática:** cada tentativa reserva uma linha nova e o convite só admite 12 reservas na vida toda, apagadas incluídas (cabeçalho de `20261210060000_hr_anexos_admissao_rpcs.sql`; código `anexo_limite_convite`).
5. **Tempo esgotado.** Usar `enviarParaQuarentenaComMotivo` (não a versão booleana) para dizer "a ligação está lenta". PROPOSTA: 120 s dá ~0,7 Mbit/s para 10 MB, curto num telemóvel mau; sugiro 180 s (`TEMPO_MAXIMO_ENVIO_MS`).
6. **Anexos que já vêm do servidor.** A `ler` devolve `anexos: [{id, tipo, nome, estado}]`, `estado` `pendente` ou `ligado` (migration `20261210430000`), sem `tamanho_bytes` nem `mime_type`, que o hook espera em `AnexoConvite`.
   - Um `pendente` do servidor é uma reserva sem upload concluído (página fechada a meio): o token de upload perdeu-se. **Corrigido (R1):** se o PUT chegou a acabar (o objecto está na quarentena), é retomável repetindo `anexo_confirmar`; mostra-se "Envio por concluir" com "Concluir envio" e "Remover", e conta nos limites. Se o confirmar responder `anexo_nao_carregado`, fica só "Remover". Acrescenta-se `estado?: "pendente" | "ligado"` a `AnexoConvite`.
   - PROPOSTA: a `ler` devolver também `tamanho_bytes` e `mime_type` (servidor, pequeno). Sem isso o cartão não mostra o tamanho; não bloqueia.
7. **Miniatura local da fotografia.** O hook guarda em memória `Record<anexoId, File>` do enviado nesta sessão, para `MiniaturaLocal`. Depois de recarregar não há miniatura (o URL assinado de leitura é do RH).
8. **Só de leitura.** Se `dados.estado` não é `em_preenchimento` nem `devolvida`, `adicionar` e `remover` recusam. Em `devolvida` só mudam os tipos de `documentos_editaveis` (a `ler` já os calcula).

### C7.3 Onde vive o hook

`PortalDocumentos` só renderiza na página 2. Com o hook lá dentro, voltar à página 1 desmontava-o e perdia envios em curso, o `File` guardado e as miniaturas.
O hook sobe para `PortalFormulario` (vive nas duas páginas) e passa `estadoAnexos` a `PortalDocumentos`.

### C7.4 Componentes reais a reutilizar

- `useConviteAnexos.ts`, `envioQuarentena.ts`, `conviteAnexos.ts` (tipos, limites, `chaveDeErroAnexo`): o motor, com os acrescentos acima.
- `ConviteAnexosCard.tsx`: o cartão, com props novas (secção C8).
- `MiniaturaLocal` (`components/hr/anexos/Miniaturas.tsx`) e `usePreviewLocal`: miniatura.
- `ConvitePagina2` já tem a ranhura `anexos={...}`: não mexe.
- Traduções `hr.convite.anexos.*`: reaproveitar e acrescentar.
- `PortalDocumentos.tsx` (hr/portal): passa a compor o cartão; perde a lista simples e o `BotaoProximaFase`.
Regra "tirar X em todo o lado": ao activar os anexos saem `portal.documentos.vazio` e `portal.proxima.documentos` (botão desactivado "Carregar documentos" em `PortalProximaFase`) das traduções e de `portalTraducoes.test.ts` se os listar. O `BotaoProximaFase` só sai quando a fase 1 activar gravar e submeter.

### C7.5 Dependências do servidor (a fechar nas secções 1 a 6)

- As RPCs de anexos são só por token: confirmam "convite vivo", não a sessão nem o estado do processo (li reservar, contexto, ligar, descartar).
- Têm de exigir a sessão (`hr_convite_sessao_exigir`) e o estado (`em_preenchimento`; em `devolvida`, só os tipos de `devolucao.documentos`). Sem isto o link sozinho continua a escrever anexos, contra o desenho do OTP.
- O 410 `portal_em_atualizacao` (handler.ts:778-780) deixa de valer para anexos no caminho novo. Não ligar `portalAntigoAtivo`: reabriria também `rascunho` e `submeter` sem sessão.
- `tectoPorHora` dá 30 às acções de anexos (handler.ts:555); um ficheiro gasta 3 chamadas. Não confirmei a unidade (por IP ou por token); a rever.
- A `ler` com `tamanho_bytes` e `mime_type`; ela só lista `pendente` e `ligado`, e depois da submissão os anexos passam a `promovido` (ver C9.6).
- Regras do projecto: a migration e o código que a usa entram juntos (ordem: `db push`, Edge, ecrã); testes ANTES do `db push`, contra o remoto na org nike; nunca base local.

## C8. A interface

### C8.1 Onde fica

Na página 2 do formulário do portal, na ranhura `anexos` de `ConvitePagina2`. Um cartão "Documentos" com uma linha por tipo: Cartão de cidadão (até 2), Comprovativo de IBAN (1), Fotografia (1); máximo 4 ficheiros; PDF/PNG/JPEG até 10 MB; fotografia só PNG/JPEG até 5 MB (`LIMITES_ANEXOS`, iguais aos do servidor). Sem arrastar e largar (YAGNI).

### C8.2 Estados de cada linha

| Estado | O que a pessoa vê | Acções |
|---|---|---|
| Vazio | etiqueta, ajuda de formatos e tamanho | Adicionar |
| A enviar | nome, "A enviar...", barra (`progressbar` com nome e valor) e % em texto | Cancelar (novo) |
| A verificar | nome, "A verificar o ficheiro..." | nenhuma |
| Enviado | marca, nome, tamanho, texto "Enviado"; miniatura local na fotografia (novo) | Remover |
| A remover | "A remover..." | nenhuma |
| Envio por concluir (novo, `pendente` do servidor) | nome, "Envio por concluir" | Remover |
| Erro | ícone, palavra "Erro", nome, mensagem traduzida (`role="alert"`) | Tentar de novo (só rede/tempo); escolher outro ficheiro |
| Cheio | botão desactivado, "Limite atingido. Remova um ficheiro para adicionar outro." | Remover |
| Bloqueado (novo; `devolvida`, tipo que o RH não pediu) | "Já enviado; o RH não pediu alteração" | nenhuma |
| Só de leitura (processo submetido) | lista sem acções | nenhuma |

### C8.3 Props novas do cartão

`ConviteAnexosCard` continua presentacional. Acrescentam-se props opcionais, com omissão igual ao comportamento actual (o convite antigo e os testes existentes não mudam): `tiposEditaveis`, `obrigatorios` (vazio por omissão; secção C9), `somenteLeitura`, `aoCancelar`, `aoTentarNovamente`, `previewsLocais`. O texto "Nenhum é obrigatório" de `hr.convite.anexos.descricao` passa a depender da decisão C1 (duas chaves).

### C8.4 Acessibilidade e teclado

Mantém-se o que já está bem: input nativo escondido accionado por botão com texto; nome acessível = texto + etiqueta da linha; `fieldset`/`legend` por linha; `progressbar` com nome; "Enviado" em texto; `role="alert"` nos erros; anúncio da remoção e foco devolvido ao "Adicionar ficheiro". A juntar:
- **Texto além da cor:** o erro leva ícone e a palavra "Erro" (hoje é só texto vermelho); "Obrigatório" em texto, não só asterisco.
- **Cancelar** ("Cancelar envio de {nome}") e **Tentar de novo** ("Tentar de novo: {nome}") com nome acessível completo. Depois de cancelar o foco vai para "Adicionar ficheiro" da linha (o botão que o tinha desapareceu).
- **Alvo táctil:** o botão remover do cartão é 28x28 px (`h-7 w-7`), abaixo dos 44 px que o portal usa (`min-h-11`). No portal passa a 44 px, tal como Cancelar e Tentar de novo.
- **Miniatura:** `alt=""` (decorativa; o nome está ao lado), só PNG/JPEG; um PDF leva ícone e texto.
- **Região viva:** o contador "N de 4 ficheiros" já é `aria-live="polite"`; a barra não anuncia cada percentagem, só início e fim.
- **Resumo de erro** quando a submissão for travada (secção C9): `role="alert"`, foco no primeiro tipo em falta.

### C8.5 Mobile (320 a 390 px)

O nome ocupa a largura e corta com reticências; tamanho e estado passam para uma segunda linha em ecrãs estreitos; os botões de 44 px não podem comprimir o nome.
Sem o atributo `capture`: o seletor nativo já oferece câmara, galeria e ficheiros, e `capture` obrigaria à câmara. Progresso e Cancelar têm de caber no ecrã sem deslocamento lateral.

## C9. Rascunho, submissão e anexos em falta

### C9.1 Estado actual (lido)

O código declara que "um anexo NUNCA é obrigatório nem trava a submissão" (`src/lib/hr/conviteAnexos.ts`, cabeçalho) e o cartão diz "Nenhum é obrigatório".
Nas migrations que li (anexos, convite, sessão OTP) não há verificação de anexos na submissão; o obrigatório lá são campos (`hr_admissao_campos_obrigatorios_org`, `origem='pessoa'` e `posicao='convite'`). Não li a RPC de submissão nova da fase 1; a confirmar.

### C9.2 O que NÃO muda, sejam quais forem as decisões

- **Os ficheiros não entram no rascunho nem nos `dados` da submissão.** Ficam no servidor logo que confirmados (`ligado`), independentes de "Gravar rascunho". Dizer à pessoa, em texto: "Os ficheiros ficam guardados assim que são enviados. Os campos só ficam guardados quando gravar."
- **Gravar rascunho não espera pelos anexos** (são independentes). **Submeter espera:** enquanto `emCurso` (envios ou remoções pendentes) o botão submeter fica `aria-disabled` com a razão ligada por `aria-describedby` (chave `hr.convite.anexos.aguardarEnvio` já existe), como em `RhConviteAdmissao.tsx:376`. Uma remoção pendente seria promovida se se submetesse antes de o servidor a descartar.
- **Um `pendente` antigo (envio por concluir) não trava** a submissão; é informação. O servidor descarta-o na limpeza e não o promove.
- **Validação no servidor sempre.** A obrigatoriedade no cliente é conforto; a submissão repete-a (código novo `anexos_em_falta`, a acrescentar a `errosAdmissao.ts`, às traduções e à Edge).

### C9.3 [DECISÃO DO UTILIZADOR] C1: que anexos são obrigatórios?

- **A. Nenhum (o que existe hoje).** Zero mudança de servidor; o RH pede depois pelos pedidos de documentos. RECOMENDO A na primeira entrega da fase 2: a regra pode vir depois sem refazer o cliente (as props `obrigatorios` ficam previstas, vazias).
- **B. Fixos para todos**, ex.: 1 cartão de cidadão e 1 comprovativo de IBAN. Simples e rígido (estrangeiros, outros documentos).
- **C. Configuráveis por organização**, como os campos: migration, ecrã de configuração do RH e `ler` a devolver `anexos_obrigatorios`. Mais flexível, mais trabalho e superfície.
- **D. Só o IBAN obrigatório** (variante de B), cartão de cidadão facultativo.

Além da escolha: o cartão de cidadão tem restrições legais de cópia e tratamento em Portugal. Não afirmo a regra exacta; confirmar com quem trata de protecção de dados antes de o tornar obrigatório.

### C9.4 [DECISÃO DO UTILIZADOR] C2: faltam obrigatórios (só se C1 não for A)

- **Bloquear** (mostra o resumo e não avança). RECOMENDO: é o que o servidor também fará.
- **Avisar e deixar submeter**, se o RH quiser receber processos incompletos.
Desenho do bloqueio: o botão submeter NÃO fica desactivado por falta de anexo (desactivado sem razão é opaco para teclado e leitor de ecrã). Fica activo; ao clicar aparece um resumo `role="alert"` por cima do cartão ("Falta enviar: Cartão de cidadão"), cada item a levar o foco ao "Adicionar ficheiro" da linha. Mesmo padrão do convite para campos em falta (`RhConviteAdmissao.tsx:368`). Cada linha obrigatória mostra "Obrigatório" em texto.

### C9.5 [DECISÃO DO UTILIZADOR] C3: processo devolvido

Em `devolvida` o RH indica os tipos a refazer (`devolucao.documentos`).

- **A. Aviso:** a pessoa vê "O RH pediu para refazer: Comprovativo de IBAN" e pode submeter sem trocar o ficheiro.
- **B. Troca obrigatória:** só submete com um ficheiro desse tipo mais recente que a devolução. O servidor compara `ligado_em` com a data da devolução (a `ler` não o devolve hoje). RECOMENDO B quando C1 não for A.
Em qualquer caso, em `devolvida` só são editáveis os tipos pedidos; o fluxo é remover o antigo e adicionar o novo (tipos de 1 ficheiro obrigam a remover primeiro). Dizer isso em texto na linha: "Remova o ficheiro actual para enviar o novo".

### C9.6 O ecrã de sucesso

Depois de `submeter` o processo passa a `submetida`. O hook fica só de leitura (o servidor também recusa: `anexo_estado_invalido` em `promovido`).
Os anexos já NÃO aparecem na `ler` (só lista `pendente` e `ligado`; ao submeter passam a `promovido`). A lista "Enviou N ficheiros" vem do que o hook tinha em memória na submissão. PROPOSTA: não toca no servidor, mas ao reabrir o link o ecrã diz só "Processo submetido".
**[DECISÃO DO UTILIZADOR] C4 (pequena):** querer a lista de ficheiros também ao reabrir o link? Exige mudar a `ler` para incluir `promovido`.

Texto do sucesso: o que foi recebido (nomes e tipos, sem links: o público não descarrega), o que acontece a seguir (o RH analisa; pode ser devolvido). Foco no título; `role="status"`.
Se a submissão falhar com `anexos_em_falta` (servidor), volta-se à página 2 com o resumo de C9.4, sem perder o que a pessoa preencheu.

## C10. Testes e ordem de implementação

### C10.1 Testes (Supabase simulado; nada de base local)

Existem e não se enfraquecem: `src/hooks/__tests__/useConviteAnexos.test.ts`, `ConviteAnexosCard.test.tsx`, `portalTraducoes.test.ts`. Novos:
- `envioQuarentena`: aborta com o `sinal` e resolve `falha` sem erro; `tempo_esgotado` distinto de `falha`.
- Hook com o `transporte` do portal: `x-portal-sessao` em `anexo_url`, `anexo_confirmar` e `anexo_remover` (nunca no corpo nem no registo de erros); `sessao_expirada` e `sessao_substituida` -> `erroSessao`, envios abortados, sem chamadas seguintes.
- Hook: `cancelar` aborta, chama `anexo_remover` e não deixa erro; `tentarNovamente` só para rede/tempo, com reserva nova e nunca automática; `iniciais` com `pendente` conta nos limites; modo só de leitura e `devolvida` com tipos editáveis; regressões já cobertas (confirmação incerta, remoção pendente trava `emCurso`).
- Cartão: cada estado de C8.2; "Erro" e "Obrigatório" em texto; Cancelar e Tentar de novo por teclado com foco devolvido; alvos de 44 px; miniatura só da fotografia local; sem props novas o resultado é o do convite antigo (regressão).
- Portal: ir à página 1 e voltar à 2 com um envio em curso NÃO o perde (C7.3); submeter bloqueado com `emCurso`; resumo de falta com foco (se C1 não for A); sucesso com a lista vinda da memória.
- Edge (vitest do `convite-admissao`): `anexo_*` sem sessão -> `sessao_ausente`; sessão de outro convite, estado errado, ou tipo fora de `documentos_editaveis` em `devolvida` -> recusa; o 410 antigo mantém-se no caminho sem sessão.
- Base (pgTAP ou chamada real à RPC; nunca regex ao texto da migration; ANTES do `db push`, na nike): RPCs de anexos exigem sessão e estado; `ler` devolve `tamanho_bytes` e `mime_type`; `anexos_em_falta` (se C1 não for A).
- Ao vivo, na nike, em browser real e viewport de telemóvel: abrir o link, OTP, enviar os 3 tipos, cancelar um envio, falha de rede (offline) e tentar de novo, recarregar a meio, remover, submeter e ver o sucesso. Só então conta como feito. Sem tocar na Mudelar.

### C10.2 Ordem de implementação

0. **Decisões** C1 a C4 (e o texto do cartão de cidadão). Com C1 = A tudo avança sem regra nova no servidor.
1. **Servidor e código que o usa, juntos** (secções 1 a 6): sessão e estado nas acções de anexos, `ler` com tamanho e mime, `anexos_em_falta` só se C1 não for A. Testes antes do `db push`; depois Edge; depois ecrã.
2. **Camada pura:** `AbortSignal` e motivo em `envioQuarentena`; `estado` em `AnexoConvite`; `anexosEmFalta` e adaptador `AnexoPortal` -> `AnexoConvite` em `conviteAnexos.ts`. Testes primeiro.
3. **Hook:** `transporte`, `erroSessao`, `cancelar`, `tentarNovamente`, miniaturas, modo só de leitura. Testes primeiro; o convite antigo continua a passar.
4. **Cartão:** props novas, estados novos, alvos de 44 px, chaves de tradução (pt, en e as outras línguas existentes).
5. **Integração:** hook em `PortalFormulario`; `PortalDocumentos` compõe o cartão; saem `portal.documentos.vazio` e `portal.proxima.documentos`. A fase 1 (rascunho e submeter) está a ser editada noutro workflow: combinar a ordem de merge em `PortalFormulario` e `PortalProximaFase`.
6. **Submissão e sucesso:** ligar ao botão submeter da fase 1 (trava por `emCurso`; resumo de falta se aplicável) e ao ecrã de sucesso.
7. **Revisão e verificação:** `ecc:react-reviewer`, `ecc:a11y-architect`, `ecc:typescript-reviewer`; `ecc:database-reviewer` e `ecc:security-reviewer` na parte do servidor; `tsc -p tsconfig.app.json` comparado com a base; vitest; verificação ao vivo de C10.1.

### C10.3 Resumo das decisões do utilizador

- **C1** Que anexos são obrigatórios (A nenhum, B fixos, C por organização, D só IBAN). Recomendo A agora.
- **C2** Faltando obrigatórios: bloquear ou só avisar. Recomendo bloquear.
- **C3** Devolvido: troca do documento pedido obrigatória ou só aviso. Recomendo troca obrigatória se C1 não for A.
- **C4** Sucesso com a lista de ficheiros também ao reabrir o link (muda a `ler`) ou só na sessão da submissão.
- Pendente de confirmação externa: restrições legais ao pedir ou guardar o cartão de cidadão.

### C10.4 Riscos e o que não verifiquei

- Não li a RPC de submissão nova nem o código da fase 1 (outro workflow os edita): risco de conflito em `PortalFormulario`.
- Não confirmei a unidade do tecto de 30 acções por hora (IP ou token) nem testei o fluxo ao vivo; é desenho.
- O limite de 12 reservas por convite pode esgotar-se com muitos retries; a mensagem `anexo_limite_convite` existe, mas o caminho de recuperação (pedir novo convite ao RH) não está desenhado.

---

# Revisões e correcções ao desenho

Revisão independente de 27/10 (base de dados e segurança). Os achados ALTOS foram corrigidos **na
própria secção afectada** (marcados "corrigido, Rn"); aqui fica o índice e o tratamento dos médios e
baixos. Confirmado por leitura nesta ronda: `accoesAnexos.ts:358-367` desfaz em qualquer erro da RPC;
o rate limit tem dois baldes (IP e `token_hash`, `handler.ts:785-801`).

## Altos — corrigidos no desenho

| # | Achado | Onde ficou corrigido |
|---|---|---|
| R1 | Sessão expirada a meio de um envio destruía o ficheiro e gastava uma reserva | secção 5 (tabela "que erros desfazem"); C7.2 ponto 6 ("Concluir envio") |
| R2 | O passo (d) da limpeza promove `ligado` com `used_at`, contra D8 | secção 2.2 ("Mudam também"); secção 6 (840000) |
| R10 | Sem análise de conteúdo; PDF activo aberto pelo RH | secção 3: D3 passa a obrigatório; quarentena dita como bucket de passagem |
| R11 | Job de limpeza inexistente e retenção indefinida de dados de candidatos não admitidos | secção 5 (passo (e) de retenção, alarme 24 h); secção 6 (840000 obrigatória antes de abrir); decisões 2 e 3 abaixo |
| R12 | Janela entre fase 1 e fase 2 em que o link sozinho escreve anexos se o 410 cair antes | secção 6, passo 7 (portão de abertura com teste automático) |

## Médios e baixos — tratamento

- **R3 (descartar interno):** corrigido na 2.2 — não chama `abrir`; teste ao vivo na nike: desfazer com
  convite expirado continua a funcionar.
- **R4 (pendentes à deriva depois de submeter) — requisito para a fase 1:** a `submeter`, sob o
  `FOR UPDATE` do convite e na mesma transacção, marca os anexos `pendente` desse convite como
  `apagado` com `upload_abandonado` (não recusa a submissão: um envio por concluir não trava, C9.2).
  Um objecto que chegue à quarentena depois é apanhado pela volta seguinte de (c). A contagem de 4
  activos não mistura rondas porque só conta `pendente`+`ligado`; o tecto de 12 é a decisão 6.
- **R5 (840000 a prender o push):** corrigido na secção 6.
- **R6 (bloqueios):** corrigido na 2.1 — uma ordem, um modo.
- **R7 (tipo no ligar):** corrigido na 2.2 (contexto e ligar repetem a verificação). A regra "cartão ≤ 2"
  conta `pendente`+`ligado` excluindo o próprio id.
- **R8 (teste por regex a migrations):** os testes novos de C10 são só de comportamento (chamada real
  à RPC na nike, conferir ao vivo com HR900). O `loteCAnexosMigrations.test.ts` fica anotado como
  histórico e sai na mesma entrega em que as quatro RPCs mudam (decisão: retirar, não reescrever).
- **R9 (ordem dos DROP):** corrigido na 2.2.
- **R13 (token de upload de 2 h):** o Storage não deixa encurtar o `createSignedUploadUrl` (fixo em 2 h,
  a confirmar na documentação na execução); compensado pelo varrimento da quarentena por prefixo
  (secção 5). `upsert:false` mantém-se; nunca se serve nada da quarentena.
- **R14 (motivo do descarte):** corrigido na secção 5, com teste.
- **R15 (tecto de bytes):** acrescenta-se ao `reservar` um tecto de **30 MB activos** por convite
  (soma de `pendente` declarado + `ligado` real), código `anexo_limite_convite`. Alarme de volume por
  organização fica para a observabilidade (fora desta fase, registado).
- **R16 (D7, permissões do RH):** se D7 = sim, a mais forte: `hr.onboarding.approve` **e** a permissão
  de abertura do tipo do `hr-anexo-url`; filtro por `organization_id` da linha e do convite com
  `_shared/orgScopedQuery.ts`; auditoria antes do URL; TTL 60 s (cartão, IBAN) / 300 s (fotografia);
  teste com utilizador de outra organização a pedir o id → 404.
- **R17 (nome do ficheiro):** sanitização bidi/largura zero também na RPC (já na 2.2); o nome é
  sempre texto (nunca HTML); nunca no `Content-Disposition` sem RFC 5987; confirmar na execução que
  nenhum export concatena o nome sem escapar.
- **R18 (D8, promoção na submissão):** reforça a recomendação — promoção na aprovação; substituição
  automática de anexos de origem RH bloqueada (decisão 5).
- **R19 (fugas por códigos de erro):** aceite — token de alta entropia, rate limit por token e IP antes
  da RPC; Sentry recebe só tipo e SQLSTATE; o caminho devolvido tem só os ids do convite e do anexo.
- **R20 (isolamento):** filtro `id` + `convite_id` + `organization_id` em todas as RPCs (2.1, R6).
- **R21 (EXIF):** ver decisão 4.
- **R22 (cabeçalhos):** URLs de leitura com `Cache-Control: no-store` e
  `Content-Disposition: attachment` + `nosniff`; CSP da página pública com `connect-src` só para o
  Supabase (a verificar na execução); o token, a sessão (`x-portal-sessao`) e os URLs assinados nunca
  entram em logs nem no Sentry.

---

# DECISÕES PARA O UTILIZADOR

1. **Anexos obrigatórios para submeter?** (D4 = C1) Opções: A nenhum / B cartão + IBAN para todos /
   C configurável por organização / D só IBAN. **Recomendo A** nesta entrega. Muda: com A não há regra
   nova no servidor nem `anexos_em_falta`; com B–D, entra o código novo, o resumo de falta e (C) uma
   migration e um ecrã de configuração.
2. **Criar os dois segredos do Vault na base RH** (`project_functions_url`, `cron_service_role_key`)?
   (D10) Opções: sim, pelo painel, por quem tem acesso / não. **Recomendo sim — obrigatório.** Muda:
   sem eles não há job de limpeza e o portal de anexos não abre ao público.
3. **Prazo de retenção** dos ficheiros de processos expirados, cancelados, rejeitados ou revogados?
   Opções: 30 dias / 90 dias / outro prazo dado pelo encarregado de protecção de dados. **Recomendo
   pedir parecer ao DPO e, até lá, 30 dias.** Muda: o passo (e) do job apaga objecto e linha passado o
   prazo; sem prazo aprovado o portal não abre ao público.
4. **Limpar EXIF/GPS da fotografia?** (D2) Opções: não, documentando que fica guardado / sim,
   recodificar na Edge. **Recomendo sim só para a fotografia**, se a biblioteca em Deno for aceitável.
   Muda: CPU e uma dependência na Edge; a localização do telemóvel deixa de ficar guardada.
5. **Onde se promovem os anexos e quem decide na reentrada?** (D8 + D9) Opções: promover na submissão
   (hoje) / na aprovação; na reentrada substitui automaticamente / o aprovador escolhe. **Recomendo na
   aprovação, e o aprovador escolhe.** Muda: combinar com a fase 1 (tirar a promoção da `submeter`) e
   o job deixa de promover sem aprovação.
6. **Tecto de reservas por convite** (D5). Opções: manter 12 / subir para 20 / repor a cada devolução.
   **Recomendo 20**, com o tecto novo de 30 MB activos. Muda: mais margem para repetições sem abrir o
   abuso de armazenamento.
7. **O RH abre os ficheiros na revisão, antes de aprovar?** (D7) Opções: não / sim, com
   `approve` + a permissão mais forte do tipo. **Recomendo sim, com a mais forte.** Muda: só Edge
   (`hr-anexo-url` estendido), sem migration.
8. **A pessoa pode abrir os próprios ficheiros no portal?** (D6) Opções: não / sim (URL 60 s com
   sessão). **Recomendo não.** Muda: nada a construir; só nome e estado.
9. **Aceitar HEIC (iPhone)?** (D1) Opções: não / sim. **Recomendo não.** Muda: nada; o Safari converte.
10. **Largar `rpc_hr_convite_anexos_listar`?** (D11) Opções: largar / manter. **Recomendo largar.**
    Muda: deixa de haver leitura de nomes de ficheiros só com o link.
11. **Processo devolvido: troca do documento obrigatória ou só aviso?** (C3) **Recomendo troca
    obrigatória só se a 1 não for A**; com A, aviso. Muda: com troca obrigatória a `ler` passa a devolver
    `ligado_em` e a submissão compara com a data da devolução.
12. **Faltando obrigatórios: bloquear ou só avisar?** (C2, só se a 1 não for A) **Recomendo bloquear.**
13. **Ver a lista de ficheiros ao reabrir o link depois de submeter?** (C4) Opções: só na sessão da
    submissão / também ao reabrir. **Recomendo só na sessão.** Muda: com "também", a `ler` passa a
    incluir `promovido`/`ligado` de processos submetidos.
14. **Sessão por argumento `p_sessao_hash` ou pelo cabeçalho?** (D12) **Recomendo argumento.** Muda:
    assinaturas novas das 4 RPCs (já é o que o desenho assume).
