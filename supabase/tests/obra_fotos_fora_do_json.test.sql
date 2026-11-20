-- ============================================================
-- Testes: 20270125010000_obra_fotos_fora_do_json.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: usa o primeiro negócio com número e um utilizador com
-- pessoas.edit e pessoas.view na organização dele (auth.uid() pelas claims; as funções são SECURITY DEFINER). Os erros juntam-se em
-- teste.falhas e o resultado sai no SELECT final.
--
-- Correr:
--   supabase db query --linked -o csv -f supabase/tests/obra_fotos_fora_do_json.test.sql
--
-- Cobre:
--   A. juntar: um JPEG pequeno → {id, ref «obrafoto:<id>», em}; a linha fica no negócio, com quem a juntou
--   B. ler (a equipa): os mesmos bytes em base64
--   C. recusas: não é imagem (NE006); sem sessão / sem permissão (CT001); negócio de outra organização (CT001)
--   D. apagar: a que ninguém usa apaga-se; a que a obra gravada já usa (ops_obra.estado_emylia) fica; a de outra pessoa fica
--   E. portal: sem conta do portal, «Negócio indisponível»; com a conta do cliente do negócio (se a base tiver uma), só depois de a
--      fotografia estar na vista do cliente
--   F. privilégios: a tabela fechada a anon e authenticated; as quatro funções só para authenticated
-- ============================================================

BEGIN;

SELECT set_config('teste.falhas', '', true), set_config('teste.ok', 'nao', true), set_config('teste.notas', '', true);

DO $fx$
DECLARE v_base negocios; v_auth uuid; f text := '';
BEGIN
  BEGIN
    -- de preferência um negócio com obra (para o D)
    SELECT n.* INTO v_base FROM negocios n
    WHERE n.numero IS NOT NULL AND n.deleted_at IS NULL
    ORDER BY (EXISTS (SELECT 1 FROM ops_obra o WHERE o.negocio_id = n.id)) DESC, n.numero LIMIT 1;
    IF v_base.id IS NULL THEN RAISE EXCEPTION 'base sem negócio com número'; END IF;
    SELECT u.auth_user_id INTO v_auth FROM anew_users u
    WHERE u.auth_user_id IS NOT NULL
      AND public.has_anew_permission_in_org(u.auth_user_id, 'pessoas.edit', v_base.organization_id)
      AND public.has_anew_permission_in_org(u.auth_user_id, 'pessoas.view', v_base.organization_id)
    -- de preferência um administrador de sistema (vê todos os negócios: o âmbito não atrapalha o teste)
    ORDER BY public.is_system_admin_user(u.auth_user_id) DESC, u.created_at NULLS LAST, u.id LIMIT 1;
    IF v_auth IS NULL THEN RAISE EXCEPTION 'sem utilizador com pessoas.edit e pessoas.view na organização %', v_base.organization_id; END IF;
    PERFORM set_config('teste.org', v_base.organization_id::text, true);
    PERFORM set_config('teste.neg', v_base.id::text, true);
    PERFORM set_config('teste.numero', v_base.numero::text, true);
    PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    -- um JPEG de 203 bytes (só o começo conta para a validação) e um «JPEG» que não é imagem
    PERFORM set_config('teste.jpeg', translate(encode(decode('ffd8ffe0' || repeat('00', 199), 'hex'), 'base64'), E'\n\r', ''), true);
    PERFORM set_config('teste.lixo', translate(encode(decode(repeat('41', 200), 'hex'), 'base64'), E'\n\r', ''), true);
    PERFORM set_config('teste.ok', 'sim', true);
  EXCEPTION WHEN OTHERS THEN
    f := f || format('FIXTURE falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $fx$;

DO $t$
DECLARE
  f text := ''; v_org uuid; v_neg uuid; v_num int; r jsonb; v_id uuid; v_id2 uuid; v_ok boolean; v_outra uuid; v_obra uuid;
  v_foto jsonb; v_lixo jsonb;
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  v_org := current_setting('teste.org')::uuid; v_neg := current_setting('teste.neg')::uuid; v_num := current_setting('teste.numero')::int;
  v_foto := jsonb_build_object('mime', 'image/jpeg', 'b64', current_setting('teste.jpeg'));
  v_lixo := jsonb_build_object('mime', 'image/jpeg', 'b64', current_setting('teste.lixo'));
  PERFORM set_config('request.jwt.claims', current_setting('teste.claims'), true);

  -- A
  BEGIN
    r := public.neg_obra_foto_juntar(v_org, v_num, v_foto);
    v_id := (r->>'id')::uuid;
    IF r->>'ref' IS DISTINCT FROM 'obrafoto:' || v_id::text THEN f := f || 'A a ref devia ser obrafoto:<id>: ' || coalesce(r->>'ref', 'NULL') || '; '; END IF;
    IF NOT EXISTS (SELECT 1 FROM negocio_obra_fotos x WHERE x.id = v_id AND x.negocio_id = v_neg AND x.organization_id = v_org
                   AND x.created_by = (current_setting('teste.claims')::jsonb->>'sub')::uuid) THEN
      f := f || 'A a linha não ficou no negócio com quem a juntou; ';
    END IF;
  EXCEPTION WHEN OTHERS THEN f := f || format('A juntar falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;

  -- B
  BEGIN
    r := public.neg_obra_foto(v_org, v_id);
    IF r->>'b64' IS DISTINCT FROM current_setting('teste.jpeg') OR r->>'mime' <> 'image/jpeg' THEN f := f || 'B a leitura não devolveu os mesmos bytes; '; END IF;
  EXCEPTION WHEN OTHERS THEN f := f || format('B ler falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;

  -- C
  BEGIN
    PERFORM public.neg_obra_foto_juntar(v_org, v_num, v_lixo);
    f := f || 'C1 um ficheiro que não é imagem foi aceite; ';
  EXCEPTION WHEN SQLSTATE 'NE006' THEN NULL;
    WHEN OTHERS THEN f := f || format('C1 deu outro erro: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.neg_obra_foto(v_org, v_id);
    f := f || 'C2 um utilizador sem permissão leu a fotografia; ';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
    WHEN OTHERS THEN f := f || format('C2 deu outro erro: %s %s; ', SQLSTATE, SQLERRM);
  END;
  BEGIN
    PERFORM public.neg_obra_foto_juntar(v_org, v_num, v_foto);
    f := f || 'C3 um utilizador sem permissão juntou uma fotografia; ';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
    WHEN OTHERS THEN f := f || format('C3 deu outro erro: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('request.jwt.claims', current_setting('teste.claims'), true);
  SELECT x.organization_id INTO v_outra FROM negocios x WHERE x.organization_id <> v_org ORDER BY x.organization_id LIMIT 1;
  IF v_outra IS NOT NULL THEN
    BEGIN
      PERFORM public.neg_obra_foto(v_outra, v_id);
      f := f || 'C4 a fotografia leu-se por outra organização; ';
    EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
      WHEN OTHERS THEN f := f || format('C4 deu outro erro: %s %s; ', SQLSTATE, SQLERRM);
    END;
  END IF;

  -- D
  BEGIN
    r := public.neg_obra_foto_juntar(v_org, v_num, v_foto); v_id2 := (r->>'id')::uuid;
    v_ok := public.neg_obra_foto_apagar(v_org, v_id2);
    IF NOT v_ok OR EXISTS (SELECT 1 FROM negocio_obra_fotos WHERE id = v_id2) THEN f := f || 'D1 a fotografia sem uso não se apagou; '; END IF;
    SELECT o.id INTO v_obra FROM ops_obra o WHERE o.negocio_id = v_neg LIMIT 1;
    IF v_obra IS NOT NULL THEN
      UPDATE ops_obra SET estado_emylia = coalesce(estado_emylia, '{}'::jsonb) || jsonb_build_object('teste_125010', 'obrafoto:' || v_id::text) WHERE id = v_obra;
      v_ok := public.neg_obra_foto_apagar(v_org, v_id);
      IF v_ok OR NOT EXISTS (SELECT 1 FROM negocio_obra_fotos WHERE id = v_id) THEN f := f || 'D2 a fotografia que a obra usa apagou-se; '; END IF;
    ELSE
      PERFORM set_config('teste.notas', current_setting('teste.notas') || 'D2 saltado (a base não tem obra); ', true);
    END IF;
    UPDATE negocio_obra_fotos SET created_by = gen_random_uuid() WHERE id = v_id;
    UPDATE ops_obra SET estado_emylia = estado_emylia - 'teste_125010' WHERE id = v_obra;
    v_ok := public.neg_obra_foto_apagar(v_org, v_id);
    IF v_ok OR NOT EXISTS (SELECT 1 FROM negocio_obra_fotos WHERE id = v_id) THEN f := f || 'D3 a fotografia de outra pessoa apagou-se; '; END IF;
  EXCEPTION WHEN OTHERS THEN f := f || format('D bloco falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;

  -- E
  BEGIN
    PERFORM public.portal_neg_obra_foto(v_id);
    f := f || 'E1 a equipa (sem conta do portal) leu pela função do portal; ';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
    WHEN OTHERS THEN f := f || format('E1 deu outro erro: %s %s; ', SQLSTATE, SQLERRM);
  END;
  DECLARE v_cli uuid;
  BEGIN
    SELECT cpu.auth_user_id INTO v_cli FROM client_portal_users cpu JOIN negocios n ON n.organization_id = cpu.organization_id AND n.entity_id = cpu.entity_id
     WHERE n.id = v_neg AND cpu.auth_user_id IS NOT NULL LIMIT 1;
    IF v_cli IS NULL THEN
      PERFORM set_config('teste.notas', current_setting('teste.notas') || 'E2 saltado (o negócio não tem conta do portal); ', true);
    ELSE
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cli, 'role', 'authenticated')::text, true);
      DELETE FROM negocio_vista_cliente WHERE negocio_id = v_neg;
      BEGIN
        PERFORM public.portal_neg_obra_foto(v_id);
        f := f || 'E2 o cliente leu uma fotografia que a vista não mostra; ';
      EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
      END;
      INSERT INTO negocio_vista_cliente (negocio_id, organization_id, vista, marca)
      VALUES (v_neg, v_org, jsonb_build_object('d', jsonb_build_object('obra', jsonb_build_object('diario', jsonb_build_array(jsonb_build_object('k', 'foto', 'fotos', jsonb_build_array('obrafoto:' || v_id::text)))))), 'teste');
      r := public.portal_neg_obra_foto(v_id);
      IF r->>'b64' IS DISTINCT FROM current_setting('teste.jpeg') THEN f := f || 'E3 o cliente não leu a fotografia que a vista mostra; '; END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN f := f || format('E bloco falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('request.jwt.claims', '', true);

  -- F
  IF has_table_privilege('anon', 'public.negocio_obra_fotos', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.negocio_obra_fotos', 'SELECT,INSERT,UPDATE,DELETE') THEN
    f := f || 'F a tabela ficou aberta; ';
  END IF;
  IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('neg_obra_foto_juntar', 'neg_obra_foto', 'neg_obra_foto_apagar', 'portal_neg_obra_foto')
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')) <> 4 THEN
    f := f || 'F as funções não ficaram só para authenticated; ';
  END IF;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;

SELECT CASE WHEN current_setting('teste.falhas') = '' AND current_setting('teste.ok') = 'sim'
            THEN 'OK: as fotografias da obra fora do JSON — A, B, C (4), D (3), E (3), F' || CASE WHEN current_setting('teste.notas') <> '' THEN ' · ' || current_setting('teste.notas') ELSE '' END
            ELSE 'FALHOU: ' || current_setting('teste.falhas')
       END AS resultado;

ROLLBACK;
