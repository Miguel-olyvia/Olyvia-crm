-- ==============================================================================
-- hr_cargos_periodos: o salario de um cargo passa a ter HISTORICO (desde quando
-- e ate quando vale cada valor), e nasce a permissao perigosa
-- hr.cargos.salario.alterar.
--
-- POR APLICAR. Esta migration so ACRESCENTA (tabela, funcoes, triggers,
-- permissao): sozinha nao parte nenhum ecra. Mas faz parte de um conjunto de
-- cinco (20261210100000 a 20261210140000) que vai TODO no mesmo push: se esta
-- fosse aplicada sem a 20261210130000, o ecra actual de editar cargo ainda
-- mudaria hr_cargos.salario_base sem deixar rasto nos periodos.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- hr_cargos guarda UM so salario_base por cargo (20261202070000). Mudar o
-- salario do cargo apaga o valor antigo: nao ha forma de saber que salario
-- tinha o cargo em Marco, nem de agendar uma subida para o mes que vem, nem de
-- atribuir um cargo a alguem com data passada usando o salario que o cargo
-- tinha nessa data.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Tabela hr_cargos_periodos: cada linha e um periodo [valido_de, valido_ate) em
-- que o cargo pagou um salario base numa periodicidade. valido_ate e
-- EXCLUSIVO (o dia em que o periodo seguinte comeca), como nas retribuicoes.
-- Um so periodo em aberto por cargo (indice unico parcial) e um trigger recusa
-- periodos que se cruzem. Ninguem escreve nesta tabela por acesso directo:
-- INSERT, UPDATE e DELETE de authenticated ficam recusados por politica
-- RESTRICTIVE; so as funcoes SECURITY DEFINER do modulo (a 20261210130000)
-- escrevem.
--
-- hr_cargo_salario_em(cargo, data) devolve o periodo que cobre a data. Antes
-- do primeiro periodo devolve o primeiro: o primeiro valor do cargo vale
-- "desde sempre", porque um cargo pode ser criado depois de alguem ja ter sido
-- admitido. E uma funcao INTERNA (so as funcoes definer a chamam): nao tem
-- EXECUTE para authenticated, para ninguem poder ler o salario de um cargo de
-- outra organizacao so por adivinhar o uuid. Os ecras leem a tabela, que tem
-- RLS.
--
-- Um trigger AFTER INSERT em hr_cargos abre o primeiro periodo de cada cargo
-- novo (valido_de = hoje), por isso o ecra actual de criar cargo continua a
-- funcionar sem mudar.
--
-- Backfill (idempotente): cada cargo que ainda nao tem periodos ganha um,
-- aberto, com o salario e a periodicidade que tem hoje e valido_de = a menor
-- das datas entre a criacao do cargo, a admissao mais antiga e o inicio da
-- retribuicao mais antiga de quem tem esse cargo. Assim nenhuma retribuicao ja
-- gravada fica "antes" do primeiro periodo do seu cargo.
--
-- hr.cargos.salario.alterar: permissao nova e PERIGOSA (muda o salario de todas
-- as pessoas com o cargo de uma so vez). Pendura em hr.pessoas.laborais.edit.
-- NAO e atribuida a papel nenhum por omissao.
--
-- NOTA D1 (decisao do Miguel, so para o branch): esta migration SO CRIA a
-- permissao, sem papel nenhum, em qualquer base. Para se poder testar no branch
-- de RH, a atribuicao ao papel super_admin vive num ficheiro a parte, FORA do
-- repositorio (pasta rh-push, 20261210150000), que aborta se a base tiver mais
-- do que uma organizacao. Aqui nao ha INSERT em anew_role_permissions nem se
-- desliga trigger nenhum.
--
--
-- -- SALARIOS SO A QUEM TEM hr.pessoas.retribuicao.view -------------------------
--
-- Quem tem so hr.pessoas.laborais.view ve o cargo de cada pessoa (pessoas.cargo_id,
-- pessoas_cargos). Se visse tambem o salario do cargo, ficava a saber o salario
-- de toda a gente. Por isso o SELECT de hr_cargos_periodos (que e quase so
-- salario) exige hr.pessoas.retribuicao.view. Quem so tem laborais.view le zero
-- linhas, sem erro. (As colunas salario_base e periodicidade de hr_cargos fecham
-- na 20261210130000.)
--
--
-- -- AUDITORIA ------------------------------------------------------------------
--
-- - hr_cargos_periodos ganha updated_at e updated_by (quem fechou ou corrigiu).
-- - hr_cargos_correcoes (nova, append-only): guarda o valor ANTIGO e quem mudou
--   quando o salario ou a periodicidade de um periodo e corrigido no proprio
--   periodo (corrigir uma subida agendada), por trigger. A mesma tabela guarda,
--   por trigger da 20261210110000, a correccao do cargo da admissao.
--   SELECT so com hr.pessoas.retribuicao.view.
-- - O created_by do primeiro periodo de um cargo novo vem de auth.uid() (o
--   utilizador da sessao), nunca de NEW.created_by, que o cliente escreve.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - hr_cargos.salario_base e periodicidade ficam como estao (passam a ser
--   cache do periodo mais recente na 20261210130000). Esta migration nao lhes
--   toca.
-- - Nao se toca em pessoas, pessoas_retribuicoes nem em nenhuma politica
--   existente.
-- - O trigger de igualdade salarial continua o de 20261202070000 (so muda na
--   20261210120000).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito (um .sql de reversao ao
-- lado seria aplicado pelo db push seguinte). A mao, e SO depois de reverter
-- 20261210110000 a 20261210140000, que dependem desta:
--   DROP TRIGGER IF EXISTS trg_hr_cargos_primeiro_periodo ON public.hr_cargos;
--   DROP FUNCTION IF EXISTS public.hr_cargos_criar_primeiro_periodo();
--   DROP TRIGGER IF EXISTS trg_hr_cargos_periodos_auditar_correccao ON public.hr_cargos_periodos;
--   DROP FUNCTION IF EXISTS public.hr_cargos_periodos_auditar_correccao();
--   DROP TABLE IF EXISTS public.hr_cargos_correcoes;
--   DROP FUNCTION IF EXISTS public.hr_cargo_salario_em(uuid, date);
--   DROP TABLE IF EXISTS public.hr_cargos_periodos;
--   DROP FUNCTION IF EXISTS public.hr_cargos_periodos_sem_sobreposicao();
--   DELETE FROM public.anew_role_permissions WHERE permission_code = 'hr.cargos.salario.alterar';
--   DELETE FROM public.anew_permissions WHERE code = 'hr.cargos.salario.alterar';
-- Apaga o historico de salarios dos cargos. Exportar antes.
--
--
-- Prerequisitos:
--   20261202070000  hr_cargos, pessoas.cargo_id
--   20261120060000  pessoas_retribuicoes
--   20261120020000  catalogo hr.pessoas.laborais.* e hr.pessoas.retribuicao.view
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.hr_cargos') IS NULL THEN
    RAISE EXCEPTION 'public.hr_cargos nao existe. Aplicar 20261202070000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'cargo_id'
  ) THEN
    RAISE EXCEPTION 'pessoas.cargo_id nao existe. Aplicar 20261202070000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_retribuicoes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_retribuicoes nao existe. Aplicar 20261120060000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    RAISE EXCEPTION 'public.update_updated_at_column() nao existe.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.laborais.view') THEN
    RAISE EXCEPTION 'hr.pessoas.laborais.view nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.laborais.edit') THEN
    RAISE EXCEPTION 'hr.pessoas.laborais.edit nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.retribuicao.view') THEN
    RAISE EXCEPTION 'hr.pessoas.retribuicao.view nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  -- Colisao de nome: se a tabela ja existe tem de ser a nossa.
  IF to_regclass('public.hr_cargos_periodos') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'hr_cargos_periodos_cargo_fkey'
         AND conrelid = to_regclass('public.hr_cargos_periodos')
    ) THEN
      RAISE EXCEPTION 'Ja existe public.hr_cargos_periodos sem a FK esperada -- colisao de nome. Investigar.';
    END IF;
    RAISE NOTICE 'public.hr_cargos_periodos ja existe; a migration e idempotente daqui para a frente.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- hr_cargos_periodos
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.hr_cargos_periodos (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  cargo_id         uuid NOT NULL,

  salario_base     numeric(12,2) NOT NULL,
  periodicidade    text NOT NULL,

  valido_de        date NOT NULL,
  valido_ate       date,
  motivo           text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid,

  CONSTRAINT hr_cargos_periodos_pkey PRIMARY KEY (id),

  -- FK COMPOSTA: um periodo nunca aponta para um cargo de outra organizacao.
  CONSTRAINT hr_cargos_periodos_cargo_fkey
    FOREIGN KEY (cargo_id, organization_id)
    REFERENCES public.hr_cargos (id, organization_id) ON DELETE NO ACTION,
  CONSTRAINT hr_cargos_periodos_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_cargos_periodos_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT hr_cargos_periodos_salario_nao_negativo CHECK (salario_base >= 0),
  CONSTRAINT hr_cargos_periodos_periodicidade_valida
    CHECK (periodicidade IN ('mensal', 'anual', 'hora')),
  CONSTRAINT hr_cargos_periodos_ate_depois_de
    CHECK (valido_ate IS NULL OR valido_ate > valido_de)
);

COMMENT ON TABLE public.hr_cargos_periodos IS
'Historico do salario base de cada cargo: cada linha e um periodo [valido_de, valido_ate) -- valido_ate EXCLUSIVO, o dia em que o periodo seguinte comeca -- com o salario e a periodicidade que o cargo pagou nesse periodo. Um so periodo em aberto por cargo. O salario de uma pessoa numa data e o salario do cargo que ela tinha nessa data, nessa data. Ninguem escreve por acesso directo (politicas RESTRICTIVE); so as funcoes definer do modulo. hr_cargos.salario_base e periodicidade passam a ser CACHE do periodo mais recente (20261210130000).';
COMMENT ON COLUMN public.hr_cargos_periodos.valido_ate IS
'EXCLUSIVO: o primeiro dia em que este periodo ja nao vale (o dia em que o seguinte comeca). NULL = periodo em aberto (o mais recente; pode ter comecado no futuro se a subida foi agendada).';

-- Idempotencia: se a tabela ja existia sem as colunas de auditoria.
ALTER TABLE public.hr_cargos_periodos ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.hr_cargos_periodos ADD COLUMN IF NOT EXISTS updated_by uuid;

COMMENT ON COLUMN public.hr_cargos_periodos.updated_by IS
'Quem fechou o periodo ou corrigiu o seu valor (anew_users.id), escrito pelas funcoes definer. O valor antigo de uma correccao fica em hr_cargos_correcoes.';

DROP TRIGGER IF EXISTS trg_hr_cargos_periodos_updated_at ON public.hr_cargos_periodos;
CREATE TRIGGER trg_hr_cargos_periodos_updated_at
  BEFORE UPDATE ON public.hr_cargos_periodos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_hr_cargos_periodos_cargo_periodo
  ON public.hr_cargos_periodos (cargo_id, valido_de DESC);
CREATE INDEX IF NOT EXISTS idx_hr_cargos_periodos_organization_id
  ON public.hr_cargos_periodos (organization_id);

-- Camada 1 da nao-sobreposicao: um so periodo em aberto por cargo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_cargos_periodos_aberto
  ON public.hr_cargos_periodos (cargo_id)
  WHERE valido_ate IS NULL;

-- ---- Camada 2: trigger de nao-sobreposicao ----------------------------------
-- SECURITY DEFINER pelo motivo ja documentado em 20261120060000: a verificacao
-- tem de ver TODAS as linhas, nao so as que a RLS de quem escreve deixa ver.
CREATE OR REPLACE FUNCTION public.hr_cargos_periodos_sem_sobreposicao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_conflito record;
BEGIN
  SELECT p.id, p.valido_de, p.valido_ate INTO v_conflito
    FROM public.hr_cargos_periodos p
   WHERE p.cargo_id = NEW.cargo_id
     AND p.id <> NEW.id
     AND daterange(p.valido_de, p.valido_ate, '[)')
         && daterange(NEW.valido_de, NEW.valido_ate, '[)')
   LIMIT 1;

  IF v_conflito.id IS NOT NULL THEN
    RAISE EXCEPTION
      'cargo_periodo_sobreposto: o periodo de % a % cruza-se com o periodo % (% a %). Fechar o anterior antes de abrir o novo.',
      NEW.valido_de, coalesce(NEW.valido_ate::text, 'sem fim'),
      v_conflito.id, v_conflito.valido_de, coalesce(v_conflito.valido_ate::text, 'sem fim')
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_cargos_periodos_sem_sobreposicao() IS
'Impede dois periodos do mesmo cargo com intervalos [valido_de, valido_ate) que se cruzem. Existe porque btree_gist nao esta instalado e nao ha constraint EXCLUDE possivel. SECURITY DEFINER para ver todas as linhas, independentemente da RLS de quem escreve.';

DROP TRIGGER IF EXISTS trg_hr_cargos_periodos_sem_sobreposicao ON public.hr_cargos_periodos;
CREATE TRIGGER trg_hr_cargos_periodos_sem_sobreposicao
  BEFORE INSERT OR UPDATE ON public.hr_cargos_periodos
  FOR EACH ROW EXECUTE FUNCTION public.hr_cargos_periodos_sem_sobreposicao();

-- ---- Grants e RLS ------------------------------------------------------------
REVOKE ALL ON TABLE public.hr_cargos_periodos FROM anon;
REVOKE ALL ON TABLE public.hr_cargos_periodos FROM authenticated;
GRANT SELECT ON TABLE public.hr_cargos_periodos TO authenticated;
GRANT ALL ON TABLE public.hr_cargos_periodos TO service_role;

ALTER TABLE public.hr_cargos_periodos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_cargos_periodos_select ON public.hr_cargos_periodos;
CREATE POLICY hr_cargos_periodos_select ON public.hr_cargos_periodos
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.retribuicao.view', organization_id)));

-- Molde de pessoas_vinculos_alteracoes: um registo que o proprio utilizador
-- possa escrever ou apagar nao e um registo.
DROP POLICY IF EXISTS hr_cargos_periodos_block_insert ON public.hr_cargos_periodos;
CREATE POLICY hr_cargos_periodos_block_insert ON public.hr_cargos_periodos
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS hr_cargos_periodos_block_update ON public.hr_cargos_periodos;
CREATE POLICY hr_cargos_periodos_block_update ON public.hr_cargos_periodos
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS hr_cargos_periodos_block_delete ON public.hr_cargos_periodos;
CREATE POLICY hr_cargos_periodos_block_delete ON public.hr_cargos_periodos
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY hr_cargos_periodos_select ON public.hr_cargos_periodos IS
'Ve os periodos quem tem hr.pessoas.retribuicao.view na organizacao: os periodos sao o salario de cada cargo, e quem so tem hr.pessoas.laborais.view (que ve o cargo de cada pessoa) ficaria a saber o salario de toda a gente. Sem a permissao a consulta devolve zero linhas, sem erro.';

-- ==============================================================================
-- hr_cargos_correcoes: o valor ANTIGO e quem mudou, quando um registo de cargo e
-- corrigido NO PROPRIO REGISTO (em vez de fechado e substituido por outro):
-- corrigir uma subida agendada (hr_cargos_periodos, aqui) e corrigir o cargo de
-- uma admissao futura (pessoas_cargos, 20261210110000). Append-only: so os
-- triggers definer escrevem. Os valores sao salarios: SELECT so com
-- hr.pessoas.retribuicao.view.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.hr_cargos_correcoes (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  tabela           text NOT NULL,
  registo_id       uuid NOT NULL,
  cargo_id         uuid,
  pessoa_id        uuid,
  valor_antigo     jsonb NOT NULL,
  valor_novo       jsonb NOT NULL,
  motivo           text,
  corrigido_por    uuid,
  corrigido_em     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_cargos_correcoes_pkey PRIMARY KEY (id),
  CONSTRAINT hr_cargos_correcoes_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE CASCADE,
  CONSTRAINT hr_cargos_correcoes_corrigido_por_fkey
    FOREIGN KEY (corrigido_por) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_cargos_correcoes_tabela_valida
    CHECK (tabela IN ('hr_cargos_periodos', 'pessoas_cargos'))
);

COMMENT ON TABLE public.hr_cargos_correcoes IS
'Historico das correccoes feitas no proprio registo de cargo: o valor antigo e o novo (jsonb), o motivo e quem corrigiu. Escrito por trigger quando o salario ou a periodicidade de um periodo de hr_cargos_periodos muda, e quando o cargo de uma linha de pessoas_cargos muda. Append-only (INSERT, UPDATE e DELETE de authenticated recusados); SELECT so com hr.pessoas.retribuicao.view, porque guarda salarios.';

CREATE INDEX IF NOT EXISTS idx_hr_cargos_correcoes_registo
  ON public.hr_cargos_correcoes (tabela, registo_id, corrigido_em DESC);
CREATE INDEX IF NOT EXISTS idx_hr_cargos_correcoes_organization_id
  ON public.hr_cargos_correcoes (organization_id);

REVOKE ALL ON TABLE public.hr_cargos_correcoes FROM anon;
REVOKE ALL ON TABLE public.hr_cargos_correcoes FROM authenticated;
GRANT SELECT ON TABLE public.hr_cargos_correcoes TO authenticated;
GRANT ALL ON TABLE public.hr_cargos_correcoes TO service_role;

ALTER TABLE public.hr_cargos_correcoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_cargos_correcoes_select ON public.hr_cargos_correcoes;
CREATE POLICY hr_cargos_correcoes_select ON public.hr_cargos_correcoes
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.retribuicao.view', organization_id)));

DROP POLICY IF EXISTS hr_cargos_correcoes_block_insert ON public.hr_cargos_correcoes;
CREATE POLICY hr_cargos_correcoes_block_insert ON public.hr_cargos_correcoes
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS hr_cargos_correcoes_block_update ON public.hr_cargos_correcoes;
CREATE POLICY hr_cargos_correcoes_block_update ON public.hr_cargos_correcoes
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS hr_cargos_correcoes_block_delete ON public.hr_cargos_correcoes;
CREATE POLICY hr_cargos_correcoes_block_delete ON public.hr_cargos_correcoes
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- Trigger de auditoria: so quando o SALARIO ou a PERIODICIDADE do periodo mudam
-- no proprio registo (fechar um periodo, que so mexe em valido_ate, nao conta).
-- Quem: updated_by (escrito pela funcao definer) ou, em falta, o utilizador da
-- sessao; sem sessao (migration, service_role) fica NULL.
CREATE OR REPLACE FUNCTION public.hr_cargos_periodos_auditar_correccao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_quem uuid := NEW.updated_by;
BEGIN
  IF v_quem IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT au.id INTO v_quem FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;
  END IF;

  INSERT INTO public.hr_cargos_correcoes
    (organization_id, tabela, registo_id, cargo_id, valor_antigo, valor_novo, motivo, corrigido_por)
  VALUES
    (NEW.organization_id, 'hr_cargos_periodos', NEW.id, NEW.cargo_id,
     jsonb_build_object('salario_base', OLD.salario_base, 'periodicidade', OLD.periodicidade,
                        'valido_de', OLD.valido_de, 'motivo', OLD.motivo),
     jsonb_build_object('salario_base', NEW.salario_base, 'periodicidade', NEW.periodicidade,
                        'valido_de', NEW.valido_de, 'motivo', NEW.motivo),
     NEW.motivo, v_quem);

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.hr_cargos_periodos_auditar_correccao() IS
'AFTER UPDATE em hr_cargos_periodos, so quando salario_base ou periodicidade mudam: grava em hr_cargos_correcoes o valor antigo, o novo, o motivo e quem corrigiu (updated_by, ou o utilizador da sessao).';

DROP TRIGGER IF EXISTS trg_hr_cargos_periodos_auditar_correccao ON public.hr_cargos_periodos;
CREATE TRIGGER trg_hr_cargos_periodos_auditar_correccao
  AFTER UPDATE OF salario_base, periodicidade ON public.hr_cargos_periodos
  FOR EACH ROW
  WHEN (OLD.salario_base IS DISTINCT FROM NEW.salario_base
        OR OLD.periodicidade IS DISTINCT FROM NEW.periodicidade)
  EXECUTE FUNCTION public.hr_cargos_periodos_auditar_correccao();

-- ==============================================================================
-- Backfill idempotente: um periodo em aberto por cada cargo que ainda nao tem
-- nenhum. valido_de = a menor data entre a criacao do cargo, a admissao mais
-- antiga e a retribuicao mais antiga de quem tem o cargo. (LEAST ignora NULL.)
-- Corre ANTES do trigger de criacao de cargos, para nao haver dois caminhos.
-- ==============================================================================
INSERT INTO public.hr_cargos_periodos
  (organization_id, cargo_id, salario_base, periodicidade, valido_de, motivo, created_by)
SELECT
  c.organization_id,
  c.id,
  c.salario_base,
  c.periodicidade,
  LEAST(
    c.created_at::date,
    (SELECT min(p.data_admissao)
       FROM public.pessoas p
      WHERE p.cargo_id = c.id AND p.organization_id = c.organization_id),
    (SELECT min(r.valido_de)
       FROM public.pessoas_retribuicoes r
       JOIN public.pessoas p ON p.id = r.pessoa_id AND p.organization_id = r.organization_id
      WHERE p.cargo_id = c.id AND r.organization_id = c.organization_id AND r.deleted_at IS NULL)
  ),
  'Valor inicial do cargo',
  c.created_by
FROM public.hr_cargos c
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_cargos_periodos x WHERE x.cargo_id = c.id
);

-- ==============================================================================
-- hr_cargo_salario_em: o periodo do cargo que cobre a data. Antes do primeiro
-- periodo devolve o primeiro. INTERNA: sem EXECUTE para authenticated.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_cargo_salario_em(p_cargo_id uuid, p_data date)
RETURNS TABLE (
  periodo_id    uuid,
  salario_base  numeric,
  periodicidade text,
  valido_de     date
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p.id, p.salario_base, p.periodicidade, p.valido_de
    FROM public.hr_cargos_periodos p
   WHERE p.cargo_id = p_cargo_id
   ORDER BY (p.valido_de <= p_data AND (p.valido_ate IS NULL OR p.valido_ate > p_data)) DESC,
            p.valido_de ASC
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.hr_cargo_salario_em(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_cargo_salario_em(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.hr_cargo_salario_em(uuid, date) FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_cargo_salario_em(uuid, date) FROM service_role;

COMMENT ON FUNCTION public.hr_cargo_salario_em(uuid, date) IS
'INTERNA (so as funcoes definer do modulo a chamam; ninguem mais tem EXECUTE, para nao deixar ler o salario de um cargo de outra organizacao por uuid). Devolve o periodo de hr_cargos_periodos que cobre a data (valido_ate exclusivo). Se a data for anterior ao primeiro periodo devolve o primeiro: o primeiro valor do cargo vale desde sempre, porque um cargo pode ser criado depois de alguem ja ter sido admitido. Sem linhas se o cargo nao tem periodos.';

-- ==============================================================================
-- Cargo novo -> primeiro periodo (valido_de = hoje). O ecra de criar cargo nao
-- muda. Criado DEPOIS do backfill.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_cargos_criar_primeiro_periodo()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_quem uuid;
BEGIN
  -- created_by: o utilizador da sessao, nunca NEW.created_by (que o cliente escreve).
  IF auth.uid() IS NOT NULL THEN
    SELECT au.id INTO v_quem FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;
  END IF;

  INSERT INTO public.hr_cargos_periodos
    (organization_id, cargo_id, salario_base, periodicidade, valido_de, motivo, created_by)
  VALUES
    (NEW.organization_id, NEW.id, NEW.salario_base, NEW.periodicidade, current_date,
     'Criacao do cargo', v_quem);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_cargos_criar_primeiro_periodo() IS
'AFTER INSERT em hr_cargos: abre o primeiro periodo do cargo novo (valido_de = hoje, motivo Criacao do cargo) com o salario e a periodicidade com que foi criado. created_by e o utilizador da sessao (auth.uid()), nunca NEW.created_by. Mantem o ecra actual de criar cargo a funcionar sem mudancas.';

DROP TRIGGER IF EXISTS trg_hr_cargos_primeiro_periodo ON public.hr_cargos;
CREATE TRIGGER trg_hr_cargos_primeiro_periodo
  AFTER INSERT ON public.hr_cargos
  FOR EACH ROW EXECUTE FUNCTION public.hr_cargos_criar_primeiro_periodo();

-- ==============================================================================
-- Permissao nova, molde exacto de 20261201040000 (hr.pessoas.retribuicao.corrigir):
-- perigosa, pendura em hr.pessoas.laborais.edit. NAO se atribui a papel nenhum
-- aqui (ver a NOTA D1 no cabecalho).
-- ==============================================================================
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.cargos.salario.alterar', 'Alterar salario do cargo',
   'PERIGOSA. Muda o salario base de um cargo -- e com isso o salario de TODAS as pessoas que tem esse cargo, de uma so vez, a partir da data escolhida (hoje ou futura, nunca passada). O historico do cargo guarda o valor antigo. Nao e atribuida a papel nenhum por omissao: atribui-se a quem decide salarios.',
   'hr', 'hr.pessoas.laborais.edit', 212, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- ==============================================================================
-- Conferir. Estrutura + dados reais (so leitura) + um teste fabricado, com
-- organizacao e cargo proprios, dentro de um bloco aninhado que TERMINA sempre
-- em HR900 (a subtransaccao desfaz tudo, com sucesso ou falha). WHEN OTHERS
-- nunca engole SQLSTATE/SQLERRM reais.
-- ==============================================================================
DO $conferir$
DECLARE
  v_rls       boolean;
  v_total     integer;
  v_selects   integer;
  v_restr     integer;
  v_cargos    bigint;
  v_abertos   bigint;
  v_desvios   bigint;
  v_antes     bigint;
  v_perm      record;
  v_atribuidos integer;
  v_qual      text;
BEGIN
  -- 1. Tabela, RLS e politicas: 1 SELECT permissiva + 3 RESTRICTIVE.
  IF to_regclass('public.hr_cargos_periodos') IS NULL THEN
    RAISE EXCEPTION 'public.hr_cargos_periodos nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'hr_cargos_periodos';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.hr_cargos_periodos ficou sem RLS activo.';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE cmd = 'SELECT' AND permissive = 'PERMISSIVE'),
         count(*) FILTER (WHERE permissive = 'RESTRICTIVE' AND cmd IN ('INSERT', 'UPDATE', 'DELETE'))
    INTO v_total, v_selects, v_restr
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'hr_cargos_periodos';
  IF v_total <> 4 OR v_selects <> 1 OR v_restr <> 3 THEN
    RAISE EXCEPTION 'hr_cargos_periodos devia ter 1 politica SELECT e 3 RESTRICTIVE (INSERT, UPDATE, DELETE); tem % no total, % SELECT, % RESTRICTIVE.',
      v_total, v_selects, v_restr;
  END IF;

  IF has_table_privilege('authenticated', 'public.hr_cargos_periodos', 'INSERT')
     OR has_table_privilege('authenticated', 'public.hr_cargos_periodos', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.hr_cargos_periodos', 'DELETE')
     OR has_table_privilege('anon', 'public.hr_cargos_periodos', 'SELECT') THEN
    RAISE EXCEPTION 'hr_cargos_periodos: authenticated so pode ter SELECT e anon nada.';
  END IF;

  -- O SELECT e o do salario: retribuicao.view, e nunca laborais.view.
  SELECT p.qual INTO v_qual
    FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'hr_cargos_periodos'
     AND p.policyname = 'hr_cargos_periodos_select';
  IF v_qual IS NULL
     OR position('hr.pessoas.retribuicao.view' IN v_qual) = 0
     OR position('laborais' IN v_qual) > 0 THEN
    RAISE EXCEPTION 'hr_cargos_periodos_select devia exigir hr.pessoas.retribuicao.view (e nao laborais.view): os periodos sao salarios.';
  END IF;

  -- Auditoria: colunas e tabela de correccoes.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hr_cargos_periodos' AND column_name = 'updated_by'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hr_cargos_periodos' AND column_name = 'updated_at'
  ) THEN
    RAISE EXCEPTION 'hr_cargos_periodos devia ter updated_at e updated_by.';
  END IF;

  IF to_regclass('public.hr_cargos_correcoes') IS NULL THEN
    RAISE EXCEPTION 'public.hr_cargos_correcoes nao ficou criada.';
  END IF;
  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'hr_cargos_correcoes';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.hr_cargos_correcoes ficou sem RLS activo.';
  END IF;
  SELECT count(*),
         count(*) FILTER (WHERE cmd = 'SELECT' AND permissive = 'PERMISSIVE'),
         count(*) FILTER (WHERE permissive = 'RESTRICTIVE' AND cmd IN ('INSERT', 'UPDATE', 'DELETE'))
    INTO v_total, v_selects, v_restr
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'hr_cargos_correcoes';
  IF v_total <> 4 OR v_selects <> 1 OR v_restr <> 3 THEN
    RAISE EXCEPTION 'hr_cargos_correcoes devia ter 1 politica SELECT e 3 RESTRICTIVE; tem % no total, % SELECT, % RESTRICTIVE.',
      v_total, v_selects, v_restr;
  END IF;
  IF has_table_privilege('authenticated', 'public.hr_cargos_correcoes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.hr_cargos_correcoes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.hr_cargos_correcoes', 'DELETE')
     OR has_table_privilege('anon', 'public.hr_cargos_correcoes', 'SELECT') THEN
    RAISE EXCEPTION 'hr_cargos_correcoes: authenticated so pode ter SELECT e anon nada.';
  END IF;

  -- 2. Funcoes: internas, sem EXECUTE para anon nem authenticated.
  IF to_regprocedure('public.hr_cargo_salario_em(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'hr_cargo_salario_em(uuid,date) nao ficou criada.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_cargo_salario_em(uuid,date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_cargo_salario_em(uuid,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_cargo_salario_em e interna: nao devia ser executavel por anon nem por authenticated.';
  END IF;

  -- 3. Backfill: um periodo aberto por cargo, com o valor que o cargo tem.
  SELECT count(*) INTO v_cargos FROM public.hr_cargos;
  SELECT count(*) INTO v_abertos FROM public.hr_cargos_periodos WHERE valido_ate IS NULL;
  IF v_cargos <> v_abertos THEN
    RAISE EXCEPTION 'Ha % cargos e % periodos em aberto: deviam ser iguais.', v_cargos, v_abertos;
  END IF;

  SELECT count(*) INTO v_desvios
    FROM public.hr_cargos c
    JOIN public.hr_cargos_periodos p ON p.cargo_id = c.id AND p.valido_ate IS NULL
   WHERE c.salario_base IS DISTINCT FROM p.salario_base
      OR c.periodicidade IS DISTINCT FROM p.periodicidade;
  IF v_desvios > 0 THEN
    RAISE EXCEPTION '% cargo(s) com salario ou periodicidade diferente do periodo em aberto.', v_desvios;
  END IF;

  -- Nenhuma pessoa foi admitida antes do primeiro periodo do cargo que tem.
  SELECT count(*) INTO v_antes
    FROM public.hr_cargos_periodos cp
   WHERE cp.motivo = 'Valor inicial do cargo'
     AND EXISTS (
       SELECT 1 FROM public.pessoas p
        WHERE p.cargo_id = cp.cargo_id AND p.data_admissao < cp.valido_de
     );
  IF v_antes > 0 THEN
    RAISE EXCEPTION '% periodo(s) iniciais comecam depois da admissao mais antiga de quem tem o cargo.', v_antes;
  END IF;

  -- 4. Permissao: no catalogo, perigosa, pendurada em laborais.edit.
  SELECT * INTO v_perm FROM public.anew_permissions WHERE code = 'hr.cargos.salario.alterar';
  IF v_perm.code IS NULL THEN
    RAISE EXCEPTION 'hr.cargos.salario.alterar nao ficou no catalogo.';
  END IF;
  IF v_perm.is_dangerous IS NOT TRUE THEN
    RAISE EXCEPTION 'hr.cargos.salario.alterar devia estar marcada is_dangerous.';
  END IF;
  IF v_perm.parent_code IS DISTINCT FROM 'hr.pessoas.laborais.edit' THEN
    RAISE EXCEPTION 'hr.cargos.salario.alterar devia pendurar em hr.pessoas.laborais.edit, pendura em %.', v_perm.parent_code;
  END IF;

  -- 5. D1: esta migration nao atribui a permissao a papel nenhum (no branch faz-o
  --    o ficheiro a parte, fora do repositorio, depois desta).
  SELECT count(*) INTO v_atribuidos
    FROM public.anew_role_permissions WHERE permission_code = 'hr.cargos.salario.alterar';
  IF v_atribuidos > 0 THEN
    RAISE EXCEPTION 'hr.cargos.salario.alterar ja esta atribuida a % papel(eis): esta migration devia deixa-la sem papel nenhum.', v_atribuidos;
  END IF;

  -- 6. Teste fabricado (organizacao e cargo proprios; nada da nike).
  DECLARE
    v_org    uuid;
    v_cargo  uuid;
    v_user   uuid;
    v_abertos_teste integer;
    v_n      integer;
    v_sal    record;
    v_hoje   date := current_date;
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('Teste migracao 20261210100000 (descartavel)')
    RETURNING id INTO v_org;

    -- Um utilizador real (so leitura) para provar que created_by NAO vem do cliente.
    SELECT au.id INTO v_user FROM public.anew_users au LIMIT 1;

    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade, created_by)
    VALUES (v_org, 'Cargo de teste 20261210100000', 1000, 'mensal', v_user)
    RETURNING id INTO v_cargo;

    -- O trigger de criacao abriu o primeiro periodo, com valido_de = hoje.
    SELECT count(*) INTO v_abertos_teste
      FROM public.hr_cargos_periodos WHERE cargo_id = v_cargo AND valido_ate IS NULL AND valido_de = v_hoje;
    IF v_abertos_teste <> 1 THEN
      RAISE EXCEPTION 'O trigger de criacao de cargo devia abrir 1 periodo com valido_de = hoje; abriu %.', v_abertos_teste
        USING ERRCODE = 'HR901';
    END IF;

    -- created_by do primeiro periodo: sem sessao (migration) e NULL, e nunca o do cargo.
    SELECT count(*) INTO v_n
      FROM public.hr_cargos_periodos WHERE cargo_id = v_cargo AND created_by IS NOT NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'O primeiro periodo nao devia herdar o created_by do cargo (so o utilizador da sessao).'
        USING ERRCODE = 'HR907';
    END IF;

    -- Antes do primeiro periodo: devolve o primeiro.
    SELECT * INTO v_sal FROM public.hr_cargo_salario_em(v_cargo, v_hoje - 400);
    IF v_sal.salario_base IS DISTINCT FROM 1000::numeric OR v_sal.valido_de IS DISTINCT FROM v_hoje THEN
      RAISE EXCEPTION 'hr_cargo_salario_em antes do primeiro periodo devia devolver o primeiro (1000 desde hoje); devolveu % desde %.',
        v_sal.salario_base, v_sal.valido_de
        USING ERRCODE = 'HR902';
    END IF;

    -- Fecha o periodo em hoje + 10 e abre o seguinte (1100) nessa data.
    UPDATE public.hr_cargos_periodos SET valido_ate = v_hoje + 10
     WHERE cargo_id = v_cargo AND valido_ate IS NULL;
    INSERT INTO public.hr_cargos_periodos
      (organization_id, cargo_id, salario_base, periodicidade, valido_de, motivo)
    VALUES (v_org, v_cargo, 1100, 'mensal', v_hoje + 10, 'teste');

    -- Fechar um periodo nao e uma correccao: nada em hr_cargos_correcoes.
    SELECT count(*) INTO v_n FROM public.hr_cargos_correcoes WHERE cargo_id = v_cargo;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Fechar um periodo nao devia escrever em hr_cargos_correcoes (escreveu %).', v_n
        USING ERRCODE = 'HR908';
    END IF;

    -- Dentro do primeiro periodo.
    SELECT * INTO v_sal FROM public.hr_cargo_salario_em(v_cargo, v_hoje + 9);
    IF v_sal.salario_base IS DISTINCT FROM 1000::numeric THEN
      RAISE EXCEPTION 'hr_cargo_salario_em dentro do primeiro periodo devia dar 1000, deu %.', v_sal.salario_base
        USING ERRCODE = 'HR903';
    END IF;

    -- Fronteira: valido_ate e exclusivo, no dia hoje + 10 ja vale o seguinte.
    SELECT * INTO v_sal FROM public.hr_cargo_salario_em(v_cargo, v_hoje + 10);
    IF v_sal.salario_base IS DISTINCT FROM 1100::numeric THEN
      RAISE EXCEPTION 'Na fronteira (valido_ate exclusivo) devia valer o periodo seguinte (1100), deu %.', v_sal.salario_base
        USING ERRCODE = 'HR904';
    END IF;

    -- Dois periodos em aberto no mesmo cargo: recusado (cruzamento ou indice unico).
    BEGIN
      INSERT INTO public.hr_cargos_periodos
        (organization_id, cargo_id, salario_base, periodicidade, valido_de, motivo)
      VALUES (v_org, v_cargo, 1200, 'mensal', v_hoje + 20, 'teste');
      RAISE EXCEPTION 'Um segundo periodo em aberto no mesmo cargo devia ter sido recusado.'
        USING ERRCODE = 'HR905';
    EXCEPTION
      WHEN unique_violation OR exclusion_violation THEN
        NULL;
    END;

    -- Periodo que se cruza com um fechado: recusado.
    BEGIN
      INSERT INTO public.hr_cargos_periodos
        (organization_id, cargo_id, salario_base, periodicidade, valido_de, valido_ate, motivo)
      VALUES (v_org, v_cargo, 900, 'mensal', v_hoje + 5, v_hoje + 8, 'teste');
      RAISE EXCEPTION 'Um periodo que se cruza com outro devia ter sido recusado.'
        USING ERRCODE = 'HR906';
    EXCEPTION
      WHEN exclusion_violation THEN
        NULL;
    END;

    -- Corrigir o valor no proprio periodo deixa o valor antigo em hr_cargos_correcoes.
    UPDATE public.hr_cargos_periodos SET salario_base = 1111
     WHERE cargo_id = v_cargo AND valido_de = v_hoje + 10;
    SELECT count(*) INTO v_n
      FROM public.hr_cargos_correcoes
     WHERE cargo_id = v_cargo AND tabela = 'hr_cargos_periodos'
       AND (valor_antigo ->> 'salario_base')::numeric = 1100
       AND (valor_novo ->> 'salario_base')::numeric = 1111;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Corrigir o salario de um periodo devia deixar 1 linha em hr_cargos_correcoes (1100 para 1111); ficaram %.', v_n
        USING ERRCODE = 'HR909';
    END IF;

    RAISE EXCEPTION 'teste_cargos_periodos_20261210100000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo o que o teste criou e desfeito pela subtransaccao
    WHEN OTHERS THEN
      RAISE EXCEPTION
        'Um dos testes ao vivo desta migration (hr_cargos_periodos) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE
    'OK: hr_cargos_periodos criada (RLS activo, SELECT so com retribuicao.view, 3 RESTRICTIVE), hr_cargos_correcoes criada (append-only), % cargos com 1 periodo aberto cada e o valor igual ao do cargo, hr_cargo_salario_em interna (antes, dentro e na fronteira confirmados), hr.cargos.salario.alterar perigosa e sem papel nenhum.',
    v_cargos;
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes: so podem estar
--    pendentes os cinco ficheiros do fluxo 2 (20261210100000 a 20261210140000).
-- 2. A base alvo e o BRANCH de RH (ref uetjghdkwbywbftedtth), nunca a base
--    partilhada sem autorizacao do Miguel.
-- 3. Backfill e conferir so leem as tabelas do RH; nada da Mudelar e tocado.
-- 4. A permissao hr.cargos.salario.alterar fica SEM papel. No branch, atribui-a
--    o ficheiro 20261210150000 (fora do repositorio, pasta rh-push), depois
--    destas cinco.
-- ==============================================================================
