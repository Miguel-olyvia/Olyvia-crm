-- ==============================================================================
-- pessoas_cargos: o cargo de cada pessoa passa a ter HISTORICO (que cargo teve,
-- desde quando e ate quando), e passa a ser OBRIGATORIO em toda a ficha nova.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO NO MESMO COMMIT: o assistente de nova pessoa passa a
-- enviar cargo_id no INSERT (sem ele: HRC08) e a ficha deixa de gravar cargo_id
-- por savePessoa (mudar o valor por ai: HRC10). A partir daqui, qualquer bloco
-- conferir de uma migration FUTURA que fabrique pessoas tem de fabricar
-- primeiro um cargo activo e passar o cargo_id no INSERT em pessoas.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- pessoas.cargo_id e uma coluna simples: mudar o cargo de alguem apaga o
-- anterior, nao ha "que cargo tinha em Marco", e nada impede criar uma ficha
-- sem cargo -- mas o salario base so vem do cargo. Uma pessoa sem cargo nao
-- tem salario base.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Tabela pessoas_cargos, no molde de pessoas_afectacoes e de pessoas.local_id
-- (20261130060000): satelite versionado + coluna derivada.
--
--   - cada linha e um periodo [valido_de, valido_ate) em que a pessoa teve um
--     cargo; valido_ate EXCLUSIVO; um so periodo em aberto por pessoa; um
--     trigger recusa periodos que se cruzem. Sem lacunas: mudar de cargo e
--     fechar o aberto no dia D e abrir o novo nesse mesmo dia.
--   - pessoas.cargo_id passa a ser DERIVADO: e o cargo da linha em aberto. So o
--     trigger de sincronizacao o escreve (GUC de transaccao hr.sync_cargo_id,
--     como hr.sync_local_id). Um UPDATE directo de cargo_id e recusado
--     (HRC10); pessoa_cargo so se muda pela funcao propria (20261210120000).
--   - TODA a ficha nova tem cargo: um INSERT em pessoas sem cargo_id, ou com um
--     cargo apagado ou desactivado, e recusado (HRC08, HRC02, HRC09). Um
--     trigger AFTER INSERT cria logo a primeira linha do historico.
--   - Voltar a pessoas.cargo_id = NULL e recusado (HRC08). Um UPDATE que
--     reenvia o MESMO cargo_id passa (o ecra antigo reenvia-o sempre).
--
-- FICHAS ANTIGAS SEM CARGO: nao se tocam. Continuam editaveis (nome, email),
-- mantem a pendencia "cargo" e o bloqueio do primeiro acesso do fluxo 1, e
-- ganham cargo quando o RH lho atribuir (a funcao de mudar cargo trata
-- tambem esse caso). Nao ha NOT NULL nem CHECK ... NOT VALID: um CHECK NOT
-- VALID seria verificado em TODO o UPDATE de uma linha existente e deixaria
-- de se poder editar essas fichas (e o trigger que sincroniza local_id e a
-- submissao do convite rebentavam).
--
-- hr_pessoa_cargo_em(pessoa, data) devolve o cargo da linha que cobre a data,
-- ESTRITO: antes da primeira linha devolve NULL (uma ficha antiga que so
-- ganhou cargo hoje nao teve cargo antes). E INTERNA: sem EXECUTE para
-- authenticated (ninguem sonda o cargo de uma pessoa por uuid); os ecras leem a
-- tabela, que tem RLS.
--
-- Backfill (idempotente): cada pessoa com cargo_id e sem linhas ganha uma
-- linha em aberto com valido_de = a menor das datas entre a admissao (ou a
-- criacao da ficha, se nao tem admissao) e o inicio da retribuicao mais
-- antiga. Cobre as fichas semeadas do branch (a Joana fica com periodo desde a
-- admissao futura, coerente com a retribuicao dela). As fichas sem cargo NAO
-- ganham nada.
--
-- AUDITORIA: pessoas_cargos ganha updated_at e updated_by (quem fechou ou
-- corrigiu a linha). Corrigir o cargo de uma admissao futura (a funcao muda o
-- cargo da LINHA em vez de a fechar) deixa o cargo antigo e quem corrigiu em
-- hr_cargos_correcoes (20261210100000), por trigger. O created_by da primeira
-- linha de uma ficha nova vem de auth.uid() (o utilizador da sessao), nunca de
-- NEW.created_by, que o cliente escreve.
--
-- pessoas_cargos nao tem colunas de salario; o salario de cada cargo so se le
-- com hr.pessoas.retribuicao.view (hr_cargos_periodos, 20261210100000).
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nenhuma ficha antiga e alterada (nem apagada). So se criam linhas para
--   cargo_id que ja existiam.
-- - pessoas.cargo (o texto livre) e o trigger que o regista em
--   pessoas_vinculos_alteracoes ficam como estao.
-- - Corrigir a data de admissao depois de criada a ficha nao move a primeira
--   linha deste historico (fica por fazer; entretanto muda-se o cargo com a
--   data certa).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e SO depois de
-- reverter 20261210120000 a 20261210140000, que dependem desta:
--   DROP TRIGGER IF EXISTS trg_pessoas_cargo_primeira_linha ON public.pessoas;
--   DROP TRIGGER IF EXISTS trg_pessoas_cargo_guarda ON public.pessoas;
--   DROP FUNCTION IF EXISTS public.hr_pessoas_cargo_primeira_linha();
--   DROP FUNCTION IF EXISTS public.hr_pessoas_cargo_guarda();
--   DROP TRIGGER IF EXISTS trg_pessoas_cargos_auditar_correccao ON public.pessoas_cargos;
--   DROP FUNCTION IF EXISTS public.hr_pessoas_cargos_auditar_correccao();
--   DROP TABLE IF EXISTS public.pessoas_cargos;
--   DROP FUNCTION IF EXISTS public.hr_pessoa_cargo_em(uuid, date);
--   DROP FUNCTION IF EXISTS public.hr_pessoas_cargos_sincronizar();
--   DROP FUNCTION IF EXISTS public.hr_pessoas_cargos_sem_sobreposicao();
-- Apaga o historico de cargos; pessoas.cargo_id fica congelado.
--
--
-- Prerequisitos:
--   20261210100000  hr_cargos_periodos, hr_cargo_salario_em, hr_cargos_correcoes
--   20261202070000  hr_cargos, pessoas.cargo_id, pessoas_cargo_fkey
--   20261120090000  hr_pessoa_do_utilizador
--   20261120040000  hr_satelite_ancora_imutavel
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.hr_cargos_periodos') IS NULL
     OR to_regprocedure('public.hr_cargo_salario_em(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'hr_cargos_periodos ou hr_cargo_salario_em nao existem. Aplicar 20261210100000 primeiro.';
  END IF;

  IF to_regclass('public.hr_cargos_correcoes') IS NULL THEN
    RAISE EXCEPTION 'hr_cargos_correcoes nao existe. Aplicar 20261210100000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    RAISE EXCEPTION 'public.update_updated_at_column() nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'cargo_id'
  ) THEN
    RAISE EXCEPTION 'pessoas.cargo_id nao existe. Aplicar 20261202070000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_cargo_fkey' AND conrelid = to_regclass('public.pessoas')
  ) THEN
    RAISE EXCEPTION 'pessoas_cargo_fkey nao existe. Aplicar 20261202070000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_id_org_key' AND conrelid = to_regclass('public.pessoas')
  ) THEN
    RAISE EXCEPTION 'pessoas_id_org_key nao existe; a FK composta de pessoas_cargos depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'hr_pessoa_do_utilizador(uuid,uuid) nao existe. Aplicar 20261120090000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_satelite_ancora_imutavel'
  ) THEN
    RAISE EXCEPTION 'hr_satelite_ancora_imutavel() nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.laborais.view') THEN
    RAISE EXCEPTION 'hr.pessoas.laborais.view nao esta no catalogo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.view.own') THEN
    RAISE EXCEPTION 'hr.pessoas.view.own nao esta no catalogo.';
  END IF;

  -- Colisao de nome: se a tabela ja existe tem de ser a nossa.
  IF to_regclass('public.pessoas_cargos') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'pessoas_cargos_pessoa_fkey'
         AND conrelid = to_regclass('public.pessoas_cargos')
    ) THEN
      RAISE EXCEPTION 'Ja existe public.pessoas_cargos sem a FK esperada -- colisao de nome. Investigar.';
    END IF;
    RAISE NOTICE 'public.pessoas_cargos ja existe; a migration e idempotente daqui para a frente.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- pessoas_cargos
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_cargos (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  pessoa_id        uuid NOT NULL,
  cargo_id         uuid NOT NULL,

  valido_de        date NOT NULL,
  valido_ate       date,
  motivo           text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid,

  CONSTRAINT pessoas_cargos_pkey PRIMARY KEY (id),

  CONSTRAINT pessoas_cargos_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  -- FK COMPOSTA: uma linha nunca aponta para um cargo de outra organizacao.
  CONSTRAINT pessoas_cargos_cargo_fkey
    FOREIGN KEY (cargo_id, organization_id)
    REFERENCES public.hr_cargos (id, organization_id) ON DELETE NO ACTION,
  CONSTRAINT pessoas_cargos_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_cargos_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_cargos_ate_depois_de
    CHECK (valido_ate IS NULL OR valido_ate > valido_de)
);

COMMENT ON TABLE public.pessoas_cargos IS
'Historico do cargo de cada pessoa: cada linha e um periodo [valido_de, valido_ate) -- valido_ate EXCLUSIVO -- em que a pessoa teve esse cargo do catalogo (hr_cargos). Um so periodo em aberto por pessoa, sem lacunas (mudar de cargo = fechar o aberto no dia D e abrir o novo nesse dia). pessoas.cargo_id e DERIVADO da linha em aberto, mantido por trigger. Ninguem escreve por acesso directo (politicas RESTRICTIVE); so as funcoes definer do modulo. O salario base de cada periodo vem do cargo (hr_cargos_periodos), nao daqui.';
COMMENT ON COLUMN public.pessoas_cargos.valido_ate IS
'EXCLUSIVO: o primeiro dia em que a pessoa ja nao tem este cargo. NULL = o cargo actual (que pode so comecar no futuro, numa admissao futura).';

-- Idempotencia: se a tabela ja existia sem as colunas de auditoria.
ALTER TABLE public.pessoas_cargos ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.pessoas_cargos ADD COLUMN IF NOT EXISTS updated_by uuid;

COMMENT ON COLUMN public.pessoas_cargos.updated_by IS
'Quem fechou a linha ou corrigiu o seu cargo (anew_users.id), escrito pelas funcoes definer. O cargo antigo de uma correccao fica em hr_cargos_correcoes.';

DROP TRIGGER IF EXISTS trg_pessoas_cargos_updated_at ON public.pessoas_cargos;
CREATE TRIGGER trg_pessoas_cargos_updated_at
  BEFORE UPDATE ON public.pessoas_cargos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_pessoas_cargos_pessoa_periodo
  ON public.pessoas_cargos (pessoa_id, valido_de DESC);
CREATE INDEX IF NOT EXISTS idx_pessoas_cargos_cargo_id
  ON public.pessoas_cargos (cargo_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_cargos_organization_id
  ON public.pessoas_cargos (organization_id);

-- Camada 1 da nao-sobreposicao: um so cargo em aberto por pessoa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_cargos_aberta
  ON public.pessoas_cargos (pessoa_id)
  WHERE valido_ate IS NULL;

-- ---- Camada 2: trigger de nao-sobreposicao ----------------------------------
CREATE OR REPLACE FUNCTION public.hr_pessoas_cargos_sem_sobreposicao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_conflito record;
BEGIN
  SELECT c.id, c.valido_de, c.valido_ate INTO v_conflito
    FROM public.pessoas_cargos c
   WHERE c.pessoa_id = NEW.pessoa_id
     AND c.id <> NEW.id
     AND daterange(c.valido_de, c.valido_ate, '[)')
         && daterange(NEW.valido_de, NEW.valido_ate, '[)')
   LIMIT 1;

  IF v_conflito.id IS NOT NULL THEN
    RAISE EXCEPTION
      'pessoa_cargo_sobreposto: o periodo de % a % cruza-se com o periodo % (% a %). Fechar o cargo anterior antes de abrir o novo.',
      NEW.valido_de, coalesce(NEW.valido_ate::text, 'sem fim'),
      v_conflito.id, v_conflito.valido_de, coalesce(v_conflito.valido_ate::text, 'sem fim')
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_pessoas_cargos_sem_sobreposicao() IS
'Impede dois periodos de cargo da mesma pessoa com intervalos [valido_de, valido_ate) que se cruzem. SECURITY DEFINER para ver todas as linhas, independentemente da RLS de quem escreve.';

DROP TRIGGER IF EXISTS trg_pessoas_cargos_sem_sobreposicao ON public.pessoas_cargos;
CREATE TRIGGER trg_pessoas_cargos_sem_sobreposicao
  BEFORE INSERT OR UPDATE ON public.pessoas_cargos
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_cargos_sem_sobreposicao();

DROP TRIGGER IF EXISTS trg_pessoas_cargos_ancora ON public.pessoas_cargos;
CREATE TRIGGER trg_pessoas_cargos_ancora
  BEFORE UPDATE ON public.pessoas_cargos
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Auditoria: corrigir o cargo da propria linha ----------------------------------
-- So quando o CARGO da linha muda (corrigir o cargo de uma admissao futura);
-- fechar uma linha (valido_ate) nao conta. Quem: updated_by, ou o utilizador da
-- sessao; sem sessao (migration, service_role) fica NULL.
CREATE OR REPLACE FUNCTION public.hr_pessoas_cargos_auditar_correccao()
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
    (organization_id, tabela, registo_id, cargo_id, pessoa_id, valor_antigo, valor_novo, motivo, corrigido_por)
  VALUES
    (NEW.organization_id, 'pessoas_cargos', NEW.id, NEW.cargo_id, NEW.pessoa_id,
     jsonb_build_object('cargo_id', OLD.cargo_id, 'valido_de', OLD.valido_de, 'motivo', OLD.motivo),
     jsonb_build_object('cargo_id', NEW.cargo_id, 'valido_de', NEW.valido_de, 'motivo', NEW.motivo),
     NEW.motivo, v_quem);

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.hr_pessoas_cargos_auditar_correccao() IS
'AFTER UPDATE OF cargo_id em pessoas_cargos, so quando o cargo muda no proprio registo: grava em hr_cargos_correcoes o cargo antigo, o novo, o motivo e quem corrigiu (updated_by, ou o utilizador da sessao).';

DROP TRIGGER IF EXISTS trg_pessoas_cargos_auditar_correccao ON public.pessoas_cargos;
CREATE TRIGGER trg_pessoas_cargos_auditar_correccao
  AFTER UPDATE OF cargo_id ON public.pessoas_cargos
  FOR EACH ROW
  WHEN (OLD.cargo_id IS DISTINCT FROM NEW.cargo_id)
  EXECUTE FUNCTION public.hr_pessoas_cargos_auditar_correccao();

-- ---- Grants e RLS ------------------------------------------------------------
REVOKE ALL ON TABLE public.pessoas_cargos FROM anon;
REVOKE ALL ON TABLE public.pessoas_cargos FROM authenticated;
GRANT SELECT ON TABLE public.pessoas_cargos TO authenticated;
GRANT ALL ON TABLE public.pessoas_cargos TO service_role;

ALTER TABLE public.pessoas_cargos ENABLE ROW LEVEL SECURITY;

-- Ve quem tem hr.pessoas.laborais.view, ou a propria pessoa (molde de
-- pessoas_vinculos_alteracoes_select).
DROP POLICY IF EXISTS pessoas_cargos_select ON public.pessoas_cargos;
CREATE POLICY pessoas_cargos_select ON public.pessoas_cargos
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
      AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
    )
  );

DROP POLICY IF EXISTS pessoas_cargos_block_insert ON public.pessoas_cargos;
CREATE POLICY pessoas_cargos_block_insert ON public.pessoas_cargos
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_cargos_block_update ON public.pessoas_cargos;
CREATE POLICY pessoas_cargos_block_update ON public.pessoas_cargos
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_cargos_block_delete ON public.pessoas_cargos;
CREATE POLICY pessoas_cargos_block_delete ON public.pessoas_cargos
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_cargos_select ON public.pessoas_cargos IS
'Ve o historico de cargos quem tem hr.pessoas.laborais.view na organizacao, ou a propria pessoa (hr.pessoas.view.own e pessoa_id = a ficha ligada a sua conta).';

-- ==============================================================================
-- Backfill idempotente: uma linha em aberto por cada pessoa que tem cargo_id e
-- ainda nao tem linhas. valido_de = LEAST(admissao ou criacao da ficha, inicio
-- da retribuicao mais antiga). Corre ANTES dos triggers de pessoas abaixo.
-- As fichas sem cargo_id nao ganham nada.
-- ==============================================================================
INSERT INTO public.pessoas_cargos
  (organization_id, pessoa_id, cargo_id, valido_de, motivo)
SELECT
  p.organization_id,
  p.id,
  p.cargo_id,
  LEAST(
    COALESCE(p.data_admissao, p.created_at::date),
    (SELECT min(r.valido_de)
       FROM public.pessoas_retribuicoes r
      WHERE r.pessoa_id = p.id AND r.deleted_at IS NULL)
  ),
  'Cargo registado antes do historico de cargos'
FROM public.pessoas p
WHERE p.cargo_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.pessoas_cargos x WHERE x.pessoa_id = p.id
  );

-- ==============================================================================
-- hr_pessoa_cargo_em: o cargo da pessoa numa data. ESTRITO. INTERNA.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_pessoa_cargo_em(p_pessoa_id uuid, p_data date)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT c.cargo_id
    FROM public.pessoas_cargos c
   WHERE c.pessoa_id = p_pessoa_id
     AND c.valido_de <= p_data
     AND (c.valido_ate IS NULL OR c.valido_ate > p_data)
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.hr_pessoa_cargo_em(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_pessoa_cargo_em(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.hr_pessoa_cargo_em(uuid, date) FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_pessoa_cargo_em(uuid, date) FROM service_role;

COMMENT ON FUNCTION public.hr_pessoa_cargo_em(uuid, date) IS
'INTERNA (so as funcoes definer do modulo a chamam; ninguem mais tem EXECUTE). Devolve o cargo da linha de pessoas_cargos que cobre a data (valido_ate exclusivo). ESTRITO: antes da primeira linha devolve NULL -- uma ficha antiga que so ganhou cargo hoje nao teve cargo antes.';

-- ==============================================================================
-- Sincronizacao: pessoas.cargo_id = cargo da linha em aberto. So este trigger
-- escreve a coluna (GUC de transaccao hr.sync_cargo_id, molde de
-- hr.sync_local_id). Nao poe a coluna a NULL quando nao ha linha em aberto (o
-- instante entre fechar uma linha e abrir a seguinte): voltar a NULL nunca e
-- permitido.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_pessoas_cargos_sincronizar()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_novo uuid;
BEGIN
  SELECT c.cargo_id INTO v_novo
    FROM public.pessoas_cargos c
   WHERE c.pessoa_id = NEW.pessoa_id
     AND c.valido_ate IS NULL
   LIMIT 1;

  IF v_novo IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('hr.sync_cargo_id', 'on', true);
  UPDATE public.pessoas
     SET cargo_id = v_novo
   WHERE id = NEW.pessoa_id
     AND organization_id = NEW.organization_id
     AND cargo_id IS DISTINCT FROM v_novo;
  PERFORM set_config('hr.sync_cargo_id', 'off', true);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_pessoas_cargos_sincronizar() IS
'Mantem pessoas.cargo_id = cargo da linha em aberto de pessoas_cargos (so se for diferente). SECURITY DEFINER com GUC hr.sync_cargo_id: e o unico caminho autorizado a escrever pessoas.cargo_id -- ver hr_pessoas_cargo_guarda(). Nao poe cargo_id a NULL quando nao ha linha em aberto.';

DROP TRIGGER IF EXISTS trg_pessoas_cargos_sincronizar ON public.pessoas_cargos;
CREATE TRIGGER trg_pessoas_cargos_sincronizar
  AFTER INSERT OR UPDATE ON public.pessoas_cargos
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_cargos_sincronizar();

-- ==============================================================================
-- Guarda em pessoas: toda a ficha nova tem cargo; cargo_id so se muda pela via
-- propria. BEFORE INSERT OR UPDATE OF cargo_id.
-- SECURITY DEFINER: quem cria fichas pode nao ter hr.pessoas.laborais.view e a
-- RLS de hr_cargos esconderia o cargo (falso "cargo apagado").
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_pessoas_cargo_guarda()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_activo  boolean;
  v_apagado timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.cargo_id IS NULL THEN
      RAISE EXCEPTION 'cargo_obrigatorio: toda a pessoa nova tem de ter um cargo do catalogo. Escolher o cargo antes de criar a ficha.'
        USING ERRCODE = 'HRC08';
    END IF;

    SELECT c.activo, c.deleted_at INTO v_activo, v_apagado
      FROM public.hr_cargos c
     WHERE c.id = NEW.cargo_id AND c.organization_id = NEW.organization_id;

    IF NOT FOUND OR v_apagado IS NOT NULL THEN
      RAISE EXCEPTION 'cargo_nao_encontrado: o cargo escolhido nao existe nesta organizacao ou foi apagado.'
        USING ERRCODE = 'HRC02';
    END IF;

    IF v_activo IS NOT TRUE THEN
      RAISE EXCEPTION 'cargo_desactivado: o cargo escolhido esta desactivado. Escolher um cargo activo.'
        USING ERRCODE = 'HRC09';
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE OF cargo_id. O ecra antigo reenvia sempre cargo_id: inalterado passa.
  IF NEW.cargo_id IS NOT DISTINCT FROM OLD.cargo_id THEN
    RETURN NEW;
  END IF;

  IF NEW.cargo_id IS NULL THEN
    RAISE EXCEPTION 'cargo_obrigatorio: uma pessoa que ja tem cargo nao pode voltar a ficar sem cargo. Para mudar de cargo, escolher outro cargo.'
      USING ERRCODE = 'HRC08';
  END IF;

  IF coalesce(current_setting('hr.sync_cargo_id', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'cargo_so_por_rpc: pessoas.cargo_id passou a ser derivado do historico de cargos (pessoas_cargos). Nao se edita directamente -- usar a funcao de mudar o cargo da pessoa.'
      USING ERRCODE = 'HRC10';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_pessoas_cargo_guarda() IS
'BEFORE INSERT OR UPDATE OF cargo_id em pessoas. INSERT: exige cargo_id de um cargo do catalogo, da mesma organizacao, nao apagado (HRC02) e activo (HRC09); sem cargo: HRC08. UPDATE: cargo_id inalterado passa; passar a NULL e HRC08; mudar o valor sem a GUC hr.sync_cargo_id (so o trigger de pessoas_cargos a liga) e HRC10. Nao ha NOT NULL nem CHECK de proposito: tornariam as fichas antigas sem cargo nao editaveis.';

DROP TRIGGER IF EXISTS trg_pessoas_cargo_guarda ON public.pessoas;
CREATE TRIGGER trg_pessoas_cargo_guarda
  BEFORE INSERT OR UPDATE OF cargo_id ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_cargo_guarda();

-- ==============================================================================
-- Ficha nova -> primeira linha do historico (AFTER INSERT em pessoas).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_pessoas_cargo_primeira_linha()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_quem uuid;
BEGIN
  IF NEW.cargo_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- created_by: o utilizador da sessao, nunca NEW.created_by (que o cliente escreve).
  IF auth.uid() IS NOT NULL THEN
    SELECT au.id INTO v_quem FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;
  END IF;

  INSERT INTO public.pessoas_cargos
    (organization_id, pessoa_id, cargo_id, valido_de, motivo, created_by)
  VALUES
    (NEW.organization_id, NEW.id, NEW.cargo_id,
     COALESCE(NEW.data_admissao, current_date),
     'Cargo na criacao da ficha', v_quem);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_pessoas_cargo_primeira_linha() IS
'AFTER INSERT em pessoas: abre a primeira linha de pessoas_cargos (cargo_id da ficha, valido_de = data de admissao ou hoje; created_by = o utilizador da sessao, nunca NEW.created_by). Corrigir depois a data de admissao nao a move.';

DROP TRIGGER IF EXISTS trg_pessoas_cargo_primeira_linha ON public.pessoas;
CREATE TRIGGER trg_pessoas_cargo_primeira_linha
  AFTER INSERT ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_cargo_primeira_linha();

-- ==============================================================================
-- Conferir. Estrutura + dados reais (so leitura) + teste fabricado com
-- organizacao, cargos e pessoas proprios, dentro de um bloco aninhado que
-- TERMINA sempre em HR900. WHEN OTHERS nunca engole SQLSTATE/SQLERRM reais.
-- ==============================================================================
DO $conferir$
DECLARE
  v_rls        boolean;
  v_total      integer;
  v_selects    integer;
  v_restr      integer;
  v_sem_linha  bigint;
  v_sem_ficha  bigint;
  v_sem_cargo  bigint;
  v_antes      bigint;
  v_comuns     bigint;
  v_cols       integer;
BEGIN
  -- 1. RLS e politicas
  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_cargos';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.pessoas_cargos ficou sem RLS activo.';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE cmd = 'SELECT' AND permissive = 'PERMISSIVE'),
         count(*) FILTER (WHERE permissive = 'RESTRICTIVE' AND cmd IN ('INSERT', 'UPDATE', 'DELETE'))
    INTO v_total, v_selects, v_restr
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_cargos';
  IF v_total <> 4 OR v_selects <> 1 OR v_restr <> 3 THEN
    RAISE EXCEPTION 'pessoas_cargos devia ter 1 politica SELECT e 3 RESTRICTIVE; tem % no total, % SELECT, % RESTRICTIVE.',
      v_total, v_selects, v_restr;
  END IF;

  IF has_table_privilege('authenticated', 'public.pessoas_cargos', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pessoas_cargos', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pessoas_cargos', 'DELETE')
     OR has_table_privilege('anon', 'public.pessoas_cargos', 'SELECT') THEN
    RAISE EXCEPTION 'pessoas_cargos: authenticated so pode ter SELECT e anon nada.';
  END IF;

  -- 1b. Auditoria: colunas e trigger de correccao.
  SELECT count(*) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pessoas_cargos'
     AND column_name IN ('updated_at', 'updated_by');
  IF v_cols <> 2 THEN
    RAISE EXCEPTION 'pessoas_cargos devia ter updated_at e updated_by.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pessoas_cargos_auditar_correccao' AND tgrelid = to_regclass('public.pessoas_cargos')) THEN
    RAISE EXCEPTION 'Falta o trigger trg_pessoas_cargos_auditar_correccao.';
  END IF;

  -- 2. Funcao interna sem EXECUTE para anon nem authenticated
  IF to_regprocedure('public.hr_pessoa_cargo_em(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'hr_pessoa_cargo_em(uuid,date) nao ficou criada.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_pessoa_cargo_em(uuid,date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_pessoa_cargo_em(uuid,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_pessoa_cargo_em e interna: nao devia ser executavel por anon nem por authenticated.';
  END IF;

  -- 3. Triggers
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pessoas_cargo_guarda' AND tgrelid = to_regclass('public.pessoas'))
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pessoas_cargo_primeira_linha' AND tgrelid = to_regclass('public.pessoas'))
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pessoas_cargos_sincronizar' AND tgrelid = to_regclass('public.pessoas_cargos')) THEN
    RAISE EXCEPTION 'Faltam triggers: guarda e primeira linha em pessoas, sincronizacao em pessoas_cargos.';
  END IF;

  -- 4. Backfill: cada ficha com cargo_id tem exactamente a linha aberta com o
  --    mesmo cargo, e nenhuma linha aberta aponta para ficha sem esse cargo.
  SELECT count(*) INTO v_sem_linha
    FROM public.pessoas p
   WHERE p.cargo_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.pessoas_cargos c
        WHERE c.pessoa_id = p.id AND c.valido_ate IS NULL AND c.cargo_id = p.cargo_id
     );
  IF v_sem_linha > 0 THEN
    RAISE EXCEPTION '% ficha(s) com cargo_id sem a linha aberta correspondente em pessoas_cargos.', v_sem_linha;
  END IF;

  SELECT count(*) INTO v_sem_ficha
    FROM public.pessoas_cargos c
   WHERE c.valido_ate IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.pessoas p WHERE p.id = c.pessoa_id AND p.cargo_id = c.cargo_id
     );
  IF v_sem_ficha > 0 THEN
    RAISE EXCEPTION '% linha(s) abertas de pessoas_cargos cujo cargo nao e o da ficha.', v_sem_ficha;
  END IF;

  -- As fichas sem cargo continuam sem nada.
  SELECT count(*) INTO v_sem_cargo
    FROM public.pessoas p
   WHERE p.cargo_id IS NULL
     AND EXISTS (SELECT 1 FROM public.pessoas_cargos c WHERE c.pessoa_id = p.id);
  IF v_sem_cargo > 0 THEN
    RAISE EXCEPTION '% ficha(s) sem cargo_id ganharam linhas em pessoas_cargos: esta migration nao devia tocar-lhes.', v_sem_cargo;
  END IF;

  -- Nenhuma retribuicao comeca antes da primeira linha de cargo da pessoa.
  SELECT count(*) INTO v_antes
    FROM public.pessoas_retribuicoes r
   WHERE r.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM public.pessoas_cargos c WHERE c.pessoa_id = r.pessoa_id)
     AND r.valido_de < (SELECT min(c.valido_de) FROM public.pessoas_cargos c WHERE c.pessoa_id = r.pessoa_id);
  IF v_antes > 0 THEN
    RAISE EXCEPTION '% retribuicao(oes) comecam antes da primeira linha de cargo da pessoa; o trigger da 20261210120000 recusaria novas versoes nessas datas.', v_antes;
  END IF;

  SELECT count(*) INTO v_comuns
    FROM public.pessoas_cargos c WHERE c.valido_ate IS NULL;

  -- 5. Teste fabricado
  DECLARE
    v_org     uuid;
    v_a       uuid;
    v_b       uuid;
    v_c       uuid;
    v_d       uuid;
    v_pessoa  uuid;
    v_pessoa2 uuid;
    v_user    uuid;
    v_n       integer;
    v_cargo   uuid;
    v_hoje    date := current_date;
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('Teste migracao 20261210110000 (descartavel)')
    RETURNING id INTO v_org;

    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org, 'Cargo A 20261210110000', 1000, 'mensal') RETURNING id INTO v_a;
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade, activo)
    VALUES (v_org, 'Cargo B desactivado 20261210110000', 1000, 'mensal', false) RETURNING id INTO v_b;
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade, deleted_at)
    VALUES (v_org, 'Cargo C apagado 20261210110000', 1000, 'mensal', now()) RETURNING id INTO v_c;
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org, 'Cargo D 20261210110000', 1000, 'mensal') RETURNING id INTO v_d;

    -- INSERT sem cargo -> HRC08
    BEGIN
      INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
      VALUES (v_org, 'Teste', 'Sem cargo');
      RAISE EXCEPTION 'Um INSERT em pessoas sem cargo devia ter sido recusado.' USING ERRCODE = 'HR901';
    EXCEPTION
      WHEN SQLSTATE 'HRC08' THEN NULL;
    END;

    -- cargo desactivado -> HRC09
    BEGIN
      INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id)
      VALUES (v_org, 'Teste', 'Cargo desactivado', v_b);
      RAISE EXCEPTION 'Um INSERT em pessoas com cargo desactivado devia ter sido recusado.' USING ERRCODE = 'HR902';
    EXCEPTION
      WHEN SQLSTATE 'HRC09' THEN NULL;
    END;

    -- cargo apagado -> HRC02
    BEGIN
      INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id)
      VALUES (v_org, 'Teste', 'Cargo apagado', v_c);
      RAISE EXCEPTION 'Um INSERT em pessoas com cargo apagado devia ter sido recusado.' USING ERRCODE = 'HR903';
    EXCEPTION
      WHEN SQLSTATE 'HRC02' THEN NULL;
    END;

    -- com cargo: cria a linha do historico e o cargo_id fica igual. A ficha
    -- leva um created_by (um utilizador real, so leitura): a linha de
    -- pessoas_cargos NAO o herda -- sem sessao e NULL.
    SELECT au.id INTO v_user FROM public.anew_users au LIMIT 1;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao, created_by)
    VALUES (v_org, 'Teste', 'Com cargo', v_a, v_hoje - 30, v_user)
    RETURNING id INTO v_pessoa;

    SELECT count(*) INTO v_n
      FROM public.pessoas_cargos WHERE pessoa_id = v_pessoa AND created_by IS NOT NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'A primeira linha de pessoas_cargos nao devia herdar o created_by da ficha (so o utilizador da sessao).'
        USING ERRCODE = 'HR912';
    END IF;

    SELECT count(*) INTO v_n
      FROM public.pessoas_cargos
     WHERE pessoa_id = v_pessoa AND cargo_id = v_a AND valido_ate IS NULL AND valido_de = v_hoje - 30;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Criar a ficha com cargo devia abrir 1 linha em pessoas_cargos desde a admissao; abriu %.', v_n
        USING ERRCODE = 'HR904';
    END IF;

    -- UPDATE de outra coluna, e UPDATE com cargo_id inalterado, passam
    UPDATE public.pessoas SET notas = 'teste' WHERE id = v_pessoa;
    UPDATE public.pessoas SET cargo_id = cargo_id WHERE id = v_pessoa;

    -- UPDATE directo de cargo_id -> HRC10
    BEGIN
      UPDATE public.pessoas SET cargo_id = v_d WHERE id = v_pessoa;
      RAISE EXCEPTION 'Um UPDATE directo de pessoas.cargo_id devia ter sido recusado.' USING ERRCODE = 'HR905';
    EXCEPTION
      WHEN SQLSTATE 'HRC10' THEN NULL;
    END;

    -- para NULL -> HRC08
    BEGIN
      UPDATE public.pessoas SET cargo_id = NULL WHERE id = v_pessoa;
      RAISE EXCEPTION 'Passar pessoas.cargo_id a NULL devia ter sido recusado.' USING ERRCODE = 'HR906';
    EXCEPTION
      WHEN SQLSTATE 'HRC08' THEN NULL;
    END;

    -- hr_pessoa_cargo_em: antes (estrito), dentro
    IF public.hr_pessoa_cargo_em(v_pessoa, v_hoje - 31) IS NOT NULL THEN
      RAISE EXCEPTION 'hr_pessoa_cargo_em antes da primeira linha devia devolver NULL.' USING ERRCODE = 'HR907';
    END IF;
    IF public.hr_pessoa_cargo_em(v_pessoa, v_hoje) IS DISTINCT FROM v_a THEN
      RAISE EXCEPTION 'hr_pessoa_cargo_em dentro da primeira linha devia devolver o cargo A.' USING ERRCODE = 'HR908';
    END IF;

    -- Mudar de cargo no dia hoje - 10: fecha a aberta e abre a nova no mesmo dia
    UPDATE public.pessoas_cargos SET valido_ate = v_hoje - 10
     WHERE pessoa_id = v_pessoa AND valido_ate IS NULL;
    INSERT INTO public.pessoas_cargos (organization_id, pessoa_id, cargo_id, valido_de, motivo)
    VALUES (v_org, v_pessoa, v_d, v_hoje - 10, 'teste');

    SELECT p.cargo_id INTO v_cargo FROM public.pessoas p WHERE p.id = v_pessoa;
    IF v_cargo IS DISTINCT FROM v_d THEN
      RAISE EXCEPTION 'O trigger de sincronizacao devia ter posto pessoas.cargo_id = cargo D.' USING ERRCODE = 'HR909';
    END IF;

    -- Fronteira (valido_ate exclusivo): no dia hoje - 10 ja vale o cargo novo
    IF public.hr_pessoa_cargo_em(v_pessoa, v_hoje - 11) IS DISTINCT FROM v_a
       OR public.hr_pessoa_cargo_em(v_pessoa, v_hoje - 10) IS DISTINCT FROM v_d
       OR public.hr_pessoa_cargo_em(v_pessoa, v_hoje) IS DISTINCT FROM v_d THEN
      RAISE EXCEPTION 'hr_pessoa_cargo_em na fronteira: devia dar A no dia anterior e D a partir de hoje - 10.' USING ERRCODE = 'HR910';
    END IF;

    -- Duas linhas abertas na mesma pessoa -> recusado
    BEGIN
      INSERT INTO public.pessoas_cargos (organization_id, pessoa_id, cargo_id, valido_de, motivo)
      VALUES (v_org, v_pessoa, v_a, v_hoje + 5, 'teste');
      RAISE EXCEPTION 'Duas linhas abertas na mesma pessoa deviam ter sido recusadas.' USING ERRCODE = 'HR911';
    EXCEPTION
      WHEN unique_violation OR exclusion_violation THEN NULL;
    END;

    -- Fechar uma linha nao e uma correccao: nada em hr_cargos_correcoes ate aqui.
    SELECT count(*) INTO v_n FROM public.hr_cargos_correcoes WHERE pessoa_id = v_pessoa;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Fechar uma linha de cargo nao devia escrever em hr_cargos_correcoes (escreveu %).', v_n
        USING ERRCODE = 'HR913';
    END IF;

    -- Corrigir o cargo da propria linha (admissao futura) deixa o cargo antigo
    -- em hr_cargos_correcoes.
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org, 'Teste', 'Admissao futura', v_a, v_hoje + 10)
    RETURNING id INTO v_pessoa2;

    UPDATE public.pessoas_cargos SET cargo_id = v_d
     WHERE pessoa_id = v_pessoa2 AND valido_ate IS NULL;

    SELECT count(*) INTO v_n
      FROM public.hr_cargos_correcoes
     WHERE tabela = 'pessoas_cargos' AND pessoa_id = v_pessoa2
       AND valor_antigo ->> 'cargo_id' = v_a::text
       AND valor_novo ->> 'cargo_id' = v_d::text;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Corrigir o cargo de uma linha devia deixar 1 linha em hr_cargos_correcoes (A para D); ficaram %.', v_n
        USING ERRCODE = 'HR914';
    END IF;

    RAISE EXCEPTION 'teste_pessoas_cargos_20261210110000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo o que o teste criou e desfeito pela subtransaccao
    WHEN OTHERS THEN
      RAISE EXCEPTION
        'Um dos testes ao vivo desta migration (pessoas_cargos) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE
    'OK: pessoas_cargos criada (RLS activo, 1 SELECT e 3 RESTRICTIVE), % linha(s) em aberto, uma por ficha com cargo e com o mesmo cargo; fichas sem cargo intactas; guarda de pessoas.cargo_id (HRC08, HRC09, HRC02, HRC10) e hr_pessoa_cargo_em (antes, dentro, fronteira) confirmados com dados fabricados.',
    v_comuns;
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes: so podem estar
--    pendentes os cinco ficheiros do fluxo 2.
-- 2. Esta migration PARTE o assistente de nova pessoa e o botao de gravar o
--    cargo na ficha ate o codigo novo estar publicado (ver o cabecalho).
-- 3. Quando for para a base partilhada: criar ficha passa a exigir cargo do
--    catalogo na Mudelar tambem. Dizer ao Miguel e esperar autorizacao. Nenhum
--    dado existente e alterado (o backfill so cria linhas para cargo_id que
--    ja existem).
-- ==============================================================================
