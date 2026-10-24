-- ==============================================================================
-- Vinculos (contratos) e retribuicao da pessoa. Duas tabelas versionadas no
-- tempo, a segunda com auditoria de cada alteracao.
--
-- POR APLICAR. Ler o bloco "ANTES DO db push" no fim do ficheiro.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Um contrato e uma retribuicao nao sao um estado, sao uma HISTORIA. Quem foi
-- contratado a termo certo e passou a sem termo tem dois vinculos, nao um
-- campo alterado. Quem teve um aumento em Janeiro tem duas versoes de
-- retribuicao, e a de Dezembro continua a ser a verdade sobre Dezembro --
-- e o que sustenta um recibo, uma declaracao ou uma inspeccao.
--
-- Guardar isto como colunas em pessoas (tipo_contrato, salario) apagaria o
-- passado a cada UPDATE. E juntar a retribuicao a ficha faria com que quem
-- tem hr.pessoas.view para ver a lista de colegas visse quanto ganha cada um.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Duas tabelas, no padrao comum dos satelites (FK COMPOSTA
-- (pessoa_id, organization_id) -> pessoas (id, organization_id), quatro
-- politicas, triggers de updated_at e de ancora imutavel):
--
--   pessoas_vinculos      contratos, um so activo por pessoa
--   pessoas_retribuicoes  versoes de retribuicao, intervalos que nao se cruzam
--
-- pessoas_vinculos ganha tambem a unique (id, pessoa_id, organization_id), e
-- pessoas_retribuicoes.vinculo_id passa a FK COMPOSTA contra ela (vinculo_id,
-- pessoa_id, organization_id). Uma FK simples so contra pessoas_vinculos(id)
-- nao impediria uma retribuicao de uma pessoa apontar para o vinculo de OUTRA
-- pessoa da mesma organizacao -- a composta obriga a retribuicao, o vinculo e
-- a pessoa a serem coerentes entre si.
--
-- Ambas com deleted_at/deleted_by: sao as unicas tabelas do modulo com soft
-- delete, precisamente porque tem historico. Nas outras substitui-se a linha;
-- aqui um contrato errado marca-se como apagado e fica o rasto.
--
-- Permissoes:
--   pessoas_vinculos      SELECT hr.pessoas.vinculos.view
--                         INSERT/UPDATE hr.pessoas.vinculos.edit
--   pessoas_retribuicoes  SELECT hr.pessoas.retribuicao.view   (is_dangerous)
--                         INSERT/UPDATE hr.pessoas.retribuicao.edit
--
-- DELETE restritivo (false) nas duas: quem apaga historico de contratos apaga
-- prova. Marca-se deleted_at por UPDATE, que fica registado.
--
--
-- -- NAO-SOBREPOSICAO SEM btree_gist -------------------------------------------
--
-- O modo natural de garantir que duas versoes de retribuicao da mesma pessoa
-- nao se cruzam no tempo seria uma constraint EXCLUDE com um daterange. Nao
-- da: btree_gist NAO esta instalado neste projecto (confirmado), e esta ronda
-- nao instala extensoes. Instalar uma extensao numa base partilhada por
-- organizacoes com dados reais so para uma constraint de conveniencia nao se
-- justifica agora.
--
-- Resolve-se em duas camadas:
--
--   1. Indice unico parcial: uma so versao EM ABERTO (valido_ate IS NULL) por
--      pessoa. Isto e o caso que interessa no dia-a-dia -- a retribuicao
--      actual -- e um indice nao tem condicao de corrida.
--
--   2. Trigger BEFORE INSERT OR UPDATE que rejeita qualquer linha cujo
--      intervalo [valido_de, coalesce(valido_ate,'infinity')) intersecte outra
--      linha viva da mesma pessoa. Cobre o resto (versoes historicas com fim
--      declarado). Um trigger tem uma janela de corrida teorica entre duas
--      transaccoes simultaneas; a camada 1 fecha o caso pratico, e a
--      alternativa (nenhuma verificacao) e pior.
--
-- O trigger e SECURITY DEFINER de proposito, e isto e um desvio consciente do
-- plano: se fosse SECURITY INVOKER, a consulta interna corria sob a RLS de
-- quem escreve, e alguem com hr.pessoas.retribuicao.edit sem
-- hr.pessoas.retribuicao.view nao veria as linhas existentes -- a verificacao
-- passaria por nao encontrar nada e deixaria criar sobreposicoes. Uma
-- verificacao que so ve metade das linhas nao e uma verificacao.
--
--
-- -- AUDITORIA -----------------------------------------------------------------
--
-- Cada INSERT ou UPDATE em pessoas_retribuicoes escreve uma linha em
-- pessoas_acessos_sensiveis (campo='retribuicao', accao='alterar'), por
-- trigger AFTER. A funcao de registo (hr_registar_acesso_sensivel,
-- 20261120040000) nao esta ao alcance de authenticated, por isso o trigger tem
-- de ser ele proprio SECURITY DEFINER -- e por isso que e.
--
-- Se nao houver auth.uid() (contexto service_role), a auditoria grava
-- origem='service_role' e NAO aborta a operacao. Uma auditoria que rebenta a
-- operacao que devia registar acaba desligada por quem tem pressa.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - pessoas_retribuicoes NAO ganha clausula de ficha-propria em
--   20261120090000. Se um trabalhador deve ver a sua propria retribuicao na
--   aplicacao e uma decisao de produto por tomar, nao uma omissao: fica em
--   aberto, escrito aqui.
-- - Nada de processamento de salarios, recibos, IRS, nem Seguranca Social.
--   Esta tabela guarda o que foi acordado, nao o que foi pago.
-- - Nao se instala btree_gist nem extensao nenhuma.
-- - Nao se atribui permissao nenhuma a papel nenhum.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito: um .sql de reversao
-- guardado ao lado e aplicado pelo db push seguinte. A mao:
--   DROP TABLE IF EXISTS public.pessoas_retribuicoes;
--   DROP TABLE IF EXISTS public.pessoas_vinculos;
--   DROP FUNCTION IF EXISTS public.hr_retribuicoes_sem_sobreposicao();
--   DROP FUNCTION IF EXISTS public.hr_retribuicoes_auditar();
-- Isto apaga historico de contratos e de retribuicao. Exportar antes.
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120020000  catalogo hr.*
--   20261120030000  pessoas (e a unique pessoas_id_org_key)
--   20261120040000  hr_satelite_ancora_imutavel(), pessoas_acessos_sensiveis,
--                   hr_registar_acesso_sensivel()
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

  IF to_regclass('public.pessoas_acessos_sensiveis') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_acessos_sensiveis nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_registar_acesso_sensivel' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION 'public.hr_registar_acesso_sensivel(uuid,uuid,text,text) nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_satelite_ancora_imutavel'
  ) THEN
    RAISE EXCEPTION 'public.hr_satelite_ancora_imutavel() nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'public.has_anew_permission_in_org(uuid,text,uuid) nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.retribuicao.view') THEN
    RAISE EXCEPTION 'A permissao hr.pessoas.retribuicao.view nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  -- O registo de acessos tem de aceitar campo='retribuicao', senao a auditoria
  -- desta migracao rebenta no primeiro INSERT.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pessoas_acessos_sensiveis_campo_valido'
      AND conrelid = 'public.pessoas_acessos_sensiveis'::regclass
      AND pg_get_constraintdef(oid) LIKE '%retribuicao%'
  ) THEN
    RAISE EXCEPTION 'O CHECK de campo em pessoas_acessos_sensiveis nao aceita "retribuicao"; a auditoria desta migracao falharia.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- pessoas_vinculos -- contratos, versionado
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_vinculos (
  id                        uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id                 uuid NOT NULL,
  organization_id           uuid NOT NULL,

  tipo_contrato             text NOT NULL,
  regime                    text NOT NULL DEFAULT 'tempo_inteiro',
  horas_semanais            numeric(5,2),
  data_inicio               date NOT NULL,
  data_fim                  date,
  motivo_termo              text,
  periodo_experimental_ate  date,
  entidade_legal_org_id     uuid,
  estado                    text NOT NULL DEFAULT 'activo',

  deleted_at                timestamptz,
  deleted_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid,
  updated_by                uuid,

  CONSTRAINT pessoas_vinculos_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_vinculos_id_pessoa_org_key UNIQUE (id, pessoa_id, organization_id),
  CONSTRAINT pessoas_vinculos_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_vinculos_entidade_legal_fkey
    FOREIGN KEY (entidade_legal_org_id) REFERENCES public.anew_organizations (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_vinculos_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_vinculos_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_vinculos_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_vinculos_tipo_valido CHECK (
    tipo_contrato IN ('sem_termo','termo_certo','termo_incerto','estagio','prestacao_servicos','temporario')
  ),
  CONSTRAINT pessoas_vinculos_regime_valido CHECK (regime IN ('tempo_inteiro','tempo_parcial')),
  CONSTRAINT pessoas_vinculos_estado_valido CHECK (estado IN ('activo','terminado','futuro')),
  CONSTRAINT pessoas_vinculos_horas_validas CHECK (
    horas_semanais IS NULL OR (horas_semanais >= 0 AND horas_semanais <= 80)
  ),
  CONSTRAINT pessoas_vinculos_fim_depois_inicio CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);

COMMENT ON TABLE public.pessoas_vinculos IS
'Contratos da pessoa, versionados: um contrato que muda de tipo e um vinculo novo, nao um campo alterado. Tem soft delete (deleted_at) porque tem historico -- um contrato errado marca-se apagado e fica o rasto, em vez de desaparecer.';
COMMENT ON CONSTRAINT pessoas_vinculos_id_pessoa_org_key ON public.pessoas_vinculos IS
'Suporta a FK composta de pessoas_retribuicoes.vinculo_id (vinculo_id, pessoa_id, organization_id). Sem esta unique, uma retribuicao poderia apontar para um vinculo de outra pessoa da mesma organizacao.';
COMMENT ON COLUMN public.pessoas_vinculos.estado IS
'activo, terminado ou futuro. Um so activo por pessoa, garantido por indice unico parcial.';

CREATE INDEX IF NOT EXISTS idx_pessoas_vinculos_pessoa_id
  ON public.pessoas_vinculos (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_vinculos_organization_id
  ON public.pessoas_vinculos (organization_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_vinculos_pessoa_periodo
  ON public.pessoas_vinculos (pessoa_id, data_inicio DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_vinculos_um_activo
  ON public.pessoas_vinculos (pessoa_id)
  WHERE estado = 'activo' AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_pessoas_vinculos_updated_at ON public.pessoas_vinculos;
CREATE TRIGGER trg_pessoas_vinculos_updated_at
  BEFORE UPDATE ON public.pessoas_vinculos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_vinculos_ancora ON public.pessoas_vinculos;
CREATE TRIGGER trg_pessoas_vinculos_ancora
  BEFORE UPDATE ON public.pessoas_vinculos
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

REVOKE ALL ON TABLE public.pessoas_vinculos FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_vinculos TO authenticated;
GRANT ALL ON TABLE public.pessoas_vinculos TO service_role;

ALTER TABLE public.pessoas_vinculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_vinculos_select ON public.pessoas_vinculos;
CREATE POLICY pessoas_vinculos_select ON public.pessoas_vinculos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.vinculos.view', organization_id))
  );

DROP POLICY IF EXISTS pessoas_vinculos_insert ON public.pessoas_vinculos;
CREATE POLICY pessoas_vinculos_insert ON public.pessoas_vinculos
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.vinculos.edit', organization_id))
  );

DROP POLICY IF EXISTS pessoas_vinculos_update ON public.pessoas_vinculos;
CREATE POLICY pessoas_vinculos_update ON public.pessoas_vinculos
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.vinculos.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.vinculos.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_vinculos_block_delete ON public.pessoas_vinculos;
CREATE POLICY pessoas_vinculos_block_delete ON public.pessoas_vinculos
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_vinculos_update ON public.pessoas_vinculos IS
'Edita quem tem hr.pessoas.vinculos.edit naquela organizacao. O USING nao exige deleted_at IS NULL de proposito: marcar deleted_at e desmarcar sao ambos UPDATE, e nao ter como reverter um apagamento acidental seria pior.';
COMMENT ON POLICY pessoas_vinculos_block_delete ON public.pessoas_vinculos IS
'Nao se apaga historico de contratos: marca-se deleted_at, que fica registado em updated_by/updated_at. Quem apaga historico apaga prova.';

-- ==============================================================================
-- pessoas_retribuicoes -- versionada no tempo
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_retribuicoes (
  id                          uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id                   uuid NOT NULL,
  organization_id             uuid NOT NULL,
  vinculo_id                  uuid,

  valor_base                  numeric(12,2) NOT NULL,
  moeda                       text NOT NULL DEFAULT 'EUR',
  periodicidade               text NOT NULL DEFAULT 'mensal',
  subsidio_alimentacao        numeric(10,2),
  subsidio_alimentacao_modo   text,

  valido_de                   date NOT NULL,
  valido_ate                  date,
  motivo                      text,

  deleted_at                  timestamptz,
  deleted_by                  uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid,
  updated_by                  uuid,

  CONSTRAINT pessoas_retribuicoes_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_retribuicoes_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  -- FK COMPOSTA de proposito: uma FK simples so contra pessoas_vinculos(id)
  -- nao impediria esta retribuicao apontar para um vinculo de OUTRA pessoa da
  -- mesma organizacao. Ao incluir pessoa_id e organization_id, o Postgres
  -- obriga o vinculo referenciado a ser da MESMA pessoa (MATCH SIMPLE: se
  -- vinculo_id for NULL, a constraint nao se aplica, que e o caso normal de
  -- uma retribuicao sem vinculo associado). ON DELETE SET NULL so na coluna
  -- vinculo_id -- nao em pessoa_id/organization_id, que sao NOT NULL.
  CONSTRAINT pessoas_retribuicoes_vinculo_fkey
    FOREIGN KEY (vinculo_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_vinculos (id, pessoa_id, organization_id)
    ON DELETE SET NULL (vinculo_id),
  CONSTRAINT pessoas_retribuicoes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_retribuicoes_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_retribuicoes_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_retribuicoes_valor_nao_negativo CHECK (valor_base >= 0),
  CONSTRAINT pessoas_retribuicoes_moeda_iso CHECK (moeda ~ '^[A-Z]{3}$'),
  CONSTRAINT pessoas_retribuicoes_periodicidade_valida
    CHECK (periodicidade IN ('mensal','anual','hora')),
  CONSTRAINT pessoas_retribuicoes_subsidio_nao_negativo
    CHECK (subsidio_alimentacao IS NULL OR subsidio_alimentacao >= 0),
  CONSTRAINT pessoas_retribuicoes_subsidio_modo_valido
    CHECK (subsidio_alimentacao_modo IS NULL OR subsidio_alimentacao_modo IN ('dinheiro','cartao')),
  CONSTRAINT pessoas_retribuicoes_ate_depois_de
    CHECK (valido_ate IS NULL OR valido_ate >= valido_de)
);

COMMENT ON TABLE public.pessoas_retribuicoes IS
'Versoes de retribuicao acordada, validas por intervalo de datas. Guarda o que foi ACORDADO, nao o que foi pago -- nao ha aqui processamento de salarios, recibos, IRS nem Seguranca Social. Tem soft delete porque tem historico: a versao de Dezembro continua a ser a verdade sobre Dezembro. Cada INSERT e cada UPDATE ficam registados em pessoas_acessos_sensiveis.';
COMMENT ON COLUMN public.pessoas_retribuicoes.valido_ate IS
'NULL = versao em aberto (a retribuicao actual). Uma so em aberto por pessoa, garantido por indice unico parcial.';

CREATE INDEX IF NOT EXISTS idx_pessoas_retribuicoes_pessoa_id
  ON public.pessoas_retribuicoes (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_retribuicoes_organization_id
  ON public.pessoas_retribuicoes (organization_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_retribuicoes_pessoa_periodo
  ON public.pessoas_retribuicoes (pessoa_id, valido_de DESC);

-- Camada 1 da nao-sobreposicao: uma so versao em aberto por pessoa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_retribuicoes_aberta
  ON public.pessoas_retribuicoes (pessoa_id)
  WHERE valido_ate IS NULL AND deleted_at IS NULL;

-- ---- Camada 2: trigger de nao-sobreposicao ---------------------------------
-- SECURITY DEFINER de proposito. Ver o cabecalho: sob RLS de invocador, quem
-- tem retribuicao.edit sem retribuicao.view nao veria as linhas existentes e a
-- verificacao passaria por nao encontrar nada.
CREATE OR REPLACE FUNCTION public.hr_retribuicoes_sem_sobreposicao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_conflito record;
BEGIN
  -- Uma linha marcada como apagada nao ocupa intervalo nenhum.
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.id, r.valido_de, r.valido_ate INTO v_conflito
  FROM public.pessoas_retribuicoes r
  WHERE r.pessoa_id = NEW.pessoa_id
    AND r.deleted_at IS NULL
    AND r.id <> NEW.id
    AND daterange(r.valido_de, r.valido_ate, '[)')
        && daterange(NEW.valido_de, NEW.valido_ate, '[)')
  LIMIT 1;

  IF v_conflito.id IS NOT NULL THEN
    RAISE EXCEPTION
      'retribuicao_sobreposta: o intervalo % a % cruza-se com a versao % (% a %). Fechar a versao anterior (valido_ate) antes de criar a nova.',
      NEW.valido_de, coalesce(NEW.valido_ate::text, 'sem fim'),
      v_conflito.id, v_conflito.valido_de, coalesce(v_conflito.valido_ate::text, 'sem fim');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_retribuicoes_sem_sobreposicao() IS
'Impede duas versoes vivas de retribuicao da mesma pessoa com intervalos que se cruzem. Existe porque btree_gist nao esta instalado e nao ha constraint EXCLUDE possivel. SECURITY DEFINER: sob RLS de invocador, quem tem retribuicao.edit sem retribuicao.view nao veria as linhas existentes e a verificacao seria vazia.';

DROP TRIGGER IF EXISTS trg_pessoas_retribuicoes_sem_sobreposicao ON public.pessoas_retribuicoes;
CREATE TRIGGER trg_pessoas_retribuicoes_sem_sobreposicao
  BEFORE INSERT OR UPDATE ON public.pessoas_retribuicoes
  FOR EACH ROW EXECUTE FUNCTION public.hr_retribuicoes_sem_sobreposicao();

-- ---- Auditoria de alteracoes ----------------------------------------------
-- SECURITY DEFINER porque hr_registar_acesso_sensivel nao esta ao alcance de
-- authenticated: e chamavel apenas de dentro de funcoes definer do modulo.
CREATE OR REPLACE FUNCTION public.hr_retribuicoes_auditar()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.hr_registar_acesso_sensivel(
    NEW.pessoa_id, NEW.organization_id, 'retribuicao', 'alterar'
  );
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.hr_retribuicoes_auditar() IS
'Registra em pessoas_acessos_sensiveis cada criacao ou alteracao de retribuicao. SECURITY DEFINER porque hr_registar_acesso_sensivel nao e chamavel por authenticated. Se nao houver auth.uid() (service_role), a linha fica com origem=service_role em vez de a operacao falhar.';

DROP TRIGGER IF EXISTS trg_pessoas_retribuicoes_auditar ON public.pessoas_retribuicoes;
CREATE TRIGGER trg_pessoas_retribuicoes_auditar
  AFTER INSERT OR UPDATE ON public.pessoas_retribuicoes
  FOR EACH ROW EXECUTE FUNCTION public.hr_retribuicoes_auditar();

DROP TRIGGER IF EXISTS trg_pessoas_retribuicoes_updated_at ON public.pessoas_retribuicoes;
CREATE TRIGGER trg_pessoas_retribuicoes_updated_at
  BEFORE UPDATE ON public.pessoas_retribuicoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_retribuicoes_ancora ON public.pessoas_retribuicoes;
CREATE TRIGGER trg_pessoas_retribuicoes_ancora
  BEFORE UPDATE ON public.pessoas_retribuicoes
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

REVOKE ALL ON TABLE public.pessoas_retribuicoes FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_retribuicoes TO authenticated;
GRANT ALL ON TABLE public.pessoas_retribuicoes TO service_role;

ALTER TABLE public.pessoas_retribuicoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_retribuicoes_select ON public.pessoas_retribuicoes;
CREATE POLICY pessoas_retribuicoes_select ON public.pessoas_retribuicoes
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.retribuicao.view', organization_id))
  );

DROP POLICY IF EXISTS pessoas_retribuicoes_insert ON public.pessoas_retribuicoes;
CREATE POLICY pessoas_retribuicoes_insert ON public.pessoas_retribuicoes
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.retribuicao.edit', organization_id))
  );

DROP POLICY IF EXISTS pessoas_retribuicoes_update ON public.pessoas_retribuicoes;
CREATE POLICY pessoas_retribuicoes_update ON public.pessoas_retribuicoes
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.retribuicao.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.retribuicao.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_retribuicoes_block_delete ON public.pessoas_retribuicoes;
CREATE POLICY pessoas_retribuicoes_block_delete ON public.pessoas_retribuicoes
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_retribuicoes_select ON public.pessoas_retribuicoes IS
'Ve a retribuicao quem tem hr.pessoas.retribuicao.view NAQUELA organizacao. A permissao esta marcada is_dangerous e nao e atribuida a papel nenhum por omissao. Esta tabela NAO ganha clausula de ficha-propria em 20261120090000: se o trabalhador deve ver a sua propria retribuicao na aplicacao e uma decisao de produto por tomar.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  t text;
  v_rls boolean;
  v_politicas integer;
BEGIN
  FOREACH t IN ARRAY ARRAY['pessoas_vinculos','pessoas_retribuicoes'] LOOP
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
    WHERE schemaname = 'public' AND indexname = 'idx_pessoas_vinculos_um_activo'
  ) THEN
    RAISE EXCEPTION 'O indice unico parcial do vinculo activo nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_pessoas_retribuicoes_aberta'
  ) THEN
    RAISE EXCEPTION 'O indice unico parcial da retribuicao em aberto nao ficou criado; sem ele a nao-sobreposicao fica so no trigger.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.pessoas_retribuicoes'::regclass
      AND tgname = 'trg_pessoas_retribuicoes_sem_sobreposicao'
  ) THEN
    RAISE EXCEPTION 'O trigger de nao-sobreposicao de retribuicoes nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.pessoas_retribuicoes'::regclass
      AND tgname = 'trg_pessoas_retribuicoes_auditar'
  ) THEN
    RAISE EXCEPTION 'O trigger de auditoria de retribuicoes nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pessoas_vinculos_id_pessoa_org_key' AND conrelid = 'public.pessoas_vinculos'::regclass
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_vinculos_id_pessoa_org_key nao ficou criada; a FK composta de pessoas_retribuicoes.vinculo_id depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pessoas_retribuicoes_vinculo_fkey'
      AND conrelid = 'public.pessoas_retribuicoes'::regclass
      AND cardinality(conkey) = 3
      AND pg_get_constraintdef(oid) LIKE '%(vinculo_id, pessoa_id, organization_id)%'
      AND pg_get_constraintdef(oid) LIKE '%pessoas_vinculos(id, pessoa_id, organization_id)%'
  ) THEN
    RAISE EXCEPTION 'pessoas_retribuicoes_vinculo_fkey nao e a FK composta (vinculo_id, pessoa_id, organization_id) esperada. Uma FK simples deixaria uma retribuicao apontar para o vinculo de outra pessoa.';
  END IF;

  RAISE NOTICE 'OK: pessoas_vinculos e pessoas_retribuicoes criadas, RLS activo, 4 politicas cada, um vinculo activo e uma retribuicao em aberto por pessoa, nao-sobreposicao e auditoria por trigger, FK composta de vinculo_id coerente com a pessoa.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr "supabase migration list" e confirmar que nao ha nenhum timestamp
--    20261120* ja aplicado no remoto sem ficheiro local. Se colidir, renumerar
--    o bloco inteiro mantendo a ordem relativa.
--
-- 2. Confirmar que 20261120010000 a 20261120050000 vao a frente desta na fila.
--
-- 3. So cria objectos novos. Nao altera tabela, politica nem funcao existente,
--    por isso nao ha janela em que a base partilhada fique num estado
--    defeituoso.
--
-- 4. Fica em aberto, para decisao de produto: um trabalhador deve poder ver a
--    sua propria retribuicao na aplicacao? Enquanto nao houver decisao, nao ve
--    -- e essa e a escolha conservadora, nao uma omissao.
-- ==============================================================================
