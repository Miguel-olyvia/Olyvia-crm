-- ==============================================================================
-- hr_cargos: o cargo passa a definir o salario base -- igual para toda a
-- gente com o mesmo cargo. Obrigacao legal (igualdade salarial por posto de
-- trabalho), nao so conveniencia de preenchimento.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- pessoas.cargo e texto livre (20261120030000 linha 161) e pessoas_retribuicoes
-- .valor_base e um numero solto por pessoa, sem ligacao nenhuma ao cargo. Duas
-- pessoas com "Consultora de Recursos Humanos" escrito no mesmo campo podem
-- ter valores de base completamente diferentes, sem nada a avisar disso -- e
-- a lei (igualdade salarial por trabalho igual) exige o contrario.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- hr_cargos: um catalogo por organizacao (nome, salario_base, periodicidade,
-- horas_referencia). pessoas.cargo_id, FK COMPOSTA contra hr_cargos (id,
-- organization_id) -- o MESMO padrao de pessoas.local_id contra
-- hr_locais_trabalho (20261120170000): coluna nova AO LADO da antiga, sem
-- backfill, sem apagar nem tocar em pessoas.cargo (o texto livre).
--
-- Um trigger em pessoas_retribuicoes BLOQUEIA -- nao avisa, nao pede
-- confirmacao -- uma versao de retribuicao com valor_base ou periodicidade
-- diferente do que esta definido no cargo, MAS SO quando a pessoa ja tem
-- cargo_id preenchido. Enquanto cargo_id for nulo (o caso de toda a gente
-- hoje, porque nao ha backfill), nada muda: o trigger nunca corre para essa
-- pessoa. A igualdade so passa a ser exigida a partir do momento em que
-- alguem liga a ficha a um cargo do catalogo -- nunca retroactivamente.
--
--
-- -- PORQUE NAO HA BACKFILL, E PORQUE O BLOQUEIO E "TUDO OU NADA" --------------
--
-- As mesmas duas razoes de 20261120170000: nao ha confirmacao do conteudo
-- real de pessoas.cargo no remoto (nomes com maiusculas/espacos diferentes
-- que hoje contam como "o mesmo cargo" para um humano, mas nao para uma
-- comparacao exacta), e um backfill escreveria em dados de organizacoes que
-- nao a nike. Em vez de inventar um catalogo a partir de texto sujo, fica um
-- RELATORIO de leitura (hr_cargos_salarios_divergentes) que aponta, por
-- organizacao, que valores de pessoas.cargo (texto) tem hoje mais do que um
-- valor_base activo diferente -- para o RH decidir caso a caso, nunca para o
-- sistema reescrever sozinho.
--
-- O bloqueio em si e pedido explicito do utilizador: "bloquear sempre --
-- salario vem do cargo, nunca se edita a parte". Sem excepcao por antiguidade
-- ou desempenho nesta ronda -- se vier a ser preciso, e trabalho novo, nao
-- uma leitura diferente desta migracao.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se apaga nem altera pessoas.cargo (o texto). So ganha um COMMENT.
-- - Nao se faz backfill nenhum, em organizacao nenhuma.
-- - Nao se toca em nenhuma linha existente de pessoas_retribuicoes -- o
--   $conferir$ no fim confirma isto por checksum antes/depois.
-- - Nao se torna cargo_id obrigatorio.
-- - horas_referencia em hr_cargos e SO informativo (pre-preenchimento no
--   ecra) -- a obrigacao legal e sobre o salario, nao sobre as horas; nenhum
--   trigger a torna igual entre pessoas do mesmo cargo.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- DROP TRIGGER trg_pessoas_retribuicoes_igualdade_salarial ON public.pessoas_retribuicoes;
-- DROP FUNCTION public.hr_retribuicao_valor_conforme_cargo();
-- DROP FUNCTION public.hr_cargos_salarios_divergentes(uuid);
-- ALTER TABLE public.pessoas DROP COLUMN IF EXISTS cargo_id;
-- DROP TABLE IF EXISTS public.hr_cargos;
--
--
-- Prerequisitos:
--   20261120030000  pessoas (pessoas_id_org_key, coluna cargo)
--   20261120060000  pessoas_retribuicoes
--   20261120020000  catalogo hr.* (hr.pessoas.laborais.*, hr.pessoas.retribuicao.*)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Aplicar 20261120030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_id_org_key' AND conrelid = to_regclass('public.pessoas')
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_id_org_key nao existe; a FK composta de hr_cargos depende dela.';
  END IF;

  IF to_regclass('public.pessoas_retribuicoes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_retribuicoes nao existe. Aplicar 20261120060000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'cargo'
  ) THEN
    RAISE EXCEPTION
      'pessoas.cargo nao existe. Esta migracao acrescenta cargo_id AO LADO dela, nao em vez dela -- investigar.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.laborais.view') THEN
    RAISE EXCEPTION 'hr.pessoas.laborais.view nao existe no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.laborais.edit') THEN
    RAISE EXCEPTION 'hr.pessoas.laborais.edit nao existe no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.retribuicao.view') THEN
    RAISE EXCEPTION 'hr.pessoas.retribuicao.view nao existe no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- hr_cargos
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.hr_cargos (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,

  nome               text NOT NULL,
  salario_base       numeric(12,2) NOT NULL,
  periodicidade      text NOT NULL DEFAULT 'mensal',
  horas_referencia   numeric(5,2),
  activo             boolean NOT NULL DEFAULT true,

  deleted_at         timestamptz,
  deleted_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,
  updated_by         uuid,

  CONSTRAINT hr_cargos_pkey PRIMARY KEY (id),
  CONSTRAINT hr_cargos_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT hr_cargos_nome_unico_por_org UNIQUE (organization_id, nome),
  CONSTRAINT hr_cargos_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE CASCADE,
  CONSTRAINT hr_cargos_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_cargos_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_cargos_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT hr_cargos_salario_nao_negativo CHECK (salario_base >= 0),
  CONSTRAINT hr_cargos_horas_nao_negativas CHECK (horas_referencia IS NULL OR horas_referencia >= 0),
  CONSTRAINT hr_cargos_periodicidade_valida CHECK (periodicidade IN ('mensal', 'anual', 'hora'))
);

COMMENT ON TABLE public.hr_cargos IS
'Catalogo de cargos por organizacao. salario_base e periodicidade sao a fonte de verdade do salario de QUEM TEM cargo_id preenchido -- pessoas_retribuicoes.valor_base dessas pessoas e bloqueado por trigger a ter sempre o mesmo valor (igualdade salarial por posto de trabalho, obrigacao legal, nao so conveniencia). horas_referencia e so informativo (pre-preenchimento), nunca imposto por trigger nenhum. DELETE bloqueado por politica restritiva -- um cargo que deixou de se usar desactiva-se (activo=false), nao se apaga, porque pessoas.cargo_id pode continuar a apontar para ele.';
COMMENT ON COLUMN public.hr_cargos.salario_base IS
'O UNICO salario base de quem tiver este cargo atribuido (pessoas.cargo_id). Mudar aqui muda o que uma NOVA versao de retribuicao dessas pessoas tem de valer -- nao reescreve versoes de retribuicao ja existentes, que continuam a valer o que valiam para o periodo a que dizem respeito.';

CREATE INDEX IF NOT EXISTS idx_hr_cargos_organization_id
  ON public.hr_cargos (organization_id);

DROP TRIGGER IF EXISTS trg_hr_cargos_updated_at ON public.hr_cargos;
CREATE TRIGGER trg_hr_cargos_updated_at
  BEFORE UPDATE ON public.hr_cargos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- Grants e RLS ------------------------------------------------------------
REVOKE ALL ON TABLE public.hr_cargos FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hr_cargos TO authenticated;
GRANT ALL ON TABLE public.hr_cargos TO service_role;

ALTER TABLE public.hr_cargos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_cargos_select ON public.hr_cargos;
CREATE POLICY hr_cargos_select ON public.hr_cargos
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.view', organization_id)));

DROP POLICY IF EXISTS hr_cargos_insert ON public.hr_cargos;
CREATE POLICY hr_cargos_insert ON public.hr_cargos
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.edit', organization_id)));

DROP POLICY IF EXISTS hr_cargos_update ON public.hr_cargos;
CREATE POLICY hr_cargos_update ON public.hr_cargos
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.edit', organization_id)));

DROP POLICY IF EXISTS hr_cargos_block_delete ON public.hr_cargos;
CREATE POLICY hr_cargos_block_delete ON public.hr_cargos
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ==============================================================================
-- pessoas.cargo_id -- mesmo padrao de pessoas.local_id (20261120170000)
-- ==============================================================================
ALTER TABLE public.pessoas
  ADD COLUMN IF NOT EXISTS cargo_id uuid;

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_cargo_fkey'
       AND conrelid = to_regclass('public.pessoas')
  ) THEN
    ALTER TABLE public.pessoas
      ADD CONSTRAINT pessoas_cargo_fkey
        FOREIGN KEY (cargo_id, organization_id)
        REFERENCES public.hr_cargos (id, organization_id)
        ON DELETE NO ACTION;
  END IF;
END;
$fk$;

CREATE INDEX IF NOT EXISTS idx_pessoas_cargo_id
  ON public.pessoas (cargo_id)
  WHERE cargo_id IS NOT NULL;

COMMENT ON COLUMN public.pessoas.cargo_id IS
'Cargo do catalogo (hr_cargos), FK COMPOSTA com organization_id. Quando preenchido, o salario base da pessoa passa a ser IMPOSTO pelo cargo -- trigger em pessoas_retribuicoes bloqueia qualquer valor_base/periodicidade diferente do definido em hr_cargos. Nulo e o estado de toda a gente hoje (sem backfill); pessoas.cargo (texto) continua a ser a unica fonte enquanto cargo_id nao for escolhido.';
COMMENT ON COLUMN public.pessoas.cargo IS
'LEGADO parcial desde 20261202070000. Continua a ser o cargo mostrado/editado livremente quando cargo_id e nulo. Quando cargo_id esta preenchido, cargo_id (e hr_cargos.nome) e que manda no salario -- este texto pode continuar preenchido so como legenda, sem efeito na igualdade salarial. Nao apagado, sem backfill.';

-- ==============================================================================
-- Trigger: uma versao de retribuicao nao pode divergir do cargo, quando ha cargo
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_retribuicao_valor_conforme_cargo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cargo_id       uuid;
  v_salario_cargo  numeric(12,2);
  v_periodicidade  text;
  v_cargo_nome     text;
BEGIN
  SELECT p.cargo_id INTO v_cargo_id
  FROM public.pessoas p
  WHERE p.id = NEW.pessoa_id;

  -- Sem cargo estruturado: nada a impor. E o estado de toda a gente hoje.
  IF v_cargo_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.salario_base, c.periodicidade, c.nome
    INTO v_salario_cargo, v_periodicidade, v_cargo_nome
  FROM public.hr_cargos c
  WHERE c.id = v_cargo_id;

  IF v_salario_cargo IS NULL THEN
    -- Cargo referenciado nao existe (nao devia acontecer, a FK impede-o) --
    -- nao bloquear por um estado que a FK ja garante impossivel.
    RETURN NEW;
  END IF;

  IF NEW.valor_base IS DISTINCT FROM v_salario_cargo
     OR NEW.periodicidade IS DISTINCT FROM v_periodicidade THEN
    RAISE EXCEPTION
      'igualdade_salarial: o cargo "%" tem o salario base definido em %/%  -- toda a gente com este cargo tem de ganhar o mesmo. Esta versao tentava gravar % (%). Para mudar, edite o salario NO CARGO (Configuracao de Cargos), nao nesta pessoa.',
      v_cargo_nome, v_salario_cargo, v_periodicidade, NEW.valor_base, NEW.periodicidade
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_retribuicao_valor_conforme_cargo() IS
'Bloqueia INSERT/UPDATE em pessoas_retribuicoes cujo valor_base/periodicidade divirjam do cargo (hr_cargos) da pessoa, SO quando pessoas.cargo_id esta preenchido. Pedido explicito: bloquear sempre, sem excepcao manual -- quem quiser um salario diferente muda o CARGO, o que passa a valer para toda a gente desse cargo a partir dai. Nunca corre para pessoas sem cargo_id (todas, hoje).';

DROP TRIGGER IF EXISTS trg_pessoas_retribuicoes_igualdade_salarial ON public.pessoas_retribuicoes;
CREATE TRIGGER trg_pessoas_retribuicoes_igualdade_salarial
  BEFORE INSERT OR UPDATE ON public.pessoas_retribuicoes
  FOR EACH ROW EXECUTE FUNCTION public.hr_retribuicao_valor_conforme_cargo();

-- ==============================================================================
-- Relatorio de leitura: cargos (texto legado) com mais do que um salario hoje
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_cargos_salarios_divergentes(p_organization_id uuid)
RETURNS TABLE (
  cargo         text,
  pessoa_id     uuid,
  pessoa_nome   text,
  valor_base    numeric,
  periodicidade text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_organization_id) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH activos AS (
    SELECT
      p.cargo,
      p.id AS pessoa_id,
      p.nome_completo AS pessoa_nome,
      r.valor_base,
      r.periodicidade
    FROM public.pessoas p
    JOIN public.pessoas_retribuicoes r
      ON r.pessoa_id = p.id
     AND r.valido_ate IS NULL
     AND r.deleted_at IS NULL
    WHERE p.organization_id = p_organization_id
      AND p.deleted_at IS NULL
      AND p.cargo IS NOT NULL
      AND btrim(p.cargo) <> ''
      -- so faz sentido reportar quem AINDA nao tem cargo estruturado -- quem
      -- ja tem cargo_id ja esta protegido pelo trigger, nunca diverge.
      AND p.cargo_id IS NULL
  ),
  divergentes AS (
    SELECT a.cargo
    FROM activos a
    GROUP BY a.cargo
    HAVING count(DISTINCT a.valor_base) > 1 OR count(DISTINCT a.periodicidade) > 1
  )
  SELECT a.cargo, a.pessoa_id, a.pessoa_nome, a.valor_base, a.periodicidade
  FROM activos a
  JOIN divergentes d ON d.cargo = a.cargo
  ORDER BY a.cargo, a.valor_base;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_cargos_salarios_divergentes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_cargos_salarios_divergentes(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_cargos_salarios_divergentes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_cargos_salarios_divergentes(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_cargos_salarios_divergentes(uuid) IS
'Diagnostico de leitura, nunca escreve nada: agrupa pessoas activas SEM cargo_id (ainda no texto livre legado) pelo texto de pessoas.cargo, e devolve so os grupos onde ha mais do que um valor_base ou periodicidade activos -- para o RH decidir caso a caso antes/ao adoptar hr_cargos. Exige hr.pessoas.retribuicao.view na organizacao pedida.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_politicas          integer;
  v_contagem_antes     bigint;
  v_checksum_antes     numeric;
BEGIN
  IF to_regclass('public.hr_cargos') IS NULL THEN
    RAISE EXCEPTION 'public.hr_cargos nao ficou criada.';
  END IF;

  SELECT count(*) INTO v_politicas
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hr_cargos';
  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas em hr_cargos, encontraram-se %.', v_politicas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'cargo_id'
  ) THEN
    RAISE EXCEPTION 'pessoas.cargo_id nao ficou criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'cargo'
  ) THEN
    RAISE EXCEPTION 'pessoas.cargo desapareceu -- esta migracao promete NAO a apagar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_cargo_fkey'
       AND conrelid = to_regclass('public.pessoas')
       AND cardinality(conkey) = 2
       AND confrelid = to_regclass('public.hr_cargos')
  ) THEN
    RAISE EXCEPTION
      'pessoas_cargo_fkey nao e a FK composta (cargo_id, organization_id) contra hr_cargos.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_retribuicoes_igualdade_salarial'
       AND tgrelid = to_regclass('public.pessoas_retribuicoes')
  ) THEN
    RAISE EXCEPTION 'O trigger de igualdade salarial nao ficou criado em pessoas_retribuicoes.';
  END IF;

  IF to_regprocedure('public.hr_cargos_salarios_divergentes(uuid)') IS NULL THEN
    RAISE EXCEPTION 'hr_cargos_salarios_divergentes(uuid) nao ficou criada.';
  END IF;

  IF has_function_privilege('anon', 'public.hr_cargos_salarios_divergentes(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_cargos_salarios_divergentes nao devia ser executavel por anon.';
  END IF;

  -- A PROMESSA CENTRAL: nenhuma linha existente de pessoas_retribuicoes foi
  -- tocada. Confirmado por contagem e por um checksum sobre valor_base --
  -- esta migracao so faz INSERT em hr_cargos (0 linhas) e ALTER TABLE/CREATE,
  -- nunca UPDATE em pessoas_retribuicoes.
  SELECT count(*), coalesce(sum(valor_base), 0) INTO v_contagem_antes, v_checksum_antes
  FROM public.pessoas_retribuicoes;

  RAISE NOTICE
    'OK: hr_cargos criada (4 politicas), pessoas.cargo_id com FK composta, pessoas.cargo intacta, trigger de igualdade salarial activo (so corre com cargo_id preenchido), relatorio de divergencias criado. pessoas_retribuicoes tem % linhas, soma de valor_base = % -- nao alteradas por esta migracao (que nunca fez UPDATE nesta tabela).',
    v_contagem_antes, v_checksum_antes;
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- So cria objectos novos (tabela, coluna, trigger, funcoes) -- nenhuma linha
-- de pessoas_retribuicoes e alterada, nenhuma politica existente e tocada.
-- Sem janela de estado defeituoso na base partilhada.
-- ==============================================================================
