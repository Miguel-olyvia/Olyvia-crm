-- ==============================================================================
-- O CENSO: quantas fichas de colaborador, na mesma organizacao, partilham NIF
-- ou NISS -- em TODAS as organizacoes, sem corrigir nada.
--
-- POR APLICAR.
--
--
-- -- O QUE E E O QUE NAO E --------------------------------------------------
--
-- Esta migracao NAO cria travao nenhum: NAO ha indice unico, NAO ha CHECK, e
-- NAO aborta se encontrar duplicados. E so uma fotografia, gravada numa tabela
-- propria, do estado actual -- para se poder decidir com numeros medidos (e
-- nao com suposicao) se ha limpeza a fazer antes de o travao (migracao
-- seguinte, por aplicar em separado) poder entrar em vigor.
--
-- NUNCA se grava o NIF nem o NISS em claro nesta tabela:
--   - NIF:  guardam-se os ULTIMOS 4 digitos (o mesmo recorte que o NISS ja usa).
--   - NISS: reutiliza-se a mascara que ja existe -- a coluna gerada
--           `pessoas_identificacao.niss_ultimos4` -- em vez de inventar outra.
--
-- A tabela e por organizacao (RLS por organization_id, como todas as outras
-- de RH) mas a permissao que a guarda e NOVA e NAO reutiliza `hr.pessoas.view`:
-- ver duplicados entre fichas e uma pergunta de auditoria/qualidade de dados,
-- nao de ver a lista de colegas -- e por isso e um codigo proprio, atribuido
-- SO ao papel de super admin (criterio de 20261129010000: pela COLUNA `code`
-- de `anew_roles`, nao pelo nome).
--
--
-- -- A CONTAGEM ---------------------------------------------------------------
--
-- Conta-se por (organization_id, nif) e por (organization_id, niss), em TODAS
-- as fichas -- incluindo as apagadas (deleted_at preenchido). E de proposito:
-- o problema que este censo mede e o mesmo que o indice unico parcial da
-- migracao seguinte vai cobrir, e esse indice cobre tambem as apagadas (ver o
-- cabecalho dessa migracao). Um censo que so olhasse para as activas davase
-- por resolvido um caso que o indice ainda ia rejeitar.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_role_permissions
--    WHERE permission_code = 'hr.pessoas.duplicados.view'
--      AND role_id IN (SELECT id FROM public.anew_roles WHERE code = 'super_admin');
--   ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;
--   DROP TABLE IF EXISTS public.pessoas_duplicados_identificacao;
--   DELETE FROM public.anew_permissions WHERE code = 'hr.pessoas.duplicados.view';
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120020000  catalogo hr.* (hr.pessoas.view)
--   20261120040000  pessoas_identificacao, niss_ultimos4
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_identificacao') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_identificacao nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.view') THEN
    RAISE EXCEPTION 'hr.pessoas.view nao esta no catalogo -- e o parent_code do codigo novo.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_roles WHERE code = 'super_admin') THEN
    RAISE EXCEPTION 'Nao existe papel nenhum com code = ''super_admin''. Investigar antes de aplicar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_protect_system_role_perms'
       AND tgrelid = to_regclass('public.anew_role_permissions')
  ) THEN
    RAISE EXCEPTION 'O trigger trg_protect_system_role_perms nao existe.';
  END IF;

  RAISE NOTICE 'Guardas passadas.';
END;
$guardas$;

-- ==============================================================================
-- 1. A permissao nova no catalogo, so para super admin
-- ==============================================================================
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.pessoas.duplicados.view', 'Ver duplicados de identificacao de RH',
   'Ver a lista de fichas de colaborador que partilham NIF ou NISS dentro da mesma organizacao. E uma pergunta de auditoria e qualidade de dados, diferente de ver a lista de colegas -- por isso tem permissao propria e nao reutiliza hr.pessoas.view.',
   'hr', 'hr.pessoas.view', 268, true, 'organization', false)
ON CONFLICT (code) DO UPDATE SET
  name           = EXCLUDED.name,
  description    = EXCLUDED.description,
  category       = EXCLUDED.category,
  parent_code    = EXCLUDED.parent_code,
  display_order  = EXCLUDED.display_order,
  is_dangerous   = EXCLUDED.is_dangerous,
  scope          = EXCLUDED.scope,
  supports_scope = EXCLUDED.supports_scope,
  updated_at     = now();

ALTER TABLE public.anew_role_permissions
  DISABLE TRIGGER trg_protect_system_role_perms;

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, 'hr.pessoas.duplicados.view'
  FROM public.anew_roles r
 WHERE r.code = 'super_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions
  ENABLE TRIGGER trg_protect_system_role_perms;

-- ==============================================================================
-- 2. A tabela do censo
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_duplicados_identificacao (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  campo            text NOT NULL,
  valor_mascarado  text NOT NULL,
  pessoa_ids       uuid[] NOT NULL,
  detectado_em     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pessoas_duplicados_identificacao_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_duplicados_identificacao_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE CASCADE,
  CONSTRAINT pessoas_duplicados_identificacao_campo_valido
    CHECK (campo IN ('nif', 'niss')),
  CONSTRAINT pessoas_duplicados_identificacao_pessoa_ids_minimo
    CHECK (array_length(pessoa_ids, 1) >= 2)
);

COMMENT ON TABLE public.pessoas_duplicados_identificacao IS
'Censo (fotografia, nao vigilancia continua) de fichas de colaborador que partilham NIF ou NISS na mesma organizacao. NUNCA guarda o valor em claro: "campo" = nif guarda os ultimos 4 digitos em valor_mascarado, "campo" = niss reutiliza a mascara que ja existe (pessoas_identificacao.niss_ultimos4). Gravada por esta migracao e por quem a voltar a correr manualmente; nao ha trigger nenhum que a mantenha actualizada sozinha.';
COMMENT ON COLUMN public.pessoas_duplicados_identificacao.valor_mascarado IS
'Os ultimos 4 digitos do NIF ou do NISS -- NUNCA o valor completo.';
COMMENT ON COLUMN public.pessoas_duplicados_identificacao.pessoa_ids IS
'pessoas.id de cada ficha que partilha este valor, incluindo fichas apagadas (deleted_at preenchido): readmitir reutiliza a ficha, por isso uma ficha apagada com o mesmo NIF conta para este censo.';

CREATE INDEX IF NOT EXISTS idx_pessoas_duplicados_identificacao_org
  ON public.pessoas_duplicados_identificacao (organization_id);

ALTER TABLE public.pessoas_duplicados_identificacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_duplicados_identificacao FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_duplicados_identificacao_select ON public.pessoas_duplicados_identificacao;
CREATE POLICY pessoas_duplicados_identificacao_select ON public.pessoas_duplicados_identificacao
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.duplicados.view', organization_id))
  );

DROP POLICY IF EXISTS pessoas_duplicados_identificacao_block_write ON public.pessoas_duplicados_identificacao;
CREATE POLICY pessoas_duplicados_identificacao_block_write ON public.pessoas_duplicados_identificacao
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON POLICY pessoas_duplicados_identificacao_select ON public.pessoas_duplicados_identificacao IS
'Gate por permissao PROPRIA (hr.pessoas.duplicados.view), nao por hr.pessoas.view: ver que ha fichas duplicadas e uma pergunta de auditoria de dados, nao a mesma coisa que ver a lista de colegas.';
COMMENT ON POLICY pessoas_duplicados_identificacao_block_write ON public.pessoas_duplicados_identificacao IS
'A tabela e so escrita por quem corre o censo (service_role ou migracao, que ignoram RLS). authenticated nunca escreve aqui.';

REVOKE ALL ON public.pessoas_duplicados_identificacao FROM PUBLIC;
REVOKE ALL ON public.pessoas_duplicados_identificacao FROM anon;
-- E de authenticated TAMBEM, antes de lhe conceder so a leitura. Sem esta
-- linha o GRANT SELECT SOMA-SE ao que o Supabase ja concede por omissao as
-- tabelas novas do schema public, e a tabela fica escrevivel. Foi o proprio
-- bloco de conferir desta migracao que o apanhou, na primeira tentativa de a
-- aplicar -- e e o mesmo erro que a regra das concessoes por coluna ja
-- descreve: revogar de um lado nao desfaz o que foi concedido do outro.
REVOKE ALL ON public.pessoas_duplicados_identificacao FROM authenticated;
GRANT SELECT ON public.pessoas_duplicados_identificacao TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pessoas_duplicados_identificacao TO service_role;

-- ==============================================================================
-- 3. A contagem, em TODAS as organizacoes -- NAO aborta, so regista e avisa
-- ==============================================================================
DO $censo$
DECLARE
  v_org           record;
  v_total_geral   integer := 0;
  v_total_org     integer;
BEGIN
  -- Fotografia limpa a cada corrida: o censo anterior fica obsoleto assim que
  -- este corre. Nao e historico, e o estado actual.
  DELETE FROM public.pessoas_duplicados_identificacao;

  INSERT INTO public.pessoas_duplicados_identificacao
    (organization_id, campo, valor_mascarado, pessoa_ids, detectado_em)
  SELECT organization_id, 'nif', right(nif, 4), array_agg(pessoa_id ORDER BY pessoa_id), now()
    FROM public.pessoas_identificacao
   WHERE nif IS NOT NULL
   GROUP BY organization_id, nif
  HAVING count(*) > 1;

  INSERT INTO public.pessoas_duplicados_identificacao
    (organization_id, campo, valor_mascarado, pessoa_ids, detectado_em)
  SELECT organization_id, 'niss', right(niss, 4), array_agg(pessoa_id ORDER BY pessoa_id), now()
    FROM public.pessoas_identificacao
   WHERE niss IS NOT NULL
   GROUP BY organization_id, niss
  HAVING count(*) > 1;

  SELECT count(*) INTO v_total_geral FROM public.pessoas_duplicados_identificacao;

  RAISE NOTICE 'Censo de duplicados: % grupo(s) no total, em todas as organizacoes.', v_total_geral;

  FOR v_org IN
    SELECT organization_id, count(*) AS n
      FROM public.pessoas_duplicados_identificacao
     GROUP BY organization_id
     ORDER BY count(*) DESC
  LOOP
    v_total_org := v_org.n;
    RAISE NOTICE '  organizacao %: % grupo(s) duplicado(s).', v_org.organization_id, v_total_org;
  END LOOP;

  IF v_total_geral = 0 THEN
    RAISE NOTICE 'Nenhum duplicado de NIF ou NISS encontrado em organizacao nenhuma.';
  END IF;
END;
$censo$;

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_n            integer;
  v_activo       boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.anew_permissions
     WHERE code = 'hr.pessoas.duplicados.view'
       AND parent_code = 'hr.pessoas.view'
       AND category = 'hr'
  ) THEN
    RAISE EXCEPTION 'hr.pessoas.duplicados.view nao ficou no catalogo com a forma esperada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_role_permissions rp
      JOIN public.anew_roles r ON r.id = rp.role_id
     WHERE r.code = 'super_admin' AND rp.permission_code = 'hr.pessoas.duplicados.view'
  ) THEN
    RAISE EXCEPTION 'hr.pessoas.duplicados.view nao ficou atribuida a nenhum papel super_admin.';
  END IF;

  SELECT string_agg(DISTINCT r.code, ', ')
    INTO v_n
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles r ON r.id = rp.role_id
   WHERE rp.permission_code = 'hr.pessoas.duplicados.view'
     AND r.code <> 'super_admin';
  IF v_n IS NOT NULL THEN
    RAISE NOTICE 'Nota: hr.pessoas.duplicados.view tambem esta em papeis nao-super_admin (atribuidos a mao fora desta migracao): %.', v_n;
  END IF;

  SELECT tgenabled <> 'D' INTO v_activo
    FROM pg_trigger
   WHERE tgname = 'trg_protect_system_role_perms'
     AND tgrelid = to_regclass('public.anew_role_permissions');
  IF NOT coalesce(v_activo, false) THEN
    RAISE EXCEPTION 'trg_protect_system_role_perms ficou DESACTIVADO. Reactivar imediatamente.';
  END IF;

  IF to_regclass('public.pessoas_duplicados_identificacao') IS NULL THEN
    RAISE EXCEPTION 'pessoas_duplicados_identificacao nao ficou criada.';
  END IF;

  IF NOT (
    SELECT relrowsecurity AND relforcerowsecurity
      FROM pg_class WHERE oid = 'public.pessoas_duplicados_identificacao'::regclass
  ) THEN
    RAISE EXCEPTION 'pessoas_duplicados_identificacao sem RLS FORCE activo.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid = 'public.pessoas_duplicados_identificacao'::regclass;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'pessoas_duplicados_identificacao devia ter exactamente 2 politicas (select + bloqueio de escrita), tem %.', v_n;
  END IF;

  IF has_table_privilege('anon', 'public.pessoas_duplicados_identificacao', 'SELECT') THEN
    RAISE EXCEPTION 'pessoas_duplicados_identificacao ficou legivel por anon.';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.pessoas_duplicados_identificacao', 'SELECT') THEN
    RAISE EXCEPTION 'pessoas_duplicados_identificacao deixou de ser legivel por authenticated (a RLS e que filtra por permissao).';
  END IF;
  IF has_table_privilege('authenticated', 'public.pessoas_duplicados_identificacao', 'INSERT') THEN
    RAISE EXCEPTION 'pessoas_duplicados_identificacao ficou escrevivel por authenticated.';
  END IF;

  -- Nenhum valor em claro: nem 9 digitos seguidos (NIF) nem 11 (NISS) em
  -- valor_mascarado -- so os ultimos 4.
  IF EXISTS (
    SELECT 1 FROM public.pessoas_duplicados_identificacao
     WHERE valor_mascarado ~ '^[0-9]{5,}$'
  ) THEN
    RAISE EXCEPTION 'valor_mascarado tem uma entrada com 5 ou mais digitos -- parece valor em claro, nao os ultimos 4.';
  END IF;

  RAISE NOTICE 'OK: hr.pessoas.duplicados.view no catalogo e no papel super_admin, tabela do censo criada com RLS propria, e nenhum valor em claro gravado.';
END;
$conferir$;
