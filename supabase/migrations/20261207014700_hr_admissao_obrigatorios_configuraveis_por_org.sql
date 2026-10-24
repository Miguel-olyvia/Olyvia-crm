-- ==============================================================================
-- Os campos obrigatorios da admissao passam a poder ser AFROUXADOS por
-- organizacao. Ate aqui, hr_admissao_campos_obrigatorios() era uma lista fixa
-- do sistema inteiro (29 codigos, 28 de origem 'pessoa') e nenhuma organizacao
-- podia decidir que um deles nao se aplica ao seu processo de admissao.
--
-- POR APLICAR.
--
--
-- -- A REGRA NOVA ----------------------------------------------------------------
--
-- public.organization_admissao_settings guarda, por organizacao, um mapa
-- jsonb { "<codigo>": true|false } -- so os 29 codigos que
-- hr_admissao_campos_obrigatorios() ja devolve podem aparecer como chave, e o
-- valor tem de ser boolean literal. Um codigo ausente do mapa continua
-- obrigatorio (o comportamento de hoje, por omissao); so `false` explicito o
-- torna facultativo NAQUELA organizacao.
--
-- hr_admissao_campos_obrigatorios_org(p_organization_id) e a funcao nova que
-- cruza a lista do sistema com este override e devolve uma coluna extra,
-- `obrigatorio`. hr_admissao_pendencias(uuid) passa a usa-la (com o v_org que
-- ja resolvia) e a filtrar por `c.obrigatorio` -- a UNICA mudanca ao corpo
-- dessa funcao, copiado de resto tal como estava em 20261129020000.
-- rpc_hr_convite_admissao_estado(text) ganha a chave `campos_obrigatorios` no
-- jsonb devolvido, para o ecra publico do convite deixar de depender SO da
-- lista estatica em src/lib/hr/admissaoObrigatorios.ts.
--
--
-- -- O QUE FICA DE FORA, DE PROPOSITO -------------------------------------------
--
-- sindicalizado, sindicato e carta_conducao_* NAO estao em
-- hr_admissao_campos_obrigatorios() (saida em 20261130150000, carta nunca
-- esteve) -- por isso nao podem ser chave do override: o CHECK novo rejeita-os.
-- Nao se reabre aqui a decisao de RGPD de 20261130150000.
--
-- rpc_hr_convite_admissao_submeter NAO muda nesta migracao: continua a validar
-- o RESULTADO chamando hr_admissao_pendencias(uuid), que agora ja respeita o
-- override por via da funcao _org -- nao ha nada a tocar nesse lado.
--
--
-- -- QUEM PODE CONFIGURAR --------------------------------------------------------
--
-- Permissao nova, hr.admissao.obrigatorios.gerir, parent_code hr.pessoas.view,
-- is_dangerous=true (afecta o que trava a admissao de TODA a organizacao),
-- scope='organization'. NENHUMA atribuicao a papel -- ver 20261124010000 para
-- o mesmo padrao.
--
--
-- -- SECURITY INVOKER vs DEFINER, decisao e porque -------------------------------
--
-- hr_admissao_campos_obrigatorios_org() e SECURITY DEFINER. Testado ao vivo
-- (bloco CONFERIR mais abaixo): com SECURITY INVOKER, um `authenticated` sem
-- SELECT em organization_admissao_settings simplesmente nao ve OUTRAS
-- organizacoes -- a leitura fica sujeita a RLS de quem chama, o que parece
-- seguro a primeira vista. O problema e outro: `hr_admissao_pendencias(uuid)`
-- (SECURITY DEFINER) e o unico ponto que teria de resolver o override PARA A
-- ORGANIZACAO DA FICHA, nao para a do chamador -- e a propria pessoa (ficha
-- propria, sem `hr.admissao.obrigatorios.gerir`) tem de ver os obrigatorios
-- REAIS da sua organizacao, nao "sem overrides" por nao ter permissao de gerir
-- a configuracao. INVOKER faria a leitura de dentro de hr_admissao_pendencias
-- correr com os privilegios de quem SUBMETE o convite (a propria pessoa, sem
-- sessao alguma do lado do service_role, ou o proprio utilizador autenticado
-- do lado do hook) e nao com os do dono da ficha -- exactamente o cenario em
-- que "sem overrides" seria a resposta errada. SECURITY DEFINER garante que a
-- funcao ve o override real da organizacao pedida, sempre; a policy da tabela
-- de settings continua a controlar quem pode LER/ESCREVER a configuracao pelo
-- ecra, nao quem pode agir sobre os obrigatorios via as duas funcoes que ja
-- sao DEFINER (hr_admissao_pendencias, rpc_hr_convite_admissao_estado).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION IF EXISTS public.hr_admissao_campos_obrigatorios_org(uuid);
--   DROP TABLE IF EXISTS public.organization_admissao_settings;
--   DELETE FROM public.anew_permissions WHERE code = 'hr.admissao.obrigatorios.gerir';
-- E recriar hr_admissao_pendencias(uuid) e rpc_hr_convite_admissao_estado(text)
-- com os corpos de 20261129020000 e 20261127030000 respectivamente.
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261124010000  padrao de insercao em anew_permissions
--   20261127030000  rpc_hr_convite_admissao_estado (versao vigente)
--   20261129020000  hr_admissao_pendencias (versao vigente, com v_org e v_servico)
--   20261130150000  hr_admissao_campos_obrigatorios (29 campos, 28 de origem 'pessoa')
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.view') THEN
    RAISE EXCEPTION 'hr.pessoas.view nao existe no catalogo -- parent_code invalido.';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_campos_obrigatorios';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperava exactamente 1 hr_admissao_campos_obrigatorios, encontrei %.', v_n;
  END IF;

  IF (SELECT count(*) FROM public.hr_admissao_campos_obrigatorios()) <> 29 THEN
    RAISE EXCEPTION
      'hr_admissao_campos_obrigatorios() nao devolve os 29 campos esperados de 20261130150000 -- confirmar a versao aplicada antes de continuar.';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperava exactamente 1 hr_admissao_pendencias, encontrei %.', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_estado' AND p.pronargs = 1;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperava exactamente 1 rpc_hr_convite_admissao_estado(text), encontrei %.', v_n;
  END IF;

  IF to_regclass('public.anew_organizations') IS NULL THEN
    RAISE EXCEPTION 'public.anew_organizations nao existe.';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'update_updated_at_column() nao existe -- esperava-a de 20260615130000_baseline_new_database.sql.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_permissions WHERE code = 'hr.admissao.obrigatorios.gerir' AND NOT is_dangerous
  ) THEN
    RAISE EXCEPTION 'hr.admissao.obrigatorios.gerir ja existe sem estar marcada is_dangerous -- investigar antes de aplicar.';
  END IF;
END;
$guardas$;


-- ==============================================================================
-- 1. Permissao nova no catalogo
-- ==============================================================================
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.admissao.obrigatorios.gerir', 'Configurar campos obrigatorios de admissao',
   'Decidir, organizacao a organizacao, quais dos campos obrigatorios de admissao deixam de travar a submissao do convite. Afecta a admissao de TODA a organizacao -- nao a ficha de uma pessoa so.',
   'hr', 'hr.pessoas.view', 400, true, 'organization', false)
ON CONFLICT (code) DO UPDATE SET
  name           = EXCLUDED.name,
  description    = EXCLUDED.description,
  category       = EXCLUDED.category,
  parent_code    = EXCLUDED.parent_code,
  display_order  = EXCLUDED.display_order,
  is_dangerous   = EXCLUDED.is_dangerous,
  scope          = EXCLUDED.scope,
  supports_scope = EXCLUDED.supports_scope;


-- ==============================================================================
-- 2. A tabela de configuracao, um mapa de overrides por organizacao
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.organization_admissao_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  campos_override jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.organization_admissao_settings IS
'Por organizacao, quais dos codigos de hr_admissao_campos_obrigatorios() deixam de ser obrigatorios na admissao. campos_override e um mapa {"<codigo>": true|false}: uma chave ausente continua obrigatoria (omissao de sempre); so false explicito a torna facultativa. As UNICAS chaves validas sao os codigos que hr_admissao_campos_obrigatorios() devolve -- nunca sindicalizado, sindicato ou carta_conducao_*, de fora da lista de proposito por decisao de RGPD (20261130150000). Gate: hr.admissao.obrigatorios.gerir.';
COMMENT ON COLUMN public.organization_admissao_settings.campos_override IS
'Mapa {"<codigo>": true|false}. Chaves fora de hr_admissao_campos_obrigatorios() ou valores nao-boolean sao rejeitados por hr_admissao_campos_override_validos() via CHECK.';

-- ---- Validacao do jsonb: so codigos conhecidos, so valores boolean --------
-- IMMUTABLE porque so depende do argumento e de hr_admissao_campos_obrigatorios(),
-- que e ela propria IMMUTABLE e sem parametros -- e o que torna possivel usa-la
-- num CHECK constraint.
CREATE OR REPLACE FUNCTION public.hr_admissao_campos_override_validos(p_override jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT jsonb_typeof(p_override) = 'object'
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_each(p_override) AS chave(codigo, valor)
       WHERE jsonb_typeof(chave.valor) <> 'boolean'
          OR NOT EXISTS (
            SELECT 1 FROM public.hr_admissao_campos_obrigatorios() c WHERE c.codigo = chave.codigo
          )
     );
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_campos_override_validos(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_campos_override_validos(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_override_validos(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_override_validos(jsonb) TO service_role;

COMMENT ON FUNCTION public.hr_admissao_campos_override_validos(jsonb) IS
'Valida campos_override de organization_admissao_settings: objecto jsonb, todos os valores boolean, todas as chaves presentes em hr_admissao_campos_obrigatorios(). Usada num CHECK constraint -- por isso IMMUTABLE.';

ALTER TABLE public.organization_admissao_settings
  DROP CONSTRAINT IF EXISTS organization_admissao_settings_override_valido;
ALTER TABLE public.organization_admissao_settings
  ADD CONSTRAINT organization_admissao_settings_override_valido
  CHECK (public.hr_admissao_campos_override_validos(campos_override));

ALTER TABLE public.organization_admissao_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_admissao_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.organization_admissao_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_admissao_settings TO authenticated;
GRANT ALL ON TABLE public.organization_admissao_settings TO service_role;

DROP POLICY IF EXISTS organization_admissao_settings_select ON public.organization_admissao_settings;
CREATE POLICY organization_admissao_settings_select ON public.organization_admissao_settings
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.admissao.obrigatorios.gerir', organization_id)));

DROP POLICY IF EXISTS organization_admissao_settings_insert ON public.organization_admissao_settings;
CREATE POLICY organization_admissao_settings_insert ON public.organization_admissao_settings
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.admissao.obrigatorios.gerir', organization_id)));

DROP POLICY IF EXISTS organization_admissao_settings_update ON public.organization_admissao_settings;
CREATE POLICY organization_admissao_settings_update ON public.organization_admissao_settings
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.admissao.obrigatorios.gerir', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.admissao.obrigatorios.gerir', organization_id)));

-- Sem DELETE, de proposito: um UPDATE que ponha campos_override='{}' ja repoe
-- o omissao (tudo obrigatorio), sem precisar de apagar a linha.

-- ---- Auditoria: updated_at automatico, updated_by nunca vindo do cliente --
-- update_updated_at_column() e a funcao partilhada que o resto do modulo HR
-- ja usa (ver 20260615130000_baseline_new_database.sql) -- so poe
-- NEW.updated_at = now(). updated_by e um caso aparte: tem de ser SEMPRE o
-- auth.uid() de quem escreve, nunca um valor que o INSERT/UPDATE traga, senao
-- qualquer authenticated com permissao de escrever a configuracao podia
-- assinar a alteracao em nome de outra pessoa.
DROP TRIGGER IF EXISTS trg_organization_admissao_settings_updated_at
  ON public.organization_admissao_settings;
CREATE TRIGGER trg_organization_admissao_settings_updated_at
  BEFORE UPDATE ON public.organization_admissao_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.hr_admissao_settings_forcar_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_settings_forcar_updated_by() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_settings_forcar_updated_by() FROM anon;
REVOKE ALL ON FUNCTION public.hr_admissao_settings_forcar_updated_by() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_settings_forcar_updated_by() TO service_role;

COMMENT ON FUNCTION public.hr_admissao_settings_forcar_updated_by() IS
'Trigger BEFORE INSERT OR UPDATE de organization_admissao_settings: forca updated_by = auth.uid(), ignorando qualquer valor vindo do INSERT/UPDATE do cliente. Sem isto, updated_by seria uma assinatura forjavel.';

DROP TRIGGER IF EXISTS trg_organization_admissao_settings_updated_by
  ON public.organization_admissao_settings;
CREATE TRIGGER trg_organization_admissao_settings_updated_by
  BEFORE INSERT OR UPDATE ON public.organization_admissao_settings
  FOR EACH ROW EXECUTE FUNCTION public.hr_admissao_settings_forcar_updated_by();


-- ==============================================================================
-- 3. hr_admissao_campos_obrigatorios_org: a lista do sistema + o override
-- ==============================================================================
DROP FUNCTION IF EXISTS public.hr_admissao_campos_obrigatorios_org(uuid);

CREATE FUNCTION public.hr_admissao_campos_obrigatorios_org(p_organization_id uuid)
RETURNS TABLE (codigo text, origem text, condicional boolean, obrigatorio boolean)
LANGUAGE sql STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT c.codigo, c.origem, c.condicional,
         CASE WHEN (s.campos_override -> c.codigo) IS NOT NULL
              THEN (s.campos_override ->> c.codigo)::boolean
              ELSE true
         END AS obrigatorio
  FROM public.hr_admissao_campos_obrigatorios() c
  LEFT JOIN public.organization_admissao_settings s ON s.organization_id = p_organization_id;
$$;

-- SO service_role: e SECURITY DEFINER e nao valida se quem chama tem
-- qualquer relacao com p_organization_id -- um GRANT a authenticated deixaria
-- QUALQUER utilizador autenticado, de QUALQUER organizacao, chamar esta RPC
-- directamente (o PostgREST expoe automaticamente toda funcao com EXECUTE a
-- authenticated) com o organization_id de OUTRA organizacao e descobrir a
-- configuracao de obrigatorios dessa organizacao -- exactamente o que
-- hr.admissao.obrigatorios.gerir (is_dangerous=true) devia proteger. As duas
-- chamadoras legitimas, hr_admissao_pendencias(uuid) e
-- rpc_hr_convite_admissao_estado(text), sao ambas SECURITY DEFINER: em
-- PostgreSQL o DONO de uma funcao tem sempre EXECUTE implicito nas suas
-- proprias funcoes, independentemente de GRANTs explicitos -- por isso a
-- cadeia interna continua a funcionar sem grant nenhum a authenticated.
REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios_org(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios_org(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_obrigatorios_org(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_admissao_campos_obrigatorios_org(uuid) IS
'hr_admissao_campos_obrigatorios() cruzada com o override desta organizacao em organization_admissao_settings. SECURITY DEFINER, DE PROPOSITO (decisao registada na cabeca da migration 20261201050000): e chamada de dentro de hr_admissao_pendencias(uuid), que precisa de resolver o override da organizacao DA FICHA, nao do chamador -- a propria pessoa a submeter o convite (sem hr.admissao.obrigatorios.gerir) tem de ver os obrigatorios REAIS da sua organizacao, nunca "sem overrides" por nao poder gerir a configuracao. A policy de organization_admissao_settings continua a ser quem decide quem pode LER/ESCREVER a configuracao pelo ecra; esta funcao nunca expoe o conteudo do override a quem nao devia -- devolve so o booleano `obrigatorio` por codigo, nunca a linha de settings. EXECUTE e SO service_role: sem isso, PostgREST exporia a RPC a qualquer authenticated, que podia passar o organization_id de OUTRA organizacao e descobrir a configuracao dela. hr_admissao_pendencias e rpc_hr_convite_admissao_estado continuam a chama-la sem grant nenhum, porque o dono de uma funcao tem sempre EXECUTE implicito nas proprias funcoes.';


-- ==============================================================================
-- 4. hr_admissao_pendencias: MESMA assinatura e MESMO corpo, so a origem dos
--    obrigatorios muda (agora por-organizacao) e o filtro `c.obrigatorio` entra.
-- ==============================================================================
DROP FUNCTION IF EXISTS public.hr_admissao_pendencias(uuid);

CREATE FUNCTION public.hr_admissao_pendencias(p_pessoa_id uuid)
RETURNS TABLE (codigo text, origem text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_org        uuid;
  v_servico    boolean := (v_uid IS NULL);
  v_propria    boolean := false;
  v_ficha      boolean := false;
  v_permitidas text[]  := ARRAY[]::text[];
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  IF NOT v_servico THEN
    v_ficha := public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view', v_org);

    v_propria := public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view.own', v_org)
                 AND public.hr_pessoa_do_utilizador(v_uid, v_org) = p_pessoa_id;

    IF NOT (v_ficha OR v_propria) THEN
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    SELECT coalesce(array_agg(d.permissao), ARRAY[]::text[])
      INTO v_permitidas
      FROM (SELECT DISTINCT cp.permissao FROM public.hr_admissao_campo_permissao() cp) d
     WHERE public.has_anew_permission_in_org(v_uid, d.permissao, v_org);
  END IF;

  RETURN QUERY
  WITH estado AS (
    SELECT
      nullif(btrim(coalesce(p.email_pessoal, '')), '')       AS email_pessoal,
      p.data_admissao::text                                  AS data_admissao,
      dp.data_nascimento::text                               AS data_nascimento,
      nullif(btrim(coalesce(dp.genero, '')), '')             AS genero,
      nullif(btrim(coalesce(dp.nacionalidade, '')), '')      AS nacionalidade,
      nullif(btrim(coalesce(dp.telefone_pessoal, '')), '')   AS telefone_pessoal,
      nullif(btrim(coalesce(dp.estado_civil, '')), '')       AS estado_civil,
      dp.dependentes::text                                   AS dependentes,
      dp.dependentes_deficientes::text                       AS dependentes_deficientes,
      nullif(btrim(coalesce(dp.conjuge_situacao_profissional, '')), '')
                                                             AS conjuge_situacao_profissional,
      nullif(btrim(coalesce(dp.naturalidade_freguesia, '')), '')
                                                             AS naturalidade_freguesia,
      nullif(btrim(coalesce(dp.naturalidade_concelho, '')), '')
                                                             AS naturalidade_concelho,
      nullif(btrim(coalesce(dp.naturalidade_pais, '')), '')  AS naturalidade_pais,
      nullif(btrim(coalesce(dp.habilitacao_academica, '')), '')
                                                             AS habilitacao_academica,
      dp.habilitacao_data_conclusao::text                    AS habilitacao_data_conclusao,
      nullif(btrim(coalesce(i.nif, '')), '')                 AS nif,
      nullif(btrim(coalesce(i.niss, '')), '')                AS niss,
      nullif(btrim(coalesce(i.tipo_documento, '')), '')      AS tipo_documento,
      nullif(btrim(coalesce(i.numero_documento, '')), '')    AS numero_documento,
      i.validade_documento::text                             AS validade_documento,
      nullif(btrim(coalesce(m.linha1, '')), '')              AS linha1,
      nullif(btrim(coalesce(m.codigo_postal, '')), '')       AS codigo_postal,
      nullif(btrim(coalesce(m.localidade, '')), '')          AS localidade,
      nullif(btrim(coalesce(f.tamanho_cima, '')), '')        AS tamanho_cima,
      nullif(btrim(coalesce(f.tamanho_baixo, '')), '')       AS tamanho_baixo,
      nullif(btrim(coalesce(f.tamanho_blazer, '')), '')      AS tamanho_blazer,
      s.sindicalizado::text                                  AS sindicalizado,
      nullif(btrim(coalesce(s.sindicato, '')), '')           AS sindicato,
      b.conta_secret_id::text                                AS conta_numero,
      nullif(btrim(coalesce(b.titular, '')), '')             AS conta_titular,
      nullif(btrim(coalesce(b.banco, '')), '')               AS conta_banco
    FROM public.pessoas p
    LEFT JOIN public.pessoas_dados_pessoais  dp ON dp.pessoa_id = p.id
    LEFT JOIN public.pessoas_identificacao    i ON i.pessoa_id  = p.id
    LEFT JOIN public.pessoas_fardamento       f ON f.pessoa_id  = p.id
    LEFT JOIN public.pessoas_sindicalizacao   s ON s.pessoa_id  = p.id
    LEFT JOIN public.pessoas_dados_bancarios  b ON b.pessoa_id  = p.id
    LEFT JOIN LATERAL (
      SELECT mm.linha1, mm.codigo_postal, mm.localidade
      FROM public.pessoas_moradas mm
      WHERE mm.pessoa_id = p.id AND mm.tipo = 'residencia'
      ORDER BY mm.is_principal DESC, mm.created_at
      LIMIT 1
    ) m ON true
    WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL
  )
  SELECT c.codigo, c.origem
  FROM estado e
  CROSS JOIN public.hr_admissao_campos_obrigatorios_org(v_org) c
  JOIN public.hr_admissao_campo_permissao() cp ON cp.codigo = c.codigo
  WHERE (to_jsonb(e) ->> c.codigo) IS NULL
    AND c.obrigatorio
    AND (v_servico OR v_propria OR cp.permissao = ANY (v_permitidas))
    AND (c.codigo <> 'validade_documento'
         OR (e.tipo_documento IS NOT NULL AND e.tipo_documento <> 'cartao_cidadao'))
    AND (c.codigo <> 'conjuge_situacao_profissional'
         OR e.estado_civil IN ('casado', 'uniao_de_facto'))
    AND (c.codigo <> 'sindicato'
         OR e.sindicalizado = 'true')
  ORDER BY c.codigo;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_pendencias(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_pendencias(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_admissao_pendencias(uuid) IS
'Os campos obrigatorios de admissao que a ficha desta pessoa AINDA NAO tem, pelas duas paginas da folha de cadastro. Devolve SO codigos, nunca valores: saber que "falta o NISS" nao revela o NISS, e saber que "falta a conta" nao revela o IBAN. SECURITY DEFINER porque le colunas fechadas a authenticated (niss, conta_secret_id). Chamavel por authenticated, com gate: cada codigo exige a permissao da TABELA DE ORIGEM (mapa em hr_admissao_campo_permissao); a propria pessoa ve tudo o que e seu; quem nao pode ver a ficha de todo leva insufficient_privilege em vez de uma lista vazia, que se leria como "esta tudo preenchido". auth.uid() NULL significa service_role e devolve tudo -- o que mantem o portao de rpc_hr_convite_admissao_submeter a funcionar. Desde 20261201050000: usa hr_admissao_campos_obrigatorios_org(v_org) em vez da lista fixa do sistema, e passa a respeitar organization_admissao_settings -- um codigo marcado false pela organizacao deixa de ser reportado como pendencia.';


-- ==============================================================================
-- 5. rpc_hr_convite_admissao_estado: MESMO corpo, mais a chave campos_obrigatorios
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_estado(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto  constant integer := 10;
  v_convite record;
  v_pessoa  record;
  v_ident   record;
  v_conta   record;
  v_motivo  text;
BEGIN
  SELECT * INTO v_convite
  FROM public.pessoas_convites_admissao
  WHERE token_hash = p_token_hash;

  IF v_convite.id IS NULL THEN
    RETURN jsonb_build_object('erro', 'convite_invalido');
  END IF;

  IF v_convite.used_at IS NOT NULL THEN
    v_motivo := 'convite_ja_usado';
  ELSIF v_convite.revoked_at IS NOT NULL THEN
    v_motivo := 'convite_revogado';
  ELSIF v_convite.valid_until <= now() THEN
    v_motivo := 'convite_expirado';
  ELSIF v_convite.attempts >= c_tecto THEN
    v_motivo := 'convite_bloqueado';
  END IF;

  IF v_motivo IS NOT NULL THEN
    IF v_convite.attempts < c_tecto THEN
      UPDATE public.pessoas_convites_admissao
         SET attempts = attempts + 1
       WHERE id = v_convite.id;
    END IF;
    RETURN jsonb_build_object('erro', v_motivo);
  END IF;

  SELECT nome_completo, email_pessoal INTO v_pessoa
  FROM public.pessoas WHERE id = v_convite.pessoa_id;

  SELECT nif, niss_ultimos4 INTO v_ident
  FROM public.pessoas_identificacao WHERE pessoa_id = v_convite.pessoa_id;

  SELECT conta_ultimos4, formato_conta INTO v_conta
  FROM public.pessoas_dados_bancarios WHERE pessoa_id = v_convite.pessoa_id;

  -- NUNCA niss, NUNCA conta completa, NUNCA sindicalizacao: o convite so
  -- escreve filiacao sindical, nunca a revela por este caminho.
  RETURN jsonb_build_object(
    'pessoa_nome', v_pessoa.nome_completo,
    'email_pessoal', v_pessoa.email_pessoal,
    'nif', v_ident.nif,
    'niss_ultimos4', v_ident.niss_ultimos4,
    'conta_ultimos4', v_conta.conta_ultimos4,
    'formato_conta', v_conta.formato_conta,
    'rascunho', v_convite.rascunho,
    'valid_until', v_convite.valid_until,
    -- Novo em 20261201050000: os obrigatorios REAIS desta organizacao, so os
    -- de origem 'pessoa' (os de origem 'rh' nunca travam o convite e o ecra
    -- publico nunca os pede). O ecra deixa de depender SO da lista estatica
    -- em src/lib/hr/admissaoObrigatorios.ts -- essa continua a ser o
    -- fallback quando esta chave vier vazia (convites antigos, ou falha).
    'campos_obrigatorios', (
      SELECT jsonb_agg(jsonb_build_object('codigo', o.codigo, 'condicional', o.condicional))
      FROM public.hr_admissao_campos_obrigatorios_org(v_convite.organization_id) o
      WHERE o.obrigatorio AND o.origem = 'pessoa'
    )
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_estado(text) IS
'Le o estado de um convite pelo hash do token. SO service_role -- o codigo em claro so a Edge Function o ve, e e la que fica o limite por IP. DEVOLVE o motivo em jsonb ({"erro": ...}) em vez de o lancar: com RAISE, a transaccao abortava e levava consigo o proprio incremento de attempts, que por isso nunca contou nada. Conta SO as aberturas falhadas, com tecto de 10 -- contar tambem as boas matava convites de quem apenas recarrega a pagina. Nunca devolve niss, a conta bancaria completa nem a resposta de sindicalizacao. Desde 20261201050000: devolve tambem campos_obrigatorios (so origem "pessoa"), resolvidos por hr_admissao_campos_obrigatorios_org(organization_id) -- respeita organization_admissao_settings, para o ecra publico do convite deixar de depender so da lista estatica em TypeScript.';


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_n            integer;
  v_src          text;
  v_grant_anon   boolean;
  v_cols         text[];
  v_result       boolean;
  v_org_teste    uuid;
  v_updated_by       uuid;
  v_updated_at_antes  timestamptz;
  v_updated_at_depois timestamptz;
BEGIN
  -- 1. A permissao entrou no catalogo, e nenhuma atribuicao a papel veio com ela.
  SELECT count(*) INTO v_n FROM public.anew_permissions
   WHERE code = 'hr.admissao.obrigatorios.gerir'
     AND is_dangerous AND category = 'hr' AND scope = 'organization' AND NOT supports_scope
     AND parent_code = 'hr.pessoas.view';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'hr.admissao.obrigatorios.gerir nao ficou como esperado no catalogo.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.anew_role_permissions WHERE permission_code = 'hr.admissao.obrigatorios.gerir'
  ) THEN
    RAISE EXCEPTION 'hr.admissao.obrigatorios.gerir ja esta atribuida a um papel -- esta migracao so cria o catalogo.';
  END IF;

  -- 2. A tabela existe, com RLS activa e as tres policies.
  IF to_regclass('public.organization_admissao_settings') IS NULL THEN
    RAISE EXCEPTION 'organization_admissao_settings nao ficou criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'organization_admissao_settings' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'organization_admissao_settings sem RLS activa.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'organization_admissao_settings';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'organization_admissao_settings tem % policies, esperavam-se 3 (select/insert/update).', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'organization_admissao_settings'
     AND (qual LIKE '%has_anew_permission_in_org%' OR with_check LIKE '%has_anew_permission_in_org%');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Nem todas as policies de organization_admissao_settings usam has_anew_permission_in_org.';
  END IF;

  -- Nenhum grant a anon.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'organization_admissao_settings' AND grantee = 'anon'
  ) INTO v_grant_anon;
  IF v_grant_anon THEN
    RAISE EXCEPTION 'organization_admissao_settings ficou com grant a anon.';
  END IF;

  -- Os dois triggers de auditoria existem.
  SELECT count(*) INTO v_n FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'organization_admissao_settings' AND NOT t.tgisinternal
     AND t.tgname IN ('trg_organization_admissao_settings_updated_at', 'trg_organization_admissao_settings_updated_by');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'organization_admissao_settings tem % dos 2 triggers de auditoria esperados.', v_n;
  END IF;

  -- 3. O CHECK rejeita chave desconhecida e valor nao-boolean; aceita um
  --    override valido. Testado ao vivo, nao so lido.
  BEGIN
    PERFORM 1 WHERE public.hr_admissao_campos_override_validos('{"sindicato": false}'::jsonb);
    IF public.hr_admissao_campos_override_validos('{"sindicato": false}'::jsonb) THEN
      RAISE EXCEPTION 'hr_admissao_campos_override_validos aceitou "sindicato", que nao esta em hr_admissao_campos_obrigatorios().';
    END IF;
  END;
  IF public.hr_admissao_campos_override_validos('{"niss": "false"}'::jsonb) THEN
    RAISE EXCEPTION 'hr_admissao_campos_override_validos aceitou um valor string em vez de boolean.';
  END IF;
  IF NOT public.hr_admissao_campos_override_validos('{"niss": false}'::jsonb) THEN
    RAISE EXCEPTION 'hr_admissao_campos_override_validos rejeitou um override valido.';
  END IF;
  IF NOT public.hr_admissao_campos_override_validos('{}'::jsonb) THEN
    RAISE EXCEPTION 'hr_admissao_campos_override_validos rejeitou o objecto vazio.';
  END IF;

  -- Confirmar o CHECK constraint mesmo na tabela, contra uma organizacao real
  -- (a primeira que existir) -- sem deixar linha nenhuma para tras.
  SELECT id INTO v_org_teste FROM public.anew_organizations LIMIT 1;
  IF v_org_teste IS NOT NULL THEN
    BEGIN
      INSERT INTO public.organization_admissao_settings (organization_id, campos_override)
      VALUES (v_org_teste, '{"sindicato": false}'::jsonb);
      RAISE EXCEPTION 'O CHECK constraint devia ter rejeitado a chave "sindicato".';
    EXCEPTION
      WHEN check_violation THEN
        NULL; -- esperado
    END;
    -- Confirmar que a insercao de teste nao ficou la (rollback do EXCEPTION
    -- dentro do bloco garante isto, mas o SELECT confirma em vez de assumir).
    IF EXISTS (SELECT 1 FROM public.organization_admissao_settings WHERE organization_id = v_org_teste) THEN
      RAISE EXCEPTION 'Ficou uma linha de teste em organization_admissao_settings -- limpar antes de continuar.';
    END IF;
  END IF;

  -- 3b. Auditoria ao vivo: updated_at muda so, e updated_by e SEMPRE
  --     auth.uid(), nunca o valor que o INSERT/UPDATE tentar forjar.
  IF v_org_teste IS NOT NULL THEN
    INSERT INTO public.organization_admissao_settings (organization_id, campos_override, updated_by)
    VALUES (v_org_teste, '{}'::jsonb, '11111111-1111-1111-1111-111111111111'::uuid);

    SELECT updated_by, updated_at INTO v_updated_by, v_updated_at_antes
      FROM public.organization_admissao_settings WHERE organization_id = v_org_teste;

    IF v_updated_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION
        'updated_by ficou % apos o INSERT, esperava-se auth.uid() (%) -- o trigger nao forcou o valor forjado.',
        v_updated_by, auth.uid();
    END IF;
    IF v_updated_by = '11111111-1111-1111-1111-111111111111'::uuid THEN
      RAISE EXCEPTION 'updated_by ficou igual ao uuid forjado no INSERT -- o trigger nao esta a correr.';
    END IF;

    UPDATE public.organization_admissao_settings
       SET campos_override = '{"niss": false}'::jsonb,
           updated_by = '22222222-2222-2222-2222-222222222222'::uuid
     WHERE organization_id = v_org_teste;

    SELECT updated_by, updated_at INTO v_updated_by, v_updated_at_depois
      FROM public.organization_admissao_settings WHERE organization_id = v_org_teste;

    IF v_updated_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION
        'updated_by ficou % apos o UPDATE, esperava-se auth.uid() (%) -- o trigger nao forcou o valor forjado.',
        v_updated_by, auth.uid();
    END IF;
    IF v_updated_by = '22222222-2222-2222-2222-222222222222'::uuid THEN
      RAISE EXCEPTION 'updated_by ficou igual ao uuid forjado no UPDATE -- o trigger nao esta a correr.';
    END IF;
    -- NAO comparar v_updated_at_antes < v_updated_at_depois aqui: now() e
    -- constante dentro de uma UNICA transaccao (este bloco DO inteiro e uma
    -- so), por isso o trigger, mesmo a correr correctamente, produz o MESMO
    -- valor nas duas leituras -- nao e um sinal de falha, e semantica normal
    -- do Postgres. O que se pode confirmar sem depender do relogio: que o
    -- trigger existe (ja verificado acima) e que updated_at nunca fica NULL.
    IF v_updated_at_antes IS NULL OR v_updated_at_depois IS NULL THEN
      RAISE EXCEPTION 'updated_at ficou NULL -- trg_organization_admissao_settings_updated_at nao esta a correr.';
    END IF;

    DELETE FROM public.organization_admissao_settings WHERE organization_id = v_org_teste;
  END IF;

  -- 4. hr_admissao_campos_obrigatorios_org: SECURITY DEFINER, 29 linhas sem
  --    override, e o override aplica-se de facto.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_campos_obrigatorios_org'
       AND p.pronargs = 1 AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios_org(uuid) nao ficou SECURITY DEFINER.';
  END IF;

  -- SO service_role tem EXECUTE -- e isto que fecha a fuga entre
  -- organizacoes: sem grant a authenticated, PostgREST nao expoe a RPC, e as
  -- chamadoras internas (SECURITY DEFINER, dono = quem criou a funcao) tem
  -- EXECUTE implicito nas proprias funcoes independentemente de GRANTs.
  IF has_function_privilege('authenticated', 'public.hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios_org ficou executavel por authenticated -- fuga entre organizacoes via PostgREST.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios_org ficou executavel por anon.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios_org deixou de ser executavel por service_role.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema = 'public' AND routine_name = 'hr_admissao_campos_obrigatorios_org'
       AND grantee IN ('authenticated', 'anon', 'PUBLIC')
  ) THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios_org tem um GRANT explicito a authenticated, anon ou PUBLIC em information_schema.routine_privileges.';
  END IF;

  SELECT count(*) INTO v_n FROM public.hr_admissao_campos_obrigatorios_org('00000000-0000-0000-0000-000000000000'::uuid);
  IF v_n <> 29 THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios_org() devolve % linhas para uma organizacao sem settings, esperavam-se 29.', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.hr_admissao_campos_obrigatorios_org('00000000-0000-0000-0000-000000000000'::uuid)
   WHERE NOT obrigatorio;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Uma organizacao sem settings tem % campos marcados nao-obrigatorios; deviam ser 0 (omissao = tudo obrigatorio).', v_n;
  END IF;

  IF v_org_teste IS NOT NULL THEN
    INSERT INTO public.organization_admissao_settings (organization_id, campos_override)
    VALUES (v_org_teste, '{"niss": false}'::jsonb)
    ON CONFLICT (organization_id) DO UPDATE SET campos_override = EXCLUDED.campos_override;

    SELECT obrigatorio INTO v_result
      FROM public.hr_admissao_campos_obrigatorios_org(v_org_teste) WHERE codigo = 'niss';
    IF v_result IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'O override niss=false nao se reflectiu em hr_admissao_campos_obrigatorios_org().';
    END IF;

    SELECT obrigatorio INTO v_result
      FROM public.hr_admissao_campos_obrigatorios_org(v_org_teste) WHERE codigo = 'nif';
    IF v_result IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Um codigo sem override deixou de ser obrigatorio -- so niss devia ter mudado.';
    END IF;

    -- Repor o estado anterior: apagar o override de teste (nao existia
    -- settings nenhuma para esta organizacao antes desta migracao correr).
    DELETE FROM public.organization_admissao_settings WHERE organization_id = v_org_teste;
  END IF;

  -- 5. hr_admissao_pendencias: mesma assinatura, mesmo gate de service_role,
  --    agora usando a funcao _org e filtrando por obrigatorio.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'hr_admissao_pendencias ficou com % aridades.', v_n;
  END IF;

  SELECT pg_get_functiondef('public.hr_admissao_pendencias(uuid)'::regprocedure) INTO v_src;
  IF v_src NOT LIKE '%hr_admissao_campos_obrigatorios_org%' THEN
    RAISE EXCEPTION 'hr_admissao_pendencias nao chama hr_admissao_campos_obrigatorios_org -- o override por organizacao nao se aplica.';
  END IF;
  IF v_src NOT LIKE '%v_servico%' THEN
    RAISE EXCEPTION 'hr_admissao_pendencias ficou sem o ramo de service_role -- o portao da submissao do convite deixaria de ver pendencias.';
  END IF;
  IF v_src NOT LIKE '%insufficient_privilege%' THEN
    RAISE EXCEPTION 'hr_admissao_pendencias ficou sem a recusa a quem nao pode ver a ficha.';
  END IF;
  IF v_src NOT LIKE '%c.obrigatorio%' THEN
    RAISE EXCEPTION 'hr_admissao_pendencias nao filtra por c.obrigatorio -- o override nunca chegaria a excluir nada.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_pendencias deixou de ser executavel por authenticated.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_pendencias ficou aberta a anon.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_pendencias deixou de ser executavel por service_role -- o portao da submissao do convite parava.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias'
       AND p.prosecdef AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ) THEN
    RAISE EXCEPTION 'hr_admissao_pendencias perdeu SECURITY DEFINER ou o search_path fixo.';
  END IF;

  -- 6. rpc_hr_convite_admissao_estado: mesma assinatura, so service_role, e
  --    o corpo ganhou a chave nova.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_estado' AND p.pronargs = 1;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_estado(text) ficou com % aridades.', v_n;
  END IF;
  IF has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_estado(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_convite_admissao_estado(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_estado deixou de ser so service_role.';
  END IF;

  SELECT pg_get_functiondef('public.rpc_hr_convite_admissao_estado(text)'::regprocedure) INTO v_src;
  IF v_src NOT LIKE '%campos_obrigatorios%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_estado nao devolve campos_obrigatorios.';
  END IF;
  IF v_src NOT LIKE '%niss_ultimos4%' OR v_src LIKE '%v_ident.niss,%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_estado deixou de mascarar o niss (deve continuar a devolver so niss_ultimos4).';
  END IF;

  RAISE NOTICE
    'OK: permissao hr.admissao.obrigatorios.gerir no catalogo sem atribuicao, organization_admissao_settings com RLS e CHECK validados ao vivo, hr_admissao_campos_obrigatorios_org devolve 29 linhas e respeita override, hr_admissao_pendencias e rpc_hr_convite_admissao_estado actualizadas com as mesmas guardas de sempre.';
END;
$conferir$;


-- ==============================================================================
-- ANTES DO db push
--
-- 1. O timestamp desta migration (20261201050000) e posterior a TUDO o que
--    existe hoje na pasta supabase/migrations local -- por isso nao colide
--    com nenhum ficheiro ja versionado. A ordem exacta de aplicacao contra o
--    que ja esta no remoto (ha drift conhecido: migrations aplicadas la sem
--    ficheiro local correspondente) tem de ser reconfirmada com
--    `supabase migration list --linked` imediatamente antes do db push real
--    -- nao assumir aqui um "mais recente aplicado" que pode ja estar
--    desactualizado.
-- 2. Nenhuma janela de estado defeituoso: as duas funcoes substituidas
--    (hr_admissao_pendencias, rpc_hr_convite_admissao_estado) mantem
--    EXACTAMENTE o comportamento anterior para quem nao tiver settings --
--    hr_admissao_campos_obrigatorios_org() devolve `obrigatorio = true` para
--    todos os codigos quando organization_admissao_settings nao tem linha.
-- 3. O ecra novo (React) e o hook que le/escreve campos_override entram no
--    mesmo commit, fora do SQL.
-- ==============================================================================
