-- ============================================================
--  Operações — a equipa vem do Olyvia, não se duplica
-- ============================================================
--  Correr DEPOIS de seguranca.sql (precisa de `ops_pode`,
--  `ops_utilizador_perfil.zona_base`, `ops_skill` e `ops_utilizador_skill`).
--  Não depende de obras.sql; pode correr antes ou depois dele.
--
--  As pessoas já existem no Olyvia: o nome, o email, o telefone e a foto em
--  `anew_users`; o papel na organização em `anew_memberships`/`anew_roles`; a
--  equipa em `organization_teams`; os distritos e as ausências na agenda
--  (`schedule_resources`, `resource_districts`, `resource_time_off`); e, onde
--  o módulo de RH estiver instalado, a ficha (`pessoas`, `pessoas_vinculos`,
--  `hr_cargos`, `hr_locais_trabalho`, `pessoas_afectacoes`, ausências).
--
--  Operações não copia nada disto. Esta RPC LÊ tudo e junta-lhe o que é só de
--  Operações: a função (nível de permissão operacional), se está ativo, as
--  especialidades, a zona-base (agora só como override) e o custo/hora.
--
--  Regras:
--   · SÓ LEITURA. Não escreve uma linha, nem em `ops_*` nem fora;
--   · ZERO tabelas novas e ZERO foreign keys;
--   · instala e funciona numa base sem RH e sem as tabelas da agenda: tudo o
--     que não é núcleo do CRM é lido por SQL dinâmico, e só se a tabela
--     existir (`to_regclass`). Colunas que vieram em migrações posteriores
--     (`pessoas.cargo_id`, `pessoas.local_id`, `pessoas_vinculos.categoria_funcao`,
--     `anew_users.position`, `anew_roles.code`) leem-se por `to_jsonb(linha)`,
--     que dá NULL em vez de rebentar se a coluna não existir;
--   · nada sensível do RH: nem retribuições (de `hr_cargos` só sai o nome),
--     nem NIF, nem morada pessoal, nem documentos, nem o motivo de uma
--     ausência. Uma ausência de doença ou parentalidade aparece só como
--     "Ausência";
--   · os dados contratuais (tipo de contrato, regime, categoria, estado,
--     data de admissão) só saem a quem gere a equipa (settings.manage);
--   · o custo/hora só sai a quem tem `operations.costs.view` NESTA organização.
--
--  Escreve fora de `ops_*`? NÃO. Idempotente.
-- ============================================================

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.ops_pode(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Falta public.ops_pode — corre primeiro o db/seguranca.sql.';
  END IF;
  IF to_regclass('public.ops_utilizador_skill') IS NULL OR to_regclass('public.ops_skill') IS NULL THEN
    RAISE EXCEPTION 'Faltam as especialidades (ops_skill) — corre primeiro o db/correcoes-modelo.sql.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'ops_utilizador_perfil'
                    AND column_name = 'zona_base') THEN
    RAISE EXCEPTION 'ops_utilizador_perfil sem zona_base — corre primeiro o db/schema.sql.';
  END IF;
END
$pre$;

-- O tipo de retorno pode crescer entre versões; CREATE OR REPLACE não deixa
-- mudar colunas. Largar e recriar mantém o ficheiro idempotente.
DROP FUNCTION IF EXISTS public.rpc_ops_equipa_crm(uuid);

CREATE FUNCTION public.rpc_ops_equipa_crm(p_org uuid)
RETURNS TABLE (
  utilizador_id          uuid,
  nome                   text,
  email                  text,
  telefone               text,
  avatar_url             text,
  cargo_crm              text,      -- anew_users.position
  local_crm              text,      -- anew_users.location
  papel_crm              text,      -- anew_roles.name, nesta organização
  papel_crm_codigo       text,      -- anew_roles.code
  equipa_crm             text,      -- organization_teams.name
  distritos              text[],    -- agenda: resource_districts → administrative_divisions
  codigos_postais        text[],    -- agenda: resource_service_areas (prefixos)
  em_operacoes           boolean,
  funcao                 text,
  ativo                  boolean,
  zona_base              text,      -- override de Operações
  skills                 uuid[],
  skills_nomes           text[],
  custo_hora             numeric,   -- NULL se quem chama não tem costs.view
  pode_ver_custos        boolean,
  rh_disponivel          boolean,   -- o módulo de RH existe nesta base
  rh_ligado              boolean,   -- esta pessoa tem ficha de RH ligada à conta
  numero_interno         text,
  cargo                  text,      -- hr_cargos.nome, senão pessoas.cargo
  local_trabalho         text,      -- afetação atual, senão local por defeito
  tipo_contrato          text,      -- (só gestão)
  regime                 text,      -- (só gestão)
  categoria_funcao       text,      -- (só gestão)
  estado_contrato        text,      -- (só gestão)
  data_admissao          date,      -- (só gestão)
  ausencia_tipo          text,
  ausencia_inicio        date,
  ausencia_fim           date,
  ausencia_origem        text       -- 'crm' (agenda) | 'rh'
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_custos  boolean;
  v_gerir   boolean;
  v_rh      boolean := to_regclass('public.pessoas_contas') IS NOT NULL
                       AND to_regclass('public.pessoas') IS NOT NULL;
  v_agenda  boolean := to_regclass('public.schedule_resources') IS NOT NULL;

  f_equipa  text := 'NULL::text';
  f_dist    text := 'NULL::text[]';
  f_cps     text := 'NULL::text[]';
  j_rh      text := 'LEFT JOIN LATERAL (SELECT NULL::uuid AS pessoa_id, NULL::jsonb AS j) pe ON true';
  f_cargo   text := 'NULL::text';
  j_vinc    text := 'LEFT JOIN LATERAL (SELECT NULL::jsonb AS vj) vi ON true';
  f_local   text := 'NULL::text';
  q_aus     text[] := '{}';
  j_aus     text;
  v_sql     text;
BEGIN
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'Falta a organização.';
  END IF;

  IF NOT public.ops_pode(p_org, 'operations.view') THEN
    RAISE EXCEPTION 'Sem acesso a Operações nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_custos := public.ops_pode(p_org, 'operations.costs.view');
  v_gerir  := public.ops_pode(p_org, 'operations.settings.manage');

  -- ── CRM: equipa ─────────────────────────────────────────────────────────
  IF to_regclass('public.organization_teams') IS NOT NULL
     AND to_regclass('public.organization_team_members') IS NOT NULL THEN
    f_equipa := $q$(SELECT string_agg(t.name::text, ', ' ORDER BY t.name::text)
         FROM public.organization_team_members tm
         JOIN public.organization_teams t ON t.id = tm.team_id
        WHERE tm.user_id = u.id AND t.organization_id = $1
          AND COALESCE((to_jsonb(t)->>'is_active')::boolean, true))$q$;
  END IF;

  -- ── CRM: distritos e códigos postais da agenda ──────────────────────────
  IF v_agenda AND to_regclass('public.resource_districts') IS NOT NULL
     AND to_regclass('public.administrative_divisions') IS NOT NULL THEN
    f_dist := $q$ARRAY(
        SELECT x.nome FROM (
          SELECT ad.name::text AS nome, min(rd.priority) AS pr
            FROM public.schedule_resources sr
            JOIN public.resource_districts rd ON rd.resource_id = sr.id AND rd.is_active
            JOIN public.administrative_divisions ad ON ad.id = rd.district_id
           WHERE sr.user_id = u.id AND sr.organization_id = $1
             AND COALESCE(sr.is_active, true)
           GROUP BY ad.name) x
        ORDER BY x.pr, x.nome)$q$;
  END IF;

  IF v_agenda AND to_regclass('public.resource_service_areas') IS NOT NULL THEN
    f_cps := $q$ARRAY(
        SELECT DISTINCT sa.postal_code_prefix::text
          FROM public.schedule_resources sr
          JOIN public.resource_service_areas sa ON sa.resource_id = sr.id
                AND COALESCE(sa.is_active, true)
         WHERE sr.user_id = u.id AND sr.organization_id = $1
           AND COALESCE(sr.is_active, true)
         ORDER BY 1)$q$;
  END IF;

  -- ── CRM: ausências aprovadas na agenda (só o título — nunca o motivo) ──
  IF v_agenda AND to_regclass('public.resource_time_off') IS NOT NULL THEN
    q_aus := array_append(q_aus, $q$SELECT COALESCE(nullif(btrim(t.title), ''), 'Ausência')::text AS tipo,
             t.start_date::date AS inicio, t.end_date::date AS fim, 'crm'::text AS origem
        FROM public.schedule_resources sr
        JOIN public.resource_time_off t ON t.resource_id = sr.id
       WHERE sr.user_id = u.id AND sr.organization_id = $1
         AND t.approved IS TRUE
         AND t.end_date >= current_date
         AND t.start_date <= current_date + 60$q$);
  END IF;

  -- ── RH (só se o módulo existir nesta base) ──────────────────────────────
  IF v_rh THEN
    -- A ficha ligada à conta, nesta organização. `to_jsonb(pe)` lê colunas
    -- que podem ainda não existir sem rebentar; e do resultado só se tiram
    -- os campos listados abaixo.
    j_rh := $q$LEFT JOIN LATERAL (
        SELECT pe0.id AS pessoa_id, to_jsonb(pe0) AS j
          FROM public.pessoas_contas pc
          JOIN public.pessoas pe0 ON pe0.id = pc.pessoa_id
                                 AND pe0.organization_id = pc.organization_id
         WHERE pc.anew_user_id = u.id AND pc.organization_id = $1
           AND pc.estado = 'activa'
           AND pe0.deleted_at IS NULL
         ORDER BY pc.ligada_em DESC
         LIMIT 1) pe ON true$q$;

    f_cargo := $q$nullif(btrim(pe.j->>'cargo'), '')$q$;
    IF to_regclass('public.hr_cargos') IS NOT NULL THEN
      -- Só o nome. O salário-base vive na mesma linha e não sai daqui.
      f_cargo := $q$COALESCE(
          (SELECT c.nome FROM public.hr_cargos c
            WHERE c.id::text = pe.j->>'cargo_id' AND c.organization_id = $1
              AND c.deleted_at IS NULL),
          nullif(btrim(pe.j->>'cargo'), ''))$q$;
    END IF;

    f_local := $q$nullif(btrim(pe.j->>'local_trabalho'), '')$q$;
    IF to_regclass('public.hr_locais_trabalho') IS NOT NULL THEN
      f_local := $q$(SELECT l.nome FROM public.hr_locais_trabalho l
                      WHERE l.id::text = pe.j->>'local_id' AND l.organization_id = $1
                        AND l.deleted_at IS NULL)$q$;
      IF to_regclass('public.pessoas_afectacoes') IS NOT NULL THEN
        f_local := $q$(SELECT l.nome FROM public.pessoas_afectacoes a
                        JOIN public.hr_locais_trabalho l ON l.id = a.local_id
                       WHERE a.pessoa_id = pe.pessoa_id AND a.organization_id = $1
                         AND a.deleted_at IS NULL
                         AND a.valido_de <= current_date
                         AND (a.valido_ate IS NULL OR a.valido_ate >= current_date)
                       ORDER BY a.valido_de DESC LIMIT 1)$q$ || ', ' || f_local;
      END IF;
      f_local := 'COALESCE(' || f_local || $q$, nullif(btrim(pe.j->>'local_trabalho'), ''))$q$;
    END IF;

    IF to_regclass('public.pessoas_vinculos') IS NOT NULL THEN
      -- O vínculo ativo; se ainda não houver, o futuro mais próximo.
      j_vinc := $q$LEFT JOIN LATERAL (
          SELECT to_jsonb(v) AS vj FROM public.pessoas_vinculos v
           WHERE v.pessoa_id = pe.pessoa_id AND v.organization_id = $1
             AND v.deleted_at IS NULL AND v.estado IN ('activo','futuro')
           ORDER BY (v.estado = 'activo') DESC, v.data_inicio DESC
           LIMIT 1) vi ON true$q$;
    END IF;

    IF to_regclass('public.pessoas_ausencias_pedidos') IS NOT NULL
       AND to_regclass('public.hr_ausencias_tipos') IS NOT NULL THEN
      -- Doença e parentalidade são dados de saúde/família: só "Ausência".
      q_aus := array_append(q_aus, $q$SELECT (CASE WHEN ti.categoria IN ('doenca','parentalidade') THEN 'Ausência'
                    ELSE ti.nome END)::text AS tipo,
             ap.data_inicio::date AS inicio, ap.data_fim::date AS fim, 'rh'::text AS origem
        FROM public.pessoas_ausencias_pedidos ap
        JOIN public.hr_ausencias_tipos ti ON ti.id = ap.tipo_id
       WHERE ap.pessoa_id = pe.pessoa_id AND ap.organization_id = $1
         AND ap.estado = 'aprovado'
         AND ap.data_fim >= current_date
         AND ap.data_inicio <= current_date + 60$q$);
    END IF;
  END IF;

  IF cardinality(q_aus) = 0 THEN
    j_aus := 'LEFT JOIN LATERAL (SELECT NULL::text AS tipo, NULL::date AS inicio, '
          || 'NULL::date AS fim, NULL::text AS origem) au ON true';
  ELSE
    j_aus := 'LEFT JOIN LATERAL (SELECT x.* FROM ('
          || array_to_string(q_aus, ' UNION ALL ')
          || ') x ORDER BY x.inicio, x.fim LIMIT 1) au ON true';
  END IF;

  v_sql := $q$
    SELECT
      u.id,
      COALESCE(nullif(btrim(u.name), ''), u.email, '—')::text,
      u.email::text,
      nullif(btrim(u.phone), '')::text,
      nullif(btrim(u.avatar_url), '')::text,
      nullif(btrim(to_jsonb(u)->>'position'), ''),
      nullif(btrim(to_jsonb(u)->>'location'), ''),
      pap.nome,
      pap.codigo,
      $q$ || f_equipa || $q$,
      $q$ || f_dist || $q$,
      $q$ || f_cps || $q$,
      (p.utilizador_id IS NOT NULL),
      p.funcao::text,
      p.ativo,
      nullif(btrim(p.zona_base), '')::text,
      COALESCE(sk.ids, '{}'::uuid[]),
      COALESCE(sk.nomes, '{}'::text[]),
      CASE WHEN $2 THEN p.custo_hora::numeric END,
      $2,
      $4,
      (pe.pessoa_id IS NOT NULL),
      nullif(btrim(pe.j->>'numero_interno'), ''),
      $q$ || f_cargo || $q$,
      $q$ || f_local || $q$,
      CASE WHEN $3 THEN vi.vj->>'tipo_contrato' END,
      CASE WHEN $3 THEN vi.vj->>'regime' END,
      CASE WHEN $3 THEN vi.vj->>'categoria_funcao' END,
      CASE WHEN $3 THEN pe.j->>'estado_contrato' END,
      CASE WHEN $3 THEN (pe.j->>'data_admissao')::date END,
      au.tipo,
      au.inicio,
      au.fim,
      au.origem
    FROM (SELECT DISTINCT m.user_id
            FROM public.anew_memberships m
           WHERE m.organization_id = $1 AND m.status = 'active') mm
    JOIN public.anew_users u ON u.id = mm.user_id
    LEFT JOIN public.ops_utilizador_perfil p
           ON p.utilizador_id = u.id AND p.organization_id = $1
    LEFT JOIN LATERAL (
      SELECT string_agg(DISTINCT r.name::text, ', ') AS nome,
             string_agg(DISTINCT (to_jsonb(r)->>'code'), ', ') AS codigo
        FROM public.anew_memberships m2
        JOIN public.anew_roles r ON r.id = m2.role_id
       WHERE m2.user_id = u.id AND m2.organization_id = $1 AND m2.status = 'active'
    ) pap ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(k.id ORDER BY k.nome) AS ids,
             array_agg(k.nome::text ORDER BY k.nome) AS nomes
        FROM public.ops_utilizador_skill us
        JOIN public.ops_skill k ON k.id = us.skill_id AND k.organization_id = $1
       WHERE us.utilizador_id = u.id
    ) sk ON true
    $q$ || j_rh || $q$
    $q$ || j_vinc || $q$
    $q$ || j_aus || $q$
    ORDER BY 2$q$;

  RETURN QUERY EXECUTE v_sql USING p_org, v_custos, v_gerir, v_rh;
END
$fn$;

REVOKE ALL ON FUNCTION public.rpc_ops_equipa_crm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_equipa_crm(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_ops_equipa_crm(uuid) IS
  'Operações: a equipa de uma organização lida do CRM (anew_users, papéis, equipas, agenda) e, se existir, do RH (ficha, cargo, vínculo, local, ausências), mais o perfil de Operações. Só leitura. custo_hora só com operations.costs.view; dados contratuais só com operations.settings.manage.';

COMMIT;


-- ============================================================
-- Verificação
-- ============================================================
DO $v$
DECLARE r record;
BEGIN
  SELECT p.prosecdef, p.proconfig INTO r
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.rpc_ops_equipa_crm(uuid)');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_ops_equipa_crm não ficou criada.';
  END IF;
  IF NOT r.prosecdef OR NOT ('search_path=public' = ANY (r.proconfig)) THEN
    RAISE EXCEPTION 'rpc_ops_equipa_crm tem de ser SECURITY DEFINER com search_path fixo.';
  END IF;

  RAISE NOTICE 'Equipa do Olyvia pronta: Operações lê do CRM%, sem copiar ninguém.',
    CASE WHEN to_regclass('public.pessoas_contas') IS NOT NULL THEN ' e do RH' ELSE '' END;
END
$v$;
