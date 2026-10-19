-- ============================================================================
-- Morada da ficha: uma edicao que so muda maiusculas/minusculas deixa de ser
-- engolida pela linha partilhada de outra ficha.
--
-- POR APLICAR.
--
--
-- -- EFEITO NA MUDELAR (funcao partilhada) ------------------------------------
--
--   * sync_entity_primary_address e chamada ao gravar a morada de uma ficha
--     (lead / contacto / cliente). Passa a reaproveitar uma morada existente
--     SO quando a rua e a cidade sao EXACTAMENTE iguais (mesmas maiusculas),
--     alem da mesma address_key. Uma correccao so de maiusculas ("rua x" ->
--     "Rua X") passa a criar uma linha nova e a repontar a ligacao da ficha
--     ('repointed'), em vez de devolver a linha antiga com o texto antigo.
--   * As outras fichas que partilham a linha antiga NAO mudam: o texto de
--     linhas existentes nunca e actualizado aqui.
--   * Gravar exactamente a mesma morada continua a ser um no-op
--     ('noop_already_linked').
--   * DESEMPENHO: NAO medido. A pesquisa continua a ser por address_key (sem
--     indice proprio, como ja era); so acrescenta dois filtros de igualdade e
--     um ORDER BY sobre as poucas linhas com a mesma chave.
--
--
-- -- O PROBLEMA ---------------------------------------------------------------
--
-- A chave de reaproveitamento e lower(concat_ws('|', rua, cp, cidade)). Como
-- e em minusculas, "Rua X" e "rua x" dao a mesma chave: a funcao encontrava a
-- linha ja existente (com o texto antigo), via que a ficha ja lhe estava
-- ligada e respondia 'noop_already_linked'. A correccao de maiusculas perdia-se
-- sem erro, e o PDF continuava com o texto antigo.
--
--
-- -- A MUDANCA ----------------------------------------------------------------
--
-- Igual a 20261120110000 letra a letra, excepto a pesquisa de reaproveitamento:
--   antes:  WHERE a.address_key = v_key LIMIT 1
--   agora:  WHERE a.address_key = v_key
--             AND a.street = v_street
--             AND a.city = COALESCE(v_city, '')
--           ORDER BY a.created_at, a.id
--           LIMIT 1
-- (comparacao case-sensitive, depois do btrim ja feito; o ORDER BY torna a
-- escolha deterministica quando ha varias linhas iguais). A address_key
-- gravada continua a mesma (em minusculas), por isso podem passar a existir
-- varias linhas com a mesma address_key e textos diferentes em maiusculas.
--
-- !! AVISO: anew_addresses.address_key NAO tem indice unico (confirmado no
-- baseline 20260615130000 e em todas as migrations posteriores; a conferencia
-- abaixo volta a confirma-lo no catalogo). Se alguem criar um indice unico em
-- address_key, o INSERT de uma variante so de maiusculas passa a rebentar com
-- 23505 e esta funcao parte. Quem quiser esse indice tem de mudar primeiro a
-- definicao da chave ou esta pesquisa.
--
--
-- -- O QUE ESTA MIGRACAO NAO FAZ ----------------------------------------------
--
--   * NAO actualiza o texto de moradas existentes nem faz backfill.
--   * NAO muda assinatura, tipo de retorno, linguagem, SECURITY DEFINER,
--     search_path nem grants (CREATE OR REPLACE preserva o ACL; a conferencia
--     compara-o com o de antes).
--
-- Estado de partida confirmado por leitura (grep a todas as migrations deste
-- ramo e de negocios-prototipo): a unica definicao e 20261120110000; nenhuma
-- posterior a redefine.
-- ============================================================================


-- -- 0. Guardar o ACL de antes, para a conferencia comparar ------------------
-- Variavel de sessao (is_local = false) para sobreviver entre instrucoes.
SELECT set_config(
  'olyvia.sync_addr_acl_antes',
  COALESCE((
    SELECT COALESCE(pr.proacl::text, '')
    FROM pg_catalog.pg_proc pr
    WHERE pr.oid = to_regprocedure('public.sync_entity_primary_address(uuid, uuid, text, text, text, text, uuid)')
  ), '<sem funcao>'),
  false
);


-- -- 1. sync_entity_primary_address: reaproveita so com texto exacto ---------
CREATE OR REPLACE FUNCTION public.sync_entity_primary_address(
  p_entity_id uuid,
  p_organization_id uuid,
  p_street text,
  p_postal_code text,
  p_city text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS TABLE(address_id uuid, decision text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_street text;
  v_postal text;
  v_city text;
  v_district text;
  v_key text;
  v_address_id uuid;
  v_link_id uuid;
  v_link_address_id uuid;
BEGIN
  IF p_entity_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'entity_id e organization_id sao obrigatorios';
  END IF;

  -- O chamador tem de ter este entity no seu scope de visibilidade...
  IF NOT public.is_entity_in_user_scope(p_entity_id, auth.uid()) THEN
    RAISE EXCEPTION 'Entity % nao acessivel ao utilizador actual', p_entity_id;
  END IF;

  -- ...E o entity tem de pertencer de facto a organization_id indicada
  -- (nunca confiar apenas no scope agregado do chamador, que pode abranger
  -- varias organizacoes visiveis).
  IF NOT EXISTS (
    SELECT 1 FROM public.anew_leads l
      WHERE l.entity_id = p_entity_id AND l.organization_id = p_organization_id
    UNION ALL
    SELECT 1 FROM public.anew_contacts c
      WHERE c.entity_id = p_entity_id AND c.organization_id = p_organization_id
    UNION ALL
    SELECT 1 FROM public.anew_clients cl
      WHERE cl.entity_id = p_entity_id AND cl.organization_id = p_organization_id
    UNION ALL
    SELECT 1 FROM public.anew_organizations o
      WHERE o.entity_id = p_entity_id AND o.id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Entity % nao pertence a organizacao %', p_entity_id, p_organization_id;
  END IF;

  v_street := NULLIF(btrim(COALESCE(p_street, '')), '');
  v_postal := NULLIF(btrim(COALESCE(p_postal_code, '')), '');
  v_city := NULLIF(btrim(COALESCE(p_city, '')), '');
  v_district := NULLIF(btrim(COALESCE(p_district, '')), '');

  IF v_street IS NULL OR v_postal IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'skip_no_valid_source'::text;
    RETURN;
  END IF;

  -- Lixo de preenchimento -- mesma lista de REJECTED_TOKENS do TS.
  IF lower(v_street) IN ('-', '--', 'n/a', 'na', 'null', 'none', 's/n', 'sn')
     OR lower(v_postal) IN ('-', '--', 'n/a', 'na', 'null', 'none', '0000-000', '0000')
     OR v_postal !~ '^[0-9]{4}-[0-9]{3}$'
     OR v_postal = '0000-000'
  THEN
    RETURN QUERY SELECT NULL::uuid, 'skip_filler'::text;
    RETURN;
  END IF;

  v_key := lower(concat_ws('|', v_street, v_postal, COALESCE(v_city, '')));

  -- Reaproveita morada existente com a mesma chave E o mesmo texto exacto
  -- (rua e cidade, case-sensitive); senao cria. Uma variante so de
  -- maiusculas cria linha nova e nunca altera a linha partilhada.
  -- AVISO: depende de address_key NAO ser unico (ver cabecalho da migration
  -- 20261220130000).
  SELECT a.id INTO v_address_id
  FROM public.anew_addresses a
  WHERE a.address_key = v_key
    AND a.street = v_street
    AND a.city = COALESCE(v_city, '')
  ORDER BY a.created_at, a.id
  LIMIT 1;

  IF v_address_id IS NULL THEN
    INSERT INTO public.anew_addresses (
      address_key, street, number, postal_code, city, district, country, created_by
    ) VALUES (
      v_key, v_street, '', v_postal, COALESCE(v_city, ''), v_district, 'PT', p_created_by
    )
    RETURNING id INTO v_address_id;
  END IF;

  -- Link primario activo actual (se algum).
  SELECT ea.id, ea.address_id INTO v_link_id, v_link_address_id
  FROM public.anew_entity_addresses ea
  WHERE ea.entity_id = p_entity_id
    AND ea.is_primary = true
    AND ea.valid_to IS NULL
  LIMIT 1;

  IF v_link_id IS NOT NULL AND v_link_address_id = v_address_id THEN
    -- Idempotente: mesma morada ja ligada, nada a fazer.
    RETURN QUERY SELECT v_address_id, 'noop_already_linked'::text;
    RETURN;
  END IF;

  IF v_link_id IS NOT NULL THEN
    UPDATE public.anew_entity_addresses
      SET valid_to = now(), is_primary = false
      WHERE id = v_link_id;
  END IF;

  INSERT INTO public.anew_entity_addresses (
    entity_id, address_id, address_type, is_primary, created_by
  ) VALUES (
    p_entity_id, v_address_id, 'work', true, p_created_by
  );

  RETURN QUERY SELECT v_address_id, (CASE WHEN v_link_id IS NULL THEN 'inserted' ELSE 'repointed' END)::text;
END;
$$;

COMMENT ON FUNCTION public.sync_entity_primary_address(uuid, uuid, text, text, text, text, uuid) IS
  'Insere-ou-reaproveita a morada e liga-a como morada primaria da entidade, numa unica transacao. '
  'Reaproveita so com a mesma chave lower(concat_ws(''|'', street, postal, city)) E rua/cidade exactamente '
  'iguais (case-sensitive); uma variante so de maiusculas cria linha nova e nunca altera a partilhada '
  '(depende de address_key NAO ser unico). SECURITY DEFINER: valida explicitamente que a entidade pertence '
  'a organization_id indicada antes de escrever. Idempotente e sem lixo de preenchimento.';


-- -- 2. Conferencia ------------------------------------------------------------
-- Tudo o que vem do catalogo e convertido para ::text. Nenhum caracter de
-- percentagem nas mensagens de RAISE: so concatenacao, via USING MESSAGE.
DO $check$
DECLARE
  v_fn        constant text := 'public.sync_entity_primary_address(uuid, uuid, text, text, text, text, uuid)';
  v_oid       oid;
  v_def       text;
  v_acl_antes text;
  v_acl_agora text;
  v_n         int;
BEGIN
  v_oid := to_regprocedure(v_fn);
  IF v_oid IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Funcao ' || v_fn || ' em falta';
  END IF;

  -- 2a. Uma so sobrecarga com este nome (nao se ressuscitou outra assinatura).
  SELECT count(*)::int INTO v_n
    FROM pg_catalog.pg_proc pr
    JOIN pg_catalog.pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname::text = 'public'
     AND pr.proname::text = 'sync_entity_primary_address';
  IF v_n <> 1 THEN
    RAISE EXCEPTION USING MESSAGE = 'Esperada 1 sobrecarga de sync_entity_primary_address, encontradas ' || v_n::text;
  END IF;

  -- 2b. Atributos: plpgsql, SECURITY DEFINER, VOLATILE, search_path=public,
  --     retorno TABLE(address_id uuid, decision text).
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_proc pr
      JOIN pg_catalog.pg_language l ON l.oid = pr.prolang
     WHERE pr.oid = v_oid
       AND l.lanname::text = 'plpgsql'
       AND pr.prosecdef
       AND pr.provolatile::text = 'v'
       AND pr.proretset
       AND array_to_string(pr.proconfig, ',') = 'search_path=public'
       AND pg_catalog.pg_get_function_result(pr.oid)::text = 'TABLE(address_id uuid, decision text)'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Funcao ' || v_fn || ' com atributos alterados (linguagem / SECURITY DEFINER / volatilidade / search_path / retorno)';
  END IF;

  -- 2c. A pesquisa de reaproveitamento exige o texto exacto e e deterministica.
  v_def := pg_catalog.pg_get_functiondef(v_oid)::text;
  IF v_def NOT LIKE '%AND a.street = v_street%'
     OR v_def NOT LIKE '%AND a.city = COALESCE(v_city, '''')%'
     OR v_def NOT LIKE '%ORDER BY a.created_at, a.id%'
  THEN
    RAISE EXCEPTION USING MESSAGE = 'Funcao ' || v_fn || ' sem a pesquisa exacta de rua/cidade com ORDER BY created_at, id';
  END IF;

  -- 2d. Grants iguais aos de antes (CREATE OR REPLACE preserva o ACL).
  v_acl_antes := current_setting('olyvia.sync_addr_acl_antes', true);
  SELECT COALESCE(pr.proacl::text, '') INTO v_acl_agora
    FROM pg_catalog.pg_proc pr WHERE pr.oid = v_oid;
  IF v_acl_antes IS NOT NULL AND v_acl_antes <> '<sem funcao>'
     AND v_acl_antes <> v_acl_agora THEN
    RAISE EXCEPTION USING MESSAGE = 'ACL de ' || v_fn || ' mudou: antes ' || v_acl_antes || ' agora ' || v_acl_agora;
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION USING MESSAGE = 'Funcao ' || v_fn || ' sem EXECUTE para authenticated';
  END IF;

  -- 2e. address_key continua SEM indice unico (senao a variante de maiusculas
  --     rebenta com 23505).
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_index i
     WHERE i.indrelid = 'public.anew_addresses'::regclass
       AND i.indisunique
       AND pg_catalog.pg_get_indexdef(i.indexrelid)::text LIKE '%address_key%'
  ) OR EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint c
     WHERE c.conrelid = 'public.anew_addresses'::regclass
       AND c.contype::text IN ('u', 'x')
       AND pg_catalog.pg_get_constraintdef(c.oid)::text LIKE '%address_key%'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'anew_addresses.address_key tem indice/constraint unico: sync_entity_primary_address parte com variantes so de maiusculas';
  END IF;
END
$check$;

-- Limpa a variavel de sessao.
SELECT set_config('olyvia.sync_addr_acl_antes', '', false);
