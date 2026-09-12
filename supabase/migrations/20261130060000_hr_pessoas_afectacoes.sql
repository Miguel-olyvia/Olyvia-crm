-- ==============================================================================
-- pessoas_afectacoes: onde a pessoa trabalha, e desde quando. SEM HORAS.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Hoje so existe pessoas.local_id: um campo simples, sem datas, sem historico
-- e sem forma de dizer "esta pessoa esta afecta a DOIS centros ao mesmo tempo"
-- (o caso de quem reparte a semana entre duas lojas). E nao ha nenhum sitio a
-- registar DESDE QUANDO uma pessoa passou a trabalhar num centro, nem com que
-- confianca essa afectacao e conhecida -- declarada por RH, deduzida do
-- horario, ou apenas inferida porque nao ha mais nada.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Tabela satelite no molde comum (FK COMPOSTA (pessoa_id, organization_id),
-- soft delete, updated_at, ancora imutavel, 4 politicas RLS), com tres desvios
-- deliberados do molde de pessoas_retribuicoes:
--
-- 1. SEM HORAS. As horas por centro calculam-se do horario planeado/realizado.
--    Guardar horas aqui criaria uma segunda verdade -- exactamente o que este
--    modulo existe para evitar.
--
-- 2. NAO-SOBREPOSICAO POR CENTRO, nao por pessoa. Duas linhas do MESMO local
--    nao se podem cruzar no tempo; locais DIFERENTES podem correr em
--    paralelo -- e o requisito central desta tabela. O indice unico parcial e
--    o trigger de nao-sobreposicao sao chaveados por (pessoa_id, local_id), ao
--    contrario de pessoas_retribuicoes, que e por pessoa so.
--
-- 3. ORIGEM COM TRES GRAUS DE CONFIANCA: declarada (RH escreveu-a), do_horario
--    (deduzida de um bloco de horario existente), inferida (nao ha horario,
--    so pessoas.local_id). Confirmar uma afectacao (confirmada_por/
--    confirmada_em) NAO apaga a origem -- so marca que alguem a validou. Uma
--    afectacao 'inferida' confirmada continua 'inferida', com o registo de
--    quem a confirmou.
--
--
-- -- pessoas.local_id PASSA A SER DERIVADO -------------------------------------
--
-- A coluna MANTEM-SE (e lida pelo editor de horario, pela consolidacao de
-- picagens e pelas vistas de assiduidade), mas deixa de se escrever
-- directamente: passa a ser o local_id da afectacao em aberto da pessoa,
-- mantido por um trigger AFTER em pessoas_afectacoes, e um trigger BEFORE em
-- pessoas bloqueia qualquer UPDATE directo a local_id fora desse mecanismo
-- (guardado por um GUC de transaccao, hr.sync_local_id).
--
-- CRITERIO DE DESEMPATE, necessario porque VARIAS afectacoes podem estar em
-- aberto ao mesmo tempo (centros em paralelo): fica pessoas.local_id = local
-- da afectacao em aberto com o valido_de MAIS RECENTE (desempate por
-- created_at mais recente). E uma escolha de desempate, nao uma alteracao ao
-- desenho -- documentada aqui para quem vier a perguntar "porque este e nao
-- aquele quando ha dois em paralelo".
--
--
-- -- HORARIO EXIGE AFECTACAO: O LADO QUE FICA NESTA MIGRACAO -------------------
--
-- O invariante tem dois lados (ver 20261130100000 para o outro: um horario
-- novo exige afectacao que o cubra). Este lado fica AQUI: fechar ou encurtar
-- uma afectacao que ainda tenha blocos de horario planeado A FRENTE do novo
-- valido_ate (mesma pessoa, mesmo local_id) tem de FALHAR com erro nomeado
-- (afectacao_tem_horario_a_frente), nunca partir em silencio. O mesmo vale
-- para apagar (soft delete) uma afectacao com horario vivo a partir de hoje.
--
--
-- -- ALTERACAO != CORRECCAO, APLICADA AQUI -------------------------------------
--
-- hr.pessoas.afectacoes.edit ALTERA: fecha a versao em vigor (valido_ate IS
-- NULL ou >= hoje) e abre outra. hr.pessoas.afectacoes.corrigir CORRIGE: mexe
-- numa versao cujo periodo JA DECORREU (valido_ate < hoje). A politica de
-- INSERT/UPDATE distingue os dois pelo valido_ate da linha visada (USING
-- avalia a linha ANTIGA num UPDATE) -- ver a funcao partilhada
-- public.hr_periodo_decorrido(), criada aqui e reaproveitada por
-- pessoas_vinculos_horas e pessoas_colocacao_organograma.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se toca em pessoas.local_id como coluna (fica), so passa a ser
--   escrita so pelo trigger.
-- - Nao se semeia nada aqui: a derivacao a partir do horario existente e
--   20261130090000, DEPOIS desta tabela existir.
-- - O lado do invariante que verifica o horario NOVO contra a afectacao e
--   20261130100000, tambem depois.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e SO depois de
-- reverter 20261130090000 e 20261130100000, que dependem desta:
--   DROP TRIGGER IF EXISTS trg_pessoas_local_id_e_derivado ON public.pessoas;
--   DROP FUNCTION IF EXISTS public.hr_pessoas_local_id_e_derivado();
--   DROP TABLE IF EXISTS public.pessoas_afectacoes;
--   DROP FUNCTION IF EXISTS public.hr_afectacoes_sem_sobreposicao();
--   DROP FUNCTION IF EXISTS public.hr_afectacoes_manter_local_pessoa();
--   DROP FUNCTION IF EXISTS public.hr_afectacoes_nao_fechar_com_horario_a_frente();
--   DROP FUNCTION IF EXISTS public.hr_periodo_decorrido(date);
-- Isto apaga historico de afectacoes; pessoas.local_id fica congelado no
-- ultimo valor que tinha.
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120030000  pessoas, pessoas_id_org_key
--   20261120040000  hr_satelite_ancora_imutavel()
--   20261120060000  pessoas_vinculos, pessoas_vinculos_id_pessoa_org_key
--   20261120090000  hr_pessoa_do_utilizador()
--   20261120130000  hr_locais_trabalho, hr_locais_trabalho_id_org_key
--   20261120170000  pessoas.local_id
--   20261130050000  catalogo hr.pessoas.afectacoes.*
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_id_org_key' AND conrelid = to_regclass('public.pessoas')
  ) THEN
    RAISE EXCEPTION 'pessoas_id_org_key nao existe; a FK composta desta tabela depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'local_id'
  ) THEN
    RAISE EXCEPTION 'pessoas.local_id nao existe. Aplicar 20261120170000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_vinculos') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'pessoas_vinculos_id_pessoa_org_key'
          AND conrelid = to_regclass('public.pessoas_vinculos')
     ) THEN
    RAISE EXCEPTION 'pessoas_vinculos ou a sua unique (id, pessoa_id, organization_id) nao existem.';
  END IF;

  IF to_regclass('public.hr_locais_trabalho') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'hr_locais_trabalho_id_org_key'
          AND conrelid = to_regclass('public.hr_locais_trabalho')
     ) THEN
    RAISE EXCEPTION 'hr_locais_trabalho ou a sua unique (id, organization_id) nao existem.';
  END IF;

  IF to_regclass('public.pessoas_horario_planeado') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_horario_planeado nao existe -- o guarda de fecho desta migracao consulta-a.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid,text,uuid) nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'hr_pessoa_do_utilizador(uuid,uuid) nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_satelite_ancora_imutavel'
  ) THEN
    RAISE EXCEPTION 'hr_satelite_ancora_imutavel() nao existe.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.afectacoes.view') THEN
    RAISE EXCEPTION 'hr.pessoas.afectacoes.view nao esta no catalogo. Aplicar 20261130050000 primeiro.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.afectacoes.edit') THEN
    RAISE EXCEPTION 'hr.pessoas.afectacoes.edit nao esta no catalogo. Aplicar 20261130050000 primeiro.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.afectacoes.corrigir') THEN
    RAISE EXCEPTION 'hr.pessoas.afectacoes.corrigir nao esta no catalogo. Aplicar 20261130050000 primeiro.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.view.own') THEN
    RAISE EXCEPTION 'hr.pessoas.view.own nao esta no catalogo.';
  END IF;

  -- Colisao de nome.
  IF to_regclass('public.pessoas_afectacoes') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'pessoas_afectacoes_pessoa_fkey'
         AND conrelid = to_regclass('public.pessoas_afectacoes')
    ) THEN
      RAISE EXCEPTION 'Ja existe public.pessoas_afectacoes sem a FK esperada -- colisao de nome. Investigar.';
    END IF;
    RAISE NOTICE 'public.pessoas_afectacoes ja existe; a migracao e idempotente daqui para a frente.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- Funcao partilhada: uma versao esta "decorrida" (periodo ja acabou)?
-- Reaproveitada por esta tabela, pessoas_vinculos_horas e
-- pessoas_colocacao_organograma para distinguir ALTERACAO de CORRECCAO nas
-- politicas de INSERT/UPDATE.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_periodo_decorrido(_valido_ate date)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT _valido_ate IS NOT NULL AND _valido_ate < CURRENT_DATE
$$;

COMMENT ON FUNCTION public.hr_periodo_decorrido(date) IS
'true quando um valido_ate marca um periodo que ja terminou (antes de hoje). Usada nas politicas RLS de pessoas_afectacoes, pessoas_vinculos_horas e pessoas_colocacao_organograma para separar ALTERACAO (mexe no que esta em vigor ou no futuro; permissao .edit) de CORRECCAO (mexe no que ja decorreu; permissao .corrigir, perigosa). NULL ou valido_ate no futuro/hoje = nao decorrido = alteracao normal.';

-- ==============================================================================
-- pessoas_afectacoes
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_afectacoes (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id        uuid NOT NULL,
  organization_id  uuid NOT NULL,
  vinculo_id       uuid,
  local_id         uuid NOT NULL,

  valido_de        date NOT NULL,
  valido_ate       date,
  motivo           text,

  -- Tres graus de confianca. Confirmar NAO apaga a origem.
  origem           text NOT NULL DEFAULT 'declarada',
  confirmada_por   uuid,
  confirmada_em    timestamptz,

  deleted_at       timestamptz,
  deleted_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_by       uuid,

  CONSTRAINT pessoas_afectacoes_pkey PRIMARY KEY (id),

  CONSTRAINT pessoas_afectacoes_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,

  -- FK COMPOSTA de proposito, no molde de pessoas_retribuicoes: uma FK simples
  -- so contra pessoas_vinculos(id) nao impediria esta afectacao apontar para o
  -- vinculo de OUTRA pessoa da mesma organizacao.
  CONSTRAINT pessoas_afectacoes_vinculo_fkey
    FOREIGN KEY (vinculo_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_vinculos (id, pessoa_id, organization_id)
    ON DELETE SET NULL (vinculo_id),

  -- FK COMPOSTA contra hr_locais_trabalho: impede uma afectacao apontar para
  -- um local de outra organizacao. ON DELETE NO ACTION (locais nao se
  -- apagam, so se desactivam -- ver 20261120130000).
  CONSTRAINT pessoas_afectacoes_local_fkey
    FOREIGN KEY (local_id, organization_id)
    REFERENCES public.hr_locais_trabalho (id, organization_id) ON DELETE NO ACTION,

  CONSTRAINT pessoas_afectacoes_confirmada_por_fkey
    FOREIGN KEY (confirmada_por) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_afectacoes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_afectacoes_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_afectacoes_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_afectacoes_origem_valida
    CHECK (origem IN ('declarada', 'do_horario', 'inferida')),
  CONSTRAINT pessoas_afectacoes_ate_depois_de
    CHECK (valido_ate IS NULL OR valido_ate >= valido_de),
  -- Confirmacao coerente: as duas ou nenhuma.
  CONSTRAINT pessoas_afectacoes_confirmacao_coerente
    CHECK ((confirmada_por IS NULL) = (confirmada_em IS NULL))
);

COMMENT ON TABLE public.pessoas_afectacoes IS
'Onde a pessoa trabalha, e desde quando. SEM HORAS -- as horas por centro calculam-se do horario planeado/realizado; guarda-las aqui criaria uma segunda verdade. Nao-sobreposicao e POR CENTRO (pessoa_id, local_id): dois centros diferentes podem correr em paralelo, o mesmo centro nao se pode cruzar consigo proprio no tempo. origem tem tres graus (declarada, do_horario, inferida); confirmar (confirmada_por/confirmada_em) nao apaga a origem, so regista validacao humana.';

COMMENT ON COLUMN public.pessoas_afectacoes.local_id IS
'NOT NULL: uma afectacao sem centro nao diz nada. FK COMPOSTA (local_id, organization_id) contra hr_locais_trabalho -- impede apontar para um local de outra organizacao.';

COMMENT ON COLUMN public.pessoas_afectacoes.origem IS
'declarada = RH escreveu-a directamente. do_horario = deduzida de um bloco de horario planeado existente (ver 20261130090000, a semente). inferida = nao havia horario nenhum, so pessoas.local_id (o caso mais fraco). Confirmar uma afectacao NAO muda a origem.';

COMMENT ON COLUMN public.pessoas_afectacoes.confirmada_em IS
'Quando alguem validou esta afectacao como correcta. NULL = nunca confirmada. Preencher confirmada_por/confirmada_em nao muda origem nem motivo -- e um carimbo de validacao humana, independente de como a linha nasceu.';

CREATE INDEX IF NOT EXISTS idx_pessoas_afectacoes_pessoa_id
  ON public.pessoas_afectacoes (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_afectacoes_organization_id
  ON public.pessoas_afectacoes (organization_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_afectacoes_local_id
  ON public.pessoas_afectacoes (local_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_afectacoes_pessoa_local_periodo
  ON public.pessoas_afectacoes (pessoa_id, local_id, valido_de DESC);

-- Camada 1 da nao-sobreposicao POR CENTRO: uma so versao em aberto por
-- (pessoa, local). Diferente do molde de pessoas_retribuicoes (que e por
-- pessoa so): aqui DOIS locais podem estar em aberto ao mesmo tempo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_afectacoes_aberta_por_local
  ON public.pessoas_afectacoes (pessoa_id, local_id)
  WHERE valido_ate IS NULL AND deleted_at IS NULL;

-- ---- Camada 2: trigger de nao-sobreposicao, POR CENTRO ----------------------
-- SECURITY DEFINER pelo motivo ja documentado em 20261120060000: sob RLS de
-- invocador, quem tem afectacoes.edit sem afectacoes.view nao veria as linhas
-- existentes e a verificacao sairia vazia.
CREATE OR REPLACE FUNCTION public.hr_afectacoes_sem_sobreposicao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_conflito record;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.id, a.valido_de, a.valido_ate INTO v_conflito
    FROM public.pessoas_afectacoes a
   WHERE a.pessoa_id = NEW.pessoa_id
     AND a.local_id = NEW.local_id
     AND a.deleted_at IS NULL
     AND a.id <> NEW.id
     AND daterange(a.valido_de, a.valido_ate, '[)')
         && daterange(NEW.valido_de, NEW.valido_ate, '[)')
   LIMIT 1;

  IF v_conflito.id IS NOT NULL THEN
    RAISE EXCEPTION
      'afectacao_sobreposta: o intervalo % a % desta pessoa NESTE CENTRO cruza-se com a versao % (% a %). Fechar a versao anterior (valido_ate) antes de criar a nova. Centros DIFERENTES podem correr em paralelo -- o mesmo centro nao.',
      NEW.valido_de, coalesce(NEW.valido_ate::text, 'sem fim'),
      v_conflito.id, v_conflito.valido_de, coalesce(v_conflito.valido_ate::text, 'sem fim');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_afectacoes_sem_sobreposicao() IS
'Impede duas versoes vivas de afectacao da MESMA pessoa AO MESMO CENTRO com intervalos que se cruzem. Centros diferentes NAO colidem entre si -- e o requisito central desta tabela (afectacao simultanea a varios centros). SECURITY DEFINER pelo mesmo motivo que hr_retribuicoes_sem_sobreposicao.';

DROP TRIGGER IF EXISTS trg_pessoas_afectacoes_sem_sobreposicao ON public.pessoas_afectacoes;
CREATE TRIGGER trg_pessoas_afectacoes_sem_sobreposicao
  BEFORE INSERT OR UPDATE ON public.pessoas_afectacoes
  FOR EACH ROW EXECUTE FUNCTION public.hr_afectacoes_sem_sobreposicao();

-- ---- Guarda: nao fechar/encolher uma afectacao com horario vivo a frente ----
-- Lado B do invariante "horario exige afectacao" (o lado A, que valida o
-- HORARIO novo contra a afectacao, e 20261130100000). SECURITY DEFINER: teria
-- de ver pessoas_horario_planeado independentemente de quem edita ter
-- hr.pessoas.horario.view.
CREATE OR REPLACE FUNCTION public.hr_afectacoes_nao_fechar_com_horario_a_frente()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_corte date;
  v_qtd   bigint;
BEGIN
  -- So interessa quando se está a FECHAR ou ENCOLHER: valido_ate novo nao-nulo
  -- e (nao havia fim antes, ou o fim novo e mais cedo que o antigo). Reabrir
  -- (valido_ate novo NULL) ou alargar nunca precisa desta guarda.
  IF NEW.valido_ate IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.valido_ate IS NOT NULL AND NEW.valido_ate >= OLD.valido_ate THEN
    RETURN NEW;
  END IF;

  v_corte := NEW.valido_ate;

  SELECT count(*) INTO v_qtd
    FROM public.pessoas_horario_planeado h
   WHERE h.pessoa_id = NEW.pessoa_id
     AND h.local_id = NEW.local_id
     AND h.deleted_at IS NULL
     AND (
       (h.data IS NOT NULL AND h.data > v_corte)
       OR (h.dia_semana IS NOT NULL AND (h.valido_ate IS NULL OR h.valido_ate > v_corte))
     );

  IF v_qtd > 0 THEN
    RAISE EXCEPTION
      'afectacao_tem_horario_a_frente: ha % bloco(s) de horario planeado para esta pessoa neste centro depois de %. Aparar ou mover esses blocos antes de fechar/encolher a afectacao -- nao se faz em silencio.',
      v_qtd, v_corte;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_afectacoes_nao_fechar_com_horario_a_frente() IS
'Lado B do invariante horario<->afectacao: recusa fechar ou encolher (valido_ate) uma afectacao enquanto existirem blocos de pessoas_horario_planeado para a mesma pessoa e local depois do novo corte. Erro nomeado afectacao_tem_horario_a_frente -- o ecra trata de propor aparar; a base nunca parte em silencio.';

DROP TRIGGER IF EXISTS trg_pessoas_afectacoes_fecho_guardado ON public.pessoas_afectacoes;
CREATE TRIGGER trg_pessoas_afectacoes_fecho_guardado
  BEFORE UPDATE ON public.pessoas_afectacoes
  FOR EACH ROW EXECUTE FUNCTION public.hr_afectacoes_nao_fechar_com_horario_a_frente();

-- ---- Manter pessoas.local_id como valor derivado ----------------------------
-- AFTER INSERT/UPDATE em pessoas_afectacoes: recalcula pessoas.local_id como o
-- local_id da afectacao em aberto MAIS RECENTE (valido_de desc, created_at
-- desc a desempatar) para aquela pessoa. Se nao houver nenhuma em aberto,
-- local_id fica NULL -- ja era um valor legitimo antes desta migracao.
--
-- SECURITY DEFINER: quem edita afectacoes pode nao ter hr.pessoas.edit para
-- escrever directamente em pessoas. O GUC hr.sync_local_id autoriza o UPDATE
-- a passar pelo guarda de pessoas (ver a seguir) sem abrir a porta a outros.
CREATE OR REPLACE FUNCTION public.hr_afectacoes_manter_local_pessoa()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pessoa_id uuid;
  v_org_id    uuid;
  v_novo_local uuid;
BEGIN
  v_pessoa_id := coalesce(NEW.pessoa_id, OLD.pessoa_id);
  v_org_id    := coalesce(NEW.organization_id, OLD.organization_id);

  SELECT a.local_id INTO v_novo_local
    FROM public.pessoas_afectacoes a
   WHERE a.pessoa_id = v_pessoa_id
     AND a.deleted_at IS NULL
     AND a.valido_ate IS NULL
   ORDER BY a.valido_de DESC, a.created_at DESC
   LIMIT 1;

  PERFORM set_config('hr.sync_local_id', 'on', true);
  UPDATE public.pessoas
     SET local_id = v_novo_local
   WHERE id = v_pessoa_id
     AND organization_id = v_org_id
     AND local_id IS DISTINCT FROM v_novo_local;
  PERFORM set_config('hr.sync_local_id', 'off', true);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_afectacoes_manter_local_pessoa() IS
'Mantem pessoas.local_id = local_id da afectacao em aberto mais RECENTE da pessoa (valido_de desc, created_at desc a desempatar -- pode haver varias em aberto em centros diferentes ao mesmo tempo). NULL se nao houver nenhuma em aberto. SECURITY DEFINER com GUC hr.sync_local_id: e o unico caminho autorizado a escrever pessoas.local_id -- ver hr_pessoas_local_id_e_derivado().';

DROP TRIGGER IF EXISTS trg_pessoas_afectacoes_manter_local ON public.pessoas_afectacoes;
CREATE TRIGGER trg_pessoas_afectacoes_manter_local
  AFTER INSERT OR UPDATE ON public.pessoas_afectacoes
  FOR EACH ROW EXECUTE FUNCTION public.hr_afectacoes_manter_local_pessoa();

-- ---- Guarda em pessoas: local_id so se escreve pelo sync acima -------------
CREATE OR REPLACE FUNCTION public.hr_pessoas_local_id_e_derivado()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.local_id IS DISTINCT FROM OLD.local_id
     AND coalesce(current_setting('hr.sync_local_id', true), 'off') <> 'on' THEN
    RAISE EXCEPTION
      'pessoas_local_id_e_derivado: pessoas.local_id passou a ser derivado da afectacao em aberto (pessoas_afectacoes). Nao se edita directamente -- criar, fechar ou corrigir uma linha em pessoas_afectacoes.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_pessoas_local_id_e_derivado() IS
'Bloqueia UPDATE directo a pessoas.local_id fora do trigger de sincronizacao de pessoas_afectacoes (hr_afectacoes_manter_local_pessoa, que usa o GUC de transaccao hr.sync_local_id para se autorizar). Sem isto, um UPDATE directo criaria uma segunda verdade sobre onde a pessoa trabalha.';

DROP TRIGGER IF EXISTS trg_pessoas_local_id_e_derivado ON public.pessoas;
CREATE TRIGGER trg_pessoas_local_id_e_derivado
  BEFORE UPDATE OF local_id ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_local_id_e_derivado();

-- ---- Triggers de padrao ------------------------------------------------------
DROP TRIGGER IF EXISTS trg_pessoas_afectacoes_updated_at ON public.pessoas_afectacoes;
CREATE TRIGGER trg_pessoas_afectacoes_updated_at
  BEFORE UPDATE ON public.pessoas_afectacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_afectacoes_ancora ON public.pessoas_afectacoes;
CREATE TRIGGER trg_pessoas_afectacoes_ancora
  BEFORE UPDATE ON public.pessoas_afectacoes
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Grants -------------------------------------------------------------------
REVOKE ALL ON TABLE public.pessoas_afectacoes FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_afectacoes TO authenticated;
GRANT ALL ON TABLE public.pessoas_afectacoes TO service_role;

-- ---- RLS ------------------------------------------------------------------
ALTER TABLE public.pessoas_afectacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_afectacoes_select ON public.pessoas_afectacoes;
CREATE POLICY pessoas_afectacoes_select ON public.pessoas_afectacoes
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.afectacoes.view', organization_id))
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
        AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
      )
    )
  );

-- ALTERACAO vs CORRECCAO: o USING avalia a linha ANTIGA num UPDATE, por isso e
-- ai que se decide qual permissao se aplica a esta linha em concreto.
DROP POLICY IF EXISTS pessoas_afectacoes_insert ON public.pessoas_afectacoes;
CREATE POLICY pessoas_afectacoes_insert ON public.pessoas_afectacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (
      (
        NOT public.hr_periodo_decorrido(valido_ate)
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.afectacoes.edit', organization_id))
      )
      OR (
        public.hr_periodo_decorrido(valido_ate)
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.afectacoes.corrigir', organization_id))
      )
    )
  );

DROP POLICY IF EXISTS pessoas_afectacoes_update ON public.pessoas_afectacoes;
CREATE POLICY pessoas_afectacoes_update ON public.pessoas_afectacoes
  FOR UPDATE TO authenticated
  USING (
    (
      NOT public.hr_periodo_decorrido(valido_ate)
      AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.afectacoes.edit', organization_id))
    )
    OR (
      public.hr_periodo_decorrido(valido_ate)
      AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.afectacoes.corrigir', organization_id))
    )
  )
  WITH CHECK (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.afectacoes.edit', organization_id))
    OR (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.afectacoes.corrigir', organization_id))
  );

DROP POLICY IF EXISTS pessoas_afectacoes_block_delete ON public.pessoas_afectacoes;
CREATE POLICY pessoas_afectacoes_block_delete ON public.pessoas_afectacoes
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_afectacoes_insert ON public.pessoas_afectacoes IS
'ALTERACAO (hr.pessoas.afectacoes.edit): a linha nao decorreu (valido_ate NULL, hoje, ou futuro). CORRECCAO (hr.pessoas.afectacoes.corrigir, perigosa): a linha ja decorreu (valido_ate no passado) -- inserir uma versao puramente historica.';
COMMENT ON POLICY pessoas_afectacoes_update ON public.pessoas_afectacoes IS
'O USING decide pela linha ANTIGA: se ainda nao decorreu, exige .edit (ALTERACAO); se ja decorreu, exige .corrigir (CORRECCAO, perigosa). O WITH CHECK so confirma que quem escreve tem alguma das duas -- a linha antiga ja fez a triagem fina. Um periodo ja decorrido nao se altera por via normal, so por correccao.';

-- ---- Conferir ----------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls       boolean;
  v_politicas integer;
BEGIN
  IF to_regclass('public.pessoas_afectacoes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_afectacoes nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_afectacoes';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.pessoas_afectacoes ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_afectacoes';
  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas, encontraram-se %.', v_politicas;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_afectacoes'
       AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%get_user_visible_org_ids%'
  ) THEN
    RAISE EXCEPTION 'Alguma politica usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'idx_pessoas_afectacoes_aberta_por_local'
  ) THEN
    RAISE EXCEPTION 'O indice unico parcial (pessoa_id, local_id) da afectacao em aberto nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_afectacoes_local_fkey'
       AND conrelid = to_regclass('public.pessoas_afectacoes')
       AND cardinality(conkey) = 2
  ) THEN
    RAISE EXCEPTION 'pessoas_afectacoes_local_fkey nao e a FK composta (local_id, organization_id) esperada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_afectacoes_vinculo_fkey'
       AND conrelid = to_regclass('public.pessoas_afectacoes')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION 'pessoas_afectacoes_vinculo_fkey nao e a FK composta (vinculo_id, pessoa_id, organization_id) esperada.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_afectacoes' AND column_name IN ('horas','horas_semanais')
  ) THEN
    RAISE EXCEPTION 'pessoas_afectacoes ganhou uma coluna de horas. Esta tabela promete NAO ter horas -- calculam-se do horario.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_afectacoes_sem_sobreposicao' AND tgrelid = to_regclass('public.pessoas_afectacoes')
  ) THEN
    RAISE EXCEPTION 'O trigger de nao-sobreposicao nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_afectacoes_fecho_guardado' AND tgrelid = to_regclass('public.pessoas_afectacoes')
  ) THEN
    RAISE EXCEPTION 'O trigger de fecho guardado (afectacao_tem_horario_a_frente) nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_afectacoes_manter_local' AND tgrelid = to_regclass('public.pessoas_afectacoes')
  ) THEN
    RAISE EXCEPTION 'O trigger que mantem pessoas.local_id nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_local_id_e_derivado' AND tgrelid = to_regclass('public.pessoas')
  ) THEN
    RAISE EXCEPTION 'O guarda de pessoas.local_id nao ficou criado -- a coluna ficaria escrivel directamente, abrindo uma segunda verdade.';
  END IF;

  RAISE NOTICE
    'OK: pessoas_afectacoes criada, RLS activo com 4 politicas (alteracao vs correccao no INSERT/UPDATE), nao-sobreposicao por (pessoa,local), fecho guardado contra horario a frente, e pessoas.local_id agora derivado e protegido.';
END;
$conferir$;
