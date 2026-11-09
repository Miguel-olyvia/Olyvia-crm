-- ==============================================================================
-- 20270111300000_hr_canal_denuncias
-- ==============================================================================
-- Canal de denuncias (Lei 93/2021) na base RH (uetjghdkwbywbftedtth): tabelas,
-- regras, RPCs e prova. Junta e corrige os rascunhos
-- supabase/rascunhos/NOVO-20261231992000/993000/994000_denuncias_*.sql e segue
-- DESENHO-denuncias.md, com o contrato que o cliente JA ESCRITO espera
-- (src/lib/denuncias/canal.ts, src/hooks/useDenunciasCanal.ts) e o da Edge
-- supabase/functions/denuncia-publica (handler.ts, pedidos.ts, erros.ts).
--
-- PROVISORIO. NAO FAZER db push sem: (1) listar o remoto imediatamente antes,
-- a partir do worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): o unico
-- pendente e este, acima de 20270110710000; (2) correr ESTE ficheiro na nike
-- dentro de BEGIN ... ROLLBACK ANTES do push (o bloco 10, "conferir", e a
-- prova; acaba sempre por desfazer o que escreveu); (3) revisao
-- ecc:database-reviewer e ecc:security-reviewer.
--
--
-- -- O QUE FAZ -----------------------------------------------------------------
--
-- 1. Catalogo: acrescenta hr.denuncias.configurar (perigosa, categoria hr, pai
--    hr.module.access, display_order 771) SEM a dar a nenhum papel. A gestao
--    usa a que ja existe, hr.denuncias.gerir (20270105500000), cuja descricao
--    passa a dizer que so da acesso aos casos a quem for designado.
--    NAO se criam denuncias.gerir/denuncias.configurar (codigos do rascunho):
--    a rota e o menu do cliente ja pedem hr.denuncias.gerir.
--
-- 2. Doze tabelas, TODAS com RLS ligada E FORCADA, uma politica RESTRICTIVE
--    "<tabela>_fechada" (false para todos) e SEM privilegios para PUBLIC,
--    anon, authenticated nem service_role (tabelas e sequencias). So as RPCs
--    SECURITY DEFINER (dono com BYPASSRLS, guarda G0) as leem e escrevem.
--      denuncias_canal           1 por organizacao: ativo, slug_publico, contador
--      denuncias_responsaveis    quem trata (designacao explicita)
--      denuncias                 o caso, SEM identidade e SEM PIN; recebida_em e
--                                uma DATA (anonimato); prazos legais gravados
--      denuncias_acesso          1:1, HMAC do PIN, tentativas, bloqueio, sessao
--      denuncias_identidade      so identificadas (gatilho recusa numa anonima)
--      denuncias_mensagens       conversa canal <-> denunciante (so acrescenta)
--      denuncias_notas           notas internas (so acrescenta; nenhuma RPC do
--                                denunciante a le)
--      denuncias_eventos         historico e registo de acessos (identidade_vista,
--                                exportada, consultada); so acrescenta
--      denuncias_impedidos       visados e conflitos; nunca se apaga, retira-se
--      denuncias_canal_auditoria auditoria da organizacao (so acrescenta)
--      denuncias_limites         contagem por hora da Edge publica (agregada)
--      denuncias_reservas        codigo reservado entre "reservar" e "criar"
--    Nada se apaga: DELETE e TRUNCATE recusados por gatilho em todas as tabelas
--    de historico e do caso (a conservacao de 5 anos fica para depois da
--    decisao D8 e do parecer juridico; ver "FICA DE FORA").
--
-- 3. Prazos legais, gravados na criacao e verificados por CHECK:
--      prazo_confirmar  = recebida_em + 7 dias (acusar a rececao)
--      prazo_seguimento = recebida_em + 3 meses (resposta / seguimento)
--    conservar_ate = data do fecho + 5 anos (limpo ao reabrir).
--
-- 4. Quem ve um caso (definicao UNICA, denuncias_visiveis):
--    elegivel = designado activo em denuncias_responsaveis + membro activo nao
--    cliente + hr.denuncias.gerir na organizacao (ter todas as permissoes sem
--    designacao NAO chega); nao impedido (visado ou conflito) neste caso; e o
--    caso e meu, ou nao tem responsavel elegivel e foi recebido no dia da
--    minha designacao ou depois (ou nao ha outro elegivel nao impedido
--    designado antes dele). Falhar da HRD09, igual a inexistente.
--
-- 5. Anonimato: a anonima nao tem linha de identidade (a _criar descarta
--    p_identidade e p_auth_user_id; o gatilho recusa); origem 'publica'; o
--    evento 'recebida', as mensagens do denunciante e 'denunciante_respondeu'
--    ficam a 00:00 de Lisboa; denuncias_limites so guarda a hora truncada.
--    O PIN nunca chega a base: so o HMAC-SHA-256 hex que a Edge calcula com o
--    pepper (sal = organizacao + codigo). Sessao: a base guarda o SHA-256.
--    Bloqueio por caso: 5 falhas -> 15 min, a dobrar ate 24 h.
--
--
-- -- AS RPCs (assinaturas exactas) -------------------------------------------
--
-- EXECUTE so a authenticated (SECURITY DEFINER, search_path vazio). Sem sessao:
-- 42501. Todas filtram por id E organizacao.
--   rpc_denuncias_listar(p_organization_id uuid) -> jsonb (array)
--   rpc_denuncias_por_confirmar(p_organization_id uuid) -> integer
--   rpc_denuncia_abrir(p_organization_id uuid, p_denuncia_id uuid) -> jsonb
--   rpc_denuncia_confirmar_rececao(p_organization_id uuid, p_denuncia_id uuid, p_mensagem text DEFAULT NULL) -> jsonb
--   rpc_denuncia_gravidade(p_organization_id uuid, p_denuncia_id uuid, p_gravidade text) -> jsonb
--   rpc_denuncia_avaliacao(p_organization_id uuid, p_denuncia_id uuid, p_texto text) -> jsonb
--   rpc_denuncia_atribuir(p_organization_id uuid, p_denuncia_id uuid, p_user uuid) -> jsonb
--   rpc_denuncia_impedir(p_organization_id uuid, p_denuncia_id uuid, p_user uuid, p_motivo text) -> jsonb
--   rpc_denuncia_pedir_informacao(p_organization_id uuid, p_denuncia_id uuid, p_texto text) -> jsonb
--   rpc_denuncia_mensagem(p_organization_id uuid, p_denuncia_id uuid, p_texto text) -> jsonb
--   rpc_denuncia_nota(p_organization_id uuid, p_denuncia_id uuid, p_texto text) -> jsonb
--   rpc_denuncia_concluir(p_organization_id uuid, p_denuncia_id uuid, p_resultado text, p_medidas text, p_fundamentacao text) -> jsonb
--   rpc_denuncia_arquivar(p_organization_id uuid, p_denuncia_id uuid, p_motivo text) -> jsonb
--   rpc_denuncia_reabrir(p_organization_id uuid, p_denuncia_id uuid) -> jsonb
--   rpc_denuncia_identidade_ver(p_organization_id uuid, p_denuncia_id uuid, p_motivo text) -> jsonb
--   rpc_denuncia_exportar(p_organization_id uuid, p_denuncia_id uuid, p_motivo text) -> jsonb
--   rpc_denuncias_responsaveis(p_organization_id uuid) -> jsonb {eu, responsaveis:[{id,nome}]}
--   rpc_denuncias_canal_ler(p_organization_id uuid) -> jsonb {ativo, slug_publico, responsaveis, candidatos, sem_quem_trate}
--   rpc_denuncias_canal_guardar(p_organization_id uuid, p_ativo boolean, p_slug text) -> jsonb
--   rpc_denuncias_canal_publico(p_organization_id uuid) -> jsonb {ativo, slug_publico}
--   rpc_denuncias_responsavel_designar(p_organization_id uuid, p_user uuid) -> jsonb
--   rpc_denuncias_responsavel_remover(p_organization_id uuid, p_user uuid) -> jsonb
--   rpc_denuncia_impedimento_retirar(p_organization_id uuid, p_denuncia_id uuid, p_user uuid) -> jsonb
--   rpc_denuncias_canal_auditoria(p_organization_id uuid, p_limite integer DEFAULT 200) -> jsonb
--   rpc_denuncias_minhas(p_organization_id uuid) -> jsonb (array)
--   rpc_denuncia_minha_responder(p_organization_id uuid, p_denuncia_id uuid, p_texto text) -> jsonb
--
-- EXECUTE so a service_role: SO a Edge denuncia-publica (verify_jwt = false)
-- as chama. E ASSIM que a denuncia anonima pelo link publico funciona SEM
-- sessao: o browser fala com a Edge, nunca com estas RPCs. NAO se da EXECUTE a
-- anon: com ele qualquer pessoa gravava um "HMAC" escolhido por si (sem o
-- pepper, o PIN deixava de proteger), saltava os limites por IP e criava
-- identificadas em nome de outra conta (p_auth_user_id).
--   rpc_denuncia_publica_limitar(p_balde text, p_chave_ip text) -> boolean
--   rpc_denuncia_publica_canal(p_slug text) -> jsonb {ativo, organization_id, organizacao}
--   rpc_denuncia_publica_reservar_codigo(p_slug text, p_chave_ip text, p_reserva_hash text) -> jsonb {organization_id, codigo}
--   rpc_denuncia_publica_criar(p_slug text, p_codigo text, p_reserva_hash text, p_dados jsonb, p_pin_hash text,
--                              p_identidade jsonb, p_auth_user_id uuid, p_impedidos uuid[]) -> jsonb {codigo}
--   rpc_denuncia_publica_entrar(p_slug text, p_codigo text, p_pin_hash text, p_sessao_hash text, p_chave_ip text) -> boolean
--   rpc_denuncia_publica_ler(p_sessao_hash text) -> jsonb
--   rpc_denuncia_publica_responder(p_sessao_hash text, p_texto text) -> jsonb
--   rpc_denuncia_publica_sair(p_sessao_hash text) -> void
--   rpc_denuncias_limpar() -> integer
--
-- Internas (sem EXECUTE para ninguem alem do dono; search_path vazio; nao
-- SECURITY DEFINER): denuncias_hoje, _membro_ativo, _elegiveis,
-- _elegivel_trancado, _eu, _visiveis, _trancar, _evento, _auditar, _instante,
-- _texto, _texto_mensagem, _resumo, _proximo_codigo, _limite_consumir,
-- _limite_publico, _vista_gestor, _vista_denunciante, _sessao, e os gatilhos
-- _regras, _identidade_regras, _impedidos_regras, _so_acrescenta,
-- _sem_truncate.
--
--
-- -- CORRIDAS FECHADAS ----------------------------------------------------------
--
-- * Codigo: o UPDATE do contador tranca a linha do canal; a reserva tem nonce
--   e apaga-se na criacao (um codigo nunca serve duas vezes).
-- * Acoes sobre o caso: verificar, SELECT ... FOR UPDATE e verificar outra vez
--   (um impedimento que entre entretanto fica valido).
-- * Atribuir vs remover responsavel: a ordem de trancas e a MESMA nos dois
--   (linha do responsavel, depois o caso): atribuir tranca FOR SHARE a linha
--   do responsavel escolhido ANTES do caso; remover faz UPDATE dessa linha e
--   so depois liberta os casos dele. Sem isto, um caso atribuido a meio de
--   uma remocao ficava com um responsavel removido.
-- * Entrar com PIN: FOR UPDATE da linha de acesso (contador de falhas certo).
-- * Limites: INSERT ... ON CONFLICT DO UPDATE (atomico).
--
--
-- -- CODIGOS DE ERRO (MESSAGE = codigo; ERRCODE) -------------------------------
--
--   Traduzidos pelo cliente (canal.ts): HRD01 transicao_invalida, HRD02
--   denunciado, HRD03 conflito, HRD04 texto_vazio, HRD05 motivo_curto, HRD06
--   resultado_em_falta, HRD07 fundamentacao_em_falta, HRD08 fechada, HRD09
--   nao_encontrada, HRD10 confirmar_primeiro, HRD11 anonima, HRD12
--   motivo_identidade, HRD14 nao_e_responsavel, HRD15 impedimento_invalido,
--   HRD16 so_responsavel, HRD17 sem_permissao, HRD18 slug_em_uso, HRD19
--   canal_inativo, HRD20 anonima_imutavel, 42501 sem sessao.
--   SEM traducao no cliente (cai em "indisponivel" e e reportado): HRD23
--   dados_invalidos (tambem designar um visado, de proposito), HRD25 limite_mensagens,
--   HRD27 campo_imutavel, HRD28 sem_responsaveis. Da Edge: HRD22
--   limite_excedido, HRD24 sessao_invalida, HRD26 codigo_invalido.
--
--
-- -- FICA DE FORA (de proposito) -------------------------------------------------
--
-- * Anexos (D7 e achado HIGH de metadados em PDF/EXIF): sem tabela nem bucket.
--   rpc_denuncia_abrir devolve "anexos": [] para o cliente nao partir; a Edge
--   ja responde 410 a anexo_*.
-- * Conservacao de 5 anos: nenhuma funcao apaga casos (D8 e juridico).
--   conservar_ate fica gravado; apagar sera outra migration.
-- * Nenhum job pg_cron (nem a limpeza: rpc_denuncias_limpar existe, so
--   service_role, ninguem a agenda ainda).
--
--
-- -- PRECISA DE CODIGO NOVO NO MESMO ENVIO ----------------------------------------
--
-- NAO para nada partir: as tabelas nascem vazias e nenhum papel recebe
-- hr.denuncias.configurar. Para LIGAR o canal: segredos DENUNCIAS_PIN_PEPPER e
-- DENUNCIAS_IP_PEPPER e a Edge denuncia-publica publicada; na nike, dar
-- hr.denuncias.configurar a um papel, designar responsaveis, ligar o canal.
-- Ate la a pagina publica diz "canal indisponivel".
--
--
-- -- O QUE MUDA PARA AS OUTRAS ORGANIZACOES DA BASE RH ---------------------------
--
-- Nada visivel: canal desligado (sem linha em denuncias_canal), ninguem
-- designado. hr.denuncias.gerir passa a precisar de designacao para ver casos
-- (hoje nao ha casos). Mudelar nao esta nesta base.
--
--
-- -- REVISAO DE SEGURANCA (9/11) INCORPORADA ---------------------------------------
--
-- * Guarda G3: compara com o corpo VIVO de has_anew_permission_in_org no
--   remoto RH (o de 20261207000000 + "AND am.role_is_client IS NOT TRUE"; o
--   remoto foi alterado fora das migrations do repositorio).
-- * Fila de casos orfaos (HIGH): o recurso "nao ha outro elegivel designado
--   antes" NAO vale para quem se designou a si proprio, nem quando quem foi
--   designado ou quem o designou removeu um responsavel do canal desde que o
--   caso chegou, nem quando quem o designou esta impedido nesse caso. E
--   remover um responsavel e recusado (HRD28) se deixar casos abertos que
--   mais ninguem veria: a passagem faz-se atribuindo os casos antes.
-- * Conflito oculto do denunciante (HIGH): o conflito automatico de quem
--   denunciou (conflito sem registado_por) responde como "nao e responsavel"
--   (HRD14), nunca HRD03; registar esse utilizador como visado grava e
--   mostra o visado (o indice unico ignora a linha oculta).
-- * Designar quem e visado num caso aberto recusa com o erro generico de
--   dados (HRD23), igual a "nao e membro"; a auditoria do canal so mostra
--   alvo e codigo dos eventos de um caso a quem pode ver esse caso.
-- * Limites: o balde da organizacao (e o global) so conta pedidos que
--   passaram o limite do IP: um IP sozinho gasta no maximo o seu limite.
-- * PIN: acertar limpa a escalada; 24 h sem falhas tambem. ultima_falha_em
--   fica a hora.
-- * Sessao: expira arredondada ao quarto de hora (para cima); tecto
--   ABSOLUTO de 4 h desde a entrada (sessao_inicio_em, ao quarto de hora,
--   para baixo). Expirada = invalida, mesmo sem limpeza.
--
-- POR FAZER FORA DESTA MIGRATION:
-- * Agendar rpc_denuncias_limpar (pg_cron ou chamada periodica da Edge com a
--   chave de servico). Sem isso os hashes de sessao expirados, os limites e
--   as reservas ficam guardados ate alguem a correr (continuam invalidos).
-- * Edge denuncia-publica: no ramo "entrar", contar a leitura do canal
--   (travar('canal') antes de lerCanal), como no ramo "canal".
--
-- RISCO CONHECIDO, NAO RESOLVIDO (M6, por confirmar): as FKs NO ACTION para
-- anew_users (identidade, impedidos, mensagens, notas, eventos,
-- responsaveis) e para pessoas (identidade.pessoa_id) fazem falhar o DELETE
-- fisico de um utilizador ou pessoa que aparece num caso; o erro pode dizer
-- a quem apaga que essa pessoa denunciou. Caminhos que apagam, encontrados
-- no repositorio (nao confirmado quais estao vivos): migrations
-- 20260720010000, 20260908010000, 20261107080000, 20261107090000,
-- 20261207014800; Edge create-client-portal-access,
-- create-supplier-portal-access, register-company.
--
--
-- -- COMO SE REVERTE ---------------------------------------------------------------
--
-- Sem ficheiro de reversao, de proposito. Numa migration nova, so com as
-- tabelas vazias: largar as RPCs e internas (proname LIKE 'denuncia%' OR
-- 'rpc_denuncia%'), os gatilhos e as 12 tabelas (ordem inversa das FKs), e
-- apagar hr.denuncias.configurar do catalogo (e de anew_role_permissions,
-- com a claim service_role, se algum papel a tiver recebido entretanto).
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'denuncias_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ==============================================================================
-- 1. Guardas
-- ==============================================================================
DO $guardas$
DECLARE
  v_n     integer;
  v_lista text;
  v_src   text;
  -- Corpo VIVO de has_anew_permission_in_org(uuid, text, uuid), lido no remoto
  -- RH: e o de 20261207000000 MAIS "AND am.role_is_client IS NOT TRUE" (o
  -- remoto foi alterado fora das migrations do repositorio; nenhum ficheiro
  -- aqui tem este texto). Compara-se o md5 com espacos normalizados dos dois
  -- lados (independente de CRLF e de indentacao).
  k_perm_src constant text := $src$
  SELECT EXISTS (
    SELECT 1
    FROM public.anew_users au
    JOIN public.anew_memberships am
      ON am.user_id = au.id
     AND am.status = 'active'
     AND am.role_is_client IS NOT TRUE
    JOIN public.anew_role_permissions arp
      ON arp.role_id = am.role_id
     AND arp.permission_code = _permission_code
    WHERE au.auth_user_id = _auth_uid
      AND am.organization_id = _organization_id
  )
$src$;
BEGIN
  -- G0. Quem aplica passa a RLS (tabelas FORCE; as RPCs definer correm como o dono).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS; com FORCE RLS as RPCs nao leriam nem gravariam.', current_user::text;
  END IF;

  -- G1. Nomes livres: nenhuma relacao nem funcao de denuncias em public.
  SELECT string_agg(c.relname::text || ' (' || c.relkind::text || ')', ', ') INTO v_lista
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname::text = 'public' AND c.relname::text LIKE 'denuncia%';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G1: ja existem relacoes de denuncias em public: %. Ler o que la esta.', v_lista;
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND (p.proname::text LIKE 'denuncia%' OR p.proname::text LIKE 'rpc_denuncia%');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G1: ja existem funcoes de denuncias em public: %.', v_lista;
  END IF;

  -- G2. Catalogo de permissoes.
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.anew_permissions') AND NOT a.attisdropped
     AND a.attname::text IN ('code', 'name', 'description', 'category', 'parent_code', 'display_order',
                             'is_dangerous', 'scope', 'supports_scope');
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'G2: anew_permissions nao tem as 9 colunas esperadas (encontradas %).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions p
                  WHERE p.code = 'hr.denuncias.gerir' AND p.category = 'hr' AND p.is_dangerous IS TRUE
                    AND p.scope = 'organization') THEN
    RAISE EXCEPTION 'G2: hr.denuncias.gerir nao esta no catalogo como em 20270105500000 (hr, perigosa, organization).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = 'hr.module.access') THEN
    RAISE EXCEPTION 'G2: hr.module.access (pai) nao esta no catalogo.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.anew_permissions p
              WHERE p.code = 'hr.denuncias.configurar'
                AND (p.category IS DISTINCT FROM 'hr' OR p.is_dangerous IS DISTINCT FROM true
                     OR p.scope IS DISTINCT FROM 'organization')) THEN
    RAISE EXCEPTION 'G2: hr.denuncias.configurar ja existe com outra definicao.';
  END IF;
  SELECT string_agg(p.code, ', ') INTO v_lista FROM public.anew_permissions p
   WHERE p.code ILIKE '%denunc%' AND p.code NOT IN ('hr.denuncias.gerir', 'hr.denuncias.configurar');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G2: outras permissoes de denuncias no catalogo (%): desenho paralelo, investigar.', v_lista;
  END IF;

  -- G3. Funcoes de que dependemos.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND p.proname::text = 'has_anew_permission_in_org';
  IF v_n <> 1 OR to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'G3: has_anew_permission_in_org devia existir so como (uuid, text, uuid); ha % assinatura(s).', v_n;
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)')::oid
     AND p.prosecdef AND p.provolatile::text = 's';
  IF v_src IS NULL
     OR md5(btrim(regexp_replace(v_src, '\s+', ' ', 'g'))) IS DISTINCT FROM md5(btrim(regexp_replace(k_perm_src, '\s+', ' ', 'g'))) THEN
    RAISE EXCEPTION 'G3: has_anew_permission_in_org no remoto (md5 normalizado %) nao e o corpo vivo lido a 9/11 (md5 %), ou deixou de ser STABLE SECURITY DEFINER. Reler antes de aplicar.',
      md5(btrim(regexp_replace(coalesce(v_src, ''), '\s+', ' ', 'g'))), md5(btrim(regexp_replace(k_perm_src, '\s+', ' ', 'g')));
  END IF;
  IF to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'G3: auth.uid() nao existe.';
  END IF;

  -- G4. Colunas lidas.
  SELECT count(*) INTO v_n
    FROM (VALUES ('anew_users', 'id'), ('anew_users', 'auth_user_id'), ('anew_users', 'name'), ('anew_users', 'email'),
                 ('anew_users', 'deleted_at'),
                 ('anew_memberships', 'user_id'), ('anew_memberships', 'organization_id'), ('anew_memberships', 'status'),
                 ('anew_memberships', 'role_is_client'), ('anew_memberships', 'role_id'),
                 ('anew_organizations', 'id'), ('anew_organizations', 'name'), ('anew_organizations', 'deleted_at'),
                 ('anew_role_permissions', 'role_id'), ('anew_role_permissions', 'permission_code'),
                 ('pessoas', 'id'), ('pessoas', 'organization_id'),
                 ('pessoas_contas', 'pessoa_id'), ('pessoas_contas', 'organization_id'), ('pessoas_contas', 'anew_user_id'),
                 ('pessoas_contas', 'estado'), ('pessoas_contas', 'revogada_em')) AS e(tabela, coluna)
   WHERE EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.' || e.tabela)
                    AND a.attname::text = e.coluna AND NOT a.attisdropped);
  IF v_n <> 22 THEN
    RAISE EXCEPTION 'G4: faltam colunas esperadas em anew_*/pessoas* (% de 22).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas') AND c.conname::text = 'pessoas_id_org_key'
                    AND c.contype::text = 'u') THEN
    RAISE EXCEPTION 'G4: pessoas nao tem UNIQUE (id, organization_id) (pessoas_id_org_key): a FK composta da identidade falharia.';
  END IF;

  -- G5. Fuso de Lisboa (uma vez, fora de qualquer caminho quente).
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names t WHERE t.name = 'Europe/Lisbon') THEN
    RAISE EXCEPTION 'G5: o fuso Europe/Lisbon nao existe nesta base.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 2. Catalogo de permissoes
-- ==============================================================================
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.denuncias.configurar', 'Configurar o canal de denúncias',
   'Ligar e desligar o canal de denúncias, escolher o endereço público e designar ou remover os responsáveis que tratam os casos. Não dá acesso ao conteúdo das denúncias. Cada alteração fica registada na auditoria do canal.',
   'hr', 'hr.module.access', 771, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

UPDATE public.anew_permissions p
   SET description = 'Abrir a gestão do canal de denúncias. Só mostra casos a quem também estiver designado como responsável do canal nesta organização (hr.denuncias.configurar); quem é visado ou declarou conflito num caso deixa de o ver.'
 WHERE p.code = 'hr.denuncias.gerir';

-- ==============================================================================
-- 3. Funcoes de apoio usadas pelas tabelas
-- ==============================================================================
CREATE FUNCTION public.denuncias_hoje()
RETURNS date
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT (now() AT TIME ZONE 'Europe/Lisbon')::date
$$;

-- ==============================================================================
-- 4. Tabelas
-- ==============================================================================

-- 4.1 Configuracao por organizacao
CREATE TABLE public.denuncias_canal (
  organization_id uuid PRIMARY KEY REFERENCES public.anew_organizations (id),
  ativo           boolean NOT NULL DEFAULT false,
  slug_publico    text NOT NULL,
  ultimo_ano      integer,
  ultimo_numero   integer NOT NULL DEFAULT 0,
  atualizado_por  uuid REFERENCES public.anew_users (id),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT denuncias_canal_slug_formato CHECK (slug_publico ~ '^[a-z0-9][a-z0-9-]{2,38}[a-z0-9]$'),
  CONSTRAINT denuncias_canal_slug_unico UNIQUE (slug_publico),
  CONSTRAINT denuncias_canal_contador CHECK (ultimo_numero >= 0 AND (ultimo_ano IS NULL OR ultimo_ano BETWEEN 2020 AND 2200))
);
CREATE INDEX idx_denuncias_canal_atualizado_por ON public.denuncias_canal (atualizado_por) WHERE atualizado_por IS NOT NULL;

-- 4.2 Responsaveis
CREATE TABLE public.denuncias_responsaveis (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations (id),
  anew_user_id    uuid NOT NULL REFERENCES public.anew_users (id),
  ativo           boolean NOT NULL DEFAULT true,
  designado_por   uuid REFERENCES public.anew_users (id),
  designado_em    timestamptz NOT NULL DEFAULT now(),
  removido_por    uuid REFERENCES public.anew_users (id),
  removido_em     timestamptz,
  CONSTRAINT denuncias_responsaveis_unico UNIQUE (organization_id, anew_user_id),
  CONSTRAINT denuncias_responsaveis_remocao_coerente CHECK (ativo = (removido_em IS NULL))
);
CREATE INDEX idx_denuncias_responsaveis_user ON public.denuncias_responsaveis (anew_user_id);
CREATE INDEX idx_denuncias_responsaveis_designado_por ON public.denuncias_responsaveis (designado_por) WHERE designado_por IS NOT NULL;
CREATE INDEX idx_denuncias_responsaveis_removido_por ON public.denuncias_responsaveis (removido_por) WHERE removido_por IS NOT NULL;

-- 4.3 O caso
CREATE TABLE public.denuncias (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.anew_organizations (id),
  codigo             text NOT NULL,
  anonima            boolean NOT NULL DEFAULT true,
  origem             text NOT NULL,
  tipo               text NOT NULL,
  descricao          text NOT NULL,
  resumo             text NOT NULL,
  quando             text NOT NULL,
  onde               text,
  envolvidos         text,
  ainda_acontece     text NOT NULL DEFAULT 'nao_sei',
  testemunhas        text NOT NULL DEFAULT 'nao_sei',
  ja_reportado       text,
  boa_fe             boolean NOT NULL,
  estado             text NOT NULL DEFAULT 'recebida',
  gravidade          text NOT NULL DEFAULT 'media',
  avaliacao_inicial  text,
  responsavel_id     uuid REFERENCES public.anew_users (id),
  recebida_em        date NOT NULL DEFAULT public.denuncias_hoje(),
  prazo_confirmar    date NOT NULL,
  prazo_seguimento   date NOT NULL,
  confirmada_em      timestamptz,
  resultado          text,
  medidas            text,
  fundamentacao      text,
  decidida_em        timestamptz,
  motivo_arquivo     text,
  fechada_em         timestamptz,
  conservar_ate      date,
  CONSTRAINT denuncias_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT denuncias_codigo_unico UNIQUE (organization_id, codigo),
  CONSTRAINT denuncias_codigo_formato CHECK (codigo ~ '^DEN-[0-9]{4}-[0-9]{4,6}$'),
  CONSTRAINT denuncias_origem_valida CHECK (origem IN ('publica', 'aplicacao')),
  CONSTRAINT denuncias_tipo_valido CHECK (tipo IN ('assedio', 'discriminacao', 'corrupcao', 'fraude',
                                                   'seguranca', 'dados', 'conflito', 'outro')),
  CONSTRAINT denuncias_descricao_tamanho CHECK (length(btrim(descricao)) BETWEEN 30 AND 4000),
  CONSTRAINT denuncias_resumo_tamanho CHECK (length(resumo) <= 200),
  CONSTRAINT denuncias_quando_tamanho CHECK (length(btrim(quando)) BETWEEN 2 AND 200),
  CONSTRAINT denuncias_textos_tamanho CHECK (
        (onde IS NULL OR length(onde) <= 1000)
    AND (envolvidos IS NULL OR length(envolvidos) <= 1000)
    AND (ja_reportado IS NULL OR length(ja_reportado) <= 1000)
    AND (avaliacao_inicial IS NULL OR length(avaliacao_inicial) <= 2000)
    AND (medidas IS NULL OR length(medidas) <= 4000)
    AND (fundamentacao IS NULL OR length(fundamentacao) <= 4000)
    AND (motivo_arquivo IS NULL OR length(motivo_arquivo) <= 2000)),
  CONSTRAINT denuncias_sim_nao CHECK (ainda_acontece IN ('sim', 'nao', 'nao_sei') AND testemunhas IN ('sim', 'nao', 'nao_sei')),
  CONSTRAINT denuncias_boa_fe CHECK (boa_fe),
  CONSTRAINT denuncias_estado_valido CHECK (estado IN ('recebida', 'em_analise', 'mais_info', 'concluida', 'arquivada')),
  CONSTRAINT denuncias_gravidade_valida CHECK (gravidade IN ('baixa', 'media', 'alta')),
  CONSTRAINT denuncias_resultado_valido CHECK (resultado IS NULL OR resultado IN
                                               ('procedente', 'parcialmente_procedente', 'improcedente', 'sem_competencia')),
  -- Prazos legais (Lei 93/2021, contagem a confirmar com o juridico): 7 dias
  -- corridos para acusar a rececao, 3 meses de calendario para o seguimento,
  -- ambos desde a rececao (como prazos.ts).
  CONSTRAINT denuncias_prazos CHECK (prazo_confirmar = recebida_em + 7
                                     AND prazo_seguimento = (recebida_em + interval '3 months')::date),
  CONSTRAINT denuncias_concluida_coerente CHECK (
    (estado = 'concluida') = (resultado IS NOT NULL AND decidida_em IS NOT NULL
                              AND fundamentacao IS NOT NULL AND length(btrim(fundamentacao)) >= 1)),
  CONSTRAINT denuncias_arquivada_coerente CHECK (
    (estado = 'arquivada') = (motivo_arquivo IS NOT NULL AND length(btrim(motivo_arquivo)) >= 3)),
  CONSTRAINT denuncias_fechada_coerente CHECK (
    (estado IN ('concluida', 'arquivada')) = (fechada_em IS NOT NULL AND conservar_ate IS NOT NULL)),
  CONSTRAINT denuncias_confirmada_antes CHECK (
    estado NOT IN ('em_analise', 'mais_info', 'concluida') OR confirmada_em IS NOT NULL)
);
CREATE INDEX idx_denuncias_org_estado ON public.denuncias (organization_id, estado, recebida_em);
CREATE INDEX idx_denuncias_org_responsavel ON public.denuncias (organization_id, responsavel_id);
CREATE INDEX idx_denuncias_responsavel ON public.denuncias (responsavel_id) WHERE responsavel_id IS NOT NULL;
CREATE INDEX idx_denuncias_conservar ON public.denuncias (conservar_ate) WHERE conservar_ate IS NOT NULL;

-- 4.4 Segredo e sessao do acompanhamento (1:1)
CREATE TABLE public.denuncias_acesso (
  denuncia_id         uuid PRIMARY KEY,
  organization_id     uuid NOT NULL,
  pin_hash            text NOT NULL,
  tentativas_falhadas integer NOT NULL DEFAULT 0,
  bloqueios           integer NOT NULL DEFAULT 0,
  bloqueada_ate       timestamptz,
  ultima_falha_em     timestamptz,
  sessao_hash         text,
  sessao_inicio_em    timestamptz,
  sessao_expira_em    timestamptz,
  CONSTRAINT denuncias_acesso_denuncia_fkey FOREIGN KEY (denuncia_id, organization_id)
    REFERENCES public.denuncias (id, organization_id),
  CONSTRAINT denuncias_acesso_hashes CHECK (pin_hash ~ '^[0-9a-f]{64}$'
                                            AND (sessao_hash IS NULL OR sessao_hash ~ '^[0-9a-f]{64}$')),
  CONSTRAINT denuncias_acesso_sessao_coerente CHECK ((sessao_hash IS NULL) = (sessao_expira_em IS NULL)
                                                     AND (sessao_hash IS NULL) = (sessao_inicio_em IS NULL)),
  -- Anonimato: instantes so a hora (falha) e ao quarto de hora (sessao).
  CONSTRAINT denuncias_acesso_instantes_arredondados CHECK (
        (ultima_falha_em IS NULL OR ultima_falha_em = date_trunc('hour', ultima_falha_em))
    AND (sessao_inicio_em IS NULL OR extract(epoch FROM sessao_inicio_em)::bigint % 900 = 0)
    AND (sessao_expira_em IS NULL OR extract(epoch FROM sessao_expira_em)::bigint % 900 = 0)),
  CONSTRAINT denuncias_acesso_contadores CHECK (tentativas_falhadas >= 0 AND bloqueios >= 0)
);
CREATE UNIQUE INDEX idx_denuncias_acesso_sessao ON public.denuncias_acesso (sessao_hash) WHERE sessao_hash IS NOT NULL;
CREATE INDEX idx_denuncias_acesso_org ON public.denuncias_acesso (denuncia_id, organization_id);

-- 4.5 Identidade (so identificadas)
CREATE TABLE public.denuncias_identidade (
  denuncia_id     uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  anew_user_id    uuid REFERENCES public.anew_users (id),
  pessoa_id       uuid,
  nome            text,
  email           text,
  telefone        text,
  pode_contactar  boolean NOT NULL DEFAULT false,
  so_responsavel  boolean NOT NULL DEFAULT true,
  CONSTRAINT denuncias_identidade_denuncia_fkey FOREIGN KEY (denuncia_id, organization_id)
    REFERENCES public.denuncias (id, organization_id),
  CONSTRAINT denuncias_identidade_pessoa_fkey FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id),
  CONSTRAINT denuncias_identidade_tamanhos CHECK (
        (nome IS NULL OR length(nome) BETWEEN 1 AND 200)
    AND (email IS NULL OR (length(email) <= 254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    AND (telefone IS NULL OR length(telefone) BETWEEN 3 AND 40)),
  CONSTRAINT denuncias_identidade_contacto CHECK (NOT pode_contactar OR email IS NOT NULL OR telefone IS NOT NULL)
);
CREATE INDEX idx_denuncias_identidade_user ON public.denuncias_identidade (organization_id, anew_user_id) WHERE anew_user_id IS NOT NULL;
CREATE INDEX idx_denuncias_identidade_user_fk ON public.denuncias_identidade (anew_user_id) WHERE anew_user_id IS NOT NULL;
CREATE INDEX idx_denuncias_identidade_pessoa ON public.denuncias_identidade (pessoa_id, organization_id) WHERE pessoa_id IS NOT NULL;
CREATE INDEX idx_denuncias_identidade_org ON public.denuncias_identidade (denuncia_id, organization_id);

-- 4.6 Conversa
CREATE TABLE public.denuncias_mensagens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq               bigint GENERATED ALWAYS AS IDENTITY,
  organization_id   uuid NOT NULL,
  denuncia_id       uuid NOT NULL,
  autor             text NOT NULL,
  autor_user_id     uuid REFERENCES public.anew_users (id),
  pedido_informacao boolean NOT NULL DEFAULT false,
  texto             text NOT NULL,
  criada_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT denuncias_mensagens_denuncia_fkey FOREIGN KEY (denuncia_id, organization_id)
    REFERENCES public.denuncias (id, organization_id),
  CONSTRAINT denuncias_mensagens_autor CHECK (
    (autor = 'canal' AND autor_user_id IS NOT NULL)
    OR (autor = 'denunciante' AND autor_user_id IS NULL AND NOT pedido_informacao)),
  CONSTRAINT denuncias_mensagens_texto CHECK (length(btrim(texto)) BETWEEN 1 AND 4000)
);
CREATE INDEX idx_denuncias_mensagens_denuncia ON public.denuncias_mensagens (denuncia_id, seq);
CREATE INDEX idx_denuncias_mensagens_org ON public.denuncias_mensagens (denuncia_id, organization_id);
CREATE INDEX idx_denuncias_mensagens_autor ON public.denuncias_mensagens (autor_user_id) WHERE autor_user_id IS NOT NULL;

-- 4.7 Notas internas
CREATE TABLE public.denuncias_notas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             bigint GENERATED ALWAYS AS IDENTITY,
  organization_id uuid NOT NULL,
  denuncia_id     uuid NOT NULL,
  autor_user_id   uuid NOT NULL REFERENCES public.anew_users (id),
  texto           text NOT NULL,
  criada_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT denuncias_notas_denuncia_fkey FOREIGN KEY (denuncia_id, organization_id)
    REFERENCES public.denuncias (id, organization_id),
  CONSTRAINT denuncias_notas_texto CHECK (length(btrim(texto)) BETWEEN 1 AND 4000)
);
CREATE INDEX idx_denuncias_notas_denuncia ON public.denuncias_notas (denuncia_id, seq);
CREATE INDEX idx_denuncias_notas_org ON public.denuncias_notas (denuncia_id, organization_id);
CREATE INDEX idx_denuncias_notas_autor ON public.denuncias_notas (autor_user_id);

-- 4.8 Historico e registo de acessos
CREATE TABLE public.denuncias_eventos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             bigint GENERATED ALWAYS AS IDENTITY,
  organization_id uuid NOT NULL,
  denuncia_id     uuid NOT NULL,
  tipo            text NOT NULL,
  quem_user_id    uuid REFERENCES public.anew_users (id),
  dados           jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT denuncias_eventos_denuncia_fkey FOREIGN KEY (denuncia_id, organization_id)
    REFERENCES public.denuncias (id, organization_id),
  CONSTRAINT denuncias_eventos_tipo CHECK (tipo IN (
    'recebida', 'rececao_confirmada', 'responsavel_atribuido', 'responsavel_libertado',
    'conflito_declarado', 'visado_registado', 'impedimento_retirado', 'gravidade_alterada',
    'avaliacao_alterada', 'mensagem_enviada', 'informacao_pedida', 'denunciante_respondeu',
    'nota_adicionada', 'concluida', 'arquivada', 'reaberta', 'identidade_vista', 'exportada',
    'consultada')),
  -- O denunciante nunca fica como autor; tudo o resto tem autor.
  CONSTRAINT denuncias_eventos_quem CHECK ((tipo IN ('recebida', 'denunciante_respondeu')) = (quem_user_id IS NULL)),
  CONSTRAINT denuncias_eventos_dados CHECK (jsonb_typeof(dados) = 'object' AND octet_length(dados::text) <= 1000),
  -- Ver a identidade e exportar exigem motivo (registo de acessos).
  CONSTRAINT denuncias_eventos_motivo CHECK (
    tipo NOT IN ('identidade_vista', 'exportada')
    OR (jsonb_typeof(dados -> 'motivo') = 'string' AND length(btrim(dados ->> 'motivo')) >= 3))
);
CREATE INDEX idx_denuncias_eventos_denuncia ON public.denuncias_eventos (denuncia_id, seq);
CREATE INDEX idx_denuncias_eventos_org ON public.denuncias_eventos (denuncia_id, organization_id);
CREATE INDEX idx_denuncias_eventos_quem ON public.denuncias_eventos (quem_user_id) WHERE quem_user_id IS NOT NULL;

-- 4.9 Impedidos (visados e conflitos)
CREATE TABLE public.denuncias_impedidos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  denuncia_id     uuid NOT NULL,
  anew_user_id    uuid NOT NULL REFERENCES public.anew_users (id),
  motivo          text NOT NULL,
  registado_por   uuid REFERENCES public.anew_users (id),
  registado_em    timestamptz NOT NULL DEFAULT now(),
  retirado_por    uuid REFERENCES public.anew_users (id),
  retirado_em     timestamptz,
  CONSTRAINT denuncias_impedidos_denuncia_fkey FOREIGN KEY (denuncia_id, organization_id)
    REFERENCES public.denuncias (id, organization_id),
  CONSTRAINT denuncias_impedidos_motivo CHECK (motivo IN ('visado', 'conflito')),
  CONSTRAINT denuncias_impedidos_retirada_coerente CHECK ((retirado_em IS NULL) = (retirado_por IS NULL))
);
-- Um impedimento VISIVEL por pessoa e caso; o conflito oculto do denunciante
-- (conflito sem registado_por) tem indice proprio, para que registar essa
-- pessoa como visado grave e apareca como com qualquer outra (nao a revela).
CREATE UNIQUE INDEX idx_denuncias_impedidos_ativo ON public.denuncias_impedidos (denuncia_id, anew_user_id)
  WHERE retirado_em IS NULL AND NOT (motivo = 'conflito' AND registado_por IS NULL);
CREATE UNIQUE INDEX idx_denuncias_impedidos_oculto ON public.denuncias_impedidos (denuncia_id, anew_user_id)
  WHERE retirado_em IS NULL AND motivo = 'conflito' AND registado_por IS NULL;
CREATE INDEX idx_denuncias_impedidos_user ON public.denuncias_impedidos (anew_user_id, organization_id) WHERE retirado_em IS NULL;
CREATE INDEX idx_denuncias_impedidos_user_fk ON public.denuncias_impedidos (anew_user_id);
CREATE INDEX idx_denuncias_impedidos_org ON public.denuncias_impedidos (denuncia_id, organization_id);
CREATE INDEX idx_denuncias_impedidos_registado_por ON public.denuncias_impedidos (registado_por) WHERE registado_por IS NOT NULL;
CREATE INDEX idx_denuncias_impedidos_retirado_por ON public.denuncias_impedidos (retirado_por) WHERE retirado_por IS NOT NULL;

-- 4.10 Auditoria de organizacao
CREATE TABLE public.denuncias_canal_auditoria (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             bigint GENERATED ALWAYS AS IDENTITY,
  organization_id uuid NOT NULL REFERENCES public.anew_organizations (id),
  tipo            text NOT NULL,
  quem_user_id    uuid NOT NULL REFERENCES public.anew_users (id),
  alvo_user_id    uuid REFERENCES public.anew_users (id),
  denuncia_id     uuid,
  dados           jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT denuncias_canal_auditoria_denuncia_fkey FOREIGN KEY (denuncia_id, organization_id)
    REFERENCES public.denuncias (id, organization_id),
  CONSTRAINT denuncias_canal_auditoria_tipo CHECK (tipo IN (
    'responsavel_designado', 'responsavel_removido', 'canal_alterado', 'visado_registado',
    'conflito_declarado', 'impedimento_retirado', 'autoatribuicao')),
  CONSTRAINT denuncias_canal_auditoria_dados CHECK (jsonb_typeof(dados) = 'object' AND octet_length(dados::text) <= 1000)
);
CREATE INDEX idx_denuncias_canal_auditoria_org ON public.denuncias_canal_auditoria (organization_id, seq DESC);
CREATE INDEX idx_denuncias_canal_auditoria_denuncia ON public.denuncias_canal_auditoria (denuncia_id, organization_id) WHERE denuncia_id IS NOT NULL;
CREATE INDEX idx_denuncias_canal_auditoria_quem ON public.denuncias_canal_auditoria (quem_user_id);
CREATE INDEX idx_denuncias_canal_auditoria_alvo ON public.denuncias_canal_auditoria (alvo_user_id) WHERE alvo_user_id IS NOT NULL;

-- 4.11 Limite de pedidos da Edge publica (agregado por hora)
CREATE TABLE public.denuncias_limites (
  balde    text NOT NULL,
  chave    text NOT NULL,
  janela   timestamptz NOT NULL,
  contagem integer NOT NULL DEFAULT 0,
  PRIMARY KEY (balde, chave, janela),
  CONSTRAINT denuncias_limites_balde CHECK (balde IN ('criar', 'entrar', 'canal', 'sessao')),
  CONSTRAINT denuncias_limites_chave CHECK (chave ~ '^(ip:[0-9a-f]{64}|org:[0-9a-f-]{36}|semip:[0-9a-f-]{36}|global)$'),
  CONSTRAINT denuncias_limites_janela CHECK (janela = date_trunc('hour', janela)),
  CONSTRAINT denuncias_limites_contagem CHECK (contagem >= 0)
);
CREATE INDEX idx_denuncias_limites_janela ON public.denuncias_limites (janela);

-- 4.12 Reservas de codigo entre "reservar" e "criar"
CREATE TABLE public.denuncias_reservas (
  organization_id uuid NOT NULL REFERENCES public.anew_organizations (id),
  codigo          text NOT NULL,
  reserva_hash    text NOT NULL,
  hora            timestamptz NOT NULL,
  PRIMARY KEY (organization_id, codigo),
  CONSTRAINT denuncias_reservas_codigo CHECK (codigo ~ '^DEN-[0-9]{4}-[0-9]{4,6}$'),
  CONSTRAINT denuncias_reservas_hash CHECK (reserva_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT denuncias_reservas_hora CHECK (hora = date_trunc('hour', hora))
);
CREATE INDEX idx_denuncias_reservas_hora ON public.denuncias_reservas (hora);

COMMENT ON TABLE public.denuncias_canal IS 'Canal de denuncias: 1 linha por organizacao (ativo, slug_publico = ?org= da pagina publica, contador do codigo DEN-AAAA-NNNN). RLS forcada, sem privilegios: so por RPC. Desde 20270111300000.';
COMMENT ON TABLE public.denuncias_responsaveis IS 'Quem trata os casos: designacao explicita + hr.denuncias.gerir (denuncias_elegiveis). Remover = ativo false. Desde 20270111300000.';
COMMENT ON TABLE public.denuncias IS 'O caso, sem identidade e sem PIN. recebida_em e uma DATA (anonimato). Prazos legais gravados na criacao (7 dias / 3 meses). Relato imutavel; nunca se apaga. Desde 20270111300000.';
COMMENT ON TABLE public.denuncias_acesso IS 'Acompanhamento por codigo + PIN: so o HMAC-SHA-256 hex do PIN (Edge, com pepper), contador de falhas, bloqueio escalonado e o SHA-256 da sessao (30 min). Nenhuma RPC de gestao le esta tabela. Desde 20270111300000.';
COMMENT ON TABLE public.denuncias_identidade IS 'Identidade de quem denunciou, so em identificadas (gatilho). Le-se so por rpc_denuncia_identidade_ver (motivo, registo identidade_vista ANTES de devolver). Desde 20270111300000.';
COMMENT ON TABLE public.denuncias_mensagens IS 'Conversa canal <-> denunciante. A do denunciante nunca guarda autor; numa anonima fica a 00:00 de Lisboa. So acrescenta. Desde 20270111300000.';
COMMENT ON TABLE public.denuncias_notas IS 'Notas internas dos responsaveis; nenhuma RPC do denunciante le esta tabela. So acrescenta. Desde 20270111300000.';
COMMENT ON TABLE public.denuncias_eventos IS 'Historico do caso e registo de acessos (identidade_vista e exportada com motivo; consultada). Nunca texto de mensagens nem identidade. So acrescenta. Desde 20270111300000.';
COMMENT ON TABLE public.denuncias_impedidos IS 'Visados e conflitos: quem nao ve nem trata o caso. Nunca se apaga; so se retira um visado registado por um responsavel (hr.denuncias.configurar). Desde 20270111300000.';
COMMENT ON TABLE public.denuncias_canal_auditoria IS 'Auditoria da organizacao (designacoes, remocoes, canal, visados, conflitos, impedimentos retirados, auto-atribuicoes). Nunca o conteudo do caso. So acrescenta. Desde 20270111300000.';
COMMENT ON TABLE public.denuncias_limites IS 'Contagens por hora da Edge publica (ip:<HMAC>, org:, semip:, global). Sem instante por pedido nem ligacao a denuncia. Limpa-se com rpc_denuncias_limpar (24 h). Desde 20270111300000.';
COMMENT ON TABLE public.denuncias_reservas IS 'Codigos reservados pela Edge (nonce) a espera da criacao; a criacao apaga a reserva. So a hora truncada. Desde 20270111300000.';

-- ==============================================================================
-- 5. Funcoes internas (sem EXECUTE para ninguem; search_path vazio)
-- ==============================================================================

-- Membro activo e nao cliente da organizacao, com conta nao apagada.
CREATE FUNCTION public.denuncias_membro_ativo(p_organization_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.anew_memberships m
      JOIN public.anew_users u ON u.id = m.user_id
     WHERE m.user_id = p_user AND m.organization_id = p_organization_id
       AND m.status = 'active' AND m.role_is_client IS NOT TRUE
       AND u.deleted_at IS NULL)
$$;

-- Definicao UNICA de quem pode tratar casos na organizacao.
CREATE FUNCTION public.denuncias_elegiveis(p_organization_id uuid)
RETURNS TABLE (anew_user_id uuid, desde date, designado_por uuid)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT r.anew_user_id, (r.designado_em AT TIME ZONE 'Europe/Lisbon')::date, r.designado_por
    FROM public.denuncias_responsaveis r
    JOIN public.anew_users u ON u.id = r.anew_user_id
   WHERE r.organization_id = p_organization_id
     AND r.ativo
     AND u.deleted_at IS NULL
     AND u.auth_user_id IS NOT NULL
     AND public.denuncias_membro_ativo(p_organization_id, r.anew_user_id)
     AND public.has_anew_permission_in_org(u.auth_user_id, 'hr.denuncias.gerir', p_organization_id)
$$;

-- O mesmo, para UM utilizador, trancando FOR SHARE a linha de designacao (fecha
-- a corrida atribuir/remover: remover faz UPDATE dessa linha).
CREATE FUNCTION public.denuncias_elegivel_trancado(p_organization_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF p_organization_id IS NULL OR p_user IS NULL THEN
    RETURN false;
  END IF;
  PERFORM 1
     FROM public.denuncias_responsaveis r
     JOIN public.anew_users u ON u.id = r.anew_user_id
    WHERE r.organization_id = p_organization_id
      AND r.anew_user_id = p_user
      AND r.ativo
      AND u.deleted_at IS NULL
      AND u.auth_user_id IS NOT NULL
      AND public.denuncias_membro_ativo(p_organization_id, p_user)
      AND public.has_anew_permission_in_org(u.auth_user_id, 'hr.denuncias.gerir', p_organization_id)
    FOR SHARE OF r;
  RETURN FOUND;
END;
$$;

-- anew_users.id de quem chama (NULL sem sessao).
CREATE FUNCTION public.denuncias_eu()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT u.id FROM public.anew_users u
   WHERE u.auth_user_id = auth.uid() AND u.deleted_at IS NULL
   ORDER BY u.id
   LIMIT 1
$$;

-- Definicao UNICA de "posso ver/tratar este caso" (p_so NULL = todos).
CREATE FUNCTION public.denuncias_visiveis(p_organization_id uuid, p_eu uuid, p_so uuid)
RETURNS TABLE (denuncia_id uuid)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH el AS MATERIALIZED (
    SELECT e.anew_user_id, e.desde, e.designado_por FROM public.denuncias_elegiveis(p_organization_id) e
  ), me AS (
    SELECT el.desde, el.designado_por FROM el WHERE el.anew_user_id = p_eu
  )
  SELECT d.id
    FROM public.denuncias d
   CROSS JOIN me
   WHERE d.organization_id = p_organization_id
     AND (p_so IS NULL OR d.id = p_so)
     AND NOT EXISTS (SELECT 1 FROM public.denuncias_impedidos i
                      WHERE i.denuncia_id = d.id AND i.anew_user_id = p_eu AND i.retirado_em IS NULL)
     AND (
       d.responsavel_id = p_eu
       OR (
         (d.responsavel_id IS NULL OR NOT EXISTS (SELECT 1 FROM el x WHERE x.anew_user_id = d.responsavel_id))
         AND (
           me.desde <= d.recebida_em
           -- Recurso do caso orfao (ninguem designado antes dele o pode tratar).
           -- Revisao de 9/11 (HIGH): nao vale para quem se designou a si proprio;
           -- nem se eu ou quem me designou removemos um responsavel do canal
           -- desde que o caso chegou; nem se quem me designou esta impedido
           -- neste caso. Assim quem configura nao se poe, nem poe um terceiro,
           -- a ler casos antigos que estavam com outra pessoa.
           OR (
             me.designado_por IS NOT NULL
             AND me.designado_por <> p_eu
             AND NOT EXISTS (SELECT 1 FROM public.denuncias_impedidos i3
                              WHERE i3.denuncia_id = d.id AND i3.anew_user_id = me.designado_por
                                AND i3.retirado_em IS NULL)
             AND NOT EXISTS (SELECT 1 FROM public.denuncias_canal_auditoria a
                              WHERE a.organization_id = p_organization_id
                                AND a.tipo = 'responsavel_removido'
                                AND a.quem_user_id IN (p_eu, me.designado_por)
                                AND a.criado_em >= (d.recebida_em::timestamp AT TIME ZONE 'Europe/Lisbon'))
             AND NOT EXISTS (
               SELECT 1 FROM el o
                WHERE o.anew_user_id <> p_eu
                  AND o.desde <= d.recebida_em
                  AND NOT EXISTS (SELECT 1 FROM public.denuncias_impedidos i2
                                   WHERE i2.denuncia_id = d.id AND i2.anew_user_id = o.anew_user_id
                                     AND i2.retirado_em IS NULL))))))
$$;

-- Carrega o caso para alterar: visivel, trancado, e visivel outra vez depois do lock.
CREATE FUNCTION public.denuncias_trancar(p_organization_id uuid, p_denuncia_id uuid, p_eu uuid)
RETURNS public.denuncias
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_d public.denuncias;
BEGIN
  IF p_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_denuncia_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.denuncias_visiveis(p_organization_id, p_eu, p_denuncia_id)) THEN
    RAISE EXCEPTION 'nao_encontrada' USING ERRCODE = 'HRD09';
  END IF;
  SELECT d.* INTO v_d FROM public.denuncias d
   WHERE d.id = p_denuncia_id AND d.organization_id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND
     OR NOT EXISTS (SELECT 1 FROM public.denuncias_visiveis(p_organization_id, p_eu, p_denuncia_id)) THEN
    RAISE EXCEPTION 'nao_encontrada' USING ERRCODE = 'HRD09';
  END IF;
  RETURN v_d;
END;
$$;

CREATE FUNCTION public.denuncias_evento(p_organization_id uuid, p_denuncia_id uuid, p_tipo text,
                                        p_quem uuid, p_dados jsonb, p_em timestamptz)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.denuncias_eventos (organization_id, denuncia_id, tipo, quem_user_id, dados, criado_em)
  VALUES (p_organization_id, p_denuncia_id, p_tipo, p_quem, coalesce(p_dados, '{}'::jsonb), coalesce(p_em, now()))
$$;

CREATE FUNCTION public.denuncias_auditar(p_organization_id uuid, p_tipo text, p_quem uuid, p_alvo uuid,
                                         p_denuncia_id uuid, p_dados jsonb)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.denuncias_canal_auditoria (organization_id, tipo, quem_user_id, alvo_user_id, denuncia_id, dados)
  VALUES (p_organization_id, p_tipo, p_quem, p_alvo, p_denuncia_id, coalesce(p_dados, '{}'::jsonb))
$$;

-- Instante do lado do denunciante: numa anonima, 00:00 de Lisboa desse dia.
CREATE FUNCTION public.denuncias_instante(p_anonima boolean)
RETURNS timestamptz
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_anonima
              THEN date_trunc('day', now() AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon'
              ELSE now() END
$$;

-- Texto opcional de um jsonb: NULL se ausente ou vazio; HRD23 se nao e texto ou e longo.
CREATE FUNCTION public.denuncias_texto(p jsonb, p_chave text, p_max integer)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_v jsonb := p -> p_chave;
  v_t text;
BEGIN
  IF v_v IS NULL OR jsonb_typeof(v_v) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v_v) <> 'string' THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  v_t := btrim(v_v #>> '{}');
  IF v_t = '' THEN
    RETURN NULL;
  END IF;
  IF length(v_t) > p_max THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  RETURN v_t;
END;
$$;

-- Texto obrigatorio de uma mensagem ou nota.
CREATE FUNCTION public.denuncias_texto_mensagem(p_texto text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_t text := btrim(coalesce(p_texto, ''));
BEGIN
  IF v_t = '' THEN
    RAISE EXCEPTION 'texto_vazio' USING ERRCODE = 'HRD04';
  END IF;
  IF length(v_t) > 4000 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  RETURN v_t;
END;
$$;

-- A primeira linha da descricao, cortada a 90 (= resumirTexto de formulario.ts).
CREATE FUNCTION public.denuncias_resumo(p_descricao text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN length(l.linha) <= 90 THEN l.linha
              ELSE rtrim(left(l.linha, 89)) || chr(8230) END
    FROM (SELECT rtrim(split_part(btrim(p_descricao), chr(10), 1), chr(13)) AS linha) l
$$;

-- Codigo seguinte da organizacao (o UPDATE tranca a linha do canal).
CREATE FUNCTION public.denuncias_proximo_codigo(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_ano integer := extract(year FROM public.denuncias_hoje())::integer;
  v_num integer;
BEGIN
  UPDATE public.denuncias_canal c
     SET ultimo_numero = CASE WHEN c.ultimo_ano = v_ano THEN c.ultimo_numero + 1 ELSE 1 END,
         ultimo_ano = v_ano
   WHERE c.organization_id = p_organization_id AND c.ativo
  RETURNING c.ultimo_numero INTO v_num;
  IF v_num IS NULL THEN
    RAISE EXCEPTION 'canal_inativo' USING ERRCODE = 'HRD19';
  END IF;
  IF v_num > 999999 THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRD22';
  END IF;
  RETURN 'DEN-' || v_ano::text || '-' || lpad(v_num::text, 4, '0');
END;
$$;

-- Conta um pedido na hora corrente; true se ainda dentro do maximo. Atomico.
CREATE FUNCTION public.denuncias_limite_consumir(p_balde text, p_chave text, p_max integer)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_n integer;
BEGIN
  INSERT INTO public.denuncias_limites AS l (balde, chave, janela, contagem)
  VALUES (p_balde, p_chave, date_trunc('hour', now()), 1)
  ON CONFLICT (balde, chave, janela) DO UPDATE SET contagem = l.contagem + 1
  RETURNING l.contagem INTO v_n;
  RETURN v_n <= p_max;
END;
$$;

-- Baldes de criar/entrar: por IP (ou "sem IP" da organizacao) e da organizacao.
CREATE FUNCTION public.denuncias_limite_publico(p_balde text, p_organization_id uuid, p_chave_ip text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_ip_ok   boolean := true;
  v_org_ok  boolean := true;
  v_max_ip  integer;
  v_max_org integer;
  v_max_sem integer;
BEGIN
  IF p_balde IS NULL OR p_balde NOT IN ('criar', 'entrar') THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  v_max_ip  := CASE WHEN p_balde = 'criar' THEN 5 ELSE 20 END;
  v_max_org := CASE WHEN p_balde = 'criar' THEN 30 ELSE 300 END;
  v_max_sem := CASE WHEN p_balde = 'criar' THEN 10 ELSE 60 END;
  IF p_chave_ip IS NOT NULL AND p_chave_ip ~ '^[0-9a-f]{64}$' THEN
    v_ip_ok := public.denuncias_limite_consumir(p_balde, 'ip:' || p_chave_ip, v_max_ip);
  ELSIF p_organization_id IS NOT NULL THEN
    v_ip_ok := public.denuncias_limite_consumir(p_balde, 'semip:' || p_organization_id::text, v_max_sem);
  ELSE
    RETURN false;
  END IF;
  -- Revisao de 9/11 (M2): o balde da organizacao so conta pedidos que
  -- passaram o do IP; um IP sozinho gasta no maximo o seu limite (5 de 30 a
  -- criar, 20 de 300 a entrar) e nao esgota a organizacao.
  IF NOT v_ip_ok THEN
    RETURN false;
  END IF;
  IF p_organization_id IS NOT NULL THEN
    v_org_ok := public.denuncias_limite_consumir(p_balde, 'org:' || p_organization_id::text, v_max_org);
  END IF;
  RETURN v_org_ok;
END;
$$;

-- O caso visto pela gestao (forma de DenunciaAbertaDb em src/lib/denuncias/canal.ts):
-- tudo menos identidade, PIN e sessao.
CREATE FUNCTION public.denuncias_vista_gestor(p_denuncia_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', d.id, 'organization_id', d.organization_id, 'codigo', d.codigo, 'tipo', d.tipo,
    'resumo', d.resumo, 'descricao', d.descricao, 'quando', d.quando, 'onde', d.onde,
    'envolvidos', d.envolvidos, 'ainda_acontece', d.ainda_acontece, 'testemunhas', d.testemunhas,
    'ja_reportado', d.ja_reportado, 'anonima', d.anonima, 'origem', d.origem, 'estado', d.estado,
    'gravidade', d.gravidade, 'avaliacao_inicial', d.avaliacao_inicial,
    'responsavel_id', d.responsavel_id, 'responsavel_nome', ru.name,
    'recebida_em', d.recebida_em, 'prazo_confirmar', d.prazo_confirmar,
    'prazo_seguimento', d.prazo_seguimento, 'confirmada_em', d.confirmada_em,
    'resultado', d.resultado, 'medidas', d.medidas, 'fundamentacao', d.fundamentacao,
    'decidida_em', d.decidida_em, 'motivo_arquivo', d.motivo_arquivo,
    'fechada_em', d.fechada_em, 'conservar_ate', d.conservar_ate,
    'tem_identidade', EXISTS (SELECT 1 FROM public.denuncias_identidade i
                               WHERE i.denuncia_id = d.id AND i.organization_id = d.organization_id),
    'identidade_so_responsavel', (SELECT i.so_responsavel FROM public.denuncias_identidade i
                                   WHERE i.denuncia_id = d.id AND i.organization_id = d.organization_id),
    'mensagens', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'autor', m.autor, 'autor_id', m.autor_user_id,
                                          'autor_nome', mu.name, 'pedido_informacao', m.pedido_informacao,
                                          'texto', m.texto, 'criada_em', m.criada_em) ORDER BY m.seq)
        FROM public.denuncias_mensagens m LEFT JOIN public.anew_users mu ON mu.id = m.autor_user_id
       WHERE m.denuncia_id = d.id AND m.organization_id = d.organization_id), '[]'::jsonb),
    'notas', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', n.id, 'autor_id', n.autor_user_id, 'autor_nome', nu.name,
                                          'texto', n.texto, 'criada_em', n.criada_em) ORDER BY n.seq)
        FROM public.denuncias_notas n LEFT JOIN public.anew_users nu ON nu.id = n.autor_user_id
       WHERE n.denuncia_id = d.id AND n.organization_id = d.organization_id), '[]'::jsonb),
    'eventos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', e.id, 'tipo', e.tipo, 'quem_id', e.quem_user_id, 'quem_nome', eu.name,
               'dados', e.dados || CASE WHEN au.id IS NOT NULL THEN jsonb_build_object('nome', au.name) ELSE '{}'::jsonb END,
               'criado_em', e.criado_em) ORDER BY e.seq)
        FROM public.denuncias_eventos e
        LEFT JOIN public.anew_users eu ON eu.id = e.quem_user_id
        LEFT JOIN public.anew_users au
          ON au.id = CASE WHEN (e.dados ->> 'alvo') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                          THEN (e.dados ->> 'alvo')::uuid END
       WHERE e.denuncia_id = d.id AND e.organization_id = d.organization_id), '[]'::jsonb),
    -- Fase 1 sem anexos (D7): lista vazia, para a forma do cliente.
    'anexos', '[]'::jsonb,
    -- O conflito automatico do PROPRIO denunciante (conflito sem registado_por,
    -- so a _criar o grava) nunca sai: dizia quem denunciou a quem abre o caso.
    'impedidos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('anew_user_id', i.anew_user_id, 'nome', iu.name, 'motivo', i.motivo,
                                          'pelo_denunciante', i.registado_por IS NULL) ORDER BY i.registado_em, i.id)
        FROM public.denuncias_impedidos i JOIN public.anew_users iu ON iu.id = i.anew_user_id
       WHERE i.denuncia_id = d.id AND i.organization_id = d.organization_id AND i.retirado_em IS NULL
         AND NOT (i.motivo = 'conflito' AND i.registado_por IS NULL)), '[]'::jsonb))
    FROM public.denuncias d
    LEFT JOIN public.anew_users ru ON ru.id = d.responsavel_id
   WHERE d.id = p_denuncia_id
$$;

-- O caso visto pelo denunciante (VistaDenuncianteDb do cliente e o que a Edge
-- filtra em vistaDoDenunciante). Nunca notas, gravidade, avaliacao,
-- responsavel, eventos, fundamentacao nem quem escreveu do lado do canal.
CREATE FUNCTION public.denuncias_vista_denunciante(p_denuncia_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', d.id, 'codigo', d.codigo, 'tipo', d.tipo, 'resumo', d.resumo, 'descricao', d.descricao,
    'quando', d.quando, 'onde', d.onde, 'anonima', d.anonima, 'estado', d.estado,
    'recebida_em', d.recebida_em,
    'confirmada_em', (d.confirmada_em AT TIME ZONE 'Europe/Lisbon')::date,
    'prazo_confirmar', d.prazo_confirmar, 'prazo_seguimento', d.prazo_seguimento,
    'fechada_em', (d.fechada_em AT TIME ZONE 'Europe/Lisbon')::date,
    'resultado', CASE WHEN d.estado = 'concluida' THEN d.resultado END,
    'medidas', CASE WHEN d.estado = 'concluida' THEN d.medidas END,
    'motivo_arquivo', CASE WHEN d.estado = 'arquivada' THEN d.motivo_arquivo END,
    'desfecho', CASE WHEN d.estado = 'concluida' THEN jsonb_build_object('resultado', d.resultado, 'medidas', d.medidas)
                     WHEN d.estado = 'arquivada' THEN jsonb_build_object('arquivada', true)
                     ELSE NULL END,
    'mensagens', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'autor', m.autor, 'pedido_informacao', m.pedido_informacao,
                                          'texto', m.texto, 'em', m.criada_em, 'criada_em', m.criada_em) ORDER BY m.seq)
        FROM public.denuncias_mensagens m
       WHERE m.denuncia_id = d.id AND m.organization_id = d.organization_id), '[]'::jsonb))
    FROM public.denuncias d
   WHERE d.id = p_denuncia_id
$$;

-- Sessao publica valida -> id do caso; tranca o acesso e renova 30 min.
CREATE FUNCTION public.denuncias_sessao(p_sessao_hash text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_sessao_hash IS NULL OR p_sessao_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'sessao_invalida' USING ERRCODE = 'HRD24';
  END IF;
  -- Expirada (30 min sem actividade) ou com mais de 4 h desde a entrada:
  -- invalida, haja ou nao limpeza.
  SELECT a.denuncia_id INTO v_id FROM public.denuncias_acesso a
   WHERE a.sessao_hash = p_sessao_hash AND a.sessao_expira_em > now()
     AND a.sessao_inicio_em > now() - interval '4 hours'
   FOR UPDATE;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'sessao_invalida' USING ERRCODE = 'HRD24';
  END IF;
  -- Renova 30 min, arredondado ao quarto de hora para cima, nunca alem do
  -- tecto absoluto de 4 h desde a entrada (revisao de 9/11, M4).
  UPDATE public.denuncias_acesso a
     SET sessao_expira_em = least(
           to_timestamp((ceil(extract(epoch FROM now() + interval '30 minutes') / 900) * 900)::double precision),
           a.sessao_inicio_em + interval '4 hours')
   WHERE a.denuncia_id = v_id;
  RETURN v_id;
END;
$$;

-- ==============================================================================
-- 6. Gatilhos
-- ==============================================================================

-- 6.1 O caso: transicoes (estados.ts), imutaveis e responsavel.
CREATE FUNCTION public.denuncias_regras()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_motivo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'recebida' OR NEW.responsavel_id IS NOT NULL OR NEW.confirmada_em IS NOT NULL THEN
      RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'HRD01';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.anonima IS DISTINCT FROM OLD.anonima THEN
    RAISE EXCEPTION 'anonima_imutavel' USING ERRCODE = 'HRD20';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.codigo IS DISTINCT FROM OLD.codigo
     OR NEW.origem IS DISTINCT FROM OLD.origem
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.descricao IS DISTINCT FROM OLD.descricao
     OR NEW.resumo IS DISTINCT FROM OLD.resumo
     OR NEW.quando IS DISTINCT FROM OLD.quando
     OR NEW.onde IS DISTINCT FROM OLD.onde
     OR NEW.envolvidos IS DISTINCT FROM OLD.envolvidos
     OR NEW.ainda_acontece IS DISTINCT FROM OLD.ainda_acontece
     OR NEW.testemunhas IS DISTINCT FROM OLD.testemunhas
     OR NEW.ja_reportado IS DISTINCT FROM OLD.ja_reportado
     OR NEW.boa_fe IS DISTINCT FROM OLD.boa_fe
     OR NEW.recebida_em IS DISTINCT FROM OLD.recebida_em
     OR NEW.prazo_confirmar IS DISTINCT FROM OLD.prazo_confirmar
     OR NEW.prazo_seguimento IS DISTINCT FROM OLD.prazo_seguimento
     OR (OLD.confirmada_em IS NOT NULL AND NEW.confirmada_em IS DISTINCT FROM OLD.confirmada_em) THEN
    RAISE EXCEPTION 'campo_imutavel' USING ERRCODE = 'HRD27';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT (
         (OLD.estado = 'recebida'   AND NEW.estado IN ('em_analise', 'arquivada'))
      OR (OLD.estado = 'em_analise' AND NEW.estado IN ('mais_info', 'concluida', 'arquivada'))
      OR (OLD.estado = 'mais_info'  AND NEW.estado IN ('em_analise', 'concluida', 'arquivada'))
      OR (OLD.estado = 'concluida'  AND NEW.estado = 'em_analise')
      OR (OLD.estado = 'arquivada'  AND NEW.estado = 'em_analise')) THEN
      RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'HRD01';
    END IF;
  END IF;

  IF NEW.responsavel_id IS NOT NULL AND NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
    -- 'oculto' = conflito automatico de quem denunciou (sem registado_por):
    -- responde como "nao e responsavel" (HRD14), nunca HRD03, para nao o revelar.
    SELECT CASE WHEN i.motivo = 'conflito' AND i.registado_por IS NULL THEN 'oculto' ELSE i.motivo END
      INTO v_motivo
      FROM public.denuncias_impedidos i
     WHERE i.denuncia_id = NEW.id AND i.organization_id = NEW.organization_id
       AND i.anew_user_id = NEW.responsavel_id AND i.retirado_em IS NULL
     ORDER BY (i.motivo = 'visado') DESC, (i.registado_por IS NULL) ASC
     LIMIT 1;
    IF v_motivo = 'visado' THEN
      RAISE EXCEPTION 'denunciado' USING ERRCODE = 'HRD02';
    ELSIF v_motivo = 'conflito' THEN
      RAISE EXCEPTION 'conflito' USING ERRCODE = 'HRD03';
    ELSIF v_motivo = 'oculto' THEN
      RAISE EXCEPTION 'nao_e_responsavel' USING ERRCODE = 'HRD14';
    END IF;
    IF NOT public.denuncias_elegivel_trancado(NEW.organization_id, NEW.responsavel_id) THEN
      RAISE EXCEPTION 'nao_e_responsavel' USING ERRCODE = 'HRD14';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER denuncias_regras
BEFORE INSERT OR UPDATE ON public.denuncias
FOR EACH ROW EXECUTE FUNCTION public.denuncias_regras();

-- 6.2 Identidade: nunca numa anonima; imutavel.
CREATE FUNCTION public.denuncias_identidade_regras()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'campo_imutavel' USING ERRCODE = 'HRD27';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.denuncias d
                  WHERE d.id = NEW.denuncia_id AND d.organization_id = NEW.organization_id
                    AND d.anonima = false) THEN
    RAISE EXCEPTION 'anonima_imutavel' USING ERRCODE = 'HRD20';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER denuncias_identidade_regras
BEFORE INSERT OR UPDATE ON public.denuncias_identidade
FOR EACH ROW EXECUTE FUNCTION public.denuncias_identidade_regras();

-- 6.3 Impedidos: so se retira, uma vez.
CREATE FUNCTION public.denuncias_impedidos_regras()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.retirado_em IS NOT NULL
     OR NEW.retirado_em IS NULL
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.denuncia_id IS DISTINCT FROM OLD.denuncia_id
     OR NEW.anew_user_id IS DISTINCT FROM OLD.anew_user_id
     OR NEW.motivo IS DISTINCT FROM OLD.motivo
     OR NEW.registado_por IS DISTINCT FROM OLD.registado_por
     OR NEW.registado_em IS DISTINCT FROM OLD.registado_em THEN
    RAISE EXCEPTION 'campo_imutavel' USING ERRCODE = 'HRD27';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER denuncias_impedidos_regras
BEFORE UPDATE ON public.denuncias_impedidos
FOR EACH ROW EXECUTE FUNCTION public.denuncias_impedidos_regras();

-- 6.4 Historico e caso: nunca se altera (historico) nem se apaga (todos).
CREATE FUNCTION public.denuncias_so_acrescenta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'campo_imutavel' USING ERRCODE = 'HRD27';
END;
$$;

CREATE TRIGGER denuncias_mensagens_so_acrescenta BEFORE UPDATE OR DELETE ON public.denuncias_mensagens
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();
CREATE TRIGGER denuncias_notas_so_acrescenta BEFORE UPDATE OR DELETE ON public.denuncias_notas
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();
CREATE TRIGGER denuncias_eventos_so_acrescenta BEFORE UPDATE OR DELETE ON public.denuncias_eventos
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();
CREATE TRIGGER denuncias_canal_auditoria_so_acrescenta BEFORE UPDATE OR DELETE ON public.denuncias_canal_auditoria
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();
CREATE TRIGGER denuncias_identidade_sem_apagar BEFORE DELETE ON public.denuncias_identidade
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();
CREATE TRIGGER denuncias_impedidos_sem_apagar BEFORE DELETE ON public.denuncias_impedidos
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();
CREATE TRIGGER denuncias_sem_apagar BEFORE DELETE ON public.denuncias
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();
CREATE TRIGGER denuncias_acesso_sem_apagar BEFORE DELETE ON public.denuncias_acesso
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();
CREATE TRIGGER denuncias_responsaveis_sem_apagar BEFORE DELETE ON public.denuncias_responsaveis
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();
CREATE TRIGGER denuncias_canal_sem_apagar BEFORE DELETE ON public.denuncias_canal
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();

-- 6.5 TRUNCATE recusado (todas excepto limites e reservas, que sao descartaveis).
CREATE FUNCTION public.denuncias_sem_truncate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'campo_imutavel' USING ERRCODE = 'HRD27';
END;
$$;

DO $truncate$
DECLARE
  v_t text;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['denuncias_canal', 'denuncias_responsaveis', 'denuncias', 'denuncias_acesso',
                             'denuncias_identidade', 'denuncias_mensagens', 'denuncias_notas',
                             'denuncias_eventos', 'denuncias_impedidos', 'denuncias_canal_auditoria']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.denuncias_sem_truncate()',
                   v_t || '_sem_truncate', v_t);
  END LOOP;
END;
$truncate$;

-- ==============================================================================
-- 7. RPCs do gestor e do denunciante identificado (authenticated)
-- ==============================================================================

CREATE FUNCTION public.rpc_denuncias_listar(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_r  jsonb;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  -- O resumo so vem nos casos atribuidos a mim: a fila mostra que existe um
  -- caso, nao o que diz (abri-lo deixa o evento 'consultada').
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'codigo', d.codigo, 'tipo', d.tipo,
           'resumo', CASE WHEN d.responsavel_id = v_eu THEN d.resumo END,
           'estado', d.estado, 'gravidade', d.gravidade, 'origem', d.origem, 'anonima', d.anonima,
           'responsavel_id', d.responsavel_id, 'responsavel_nome', ru.name,
           'recebida_em', d.recebida_em, 'prazo_confirmar', d.prazo_confirmar,
           'prazo_seguimento', d.prazo_seguimento, 'confirmada_em', d.confirmada_em,
           'fechada_em', d.fechada_em,
           'mensagens_denunciante', coalesce(mm.n_den, 0), 'ultima_mensagem_de', mm.ultimo)
           ORDER BY d.recebida_em DESC, d.codigo DESC), '[]'::jsonb)
    INTO v_r
    FROM public.denuncias_visiveis(p_organization_id, v_eu, NULL) v
    JOIN public.denuncias d ON d.id = v.denuncia_id AND d.organization_id = p_organization_id
    LEFT JOIN public.anew_users ru ON ru.id = d.responsavel_id
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE m.autor = 'denunciante') AS n_den,
             (array_agg(m.autor ORDER BY m.seq DESC))[1] AS ultimo
        FROM public.denuncias_mensagens m
       WHERE m.denuncia_id = d.id AND m.organization_id = d.organization_id) mm ON true;
  RETURN v_r;
END;
$$;

CREATE FUNCTION public.rpc_denuncias_por_confirmar(p_organization_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_n  integer;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  SELECT count(*)::integer INTO v_n
    FROM public.denuncias_visiveis(p_organization_id, v_eu, NULL) v
    JOIN public.denuncias d ON d.id = v.denuncia_id AND d.organization_id = p_organization_id
   WHERE d.estado = 'recebida';
  RETURN v_n;
END;
$$;

CREATE FUNCTION public.rpc_denuncia_abrir(p_organization_id uuid, p_denuncia_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu   uuid := public.denuncias_eu();
  v_resp uuid;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_denuncia_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.denuncias_visiveis(p_organization_id, v_eu, p_denuncia_id)) THEN
    RAISE EXCEPTION 'nao_encontrada' USING ERRCODE = 'HRD09';
  END IF;
  SELECT d.responsavel_id INTO v_resp FROM public.denuncias d
   WHERE d.id = p_denuncia_id AND d.organization_id = p_organization_id;
  -- Ler um caso que nao e meu fica no historico (no maximo uma vez por dia e pessoa).
  IF v_resp IS DISTINCT FROM v_eu AND NOT EXISTS (
       SELECT 1 FROM public.denuncias_eventos e
        WHERE e.denuncia_id = p_denuncia_id AND e.organization_id = p_organization_id
          AND e.tipo = 'consultada' AND e.quem_user_id = v_eu
          AND e.criado_em > now() - interval '1 day') THEN
    PERFORM public.denuncias_evento(p_organization_id, p_denuncia_id, 'consultada', v_eu, NULL, NULL);
  END IF;
  RETURN public.denuncias_vista_gestor(p_denuncia_id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_confirmar_rececao(p_organization_id uuid, p_denuncia_id uuid,
                                                      p_mensagem text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_t  text;
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.estado <> 'recebida' THEN
    RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'HRD01';
  END IF;
  IF btrim(coalesce(p_mensagem, '')) <> '' THEN
    v_t := public.denuncias_texto_mensagem(p_mensagem);
  END IF;
  UPDATE public.denuncias d SET estado = 'em_analise', confirmada_em = now()
   WHERE d.id = v_d.id AND d.organization_id = v_d.organization_id;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'rececao_confirmada', v_eu, NULL, NULL);
  IF v_t IS NOT NULL THEN
    INSERT INTO public.denuncias_mensagens (organization_id, denuncia_id, autor, autor_user_id, texto)
    VALUES (v_d.organization_id, v_d.id, 'canal', v_eu, v_t);
    PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'mensagem_enviada', v_eu, NULL, NULL);
  END IF;
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_gravidade(p_organization_id uuid, p_denuncia_id uuid, p_gravidade text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF p_gravidade IS NULL OR p_gravidade NOT IN ('baixa', 'media', 'alta') THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  IF p_gravidade <> v_d.gravidade THEN
    UPDATE public.denuncias d SET gravidade = p_gravidade
     WHERE d.id = v_d.id AND d.organization_id = v_d.organization_id;
    PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'gravidade_alterada', v_eu,
                                    jsonb_build_object('antes', v_d.gravidade, 'depois', p_gravidade), NULL);
  END IF;
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_avaliacao(p_organization_id uuid, p_denuncia_id uuid, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_t  text := nullif(btrim(coalesce(p_texto, '')), '');
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.estado IN ('concluida', 'arquivada') THEN
    RAISE EXCEPTION 'fechada' USING ERRCODE = 'HRD08';
  END IF;
  IF length(v_t) > 2000 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  IF v_t IS DISTINCT FROM v_d.avaliacao_inicial THEN
    UPDATE public.denuncias d SET avaliacao_inicial = v_t
     WHERE d.id = v_d.id AND d.organization_id = v_d.organization_id;
    PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'avaliacao_alterada', v_eu, NULL, NULL);
  END IF;
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_atribuir(p_organization_id uuid, p_denuncia_id uuid, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu     uuid := public.denuncias_eu();
  v_d      public.denuncias;
  v_motivo text;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_denuncia_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.denuncias_visiveis(p_organization_id, v_eu, p_denuncia_id)) THEN
    RAISE EXCEPTION 'nao_encontrada' USING ERRCODE = 'HRD09';
  END IF;
  -- Ordem de trancas = a de remover: primeiro a designacao do escolhido (FOR
  -- SHARE), depois o caso. Um responsavel removido a meio nunca fica atribuido.
  IF NOT public.denuncias_elegivel_trancado(p_organization_id, p_user) THEN
    -- O conflito oculto do denunciante nunca entra aqui (cai no HRD14 generico).
    SELECT i.motivo INTO v_motivo
      FROM public.denuncias_impedidos i
     WHERE i.denuncia_id = p_denuncia_id AND i.organization_id = p_organization_id
       AND i.anew_user_id = p_user AND i.retirado_em IS NULL
       AND NOT (i.motivo = 'conflito' AND i.registado_por IS NULL)
     ORDER BY (i.motivo = 'visado') DESC
     LIMIT 1;
    IF v_motivo = 'visado' THEN
      RAISE EXCEPTION 'denunciado' USING ERRCODE = 'HRD02';
    ELSIF v_motivo = 'conflito' THEN
      RAISE EXCEPTION 'conflito' USING ERRCODE = 'HRD03';
    END IF;
    RAISE EXCEPTION 'nao_e_responsavel' USING ERRCODE = 'HRD14';
  END IF;
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF p_user IS DISTINCT FROM v_d.responsavel_id THEN
    -- O gatilho denuncias_regras recusa visado (HRD02), conflito (HRD03) e nao elegivel (HRD14).
    UPDATE public.denuncias d SET responsavel_id = p_user
     WHERE d.id = v_d.id AND d.organization_id = v_d.organization_id;
    PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'responsavel_atribuido', v_eu,
                                    jsonb_build_object('alvo', p_user), NULL);
    IF p_user = v_eu THEN
      PERFORM public.denuncias_auditar(v_d.organization_id, 'autoatribuicao', v_eu, v_eu, v_d.id, NULL);
    END IF;
  END IF;
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_impedir(p_organization_id uuid, p_denuncia_id uuid, p_user uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu   uuid := public.denuncias_eu();
  v_d    public.denuncias;
  v_tipo text;
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF p_user IS NULL OR p_motivo IS NULL OR p_motivo NOT IN ('visado', 'conflito')
     OR (p_motivo = 'conflito' AND p_user <> v_eu)
     OR NOT public.denuncias_membro_ativo(v_d.organization_id, p_user) THEN
    RAISE EXCEPTION 'impedimento_invalido' USING ERRCODE = 'HRD15';
  END IF;
  v_tipo := CASE WHEN p_motivo = 'conflito' THEN 'conflito_declarado' ELSE 'visado_registado' END;

  -- O conflito oculto do denunciante nao conta: registar essa pessoa como
  -- visada grava e aparece como com qualquer outra (senao o "nao mudou nada"
  -- revelava quem denunciou).
  IF NOT EXISTS (SELECT 1 FROM public.denuncias_impedidos i
                  WHERE i.denuncia_id = v_d.id AND i.organization_id = v_d.organization_id
                    AND i.anew_user_id = p_user AND i.retirado_em IS NULL
                    AND NOT (i.motivo = 'conflito' AND i.registado_por IS NULL)) THEN
    INSERT INTO public.denuncias_impedidos (organization_id, denuncia_id, anew_user_id, motivo, registado_por)
    VALUES (v_d.organization_id, v_d.id, p_user, p_motivo, v_eu);
    IF v_d.responsavel_id = p_user THEN
      UPDATE public.denuncias d SET responsavel_id = NULL
       WHERE d.id = v_d.id AND d.organization_id = v_d.organization_id;
      PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'responsavel_libertado', v_eu,
                                      jsonb_build_object('alvo', p_user), NULL);
    END IF;
    PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, v_tipo, v_eu, jsonb_build_object('alvo', p_user), NULL);
    PERFORM public.denuncias_auditar(v_d.organization_id, v_tipo, v_eu, p_user, v_d.id, NULL);
  END IF;

  -- Quem se impediu a si proprio deixa de ver o caso.
  IF p_user = v_eu THEN
    RETURN jsonb_build_object('impedido', true, 'id', v_d.id);
  END IF;
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_pedir_informacao(p_organization_id uuid, p_denuncia_id uuid, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_t  text;
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.estado IN ('concluida', 'arquivada') THEN
    RAISE EXCEPTION 'fechada' USING ERRCODE = 'HRD08';
  END IF;
  IF v_d.estado <> 'em_analise' THEN
    RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'HRD01';
  END IF;
  v_t := public.denuncias_texto_mensagem(p_texto);
  INSERT INTO public.denuncias_mensagens (organization_id, denuncia_id, autor, autor_user_id, pedido_informacao, texto)
  VALUES (v_d.organization_id, v_d.id, 'canal', v_eu, true, v_t);
  UPDATE public.denuncias d SET estado = 'mais_info'
   WHERE d.id = v_d.id AND d.organization_id = v_d.organization_id;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'informacao_pedida', v_eu, NULL, NULL);
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_mensagem(p_organization_id uuid, p_denuncia_id uuid, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_t  text;
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.estado IN ('concluida', 'arquivada') THEN
    RAISE EXCEPTION 'fechada' USING ERRCODE = 'HRD08';
  END IF;
  IF v_d.estado = 'recebida' THEN
    RAISE EXCEPTION 'confirmar_primeiro' USING ERRCODE = 'HRD10';
  END IF;
  v_t := public.denuncias_texto_mensagem(p_texto);
  INSERT INTO public.denuncias_mensagens (organization_id, denuncia_id, autor, autor_user_id, texto)
  VALUES (v_d.organization_id, v_d.id, 'canal', v_eu, v_t);
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'mensagem_enviada', v_eu, NULL, NULL);
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_nota(p_organization_id uuid, p_denuncia_id uuid, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_t  text;
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  v_t := public.denuncias_texto_mensagem(p_texto);
  INSERT INTO public.denuncias_notas (organization_id, denuncia_id, autor_user_id, texto)
  VALUES (v_d.organization_id, v_d.id, v_eu, v_t);
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'nota_adicionada', v_eu, NULL, NULL);
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_concluir(p_organization_id uuid, p_denuncia_id uuid, p_resultado text,
                                             p_medidas text, p_fundamentacao text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu  uuid := public.denuncias_eu();
  v_d   public.denuncias;
  v_med text := nullif(btrim(coalesce(p_medidas, '')), '');
  v_fun text := btrim(coalesce(p_fundamentacao, ''));
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.estado NOT IN ('em_analise', 'mais_info') THEN
    RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'HRD01';
  END IF;
  IF btrim(coalesce(p_resultado, '')) = '' THEN
    RAISE EXCEPTION 'resultado_em_falta' USING ERRCODE = 'HRD06';
  END IF;
  IF p_resultado NOT IN ('procedente', 'parcialmente_procedente', 'improcedente', 'sem_competencia') THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  IF v_fun = '' THEN
    RAISE EXCEPTION 'fundamentacao_em_falta' USING ERRCODE = 'HRD07';
  END IF;
  IF length(v_fun) > 4000 OR coalesce(length(v_med), 0) > 4000 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  UPDATE public.denuncias d
     SET estado = 'concluida', resultado = p_resultado, medidas = v_med, fundamentacao = v_fun,
         decidida_em = now(), fechada_em = now(),
         conservar_ate = (public.denuncias_hoje() + interval '5 years')::date
   WHERE d.id = v_d.id AND d.organization_id = v_d.organization_id;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'concluida', v_eu,
                                  jsonb_build_object('resultado', p_resultado), NULL);
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_arquivar(p_organization_id uuid, p_denuncia_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_m  text := btrim(coalesce(p_motivo, ''));
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.estado NOT IN ('recebida', 'em_analise', 'mais_info') THEN
    RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'HRD01';
  END IF;
  IF length(v_m) < 3 THEN
    RAISE EXCEPTION 'motivo_curto' USING ERRCODE = 'HRD05';
  END IF;
  IF length(v_m) > 2000 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  UPDATE public.denuncias d
     SET estado = 'arquivada', motivo_arquivo = v_m, fechada_em = now(),
         conservar_ate = (public.denuncias_hoje() + interval '5 years')::date
   WHERE d.id = v_d.id AND d.organization_id = v_d.organization_id;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'arquivada', v_eu,
                                  jsonb_build_object('motivo', left(v_m, 300)), NULL);
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_reabrir(p_organization_id uuid, p_denuncia_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.estado NOT IN ('concluida', 'arquivada') THEN
    RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'HRD01';
  END IF;
  UPDATE public.denuncias d
     SET estado = 'em_analise', resultado = NULL, medidas = NULL, fundamentacao = NULL, decidida_em = NULL,
         motivo_arquivo = NULL, fechada_em = NULL, conservar_ate = NULL,
         confirmada_em = coalesce(d.confirmada_em, now())
   WHERE d.id = v_d.id AND d.organization_id = v_d.organization_id;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'reaberta', v_eu, NULL, NULL);
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_identidade_ver(p_organization_id uuid, p_denuncia_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_i  public.denuncias_identidade;
  v_m  text := btrim(coalesce(p_motivo, ''));
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.anonima THEN
    RAISE EXCEPTION 'anonima' USING ERRCODE = 'HRD11';
  END IF;
  IF length(v_m) < 3 THEN
    RAISE EXCEPTION 'motivo_identidade' USING ERRCODE = 'HRD12';
  END IF;
  IF length(v_m) > 300 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  SELECT i.* INTO v_i FROM public.denuncias_identidade i
   WHERE i.denuncia_id = v_d.id AND i.organization_id = v_d.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'anonima' USING ERRCODE = 'HRD11';
  END IF;
  IF v_i.so_responsavel AND v_d.responsavel_id IS DISTINCT FROM v_eu THEN
    RAISE EXCEPTION 'so_responsavel' USING ERRCODE = 'HRD16';
  END IF;
  -- O registo vem ANTES de devolver, na mesma transaccao. Cada chamada regista.
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'identidade_vista', v_eu,
                                  jsonb_build_object('motivo', v_m), NULL);
  RETURN jsonb_build_object('nome', v_i.nome, 'email', v_i.email, 'telefone', v_i.telefone,
                            'pode_contactar', v_i.pode_contactar, 'so_responsavel', v_i.so_responsavel,
                            'da_aplicacao', v_i.anew_user_id IS NOT NULL);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_exportar(p_organization_id uuid, p_denuncia_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_m  text := btrim(coalesce(p_motivo, ''));
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.responsavel_id IS DISTINCT FROM v_eu THEN
    RAISE EXCEPTION 'so_responsavel' USING ERRCODE = 'HRD16';
  END IF;
  IF length(v_m) < 3 THEN
    RAISE EXCEPTION 'motivo_identidade' USING ERRCODE = 'HRD12';
  END IF;
  IF length(v_m) > 300 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'exportada', v_eu,
                                  jsonb_build_object('motivo', v_m), NULL);
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('exportada_por', v_eu, 'exportada_em', now());
END;
$$;

-- {eu, responsaveis:[{id, nome}]}: os que podem tratar (para atribuir e impedir).
CREATE FUNCTION public.rpc_denuncias_responsaveis(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu   uuid := public.denuncias_eu();
  v_conf boolean;
  v_r    jsonb;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  v_conf := coalesce(public.has_anew_permission_in_org(auth.uid(), 'hr.denuncias.configurar', p_organization_id), false);
  IF NOT v_conf AND NOT EXISTS (SELECT 1 FROM public.denuncias_elegiveis(p_organization_id) e
                                 WHERE e.anew_user_id = v_eu) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', e.anew_user_id,
           'nome', coalesce(nullif(btrim(u.name), ''), u.email, '(sem nome)')) ORDER BY u.name, e.anew_user_id), '[]'::jsonb)
    INTO v_r
    FROM public.denuncias_elegiveis(p_organization_id) e
    JOIN public.anew_users u ON u.id = e.anew_user_id;
  RETURN jsonb_build_object('eu', v_eu, 'responsaveis', v_r);
END;
$$;

-- So hr.denuncias.configurar: {ativo, slug_publico, responsaveis, candidatos, sem_quem_trate}.
CREATE FUNCTION public.rpc_denuncias_canal_ler(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu     uuid := public.denuncias_eu();
  v_c      public.denuncias_canal;
  v_resp   jsonb;
  v_cand   jsonb;
  v_orfaos integer;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(public.has_anew_permission_in_org(auth.uid(), 'hr.denuncias.configurar', p_organization_id), false) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
  END IF;
  SELECT c.* INTO v_c FROM public.denuncias_canal c WHERE c.organization_id = p_organization_id;

  -- Designados activos (com ou sem a permissao de tratar: pode_tratar diz qual).
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', r.anew_user_id,
           'nome', coalesce(nullif(btrim(u.name), ''), u.email, '(sem nome)'),
           'pode_tratar', EXISTS (SELECT 1 FROM public.denuncias_elegiveis(p_organization_id) e
                                   WHERE e.anew_user_id = r.anew_user_id),
           'designado_em', r.designado_em) ORDER BY u.name, r.anew_user_id), '[]'::jsonb)
    INTO v_resp
    FROM public.denuncias_responsaveis r
    JOIN public.anew_users u ON u.id = r.anew_user_id
   WHERE r.organization_id = p_organization_id AND r.ativo;

  -- Candidatos: membros activos nao clientes com hr.denuncias.gerir, ainda nao designados.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'nome', x.nome) ORDER BY x.nome, x.id), '[]'::jsonb)
    INTO v_cand
    FROM (SELECT DISTINCT u.id, coalesce(nullif(btrim(u.name), ''), u.email, '(sem nome)') AS nome
            FROM public.anew_memberships m
            JOIN public.anew_users u ON u.id = m.user_id
           WHERE m.organization_id = p_organization_id AND m.status = 'active' AND m.role_is_client IS NOT TRUE
             AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
             AND public.has_anew_permission_in_org(u.auth_user_id, 'hr.denuncias.gerir', p_organization_id)
             AND NOT EXISTS (SELECT 1 FROM public.denuncias_responsaveis r
                              WHERE r.organization_id = p_organization_id AND r.anew_user_id = u.id AND r.ativo)) x;

  -- Casos abertos sem nenhum elegivel nao impedido: so a contagem, nunca o conteudo.
  SELECT count(*)::integer INTO v_orfaos
    FROM public.denuncias d
   WHERE d.organization_id = p_organization_id
     AND d.estado NOT IN ('concluida', 'arquivada')
     AND NOT EXISTS (
       SELECT 1 FROM public.denuncias_elegiveis(p_organization_id) e
        WHERE NOT EXISTS (SELECT 1 FROM public.denuncias_impedidos i
                           WHERE i.denuncia_id = d.id AND i.anew_user_id = e.anew_user_id
                             AND i.retirado_em IS NULL));

  RETURN jsonb_build_object('configurado', v_c.organization_id IS NOT NULL,
                            'ativo', coalesce(v_c.ativo, false), 'slug_publico', v_c.slug_publico,
                            'responsaveis', v_resp, 'candidatos', v_cand, 'sem_quem_trate', v_orfaos);
END;
$$;

CREATE FUNCTION public.rpc_denuncias_canal_guardar(p_organization_id uuid, p_ativo boolean, p_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu   uuid := public.denuncias_eu();
  v_slug text := lower(btrim(coalesce(p_slug, '')));
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(public.has_anew_permission_in_org(auth.uid(), 'hr.denuncias.configurar', p_organization_id), false) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
  END IF;
  IF p_ativo IS NULL OR v_slug !~ '^[a-z0-9][a-z0-9-]{2,38}[a-z0-9]$' THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  -- Ligar sem ninguem para tratar mandava denuncias para o vazio.
  IF p_ativo AND NOT EXISTS (SELECT 1 FROM public.denuncias_elegiveis(p_organization_id)) THEN
    RAISE EXCEPTION 'sem_responsaveis' USING ERRCODE = 'HRD28';
  END IF;
  BEGIN
    INSERT INTO public.denuncias_canal AS c (organization_id, ativo, slug_publico, atualizado_por, atualizado_em)
    VALUES (p_organization_id, p_ativo, v_slug, v_eu, now())
    ON CONFLICT (organization_id) DO UPDATE
      SET ativo = EXCLUDED.ativo, slug_publico = EXCLUDED.slug_publico,
          atualizado_por = EXCLUDED.atualizado_por, atualizado_em = EXCLUDED.atualizado_em;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'slug_em_uso' USING ERRCODE = 'HRD18';
  END;
  PERFORM public.denuncias_auditar(p_organization_id, 'canal_alterado', v_eu, NULL, NULL,
                                   jsonb_build_object('ativo', p_ativo, 'slug_publico', v_slug));
  RETURN public.rpc_denuncias_canal_ler(p_organization_id);
END;
$$;

-- Qualquer membro activo le o slug do canal da sua organizacao (para denunciar
-- e acompanhar de dentro da app pela Edge).
CREATE FUNCTION public.rpc_denuncias_canal_publico(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_c  public.denuncias_canal;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR NOT public.denuncias_membro_ativo(p_organization_id, v_eu) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
  END IF;
  SELECT c.* INTO v_c FROM public.denuncias_canal c WHERE c.organization_id = p_organization_id;
  RETURN jsonb_build_object('ativo', coalesce(v_c.ativo, false),
                            'slug_publico', CASE WHEN v_c.ativo THEN v_c.slug_publico END);
END;
$$;

CREATE FUNCTION public.rpc_denuncias_responsavel_designar(p_organization_id uuid, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_id uuid;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(public.has_anew_permission_in_org(auth.uid(), 'hr.denuncias.configurar', p_organization_id), false) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
  END IF;
  IF p_user IS NULL OR NOT public.denuncias_membro_ativo(p_organization_id, p_user) THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  -- Quem e visado num caso aberto nao entra para o canal. A recusa e a MESMA
  -- de "nao e membro" (HRD23): um codigo proprio dizia a quem configura que
  -- esta pessoa e visada (revisao de 9/11, M1).
  IF EXISTS (SELECT 1 FROM public.denuncias_impedidos i
               JOIN public.denuncias d ON d.id = i.denuncia_id AND d.organization_id = i.organization_id
              WHERE i.organization_id = p_organization_id AND i.anew_user_id = p_user
                AND i.motivo = 'visado' AND i.retirado_em IS NULL
                AND d.estado NOT IN ('concluida', 'arquivada')) THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  INSERT INTO public.denuncias_responsaveis AS r (organization_id, anew_user_id, ativo, designado_por, designado_em)
  VALUES (p_organization_id, p_user, true, v_eu, now())
  ON CONFLICT (organization_id, anew_user_id) DO UPDATE
    SET ativo = true, designado_por = EXCLUDED.designado_por, designado_em = EXCLUDED.designado_em,
        removido_por = NULL, removido_em = NULL
    WHERE NOT r.ativo
  RETURNING r.id INTO v_id;
  IF v_id IS NOT NULL THEN
    PERFORM public.denuncias_auditar(p_organization_id, 'responsavel_designado', v_eu, p_user, NULL, NULL);
  END IF;
  RETURN public.rpc_denuncias_canal_ler(p_organization_id);
END;
$$;

CREATE FUNCTION public.rpc_denuncias_responsavel_remover(p_organization_id uuid, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu    uuid := public.denuncias_eu();
  v_desde date;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(public.has_anew_permission_in_org(auth.uid(), 'hr.denuncias.configurar', p_organization_id), false) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
  END IF;
  -- Primeiro a designacao (espera por qualquer atribuicao em curso que a tenha
  -- trancado FOR SHARE), depois os casos: a mesma ordem de rpc_denuncia_atribuir.
  UPDATE public.denuncias_responsaveis r SET ativo = false, removido_por = v_eu, removido_em = now()
   WHERE r.organization_id = p_organization_id AND r.anew_user_id = p_user AND r.ativo
  RETURNING (r.designado_em AT TIME ZONE 'Europe/Lisbon')::date INTO v_desde;
  IF v_desde IS NOT NULL THEN
    -- Revisao de 9/11 (HIGH): nao se remove quem deixaria casos abertos que
    -- mais ninguem ve (outro elegivel nao impedido a quem o caso esta
    -- atribuido, ou designado ate ao dia em que chegou). A passagem faz-se
    -- atribuindo esses casos antes; remover nao abre a fila orfa a ninguem.
    IF EXISTS (
         SELECT 1
           FROM public.denuncias d
          WHERE d.organization_id = p_organization_id
            AND d.estado NOT IN ('concluida', 'arquivada')
            -- casos que o removido via (dele, ou chegados desde a designacao)
            AND (d.responsavel_id = p_user OR v_desde <= d.recebida_em)
            AND NOT EXISTS (SELECT 1 FROM public.denuncias_impedidos i
                             WHERE i.denuncia_id = d.id AND i.anew_user_id = p_user AND i.retirado_em IS NULL)
            AND NOT EXISTS (
              SELECT 1 FROM public.denuncias_elegiveis(p_organization_id) e
               WHERE e.anew_user_id <> p_user
                 AND (d.responsavel_id = e.anew_user_id OR e.desde <= d.recebida_em)
                 AND NOT EXISTS (SELECT 1 FROM public.denuncias_impedidos i2
                                  WHERE i2.denuncia_id = d.id AND i2.anew_user_id = e.anew_user_id
                                    AND i2.retirado_em IS NULL))) THEN
      RAISE EXCEPTION 'sem_responsaveis' USING ERRCODE = 'HRD28';
    END IF;
    -- Os casos abertos dele voltam a fila.
    WITH libertados AS (
      UPDATE public.denuncias d SET responsavel_id = NULL
       WHERE d.organization_id = p_organization_id AND d.responsavel_id = p_user
         AND d.estado NOT IN ('concluida', 'arquivada')
      RETURNING d.id)
    INSERT INTO public.denuncias_eventos (organization_id, denuncia_id, tipo, quem_user_id, dados)
    SELECT p_organization_id, l.id, 'responsavel_libertado', v_eu, jsonb_build_object('alvo', p_user)
      FROM libertados l;
    PERFORM public.denuncias_auditar(p_organization_id, 'responsavel_removido', v_eu, p_user, NULL, NULL);
  END IF;
  RETURN public.rpc_denuncias_canal_ler(p_organization_id);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_impedimento_retirar(p_organization_id uuid, p_denuncia_id uuid, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_i  uuid;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(public.has_anew_permission_in_org(auth.uid(), 'hr.denuncias.configurar', p_organization_id), false) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
  END IF;
  -- So o 'visado' registado por um responsavel (o que o denunciante indicou e
  -- os conflitos ficam); ninguem retira o proprio.
  SELECT i.id INTO v_i FROM public.denuncias_impedidos i
   WHERE i.organization_id = p_organization_id AND i.denuncia_id = p_denuncia_id
     AND i.anew_user_id = p_user AND i.retirado_em IS NULL
     AND i.motivo = 'visado' AND i.registado_por IS NOT NULL
   FOR UPDATE;
  IF v_i IS NULL OR p_user = v_eu THEN
    RAISE EXCEPTION 'impedimento_invalido' USING ERRCODE = 'HRD15';
  END IF;
  UPDATE public.denuncias_impedidos i SET retirado_em = now(), retirado_por = v_eu WHERE i.id = v_i;
  PERFORM public.denuncias_evento(p_organization_id, p_denuncia_id, 'impedimento_retirado', v_eu,
                                  jsonb_build_object('alvo', p_user), NULL);
  PERFORM public.denuncias_auditar(p_organization_id, 'impedimento_retirado', v_eu, p_user, p_denuncia_id, NULL);
  RETURN jsonb_build_object('retirado', true);
END;
$$;

CREATE FUNCTION public.rpc_denuncias_canal_auditoria(p_organization_id uuid, p_limite integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu   uuid := public.denuncias_eu();
  v_conf boolean;
  v_r    jsonb;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  v_conf := coalesce(public.has_anew_permission_in_org(auth.uid(), 'hr.denuncias.configurar', p_organization_id), false);
  IF NOT v_conf AND NOT EXISTS (SELECT 1 FROM public.denuncias_elegiveis(p_organization_id) e
                                 WHERE e.anew_user_id = v_eu) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
  END IF;
  -- Revisao de 9/11 (M1): o alvo e o codigo de um evento ligado a um caso
  -- (visado, conflito, impedimento retirado, auto-atribuicao) so saem a quem
  -- pode ver esse caso; aos outros saem NULL (fica o tipo, quem e quando).
  WITH vis AS MATERIALIZED (
    SELECT v.denuncia_id FROM public.denuncias_visiveis(p_organization_id, v_eu, NULL) v
  )
  SELECT coalesce(jsonb_agg(x.o ORDER BY x.seq DESC), '[]'::jsonb) INTO v_r
    FROM (
      SELECT a.seq, jsonb_build_object(
               'tipo', a.tipo, 'quem_id', a.quem_user_id, 'quem_nome', qu.name,
               'alvo_id', CASE WHEN a.denuncia_id IS NULL OR vs.denuncia_id IS NOT NULL THEN a.alvo_user_id END,
               'alvo_nome', CASE WHEN a.denuncia_id IS NULL OR vs.denuncia_id IS NOT NULL THEN au.name END,
               'codigo', CASE WHEN vs.denuncia_id IS NOT NULL THEN d.codigo END,
               'dados', a.dados, 'em', a.criado_em) AS o
        FROM public.denuncias_canal_auditoria a
        JOIN public.anew_users qu ON qu.id = a.quem_user_id
        LEFT JOIN public.anew_users au ON au.id = a.alvo_user_id
        LEFT JOIN public.denuncias d ON d.id = a.denuncia_id AND d.organization_id = a.organization_id
        LEFT JOIN vis vs ON vs.denuncia_id = a.denuncia_id
       WHERE a.organization_id = p_organization_id
         -- O visado nao fica a saber, por aqui, que foi indicado num caso.
         AND (a.alvo_user_id IS DISTINCT FROM v_eu OR a.tipo NOT IN ('visado_registado', 'impedimento_retirado'))
       ORDER BY a.seq DESC
       LIMIT greatest(1, least(coalesce(p_limite, 200), 500))) x;
  RETURN v_r;
END;
$$;

-- ---- Denunciante identificado ("As minhas") ---------------------------------

CREATE FUNCTION public.rpc_denuncias_minhas(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_r  jsonb;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(public.denuncias_vista_denunciante(d.id) ORDER BY d.recebida_em DESC, d.codigo DESC),
                  '[]'::jsonb)
    INTO v_r
    FROM public.denuncias_identidade i
    JOIN public.denuncias d ON d.id = i.denuncia_id AND d.organization_id = i.organization_id
   WHERE i.organization_id = p_organization_id AND i.anew_user_id = v_eu;
  RETURN v_r;
END;
$$;

CREATE FUNCTION public.rpc_denuncia_minha_responder(p_organization_id uuid, p_denuncia_id uuid, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_t  text;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  SELECT d.* INTO v_d
    FROM public.denuncias d
    JOIN public.denuncias_identidade i ON i.denuncia_id = d.id AND i.organization_id = d.organization_id
   WHERE d.id = p_denuncia_id AND d.organization_id = p_organization_id AND i.anew_user_id = v_eu
   FOR UPDATE OF d;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrada' USING ERRCODE = 'HRD09';
  END IF;
  IF v_d.estado IN ('concluida', 'arquivada') THEN
    RAISE EXCEPTION 'fechada' USING ERRCODE = 'HRD08';
  END IF;
  v_t := public.denuncias_texto_mensagem(p_texto);
  IF (SELECT count(*) FROM public.denuncias_mensagens m
       WHERE m.denuncia_id = v_d.id AND m.organization_id = v_d.organization_id AND m.autor = 'denunciante') >= 50 THEN
    RAISE EXCEPTION 'limite_mensagens' USING ERRCODE = 'HRD25';
  END IF;
  INSERT INTO public.denuncias_mensagens (organization_id, denuncia_id, autor, texto)
  VALUES (v_d.organization_id, v_d.id, 'denunciante', v_t);
  IF v_d.estado = 'mais_info' THEN
    UPDATE public.denuncias d SET estado = 'em_analise'
     WHERE d.id = v_d.id AND d.organization_id = v_d.organization_id;
  END IF;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'denunciante_respondeu', NULL, NULL, NULL);
  RETURN public.denuncias_vista_denunciante(v_d.id);
END;
$$;

-- ==============================================================================
-- 8. RPCs de servico (so a Edge denuncia-publica, com a chave de servico)
-- ==============================================================================

-- {ativo, organization_id, organizacao}: o id serve de sal ao HMAC do PIN na
-- Edge e nunca sai para o browser (handler.ts so devolve nome_org).
CREATE FUNCTION public.rpc_denuncia_publica_canal(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org  uuid;
  v_nome text;
BEGIN
  SELECT c.organization_id, o.name INTO v_org, v_nome
    FROM public.denuncias_canal c
    JOIN public.anew_organizations o ON o.id = c.organization_id
   WHERE c.slug_publico = lower(btrim(coalesce(p_slug, ''))) AND c.ativo AND o.deleted_at IS NULL;
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ativo', false);
  END IF;
  RETURN jsonb_build_object('ativo', true, 'organization_id', v_org, 'organizacao', v_nome);
END;
$$;

-- Limite de ver o canal e de ler/responder com sessao: por IP (HMAC) e global.
-- Nunca pela sessao (ligava a contagem a uma denuncia). true = dentro.
CREATE FUNCTION public.rpc_denuncia_publica_limitar(p_balde text, p_chave_ip text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ip_ok     boolean := true;
  v_global_ok boolean;
  v_max_ip    integer;
BEGIN
  IF p_balde IS NULL OR p_balde NOT IN ('canal', 'sessao') THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  v_max_ip := CASE WHEN p_balde = 'canal' THEN 60 ELSE 120 END;
  IF p_chave_ip IS NOT NULL AND p_chave_ip ~ '^[0-9a-f]{64}$' THEN
    v_ip_ok := public.denuncias_limite_consumir(p_balde, 'ip:' || p_chave_ip, v_max_ip);
  END IF;
  -- O global so conta o que passou o limite do IP (M2).
  IF NOT v_ip_ok THEN
    RETURN false;
  END IF;
  v_global_ok := public.denuncias_limite_consumir(p_balde, 'global', 3000);
  RETURN v_global_ok;
END;
$$;

-- Gasta o limite de criar e reserva o codigo seguinte para o nonce da Edge.
CREATE FUNCTION public.rpc_denuncia_publica_reservar_codigo(p_slug text, p_chave_ip text, p_reserva_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org    uuid;
  v_codigo text;
BEGIN
  IF p_reserva_hash IS NULL OR p_reserva_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  SELECT c.organization_id INTO v_org
    FROM public.denuncias_canal c
    JOIN public.anew_organizations o ON o.id = c.organization_id
   WHERE c.slug_publico = lower(btrim(coalesce(p_slug, ''))) AND c.ativo AND o.deleted_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'canal_inativo' USING ERRCODE = 'HRD19';
  END IF;
  IF NOT public.denuncias_limite_publico('criar', v_org, p_chave_ip) THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRD22';
  END IF;
  v_codigo := public.denuncias_proximo_codigo(v_org);
  INSERT INTO public.denuncias_reservas (organization_id, codigo, reserva_hash, hora)
  VALUES (v_org, v_codigo, p_reserva_hash, date_trunc('hour', now()));
  RETURN jsonb_build_object('organization_id', v_org, 'codigo', v_codigo);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_publica_criar(p_slug text, p_codigo text, p_reserva_hash text, p_dados jsonb,
                                                  p_pin_hash text, p_identidade jsonb, p_auth_user_id uuid,
                                                  p_impedidos uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k_chaves  constant text[] := ARRAY['anonima', 'tipo', 'descricao', 'quando', 'onde', 'envolvidos',
                                     'ainda_acontece', 'testemunhas', 'ja_reportado', 'boa_fe'];
  v_c       public.denuncias_canal;
  v_codigo  text := upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'));
  v_anon    boolean;
  v_em      timestamptz;
  v_tipo    text;
  v_desc    text;
  v_quando  text;
  v_ainda   text;
  v_testem  text;
  v_id      uuid;
  v_nome    text;
  v_email   text;
  v_tel     text;
  v_pessoa  uuid;
  v_user    uuid;
  v_contac  boolean := false;
  v_so_resp boolean := true;
BEGIN
  SELECT c.* INTO v_c
    FROM public.denuncias_canal c
   WHERE c.slug_publico = lower(btrim(coalesce(p_slug, ''))) AND c.ativo
     AND EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = c.organization_id AND o.deleted_at IS NULL)
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'canal_inativo' USING ERRCODE = 'HRD19';
  END IF;

  -- Codigo: SO com reserva viva desta organizacao e do mesmo nonce; apaga-se
  -- aqui (se a criacao falhar mais abaixo, a transaccao desfaz o DELETE).
  IF v_codigo !~ '^DEN-[0-9]{4}-[0-9]{4,6}$'
     OR p_reserva_hash IS NULL OR p_reserva_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'codigo_invalido' USING ERRCODE = 'HRD26';
  END IF;
  DELETE FROM public.denuncias_reservas r
   WHERE r.organization_id = v_c.organization_id AND r.codigo = v_codigo
     AND r.reserva_hash = p_reserva_hash
     AND r.hora >= date_trunc('hour', now()) - interval '1 hour';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'codigo_invalido' USING ERRCODE = 'HRD26';
  END IF;

  IF p_pin_hash IS NULL OR p_pin_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;

  -- Formulario (= formulario.ts e pedidos.ts): so as chaves conhecidas.
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' OR octet_length(p_dados::text) > 20000
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_dados) AS k(chave) WHERE k.chave <> ALL (k_chaves)) THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  -- O modo e OBRIGATORIO e booleano (nunca passa a anonima em silencio).
  IF jsonb_typeof(p_dados -> 'anonima') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_dados -> 'boa_fe') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  v_anon := (p_dados ->> 'anonima')::boolean;
  v_em := public.denuncias_instante(v_anon);
  v_tipo := public.denuncias_texto(p_dados, 'tipo', 40);
  v_desc := public.denuncias_texto(p_dados, 'descricao', 4000);
  v_quando := public.denuncias_texto(p_dados, 'quando', 200);
  v_ainda := coalesce(public.denuncias_texto(p_dados, 'ainda_acontece', 10), 'nao_sei');
  v_testem := coalesce(public.denuncias_texto(p_dados, 'testemunhas', 10), 'nao_sei');
  IF v_tipo IS NULL OR v_tipo NOT IN ('assedio', 'discriminacao', 'corrupcao', 'fraude', 'seguranca',
                                      'dados', 'conflito', 'outro')
     OR v_desc IS NULL OR length(v_desc) < 30
     OR v_quando IS NULL OR length(v_quando) < 2
     OR v_ainda NOT IN ('sim', 'nao', 'nao_sei')
     OR v_testem NOT IN ('sim', 'nao', 'nao_sei')
     OR (p_dados ->> 'boa_fe')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;

  -- Identidade: so numa identificada. Numa anonima, p_identidade e
  -- p_auth_user_id sao DESCARTADOS (nunca chegam a nenhuma tabela).
  IF NOT v_anon THEN
    IF p_identidade IS NOT NULL AND jsonb_typeof(p_identidade) <> 'object' THEN
      RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
    END IF;
    v_tel := public.denuncias_texto(p_identidade, 'telefone', 40);
    IF v_tel IS NOT NULL AND length(v_tel) < 3 THEN
      RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
    END IF;
    IF p_auth_user_id IS NOT NULL THEN
      -- Dentro da app: a Edge validou o JWT e passa o id do Auth. A conta tem
      -- de ser membro activo nao cliente desta organizacao. Nome e email vem
      -- da conta, nao do corpo (pessoaLigada.ts).
      SELECT u.id INTO v_user FROM public.anew_users u
       WHERE u.auth_user_id = p_auth_user_id AND u.deleted_at IS NULL
       ORDER BY u.id
       LIMIT 1;
      IF v_user IS NULL OR NOT public.denuncias_membro_ativo(v_c.organization_id, v_user) THEN
        RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
      END IF;
      SELECT nullif(btrim(left(u.name, 200)), ''),
             CASE WHEN u.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' AND length(u.email) <= 254
                  THEN u.email END
        INTO v_nome, v_email
        FROM public.anew_users u WHERE u.id = v_user;
      SELECT pc.pessoa_id INTO v_pessoa FROM public.pessoas_contas pc
       WHERE pc.anew_user_id = v_user AND pc.organization_id = v_c.organization_id
         AND pc.estado = 'activa' AND pc.revogada_em IS NULL
       ORDER BY pc.pessoa_id
       LIMIT 1;
    ELSE
      v_nome := public.denuncias_texto(p_identidade, 'nome', 200);
      v_email := public.denuncias_texto(p_identidade, 'email', 254);
      IF v_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
        RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
      END IF;
    END IF;
    IF coalesce(jsonb_typeof(p_identidade -> 'pode_contactar'), 'null') NOT IN ('boolean', 'null')
       OR coalesce(jsonb_typeof(p_identidade -> 'so_responsavel'), 'null') NOT IN ('boolean', 'null') THEN
      RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
    END IF;
    IF jsonb_typeof(p_identidade -> 'pode_contactar') = 'boolean' THEN
      v_contac := (p_identidade ->> 'pode_contactar')::boolean;
    END IF;
    IF jsonb_typeof(p_identidade -> 'so_responsavel') = 'boolean' THEN
      v_so_resp := (p_identidade ->> 'so_responsavel')::boolean;
    END IF;
    IF v_contac AND v_email IS NULL AND v_tel IS NULL THEN
      RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.denuncias (organization_id, codigo, anonima, origem, tipo, descricao, resumo, quando, onde,
                                  envolvidos, ainda_acontece, testemunhas, ja_reportado, boa_fe,
                                  recebida_em, prazo_confirmar, prazo_seguimento)
    VALUES (v_c.organization_id, v_codigo, v_anon,
            CASE WHEN NOT v_anon AND v_user IS NOT NULL THEN 'aplicacao' ELSE 'publica' END,
            v_tipo, v_desc, public.denuncias_resumo(v_desc), v_quando,
            public.denuncias_texto(p_dados, 'onde', 1000), public.denuncias_texto(p_dados, 'envolvidos', 1000),
            v_ainda, v_testem, public.denuncias_texto(p_dados, 'ja_reportado', 1000), true,
            public.denuncias_hoje(), public.denuncias_hoje() + 7,
            (public.denuncias_hoje() + interval '3 months')::date)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'codigo_invalido' USING ERRCODE = 'HRD26';
  END;

  INSERT INTO public.denuncias_acesso (denuncia_id, organization_id, pin_hash)
  VALUES (v_id, v_c.organization_id, p_pin_hash);

  IF NOT v_anon THEN
    INSERT INTO public.denuncias_identidade (denuncia_id, organization_id, anew_user_id, pessoa_id, nome, email,
                                             telefone, pode_contactar, so_responsavel)
    VALUES (v_id, v_c.organization_id, v_user, v_pessoa, v_nome, v_email, v_tel, v_contac, v_so_resp);
    -- Quem denuncia nunca trata o proprio caso. Esta linha (conflito sem
    -- registado_por) so a _criar a grava; a vista do gestor nunca a mostra.
    IF v_user IS NOT NULL THEN
      INSERT INTO public.denuncias_impedidos (organization_id, denuncia_id, anew_user_id, motivo, registado_por, registado_em)
      VALUES (v_c.organization_id, v_id, v_user, 'conflito', NULL, v_em);
    END IF;
  END IF;

  -- D3: responsaveis indicados pelo denunciante ficam impedidos desde a entrada.
  -- So contam responsaveis designados activos desta organizacao; o resto ignora-se.
  INSERT INTO public.denuncias_impedidos (organization_id, denuncia_id, anew_user_id, motivo, registado_por, registado_em)
  SELECT v_c.organization_id, v_id, r.anew_user_id, 'visado', NULL, v_em
    FROM public.denuncias_responsaveis r
   WHERE r.organization_id = v_c.organization_id AND r.ativo
     AND r.anew_user_id = ANY (coalesce(p_impedidos[1:20], '{}'::uuid[]))
     AND r.anew_user_id IS DISTINCT FROM v_user;

  PERFORM public.denuncias_evento(v_c.organization_id, v_id, 'recebida', NULL, NULL, v_em);
  RETURN jsonb_build_object('codigo', v_codigo);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_publica_entrar(p_slug text, p_codigo text, p_pin_hash text,
                                                   p_sessao_hash text, p_chave_ip text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org    uuid;
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'));
  v_a      public.denuncias_acesso;
BEGIN
  SELECT c.organization_id INTO v_org FROM public.denuncias_canal c
   WHERE c.slug_publico = lower(btrim(coalesce(p_slug, '')));
  -- O limite conta sempre e nao lanca: acima dele, o mesmo false de um PIN errado.
  IF NOT public.denuncias_limite_publico('entrar', v_org, p_chave_ip) THEN
    RETURN false;
  END IF;
  IF v_org IS NULL OR p_pin_hash IS NULL OR p_pin_hash !~ '^[0-9a-f]{64}$'
     OR p_sessao_hash IS NULL OR p_sessao_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  SELECT a.* INTO v_a
    FROM public.denuncias d
    JOIN public.denuncias_acesso a ON a.denuncia_id = d.id AND a.organization_id = d.organization_id
   WHERE d.organization_id = v_org AND d.codigo = v_codigo
   FOR UPDATE OF a;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_a.bloqueada_ate IS NOT NULL AND v_a.bloqueada_ate > now() THEN
    RETURN false;
  END IF;

  IF v_a.pin_hash = p_pin_hash THEN
    -- Acertar limpa a escalada (M3). Sessao: inicio ao quarto de hora para
    -- baixo, expira ao quarto de hora para cima (30 min), tecto 4 h (M4).
    UPDATE public.denuncias_acesso a
       SET tentativas_falhadas = 0, bloqueios = 0, bloqueada_ate = NULL, ultima_falha_em = NULL,
           sessao_hash = p_sessao_hash,
           sessao_inicio_em = to_timestamp((floor(extract(epoch FROM now()) / 900) * 900)::double precision),
           sessao_expira_em = to_timestamp((ceil(extract(epoch FROM now() + interval '30 minutes') / 900) * 900)::double precision)
     WHERE a.denuncia_id = v_a.denuncia_id;
    RETURN true;
  END IF;

  -- 24 h sem falhas: a escalada e o contador recomecam (M3).
  IF v_a.ultima_falha_em IS NOT NULL AND v_a.ultima_falha_em < now() - interval '24 hours' THEN
    v_a.tentativas_falhadas := 0;
    v_a.bloqueios := 0;
  END IF;

  -- 5 falhas: bloqueio de 15 min, a dobrar a cada bloqueio, ate 24 h (D2 A).
  IF v_a.tentativas_falhadas + 1 >= 5 THEN
    UPDATE public.denuncias_acesso a
       SET tentativas_falhadas = 0, bloqueios = v_a.bloqueios + 1,
           bloqueada_ate = now() + make_interval(mins => least(15 * (1 << least(v_a.bloqueios, 7)), 1440)),
           ultima_falha_em = date_trunc('hour', now())
     WHERE a.denuncia_id = v_a.denuncia_id;
  ELSE
    UPDATE public.denuncias_acesso a
       SET tentativas_falhadas = v_a.tentativas_falhadas + 1, bloqueios = v_a.bloqueios,
           ultima_falha_em = date_trunc('hour', now())
     WHERE a.denuncia_id = v_a.denuncia_id;
  END IF;
  RETURN false;
END;
$$;

CREATE FUNCTION public.rpc_denuncia_publica_ler(p_sessao_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.denuncias_vista_denunciante(public.denuncias_sessao(p_sessao_hash));
END;
$$;

CREATE FUNCTION public.rpc_denuncia_publica_responder(p_sessao_hash text, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := public.denuncias_sessao(p_sessao_hash);
  v_d  public.denuncias;
  v_t  text;
  v_em timestamptz;
BEGIN
  SELECT d.* INTO v_d FROM public.denuncias d WHERE d.id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sessao_invalida' USING ERRCODE = 'HRD24';
  END IF;
  IF v_d.estado IN ('concluida', 'arquivada') THEN
    RAISE EXCEPTION 'fechada' USING ERRCODE = 'HRD08';
  END IF;
  v_t := public.denuncias_texto_mensagem(p_texto);
  IF (SELECT count(*) FROM public.denuncias_mensagens m
       WHERE m.denuncia_id = v_d.id AND m.organization_id = v_d.organization_id AND m.autor = 'denunciante') >= 50 THEN
    RAISE EXCEPTION 'limite_mensagens' USING ERRCODE = 'HRD25';
  END IF;
  v_em := public.denuncias_instante(v_d.anonima);
  INSERT INTO public.denuncias_mensagens (organization_id, denuncia_id, autor, texto, criada_em)
  VALUES (v_d.organization_id, v_d.id, 'denunciante', v_t, v_em);
  IF v_d.estado = 'mais_info' THEN
    UPDATE public.denuncias d SET estado = 'em_analise'
     WHERE d.id = v_d.id AND d.organization_id = v_d.organization_id;
  END IF;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'denunciante_respondeu', NULL, NULL, v_em);
  RETURN public.denuncias_vista_denunciante(v_d.id);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_publica_sair(p_sessao_hash text)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.denuncias_acesso a SET sessao_hash = NULL, sessao_inicio_em = NULL, sessao_expira_em = NULL
   WHERE a.sessao_hash = p_sessao_hash
$$;

CREATE FUNCTION public.rpc_denuncias_limpar()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_a integer;
  v_b integer;
  v_c integer;
BEGIN
  DELETE FROM public.denuncias_limites l WHERE l.janela < now() - interval '24 hours';
  GET DIAGNOSTICS v_a = ROW_COUNT;
  DELETE FROM public.denuncias_reservas r WHERE r.hora < date_trunc('hour', now()) - interval '1 hour';
  GET DIAGNOSTICS v_b = ROW_COUNT;
  UPDATE public.denuncias_acesso a SET sessao_hash = NULL, sessao_inicio_em = NULL, sessao_expira_em = NULL
   WHERE a.sessao_hash IS NOT NULL
     AND (a.sessao_expira_em <= now() OR a.sessao_inicio_em <= now() - interval '4 hours');
  GET DIAGNOSTICS v_c = ROW_COUNT;
  RETURN v_a + v_b + v_c;
END;
$$;

-- ==============================================================================
-- 9. Fechar e conceder: RLS forcada, politica RESTRICTIVE, REVOKE e GRANT
-- ==============================================================================
DO $fechar$
DECLARE
  v_t text;
  v_s text;
  v_f text;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['denuncias_canal', 'denuncias_responsaveis', 'denuncias', 'denuncias_acesso',
                             'denuncias_identidade', 'denuncias_mensagens', 'denuncias_notas',
                             'denuncias_eventos', 'denuncias_impedidos', 'denuncias_canal_auditoria',
                             'denuncias_limites', 'denuncias_reservas']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', v_t);
    -- RESTRICTIVE: mesmo que um dia alguem acrescente uma politica permissiva e
    -- um GRANT, esta continua a negar tudo a quem nao tem BYPASSRLS.
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false)',
                   v_t || '_fechada', v_t);
  END LOOP;

  FOR v_s IN
    SELECT s.oid::regclass::text
      FROM pg_class s
      JOIN pg_depend d ON d.objid = s.oid AND d.deptype::text IN ('a', 'i')
      JOIN pg_class t ON t.oid = d.refobjid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE s.relkind::text = 'S' AND n.nspname::text = 'public' AND t.relname::text LIKE 'denuncias%'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated, service_role', v_s);
  END LOOP;

  FOR v_f IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname::text = 'public' AND (p.proname::text LIKE 'denuncia%' OR p.proname::text LIKE 'rpc_denuncia%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_f);
  END LOOP;
END;
$fechar$;

GRANT EXECUTE ON FUNCTION
  public.rpc_denuncias_listar(uuid),
  public.rpc_denuncias_por_confirmar(uuid),
  public.rpc_denuncia_abrir(uuid, uuid),
  public.rpc_denuncia_confirmar_rececao(uuid, uuid, text),
  public.rpc_denuncia_gravidade(uuid, uuid, text),
  public.rpc_denuncia_avaliacao(uuid, uuid, text),
  public.rpc_denuncia_atribuir(uuid, uuid, uuid),
  public.rpc_denuncia_impedir(uuid, uuid, uuid, text),
  public.rpc_denuncia_pedir_informacao(uuid, uuid, text),
  public.rpc_denuncia_mensagem(uuid, uuid, text),
  public.rpc_denuncia_nota(uuid, uuid, text),
  public.rpc_denuncia_concluir(uuid, uuid, text, text, text),
  public.rpc_denuncia_arquivar(uuid, uuid, text),
  public.rpc_denuncia_reabrir(uuid, uuid),
  public.rpc_denuncia_identidade_ver(uuid, uuid, text),
  public.rpc_denuncia_exportar(uuid, uuid, text),
  public.rpc_denuncias_responsaveis(uuid),
  public.rpc_denuncias_canal_ler(uuid),
  public.rpc_denuncias_canal_guardar(uuid, boolean, text),
  public.rpc_denuncias_canal_publico(uuid),
  public.rpc_denuncias_responsavel_designar(uuid, uuid),
  public.rpc_denuncias_responsavel_remover(uuid, uuid),
  public.rpc_denuncia_impedimento_retirar(uuid, uuid, uuid),
  public.rpc_denuncias_canal_auditoria(uuid, integer),
  public.rpc_denuncias_minhas(uuid),
  public.rpc_denuncia_minha_responder(uuid, uuid, text)
TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.rpc_denuncia_publica_limitar(text, text),
  public.rpc_denuncia_publica_canal(text),
  public.rpc_denuncia_publica_reservar_codigo(text, text, text),
  public.rpc_denuncia_publica_criar(text, text, text, jsonb, text, jsonb, uuid, uuid[]),
  public.rpc_denuncia_publica_entrar(text, text, text, text, text),
  public.rpc_denuncia_publica_ler(text),
  public.rpc_denuncia_publica_responder(text, text),
  public.rpc_denuncia_publica_sair(text),
  public.rpc_denuncias_limpar()
TO service_role;

COMMENT ON FUNCTION public.denuncias_visiveis(uuid, uuid, uuid) IS
'INTERNA: definicao unica de "posso ver/tratar este caso": elegivel (designado + hr.denuncias.gerir), nao impedido, e o caso e meu ou esta na fila e foi recebido desde a minha designacao (ou nao ha outro elegivel nao impedido designado antes dele). Desde 20270111300000.';
COMMENT ON FUNCTION public.rpc_denuncias_listar(uuid) IS
'Lista do gestor (so o que denuncias_visiveis deixa): sem descricao, sem identidade; resumo so nos casos atribuidos a quem chama. Desde 20270111300000.';
COMMENT ON FUNCTION public.rpc_denuncia_abrir(uuid, uuid) IS
'O caso sem identidade (forma DenunciaAbertaDb). Abrir um caso que nao e meu regista consultada (1 por dia). HRD09 se nao visivel. Desde 20270111300000.';
COMMENT ON FUNCTION public.rpc_denuncia_identidade_ver(uuid, uuid, text) IS
'Identidade de uma denuncia identificada: motivo >= 3, so_responsavel respeitado, regista identidade_vista ANTES de devolver; cada chamada regista. Desde 20270111300000.';
COMMENT ON FUNCTION public.rpc_denuncias_canal_publico(uuid) IS
'Qualquer membro activo da organizacao: {ativo, slug_publico} do canal, para a denuncia feita dentro da app chegar a Edge. Desde 20270111300000.';
COMMENT ON FUNCTION public.rpc_denuncia_publica_criar(text, text, text, jsonb, text, jsonb, uuid, uuid[]) IS
'SO service_role (Edge denuncia-publica). Cria a denuncia com um codigo de reserva viva (mesmo nonce; a reserva apaga-se) e o HMAC do PIN. Numa anonima descarta identidade e conta, e grava ao dia. p_auth_user_id = id do Auth validado pela Edge. Desde 20270111300000.';
COMMENT ON FUNCTION public.rpc_denuncia_publica_entrar(text, text, text, text, text) IS
'SO service_role. Codigo + HMAC do PIN -> abre sessao (SHA-256, 30 min). 5 falhas = bloqueio 15 min a dobrar ate 24 h. Codigo inexistente, PIN errado, bloqueada e limite: o mesmo false. Desde 20270111300000.';

-- ==============================================================================
-- 10. Conferir: estrutura e privilegios; depois a prova na nike, DESFEITA
-- ==============================================================================

-- Ajudantes da prova (temporarios: so existem nesta sessao e largam-se no fim).
CREATE FUNCTION pg_temp.den_chamar(p_auth uuid, p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  v_r      text;
  v_estado text;
  v_msg    text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_auth::text, ''), true),
          set_config('request.jwt.claims',
                     CASE WHEN p_auth IS NULL THEN '{}'
                          ELSE json_build_object('sub', p_auth, 'role', 'authenticated')::text END, true);
  BEGIN
    EXECUTE p_sql INTO v_r;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    v_r := 'ERRO:' || v_estado || ':' || v_msg;
  END;
  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
  RETURN coalesce(v_r, '');
END;
$f$;

CREATE FUNCTION pg_temp.den_ok(p_auth uuid, p_sql text, p_rotulo text)
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  v_r text := pg_temp.den_chamar(p_auth, p_sql);
BEGIN
  IF v_r LIKE 'ERRO:%' THEN
    RAISE EXCEPTION 'Conferir [%]: devia passar; deu %', p_rotulo, left(v_r, 400);
  END IF;
  RETURN v_r;
END;
$f$;

CREATE FUNCTION pg_temp.den_erro(p_auth uuid, p_sql text, p_codigo text, p_rotulo text)
RETURNS void
LANGUAGE plpgsql
AS $f$
DECLARE
  v_r text := pg_temp.den_chamar(p_auth, p_sql);
BEGIN
  IF v_r NOT LIKE 'ERRO:' || p_codigo || ':%' THEN
    RAISE EXCEPTION 'Conferir [%]: esperava o erro %, veio %', p_rotulo, p_codigo, left(coalesce(v_r, ''), 400);
  END IF;
END;
$f$;

DO $conferir$
DECLARE
  k_nike     constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_tabelas  constant text[] := ARRAY['denuncias_canal', 'denuncias_responsaveis', 'denuncias', 'denuncias_acesso',
                                      'denuncias_identidade', 'denuncias_mensagens', 'denuncias_notas',
                                      'denuncias_eventos', 'denuncias_impedidos', 'denuncias_canal_auditoria',
                                      'denuncias_limites', 'denuncias_reservas'];
  k_auth     constant text[] := ARRAY[
    'rpc_denuncias_listar(uuid)', 'rpc_denuncias_por_confirmar(uuid)', 'rpc_denuncia_abrir(uuid,uuid)',
    'rpc_denuncia_confirmar_rececao(uuid,uuid,text)', 'rpc_denuncia_gravidade(uuid,uuid,text)',
    'rpc_denuncia_avaliacao(uuid,uuid,text)', 'rpc_denuncia_atribuir(uuid,uuid,uuid)',
    'rpc_denuncia_impedir(uuid,uuid,uuid,text)', 'rpc_denuncia_pedir_informacao(uuid,uuid,text)',
    'rpc_denuncia_mensagem(uuid,uuid,text)', 'rpc_denuncia_nota(uuid,uuid,text)',
    'rpc_denuncia_concluir(uuid,uuid,text,text,text)', 'rpc_denuncia_arquivar(uuid,uuid,text)',
    'rpc_denuncia_reabrir(uuid,uuid)', 'rpc_denuncia_identidade_ver(uuid,uuid,text)',
    'rpc_denuncia_exportar(uuid,uuid,text)', 'rpc_denuncias_responsaveis(uuid)',
    'rpc_denuncias_canal_ler(uuid)', 'rpc_denuncias_canal_guardar(uuid,boolean,text)',
    'rpc_denuncias_canal_publico(uuid)',
    'rpc_denuncias_responsavel_designar(uuid,uuid)', 'rpc_denuncias_responsavel_remover(uuid,uuid)',
    'rpc_denuncia_impedimento_retirar(uuid,uuid,uuid)', 'rpc_denuncias_canal_auditoria(uuid,integer)',
    'rpc_denuncias_minhas(uuid)', 'rpc_denuncia_minha_responder(uuid,uuid,text)'];
  k_servico  constant text[] := ARRAY[
    'rpc_denuncia_publica_limitar(text,text)', 'rpc_denuncia_publica_canal(text)',
    'rpc_denuncia_publica_reservar_codigo(text,text,text)',
    'rpc_denuncia_publica_criar(text,text,text,jsonb,text,jsonb,uuid,uuid[])',
    'rpc_denuncia_publica_entrar(text,text,text,text,text)', 'rpc_denuncia_publica_ler(text)',
    'rpc_denuncia_publica_responder(text,text)', 'rpc_denuncia_publica_sair(text)',
    'rpc_denuncias_limpar()'];
  k_internas constant integer := 24;
  r          record;
  v_n        integer;
  v_grant    text;
  v_deve     text;
  v_assin    text;
  -- prova
  v_a        uuid; v_a_uid uuid; v_role_a uuid;
  v_b        uuid; v_b_uid uuid; v_role_b uuid;
  v_c        uuid; v_c_uid uuid;
  v_c_nome   text;
  v_falsa    uuid := gen_random_uuid();
  v_tag      text := replace(gen_random_uuid()::text, '-', '');
  v_slug     text;
  v_hoje     date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_meia     timestamptz := date_trunc('day', now() AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon';
  v_ip       text := encode(sha256(convert_to('ip-' || gen_random_uuid()::text, 'UTF8')), 'hex');
  v_ip2      text := encode(sha256(convert_to('ip2-' || gen_random_uuid()::text, 'UTF8')), 'hex');
  v_res1     text := encode(sha256(convert_to('r1-' || gen_random_uuid()::text, 'UTF8')), 'hex');
  v_res2     text := encode(sha256(convert_to('r2-' || gen_random_uuid()::text, 'UTF8')), 'hex');
  v_pin1     text := encode(sha256(convert_to('pin-1-' || gen_random_uuid()::text, 'UTF8')), 'hex');
  v_pin2     text := encode(sha256(convert_to('pin-2-' || gen_random_uuid()::text, 'UTF8')), 'hex');
  v_pin_mau  text := encode(sha256(convert_to('pin-mau-' || gen_random_uuid()::text, 'UTF8')), 'hex');
  v_sess     text;
  v_cod1     text; v_cod2 text; v_cod3 text; v_cod4 text;
  v_d1       uuid; v_d2 uuid; v_d3 uuid; v_d4 uuid;
  v_res3     text := encode(sha256(convert_to('r3-' || gen_random_uuid()::text, 'UTF8')), 'hex');
  v_res4     text := encode(sha256(convert_to('r4-' || gen_random_uuid()::text, 'UTF8')), 'hex');
  v_dados    jsonb;
  v_j        jsonb;
  v_t        text;
  v_i        integer;
  v_t0       timestamptz;
  v_ms       numeric;
BEGIN
  -- ---- 10.1 Estrutura e privilegios (catalogo) ----------------------------------
  FOREACH v_assin IN ARRAY k_tabelas LOOP
    IF to_regclass('public.' || v_assin) IS NULL THEN
      RAISE EXCEPTION 'Conferir: a tabela % nao ficou criada.', v_assin;
    END IF;
    IF NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.' || v_assin)) THEN
      RAISE EXCEPTION 'Conferir: % devia ter RLS ligada e forcada.', v_assin;
    END IF;
    SELECT count(*) INTO v_n FROM pg_policies pl
     WHERE pl.schemaname::text = 'public' AND pl.tablename::text = v_assin;
    IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM pg_policies pl
                                WHERE pl.schemaname::text = 'public' AND pl.tablename::text = v_assin
                                  AND pl.policyname::text = v_assin || '_fechada' AND pl.permissive::text = 'RESTRICTIVE'
                                  AND pl.cmd::text = 'ALL' AND pl.qual = 'false' AND pl.with_check = 'false') THEN
      RAISE EXCEPTION 'Conferir: % devia ter so a politica RESTRICTIVE %_fechada (false).', v_assin, v_assin;
    END IF;
    SELECT string_agg((CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END) || ':' || a.privilege_type::text, ',')
      INTO v_grant
      FROM pg_class c, LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     WHERE c.oid = to_regclass('public.' || v_assin) AND a.grantee <> c.relowner;
    IF coalesce(v_grant, '') <> '' THEN
      RAISE EXCEPTION 'Conferir: % nao devia ter privilegios de tabela para ninguem; tem "%".', v_assin, v_grant;
    END IF;
    SELECT count(*) INTO v_n FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.' || v_assin) AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Conferir: % tem % colunas com privilegios proprios.', v_assin, v_n;
    END IF;
    IF has_table_privilege('anon', 'public.' || v_assin, 'SELECT')
       OR has_table_privilege('authenticated', 'public.' || v_assin, 'SELECT')
       OR has_table_privilege('service_role', 'public.' || v_assin, 'SELECT')
       OR has_table_privilege('authenticated', 'public.' || v_assin, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || v_assin, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || v_assin, 'DELETE') THEN
      RAISE EXCEPTION 'Conferir: anon/authenticated/service_role ainda le ou escreve %.', v_assin;
    END IF;
  END LOOP;

  FOR r IN
    SELECT s.oid AS oid, s.oid::regclass::text AS nome
      FROM pg_class s
      JOIN pg_depend d ON d.objid = s.oid AND d.deptype::text IN ('a', 'i')
      JOIN pg_class t ON t.oid = d.refobjid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE s.relkind::text = 'S' AND n.nspname::text = 'public' AND t.relname::text LIKE 'denuncias%'
  LOOP
    IF has_sequence_privilege('anon', r.oid, 'USAGE') OR has_sequence_privilege('authenticated', r.oid, 'USAGE')
       OR has_sequence_privilege('service_role', r.oid, 'USAGE') THEN
      RAISE EXCEPTION 'Conferir: a sequencia % tem privilegios para anon/authenticated/service_role.', r.nome;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND (p.proname::text LIKE 'denuncia%' OR p.proname::text LIKE 'rpc_denuncia%');
  IF v_n <> cardinality(k_auth) + cardinality(k_servico) + k_internas THEN
    RAISE EXCEPTION 'Conferir: % funcoes de denuncias; esperavam-se %.', v_n, cardinality(k_auth) + cardinality(k_servico) + k_internas;
  END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname::text = 'public' AND (p.proname::text LIKE 'denuncia%' OR p.proname::text LIKE 'rpc_denuncia%')
     GROUP BY p.proname HAVING count(*) > 1) x;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: % nome(s) de funcao de denuncias com mais de uma assinatura.', v_n;
  END IF;

  FOR r IN
    SELECT p.oid AS oid, p.proname::text AS nome, p.prosecdef AS secdef, p.proconfig AS cfg,
           replace(replace(p.oid::regprocedure::text, 'public.', ''), ' ', '') AS assin
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname::text = 'public' AND (p.proname::text LIKE 'denuncia%' OR p.proname::text LIKE 'rpc_denuncia%')
  LOOP
    v_deve := CASE WHEN r.assin = ANY (k_auth) THEN 'authenticated'
                   WHEN r.assin = ANY (k_servico) THEN 'service_role'
                   ELSE '' END;
    IF r.nome LIKE 'rpc_%' AND v_deve = '' THEN
      RAISE EXCEPTION 'Conferir: a RPC % nao esta em nenhuma lista de concessoes.', r.assin;
    END IF;
    SELECT coalesce(string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ','), '')
      INTO v_grant
      FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = r.oid AND a.privilege_type::text = 'EXECUTE' AND a.grantee <> p.proowner;
    IF v_grant IS DISTINCT FROM v_deve THEN
      RAISE EXCEPTION 'Conferir: EXECUTE em % devia ser "%"; e "%".', r.assin, v_deve, v_grant;
    END IF;
    IF NOT (coalesce(r.cfg, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'Conferir: % sem search_path vazio.', r.assin;
    END IF;
    IF (r.nome LIKE 'rpc_%') IS DISTINCT FROM r.secdef THEN
      RAISE EXCEPTION 'Conferir: % devia ser SECURITY DEFINER so se for RPC.', r.assin;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM pg_trigger tg
   WHERE NOT tg.tgisinternal AND tg.tgenabled::text <> 'D'
     AND tg.tgrelid IN (SELECT to_regclass('public.' || x) FROM unnest(k_tabelas) AS x);
  IF v_n <> 23 THEN
    RAISE EXCEPTION 'Conferir: esperavam-se 23 gatilhos activos nas tabelas do canal (3 regras, 10 sem alterar/apagar, 10 truncate); ha %.', v_n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions p
                  WHERE p.code = 'hr.denuncias.configurar' AND p.category = 'hr' AND p.is_dangerous IS TRUE
                    AND p.scope = 'organization' AND p.parent_code = 'hr.module.access') THEN
    RAISE EXCEPTION 'Conferir: hr.denuncias.configurar nao ficou no catalogo como devia.';
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_role_permissions rp WHERE rp.permission_code = 'hr.denuncias.configurar';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: % papel(eis) ja tem hr.denuncias.configurar; a atribuicao e um passo a parte.', v_n;
  END IF;

  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM cron.job WHERE command ILIKE ''%denuncia%''' INTO v_n;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Conferir: ha % job(s) pg_cron do canal; nenhum devia existir.', v_n;
    END IF;
  END IF;

  -- ---- 10.2 Prova na nike, DESFEITA no fim (sentinela HDN00) --------------------
  BEGIN
    -- Tres membros activos nao clientes da nike, todos lidos COM o filtro da nike.
    -- A: configura e trata; B: trata; C: denunciante identificado, sem papel em comum com A.
    SELECT u.id, u.auth_user_id INTO v_a, v_a_uid
      FROM public.anew_memberships m JOIN public.anew_users u ON u.id = m.user_id
     WHERE m.organization_id = k_nike AND m.status = 'active' AND m.role_is_client IS NOT TRUE
       AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
     ORDER BY public.has_anew_permission_in_org(u.auth_user_id, 'hr.denuncias.gerir', k_nike) DESC, u.id
     LIMIT 1;
    SELECT m.role_id INTO v_role_a FROM public.anew_memberships m
     WHERE m.organization_id = k_nike AND m.user_id = v_a AND m.status = 'active' AND m.role_is_client IS NOT TRUE
     ORDER BY m.role_id LIMIT 1;
    SELECT u.id, u.auth_user_id INTO v_c, v_c_uid
      FROM public.anew_memberships m JOIN public.anew_users u ON u.id = m.user_id
     WHERE m.organization_id = k_nike AND m.status = 'active' AND m.role_is_client IS NOT TRUE
       AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL AND u.id <> v_a
       AND NOT EXISTS (SELECT 1 FROM public.anew_memberships m2
                        WHERE m2.organization_id = k_nike AND m2.user_id = u.id AND m2.status = 'active'
                          AND m2.role_id IN (SELECT m3.role_id FROM public.anew_memberships m3
                                              WHERE m3.organization_id = k_nike AND m3.user_id = v_a AND m3.status = 'active'))
     ORDER BY u.id
     LIMIT 1;
    SELECT u.id, u.auth_user_id INTO v_b, v_b_uid
      FROM public.anew_memberships m JOIN public.anew_users u ON u.id = m.user_id
     WHERE m.organization_id = k_nike AND m.status = 'active' AND m.role_is_client IS NOT TRUE
       AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL AND u.id NOT IN (v_a, v_c)
     ORDER BY public.has_anew_permission_in_org(u.auth_user_id, 'hr.denuncias.gerir', k_nike) DESC, u.id
     LIMIT 1;
    IF v_a IS NULL OR v_b IS NULL OR v_c IS NULL OR v_role_a IS NULL THEN
      RAISE EXCEPTION 'Conferir: a nike precisa de 3 membros activos nao clientes com conta, um deles (C) sem papel em comum com A.';
    END IF;
    SELECT m.role_id INTO v_role_b FROM public.anew_memberships m
     WHERE m.organization_id = k_nike AND m.user_id = v_b AND m.status = 'active' AND m.role_is_client IS NOT TRUE
     ORDER BY m.role_id LIMIT 1;
    SELECT nullif(btrim(left(u.name, 200)), '') INTO v_c_nome FROM public.anew_users u WHERE u.id = v_c;

    -- Permissoes de teste (desfeitas): A gerir + configurar; B gerir. Papeis de
    -- sistema so aceitam escrita com a claim service_role (padrao de 20270105500000).
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
    SELECT x.role_id, x.code, NULL::uuid
      FROM (VALUES (v_role_a, 'hr.denuncias.gerir'), (v_role_a, 'hr.denuncias.configurar'),
                   (v_role_b, 'hr.denuncias.gerir')) AS x(role_id, code)
    ON CONFLICT (role_id, permission_code) DO NOTHING;
    PERFORM set_config('request.jwt.claims', '{}', true);
    IF NOT public.has_anew_permission_in_org(v_a_uid, 'hr.denuncias.configurar', k_nike)
       OR NOT public.has_anew_permission_in_org(v_a_uid, 'hr.denuncias.gerir', k_nike)
       OR NOT public.has_anew_permission_in_org(v_b_uid, 'hr.denuncias.gerir', k_nike)
       OR public.has_anew_permission_in_org(v_c_uid, 'hr.denuncias.configurar', k_nike) THEN
      RAISE EXCEPTION 'Conferir: a matriz de permissoes de teste nao e a esperada (A configura e trata, B trata, C nao configura).';
    END IF;

    -- a) Configuracao: recusas, designar, ligar.
    v_slug := 'teste-' || left(v_tag, 12);
    PERFORM pg_temp.den_erro(NULL, format('SELECT public.rpc_denuncias_listar(%L::uuid)::text', k_nike), '42501', 'sem sessao lista');
    PERFORM pg_temp.den_erro(v_c_uid, format('SELECT public.rpc_denuncias_canal_guardar(%L::uuid, true, %L)::text', k_nike, v_slug), 'HRD17', 'C liga o canal');
    PERFORM pg_temp.den_erro(v_c_uid, format('SELECT public.rpc_denuncias_responsavel_designar(%L::uuid, %L::uuid)::text', k_nike, v_c), 'HRD17', 'C designa-se');
    PERFORM pg_temp.den_erro(v_c_uid, format('SELECT public.rpc_denuncias_canal_ler(%L::uuid)::text', k_nike), 'HRD17', 'C le a configuracao');
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncias_canal_guardar(%L::uuid, true, %L)::text', k_nike, v_slug), 'HRD28', 'ligar sem responsaveis');
    PERFORM pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncias_responsavel_designar(%L::uuid, %L::uuid)::text', k_nike, v_a), 'designar A');
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncias_responsavel_designar(%L::uuid, %L::uuid)::text', k_nike, v_b), 'designar B')::jsonb;
    IF jsonb_array_length(v_j -> 'responsaveis') <> 2 OR jsonb_typeof(v_j -> 'candidatos') <> 'array'
       OR jsonb_typeof(v_j -> 'sem_quem_trate') <> 'number' THEN
      RAISE EXCEPTION 'Conferir: canal_ler devia trazer 2 responsaveis, candidatos e sem_quem_trate; deu %.', left(v_j::text, 300);
    END IF;
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncias_canal_guardar(%L::uuid, true, %L)::text', k_nike, 'Mau Slug!'), 'HRD23', 'slug invalido');
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncias_canal_guardar(%L::uuid, true, %L)::text', k_nike, upper(v_slug)), 'ligar o canal')::jsonb;
    IF (v_j ->> 'ativo')::boolean IS NOT TRUE OR v_j ->> 'slug_publico' IS DISTINCT FROM v_slug THEN
      RAISE EXCEPTION 'Conferir: o canal devia ficar ligado com o slug em minusculas; deu %.', left(v_j::text, 300);
    END IF;
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncias_responsaveis(%L::uuid)::text', k_nike), 'responsaveis')::jsonb;
    IF (v_j ->> 'eu')::uuid IS DISTINCT FROM v_a OR jsonb_array_length(v_j -> 'responsaveis') <> 2
       OR NOT ((v_j -> 'responsaveis' -> 0) ? 'id' AND (v_j -> 'responsaveis' -> 0) ? 'nome') THEN
      RAISE EXCEPTION 'Conferir: responsaveis devia ser {eu: A, responsaveis: [{id, nome}] x2}; deu %.', left(v_j::text, 300);
    END IF;
    v_j := pg_temp.den_ok(v_c_uid, format('SELECT public.rpc_denuncias_canal_publico(%L::uuid)::text', k_nike), 'C le o slug')::jsonb;
    IF (v_j ->> 'ativo')::boolean IS NOT TRUE OR v_j ->> 'slug_publico' IS DISTINCT FROM v_slug THEN
      RAISE EXCEPTION 'Conferir: canal_publico devia dar {ativo, slug}; deu %.', v_j::text;
    END IF;

    -- b) Pagina publica, como a Edge (sem sessao do CRM).
    v_j := pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_canal(%L)::text', v_slug), 'edge canal')::jsonb;
    IF (v_j ->> 'ativo')::boolean IS NOT TRUE OR (v_j ->> 'organization_id')::uuid IS DISTINCT FROM k_nike THEN
      RAISE EXCEPTION 'Conferir: o canal publico devia estar activo na nike; deu %.', v_j::text;
    END IF;
    v_j := pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_canal(%L)::text', 'nao-existe-' || left(v_tag, 8)), 'edge canal desconhecido')::jsonb;
    IF (v_j ->> 'ativo')::boolean IS NOT FALSE OR v_j ? 'organization_id' THEN
      RAISE EXCEPTION 'Conferir: um slug desconhecido devia dar so {ativo:false}; deu %.', v_j::text;
    END IF;
    IF pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_limitar(%L, %L)::text', 'canal', v_ip), 'limitar') <> 'true' THEN
      RAISE EXCEPTION 'Conferir: o primeiro pedido de canal devia caber no limite.';
    END IF;

    -- c) Denuncia ANONIMA, com identidade e conta enviadas (tem de as descartar).
    v_cod1 := pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_reservar_codigo(%L, %L, %L)::text', v_slug, v_ip, v_res1), 'reservar 1')::jsonb ->> 'codigo';
    v_dados := jsonb_build_object('anonima', true, 'tipo', 'assedio',
                 'descricao', 'Descricao de teste com bem mais de trinta caracteres para passar.',
                 'quando', 'Ha duas semanas', 'onde', '', 'envolvidos', '', 'ainda_acontece', 'sim',
                 'testemunhas', 'nao_sei', 'ja_reportado', '', 'boa_fe', true);
    PERFORM pg_temp.den_erro(NULL, format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL::jsonb, NULL::uuid, NULL::uuid[])::text',
                                          v_slug, v_cod1, v_res2, v_dados, v_pin1), 'HRD26', 'criar com nonce de outra reserva');
    PERFORM pg_temp.den_erro(NULL, format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL::jsonb, NULL::uuid, NULL::uuid[])::text',
                                          v_slug, v_cod1, v_res1, v_dados - 'anonima', v_pin1), 'HRD23', 'criar sem modo');
    v_j := pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, %L::jsonb, %L::uuid, NULL::uuid[])::text',
                                       v_slug, v_cod1, v_res1, v_dados, v_pin1,
                                       jsonb_build_object('nome', 'Nao Devia Ficar', 'email', 'nao.devia@ficar.pt'), v_c_uid), 'criar anonima')::jsonb;
    IF v_j ->> 'codigo' IS DISTINCT FROM v_cod1 THEN
      RAISE EXCEPTION 'Conferir: criar devia devolver so o codigo; deu %.', v_j::text;
    END IF;
    PERFORM pg_temp.den_erro(NULL, format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL::jsonb, NULL::uuid, NULL::uuid[])::text',
                                          v_slug, v_cod1, v_res1, v_dados, v_pin1), 'HRD26', 'reutilizar a reserva');
    SELECT d.id INTO v_d1 FROM public.denuncias d WHERE d.organization_id = k_nike AND d.codigo = v_cod1;
    IF v_d1 IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.denuncias d WHERE d.id = v_d1 AND d.anonima AND d.origem = 'publica'
                        AND d.estado = 'recebida' AND d.recebida_em = v_hoje
                        AND d.prazo_confirmar = v_hoje + 7 AND d.prazo_seguimento = (v_hoje + interval '3 months')::date
                        AND d.onde IS NULL)
       OR EXISTS (SELECT 1 FROM public.denuncias_identidade i WHERE i.denuncia_id = v_d1)
       OR EXISTS (SELECT 1 FROM public.denuncias_impedidos i WHERE i.denuncia_id = v_d1)
       OR NOT EXISTS (SELECT 1 FROM public.denuncias_eventos e WHERE e.denuncia_id = v_d1 AND e.tipo = 'recebida'
                        AND e.quem_user_id IS NULL AND e.criado_em = v_meia)
       OR EXISTS (SELECT 1 FROM public.denuncias_reservas rs WHERE rs.organization_id = k_nike AND rs.codigo = v_cod1) THEN
      RAISE EXCEPTION 'Conferir: a anonima devia ficar publica, recebida, com prazos de 7 dias e 3 meses, sem identidade nem conta, com o evento a 00:00 de Lisboa e sem reserva.';
    END IF;

    -- d) Acompanhar por codigo + PIN (a Edge manda o HMAC; aqui um hex de teste).
    v_sess := encode(sha256(convert_to('s1-' || gen_random_uuid()::text, 'UTF8')), 'hex');
    IF pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_entrar(%L, %L, %L, %L, %L)::text', v_slug, v_cod1, v_pin_mau, v_sess, v_ip), 'entrar PIN errado') <> 'false'
       OR pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_entrar(%L, %L, %L, %L, %L)::text', v_slug, 'DEN-1999-0001', v_pin1, v_sess, v_ip), 'entrar codigo inexistente') <> 'false'
       OR pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_entrar(%L, %L, %L, %L, %L)::text', v_slug, lower(v_cod1), v_pin1, v_sess, v_ip), 'entrar certo') <> 'true' THEN
      RAISE EXCEPTION 'Conferir: entrar devia dar false (PIN errado), false (codigo inexistente) e true (certo).';
    END IF;
    v_t := pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_ler(%L)::text', v_sess), 'ler por sessao');
    v_j := v_t::jsonb;
    IF v_j ->> 'estado' IS DISTINCT FROM 'recebida' OR v_j ? 'gravidade' OR v_j ? 'notas' OR v_j ? 'eventos'
       OR v_j ? 'responsavel_id' OR v_j ? 'fundamentacao' OR v_j ? 'avaliacao_inicial' THEN
      RAISE EXCEPTION 'Conferir: a vista do denunciante devia ter o estado e nada da gestao; deu %.', left(v_t, 300);
    END IF;
    PERFORM pg_temp.den_erro(NULL, format('SELECT public.rpc_denuncia_publica_ler(%L)::text', repeat('a', 64)), 'HRD24', 'sessao inexistente');
    -- M4: inicio ao quarto de hora (para baixo), expira ao quarto de hora (para cima) daqui a 30 a 45 min.
    IF NOT EXISTS (SELECT 1 FROM public.denuncias_acesso a
                    WHERE a.denuncia_id = v_d1
                      AND extract(epoch FROM a.sessao_inicio_em)::bigint % 900 = 0
                      AND extract(epoch FROM a.sessao_expira_em)::bigint % 900 = 0
                      AND a.sessao_inicio_em <= now() AND a.sessao_inicio_em > now() - interval '15 minutes'
                      AND a.sessao_expira_em >= now() + interval '30 minutes'
                      AND a.sessao_expira_em < now() + interval '45 minutes') THEN
      RAISE EXCEPTION 'Conferir: a sessao devia ficar com inicio e fim arredondados ao quarto de hora (30 a 45 min).';
    END IF;

    -- e) Quem ve: A e B (designados hoje) sim; C (nao designado) nada.
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncias_listar(%L::uuid)::text', k_nike), 'A lista')::jsonb;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_j) x WHERE x ->> 'id' = v_d1::text AND x -> 'resumo' = 'null'::jsonb) THEN
      RAISE EXCEPTION 'Conferir: A devia ver o caso na fila, sem resumo (nao atribuido); deu %.', left(v_j::text, 300);
    END IF;
    v_j := pg_temp.den_ok(v_b_uid, format('SELECT public.rpc_denuncias_listar(%L::uuid)::text', k_nike), 'B lista')::jsonb;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_j) x WHERE x ->> 'id' = v_d1::text) THEN
      RAISE EXCEPTION 'Conferir: B devia ver o caso na fila.';
    END IF;
    IF pg_temp.den_ok(v_c_uid, format('SELECT public.rpc_denuncias_listar(%L::uuid)::text', k_nike), 'C lista') <> '[]'
       OR pg_temp.den_ok(v_c_uid, format('SELECT public.rpc_denuncias_por_confirmar(%L::uuid)::text', k_nike), 'C conta') <> '0'
       OR pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncias_por_confirmar(%L::uuid)::text', k_nike), 'A conta') = '0' THEN
      RAISE EXCEPTION 'Conferir: C (sem designacao) devia ver lista vazia e contador 0; A devia contar o caso.';
    END IF;
    PERFORM pg_temp.den_erro(v_c_uid, format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)::text', k_nike, v_d1), 'HRD09', 'C abre');
    PERFORM pg_temp.den_erro(v_c_uid, format('SELECT public.rpc_denuncia_nota(%L::uuid, %L::uuid, %L)::text', k_nike, v_d1, 'x'), 'HRD09', 'C escreve nota');

    -- f) Isolamento entre organizacoes (organizacao inexistente: nada de outras orgs e lido).
    IF pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncias_listar(%L::uuid)::text', v_falsa), 'A lista noutra org') <> '[]'
       OR pg_temp.den_ok(v_c_uid, format('SELECT public.rpc_denuncias_minhas(%L::uuid)::text', v_falsa), 'C minhas noutra org') <> '[]' THEN
      RAISE EXCEPTION 'Conferir: noutra organizacao a lista e as minhas deviam vir vazias.';
    END IF;
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)::text', v_falsa, v_d1), 'HRD09', 'abrir caso da nike por outra org');
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_atribuir(%L::uuid, %L::uuid, %L::uuid)::text', v_falsa, v_d1, v_a), 'HRD09', 'atribuir por outra org');
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncias_canal_guardar(%L::uuid, true, %L)::text', v_falsa, 'outra-' || left(v_tag, 8)), 'HRD17', 'configurar outra org');
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncias_responsaveis(%L::uuid)::text', v_falsa), 'HRD17', 'responsaveis de outra org');
    PERFORM pg_temp.den_erro(v_c_uid, format('SELECT public.rpc_denuncias_canal_publico(%L::uuid)::text', v_falsa), 'HRD17', 'slug de outra org');

    -- g) Tratar: confirmar, atribuir, pedir informacao, resposta, nota, concluir, reabrir, arquivar.
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_mensagem(%L::uuid, %L::uuid, %L)::text', k_nike, v_d1, 'Ola'), 'HRD10', 'mensagem antes de confirmar');
    v_t0 := clock_timestamp();
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)::text', k_nike, v_d1), 'A abre')::jsonb;
    v_ms := round(extract(epoch FROM (clock_timestamp() - v_t0)) * 1000, 1);
    IF jsonb_typeof(v_j -> 'anexos') <> 'array' OR jsonb_typeof(v_j -> 'impedidos') <> 'array'
       OR jsonb_typeof(v_j -> 'mensagens') <> 'array' OR jsonb_typeof(v_j -> 'notas') <> 'array'
       OR jsonb_typeof(v_j -> 'eventos') <> 'array' OR NOT (v_j ? 'descricao') OR NOT (v_j ? 'decidida_em')
       OR (v_j ->> 'tem_identidade')::boolean IS NOT FALSE
       OR position('nao.devia@ficar.pt' IN v_j::text) > 0 OR position('Nao Devia Ficar' IN v_j::text) > 0
       OR NOT EXISTS (SELECT 1 FROM public.denuncias_eventos e WHERE e.denuncia_id = v_d1 AND e.tipo = 'consultada' AND e.quem_user_id = v_a) THEN
      RAISE EXCEPTION 'Conferir: abrir devia ter a forma do cliente, sem identidade, e registar consultada; deu %.', left(v_j::text, 300);
    END IF;
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncia_confirmar_rececao(%L::uuid, %L::uuid, %L)::text', k_nike, v_d1, 'Recebemos a sua denuncia.'), 'confirmar')::jsonb;
    IF v_j ->> 'estado' IS DISTINCT FROM 'em_analise' OR v_j ->> 'confirmada_em' IS NULL
       OR jsonb_array_length(v_j -> 'mensagens') <> 1 OR NOT ((v_j -> 'mensagens' -> 0) ? 'criada_em') THEN
      RAISE EXCEPTION 'Conferir: confirmar devia passar a em_analise com a mensagem; deu %.', left(v_j::text, 300);
    END IF;
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_confirmar_rececao(%L::uuid, %L::uuid)::text', k_nike, v_d1), 'HRD01', 'confirmar duas vezes');
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_atribuir(%L::uuid, %L::uuid, %L::uuid)::text', k_nike, v_d1, v_c), 'HRD14', 'atribuir a quem nao e responsavel');
    PERFORM pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncia_atribuir(%L::uuid, %L::uuid, %L::uuid)::text', k_nike, v_d1, v_a), 'A fica com o caso');
    v_j := pg_temp.den_ok(v_b_uid, format('SELECT public.rpc_denuncias_listar(%L::uuid)::text', k_nike), 'B lista depois')::jsonb;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_j) x WHERE x ->> 'id' = v_d1::text) THEN
      RAISE EXCEPTION 'Conferir: B nao devia ver um caso atribuido a A (D1 A).';
    END IF;
    PERFORM pg_temp.den_erro(v_b_uid, format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)::text', k_nike, v_d1), 'HRD09', 'B abre o caso de A');
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncias_listar(%L::uuid)::text', k_nike), 'A lista depois')::jsonb;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_j) x WHERE x ->> 'id' = v_d1::text AND x ->> 'resumo' IS NOT NULL) THEN
      RAISE EXCEPTION 'Conferir: A devia ver o resumo do caso que e dele.';
    END IF;
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_gravidade(%L::uuid, %L::uuid, %L)::text', k_nike, v_d1, 'critica'), 'HRD23', 'gravidade invalida');
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncia_gravidade(%L::uuid, %L::uuid, %L)::text', k_nike, v_d1, 'alta'), 'gravidade')::jsonb;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_j -> 'eventos') e
                    WHERE e ->> 'tipo' = 'gravidade_alterada' AND e -> 'dados' ->> 'depois' = 'alta') THEN
      RAISE EXCEPTION 'Conferir: o evento da gravidade devia levar dados.depois (o que o cliente le).';
    END IF;
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncia_pedir_informacao(%L::uuid, %L::uuid, %L)::text', k_nike, v_d1, 'Pode dar mais detalhes?'), 'pedir informacao')::jsonb;
    IF v_j ->> 'estado' IS DISTINCT FROM 'mais_info' THEN
      RAISE EXCEPTION 'Conferir: pedir informacao devia passar a mais_info.';
    END IF;
    v_j := pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_responder(%L, %L)::text', v_sess, 'Mais detalhes do denunciante.'), 'denunciante responde')::jsonb;
    IF v_j ->> 'estado' IS DISTINCT FROM 'em_analise'
       OR NOT EXISTS (SELECT 1 FROM public.denuncias_mensagens m WHERE m.denuncia_id = v_d1 AND m.autor = 'denunciante'
                        AND m.autor_user_id IS NULL AND m.criada_em = v_meia)
       OR NOT EXISTS (SELECT 1 FROM public.denuncias_eventos e WHERE e.denuncia_id = v_d1 AND e.tipo = 'denunciante_respondeu'
                        AND e.quem_user_id IS NULL AND e.criado_em = v_meia) THEN
      RAISE EXCEPTION 'Conferir: a resposta anonima devia voltar a em_analise e ficar sem autor, a 00:00 de Lisboa.';
    END IF;
    PERFORM pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncia_nota(%L::uuid, %L::uuid, %L)::text', k_nike, v_d1, 'NOTA-INTERNA-' || v_tag), 'nota');
    v_t := pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_ler(%L)::text', v_sess), 'ler depois da nota');
    IF position('NOTA-INTERNA-' IN v_t) > 0 THEN
      RAISE EXCEPTION 'Conferir: a nota interna chegou a vista do denunciante.';
    END IF;
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_concluir(%L::uuid, %L::uuid, %L, %L, %L)::text', k_nike, v_d1, 'procedente', 'Medidas', ''), 'HRD07', 'concluir sem fundamentacao');
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_concluir(%L::uuid, %L::uuid, %L, %L, %L)::text', k_nike, v_d1, '', 'Medidas', 'F'), 'HRD06', 'concluir sem resultado');
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncia_concluir(%L::uuid, %L::uuid, %L, %L, %L)::text', k_nike, v_d1, 'procedente', 'Formacao da equipa', 'FUND-' || v_tag), 'concluir')::jsonb;
    IF v_j ->> 'estado' IS DISTINCT FROM 'concluida' OR v_j ->> 'resultado' IS DISTINCT FROM 'procedente'
       OR (v_j ->> 'conservar_ate')::date IS DISTINCT FROM (v_hoje + interval '5 years')::date THEN
      RAISE EXCEPTION 'Conferir: concluir devia fechar com resultado e conservar_ate = hoje + 5 anos; deu %.', left(v_j::text, 300);
    END IF;
    v_t := pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_ler(%L)::text', v_sess), 'ler concluida');
    v_j := v_t::jsonb;
    IF v_j ->> 'estado' IS DISTINCT FROM 'concluida' OR v_j -> 'desfecho' ->> 'resultado' IS DISTINCT FROM 'procedente'
       OR v_j ->> 'resultado' IS DISTINCT FROM 'procedente' OR position('FUND-' IN v_t) > 0 THEN
      RAISE EXCEPTION 'Conferir: o denunciante devia ver o desfecho, sem a fundamentacao; deu %.', left(v_t, 300);
    END IF;
    PERFORM pg_temp.den_erro(NULL, format('SELECT public.rpc_denuncia_publica_responder(%L, %L)::text', v_sess, 'Depois de fechada'), 'HRD08', 'responder fechada');
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_mensagem(%L::uuid, %L::uuid, %L)::text', k_nike, v_d1, 'x'), 'HRD08', 'mensagem fechada');
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncia_reabrir(%L::uuid, %L::uuid)::text', k_nike, v_d1), 'reabrir')::jsonb;
    IF v_j ->> 'estado' IS DISTINCT FROM 'em_analise' OR v_j ->> 'resultado' IS NOT NULL OR v_j ->> 'conservar_ate' IS NOT NULL THEN
      RAISE EXCEPTION 'Conferir: reabrir devia voltar a em_analise e limpar a decisao.';
    END IF;
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_arquivar(%L::uuid, %L::uuid, %L)::text', k_nike, v_d1, 'x'), 'HRD05', 'arquivar com motivo curto');
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncia_arquivar(%L::uuid, %L::uuid, %L)::text', k_nike, v_d1, 'Sem elementos suficientes'), 'arquivar')::jsonb;
    IF v_j ->> 'estado' IS DISTINCT FROM 'arquivada' OR v_j ->> 'motivo_arquivo' IS DISTINCT FROM 'Sem elementos suficientes' THEN
      RAISE EXCEPTION 'Conferir: arquivar devia fechar com o motivo.';
    END IF;
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_identidade_ver(%L::uuid, %L::uuid, %L)::text', k_nike, v_d1, 'Motivo valido'), 'HRD11', 'identidade de anonima');

    -- h) Imutavel e sem apagar, mesmo para quem tem a tabela (o dono).
    BEGIN
      UPDATE public.denuncias SET descricao = descricao || ' alterada' WHERE id = v_d1;
      RAISE EXCEPTION 'Conferir: o relato devia ser imutavel.';
    EXCEPTION WHEN SQLSTATE 'HRD27' THEN NULL;
    END;
    BEGIN
      DELETE FROM public.denuncias_eventos WHERE denuncia_id = v_d1;
      RAISE EXCEPTION 'Conferir: o historico nao devia aceitar DELETE.';
    EXCEPTION WHEN SQLSTATE 'HRD27' THEN NULL;
    END;

    -- h2) M4: tecto absoluto de 4 h desde a entrada, mesmo com a sessao renovada.
    UPDATE public.denuncias_acesso a
       SET sessao_inicio_em = to_timestamp((floor(extract(epoch FROM now() - interval '5 hours') / 900) * 900)::double precision)
     WHERE a.denuncia_id = v_d1;
    PERFORM pg_temp.den_erro(NULL, format('SELECT public.rpc_denuncia_publica_ler(%L)::text', v_sess), 'HRD24', 'sessao com mais de 4 h');

    -- i) Bloqueio do PIN: 5 falhas bloqueiam; o PIN certo durante o bloqueio da false.
    FOR v_i IN 1..5 LOOP
      PERFORM pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_entrar(%L, %L, %L, %L, %L)::text', v_slug, v_cod1, v_pin_mau,
                                          encode(sha256(convert_to('sx-' || v_i::text || v_tag, 'UTF8')), 'hex'), v_ip2), 'falha ' || v_i::text);
    END LOOP;
    IF pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_entrar(%L, %L, %L, %L, %L)::text', v_slug, v_cod1, v_pin1,
                                   encode(sha256(convert_to('sy-' || v_tag, 'UTF8')), 'hex'), v_ip2), 'certo bloqueado') <> 'false'
       OR NOT EXISTS (SELECT 1 FROM public.denuncias_acesso a WHERE a.denuncia_id = v_d1 AND a.bloqueios = 1
                        AND a.bloqueada_ate > now() + interval '14 minutes' AND a.bloqueada_ate <= now() + interval '15 minutes') THEN
      RAISE EXCEPTION 'Conferir: 5 falhas deviam bloquear 15 minutos e o PIN certo devia dar false durante o bloqueio.';
    END IF;
    -- i2) M3: 24 h sem falhas recomeca a escalada; acertar limpa-a.
    UPDATE public.denuncias_acesso a
       SET bloqueada_ate = NULL, ultima_falha_em = date_trunc('hour', now() - interval '25 hours')
     WHERE a.denuncia_id = v_d1;
    -- (A chamada e a verificacao do estado ficam em passos separados: dentro de um
    -- so IF a verificacao veria os dados anteriores a chamada, que os altera.)
    DECLARE v_tmp text;
    BEGIN
      v_tmp := pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_entrar(%L, %L, %L, %L, %L)::text', v_slug, v_cod1, v_pin_mau,
                                           encode(sha256(convert_to('sz-' || v_tag, 'UTF8')), 'hex'), v_ip2), 'falha depois de 25 h');
      IF v_tmp <> 'false'
         OR NOT EXISTS (SELECT 1 FROM public.denuncias_acesso a WHERE a.denuncia_id = v_d1
                          AND a.bloqueios = 0 AND a.tentativas_falhadas = 1 AND a.ultima_falha_em = date_trunc('hour', now())) THEN
        RAISE EXCEPTION 'Conferir: uma falha passadas 24 h devia recomecar a escalada (bloqueios 0, tentativas 1).';
      END IF;
      UPDATE public.denuncias_acesso a SET bloqueios = 3 WHERE a.denuncia_id = v_d1;
      v_tmp := pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_entrar(%L, %L, %L, %L, %L)::text', v_slug, v_cod1, v_pin1,
                                           encode(sha256(convert_to('sw-' || v_tag, 'UTF8')), 'hex'), v_ip2), 'certo limpa');
      IF v_tmp <> 'true'
         OR NOT EXISTS (SELECT 1 FROM public.denuncias_acesso a WHERE a.denuncia_id = v_d1
                          AND a.bloqueios = 0 AND a.tentativas_falhadas = 0 AND a.ultima_falha_em IS NULL) THEN
        RAISE EXCEPTION 'Conferir: acertar o PIN devia limpar a escalada.';
      END IF;
    END;

    -- j) Denuncia IDENTIFICADA de dentro da app (C), conflito e identidade.
    v_cod2 := pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_reservar_codigo(%L, %L, %L)::text', v_slug, v_ip, v_res2), 'reservar 2')::jsonb ->> 'codigo';
    v_dados := jsonb_set(v_dados, '{anonima}', 'false'::jsonb);
    PERFORM pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, %L::jsonb, %L::uuid, NULL::uuid[])::text',
                                        v_slug, v_cod2, v_res2, v_dados, v_pin2,
                                        jsonb_build_object('nome', NULL, 'email', NULL, 'telefone', '912345678',
                                                           'pode_contactar', true, 'so_responsavel', true), v_c_uid), 'criar identificada');
    SELECT d.id INTO v_d2 FROM public.denuncias d WHERE d.organization_id = k_nike AND d.codigo = v_cod2;
    IF v_d2 IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.denuncias d WHERE d.id = v_d2 AND NOT d.anonima AND d.origem = 'aplicacao')
       OR NOT EXISTS (SELECT 1 FROM public.denuncias_identidade i WHERE i.denuncia_id = v_d2 AND i.anew_user_id = v_c
                        AND i.nome IS NOT DISTINCT FROM v_c_nome AND i.telefone = '912345678' AND i.so_responsavel)
       OR NOT EXISTS (SELECT 1 FROM public.denuncias_impedidos i WHERE i.denuncia_id = v_d2 AND i.anew_user_id = v_c
                        AND i.motivo = 'conflito' AND i.registado_por IS NULL) THEN
      RAISE EXCEPTION 'Conferir: a identificada da app devia ter origem aplicacao, a identidade da conta de C e o conflito automatico de C.';
    END IF;
    -- B declara conflito: deixa de ver; atribuir-lhe da HRD03.
    PERFORM pg_temp.den_erro(v_b_uid, format('SELECT public.rpc_denuncia_impedir(%L::uuid, %L::uuid, %L::uuid, %L)::text', k_nike, v_d2, v_a, 'conflito'), 'HRD15', 'conflito em nome de outro');
    PERFORM pg_temp.den_ok(v_b_uid, format('SELECT public.rpc_denuncia_impedir(%L::uuid, %L::uuid, %L::uuid, %L)::text', k_nike, v_d2, v_b, 'conflito'), 'B declara conflito');
    v_j := pg_temp.den_ok(v_b_uid, format('SELECT public.rpc_denuncias_listar(%L::uuid)::text', k_nike), 'B lista com conflito')::jsonb;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_j) x WHERE x ->> 'id' = v_d2::text) THEN
      RAISE EXCEPTION 'Conferir: quem declarou conflito nao devia ver o caso.';
    END IF;
    PERFORM pg_temp.den_erro(v_b_uid, format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)::text', k_nike, v_d2), 'HRD09', 'B abre com conflito');
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_atribuir(%L::uuid, %L::uuid, %L::uuid)::text', k_nike, v_d2, v_b), 'HRD03', 'atribuir a quem tem conflito');
    -- A abre: nada que diga quem denunciou (nem o conflito automatico de C).
    v_t := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)::text', k_nike, v_d2), 'A abre a identificada');
    v_j := v_t::jsonb;
    IF position(v_c::text IN v_t) > 0 OR position('912345678' IN v_t) > 0
       OR (v_j ->> 'tem_identidade')::boolean IS NOT TRUE
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_j -> 'impedidos') x WHERE x ->> 'anew_user_id' = v_b::text AND x ->> 'motivo' = 'conflito') THEN
      RAISE EXCEPTION 'Conferir: abrir a identificada nao devia revelar o denunciante (id, contacto) e devia listar o conflito de B.';
    END IF;
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_identidade_ver(%L::uuid, %L::uuid, %L)::text', k_nike, v_d2, ''), 'HRD12', 'identidade sem motivo');
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_identidade_ver(%L::uuid, %L::uuid, %L)::text', k_nike, v_d2, 'Contactar o denunciante'), 'HRD16', 'identidade so do responsavel');
    PERFORM pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncia_atribuir(%L::uuid, %L::uuid, %L::uuid)::text', k_nike, v_d2, v_a), 'A fica com a identificada');
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncia_identidade_ver(%L::uuid, %L::uuid, %L)::text', k_nike, v_d2, 'Contactar o denunciante'), 'A ve a identidade')::jsonb;
    IF v_j ->> 'telefone' IS DISTINCT FROM '912345678' OR (v_j ->> 'so_responsavel')::boolean IS NOT TRUE
       OR NOT EXISTS (SELECT 1 FROM public.denuncias_eventos e WHERE e.denuncia_id = v_d2 AND e.tipo = 'identidade_vista'
                        AND e.quem_user_id = v_a AND e.dados ->> 'motivo' = 'Contactar o denunciante') THEN
      RAISE EXCEPTION 'Conferir: ver a identidade devia devolve-la e registar identidade_vista com o motivo.';
    END IF;
    -- As minhas (C): so a sua, sem nada da gestao; responder.
    v_t := pg_temp.den_ok(v_c_uid, format('SELECT public.rpc_denuncias_minhas(%L::uuid)::text', k_nike), 'C minhas');
    v_j := v_t::jsonb;
    IF jsonb_array_length(v_j) <> 1 OR v_j -> 0 ->> 'id' IS DISTINCT FROM v_d2::text OR (v_j -> 0) ? 'notas'
       OR (v_j -> 0) ? 'gravidade' OR (v_j -> 0) ? 'responsavel_id' OR NOT ((v_j -> 0) ? 'motivo_arquivo') THEN
      RAISE EXCEPTION 'Conferir: as minhas de C deviam trazer so o seu caso, na forma do cliente, sem dados da gestao; deu %.', left(v_t, 300);
    END IF;
    PERFORM pg_temp.den_ok(v_c_uid, format('SELECT public.rpc_denuncia_minha_responder(%L::uuid, %L::uuid, %L)::text', k_nike, v_d2, 'Acrescento um dado.'), 'C responde');
    PERFORM pg_temp.den_erro(v_c_uid, format('SELECT public.rpc_denuncia_minha_responder(%L::uuid, %L::uuid, %L)::text', k_nike, v_d1, 'x'), 'HRD09', 'C responde a caso alheio');
    IF pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncias_minhas(%L::uuid)::text', k_nike), 'A minhas') <> '[]' THEN
      RAISE EXCEPTION 'Conferir: A nao denunciou nada; as minhas deviam vir vazias.';
    END IF;

    -- l) HIGH 2: B (responsavel elegivel) denuncia de dentro da app. Atribuir-lhe
    --    o caso da o MESMO erro que a quem nao e responsavel (HRD14), e registar
    --    B como visado grava e aparece como com qualquer outra pessoa.
    v_cod4 := pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_reservar_codigo(%L, %L, %L)::text', v_slug, v_ip, v_res4), 'reservar 4')::jsonb ->> 'codigo';
    PERFORM pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, %L::jsonb, %L::uuid, NULL::uuid[])::text',
                                        v_slug, v_cod4, v_res4, v_dados, v_pin2,
                                        jsonb_build_object('pode_contactar', false), v_b_uid), 'B denuncia');
    SELECT d.id INTO v_d4 FROM public.denuncias d WHERE d.organization_id = k_nike AND d.codigo = v_cod4;
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_atribuir(%L::uuid, %L::uuid, %L::uuid)::text', k_nike, v_d4, v_b), 'HRD14', 'atribuir ao denunciante (oculto)');
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_atribuir(%L::uuid, %L::uuid, %L::uuid)::text', k_nike, v_d4, v_c), 'HRD14', 'atribuir a quem nao e responsavel (igual)');
    v_t := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)::text', k_nike, v_d4), 'A abre o caso de B');
    IF position(v_b::text IN v_t) > 0 THEN
      RAISE EXCEPTION 'Conferir: abrir o caso nao devia mostrar o denunciante (B) em lado nenhum.';
    END IF;
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncia_impedir(%L::uuid, %L::uuid, %L::uuid, %L)::text', k_nike, v_d4, v_b, 'visado'), 'B visado')::jsonb;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_j -> 'impedidos') x
                    WHERE x ->> 'anew_user_id' = v_b::text AND x ->> 'motivo' = 'visado') THEN
      RAISE EXCEPTION 'Conferir: registar o denunciante como visado devia gravar e aparecer (senao revelava-o).';
    END IF;
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_atribuir(%L::uuid, %L::uuid, %L::uuid)::text', k_nike, v_d4, v_b), 'HRD02', 'atribuir a um visado');

    -- m) M1: designar quem e visado num caso aberto da o erro generico (HRD23).
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncias_responsavel_designar(%L::uuid, %L::uuid)::text', k_nike, v_b), 'HRD23', 'designar um visado');

    -- n) HIGH 1: quem configura nao chega aos casos antigos de outro.
    v_cod3 := pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_reservar_codigo(%L, %L, %L)::text', v_slug, v_ip, v_res3), 'reservar 3')::jsonb ->> 'codigo';
    v_dados := jsonb_set(v_dados, '{anonima}', 'true'::jsonb);
    PERFORM pg_temp.den_ok(NULL, format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL::jsonb, NULL::uuid, NULL::uuid[])::text',
                                        v_slug, v_cod3, v_res3, v_dados, v_pin1), 'criar caso 3');
    SELECT d.id INTO v_d3 FROM public.denuncias d WHERE d.organization_id = k_nike AND d.codigo = v_cod3;
    -- A passa a ter sido designado (por si proprio) DEPOIS de o caso chegar.
    UPDATE public.denuncias_responsaveis rsp SET designado_em = now() + interval '1 day'
     WHERE rsp.organization_id = k_nike AND rsp.anew_user_id = v_a;
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)::text', k_nike, v_d3), 'HRD09', 'A abre caso de antes da designacao');
    -- Remover B deixava o caso 3 sem ninguem: recusado.
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncias_responsavel_remover(%L::uuid, %L::uuid)::text', k_nike, v_b), 'HRD28', 'remover quem deixa casos orfaos');
    -- M1 na auditoria: A ja nao ve o caso 4; o visado e o codigo nao lhe saem.
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncias_canal_auditoria(%L::uuid)::text', k_nike), 'auditoria')::jsonb;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_j) x WHERE x ->> 'tipo' = 'visado_registado')
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_j) x
                   WHERE x ->> 'tipo' = 'visado_registado' AND (x ->> 'alvo_id' IS NOT NULL OR x ->> 'codigo' IS NOT NULL)) THEN
      RAISE EXCEPTION 'Conferir: a auditoria devia mostrar o evento do visado sem alvo nem codigo a quem nao ve o caso.';
    END IF;
    -- B perde o acesso por fora do canal (simula tirar-lhe o papel): o caso 3 fica orfao.
    UPDATE public.denuncias_responsaveis rsp SET ativo = false, removido_em = now(), removido_por = v_a
     WHERE rsp.organization_id = k_nike AND rsp.anew_user_id = v_b;
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)::text', k_nike, v_d3), 'HRD09', 'orfao a quem se designou');
    -- Designado por outra pessoa (C, sem remocoes): o recurso do orfao vale.
    UPDATE public.denuncias_responsaveis rsp SET designado_por = v_c
     WHERE rsp.organization_id = k_nike AND rsp.anew_user_id = v_a;
    PERFORM pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)::text', k_nike, v_d3), 'orfao a quem foi designado por outro');
    -- Mas nao se quem o designou removeu um responsavel desde que o caso chegou.
    PERFORM public.denuncias_auditar(k_nike, 'responsavel_removido', v_c, v_b, NULL, NULL);
    PERFORM pg_temp.den_erro(v_a_uid, format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)::text', k_nike, v_d3), 'HRD09', 'orfao quando o designador removeu alguem');

    -- k) Remover B devolve-lhe os casos a fila e tira-o da lista.
    PERFORM pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncias_responsavel_remover(%L::uuid, %L::uuid)::text', k_nike, v_b), 'remover B');
    v_j := pg_temp.den_ok(v_a_uid, format('SELECT public.rpc_denuncias_responsaveis(%L::uuid)::text', k_nike), 'responsaveis depois')::jsonb;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_j -> 'responsaveis') x WHERE x ->> 'id' = v_b::text) THEN
      RAISE EXCEPTION 'Conferir: B removido nao devia continuar na lista de responsaveis.';
    END IF;
    -- (Se B partilha o papel de A, tem configurar por arrasto e pode ler a lista.)
    IF NOT public.has_anew_permission_in_org(v_b_uid, 'hr.denuncias.configurar', k_nike) THEN
      PERFORM pg_temp.den_erro(v_b_uid, format('SELECT public.rpc_denuncias_responsaveis(%L::uuid)::text', k_nike), 'HRD17', 'B removido le responsaveis');
    END IF;

    RAISE NOTICE 'Conferir (nike, desfeito): fluxo anonimo e identificado completo; abrir um caso levou % ms.', v_ms;
    RAISE EXCEPTION 'prova_denuncias_ok' USING ERRCODE = 'HDN00';
  EXCEPTION
    WHEN SQLSTATE 'HDN00' THEN
      NULL; -- sucesso: tudo o que a prova escreveu na nike foi desfeito.
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

  -- Nada ficou: tabelas do canal vazias e nenhum papel com a permissao nova.
  FOREACH v_assin IN ARRAY k_tabelas LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_assin) INTO v_n;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Conferir: a prova deixou % linha(s) em %.', v_n, v_assin;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.anew_role_permissions rp WHERE rp.permission_code = 'hr.denuncias.configurar') THEN
    RAISE EXCEPTION 'Conferir: a prova deixou hr.denuncias.configurar num papel.';
  END IF;

  RAISE NOTICE 'Conferido: 12 tabelas com RLS forcada, so a politica RESTRICTIVE e sem privilegios; % RPCs so para authenticated, % so para service_role, % internas sem EXECUTE; search_path vazio em todas; 23 gatilhos; prova na nike desfeita.',
    cardinality(k_auth), cardinality(k_servico), k_internas;
END;
$conferir$;

DROP FUNCTION pg_temp.den_erro(uuid, text, text, text);
DROP FUNCTION pg_temp.den_ok(uuid, text, text);
DROP FUNCTION pg_temp.den_chamar(uuid, text);

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--    pendente so este, acima de 20270110710000 (lembrar os dois ficheiros
--    vazios 20261231300000/400000 do handoff, que nao se comitam).
-- 2. Prova na nike ANTES do push: BEGIN; <este ficheiro>; ROLLBACK; o bloco
--    10 corre o fluxo inteiro e desfaz-se sozinho (HDN00); o NOTICE diz o
--    tempo de abrir um caso.
-- 3. Depois do push: dar hr.denuncias.configurar a um papel da nike (acto
--    consciente), designar, ligar o canal, publicar a Edge com os segredos.
-- ==============================================================================
