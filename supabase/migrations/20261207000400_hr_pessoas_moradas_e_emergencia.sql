-- ==============================================================================
-- Moradas e contactos de emergencia da pessoa. Dois satelites com permissoes
-- proprias, deliberadamente SEPARADOS das moradas e contactos do CRM.
--
-- POR APLICAR. Ler o bloco "ANTES DO db push" no fim do ficheiro.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A morada de casa de um trabalhador e o telefone de quem avisar em caso de
-- acidente sao dados de RH. Nao ha onde os pousar: nao existe tabela de RH
-- nenhuma, e a tentacao obvia -- reutilizar anew_addresses /
-- anew_entity_addresses, anew_entity_emails e anew_entity_phones -- e um erro.
--
-- Primeiro, porque essas tabelas guardam o endereco COMERCIAL de uma entidade
-- de CRM (cliente, lead) e a RLS delas e de CRM: quem tem acesso a ficha do
-- cliente ve a morada da ficha do cliente. Pendurar la a morada de residencia
-- de um trabalhador poe-na ao alcance de quem trabalha em vendas.
--
-- Segundo, porque essas mesmas tabelas tem hoje um defeito conhecido de ambito
-- na escrita: anew_entity_emails e anew_entity_phones ganharam ambito de dono
-- no SELECT/UPDATE/DELETE em 20261119030000, mas o INSERT ficou so com filtro
-- de organizacao, e anew_entity_fiscal_entities nao tem ambito de dono em
-- operacao nenhuma. Sao achados reais e vao para o registo de trabalho -- mas
-- corrigi-los nao e desta ronda, e construir RH por cima deles seria herdar o
-- defeito.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Duas tabelas novas, no padrao comum dos satelites de RH:
--
--   pessoas_moradas               N:1, uma marcada como principal
--   pessoas_contactos_emergencia  N:1, ate cinco, ordenados
--
-- FK COMPOSTA (pessoa_id, organization_id) -> pessoas (id, organization_id),
-- que e o que permite as politicas filtrarem pela propria coluna
-- organization_id sem join nenhum a pessoas, e garante ao nivel da base que
-- uma morada nunca pende de uma pessoa de outra organizacao.
--
-- Quatro politicas por tabela, todas TO authenticated, todas com
-- has_anew_permission_in_org e com as funcoes embrulhadas em (SELECT ...) --
-- a regra de performance de 20261119120000:
--
--   pessoas_moradas               SELECT hr.pessoas.morada.view
--                                 INSERT/UPDATE hr.pessoas.morada.edit
--   pessoas_contactos_emergencia  SELECT hr.pessoas.emergencia.view
--                                 INSERT/UPDATE hr.pessoas.emergencia.edit
--
-- DELETE restritivo (false) nas duas. Nao e descuido: uma morada corrige-se
-- ou deixa de ser a principal; um contacto de emergencia substitui-se. Apagar
-- linhas de RH sem rasto e o que se quer evitar. Quem tiver mesmo de apagar
-- passa por service_role.
--
-- Uma so morada principal por pessoa, garantida por indice unico parcial
-- (WHERE is_principal) -- nao por trigger. A base e que conta, e um indice
-- parcial nao tem condicao de corrida.
--
--
-- -- ALCANCE -------------------------------------------------------------------
--
-- So cria objectos novos. NAO toca em anew_addresses, anew_entity_addresses,
-- anew_entity_emails, anew_entity_phones nem anew_entity_fiscal_entities.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - A clausula de ficha-propria (ver a minha morada, ver os meus contactos de
--   emergencia) entra em 20261120090000, por ALTER POLICY, e so no SELECT.
-- - Nao ha validacao de codigo postal por pais: um CHECK com o formato
--   portugues (NNNN-NNN) ficaria errado para trabalhadores estrangeiros. O
--   campo e texto livre, com o pais na coluna ao lado.
-- - Nao se atribui permissao nenhuma a papel nenhum.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito: um .sql de reversao
-- guardado ao lado e aplicado pelo db push seguinte. A mao:
--   DROP TABLE IF EXISTS public.pessoas_contactos_emergencia;
--   DROP TABLE IF EXISTS public.pessoas_moradas;
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120020000  catalogo hr.*
--   20261120030000  pessoas (e a unique pessoas_id_org_key)
--   20261120040000  hr_satelite_ancora_imutavel()
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Aplicar 20261120030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pessoas_id_org_key' AND conrelid = 'public.pessoas'::regclass
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_id_org_key nao existe; as FK compostas dos satelites dependem dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'public.has_anew_permission_in_org(uuid,text,uuid) nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_satelite_ancora_imutavel'
  ) THEN
    RAISE EXCEPTION 'public.hr_satelite_ancora_imutavel() nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.morada.view') THEN
    RAISE EXCEPTION 'A permissao hr.pessoas.morada.view nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.emergencia.view') THEN
    RAISE EXCEPTION 'A permissao hr.pessoas.emergencia.view nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- pessoas_moradas
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_moradas (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id        uuid NOT NULL,
  organization_id  uuid NOT NULL,

  tipo             text NOT NULL DEFAULT 'residencia',
  linha1           text NOT NULL,
  linha2           text,
  codigo_postal    text,
  localidade       text,
  distrito         text,
  pais             text NOT NULL DEFAULT 'PT',
  is_principal     boolean NOT NULL DEFAULT false,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_by       uuid,

  CONSTRAINT pessoas_moradas_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_moradas_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_moradas_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_moradas_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_moradas_tipo_valido
    CHECK (tipo IN ('residencia','fiscal','correspondencia')),
  CONSTRAINT pessoas_moradas_linha1_nao_vazia
    CHECK (btrim(linha1) <> ''),
  CONSTRAINT pessoas_moradas_pais_iso
    CHECK (pais ~ '^[A-Z]{2}$')
);

COMMENT ON TABLE public.pessoas_moradas IS
'Moradas da pessoa (residencia, fiscal, correspondencia). Deliberadamente separada de anew_addresses / anew_entity_addresses: essas guardam o endereco comercial de uma entidade de CRM e a RLS delas e de CRM. Misturar a morada de casa de um trabalhador com a morada de facturacao de um cliente e exactamente a fuga que este modulo existe para evitar.';
COMMENT ON COLUMN public.pessoas_moradas.codigo_postal IS
'Texto livre de proposito: um CHECK com o formato portugues (NNNN-NNN) ficaria errado para trabalhadores estrangeiros. O pais fica na coluna ao lado.';
COMMENT ON COLUMN public.pessoas_moradas.pais IS 'ISO 3166-1 alpha-2, em maiusculas.';

-- Uma so morada principal por pessoa. Indice parcial, nao trigger: a base e
-- que conta, e um indice parcial nao tem condicao de corrida.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_moradas_principal
  ON public.pessoas_moradas (pessoa_id) WHERE is_principal;

CREATE INDEX IF NOT EXISTS idx_pessoas_moradas_pessoa_id
  ON public.pessoas_moradas (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_moradas_organization_id
  ON public.pessoas_moradas (organization_id);

DROP TRIGGER IF EXISTS trg_pessoas_moradas_updated_at ON public.pessoas_moradas;
CREATE TRIGGER trg_pessoas_moradas_updated_at
  BEFORE UPDATE ON public.pessoas_moradas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_moradas_ancora ON public.pessoas_moradas;
CREATE TRIGGER trg_pessoas_moradas_ancora
  BEFORE UPDATE ON public.pessoas_moradas
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

REVOKE ALL ON TABLE public.pessoas_moradas FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_moradas TO authenticated;
GRANT ALL ON TABLE public.pessoas_moradas TO service_role;

ALTER TABLE public.pessoas_moradas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_moradas_select ON public.pessoas_moradas;
CREATE POLICY pessoas_moradas_select ON public.pessoas_moradas
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.morada.view', organization_id)));

DROP POLICY IF EXISTS pessoas_moradas_insert ON public.pessoas_moradas;
CREATE POLICY pessoas_moradas_insert ON public.pessoas_moradas
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.morada.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_moradas_update ON public.pessoas_moradas;
CREATE POLICY pessoas_moradas_update ON public.pessoas_moradas
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.morada.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.morada.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_moradas_block_delete ON public.pessoas_moradas;
CREATE POLICY pessoas_moradas_block_delete ON public.pessoas_moradas
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_moradas_select ON public.pessoas_moradas IS
'Ve as moradas quem tem hr.pessoas.morada.view NAQUELA organizacao. Sem membership activo na organizacao nao ha leitura, seja qual for o papel.';
COMMENT ON POLICY pessoas_moradas_block_delete ON public.pessoas_moradas IS
'Nao se apaga uma morada: corrige-se, ou deixa de ser a principal. Apagar linhas de RH sem rasto e o que se evita; quem tiver mesmo de apagar passa por service_role.';

-- ==============================================================================
-- pessoas_contactos_emergencia
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_contactos_emergencia (
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id             uuid NOT NULL,
  organization_id       uuid NOT NULL,

  nome                  text NOT NULL,
  relacao               text,
  telefone              text NOT NULL,
  telefone_alternativo  text,
  email                 text,
  ordem                 smallint NOT NULL DEFAULT 1,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  updated_by            uuid,

  CONSTRAINT pessoas_contactos_emergencia_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_contactos_emergencia_pessoa_ordem_unica UNIQUE (pessoa_id, ordem),
  CONSTRAINT pessoas_contactos_emergencia_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_contactos_emergencia_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_contactos_emergencia_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_contactos_emergencia_nome_nao_vazio
    CHECK (btrim(nome) <> ''),
  CONSTRAINT pessoas_contactos_emergencia_telefone_nao_vazio
    CHECK (btrim(telefone) <> ''),
  CONSTRAINT pessoas_contactos_emergencia_ordem_valida
    CHECK (ordem >= 1 AND ordem <= 5),
  CONSTRAINT pessoas_contactos_emergencia_email_formato
    CHECK (email IS NULL OR email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

COMMENT ON TABLE public.pessoas_contactos_emergencia IS
'Contactos a avisar em caso de acidente ou emergencia (ate cinco por pessoa, ordenados). Sao dados de terceiros -- familiares que nunca deram consentimento a esta aplicacao -- por isso vivem atras da sua propria permissao e nao dentro da ficha geral.';
COMMENT ON COLUMN public.pessoas_contactos_emergencia.ordem IS
'Ordem por que se tenta contactar (1 = primeiro). Unica por pessoa.';

CREATE INDEX IF NOT EXISTS idx_pessoas_contactos_emergencia_pessoa_id
  ON public.pessoas_contactos_emergencia (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_contactos_emergencia_organization_id
  ON public.pessoas_contactos_emergencia (organization_id);

DROP TRIGGER IF EXISTS trg_pessoas_contactos_emergencia_updated_at ON public.pessoas_contactos_emergencia;
CREATE TRIGGER trg_pessoas_contactos_emergencia_updated_at
  BEFORE UPDATE ON public.pessoas_contactos_emergencia
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_contactos_emergencia_ancora ON public.pessoas_contactos_emergencia;
CREATE TRIGGER trg_pessoas_contactos_emergencia_ancora
  BEFORE UPDATE ON public.pessoas_contactos_emergencia
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

REVOKE ALL ON TABLE public.pessoas_contactos_emergencia FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_contactos_emergencia TO authenticated;
GRANT ALL ON TABLE public.pessoas_contactos_emergencia TO service_role;

ALTER TABLE public.pessoas_contactos_emergencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_contactos_emergencia_select ON public.pessoas_contactos_emergencia;
CREATE POLICY pessoas_contactos_emergencia_select ON public.pessoas_contactos_emergencia
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.emergencia.view', organization_id)));

DROP POLICY IF EXISTS pessoas_contactos_emergencia_insert ON public.pessoas_contactos_emergencia;
CREATE POLICY pessoas_contactos_emergencia_insert ON public.pessoas_contactos_emergencia
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.emergencia.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_contactos_emergencia_update ON public.pessoas_contactos_emergencia;
CREATE POLICY pessoas_contactos_emergencia_update ON public.pessoas_contactos_emergencia
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.emergencia.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.emergencia.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_contactos_emergencia_block_delete ON public.pessoas_contactos_emergencia;
CREATE POLICY pessoas_contactos_emergencia_block_delete ON public.pessoas_contactos_emergencia
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_contactos_emergencia_select ON public.pessoas_contactos_emergencia IS
'Ve os contactos de emergencia quem tem hr.pessoas.emergencia.view NAQUELA organizacao.';
COMMENT ON POLICY pessoas_contactos_emergencia_block_delete ON public.pessoas_contactos_emergencia IS
'Um contacto de emergencia substitui-se, nao se apaga. Quem tiver mesmo de apagar passa por service_role.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  t text;
  v_rls boolean;
  v_politicas integer;
BEGIN
  FOREACH t IN ARRAY ARRAY['pessoas_moradas','pessoas_contactos_emergencia'] LOOP
    SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t;

    IF v_rls IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'public.% ficou sem RLS activo.', t;
    END IF;

    SELECT count(*) INTO v_politicas FROM pg_policies
    WHERE schemaname = 'public' AND tablename = t;

    IF v_politicas <> 4 THEN
      RAISE EXCEPTION 'Esperavam-se 4 politicas em public.%, encontraram-se %.', t, v_politicas;
    END IF;

    -- Nenhuma politica destas tabelas pode usar get_user_visible_org_ids, que
    -- alarga o alcance a organizacoes ascendentes, descendentes e associadas.
    -- Esta guarda e o que impede o defeito voltar por descuido numa ronda
    -- futura.
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%get_user_visible_org_ids%'
    ) THEN
      RAISE EXCEPTION 'Alguma politica de public.% usa get_user_visible_org_ids. Em RH isso nunca acontece.', t;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_pessoas_moradas_principal'
  ) THEN
    RAISE EXCEPTION 'O indice unico parcial da morada principal nao ficou criado.';
  END IF;

  RAISE NOTICE 'OK: pessoas_moradas e pessoas_contactos_emergencia criadas, RLS activo, 4 politicas cada, uma so morada principal por pessoa.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr "supabase migration list" e confirmar que nao ha nenhum timestamp
--    20261120* ja aplicado no remoto sem ficheiro local. Se colidir, renumerar
--    o bloco inteiro (20261120010000 .. 20261120090000) mantendo a ordem
--    relativa -- as migrations dependem umas das outras por esta ordem.
--
-- 2. Confirmar que 20261120010000 a 20261120040000 vao a frente desta na fila.
--
-- 3. So cria objectos novos. Nao altera tabela, politica nem funcao existente,
--    por isso nao ha janela em que a base partilhada fique num estado
--    defeituoso.
--
-- 4. Depois de aplicada, as duas tabelas ficam invisiveis para todos os
--    utilizadores da aplicacao ate alguem atribuir hr.pessoas.morada.view ou
--    hr.pessoas.emergencia.view a um papel. E o comportamento pretendido, nao
--    um defeito.
-- ==============================================================================
