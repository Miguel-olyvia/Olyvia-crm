-- ==============================================================================
-- Paises legiveis tambem por quem NAO tem sessao (a pagina publica do convite de
-- admissao).
--
-- O PROBLEMA: a unica politica de public.countries e 'viewable by authenticated
-- users' (TO authenticated). Quem preenche o convite abre /admissao/<codigo> sem
-- sessao, por isso o seletor de paises (Nacionalidade, Pais de naturalidade,
-- Pais da morada) recebia uma lista VAZIA e mostrava 'Nenhum pais encontrado',
-- sem forma de preencher campos obrigatorios.
--
-- A CORRECCAO: uma politica de LEITURA para o papel anon, so das linhas activas.
-- E um catalogo geografico publico: nao tem dados de pessoas nem de empresas.
-- Escrita continua fechada (nao ha politica de escrita para anon; o conferir
-- verifica-o).
--
-- PRECISA DO CODIGO NOVO NO MESMO COMMIT? Nao: o seletor ja le a tabela; a
-- politica so faz com que o resultado deixe de vir vazio no convite.
--
-- Quando o RH for publicado na base partilhada, a politica vai com ele: passa a
-- haver leitura anonima das linhas activas de countries.
-- ==============================================================================

DO $guardas$
BEGIN
  IF to_regclass('public.countries') IS NULL THEN
    RAISE EXCEPTION 'public.countries nao existe.';
  END IF;
END
$guardas$;

GRANT SELECT ON TABLE public.countries TO anon;

DROP POLICY IF EXISTS "Active countries are viewable by anon" ON public.countries;
CREATE POLICY "Active countries are viewable by anon"
  ON public.countries FOR SELECT TO anon
  USING (is_active IS TRUE);

DO $conferir$
DECLARE
  v_escrita text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'countries'
       AND policyname = 'Active countries are viewable by anon'
       AND cmd = 'SELECT' AND roles = '{anon}'
  ) THEN
    RAISE EXCEPTION 'CONFERIR: a politica de leitura anonima de countries nao ficou como esperado.';
  END IF;

  SELECT string_agg(policyname || ' (' || cmd::text || ')', ', ')
    INTO v_escrita
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'countries'
     AND cmd::text <> 'SELECT'
     AND ('anon' = ANY (roles::text[]) OR 'public' = ANY (roles::text[]));
  IF v_escrita IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: countries tem politicas de escrita abertas a anon ou public: %.', v_escrita;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.countries'::regclass) THEN
    RAISE EXCEPTION 'CONFERIR: o RLS de countries esta desligado (a leitura anonima abriria tudo, escrita incluida).';
  END IF;

  RAISE NOTICE 'OK: anon le so as linhas activas de countries, sem politicas de escrita, com o RLS ligado.';
END
$conferir$;
