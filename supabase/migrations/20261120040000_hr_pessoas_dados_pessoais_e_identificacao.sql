-- ==============================================================================
-- Dados pessoais e documento de identificacao da pessoa, mais o registo de
-- acessos a campos sensiveis. O NISS fica fechado por GRANT ao nivel da COLUNA.
--
-- POR APLICAR. Ler o bloco "ANTES DO db push" no fim do ficheiro.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Data de nascimento, nacionalidade, estado civil, NIF e NISS sao dados
-- pessoais que so parte de quem trabalha em RH deve ver, e o NISS em claro e
-- um caso a parte: identifica univocamente a pessoa perante a Seguranca
-- Social. Poe-los na tabela pessoas faria com que quem tem hr.pessoas.view
-- (para ver a lista de colegas e os cargos) visse tambem o NISS de toda a
-- gente. Por isso vao para tabelas satelite com permissoes proprias.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Tres tabelas:
--
--   pessoas_dados_pessoais    1:1, os dados administrativos correntes
--   pessoas_identificacao     1:1, documento, NIF e NISS
--   pessoas_acessos_sensiveis append-only, quem revelou/alterou o que e quando
--
-- Todas seguem o padrao comum dos satelites: FK COMPOSTA
-- (pessoa_id, organization_id) -> pessoas (id, organization_id), o que permite
-- as politicas filtrarem pela sua propria coluna organization_id sem um unico
-- join a pessoas; quatro politicas (SELECT, INSERT, UPDATE com USING e WITH
-- CHECK, DELETE restritiva false); trigger de updated_at; trigger que impede
-- mudar pessoa_id ou organization_id.
--
--
-- -- PORQUE O NISS E FECHADO POR GRANT DE COLUNA E NAO POR RLS -------------------
--
-- A RLS decide LINHAS, nao colunas. Nao ha politica que consiga dizer "esta
-- pessoa ve a linha mas nao ve esta coluna". Se o NISS ficasse so protegido
-- por RLS, quem tivesse hr.pessoas.identificacao.view leria o NISS completo de
-- todas as fichas que ve -- e a permissao de "revelar" seria decorativa, uma
-- caixa na interface que o PostgREST ignora.
--
-- Por isso o fecho e ao nivel do GRANT:
--
--   authenticated NAO tem SELECT sobre a coluna niss. Tem SELECT sobre
--   niss_ultimos4 (gerada, right(niss,4)), que e o que a interface mostra.
--   authenticated NAO tem INSERT nem UPDATE sobre niss.
--
-- O NISS em claro so sai por rpc_hr_revelar_niss, que exige
-- hr.pessoas.identificacao.reveal NAQUELA organizacao e escreve uma linha de
-- auditoria ANTES de devolver. So entra por rpc_hr_definir_niss.
--
-- CONSEQUENCIA PARA QUEM ESCREVE A INTERFACE, e nao e opcional: com grants ao
-- nivel da coluna, um "select=*" a pessoas_identificacao passa a devolver erro
-- de permissao em vez da linha. Os hooks TEM de pedir as colunas
-- explicitamente (nunca .select('*') nesta tabela). Esta escrito aqui porque e
-- o tipo de detalhe que so aparece em producao.
--
--
-- -- O REGISTO DE ACESSOS -------------------------------------------------------
--
-- pessoas_acessos_sensiveis e append-only de verdade: as quatro operacoes
-- estao fechadas a authenticated (SELECT permitido so a quem tem
-- hr.pessoas.acessos_sensiveis.view, a permissao dedicada e is_dangerous do
-- registo de auditoria -- NAO hr.pessoas.view, que e a permissao mais basica
-- do modulo e daria a quem ve a lista de colegas leitura de quem espiou
-- salarios e NISS. INSERT, UPDATE e DELETE restritivos com false. So as RPCs
-- e triggers SECURITY DEFINER la escrevem. Um registo que o proprio
-- utilizador possa apagar nao e um registo.
--
-- anew_user_id e auth_user_id sao ambos NULLABLE, ao contrario do que um
-- primeiro esboco poderia sugerir: quando a escrita vem de service_role nao ha
-- auth.uid() nenhum para resolver, e a alternativa seria a auditoria rebentar
-- a operacao que devia estar a registar. Fica a origem marcada e o que se sabe
-- gravado, em vez de nada.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - A clausula de ficha-propria entra em 20261120090000, por ALTER POLICY, e
--   so no SELECT.
-- - Nao ha RPC que devolva o NIF em claro: o NIF nao esta fechado por coluna,
--   e visivel a quem tem hr.pessoas.identificacao.view. So o NISS e que e
--   tratado como segredo.
-- - Nao se atribui permissao nenhuma a papel nenhum.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito (o db push aplicaria-o).
-- A mao:
--   DROP FUNCTION IF EXISTS public.rpc_hr_revelar_niss(uuid);
--   DROP FUNCTION IF EXISTS public.rpc_hr_definir_niss(uuid, text);
--   DROP TABLE IF EXISTS public.pessoas_identificacao;
--   DROP TABLE IF EXISTS public.pessoas_dados_pessoais;
--   DROP TABLE IF EXISTS public.pessoas_acessos_sensiveis;
-- A ultima apaga o registo de quem viu o que. Exportar antes.
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120020000  catalogo hr.*
--   20261120030000  pessoas (e a unique pessoas_id_org_key)
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

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.identificacao.reveal') THEN
    RAISE EXCEPTION 'O catalogo hr.* nao esta aplicado. Aplicar 20261120020000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.acessos_sensiveis.view') THEN
    RAISE EXCEPTION 'A permissao hr.pessoas.acessos_sensiveis.view nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;
END;
$guardas$;

-- ---- Funcao partilhada: impedir mudar de pessoa ou de organizacao ----------
-- Usada pelo trigger BEFORE UPDATE de TODOS os satelites de RH (esta migracao
-- e as seguintes). Definida aqui por ser a primeira a precisar dela.
CREATE OR REPLACE FUNCTION public.hr_satelite_ancora_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.pessoa_id IS DISTINCT FROM OLD.pessoa_id THEN
    RAISE EXCEPTION 'Nao se muda a pessoa de uma linha de %: apagar e criar de novo.', TG_TABLE_NAME;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Nao se muda a organizacao de uma linha de %.', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_satelite_ancora_imutavel() IS
'Trigger BEFORE UPDATE partilhado por todos os satelites de RH: impede alterar pessoa_id ou organization_id depois de criada a linha. Sem isto, um UPDATE que passasse a linha para outra pessoa mudaria quem a ve sem deixar rasto.';

-- ==============================================================================
-- pessoas_acessos_sensiveis -- append-only
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_acessos_sensiveis (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id       uuid NOT NULL,
  organization_id uuid NOT NULL,

  anew_user_id    uuid,
  auth_user_id    uuid,
  origem          text NOT NULL DEFAULT 'utilizador',

  campo           text NOT NULL,
  accao           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pessoas_acessos_sensiveis_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_acessos_sensiveis_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_acessos_sensiveis_user_fkey
    FOREIGN KEY (anew_user_id) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_acessos_sensiveis_campo_valido
    CHECK (campo IN ('niss','iban','incapacidade','retribuicao')),
  CONSTRAINT pessoas_acessos_sensiveis_accao_valida
    CHECK (accao IN ('revelar','alterar')),
  CONSTRAINT pessoas_acessos_sensiveis_origem_valida
    CHECK (origem IN ('utilizador','service_role')),
  -- Se veio de um utilizador autenticado, tem de haver auth_user_id.
  CONSTRAINT pessoas_acessos_sensiveis_utilizador_identificado
    CHECK (origem <> 'utilizador' OR auth_user_id IS NOT NULL)
);

COMMENT ON TABLE public.pessoas_acessos_sensiveis IS
'Registo append-only de acessos e alteracoes a campos sensiveis de RH (NISS, IBAN, incapacidade, retribuicao). INSERT, UPDATE e DELETE estao fechados a authenticated: so RPCs e triggers SECURITY DEFINER escrevem aqui. Um registo que o proprio possa apagar nao e um registo.';
COMMENT ON COLUMN public.pessoas_acessos_sensiveis.anew_user_id IS
'Nullable de proposito: em contexto service_role nao ha auth.uid() para resolver, e a auditoria nao deve rebentar a operacao que esta a registar.';

CREATE INDEX IF NOT EXISTS idx_pessoas_acessos_sensiveis_pessoa_id
  ON public.pessoas_acessos_sensiveis (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_acessos_sensiveis_org_data
  ON public.pessoas_acessos_sensiveis (organization_id, created_at DESC);

REVOKE ALL ON TABLE public.pessoas_acessos_sensiveis FROM anon;
REVOKE ALL ON TABLE public.pessoas_acessos_sensiveis FROM authenticated;
GRANT SELECT ON TABLE public.pessoas_acessos_sensiveis TO authenticated;
GRANT ALL ON TABLE public.pessoas_acessos_sensiveis TO service_role;

ALTER TABLE public.pessoas_acessos_sensiveis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_acessos_sensiveis_select ON public.pessoas_acessos_sensiveis;
CREATE POLICY pessoas_acessos_sensiveis_select ON public.pessoas_acessos_sensiveis
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.acessos_sensiveis.view', organization_id))
  );

COMMENT ON POLICY pessoas_acessos_sensiveis_select ON public.pessoas_acessos_sensiveis IS
'Ve o registo de auditoria quem tem hr.pessoas.acessos_sensiveis.view NAQUELA organizacao -- permissao dedicada e is_dangerous, distinta de hr.pessoas.view (a de ver a lista de colegas). Sem isto, quem ve o directorio leria quem espiou salarios e NISS. Esta tabela NAO ganha clausula de ficha-propria em 20261120090000: e uma decisao de produto em aberto, escrita la, nao uma omissao aqui.';

DROP POLICY IF EXISTS pessoas_acessos_sensiveis_block_insert ON public.pessoas_acessos_sensiveis;
CREATE POLICY pessoas_acessos_sensiveis_block_insert ON public.pessoas_acessos_sensiveis
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_acessos_sensiveis_block_update ON public.pessoas_acessos_sensiveis;
CREATE POLICY pessoas_acessos_sensiveis_block_update ON public.pessoas_acessos_sensiveis
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_acessos_sensiveis_block_delete ON public.pessoas_acessos_sensiveis;
CREATE POLICY pessoas_acessos_sensiveis_block_delete ON public.pessoas_acessos_sensiveis
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ---- Funcao interna de auditoria (usada por RPCs e triggers) ---------------
CREATE OR REPLACE FUNCTION public.hr_registar_acesso_sensivel(
  p_pessoa_id uuid,
  p_organization_id uuid,
  p_campo text,
  p_accao text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_anew uuid;
BEGIN
  IF v_auth IS NOT NULL THEN
    SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  END IF;

  INSERT INTO public.pessoas_acessos_sensiveis
    (pessoa_id, organization_id, anew_user_id, auth_user_id, origem, campo, accao)
  VALUES
    (p_pessoa_id, p_organization_id, v_anew, v_auth,
     CASE WHEN v_auth IS NULL THEN 'service_role' ELSE 'utilizador' END,
     p_campo, p_accao);
END;
$$;

REVOKE ALL ON FUNCTION public.hr_registar_acesso_sensivel(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_registar_acesso_sensivel(uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.hr_registar_acesso_sensivel(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_registar_acesso_sensivel(uuid, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.hr_registar_acesso_sensivel(uuid, uuid, text, text) IS
'Escreve uma linha no registo de acessos sensiveis. Nao e chamavel por authenticated de proposito: so pelas RPCs e triggers SECURITY DEFINER do modulo, que a alcancam por serem elas proprias definer. Se nao houver auth.uid() (contexto service_role) grava origem=service_role em vez de falhar.';

-- ==============================================================================
-- pessoas_dados_pessoais -- 1:1
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_dados_pessoais (
  id                        uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id                 uuid NOT NULL,
  organization_id           uuid NOT NULL,

  data_nascimento           date,
  ocultar_aniversario       boolean NOT NULL DEFAULT false,
  genero                    text,
  pronomes                  text,
  nacionalidade             text,
  telefone_pessoal          text,
  email_comunicacoes        text,
  estado_civil              text,
  dependentes               smallint,
  irs_retencao_percentagem  numeric(5,2),

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid,
  updated_by                uuid,

  CONSTRAINT pessoas_dados_pessoais_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_dados_pessoais_pessoa_unica UNIQUE (pessoa_id),
  CONSTRAINT pessoas_dados_pessoais_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_dados_pessoais_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_dados_pessoais_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_dados_pessoais_genero_valido
    CHECK (genero IS NULL OR genero IN ('feminino','masculino','nao_binario','outro','nao_divulgar')),
  CONSTRAINT pessoas_dados_pessoais_nacionalidade_iso
    CHECK (nacionalidade IS NULL OR nacionalidade ~ '^[A-Z]{2}$'),
  CONSTRAINT pessoas_dados_pessoais_estado_civil_valido
    CHECK (estado_civil IS NULL OR estado_civil IN ('solteiro','casado','uniao_de_facto','divorciado','viuvo','separado')),
  CONSTRAINT pessoas_dados_pessoais_dependentes_validos
    CHECK (dependentes IS NULL OR (dependentes >= 0 AND dependentes <= 30)),
  CONSTRAINT pessoas_dados_pessoais_irs_valido
    CHECK (irs_retencao_percentagem IS NULL OR (irs_retencao_percentagem >= 0 AND irs_retencao_percentagem <= 100)),
  CONSTRAINT pessoas_dados_pessoais_email_formato
    CHECK (email_comunicacoes IS NULL OR email_comunicacoes ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

COMMENT ON TABLE public.pessoas_dados_pessoais IS
'Dados pessoais administrativos da pessoa (1:1). Separado de pessoas para que quem so precisa da lista de colegas e dos cargos (hr.pessoas.view) nao veja data de nascimento, estado civil nem dependentes.';
COMMENT ON COLUMN public.pessoas_dados_pessoais.nacionalidade IS 'ISO 3166-1 alpha-2, em maiusculas.';

CREATE INDEX IF NOT EXISTS idx_pessoas_dados_pessoais_pessoa_id
  ON public.pessoas_dados_pessoais (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_dados_pessoais_organization_id
  ON public.pessoas_dados_pessoais (organization_id);

DROP TRIGGER IF EXISTS trg_pessoas_dados_pessoais_updated_at ON public.pessoas_dados_pessoais;
CREATE TRIGGER trg_pessoas_dados_pessoais_updated_at
  BEFORE UPDATE ON public.pessoas_dados_pessoais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_dados_pessoais_ancora ON public.pessoas_dados_pessoais;
CREATE TRIGGER trg_pessoas_dados_pessoais_ancora
  BEFORE UPDATE ON public.pessoas_dados_pessoais
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

REVOKE ALL ON TABLE public.pessoas_dados_pessoais FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_dados_pessoais TO authenticated;
GRANT ALL ON TABLE public.pessoas_dados_pessoais TO service_role;

ALTER TABLE public.pessoas_dados_pessoais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_dados_pessoais_select ON public.pessoas_dados_pessoais;
CREATE POLICY pessoas_dados_pessoais_select ON public.pessoas_dados_pessoais
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.pessoais.view', organization_id)));

DROP POLICY IF EXISTS pessoas_dados_pessoais_insert ON public.pessoas_dados_pessoais;
CREATE POLICY pessoas_dados_pessoais_insert ON public.pessoas_dados_pessoais
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.pessoais.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_dados_pessoais_update ON public.pessoas_dados_pessoais;
CREATE POLICY pessoas_dados_pessoais_update ON public.pessoas_dados_pessoais
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.pessoais.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.pessoais.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_dados_pessoais_block_delete ON public.pessoas_dados_pessoais;
CREATE POLICY pessoas_dados_pessoais_block_delete ON public.pessoas_dados_pessoais
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ==============================================================================
-- pessoas_identificacao -- 1:1, a tabela do NISS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_identificacao (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id           uuid NOT NULL,
  organization_id     uuid NOT NULL,

  tipo_documento      text,
  numero_documento    text,
  validade_documento  date,
  nif                 text,
  niss                text,
  niss_ultimos4       text GENERATED ALWAYS AS (right(niss, 4)) STORED,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  updated_by          uuid,

  CONSTRAINT pessoas_identificacao_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_identificacao_pessoa_unica UNIQUE (pessoa_id),
  CONSTRAINT pessoas_identificacao_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_identificacao_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_identificacao_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_identificacao_tipo_valido
    CHECK (tipo_documento IS NULL OR tipo_documento IN ('cartao_cidadao','passaporte','titulo_residencia','outro')),
  CONSTRAINT pessoas_identificacao_nif_formato  CHECK (nif  IS NULL OR nif  ~ '^[0-9]{9}$'),
  CONSTRAINT pessoas_identificacao_niss_formato CHECK (niss IS NULL OR niss ~ '^[0-9]{11}$')
);

COMMENT ON TABLE public.pessoas_identificacao IS
'Documento de identificacao, NIF e NISS da pessoa (1:1). A coluna niss NAO e legivel nem escrivel por authenticated -- o fecho e por GRANT ao nivel da coluna, porque a RLS decide linhas e nao colunas. A interface mostra niss_ultimos4; o valor em claro entra por rpc_hr_definir_niss e sai por rpc_hr_revelar_niss, ambas auditadas. ATENCAO a quem escreve a interface: com grants de coluna, um select=* nesta tabela devolve erro de permissao -- pedir sempre as colunas explicitamente.';
COMMENT ON COLUMN public.pessoas_identificacao.niss IS
'NISS em claro. Sem SELECT, INSERT nem UPDATE para authenticated. So RPC.';
COMMENT ON COLUMN public.pessoas_identificacao.niss_ultimos4 IS
'Os quatro ultimos digitos do NISS, gerados. E o que a interface mostra.';

CREATE INDEX IF NOT EXISTS idx_pessoas_identificacao_pessoa_id
  ON public.pessoas_identificacao (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_identificacao_organization_id
  ON public.pessoas_identificacao (organization_id);

DROP TRIGGER IF EXISTS trg_pessoas_identificacao_updated_at ON public.pessoas_identificacao;
CREATE TRIGGER trg_pessoas_identificacao_updated_at
  BEFORE UPDATE ON public.pessoas_identificacao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_identificacao_ancora ON public.pessoas_identificacao;
CREATE TRIGGER trg_pessoas_identificacao_ancora
  BEFORE UPDATE ON public.pessoas_identificacao
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Grants ao nivel da COLUNA: e aqui que o NISS fica fechado -------------
-- Primeiro tirar tudo, depois dar so o que se quer. Fazer ao contrario
-- (GRANT ALL e depois REVOKE da coluna) deixaria o privilegio ao nivel da
-- tabela a sobrepor-se ao da coluna.
REVOKE ALL ON TABLE public.pessoas_identificacao FROM anon;
REVOKE ALL ON TABLE public.pessoas_identificacao FROM authenticated;

GRANT SELECT (
  id, pessoa_id, organization_id,
  tipo_documento, numero_documento, validade_documento,
  nif, niss_ultimos4,
  created_at, updated_at, created_by, updated_by
) ON TABLE public.pessoas_identificacao TO authenticated;

GRANT INSERT (
  id, pessoa_id, organization_id,
  tipo_documento, numero_documento, validade_documento,
  nif, created_by, updated_by
) ON TABLE public.pessoas_identificacao TO authenticated;

GRANT UPDATE (
  tipo_documento, numero_documento, validade_documento,
  nif, updated_by
) ON TABLE public.pessoas_identificacao TO authenticated;

GRANT ALL ON TABLE public.pessoas_identificacao TO service_role;

ALTER TABLE public.pessoas_identificacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_identificacao_select ON public.pessoas_identificacao;
CREATE POLICY pessoas_identificacao_select ON public.pessoas_identificacao
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.identificacao.view', organization_id)));

DROP POLICY IF EXISTS pessoas_identificacao_insert ON public.pessoas_identificacao;
CREATE POLICY pessoas_identificacao_insert ON public.pessoas_identificacao
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.identificacao.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_identificacao_update ON public.pessoas_identificacao;
CREATE POLICY pessoas_identificacao_update ON public.pessoas_identificacao
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.identificacao.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.identificacao.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_identificacao_block_delete ON public.pessoas_identificacao;
CREATE POLICY pessoas_identificacao_block_delete ON public.pessoas_identificacao
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ---- RPC: revelar o NISS ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hr_revelar_niss(p_pessoa_id uuid)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org  uuid;
  v_niss text;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'pessoa_nao_encontrada';
  END IF;

  IF NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.identificacao.reveal', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  SELECT pi.niss INTO v_niss
  FROM public.pessoas_identificacao pi
  WHERE pi.pessoa_id = p_pessoa_id;

  -- Regista ANTES de devolver: se a escrita da auditoria falhar, o valor nao
  -- sai. Uma revelacao que nao fica registada nao deve acontecer.
  PERFORM public.hr_registar_acesso_sensivel(p_pessoa_id, v_org, 'niss', 'revelar');

  RETURN v_niss;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_revelar_niss(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_revelar_niss(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_revelar_niss(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_revelar_niss(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_revelar_niss(uuid) IS
'Unico caminho para obter o NISS em claro. Exige hr.pessoas.identificacao.reveal na organizacao da pessoa e escreve a linha de auditoria antes de devolver o valor.';

-- ---- RPC: definir o NISS ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hr_definir_niss(p_pessoa_id uuid, p_niss text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'pessoa_nao_encontrada';
  END IF;

  IF NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.identificacao.edit', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF p_niss IS NOT NULL AND p_niss !~ '^[0-9]{11}$' THEN
    RAISE EXCEPTION 'niss_invalido';
  END IF;

  INSERT INTO public.pessoas_identificacao (pessoa_id, organization_id, niss)
  VALUES (p_pessoa_id, v_org, p_niss)
  ON CONFLICT (pessoa_id) DO UPDATE
    SET niss = EXCLUDED.niss, updated_at = now();

  PERFORM public.hr_registar_acesso_sensivel(p_pessoa_id, v_org, 'niss', 'alterar');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_definir_niss(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_definir_niss(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_definir_niss(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_definir_niss(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_definir_niss(uuid, text) IS
'Unico caminho para escrever o NISS. Exige hr.pessoas.identificacao.edit na organizacao da pessoa, valida o formato de 11 digitos e regista a alteracao.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  t text;
  v_politicas integer;
  v_rls boolean;
  v_niss_legivel boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['pessoas_dados_pessoais','pessoas_identificacao','pessoas_acessos_sensiveis'] LOOP
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
  END LOOP;

  -- O ponto central desta migracao: a coluna niss nao pode ser legivel por
  -- authenticated. Se este teste passar a falhar, o mascaramento do NISS caiu.
  SELECT has_column_privilege('authenticated', 'public.pessoas_identificacao', 'niss', 'SELECT')
    INTO v_niss_legivel;

  IF v_niss_legivel THEN
    RAISE EXCEPTION
      'authenticated consegue ler a coluna niss. O mascaramento por grant de coluna nao ficou aplicado -- nao aplicar esta migracao neste estado.';
  END IF;

  IF has_column_privilege('authenticated', 'public.pessoas_identificacao', 'niss', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated consegue escrever a coluna niss directamente. Devia so por rpc_hr_definir_niss.';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.pessoas_identificacao', 'niss_ultimos4', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated nao consegue ler niss_ultimos4; a interface ficaria sem nada para mostrar.';
  END IF;

  RAISE NOTICE 'OK: 3 tabelas criadas com RLS e 4 politicas cada; coluna niss fechada a authenticated (leitura e escrita), niss_ultimos4 legivel.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr "supabase migration list". Se 20261120* colidir, renumerar o bloco
--    inteiro mantendo a ordem relativa.
--
-- 2. Confirmar que 20261120010000, 20261120020000 e 20261120030000 vao a frente
--    desta na fila.
--
-- 3. So cria objectos novos; nenhuma tabela ou politica existente e alterada,
--    por isso nao ha janela de estado defeituoso na base partilhada.
--
-- 4. DEPOIS de aplicar, avisar quem escreve a interface: pessoas_identificacao
--    tem grants ao nivel da coluna, logo select=* devolve erro de permissao.
--    Os hooks tem de listar as colunas.
-- ==============================================================================
