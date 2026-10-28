-- =============================================================================
-- TESTE-denuncias.sql -- prova das migrations do canal de denuncias
--   20261231992000_denuncias_permissoes
--   20261231993000_denuncias_tabelas
--   20261231994000_denuncias_rpcs          (rascunhos em supabase/rascunhos/)
--
-- NAO CORRER sem autorizacao explicita para escritas REVERTIDAS na org nike.
-- So base RH (uetjghdkwbywbftedtth), a partir do worktree rh-pessoas
-- (confirmar supabase/.temp/project-ref). Nunca a principal, nunca a Mudelar.
--
-- Como correr (so com essa autorizacao, ANTES do db push, numa so ligacao):
--   BEGIN;
--   <conteudo inteiro de 20261231992000>
--   <conteudo inteiro de 20261231993000>
--   <conteudo inteiro de 20261231994000>
--   <este ficheiro>
--   ROLLBACK;
-- O bloco acaba SEMPRE com RAISE EXCEPTION (TESTE_OK ou FALHOU ...), por isso
-- nada fica gravado mesmo que o ROLLBACK falte. Papeis de teste, denuncias,
-- responsaveis, canal e as funcoes auxiliares pg_temp.t_* so existem dentro
-- da transaccao. Nenhuma leitura de outras organizacoes.
--
-- Utilizadores da nike (os mesmos de TESTE-prazo-justificacao-configuravel.sql,
-- so ids). Os papeis deles sao trocados por papeis de teste, revertidos:
--   admin     -> configura o canal e trata (denuncias.configurar + denuncias.gerir)
--   comercial -> trata (denuncias.gerir)
--   outro     -> denunciante identificado; TEM denuncias.gerir mas nao e
--                designado (prova que a permissao sozinha nao mostra nada)
--
-- Casos:
--   0  pre-condicoes e semente.
--   1  ACL: anon/authenticated/service_role contra tabelas, internas e RPCs.
--   2  configuracao: sem permissao, sem responsaveis, slug invalido, designar,
--      ligar; pagina publica (canal activo e desconhecido).
--   3  criacao publica: A anonima, B anonima com visado e identidade enviada
--      (descartada), C identificada de dentro da app (id do Auth); dados
--      invalidos, modo em falta, conta que nao e membro; codigo nao reservado,
--      repetido, do ano anterior, de outro nonce e de reserva velha; nada da
--      anonima com instante exacto; limite de criacao por IP; limite de canal
--      e de sessao (rpc_denuncia_publica_limitar). As chamadas sao as mesmas
--      que a Edge faz (mesmos argumentos, mesma forma de p_dados).
--   4  visibilidade: impedido nao ve; resumo so ao atribuido; permissao sem
--      designacao nao ve; regra da data de designacao e o recurso sem outro.
--   5  acompanhamento anonimo: PIN errado e bloqueio, codigo inexistente,
--      sessao, resposta ao dia, sessao invalida, limite de entrada por IP.
--   6  fluxo do gestor em A (D1 A, D5, transicoes, decisao, reabrir, arquivar).
--   7  conflito e identidade em B e C; abrir C nao revela o denunciante;
--      registo de acessos; exportar.
--   8  denunciante identificado: as minhas, responder, sem notas.
--   9  visado registado por responsavel, auditoria, designar visado (HRD21),
--      retirar impedimento, remover responsavel liberta os casos.
--   10 imutabilidade e gatilhos; 11 conservacao; 12 limpeza.
--
-- Fica por provar aqui:
--   * duas criacoes/entradas ao mesmo tempo (precisa de duas ligacoes);
--   * desempenho da listagem com muitos casos (medir na nike depois do push);
--   * a Edge (HMAC do PIN, IP fiavel, registos sem dados) -- testes da Edge.
-- =============================================================================

-- ---- Auxiliares (temporarias: desaparecem com o ROLLBACK) -------------------
CREATE FUNCTION pg_temp.t_como(p_papel text, p_claims text, p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  v text;
BEGIN
  PERFORM set_config('request.jwt.claims', coalesce(p_claims, '{}'), true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{}', true);
    RAISE;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN v;
END;
$f$;

CREATE FUNCTION pg_temp.t_erro(p_papel text, p_claims text, p_sql text, p_codigo text, p_rotulo text)
RETURNS void
LANGUAGE plpgsql
AS $f$
DECLARE
  v_estado text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', coalesce(p_claims, '{}'), true);
    EXECUTE format('SET LOCAL ROLE %I', p_papel);
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{}', true);
  IF v_estado IS DISTINCT FROM p_codigo THEN
    RAISE EXCEPTION 'FALHOU %: esperava SQLSTATE %, veio %.', p_rotulo, p_codigo, coalesce(v_estado, 'sucesso');
  END IF;
END;
$f$;

CREATE FUNCTION pg_temp.t_ok(p_cond boolean, p_rotulo text)
RETURNS void
LANGUAGE plpgsql
AS $f$
BEGIN
  IF p_cond IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU %', p_rotulo;
  END IF;
END;
$f$;

DO $teste$
DECLARE
  k_org        constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  k_admin_id   constant uuid := 'ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2';
  k_admin_auth constant uuid := '08bb24a2-e11f-4f79-b4f7-c5125332da4a';
  k_com_id     constant uuid := 'acf9f6c3-c3c7-1982-c424-da7ac2add2cb';
  k_com_auth   constant uuid := '37069e32-c4ce-47f1-f42f-9e2a89eb92a3';
  k_out_id     constant uuid := '42c020c5-cb47-b7de-8246-1a8f2ed0adf4';
  k_out_auth   constant uuid := '007a341a-4bce-9626-1efa-4593c7804ea7';
  k_srv        constant text := '{"role": "service_role"}';
  v_tag     text := replace(gen_random_uuid()::text, '-', '');
  v_slug    text;
  v_hoje    date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_meia    timestamptz := date_trunc('day', now() AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon';
  v_cl_admin text;
  v_cl_com   text;
  v_cl_out   text;
  v_role_conf uuid;
  v_role_ger  uuid;
  v_role_out  uuid;
  v_ip_a    text := encode(sha256(('ip-a-' || gen_random_uuid()::text)::bytea), 'hex');
  v_ip_l    text := encode(sha256(('ip-l-' || gen_random_uuid()::text)::bytea), 'hex');
  v_ip_e    text := encode(sha256(('ip-e-' || gen_random_uuid()::text)::bytea), 'hex');
  v_ip_x    text := encode(sha256(('ip-x-' || gen_random_uuid()::text)::bytea), 'hex');
  v_ip_y    text := encode(sha256(('ip-y-' || gen_random_uuid()::text)::bytea), 'hex');
  v_pin_a   text := encode(sha256('pin-certo-a'::bytea), 'hex');
  v_pin_mau text := encode(sha256('pin-errado'::bytea), 'hex');
  v_sess    text := encode(sha256(('sessao-' || gen_random_uuid()::text)::bytea), 'hex');
  -- Nonces de reserva (a Edge gera um por pedido de criar e manda-o as duas RPCs).
  v_res_a   text := encode(sha256(('res-a-' || gen_random_uuid()::text)::bytea), 'hex');
  v_res_b   text := encode(sha256(('res-b-' || gen_random_uuid()::text)::bytea), 'hex');
  v_res_c   text := encode(sha256(('res-c-' || gen_random_uuid()::text)::bytea), 'hex');
  v_res_x   text := encode(sha256(('res-x-' || gen_random_uuid()::text)::bytea), 'hex');
  v_cod_x   text;
  v_nome_out text;
  v_dados   jsonb := jsonb_build_object(
                'anonima', true, 'tipo', 'assedio',
                'descricao', 'Descricao de teste com bem mais de trinta caracteres para passar a validacao.',
                'quando', 'Ha duas semanas', 'boa_fe', true);
  v_a uuid; v_b uuid; v_c uuid;
  v_cod_a text; v_cod_b text; v_cod_c text; v_cod text;
  v_j jsonb;
  v_t text;
  v_n bigint;
  v_i integer;
  v_ts timestamptz;
BEGIN
  v_cl_admin := json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text;
  v_cl_com   := json_build_object('sub', k_com_auth::text,   'role', 'authenticated')::text;
  v_cl_out   := json_build_object('sub', k_out_auth::text,   'role', 'authenticated')::text;
  v_slug     := 'teste-' || left(v_tag, 10);

  -- ---------------------------------------------------------------------------
  -- 0. Pre-condicoes e semente (como postgres, sem sessao)
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM pg_temp.t_ok(to_regprocedure('public.rpc_denuncia_publica_criar(text,text,text,jsonb,text,jsonb,uuid,uuid[])') IS NOT NULL
                       AND to_regprocedure('public.rpc_denuncia_publica_limitar(text,text)') IS NOT NULL
                       AND to_regclass('public.denuncias_reservas') IS NOT NULL
                       AND to_regclass('public.denuncias_canal_auditoria') IS NOT NULL,
                       '0: as tres migrations nao estao aplicadas nesta transaccao.');
  PERFORM pg_temp.t_ok(pg_has_role('service_role', 'MEMBER') AND pg_has_role('authenticated', 'MEMBER')
                       AND pg_has_role('anon', 'MEMBER'), '0: o utilizador desta ligacao nao pode assumir os papeis de teste.');
  SELECT count(*) INTO v_n FROM public.anew_memberships m
   WHERE m.organization_id = k_org AND m.status = 'active' AND m.role_is_client IS NOT TRUE
     AND m.user_id IN (k_admin_id, k_com_id, k_out_id);
  PERFORM pg_temp.t_ok(v_n = 3, '0: esperava 3 membros activos nao clientes na nike.');
  SELECT count(*) INTO v_n FROM public.anew_users u
   WHERE (u.id, u.auth_user_id) IN ((k_admin_id, k_admin_auth), (k_com_id, k_com_auth), (k_out_id, k_out_auth))
     AND u.deleted_at IS NULL;
  PERFORM pg_temp.t_ok(v_n = 3, '0: os ids auth dos tres utilizadores nao sao os esperados.');

  INSERT INTO public.anew_roles (code, name, organization_id, description)
  VALUES ('teste_den_conf_' || v_tag, 'TESTE configura e trata (revertido)', k_org, 'teste revertido')
  RETURNING id INTO v_role_conf;
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT v_role_conf, x.c FROM unnest(ARRAY['denuncias.configurar', 'denuncias.gerir']) AS x(c);
  INSERT INTO public.anew_roles (code, name, organization_id, description)
  VALUES ('teste_den_ger_' || v_tag, 'TESTE trata (revertido)', k_org, 'teste revertido')
  RETURNING id INTO v_role_ger;
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES (v_role_ger, 'denuncias.gerir');
  INSERT INTO public.anew_roles (code, name, organization_id, description)
  VALUES ('teste_den_out_' || v_tag, 'TESTE gerir sem designacao (revertido)', k_org, 'teste revertido')
  RETURNING id INTO v_role_out;
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES (v_role_out, 'denuncias.gerir');

  UPDATE public.anew_memberships m SET role_id = v_role_conf WHERE m.organization_id = k_org AND m.user_id = k_admin_id;
  UPDATE public.anew_memberships m SET role_id = v_role_ger  WHERE m.organization_id = k_org AND m.user_id = k_com_id;
  UPDATE public.anew_memberships m SET role_id = v_role_out  WHERE m.organization_id = k_org AND m.user_id = k_out_id;

  PERFORM pg_temp.t_ok(
        public.has_anew_permission_in_org(k_admin_auth, 'denuncias.configurar', k_org)
    AND public.has_anew_permission_in_org(k_com_auth, 'denuncias.gerir', k_org)
    AND NOT public.has_anew_permission_in_org(k_com_auth, 'denuncias.configurar', k_org)
    AND public.has_anew_permission_in_org(k_out_auth, 'denuncias.gerir', k_org)
    AND NOT public.has_anew_permission_in_org(k_out_auth, 'denuncias.configurar', k_org),
    '0: a matriz de permissoes dos papeis de teste nao e a esperada.');

  -- ---------------------------------------------------------------------------
  -- 1. ACL
  -- ---------------------------------------------------------------------------
  PERFORM pg_temp.t_erro('anon', '{"role": "anon"}', format('SELECT public.rpc_denuncias_listar(%L::uuid)', k_org), '42501', '1 anon listar');
  PERFORM pg_temp.t_erro('anon', '{"role": "anon"}', format('SELECT public.rpc_denuncia_publica_canal(%L)', 'x'), '42501', '1 anon publica_canal');
  PERFORM pg_temp.t_erro('anon', '{"role": "anon"}', 'SELECT count(*) FROM public.denuncias', '42501', '1 anon le denuncias');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin, 'SELECT count(*) FROM public.denuncias', '42501', '1 authenticated le denuncias');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin, 'SELECT count(*) FROM public.denuncias_identidade', '42501', '1 authenticated le identidade');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin, 'SELECT count(*) FROM public.denuncias_limites', '42501', '1 authenticated le limites');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL, %L::uuid, NULL)',
           'x', 'DEN-2026-0001', v_res_a, v_dados, v_pin_a, k_com_auth),
    '42501', '1 authenticated chama publica_criar (PIN escolhido / em nome de outrem)');
  PERFORM pg_temp.t_erro('anon', '{"role": "anon"}',
    format('SELECT public.rpc_denuncia_publica_limitar(%L, %L)', 'canal', v_ip_a), '42501', '1 anon publica_limitar');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin, 'SELECT count(*) FROM public.denuncias_reservas', '42501', '1 authenticated le reservas');
  PERFORM pg_temp.t_erro('service_role', k_srv, 'SELECT count(*) FROM public.denuncias_reservas', '42501', '1 service_role le reservas');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.denuncias_evento(%L::uuid, NULL, %L, NULL, NULL, NULL)', k_org, 'consultada'), '42501', '1 authenticated forja evento');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin, format('SELECT public.denuncias_proximo_codigo(%L::uuid)', k_org), '42501', '1 authenticated queima codigo');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT count(*) FROM public.denuncias_visiveis(%L::uuid, %L::uuid, NULL)', k_org, k_admin_id), '42501', '1 authenticated usa oraculo de visibilidade');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin, 'SELECT public.rpc_denuncias_conservacao_executar()', '42501', '1 authenticated corre conservacao');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin, 'SELECT public.rpc_denuncias_limpar()', '42501', '1 authenticated corre limpeza');
  PERFORM pg_temp.t_erro('service_role', k_srv, 'SELECT count(*) FROM public.denuncias', '42501', '1 service_role le denuncias');
  PERFORM pg_temp.t_erro('service_role', k_srv, format('SELECT public.rpc_denuncias_listar(%L::uuid)', k_org), '42501', '1 service_role chama RPC do gestor');
  PERFORM pg_temp.t_erro('service_role', k_srv, 'SELECT public.rpc_denuncias_conservacao_executar()', '42501', '1 service_role corre conservacao');

  -- ---------------------------------------------------------------------------
  -- 2. Configuracao do canal
  -- ---------------------------------------------------------------------------
  PERFORM pg_temp.t_erro('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncias_canal_guardar(%L::uuid, true, %L)', k_org, v_slug), 'HRD17', '2 comercial liga o canal');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncias_canal_guardar(%L::uuid, true, %L)', k_org, v_slug), 'HRD28', '2 ligar sem responsaveis');
  PERFORM pg_temp.t_erro('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncias_responsavel_designar(%L::uuid, %L::uuid)', k_org, k_com_id), 'HRD17', '2 comercial designa-se');
  PERFORM pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncias_responsavel_designar(%L::uuid, %L::uuid)::text', k_org, k_admin_id));
  v_j := pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncias_responsavel_designar(%L::uuid, %L::uuid)::text', k_org, k_com_id))::jsonb;
  PERFORM pg_temp.t_ok(jsonb_array_length(v_j) = 2, '2 designar devolve 2 responsaveis');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncias_canal_guardar(%L::uuid, true, %L)', k_org, 'Mau Slug!'), 'HRD23', '2 slug invalido');
  v_j := pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncias_canal_guardar(%L::uuid, true, %L)::text', k_org, upper(v_slug)))::jsonb;
  PERFORM pg_temp.t_ok((v_j ->> 'ativo')::boolean AND v_j ->> 'slug_publico' = v_slug, '2 canal ligado com slug em minusculas');
  SELECT count(*) INTO v_n FROM public.denuncias_canal_auditoria a WHERE a.organization_id = k_org;
  PERFORM pg_temp.t_ok(v_n = 3, '2 auditoria tem 2 designacoes e 1 alteracao do canal');

  v_j := pg_temp.t_como('service_role', k_srv, format('SELECT public.rpc_denuncia_publica_canal(%L)::text', v_slug))::jsonb;
  PERFORM pg_temp.t_ok((v_j ->> 'ativo')::boolean AND jsonb_array_length(v_j -> 'responsaveis') = 2, '2 pagina publica ve o canal e 2 responsaveis');
  PERFORM pg_temp.t_ok((v_j ->> 'organization_id')::uuid = k_org AND v_j ? 'organizacao',
                       '2 o canal da a Edge o id (sal do HMAC do PIN) e o nome da organizacao');
  v_j := pg_temp.t_como('service_role', k_srv, format('SELECT public.rpc_denuncia_publica_canal(%L)::text', 'nao-existe-' || v_tag))::jsonb;
  PERFORM pg_temp.t_ok(v_j = '{"ativo": false}'::jsonb, '2 slug desconhecido so diz ativo false');

  -- ---------------------------------------------------------------------------
  -- 3. Criacao publica
  -- ---------------------------------------------------------------------------
  -- A: anonima.
  v_cod_a := pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_reservar_codigo(%L, %L, %L)::text', v_slug, v_ip_a, v_res_a))::jsonb ->> 'codigo';
  PERFORM pg_temp.t_ok(v_cod_a = 'DEN-' || extract(year FROM v_hoje)::text || '-0001', '3 primeiro codigo do ano e 0001');
  PERFORM pg_temp.t_ok(EXISTS (SELECT 1 FROM public.denuncias_reservas r WHERE r.organization_id = k_org AND r.codigo = v_cod_a
                                 AND r.reserva_hash = v_res_a AND r.hora = date_trunc('hour', now())),
                       '3 reservar deixa a reserva com o nonce e so a hora truncada');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_reservar_codigo(%L, %L, %L)', v_slug, v_ip_a, 'nao-e-hex'), 'HRD23', '3 reservar sem nonce valido');
  PERFORM pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL, NULL, NULL)::text',
           v_slug, lower(v_cod_a), v_res_a, v_dados, v_pin_a));
  PERFORM pg_temp.t_ok(NOT EXISTS (SELECT 1 FROM public.denuncias_reservas r WHERE r.organization_id = k_org AND r.codigo = v_cod_a),
                       '3 A: a reserva apaga-se na criacao');
  SELECT d.id INTO v_a FROM public.denuncias d WHERE d.organization_id = k_org AND d.codigo = v_cod_a;
  PERFORM pg_temp.t_ok(v_a IS NOT NULL, '3 A criada (codigo normalizado)');
  PERFORM pg_temp.t_ok((SELECT d.anonima AND d.origem = 'publica' AND d.estado = 'recebida' AND d.recebida_em = v_hoje
                               AND d.prazo_confirmar = v_hoje + 7 AND d.gravidade = 'media'
                          FROM public.denuncias d WHERE d.id = v_a), '3 A: anonima, publica, recebida hoje, prazos');
  PERFORM pg_temp.t_ok((SELECT e.criado_em = v_meia AND e.quem_user_id IS NULL
                          FROM public.denuncias_eventos e WHERE e.denuncia_id = v_a AND e.tipo = 'recebida'),
                       '3 A: evento recebida gravado ao dia (00:00 de Lisboa)');
  PERFORM pg_temp.t_ok((SELECT a.pin_hash = v_pin_a FROM public.denuncias_acesso a WHERE a.denuncia_id = v_a), '3 A: so o HMAC do PIN');

  -- B: anonima, mas a Edge (por engano) manda identidade e utilizador: descartados.
  v_cod_b := pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_reservar_codigo(%L, %L, %L)::text', v_slug, v_ip_a, v_res_b))::jsonb ->> 'codigo';
  PERFORM pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, %L::jsonb, %L::uuid, %L::uuid[])::text',
           v_slug, v_cod_b, v_res_b, v_dados || '{"tipo": "fraude"}'::jsonb, v_pin_a,
           '{"nome": "Nao Devia Ficar", "email": "x@y.pt"}', k_out_auth, ARRAY[k_com_id, gen_random_uuid()]::text));
  SELECT d.id INTO v_b FROM public.denuncias d WHERE d.organization_id = k_org AND d.codigo = v_cod_b;
  PERFORM pg_temp.t_ok(NOT EXISTS (SELECT 1 FROM public.denuncias_identidade i WHERE i.denuncia_id = v_b),
                       '3 B: anonima sem linha de identidade');
  PERFORM pg_temp.t_ok((SELECT d.origem FROM public.denuncias d WHERE d.id = v_b) = 'publica', '3 B: origem nao revela a app');
  SELECT count(*) INTO v_n FROM public.denuncias_impedidos i WHERE i.denuncia_id = v_b;
  PERFORM pg_temp.t_ok(v_n = 1 AND EXISTS (SELECT 1 FROM public.denuncias_impedidos i WHERE i.denuncia_id = v_b
                                              AND i.anew_user_id = k_com_id AND i.motivo = 'visado' AND i.registado_por IS NULL),
                       '3 B: so o comercial ficou visado (o id desconhecido e o utilizador descartado nao)');
  -- Anonimato: nada do que a criacao de uma anonima grava tem o instante exacto
  -- (achado HIGH de 28/10: o visado nascia com registado_em = now()).
  PERFORM pg_temp.t_ok(NOT EXISTS (SELECT 1 FROM public.denuncias_impedidos i
                                    WHERE i.denuncia_id IN (v_a, v_b) AND i.registado_em <> v_meia)
                       AND NOT EXISTS (SELECT 1 FROM public.denuncias_eventos e
                                        WHERE e.denuncia_id IN (v_a, v_b) AND e.criado_em <> v_meia)
                       AND NOT EXISTS (SELECT 1 FROM public.denuncias_mensagens m
                                        WHERE m.denuncia_id IN (v_a, v_b) AND m.criada_em <> v_meia)
                       AND NOT EXISTS (SELECT 1 FROM public.denuncias_acesso a
                                        WHERE a.denuncia_id IN (v_a, v_b) AND (a.sessao_expira_em IS NOT NULL OR a.bloqueada_ate IS NOT NULL))
                       AND NOT EXISTS (SELECT 1 FROM public.denuncias_reservas r
                                        WHERE r.organization_id = k_org AND r.codigo IN (v_cod_a, v_cod_b)),
                       '3 A e B: impedidos, eventos e mensagens ao dia (00:00 de Lisboa), acesso sem instantes, sem reserva');

  -- C: identificada, de dentro da app (o outro). A Edge passa o id do AUTH (do JWT).
  v_cod_c := pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_reservar_codigo(%L, %L, %L)::text', v_slug, v_ip_a, v_res_c))::jsonb ->> 'codigo';
  PERFORM pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, %L::jsonb, %L::uuid, NULL)::text',
           v_slug, v_cod_c, v_res_c, v_dados || '{"anonima": false, "tipo": "dados"}'::jsonb, v_pin_a,
           '{"nome": "Ignorado", "telefone": "912345678", "pode_contactar": true}', k_out_auth));
  SELECT d.id INTO v_c FROM public.denuncias d WHERE d.organization_id = k_org AND d.codigo = v_cod_c;
  PERFORM pg_temp.t_ok((SELECT NOT d.anonima AND d.origem = 'aplicacao' FROM public.denuncias d WHERE d.id = v_c), '3 C: identificada da app');
  PERFORM pg_temp.t_ok((SELECT i.anew_user_id = k_out_id AND i.nome = (SELECT u.name FROM public.anew_users u WHERE u.id = k_out_id)
                               AND i.telefone = '912345678' AND i.pode_contactar AND i.so_responsavel
                          FROM public.denuncias_identidade i WHERE i.denuncia_id = v_c),
                       '3 C: nome vem da conta, nao do corpo; so_responsavel por omissao');
  PERFORM pg_temp.t_ok(EXISTS (SELECT 1 FROM public.denuncias_impedidos i WHERE i.denuncia_id = v_c
                                 AND i.anew_user_id = k_out_id AND i.motivo = 'conflito'),
                       '3 C: quem denuncia fica impedido no proprio caso');

  -- Dados invalidos (com uma reserva viva, X: cada t_erro desfaz-se, a reserva fica).
  v_cod_x := pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_reservar_codigo(%L, %L, %L)::text', v_slug, v_ip_a, v_res_x))::jsonb ->> 'codigo';
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL, NULL, NULL)',
           v_slug, v_cod_x, v_res_x, v_dados || '{"descricao": "curta"}'::jsonb, v_pin_a), 'HRD23', '3 descricao curta');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL, NULL, NULL)',
           v_slug, v_cod_x, v_res_x, v_dados || '{"boa_fe": "sim"}'::jsonb, v_pin_a), 'HRD23', '3 boa_fe nao booleana');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL, NULL, NULL)',
           v_slug, v_cod_x, v_res_x, v_dados || '{"extra": 1}'::jsonb, v_pin_a), 'HRD23', '3 chave desconhecida');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL, NULL, NULL)',
           v_slug, v_cod_x, v_res_x, v_dados || '{"origem": "aplicacao", "impedidos": []}'::jsonb, v_pin_a),
    'HRD23', '3 origem e impedidos dentro de p_dados sao recusados (vao em p_impedidos)');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL, NULL, NULL)',
           v_slug, v_cod_x, v_res_x, v_dados - 'anonima', v_pin_a),
    'HRD23', '3 sem o modo (anonima) recusa, nao passa a anonima em silencio');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL, %L::uuid, NULL)',
           v_slug, v_cod_x, v_res_x, v_dados || '{"anonima": false}'::jsonb, v_pin_a, gen_random_uuid()),
    'HRD17', '3 identificada com uma conta do Auth que nao e membro activo');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL, NULL, NULL)',
           v_slug, v_cod_x, v_res_x, v_dados, 'abc'), 'HRD23', '3 pin_hash fora do formato');

  -- Codigo: so com reserva viva e o mesmo nonce (achado HIGH de 28/10).
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL, NULL, NULL)',
           v_slug, v_cod_a, v_res_a, v_dados, v_pin_a), 'HRD26', '3 codigo repetido (a reserva ja foi gasta)');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL, NULL, NULL)',
           v_slug, 'DEN-' || extract(year FROM v_hoje)::text || '-0999', v_res_x, v_dados, v_pin_a), 'HRD26', '3 codigo nao reservado');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL, NULL, NULL)',
           v_slug, 'DEN-' || (extract(year FROM v_hoje)::integer - 1)::text || '-0001', v_res_x, v_dados, v_pin_a),
    'HRD26', '3 codigo do ano anterior nunca reservado (nao salta o limite de criar)');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL, NULL, NULL)',
           v_slug, 'DEN-' || (extract(year FROM v_hoje)::integer - 1)::text || '-123456', v_res_x, v_dados, v_pin_a),
    'HRD26', '3 codigo do ano anterior de 6 digitos nunca reservado');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL, NULL, NULL)',
           v_slug, v_cod_x, v_res_a, v_dados, v_pin_a), 'HRD26', '3 reserva viva de outro pedido (outro nonce) nao serve');
  UPDATE public.denuncias_reservas r SET hora = date_trunc('hour', now()) - interval '2 hours'
   WHERE r.organization_id = k_org AND r.codigo = v_cod_x;
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_criar(%L, %L, %L, %L::jsonb, %L, NULL, NULL, NULL)',
           v_slug, v_cod_x, v_res_x, v_dados, v_pin_a), 'HRD26', '3 reserva com mais de uma hora ja nao serve');
  PERFORM pg_temp.t_ok(NOT EXISTS (SELECT 1 FROM public.denuncias d WHERE d.organization_id = k_org AND d.codigo = v_cod_x),
                       '3 nenhuma das tentativas com X criou um caso');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_reservar_codigo(%L, %L, %L)', 'nao-existe-' || v_tag, v_ip_a, v_res_x), 'HRD19', '3 canal desconhecido');

  -- Limite de criacao por IP: 5 por hora; o sexto recusa.
  FOR v_i IN 1 .. 5 LOOP
    PERFORM pg_temp.t_como('service_role', k_srv,
      format('SELECT public.rpc_denuncia_publica_reservar_codigo(%L, %L, %L)::text', v_slug, v_ip_l,
             encode(sha256(('res-l-' || v_i::text || gen_random_uuid()::text)::bytea), 'hex')));
  END LOOP;
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_reservar_codigo(%L, %L, %L)', v_slug, v_ip_l, v_res_x), 'HRD22', '3 sexta criacao do mesmo IP');
  PERFORM pg_temp.t_ok((SELECT l.contagem = 5 AND l.janela = date_trunc('hour', now())
                          FROM public.denuncias_limites l WHERE l.balde = 'criar' AND l.chave = 'ip:' || v_ip_l),
                       '3 limite agregado por hora, sem instante, e o pedido recusado nao contou');

  -- Limite de ver o canal e de ler/responder (rpc_denuncia_publica_limitar): por IP e global.
  FOR v_i IN 1 .. 60 LOOP
    PERFORM pg_temp.t_como('service_role', k_srv, format('SELECT public.rpc_denuncia_publica_limitar(%L, %L)::text', 'canal', v_ip_l));
  END LOOP;
  PERFORM pg_temp.t_ok(pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_limitar(%L, %L)::text', 'canal', v_ip_l))::boolean = false,
    '3 o 61.o pedido de canal do mesmo IP da false');
  PERFORM pg_temp.t_ok(pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_limitar(%L, NULL)::text', 'sessao'))::boolean,
    '3 sem IP conta so no global');
  PERFORM pg_temp.t_ok(EXISTS (SELECT 1 FROM public.denuncias_limites l WHERE l.balde = 'canal' AND l.chave = 'global')
                       AND NOT EXISTS (SELECT 1 FROM public.denuncias_limites l WHERE l.chave LIKE '%' || v_sess || '%'),
                       '3 baldes canal/sessao: por IP e global, nunca pela sessao');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_limitar(%L, %L)', 'criar', v_ip_l), 'HRD23', '3 limitar nao serve para criar/entrar');

  -- ---------------------------------------------------------------------------
  -- 4. Visibilidade
  -- ---------------------------------------------------------------------------
  v_j := pg_temp.t_como('authenticated', v_cl_admin, format('SELECT public.rpc_denuncias_listar(%L::uuid)::text', k_org))::jsonb;
  PERFORM pg_temp.t_ok(jsonb_array_length(v_j) = 3, '4 admin ve A, B e C');
  PERFORM pg_temp.t_ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_j) x WHERE x ->> 'resumo' IS NOT NULL),
                       '4 sem resumo nos casos que nao lhe estao atribuidos');
  v_j := pg_temp.t_como('authenticated', v_cl_com, format('SELECT public.rpc_denuncias_listar(%L::uuid)::text', k_org))::jsonb;
  PERFORM pg_temp.t_ok(jsonb_array_length(v_j) = 2
                       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_j) x WHERE (x ->> 'id')::uuid = v_b),
                       '4 comercial (visado em B) ve so A e C');
  PERFORM pg_temp.t_ok(pg_temp.t_como('authenticated', v_cl_com,
                         format('SELECT public.rpc_denuncias_por_confirmar(%L::uuid)::text', k_org))::integer = 2,
                       '4 contador do comercial = 2');
  PERFORM pg_temp.t_erro('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)', k_org, v_b), 'HRD09', '4 visado abre B');
  v_j := pg_temp.t_como('authenticated', v_cl_out, format('SELECT public.rpc_denuncias_listar(%L::uuid)::text', k_org))::jsonb;
  PERFORM pg_temp.t_ok(v_j = '[]'::jsonb, '4 denuncias.gerir sem designacao nao ve nada');
  PERFORM pg_temp.t_erro('authenticated', '{}',
    format('SELECT public.rpc_denuncias_listar(%L::uuid)', k_org), '42501', '4 sem sessao');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)', gen_random_uuid(), v_a), 'HRD09', '4 outra organizacao');

  v_j := pg_temp.t_como('authenticated', v_cl_com, format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)::text', k_org, v_a))::jsonb;
  PERFORM pg_temp.t_ok(v_j ->> 'descricao' IS NOT NULL AND NOT (v_j ? 'identidade') AND NOT (v_j::text LIKE '%' || v_pin_a || '%'),
                       '4 abrir: com descricao, sem identidade nem PIN');
  PERFORM pg_temp.t_como('authenticated', v_cl_com, format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)::text', k_org, v_a));
  SELECT count(*) INTO v_n FROM public.denuncias_eventos e WHERE e.denuncia_id = v_a AND e.tipo = 'consultada' AND e.quem_user_id = k_com_id;
  PERFORM pg_temp.t_ok(v_n = 1, '4 abrir um caso que nao e meu deixa uma consulta por dia');

  -- Regra da designacao: quem foi designado DEPOIS da rececao nao ve a fila antiga...
  UPDATE public.denuncias_responsaveis r SET designado_em = now() + interval '2 days'
   WHERE r.organization_id = k_org AND r.anew_user_id = k_com_id;
  v_j := pg_temp.t_como('authenticated', v_cl_com, format('SELECT public.rpc_denuncias_listar(%L::uuid)::text', k_org))::jsonb;
  PERFORM pg_temp.t_ok(v_j = '[]'::jsonb, '4 designado depois da rececao nao ve os casos antigos sem responsavel');
  -- ... salvo se lhos atribuirem ...
  PERFORM pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_atribuir(%L::uuid, %L::uuid, %L::uuid)::text', k_org, v_a, k_com_id));
  v_j := pg_temp.t_como('authenticated', v_cl_com, format('SELECT public.rpc_denuncias_listar(%L::uuid)::text', k_org))::jsonb;
  PERFORM pg_temp.t_ok(jsonb_array_length(v_j) = 1 AND (v_j -> 0 ->> 'resumo') IS NOT NULL,
                       '4 atribuido, passa a ver A (e o resumo)');
  -- ... ou se nao houver mais ninguem designado antes do caso.
  UPDATE public.denuncias_responsaveis r SET designado_em = now() + interval '2 days'
   WHERE r.organization_id = k_org AND r.anew_user_id = k_admin_id;
  v_j := pg_temp.t_como('authenticated', v_cl_com, format('SELECT public.rpc_denuncias_listar(%L::uuid)::text', k_org))::jsonb;
  PERFORM pg_temp.t_ok(jsonb_array_length(v_j) = 2, '4 sem outro designado antes, ve a fila (A e C)');
  UPDATE public.denuncias_responsaveis r SET designado_em = now() WHERE r.organization_id = k_org;
  -- A ficou atribuida ao comercial: o admin deixa de a ver (D1 A).
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)', k_org, v_a), 'HRD09', '4 caso atribuido a outro nao se abre (D1 A)');

  -- ---------------------------------------------------------------------------
  -- 5. Acompanhamento anonimo (A)
  -- ---------------------------------------------------------------------------
  FOR v_i IN 1 .. 5 LOOP
    PERFORM pg_temp.t_ok(pg_temp.t_como('service_role', k_srv,
      format('SELECT public.rpc_denuncia_publica_entrar(%L, %L, %L, %L, %L)::text', v_slug, v_cod_a, v_pin_mau, v_sess, v_ip_e))::boolean = false,
      '5 PIN errado da false');
  END LOOP;
  PERFORM pg_temp.t_ok((SELECT a.bloqueios = 1 AND a.tentativas_falhadas = 0
                               AND a.bloqueada_ate BETWEEN now() + interval '14 minutes' AND now() + interval '16 minutes'
                          FROM public.denuncias_acesso a WHERE a.denuncia_id = v_a),
                       '5 cinco falhas bloqueiam 15 minutos');
  PERFORM pg_temp.t_ok(pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_entrar(%L, %L, %L, %L, %L)::text', v_slug, v_cod_a, v_pin_a, v_sess, v_ip_e))::boolean = false,
    '5 PIN certo durante o bloqueio da false');
  PERFORM pg_temp.t_ok(pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_entrar(%L, %L, %L, %L, %L)::text', v_slug, 'DEN-1999-0001', v_pin_a, v_sess, v_ip_e))::boolean = false,
    '5 codigo inexistente da o mesmo false');
  UPDATE public.denuncias_acesso a SET bloqueada_ate = now() - interval '1 second' WHERE a.denuncia_id = v_a;
  PERFORM pg_temp.t_ok(pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_entrar(%L, %L, %L, %L, NULL)::text', v_slug, ' ' || lower(v_cod_a), v_pin_a, v_sess))::boolean,
    '5 PIN certo depois do bloqueio entra (sem IP: balde da organizacao)');
  PERFORM pg_temp.t_ok((SELECT a.sessao_hash = v_sess AND a.bloqueios = 1 FROM public.denuncias_acesso a WHERE a.denuncia_id = v_a),
                       '5 sessao guardada; o escalonamento nao volta a zero');

  v_j := pg_temp.t_como('service_role', k_srv, format('SELECT public.rpc_denuncia_publica_ler(%L)::text', v_sess))::jsonb;
  PERFORM pg_temp.t_ok(v_j ->> 'codigo' = v_cod_a AND NOT (v_j ? 'notas') AND NOT (v_j ? 'gravidade')
                       AND NOT (v_j ? 'responsavel_id') AND NOT (v_j ? 'eventos'),
                       '5 a vista do denunciante nao tem notas, gravidade, responsavel nem historico');
  v_j := pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_responder(%L, %L)::text', v_sess, 'Acrescento um pormenor.'))::jsonb;
  PERFORM pg_temp.t_ok((SELECT m.criada_em = v_meia AND m.autor_user_id IS NULL FROM public.denuncias_mensagens m
                         WHERE m.denuncia_id = v_a AND m.autor = 'denunciante'),
                       '5 resposta anonima gravada ao dia e sem autor');
  PERFORM pg_temp.t_ok((SELECT d.estado FROM public.denuncias d WHERE d.id = v_a) = 'recebida', '5 responder em recebida nao muda o estado');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_ler(%L)', v_pin_mau), 'HRD24', '5 sessao desconhecida');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_ler(%L)', 'nao-e-hex'), 'HRD24', '5 sessao fora do formato');

  -- Limite de entrada por IP: 20 por hora; a 21.a, mesmo com o PIN certo, da false.
  FOR v_i IN 1 .. 20 LOOP
    PERFORM pg_temp.t_como('service_role', k_srv,
      format('SELECT public.rpc_denuncia_publica_entrar(%L, %L, %L, %L, %L)::text', v_slug, 'DEN-1999-0001', v_pin_a, v_sess, v_ip_x));
  END LOOP;
  PERFORM pg_temp.t_ok(pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_entrar(%L, %L, %L, %L, %L)::text', v_slug, v_cod_a, v_pin_a, v_sess, v_ip_x))::boolean = false,
    '5 vigesima primeira entrada do mesmo IP da false');
  PERFORM pg_temp.t_ok(pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_entrar(%L, %L, %L, %L, %L)::text', v_slug, v_cod_a, v_pin_a, v_sess, v_ip_y))::boolean,
    '5 outro IP entra');

  -- ---------------------------------------------------------------------------
  -- 6. Fluxo do gestor em A (atribuida ao comercial no caso 4)
  -- ---------------------------------------------------------------------------
  PERFORM pg_temp.t_erro('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_mensagem(%L::uuid, %L::uuid, %L)', k_org, v_a, 'Ola'), 'HRD10', '6 mensagem em recebida (D5)');
  v_j := pg_temp.t_como('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_confirmar_rececao(%L::uuid, %L::uuid, %L)::text', k_org, v_a, 'Recebemos a sua denuncia.'))::jsonb;
  PERFORM pg_temp.t_ok(v_j ->> 'estado' = 'em_analise' AND v_j ->> 'confirmada_em' IS NOT NULL
                       AND jsonb_array_length(v_j -> 'mensagens') = 2, '6 confirmar rececao com mensagem');
  v_ts := (v_j ->> 'confirmada_em')::timestamptz;
  PERFORM pg_temp.t_erro('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_confirmar_rececao(%L::uuid, %L::uuid, NULL)', k_org, v_a), 'HRD01', '6 confirmar duas vezes');
  PERFORM pg_temp.t_erro('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_gravidade(%L::uuid, %L::uuid, %L)', k_org, v_a, 'critica'), 'HRD23', '6 gravidade fora da lista');
  v_j := pg_temp.t_como('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_gravidade(%L::uuid, %L::uuid, %L)::text', k_org, v_a, 'alta'))::jsonb;
  PERFORM pg_temp.t_ok(v_j ->> 'gravidade' = 'alta', '6 gravidade alta');
  PERFORM pg_temp.t_erro('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_pedir_informacao(%L::uuid, %L::uuid, %L)', k_org, v_a, '   '), 'HRD04', '6 pedido vazio');
  v_j := pg_temp.t_como('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_pedir_informacao(%L::uuid, %L::uuid, %L)::text', k_org, v_a, 'Pode dar datas?'))::jsonb;
  PERFORM pg_temp.t_ok(v_j ->> 'estado' = 'mais_info', '6 pedir informacao');
  v_j := pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_responder(%L, %L)::text', v_sess, 'Foi a 3 de Outubro.'))::jsonb;
  PERFORM pg_temp.t_ok(v_j ->> 'estado' = 'em_analise', '6 a resposta do denunciante retoma a analise');
  PERFORM pg_temp.t_erro('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_concluir(%L::uuid, %L::uuid, %L, NULL, %L)', k_org, v_a, '', 'x'), 'HRD06', '6 concluir sem resultado');
  PERFORM pg_temp.t_erro('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_concluir(%L::uuid, %L::uuid, %L, NULL, %L)', k_org, v_a, 'procedente', ' '), 'HRD07', '6 concluir sem fundamentacao');
  v_j := pg_temp.t_como('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_concluir(%L::uuid, %L::uuid, %L, %L, %L)::text', k_org, v_a, 'procedente',
           'Formacao obrigatoria', 'Factos confirmados por duas testemunhas'))::jsonb;
  PERFORM pg_temp.t_ok(v_j ->> 'estado' = 'concluida'
                       AND (v_j ->> 'conservar_ate')::date = (v_hoje + interval '5 years')::date, '6 concluir; conservar 5 anos');
  v_j := pg_temp.t_como('service_role', k_srv, format('SELECT public.rpc_denuncia_publica_ler(%L)::text', v_sess))::jsonb;
  PERFORM pg_temp.t_ok(v_j -> 'desfecho' ->> 'resultado' = 'procedente' AND NOT ((v_j -> 'desfecho') ? 'fundamentacao'),
                       '6 o denunciante ve o resultado e as medidas, nao a fundamentacao');
  PERFORM pg_temp.t_erro('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_mensagem(%L::uuid, %L::uuid, %L)', k_org, v_a, 'Ola'), 'HRD08', '6 mensagem num caso fechado');
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_responder(%L, %L)', v_sess, 'mais'), 'HRD08', '6 denunciante responde num caso fechado');
  v_j := pg_temp.t_como('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_reabrir(%L::uuid, %L::uuid)::text', k_org, v_a))::jsonb;
  PERFORM pg_temp.t_ok(v_j ->> 'estado' = 'em_analise' AND v_j -> 'decisao' = 'null'::jsonb
                       AND (v_j ->> 'confirmada_em')::timestamptz = v_ts AND v_j -> 'conservar_ate' = 'null'::jsonb,
                       '6 reabrir limpa a decisao e o prazo de conservacao e mantem a confirmacao');
  PERFORM pg_temp.t_erro('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_arquivar(%L::uuid, %L::uuid, %L)', k_org, v_a, 'ab'), 'HRD05', '6 motivo curto');
  PERFORM pg_temp.t_erro('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_reabrir(%L::uuid, %L::uuid)', k_org, v_a), 'HRD01', '6 reabrir um caso aberto');
  PERFORM pg_temp.t_como('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_nota(%L::uuid, %L::uuid, %L)::text', k_org, v_a, 'Nota interna de A'));

  -- ---------------------------------------------------------------------------
  -- 7. Conflito e identidade (B anonima, C identificada)
  -- ---------------------------------------------------------------------------
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_atribuir(%L::uuid, %L::uuid, %L::uuid)', k_org, v_b, k_com_id), 'HRD02', '7 atribuir B ao visado');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_atribuir(%L::uuid, %L::uuid, %L::uuid)', k_org, v_b, k_out_id), 'HRD14', '7 atribuir a quem nao e responsavel');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_identidade_ver(%L::uuid, %L::uuid, %L)', k_org, v_b, 'verificar'), 'HRD11', '7 identidade de uma anonima');

  v_j := pg_temp.t_como('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_impedir(%L::uuid, %L::uuid, %L::uuid, %L)::text', k_org, v_c, k_com_id, 'conflito'))::jsonb;
  PERFORM pg_temp.t_ok((v_j ->> 'impedido')::boolean, '7 comercial declara conflito em C');
  PERFORM pg_temp.t_erro('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)', k_org, v_c), 'HRD09', '7 quem declarou conflito deixa de ver C');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_impedir(%L::uuid, %L::uuid, %L::uuid, %L)', k_org, v_c, k_out_id, 'conflito'),
    'HRD15', '7 conflito so se declara pelo proprio');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_atribuir(%L::uuid, %L::uuid, %L::uuid)', k_org, v_c, k_com_id), 'HRD03', '7 atribuir C a quem tem conflito');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_identidade_ver(%L::uuid, %L::uuid, %L)', k_org, v_c, 'a'), 'HRD12', '7 identidade sem motivo');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_identidade_ver(%L::uuid, %L::uuid, %L)', k_org, v_c, 'verificar contacto'), 'HRD16', '7 so o responsavel ve');
  SELECT count(*) INTO v_n FROM public.denuncias_eventos e WHERE e.denuncia_id = v_c AND e.tipo = 'identidade_vista';
  PERFORM pg_temp.t_ok(v_n = 0, '7 tentativas recusadas nao deixam registo de acesso');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_exportar(%L::uuid, %L::uuid, %L)', k_org, v_c, 'pedido do juridico'), 'HRD16', '7 exportar sem ser o responsavel');

  PERFORM pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_atribuir(%L::uuid, %L::uuid, %L::uuid)::text', k_org, v_c, k_admin_id));
  PERFORM pg_temp.t_ok(EXISTS (SELECT 1 FROM public.denuncias_canal_auditoria a WHERE a.denuncia_id = v_c
                                 AND a.tipo = 'autoatribuicao' AND a.quem_user_id = k_admin_id),
                       '7 auto-atribuicao fica na auditoria da organizacao');
  -- Abrir C (identificada, feita na app pelo outro) como gestor nao pode dizer quem
  -- denunciou: nem o id nem o nome do denunciante em lado nenhum do JSON, nem o
  -- conflito automatico dele nos impedidos (achado HIGH de 28/10).
  SELECT u.name INTO v_nome_out FROM public.anew_users u WHERE u.id = k_out_id;
  v_j := pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)::text', k_org, v_c))::jsonb;
  PERFORM pg_temp.t_ok(strpos(v_j::text, k_out_id::text) = 0
                       -- o nome como valor JSON inteiro (com aspas): um nome contido noutro nao conta
                       AND (v_nome_out IS NULL OR strpos(v_j::text, to_jsonb(v_nome_out)::text) = 0)
                       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_j -> 'impedidos') x
                                        WHERE x ->> 'motivo' = 'conflito' AND (x ->> 'pelo_denunciante')::boolean),
                       '7 abrir C como gestor nao revela o denunciante (id, nome ou conflito automatico)');
  PERFORM pg_temp.t_ok(EXISTS (SELECT 1 FROM jsonb_array_elements(v_j -> 'impedidos') x
                                WHERE (x ->> 'anew_user_id')::uuid = k_com_id AND x ->> 'motivo' = 'conflito'),
                       '7 o conflito declarado por um responsavel continua visivel');
  v_j := pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_identidade_ver(%L::uuid, %L::uuid, %L)::text', k_org, v_c, 'contactar para recolha de prova'))::jsonb;
  PERFORM pg_temp.t_ok(v_j ->> 'nome' = (SELECT u.name FROM public.anew_users u WHERE u.id = k_out_id), '7 o responsavel ve a identidade');
  PERFORM pg_temp.t_ok((SELECT e.dados ->> 'motivo' = 'contactar para recolha de prova' AND e.quem_user_id = k_admin_id
                          FROM public.denuncias_eventos e WHERE e.denuncia_id = v_c AND e.tipo = 'identidade_vista'),
                       '7 registo de acesso com quem e porque');
  v_j := pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_exportar(%L::uuid, %L::uuid, %L)::text', k_org, v_c, 'pedido do juridico'))::jsonb;
  PERFORM pg_temp.t_ok(v_j ->> 'codigo' = v_cod_c AND NOT (v_j::text LIKE '%912345678%'), '7 exportar sem identidade');
  PERFORM pg_temp.t_ok(EXISTS (SELECT 1 FROM public.denuncias_eventos e WHERE e.denuncia_id = v_c AND e.tipo = 'exportada'),
                       '7 exportacao registada');

  -- ---------------------------------------------------------------------------
  -- 8. Denunciante identificado (o outro, em C)
  -- ---------------------------------------------------------------------------
  PERFORM pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_nota(%L::uuid, %L::uuid, %L)::text', k_org, v_c, 'NOTA-SECRETA-' || v_tag));
  PERFORM pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_confirmar_rececao(%L::uuid, %L::uuid, NULL)::text', k_org, v_c));
  PERFORM pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_pedir_informacao(%L::uuid, %L::uuid, %L)::text', k_org, v_c, 'Precisamos de datas.'));
  v_j := pg_temp.t_como('authenticated', v_cl_out, format('SELECT public.rpc_denuncias_minhas(%L::uuid)::text', k_org))::jsonb;
  PERFORM pg_temp.t_ok(jsonb_array_length(v_j) = 1 AND v_j -> 0 ->> 'codigo' = v_cod_c
                       AND NOT (v_j::text LIKE '%NOTA-SECRETA-%') AND NOT ((v_j -> 0) ? 'gravidade')
                       AND NOT ((v_j -> 0) ? 'responsavel_id'),
                       '8 as minhas: so C, sem notas, gravidade nem responsavel');
  PERFORM pg_temp.t_ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_j -> 0 -> 'mensagens') m WHERE m ? 'autor_nome' OR m ? 'autor_id'),
                       '8 o denunciante nao ve quem do canal escreveu (D12)');
  v_j := pg_temp.t_como('authenticated', v_cl_out,
    format('SELECT public.rpc_denuncia_minha_responder(%L::uuid, %L::uuid, %L)::text', k_org, v_c, 'Foi em Setembro.'))::jsonb;
  PERFORM pg_temp.t_ok(v_j ->> 'estado' = 'em_analise', '8 responder retoma a analise');
  PERFORM pg_temp.t_erro('authenticated', v_cl_out,
    format('SELECT public.rpc_denuncia_minha_responder(%L::uuid, %L::uuid, %L)', k_org, v_a, 'intruso'), 'HRD09', '8 responder num caso que nao e meu');
  PERFORM pg_temp.t_erro('authenticated', v_cl_out,
    format('SELECT public.rpc_denuncia_minha_responder(%L::uuid, %L::uuid, %L)', k_org, v_c, ''), 'HRD04', '8 resposta vazia');
  v_j := pg_temp.t_como('authenticated', v_cl_com, format('SELECT public.rpc_denuncias_minhas(%L::uuid)::text', k_org))::jsonb;
  PERFORM pg_temp.t_ok(v_j = '[]'::jsonb, '8 as anonimas nao aparecem nas minhas de ninguem');

  -- ---------------------------------------------------------------------------
  -- 9. Visado registado, auditoria, designacao e remocao
  -- ---------------------------------------------------------------------------
  PERFORM pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_impedir(%L::uuid, %L::uuid, %L::uuid, %L)::text', k_org, v_b, k_out_id, 'visado'));
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncias_responsavel_designar(%L::uuid, %L::uuid)', k_org, k_out_id), 'HRD21', '9 designar quem e visado num caso aberto');
  v_j := pg_temp.t_como('authenticated', v_cl_com, format('SELECT public.rpc_denuncias_canal_auditoria(%L::uuid, 50)::text', k_org))::jsonb;
  PERFORM pg_temp.t_ok(EXISTS (SELECT 1 FROM jsonb_array_elements(v_j) x
                                WHERE x ->> 'tipo' = 'visado_registado' AND (x ->> 'alvo_id')::uuid = k_out_id),
                       '9 outro responsavel ve na auditoria quem foi marcado visado');
  PERFORM pg_temp.t_erro('authenticated', v_cl_out,
    format('SELECT public.rpc_denuncias_canal_auditoria(%L::uuid, 50)', k_org), 'HRD17', '9 auditoria a quem nao e responsavel nem configura');
  PERFORM pg_temp.t_erro('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_impedimento_retirar(%L::uuid, %L::uuid, %L::uuid)', k_org, v_b, k_com_id),
    'HRD15', '9 o visado indicado pelo denunciante nao se retira');
  PERFORM pg_temp.t_erro('authenticated', v_cl_com,
    format('SELECT public.rpc_denuncia_impedimento_retirar(%L::uuid, %L::uuid, %L::uuid)', k_org, v_b, k_out_id),
    'HRD17', '9 retirar sem denuncias.configurar');
  PERFORM pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_impedimento_retirar(%L::uuid, %L::uuid, %L::uuid)::text', k_org, v_b, k_out_id));
  PERFORM pg_temp.t_ok((SELECT i.retirado_por = k_admin_id FROM public.denuncias_impedidos i
                         WHERE i.denuncia_id = v_b AND i.anew_user_id = k_out_id), '9 impedimento retirado, nao apagado');
  PERFORM pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncias_responsavel_designar(%L::uuid, %L::uuid)::text', k_org, k_out_id));
  PERFORM pg_temp.t_erro('authenticated', v_cl_out,
    format('SELECT public.rpc_denuncia_abrir(%L::uuid, %L::uuid)', k_org, v_c), 'HRD09', '9 o denunciante designado continua sem ver o proprio caso');
  PERFORM pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncias_responsavel_remover(%L::uuid, %L::uuid)::text', k_org, k_out_id));

  -- Remover o comercial liberta os casos abertos dele (A, em analise).
  PERFORM pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncias_responsavel_remover(%L::uuid, %L::uuid)::text', k_org, k_com_id));
  PERFORM pg_temp.t_ok((SELECT d.responsavel_id IS NULL FROM public.denuncias d WHERE d.id = v_a), '9 remover liberta A');
  PERFORM pg_temp.t_ok(EXISTS (SELECT 1 FROM public.denuncias_eventos e WHERE e.denuncia_id = v_a AND e.tipo = 'responsavel_libertado'),
                       '9 libertacao fica no historico');
  v_j := pg_temp.t_como('authenticated', v_cl_com, format('SELECT public.rpc_denuncias_listar(%L::uuid)::text', k_org))::jsonb;
  PERFORM pg_temp.t_ok(v_j = '[]'::jsonb, '9 removido deixa de ver');
  v_j := pg_temp.t_como('authenticated', v_cl_admin,
    format('SELECT public.rpc_denuncia_arquivar(%L::uuid, %L::uuid, %L)::text', k_org, v_a, 'Tratado noutra sede'))::jsonb;
  PERFORM pg_temp.t_ok(v_j ->> 'estado' = 'arquivada', '9 admin arquiva A (voltou a fila dele)');

  -- ---------------------------------------------------------------------------
  -- 10. Imutabilidade (como postgres: as guardas valem para o dono)
  -- ---------------------------------------------------------------------------
  PERFORM pg_temp.t_erro('postgres', '{}', format('UPDATE public.denuncias SET descricao = descricao || %L WHERE id = %L::uuid', ' x', v_b), 'HRD27', '10 relato imutavel');
  PERFORM pg_temp.t_erro('postgres', '{}', format('UPDATE public.denuncias SET anonima = false WHERE id = %L::uuid', v_b), 'HRD20', '10 anonima imutavel');
  PERFORM pg_temp.t_erro('postgres', '{}',
    format('INSERT INTO public.denuncias_identidade (denuncia_id, organization_id, nome) VALUES (%L::uuid, %L::uuid, %L)', v_b, k_org, 'X'),
    'HRD20', '10 identidade numa anonima');
  PERFORM pg_temp.t_erro('postgres', '{}', format('UPDATE public.denuncias SET estado = %L WHERE id = %L::uuid', 'mais_info', v_a), 'HRD01', '10 transicao arquivada para mais_info');
  PERFORM pg_temp.t_erro('postgres', '{}', format('UPDATE public.denuncias_eventos SET tipo = tipo WHERE denuncia_id = %L::uuid', v_a), 'HRD27', '10 historico so acrescenta');
  PERFORM pg_temp.t_erro('postgres', '{}', format('DELETE FROM public.denuncias_notas WHERE denuncia_id = %L::uuid', v_a), 'HRD27', '10 notas nao se apagam');
  PERFORM pg_temp.t_erro('postgres', '{}', format('DELETE FROM public.denuncias WHERE id = %L::uuid', v_b), 'HRD27', '10 caso nao se apaga');
  PERFORM pg_temp.t_erro('postgres', '{}', 'TRUNCATE public.denuncias_eventos', 'HRD27', '10 truncate recusado');

  -- ---------------------------------------------------------------------------
  -- 11. Conservacao (so o dono)
  -- ---------------------------------------------------------------------------
  UPDATE public.denuncias d SET conservar_ate = v_hoje - 1 WHERE d.id = v_a;
  PERFORM pg_temp.t_ok(public.rpc_denuncias_conservacao_executar() = 1, '11 apaga so o caso fechado com prazo passado');
  PERFORM pg_temp.t_ok(NOT EXISTS (SELECT 1 FROM public.denuncias_mensagens m WHERE m.denuncia_id = v_a)
                       AND NOT EXISTS (SELECT 1 FROM public.denuncias_eventos e WHERE e.denuncia_id = v_a)
                       AND NOT EXISTS (SELECT 1 FROM public.denuncias_acesso a WHERE a.denuncia_id = v_a),
                       '11 filhos apagados em cascata');
  PERFORM pg_temp.t_ok(current_setting('denuncias.conservacao', true) = 'off', '11 a excepcao de conservacao nao fica ligada');
  PERFORM pg_temp.t_erro('postgres', '{}', format('DELETE FROM public.denuncias WHERE id = %L::uuid', v_c), 'HRD27', '11 depois da conservacao, apagar volta a ser recusado');

  -- ---------------------------------------------------------------------------
  -- 12. Limpeza
  -- ---------------------------------------------------------------------------
  -- A sessao de A foi com A (caso 11); abre-se uma em C e expira-se.
  v_sess := encode(sha256(('sessao-c-' || gen_random_uuid()::text)::bytea), 'hex');
  PERFORM pg_temp.t_ok(pg_temp.t_como('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_entrar(%L, %L, %L, %L, %L)::text', v_slug, v_cod_c, v_pin_a, v_sess, v_ip_y))::boolean,
    '12 o identificado tambem acompanha por codigo e PIN');
  UPDATE public.denuncias_acesso a SET sessao_expira_em = now() - interval '1 minute' WHERE a.sessao_hash IS NOT NULL;
  PERFORM pg_temp.t_erro('service_role', k_srv,
    format('SELECT public.rpc_denuncia_publica_ler(%L)', v_sess), 'HRD24', '12 sessao expirada');
  PERFORM pg_temp.t_ok(pg_temp.t_como('service_role', k_srv, 'SELECT public.rpc_denuncias_limpar()::text')::integer >= 1,
                       '12 limpeza tira as sessoes expiradas');
  PERFORM pg_temp.t_ok(NOT EXISTS (SELECT 1 FROM public.denuncias_acesso a WHERE a.sessao_hash IS NOT NULL), '12 sem sessoes');

  RAISE EXCEPTION 'TESTE_OK: canal de denuncias (casos 0 a 12) -- tudo revertido.';
END;
$teste$;
