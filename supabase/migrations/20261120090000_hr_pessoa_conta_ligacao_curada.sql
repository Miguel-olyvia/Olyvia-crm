-- ==============================================================================
-- Ligacao curada entre uma ficha de pessoa e uma conta de utilizador, mais o
-- ambito de "a minha propria ficha" acrescentado por ALTER POLICY as tabelas
-- ja criadas. E a ultima migracao do modulo 1.
--
-- POR APLICAR. Ler o bloco "ANTES DO db push" no fim do ficheiro.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Uma ficha de RH e uma conta de acesso sao coisas diferentes: ha
-- trabalhadores sem conta nenhuma, e ha contas que nao sao de trabalhadores
-- (um consultor externo, uma conta de servico). Mas alguem tem de conseguir
-- dizer "esta ficha e desta pessoa que faz login", senao nao ha como um
-- trabalhador ver a sua propria ficha, nem como a interface mostrar o estado
-- do acesso na lista.
--
-- A tentacao seria uma coluna auth_user_id em pessoas. Nao se fez, e o
-- cabecalho de 20261120030000 explica porque: editar uma ficha de RH passaria
-- a conceder ou retirar acesso a aplicacao.
--
-- Ha ainda um segundo problema, este de base: anew_users.entity_id e
-- anew_memberships.role_id NAO tem chave estrangeira nenhuma. Nao se pode
-- confiar na base para garantir integridade por esse lado -- o que se verifica
-- verifica-se explicitamente, dentro das RPCs.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- pessoas_contas e uma tabela de ligacao curada, de escrita fechada, no molde
-- exacto de anew_entity_org_links (baseline 23128-23152): REVOKE INSERT e
-- UPDATE a authenticated, politicas restritivas WITH CHECK (false) / USING
-- (false), e duas RPCs SECURITY DEFINER como unico caminho.
--
--   rpc_hr_ligar_conta(p_pessoa_id, p_anew_user_id)  -> uuid
--   rpc_hr_revogar_conta(p_pessoa_id, p_motivo)      -> void
--
-- Ambas exigem hr.pessoas.conta.link NA ORGANIZACAO DA PESSOA e ambas
-- verificam que a conta alvo tem membership ACTIVO nessa mesma organizacao --
-- senao 'conta_sem_membership_na_organizacao'. Sem essa verificacao, ligar-se-
-- ia a ficha de RH de uma organizacao a uma conta de outra, e a clausula de
-- ficha-propria abaixo passaria a dar-lhe leitura.
--
-- LIGAR NAO DA ACESSO NENHUM. Nenhuma destas RPCs cria memberships, atribui
-- papeis ou envia convites. O acesso continua a ser anew_memberships + papel,
-- gerido no ecra de Definicoes que ja existe. Uma ligacao so responde a
-- pergunta "de quem e esta ficha".
--
--
-- -- O AMBITO DE FICHA-PROPRIA --------------------------------------------------
--
-- hr_pessoa_do_utilizador(_auth_uid, _organization_id) devolve o pessoa_id
-- ligado aquela conta naquela organizacao, ou NULL. E com ela que as politicas
-- de SELECT ganham, por ALTER POLICY (nunca DROP+CREATE, para nao haver um
-- instante sem politica numa base partilhada), a clausula:
--
--   OR (has_anew_permission_in_org(..., 'hr.pessoas.view.own', organization_id)
--       AND pessoa_id = hr_pessoa_do_utilizador(...))
--
-- GANHAM a clausula: pessoas, pessoas_dados_pessoais, pessoas_identificacao,
-- pessoas_moradas, pessoas_contactos_emergencia, pessoas_vinculos,
-- pessoas_contas.
--
-- NAO GANHAM: pessoas_retribuicoes, pessoas_dados_bancarios,
-- pessoas_dados_saude, pessoas_acessos_sensiveis. Nao e omissao -- e uma
-- pergunta de produto em aberto: um trabalhador deve ver, na aplicacao, a sua
-- propria retribuicao, os ultimos digitos da sua conta, o seu grau de
-- incapacidade, e quem andou a consultar a ficha dele? Enquanto nao houver
-- decisao, nao ve. E a escolha conservadora, e reverte-se com um ALTER POLICY
-- quando a decisao existir.
--
-- E NENHUM ALTER POLICY toca em INSERT, UPDATE ou DELETE: ver a propria ficha
-- nao da para a editar. Nem o nome, nem o cargo, nem a morada.
--
--
-- -- A GUARDA QUE FECHA O MODULO -------------------------------------------------
--
-- No fim, um bloco DO percorre as ONZE tabelas pessoas* e aborta se alguma
-- tiver menos de quatro politicas, ou se o texto de alguma politica contiver
-- get_user_visible_org_ids (que alarga a ascendentes, descendentes e
-- associadas) ou has_anew_permission( sem _in_org (a versao global, que e o
-- defeito que este modulo todo existe para nao herdar).
--
-- E esta guarda que impede o defeito voltar por descuido numa ronda futura:
-- quem escrever uma politica de RH com a funcao errada ve a migracao falhar.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se cria nenhum papel "colaborador", nem se atribui permissao nenhuma a
--   papel nenhum -- nem ao papel worker existente (baseline 934), em que nao
--   se mexe.
-- - Nao se criam memberships, convites nem contas.
-- - Nao se toca em anew_users nem em anew_memberships. A verificacao de
--   membership e por leitura, dentro das RPCs.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito: um .sql de reversao
-- guardado ao lado e aplicado pelo db push seguinte. A mao, e por esta ordem
-- (os ALTER POLICY primeiro, senao o DROP FUNCTION falha por dependencia):
--   repor cada politica de SELECT sem a clausula "OR ... ficha propria";
--   DROP FUNCTION IF EXISTS public.rpc_hr_ligar_conta(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.rpc_hr_revogar_conta(uuid, text);
--   DROP FUNCTION IF EXISTS public.hr_pessoa_do_utilizador(uuid, uuid);
--   DROP TABLE IF EXISTS public.pessoas_contas;
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120020000  catalogo hr.* (hr.pessoas.view.own, hr.pessoas.conta.link)
--   20261120030000  pessoas
--   20261120040000  pessoas_dados_pessoais, pessoas_identificacao
--   20261120050000  pessoas_moradas, pessoas_contactos_emergencia
--   20261120060000  pessoas_vinculos, pessoas_retribuicoes
--   20261120070000  pessoas_dados_bancarios
--   20261120080000  pessoas_dados_saude
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  t text;
BEGIN
  -- As dez tabelas anteriores tem todas de existir: esta migracao altera-lhes
  -- as politicas e a guarda final conta-as.
  FOREACH t IN ARRAY ARRAY[
    'pessoas','pessoas_dados_pessoais','pessoas_identificacao',
    'pessoas_acessos_sensiveis','pessoas_moradas','pessoas_contactos_emergencia',
    'pessoas_vinculos','pessoas_retribuicoes','pessoas_dados_bancarios',
    'pessoas_dados_saude'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION
        'public.% nao existe. Esta migracao e a ultima do bloco e depende de 20261120030000 a 20261120080000 estarem aplicadas.', t;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'public.has_anew_permission_in_org(uuid,text,uuid) nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.view.own') THEN
    RAISE EXCEPTION 'A permissao hr.pessoas.view.own nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.conta.link') THEN
    RAISE EXCEPTION 'A permissao hr.pessoas.conta.link nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  -- As politicas de SELECT que vamos ALTERAR tem de existir com os nomes que
  -- esperamos. Se alguem lhes mudou o nome, e melhor abortar do que criar uma
  -- politica nova ao lado e deixar duas em vigor.
  FOREACH t IN ARRAY ARRAY[
    'pessoas_select_policy','pessoas_dados_pessoais_select','pessoas_identificacao_select',
    'pessoas_moradas_select','pessoas_contactos_emergencia_select','pessoas_vinculos_select'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = t) THEN
      RAISE EXCEPTION
        'A politica % nao existe com esse nome. Esta migracao usa ALTER POLICY de proposito (para nao haver um instante sem politica numa base partilhada) e nao pode continuar sem ela.', t;
    END IF;
  END LOOP;
END;
$guardas$;

-- ==============================================================================
-- pessoas_contas -- escrita fechada, so por RPC
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_contas (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id        uuid NOT NULL,
  organization_id  uuid NOT NULL,

  anew_user_id     uuid NOT NULL,
  entity_id        uuid,

  estado           text NOT NULL DEFAULT 'activa',
  ligada_em        timestamptz NOT NULL DEFAULT now(),
  ligada_por       uuid,
  revogada_em      timestamptz,
  revogada_por     uuid,
  motivo_revogacao text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pessoas_contas_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_contas_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  -- ON DELETE RESTRICT: apagar uma conta que esta ligada a uma ficha de RH tem
  -- de obrigar a olhar para a ligacao primeiro.
  CONSTRAINT pessoas_contas_user_fkey
    FOREIGN KEY (anew_user_id) REFERENCES public.anew_users (id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_contas_ligada_por_fkey
    FOREIGN KEY (ligada_por) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_contas_revogada_por_fkey
    FOREIGN KEY (revogada_por) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_contas_estado_valido CHECK (estado IN ('activa','revogada')),
  CONSTRAINT pessoas_contas_revogacao_coerente
    CHECK ((estado = 'revogada') = (revogada_em IS NOT NULL))
);

COMMENT ON TABLE public.pessoas_contas IS
'Ligacao curada entre uma ficha de RH e uma conta de utilizador. LIGAR NAO DA ACESSO NENHUM: o acesso a aplicacao e um grant e vive em anew_memberships + papel. Esta tabela responde apenas a pergunta "de quem e esta ficha", e e o que da o ambito de ficha-propria as politicas de SELECT do modulo. Escrita fechada a authenticated, no molde de anew_entity_org_links: so rpc_hr_ligar_conta e rpc_hr_revogar_conta escrevem.';
COMMENT ON COLUMN public.pessoas_contas.entity_id IS
'Copia de anew_users.entity_id no momento da ligacao, sem chave estrangeira -- anew_users.entity_id tambem nao tem nenhuma, e a entidade pode nao existir. E informativo, nao autoritativo.';

-- Uma ficha tem no maximo uma conta activa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_contas_uma_activa_por_pessoa
  ON public.pessoas_contas (pessoa_id) WHERE estado = 'activa';

-- E a mesma conta nao esta ligada a duas fichas na mesma organizacao.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_contas_uma_activa_por_conta
  ON public.pessoas_contas (organization_id, anew_user_id) WHERE estado = 'activa';

CREATE INDEX IF NOT EXISTS idx_pessoas_contas_pessoa_id
  ON public.pessoas_contas (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_contas_anew_user_id
  ON public.pessoas_contas (anew_user_id);

DROP TRIGGER IF EXISTS trg_pessoas_contas_updated_at ON public.pessoas_contas;
CREATE TRIGGER trg_pessoas_contas_updated_at
  BEFORE UPDATE ON public.pessoas_contas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_contas_ancora ON public.pessoas_contas;
CREATE TRIGGER trg_pessoas_contas_ancora
  BEFORE UPDATE ON public.pessoas_contas
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

REVOKE ALL ON TABLE public.pessoas_contas FROM anon;
REVOKE ALL ON TABLE public.pessoas_contas FROM authenticated;
GRANT SELECT ON TABLE public.pessoas_contas TO authenticated;
GRANT ALL ON TABLE public.pessoas_contas TO service_role;

ALTER TABLE public.pessoas_contas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_contas_block_insert ON public.pessoas_contas;
CREATE POLICY pessoas_contas_block_insert ON public.pessoas_contas
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_contas_block_update ON public.pessoas_contas;
CREATE POLICY pessoas_contas_block_update ON public.pessoas_contas
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_contas_block_delete ON public.pessoas_contas;
CREATE POLICY pessoas_contas_block_delete ON public.pessoas_contas
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_contas_block_insert ON public.pessoas_contas IS
'Escrita fechada, no molde de anew_entity_org_links: ligar uma ficha a uma conta exige verificar o membership da conta na organizacao, o que um INSERT de cliente nao consegue garantir. So rpc_hr_ligar_conta escreve.';

-- ---- Helper de ambito proprio ----------------------------------------------
-- Criado ANTES dos ALTER POLICY, porque eles dependem dele.
CREATE OR REPLACE FUNCTION public.hr_pessoa_do_utilizador(
  _auth_uid uuid,
  _organization_id uuid
)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pc.pessoa_id
  FROM public.pessoas_contas pc
  JOIN public.anew_users au ON au.id = pc.anew_user_id
  WHERE au.auth_user_id = _auth_uid
    AND pc.organization_id = _organization_id
    AND pc.estado = 'activa'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.hr_pessoa_do_utilizador(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_pessoa_do_utilizador(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_pessoa_do_utilizador(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_pessoa_do_utilizador(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.hr_pessoa_do_utilizador(uuid, uuid) IS
'Devolve o pessoa_id ligado a esta conta NESTA organizacao, ou NULL. E o que da o ambito de "a minha propria ficha" as politicas de SELECT do modulo de RH. SECURITY DEFINER porque tem de ver pessoas_contas independentemente da RLS de quem pergunta; o filtro por _organization_id impede que sirva de ponte entre organizacoes.';

-- ---- Politica de SELECT de pessoas_contas ----------------------------------
DROP POLICY IF EXISTS pessoas_contas_select ON public.pessoas_contas;
CREATE POLICY pessoas_contas_select ON public.pessoas_contas
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
      AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
    )
  );

-- ==============================================================================
-- Ambito de ficha-propria nas tabelas anteriores, por ALTER POLICY
--
-- ALTER POLICY e nao DROP + CREATE: numa base partilhada por organizacoes com
-- dados reais, entre o DROP e o CREATE havia um instante sem politica. Com
-- RLS activo e sem politica ninguem le -- nao ha fuga -- mas ha um apagao, e
-- nao ha razao para o causar.
--
-- SO no SELECT. Nenhum destes ALTER toca em INSERT, UPDATE ou DELETE.
-- ==============================================================================

ALTER POLICY pessoas_select_policy ON public.pessoas
  USING (
    deleted_at IS NULL
    AND (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view', organization_id))
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
        AND id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
      )
    )
  );

ALTER POLICY pessoas_dados_pessoais_select ON public.pessoas_dados_pessoais
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.pessoais.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
      AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
    )
  );

ALTER POLICY pessoas_identificacao_select ON public.pessoas_identificacao
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.identificacao.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
      AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
    )
  );

ALTER POLICY pessoas_moradas_select ON public.pessoas_moradas
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.morada.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
      AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
    )
  );

ALTER POLICY pessoas_contactos_emergencia_select ON public.pessoas_contactos_emergencia
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.emergencia.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
      AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
    )
  );

ALTER POLICY pessoas_vinculos_select ON public.pessoas_vinculos
  USING (
    deleted_at IS NULL
    AND (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.vinculos.view', organization_id))
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
        AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
      )
    )
  );

COMMENT ON POLICY pessoas_select_policy ON public.pessoas IS
'Ve as fichas quem tem hr.pessoas.view NAQUELA organizacao; e cada um ve a SUA propria ficha se tiver hr.pessoas.view.own e a conta estiver ligada a uma pessoa nessa organizacao. Ver a propria ficha nao da para a editar: nenhum ALTER POLICY de 20261120090000 tocou no UPDATE.';

-- ==============================================================================
-- RPC: ligar uma conta a uma ficha
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_ligar_conta(
  p_pessoa_id uuid,
  p_anew_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org        uuid;
  v_entity     uuid;
  v_actor      uuid;
  v_id         uuid;
  v_ja_ligada  uuid;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'pessoa_nao_encontrada';
  END IF;

  IF NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.conta.link', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  -- A conta tem de ser membro ACTIVO desta organizacao. Sem isto, ligava-se a
  -- ficha de uma organizacao a uma conta de outra, e a clausula de
  -- ficha-propria passaria a dar-lhe leitura.
  IF NOT EXISTS (
    SELECT 1 FROM public.anew_memberships am
    WHERE am.user_id = p_anew_user_id
      AND am.organization_id = v_org
      AND am.status = 'active'
  ) THEN
    RAISE EXCEPTION 'conta_sem_membership_na_organizacao';
  END IF;

  -- Mensagens claras em vez de deixar rebentar o indice unico.
  SELECT pc.pessoa_id INTO v_ja_ligada
  FROM public.pessoas_contas pc
  WHERE pc.organization_id = v_org
    AND pc.anew_user_id = p_anew_user_id
    AND pc.estado = 'activa'
  LIMIT 1;

  IF v_ja_ligada IS NOT NULL AND v_ja_ligada <> p_pessoa_id THEN
    RAISE EXCEPTION 'conta_ja_ligada_a_outra_pessoa';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pessoas_contas pc
    WHERE pc.pessoa_id = p_pessoa_id
      AND pc.estado = 'activa'
      AND pc.anew_user_id <> p_anew_user_id
  ) THEN
    RAISE EXCEPTION 'pessoa_ja_tem_conta_activa';
  END IF;

  IF v_ja_ligada = p_pessoa_id THEN
    SELECT pc.id INTO v_id
    FROM public.pessoas_contas pc
    WHERE pc.pessoa_id = p_pessoa_id AND pc.anew_user_id = p_anew_user_id AND pc.estado = 'activa';
    RETURN v_id;
  END IF;

  SELECT au.entity_id INTO v_entity FROM public.anew_users au WHERE au.id = p_anew_user_id;
  SELECT au.id INTO v_actor FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  INSERT INTO public.pessoas_contas
    (pessoa_id, organization_id, anew_user_id, entity_id, estado, ligada_por)
  VALUES
    (p_pessoa_id, v_org, p_anew_user_id, v_entity, 'activa', v_actor)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ligar_conta(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ligar_conta(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ligar_conta(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ligar_conta(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ligar_conta(uuid, uuid) IS
'Liga uma ficha de RH a uma conta de utilizador. Exige hr.pessoas.conta.link na organizacao da pessoa e que a conta tenha membership ACTIVO nessa mesma organizacao. NAO cria memberships, nao atribui papeis, nao envia convites: ligar nao da acesso nenhum. Idempotente -- chamar duas vezes com o mesmo par devolve a ligacao existente.';

-- ==============================================================================
-- RPC: revogar a ligacao
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_revogar_conta(
  p_pessoa_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org   uuid;
  v_actor uuid;
  v_n     integer;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'pessoa_nao_encontrada';
  END IF;

  IF NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.conta.link', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  SELECT au.id INTO v_actor FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  UPDATE public.pessoas_contas
     SET estado           = 'revogada',
         revogada_em      = now(),
         revogada_por     = v_actor,
         motivo_revogacao = p_motivo,
         updated_at       = now()
   WHERE pessoa_id = p_pessoa_id
     AND estado = 'activa';

  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'pessoa_sem_conta_activa';
  END IF;

  -- Nota deliberada: revogar a ligacao NAO retira acesso a aplicacao. O
  -- membership e o papel continuam onde estavam; quem quiser retirar acesso
  -- fa-lo no ecra de Definicoes. Aqui apenas se deixa de dizer "esta ficha e
  -- desta conta" -- e a pessoa deixa de ver a propria ficha por ficha-propria.
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_revogar_conta(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_revogar_conta(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_revogar_conta(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_revogar_conta(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_revogar_conta(uuid, text) IS
'Revoga a ligacao activa entre uma ficha de RH e uma conta. Exige hr.pessoas.conta.link na organizacao da pessoa. NAO retira acesso a aplicacao -- o membership e o papel ficam intactos; o que se perde e o ambito de ficha-propria. A linha nao se apaga: fica com estado=revogada, quem revogou e quando.';

-- ==============================================================================
-- Conferir -- e a guarda que fecha o modulo
-- ==============================================================================
DO $conferir$
DECLARE
  t              text;
  v_rls          boolean;
  v_politicas    integer;
  v_mau          record;
  v_com_propria  integer;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pessoas','pessoas_dados_pessoais','pessoas_identificacao','pessoas_acessos_sensiveis',
    'pessoas_moradas','pessoas_contactos_emergencia','pessoas_vinculos','pessoas_retribuicoes',
    'pessoas_dados_bancarios','pessoas_dados_saude','pessoas_contas'
  ] LOOP
    SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t;

    IF v_rls IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'public.% esta sem RLS activo.', t;
    END IF;

    SELECT count(*) INTO v_politicas FROM pg_policies
    WHERE schemaname = 'public' AND tablename = t;

    IF v_politicas < 4 THEN
      RAISE EXCEPTION
        'public.% tem so % politicas; as quatro operacoes (SELECT, INSERT, UPDATE, DELETE) tem todas de estar escritas.', t, v_politicas;
    END IF;
  END LOOP;

  -- A guarda que impede o defeito voltar: nenhuma politica das onze tabelas
  -- pode usar get_user_visible_org_ids (alarga a ascendentes, descendentes e
  -- associadas) nem has_anew_permission( sem _in_org (a versao global).
  SELECT tablename, policyname INTO v_mau
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'pessoas','pessoas_dados_pessoais','pessoas_identificacao','pessoas_acessos_sensiveis',
      'pessoas_moradas','pessoas_contactos_emergencia','pessoas_vinculos','pessoas_retribuicoes',
      'pessoas_dados_bancarios','pessoas_dados_saude','pessoas_contas'
    )
    AND (
      (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%get_user_visible_org_ids%'
      OR (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%has_anew_permission(%'
    )
  LIMIT 1;

  IF v_mau.policyname IS NOT NULL THEN
    RAISE EXCEPTION
      'A politica % de public.% usa get_user_visible_org_ids ou has_anew_permission sem filtro de organizacao. Em RH so has_anew_permission_in_org -- corrigir antes de aplicar.',
      v_mau.policyname, v_mau.tablename;
  END IF;

  -- As sete politicas que devem ter ganhado a clausula de ficha-propria.
  SELECT count(*) INTO v_com_propria
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN (
      'pessoas_select_policy','pessoas_dados_pessoais_select','pessoas_identificacao_select',
      'pessoas_moradas_select','pessoas_contactos_emergencia_select','pessoas_vinculos_select',
      'pessoas_contas_select'
    )
    AND coalesce(qual, '') LIKE '%hr_pessoa_do_utilizador%';

  IF v_com_propria <> 7 THEN
    RAISE EXCEPTION
      'Esperavam-se 7 politicas de SELECT com a clausula de ficha-propria, encontraram-se %.', v_com_propria;
  END IF;

  -- E as quatro que NAO devem ter ganhado nada: retribuicao, dados bancarios,
  -- saude e o registo de acessos.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('pessoas_retribuicoes','pessoas_dados_bancarios','pessoas_dados_saude','pessoas_acessos_sensiveis')
      AND coalesce(qual, '') LIKE '%hr_pessoa_do_utilizador%'
  ) THEN
    RAISE EXCEPTION
      'Uma tabela sensivel (retribuicao, dados bancarios, saude ou registo de acessos) ganhou clausula de ficha-propria. Isso e uma decisao de produto por tomar, nao um passo desta migracao.';
  END IF;

  -- E nenhum ALTER POLICY deve ter tocado na escrita: ver a propria ficha nao
  -- da para a editar.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename LIKE 'pessoas%'
      AND cmd <> 'SELECT'
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%hr_pessoa_do_utilizador%'
  ) THEN
    RAISE EXCEPTION
      'Uma politica de escrita (INSERT/UPDATE/DELETE) tem a clausula de ficha-propria. Ver a propria ficha nao da para a editar.';
  END IF;

  RAISE NOTICE 'OK: pessoas_contas criada com escrita fechada; 11 tabelas pessoas* com RLS e 4+ politicas; nenhuma usa get_user_visible_org_ids nem has_anew_permission sem organizacao; 7 politicas de SELECT com ficha-propria e nenhuma politica de escrita com ela.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr "supabase migration list" e confirmar que nao ha nenhum timestamp
--    20261120* ja aplicado no remoto sem ficheiro local. Se colidir, renumerar
--    o bloco inteiro (20261120010000 .. 20261120090000) mantendo a ordem
--    relativa.
--
-- 2. Confirmar que 20261120010000 a 20261120080000 vao a frente desta na fila.
--    Esta e a unica das nove que ALTERA objectos criados pelas anteriores.
--
-- 3. Os ALTER POLICY desta migracao ALARGAM o que se ve (acrescentam um OR),
--    e so a quem tiver hr.pessoas.view.own -- que nao esta atribuido a papel
--    nenhum. Enquanto ninguem tiver essa permissao, o comportamento nao muda
--    para ninguem. Nao ha janela de estado defeituoso na base partilhada.
--
-- 4. Depois desta, o modulo 1 esta completo do lado da base: 11 tabelas, 44
--    politicas, 6 RPCs, e ZERO permissoes atribuidas. O passo seguinte e
--    humano: decidir, organizacao a organizacao, quem recebe o que.
--
-- 5. Fica em aberto, para decisao de produto (nao e omissao): o trabalhador
--    deve ver a propria retribuicao? os ultimos digitos da propria conta? o
--    proprio grau de incapacidade? quem consultou a ficha dele? Hoje nao ve
--    nenhuma dessas quatro coisas.
-- ==============================================================================
