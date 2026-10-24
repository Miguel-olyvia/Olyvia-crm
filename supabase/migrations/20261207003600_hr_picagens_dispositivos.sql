-- ==============================================================================
-- hr_picagens_dispositivos: o catalogo de dispositivos de picagem, por
-- organizacao.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Uma picagem que venha de um quiosque, de um leitor ou de um relogio de ponto
-- tem de dizer DE ONDE veio -- para se poder desligar um dispositivo
-- comprometido sem apagar as picagens que ele produziu, e para a importacao ser
-- idempotente (a referencia externa do evento e unica POR DISPOSITIVO, nao
-- globalmente).
--
-- Sem catalogo, o dispositivo seria um text livre na picagem, e "Quiosque
-- entrada" e "quiosque da entrada" passariam a ser dois dispositivos.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma linha = um dispositivo de UMA organizacao. tipo em CHECK fechado
-- (quiosque / leitor_biometrico / leitor_cartao / relogio_ponto / app_movel /
-- web), local_id opcional para o dispositivo fixo, e chave_registo_hash para o
-- dispositivo se autenticar.
--
-- Guarda-se o HASH da chave e nunca a chave: um dispositivo perdido rodada-se a
-- chave, e uma base comprometida nao entrega credenciais de picagem a ninguem.
-- A coluna chama-se _hash de proposito, para ninguem la por o segredo em claro
-- por distraccao.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - O protocolo de registo e autenticacao do dispositivo, a app, o quiosque, o
--   leitor. A tabela guarda o dispositivo e o hash da sua chave; validar a
--   chave e emitir tokens e ronda propria.
-- - A geocerca: hr_locais_trabalho tem coordenadas e pessoas_picagens tambem,
--   mas VALIDAR que a picagem cai dentro do local nao se faz nesta ronda. As
--   colunas ficam a acumular dados ate la.
-- - Sem ramo de ficha-propria na RLS -- e com a MESMA pendencia de produto que
--   a ronda 2 registou para hr_locais_trabalho e a ronda 3 para
--   hr_ausencias_tipos: quem so tem hr.assiduidade.view.own ve a sua picagem e
--   NAO ve o nome do dispositivo nem do local. Fica levantado.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e so depois de
-- apagar pessoas_picagens:
--   DROP TABLE public.hr_picagens_dispositivos;
--
--
-- Prerequisitos:
--   20261120130000  hr_locais_trabalho (unique hr_locais_trabalho_id_org_key)
--   20261121140000  hr.assiduidade.dispositivos.view / .edit no catalogo
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.anew_organizations') IS NULL THEN
    RAISE EXCEPTION 'public.anew_organizations nao existe. Estado da base inesperado.';
  END IF;

  IF to_regclass('public.hr_locais_trabalho') IS NULL THEN
    RAISE EXCEPTION 'public.hr_locais_trabalho nao existe. Aplicar 20261120130000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_locais_trabalho_id_org_key'
       AND conrelid = to_regclass('public.hr_locais_trabalho')
  ) THEN
    RAISE EXCEPTION
      'A unique hr_locais_trabalho_id_org_key nao existe; a FK composta de local_id depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe. Aplicar 20261120010000.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.assiduidade.dispositivos.view') THEN
    RAISE EXCEPTION
      'hr.assiduidade.dispositivos.view nao esta no catalogo. Aplicar 20261121140000 primeiro, senao a tabela nasce invisivel para todos.';
  END IF;
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_picagens_dispositivos (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL,

  codigo              text NOT NULL,
  nome                text NOT NULL,
  tipo                text NOT NULL,
  local_id            uuid,

  -- O HASH, nunca a chave. Ver o cabecalho.
  chave_registo_hash  text,
  chave_rodada_em     timestamptz,

  ref_externa         text,
  fabricante          text,
  modelo              text,
  notas               text,

  activo              boolean NOT NULL DEFAULT true,
  ultima_picagem_em   timestamptz,

  deleted_at          timestamptz,
  deleted_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  updated_by          uuid,

  CONSTRAINT hr_picagens_dispositivos_pkey PRIMARY KEY (id),
  CONSTRAINT hr_picagens_dispositivos_id_org_key UNIQUE (id, organization_id),

  CONSTRAINT hr_picagens_dispositivos_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,

  -- NO ACTION e nao SET NULL, pelo mesmo motivo de 20261120030000: apagar um
  -- local com dispositivos la nao se faz em silencio.
  CONSTRAINT hr_picagens_dispositivos_local_fkey
    FOREIGN KEY (local_id, organization_id)
    REFERENCES public.hr_locais_trabalho (id, organization_id) ON DELETE NO ACTION,

  CONSTRAINT hr_picagens_dispositivos_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_picagens_dispositivos_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_picagens_dispositivos_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT hr_picagens_dispositivos_codigo_nao_vazio CHECK (btrim(codigo) <> ''),
  CONSTRAINT hr_picagens_dispositivos_nome_nao_vazio   CHECK (btrim(nome) <> ''),

  CONSTRAINT hr_picagens_dispositivos_tipo_valido
    CHECK (tipo IN ('quiosque','leitor_biometrico','leitor_cartao','relogio_ponto','app_movel','web'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_picagens_dispositivos_org_codigo
  ON public.hr_picagens_dispositivos (organization_id, lower(btrim(codigo)))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hr_picagens_dispositivos_org_activo
  ON public.hr_picagens_dispositivos (organization_id, tipo)
  WHERE deleted_at IS NULL AND activo = true;

CREATE INDEX IF NOT EXISTS idx_hr_picagens_dispositivos_local
  ON public.hr_picagens_dispositivos (local_id)
  WHERE local_id IS NOT NULL;

COMMENT ON TABLE public.hr_picagens_dispositivos IS
'Catalogo de dispositivos de picagem por organizacao: quiosques, leitores, relogios de ponto, app.

Existe por duas razoes praticas: desligar um dispositivo comprometido sem apagar as picagens que ele produziu, e tornar a importacao idempotente -- a referencia externa de um evento e unica POR DISPOSITIVO, nao globalmente.

NAO valida geocercas nem autentica ninguem nesta ronda: guarda o dispositivo e o HASH da sua chave. O protocolo de registo, a app e o quiosque sao ronda propria.

PENDENCIA DE PRODUTO, a mesma de hr_locais_trabalho e hr_ausencias_tipos: sem pessoa_id, nao ha ramo de ficha-propria, e quem so tem hr.assiduidade.view.own ve a sua picagem e nao ve o NOME do dispositivo.';

COMMENT ON COLUMN public.hr_picagens_dispositivos.chave_registo_hash IS
'O HASH da chave de registo, nunca a chave. Um dispositivo perdido roda-se a chave (chave_rodada_em); uma base comprometida nao entrega credenciais de picagem a ninguem. O sufixo _hash esta no nome de proposito, para ninguem la por o segredo em claro por distraccao.';

-- ---- Triggers de padrao ----------------------------------------------------
DROP TRIGGER IF EXISTS trg_hr_picagens_dispositivos_updated_at ON public.hr_picagens_dispositivos;
CREATE TRIGGER trg_hr_picagens_dispositivos_updated_at
  BEFORE UPDATE ON public.hr_picagens_dispositivos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- Grants ----------------------------------------------------------------
REVOKE ALL ON TABLE public.hr_picagens_dispositivos FROM anon;
REVOKE ALL ON TABLE public.hr_picagens_dispositivos FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hr_picagens_dispositivos TO authenticated;
GRANT ALL ON TABLE public.hr_picagens_dispositivos TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.hr_picagens_dispositivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_picagens_dispositivos_select ON public.hr_picagens_dispositivos;
CREATE POLICY hr_picagens_dispositivos_select ON public.hr_picagens_dispositivos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.dispositivos.view', organization_id))
  );

DROP POLICY IF EXISTS hr_picagens_dispositivos_insert ON public.hr_picagens_dispositivos;
CREATE POLICY hr_picagens_dispositivos_insert ON public.hr_picagens_dispositivos
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.dispositivos.edit', organization_id))
  );

-- O USING sem deleted_at IS NULL, para se poder reverter o soft delete.
DROP POLICY IF EXISTS hr_picagens_dispositivos_update ON public.hr_picagens_dispositivos;
CREATE POLICY hr_picagens_dispositivos_update ON public.hr_picagens_dispositivos
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.dispositivos.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.dispositivos.edit', organization_id)));

DROP POLICY IF EXISTS hr_picagens_dispositivos_block_delete ON public.hr_picagens_dispositivos;
CREATE POLICY hr_picagens_dispositivos_block_delete ON public.hr_picagens_dispositivos
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY hr_picagens_dispositivos_block_delete ON public.hr_picagens_dispositivos IS
'Nao se apaga um dispositivo: ha picagens a apontar-lhe, e o registo de tempo de trabalho tem de ficar legivel cinco anos. Marca-se deleted_at, ou activo=false.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls       boolean;
  v_politicas integer;
BEGIN
  IF to_regclass('public.hr_picagens_dispositivos') IS NULL THEN
    RAISE EXCEPTION 'public.hr_picagens_dispositivos nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'hr_picagens_dispositivos';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A tabela ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'hr_picagens_dispositivos';
  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas, encontraram-se %.', v_politicas;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'hr_picagens_dispositivos'
       AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) LIKE '%get_user_visible_org_ids%'
  ) THEN
    RAISE EXCEPTION 'Alguma politica usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'hr_picagens_dispositivos'
       AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ 'has_anew_permission\([^_]'
  ) THEN
    RAISE EXCEPTION 'Alguma politica usa has_anew_permission (global) em vez de has_anew_permission_in_org.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'hr_picagens_dispositivos'
       AND policyname = 'hr_picagens_dispositivos_update'
       AND (qual IS NULL OR with_check IS NULL)
  ) THEN
    RAISE EXCEPTION 'A politica de UPDATE nao tem USING e WITH CHECK ambos escritos.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_picagens_dispositivos_id_org_key'
       AND conrelid = to_regclass('public.hr_picagens_dispositivos')
       AND cardinality(conkey) = 2
  ) THEN
    RAISE EXCEPTION
      'A unique (id, organization_id) nao ficou criada; a FK composta de pessoas_picagens.dispositivo_id depende dela.';
  END IF;

  RAISE NOTICE 'Conferido: hr_picagens_dispositivos com RLS e 4 politicas.';
END;
$conferir$;
