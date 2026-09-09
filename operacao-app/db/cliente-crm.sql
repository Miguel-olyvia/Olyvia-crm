-- ============================================================
--  Operações — o que o CRM já sabe do cliente
-- ============================================================
--  Correr DEPOIS de todos os outros.
--
--  O que isto resolve, dito por quem estava a usar: para abrir uma ordem num
--  sítio novo era preciso sair, ir a Definições, criar o local, e voltar. Três
--  ecrãs para uma coisa que devia ser um botão.
--
--  E pior: a informação já estava toda no CRM. O cliente tem morada,
--  telefone e pessoa de contacto na ficha — e mesmo assim alguém escrevia
--  tudo outra vez à mão. Com hipótese de escrever de outra maneira, e ficarem
--  duas versões do mesmo sítio e do mesmo número.
--
--  Três peças:
--
--   · uma vista com as moradas que o cliente já tem;
--   · uma vista com os telefones e emails dele;
--   · uma RPC que cria o local a partir de uma dessas moradas, ou do nada.
--
--  Escreve fora de `ops_*`? NÃO. Lê as tabelas de morada, telefone e email do
--  CRM, e não lhes toca.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. De que morada do CRM veio este local
-- ============================================================
-- Sem isto não há como saber que a morada já foi usada, e a mesma casa
-- apareceria três vezes na lista com nomes ligeiramente diferentes.

ALTER TABLE public.ops_local
  -- → anew_addresses.id, sem FK. O CRM apaga registos a sério.
  ADD COLUMN IF NOT EXISTS address_id uuid;

CREATE INDEX IF NOT EXISTS ops_local_address_idx
  ON public.ops_local (address_id) WHERE address_id IS NOT NULL;


-- ============================================================
-- 2. As moradas que o cliente já tem
-- ============================================================
-- `security_invoker` outra vez: sem ele, esta vista mostraria as moradas de
-- toda a gente a quem a abrisse.
--
-- `ja_e_local` é o que faz a lista ser útil em vez de confusa: uma morada que
-- já virou local não se oferece outra vez.

CREATE OR REPLACE VIEW public.ops_v_morada_cliente
WITH (security_invoker = true) AS
SELECT
  a.id                                   AS address_id,
  cl.id                                  AS cliente_id,
  cl.organization_id,
  ea.address_type                        AS tipo,
  COALESCE(ea.is_primary, false)         AS principal,
  -- A morada escrita como se diz a alguém ao telefone.
  btrim(concat_ws(', ',
    nullif(btrim(concat_ws(' ', a.street, a.number)), ''),
    nullif(btrim(concat_ws(' ',
      nullif(a.floor, ''),
      nullif(a.unit, '')
    )), ''),
    nullif(btrim(concat_ws(' ', a.postal_code, a.city)), '')
  ))                                     AS morada,
  a.street,
  a.number,
  a.floor,
  a.unit,
  a.postal_code,
  a.city,
  a.district,
  EXISTS (
    SELECT 1 FROM public.ops_local l
     WHERE l.address_id = a.id AND l.cliente_id = cl.id
  )                                      AS ja_e_local
FROM public.anew_clients cl
JOIN public.anew_entity_addresses ea ON ea.entity_id = cl.entity_id
JOIN public.anew_addresses a ON a.id = ea.address_id
WHERE cl.deleted_at IS NULL
  AND (ea.valid_to IS NULL OR ea.valid_to > now());

REVOKE ALL ON public.ops_v_morada_cliente FROM PUBLIC, anon;
GRANT SELECT ON public.ops_v_morada_cliente TO authenticated, service_role;


-- ============================================================
-- 3. Como se fala com este cliente
-- ============================================================
-- O contacto no local e o telefone são campos próprios na ordem — e hoje
-- escrevem-se à mão, um a um, mesmo estando na ficha do cliente.
--
-- Uma linha por número: o principal primeiro, que é o que a app oferece por
-- omissão. Sem `is_primary`, ordena-se pelo mais antigo, que costuma ser o
-- número da casa e não o do estafeta que entregou uma encomenda uma vez.

CREATE OR REPLACE VIEW public.ops_v_contacto_cliente
WITH (security_invoker = true) AS
SELECT
  cl.id                          AS cliente_id,
  cl.organization_id,
  COALESCE(nullif(btrim(e.display_name), ''), 'Cliente') AS nome,
  t.id                           AS telefone_id,
  btrim(concat_ws(' ', nullif(t.country_code, ''), t.phone_number)) AS telefone,
  t.phone_type                   AS tipo,
  COALESCE(t.is_primary, false)  AS principal,
  (SELECT m.email FROM public.anew_entity_emails m
    WHERE m.entity_id = cl.entity_id
    ORDER BY m.is_primary DESC NULLS LAST, m.created_at
    LIMIT 1)                     AS email
FROM public.anew_clients cl
JOIN public.anew_entities e ON e.id = cl.entity_id
LEFT JOIN public.anew_entity_phones t ON t.entity_id = cl.entity_id
WHERE cl.deleted_at IS NULL;

REVOKE ALL ON public.ops_v_contacto_cliente FROM PUBLIC, anon;
GRANT SELECT ON public.ops_v_contacto_cliente TO authenticated, service_role;


-- ============================================================
-- 4. Criar um local
-- ============================================================
-- Existe para o código sair de um sítio só, e para a morada do CRM ser
-- copiada sempre da mesma maneira. Com o INSERT à mão, cada ecrã copiava-a
-- um bocadinho diferente e a lista ficava com três versões da mesma casa.

CREATE OR REPLACE FUNCTION public.rpc_ops_criar_local(
  p_cliente_id uuid,
  p_nome       text    DEFAULT NULL,
  p_tipo       text    DEFAULT 'morada',
  p_parent_id  uuid    DEFAULT NULL,
  p_address_id uuid    DEFAULT NULL,
  p_morada     text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_org    uuid;
  v_nome   text := nullif(btrim(coalesce(p_nome, '')), '');
  v_codigo text;
  v_id     uuid;
  v_m      record;
  v_morada text := nullif(btrim(coalesce(p_morada, '')), '');
  v_cidade text;
  v_cp     text;
BEGIN
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Um local precisa de um cliente.';
  END IF;

  SELECT organization_id INTO v_org FROM public.anew_clients WHERE id = p_cliente_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(v_org) q;

  IF NOT (
    public.is_system_admin_user(auth.uid())
    OR public.has_anew_permission(auth.uid(), 'operations.locations.manage')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para criar locais.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_tipo NOT IN ('morada','edificio','piso','espaco') THEN
    RAISE EXCEPTION 'Tipo de local inválido: %.', p_tipo;
  END IF;

  IF p_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_local WHERE id = p_parent_id AND organization_id = v_org) THEN
    RAISE EXCEPTION 'Esse local-pai não é desta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── veio de uma morada do CRM ────────────────────────────────────────
  IF p_address_id IS NOT NULL THEN
    SELECT * INTO v_m FROM public.ops_v_morada_cliente
     WHERE address_id = p_address_id AND cliente_id = p_cliente_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Essa morada não é deste cliente.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- A mesma morada não vira dois locais. Devolve-se o que já existe, em vez
    -- de rebentar: quem carregou no botão quer o local, e ele já lá está.
    IF v_m.ja_e_local THEN
      SELECT id, codigo, nome INTO v_id, v_codigo, v_nome
        FROM public.ops_local
       WHERE address_id = p_address_id AND cliente_id = p_cliente_id
       LIMIT 1;

      RETURN jsonb_build_object(
        'ok', true, 'id', v_id, 'codigo', v_codigo, 'nome', v_nome, 'ja_existia', true);
    END IF;

    -- Sem nome escrito, a rua e o número servem: é como as pessoas lhe chamam.
    IF v_nome IS NULL THEN
      v_nome := COALESCE(
        nullif(btrim(concat_ws(' ', v_m.street, v_m.number,
                               nullif(v_m.floor, ''), nullif(v_m.unit, ''))), ''),
        v_m.morada,
        'Local sem nome');
    END IF;

    v_morada := COALESCE(v_morada, v_m.morada);
    v_cidade := v_m.city;
    v_cp     := v_m.postal_code;
  END IF;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Um local precisa de um nome. É por ele que se encontra na lista.';
  END IF;

  v_codigo := public.ops_proximo_codigo_interno(v_org, 'LOC');

  INSERT INTO public.ops_local (
    organization_id, cliente_id, parent_id, codigo, nome, tipo,
    morada, cidade, cod_postal, address_id)
  VALUES (
    v_org, p_cliente_id, p_parent_id, v_codigo, v_nome, p_tipo,
    v_morada, v_cidade, v_cp, p_address_id)
  RETURNING id INTO v_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_org, 'local', v_id, 'criado', v_nome, v_user, NULL,
     jsonb_build_object('codigo', v_codigo, 'tipo', p_tipo,
                        'da_morada_do_crm', p_address_id IS NOT NULL));

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'codigo', v_codigo, 'nome', v_nome, 'ja_existia', false);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_criar_local(uuid, text, text, uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_criar_local(uuid, text, text, uuid, uuid, text)
  TO authenticated, service_role;

COMMIT;


-- ============================================================
-- Verificação
-- ============================================================
DO $v$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
      AND proname = 'rpc_ops_criar_local') THEN
    RAISE EXCEPTION 'A função de criar locais não ficou instalada.';
  END IF;

  IF (SELECT count(*) FROM pg_class
       WHERE relname IN ('ops_v_morada_cliente','ops_v_contacto_cliente')
         AND relnamespace = 'public'::regnamespace
         AND 'security_invoker=true' = ANY (reloptions)) <> 2 THEN
    RAISE EXCEPTION
      'Uma das vistas ficou sem security_invoker — mostraria dados de outras organizações.';
  END IF;

  RAISE NOTICE 'Ligado ao CRM. Morada, telefone e contacto deixam de se escrever à mão.';
END
$v$;
