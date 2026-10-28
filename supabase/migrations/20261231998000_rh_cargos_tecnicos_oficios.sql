-- RH › cargos técnicos de obra (28/10/2026): os ofícios de obra (ops_skill) passam a vir do cargo, e o €/h do ofício no Catálogo e no
-- orçamento passa a ser calculado na base, a partir do RH.
--
-- O problema: com a 20261231996000 cada pessoa tinha de ser ligada à mão aos ofícios, qualquer pessoa (administrativos incluídos) podia
-- ser "técnico", e uma pessoa sem retribuição ficava sem custo/hora. Os ofícios só servem aos colaboradores técnicos (orçamentos e obras).
--
-- O que muda (a base só cresce; nada se apaga):
--   1. hr_cargos.tecnico_obra   a marca "técnico de obra" no cargo. Lê-se por coluna (GRANT SELECT); não se escreve por UPDATE direto
--                               (gatilho: só pelas funções; authenticated tem UPDATE na tabela inteira).
--   2. hr_cargos_oficios        os ofícios de um cargo técnico. Uma pessoa com esse cargo herda-os; pessoas_oficios fica com os extras.
--                               Gatilhos: só um cargo técnico tem ofícios; não se tira a marca a um cargo que ainda os tem.
--   3. rh_guardar_cargo_tecnico a marca e os ofícios do cargo, de uma vez (Cargos do RH (exemplo)).
--   4. Ajudantes internos       fn_rh_pessoa_cargo_vigente, fn_rh_pessoa_tecnica (não apagada, sem saída passada, cargo vigente técnico),
--                               fn_rh_oficios_efetivos (os do cargo, 'cargo', mais os extras, 'extra'; nada se não for técnica),
--                               fn_cat_custo_hora_salario ((mensal × meses × (1 + TSU) + seguros) ÷ horas do ano, cat_parametros),
--                               fn_rh_custo_hora_cargo_em (o €/h do salário do cargo numa data).
--   5. fn_rh_custo_hora_pessoa_em(_det)  o custo/hora numa data: a retribuição em vigor ('retribuicao'); sem ela, e só num cargo técnico,
--                               o salário do cargo ('cargo'). À hora vira mensal por horas_referencia do cargo, senão pelas horas do
--                               vínculo, senão 40, × 52 ÷ 12; anual ÷ meses. Salário 0 ou nulo dá NULL, nunca 0.
--                               fn_rh_custo_hora_pessoa(p_org, p_pessoa) mantém a assinatura e chama a nova com current_date.
--   6. rh_ler_oficios_pessoa    devolve tecnica, cargo, os ofícios com herdado/extra (ligado = um dos dois) e a origem do custo.
--   7. rh_guardar_oficios_pessoa  recusa pessoas não técnicas (CT002) e grava só os extras (ignora os herdados do cargo).
--   8. fn_cat_custo_hora_oficio_det  o €/h de um ofício: média das pessoas técnicas com o ofício e custo ('rh'); senão média dos cargos
--                               técnicos ativos ligados ('cargo'); senão o salário de referência ('referencia'); senão 'sem'.
--   9. cat_ler_catalogo         perfis com custo_hora/fonte/n/nomes/cargos; tecnicos = só as pessoas técnicas, com todos os ofícios
--                               efetivos; sai ops_utilizador_perfil (está vazio). O custo/hora de cada técnico só vai com
--                               hr.pessoas.retribuicao.view (ve_custo_tecnicos); a média por ofício vai sempre (é o que entra no orçamento).
--  10. rh_ler_custo_hora_pessoas  o custo/hora e a origem de cada pessoa (para o separador Custos, numa entrega seguinte; sem ecrã).
--
-- Permissões: ler pede hr.pessoas.laborais.view; gravar pede hr.pessoas.laborais.edit; os custos por pessoa pedem
-- hr.pessoas.retribuicao.view; o Catálogo continua a pedir services.view. Erros: CT001 sem permissão; CT002 dados inválidos;
-- CT003 não encontrado nesta organização.
--
-- Quatro funções partem do texto vivo depois da 20261231996000. A migration pára se alguma delas tiver mudado entretanto (md5 do texto).

SET lock_timeout = '5s';

DO $do$
DECLARE
  v text; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.fn_rh_custo_hora_pessoa(uuid,uuid)', 'f2b3287ce30d2f88a9143d720b08c4f1'),
    ('public.rh_ler_oficios_pessoa(uuid,uuid)', '66c71b64d16e53a18c7aae8291a24009'),
    ('public.rh_guardar_oficios_pessoa(uuid,uuid,uuid[])', 'd115840aa963c1268cee5c87a7f01b10'),
    ('public.cat_ler_catalogo(uuid)', 'dcb36f12b66c6e665429b4355eaea517')
  ) AS t(assinatura, md5) LOOP
    v := pg_get_functiondef(r.assinatura::regprocedure);
    IF position('20261231998000' IN v) = 0 AND md5(v) <> r.md5 THEN
      RAISE EXCEPTION 'A função % mudou depois da 20261231996000: rever a migration 20261231998000 contra o texto vivo.', r.assinatura;
    END IF;
  END LOOP;
END $do$;

-- ------------------------------------------------------------------ 1. a marca no cargo
ALTER TABLE public.hr_cargos ADD COLUMN IF NOT EXISTS tecnico_obra boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.hr_cargos.tecnico_obra IS 'Cargo técnico de obra: as pessoas com ele são técnicos no Catálogo e no orçamento, com os ofícios do cargo (hr_cargos_oficios). Muda-se só por rh_guardar_cargo_tecnico.';
-- authenticated lê hr_cargos por coluna: sem isto o select do ecrã dos cargos rebenta
GRANT SELECT (tecnico_obra) ON public.hr_cargos TO authenticated;

-- ------------------------------------------------------------------ 2. os ofícios do cargo
CREATE TABLE IF NOT EXISTS public.hr_cargos_oficios (
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  cargo_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT hr_cargos_oficios_pkey PRIMARY KEY (cargo_id, skill_id),
  CONSTRAINT hr_cargos_oficios_cargo_fkey FOREIGN KEY (cargo_id, organization_id) REFERENCES public.hr_cargos(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT hr_cargos_oficios_skill_fkey FOREIGN KEY (skill_id, organization_id) REFERENCES public.ops_skill(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS hr_cargos_oficios_org_skill_idx ON public.hr_cargos_oficios (organization_id, skill_id);
COMMENT ON TABLE public.hr_cargos_oficios IS 'Os ofícios de obra (ops_skill) de um cargo técnico. As pessoas com o cargo herdam-nos; pessoas_oficios fica com os extras.';

ALTER TABLE public.hr_cargos_oficios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_cargos_oficios_ler ON public.hr_cargos_oficios;
CREATE POLICY hr_cargos_oficios_ler ON public.hr_cargos_oficios FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.view', organization_id)));
-- sem políticas de escrita: grava-se só por rh_guardar_cargo_tecnico
REVOKE ALL ON public.hr_cargos_oficios FROM anon, authenticated;
GRANT SELECT ON public.hr_cargos_oficios TO authenticated;
GRANT ALL ON public.hr_cargos_oficios TO service_role;

-- só um cargo técnico tem ofícios (FOR SHARE: a marca não muda até esta transação acabar)
CREATE OR REPLACE FUNCTION public.fn_hr_cargos_oficios_so_tecnico() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT coalesce((SELECT c.tecnico_obra FROM hr_cargos c WHERE c.id = NEW.cargo_id AND c.organization_id = NEW.organization_id FOR SHARE), false) THEN
    RAISE EXCEPTION 'Só um cargo técnico de obra tem ofícios.' USING ERRCODE = 'CT002';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_hr_cargos_oficios_so_tecnico() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hr_cargos_oficios_so_tecnico ON public.hr_cargos_oficios;
CREATE TRIGGER trg_hr_cargos_oficios_so_tecnico BEFORE INSERT OR UPDATE ON public.hr_cargos_oficios
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_cargos_oficios_so_tecnico();

-- a marca só muda pelas funções (SECURITY DEFINER: current_user é o dono); não se tira a um cargo que ainda tem ofícios.
-- SECURITY INVOKER de propósito: é o current_user de quem escreve que conta.
CREATE OR REPLACE FUNCTION public.fn_hr_cargos_tecnico_obra_guarda() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tecnico_obra AND current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'A marca de técnico de obra só se muda em Cargos (rh_guardar_cargo_tecnico).' USING ERRCODE = 'CT001';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.tecnico_obra IS DISTINCT FROM OLD.tecnico_obra THEN
    IF current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'A marca de técnico de obra só se muda em Cargos (rh_guardar_cargo_tecnico).' USING ERRCODE = 'CT001';
    END IF;
    IF NOT NEW.tecnico_obra AND EXISTS (SELECT 1 FROM hr_cargos_oficios co WHERE co.cargo_id = OLD.id) THEN
      RAISE EXCEPTION 'O cargo ainda tem ofícios de obra: tire-os antes de lhe tirar a marca de técnico.' USING ERRCODE = 'CT002';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_hr_cargos_tecnico_obra_guarda() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hr_cargos_tecnico_obra_guarda ON public.hr_cargos;
CREATE TRIGGER trg_hr_cargos_tecnico_obra_guarda BEFORE INSERT OR UPDATE OF tecnico_obra ON public.hr_cargos
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_cargos_tecnico_obra_guarda();

-- ------------------------------------------------------------------ 3. gravar a marca e os ofícios do cargo
CREATE OR REPLACE FUNCTION public.rh_guardar_cargo_tecnico(p_org uuid, p_cargo uuid, p_tecnico boolean, p_skills uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid; v_skills uuid[] := coalesce(p_skills, '{}');
BEGIN
  v_user := public.fn_cat_exigir(p_org, 'hr.pessoas.laborais.edit');
  IF NOT EXISTS (SELECT 1 FROM hr_cargos WHERE id = p_cargo AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Cargo não encontrado nesta organização.' USING ERRCODE = 'CT003';
  END IF;
  IF p_tecnico IS NULL THEN
    RAISE EXCEPTION 'Diga se o cargo é técnico de obra.' USING ERRCODE = 'CT002';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_skills) k WHERE NOT EXISTS (SELECT 1 FROM ops_skill s WHERE s.id = k AND s.organization_id = p_org)) THEN
    RAISE EXCEPTION 'Ofício que não é desta organização.' USING ERRCODE = 'CT002';
  END IF;
  IF NOT p_tecnico AND cardinality(v_skills) > 0 THEN
    RAISE EXCEPTION 'Só um cargo técnico de obra tem ofícios.' USING ERRCODE = 'CT002';
  END IF;

  IF p_tecnico THEN
    UPDATE hr_cargos SET tecnico_obra = true, updated_by = v_user WHERE id = p_cargo AND NOT tecnico_obra;
    DELETE FROM hr_cargos_oficios WHERE cargo_id = p_cargo AND NOT (skill_id = ANY (v_skills));
    INSERT INTO hr_cargos_oficios (organization_id, cargo_id, skill_id, created_by)
      SELECT DISTINCT p_org, p_cargo, k, v_user FROM unnest(v_skills) k
    ON CONFLICT (cargo_id, skill_id) DO NOTHING;
  ELSE
    -- primeiro os ofícios, depois a marca (o gatilho recusa tirar a marca a um cargo com ofícios)
    DELETE FROM hr_cargos_oficios WHERE cargo_id = p_cargo;
    UPDATE hr_cargos SET tecnico_obra = false, updated_by = v_user WHERE id = p_cargo AND tecnico_obra;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.rh_guardar_cargo_tecnico(uuid, uuid, boolean, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_guardar_cargo_tecnico(uuid, uuid, boolean, uuid[]) TO authenticated, service_role;
COMMENT ON FUNCTION public.rh_guardar_cargo_tecnico(uuid, uuid, boolean, uuid[]) IS 'Cargos do RH: a marca de técnico de obra e os ofícios do cargo, de uma vez (hr.pessoas.laborais.edit).';

-- ------------------------------------------------------------------ 4. ajudantes internos
-- o cargo vigente da pessoa: o do histórico (pessoas_cargos) na data; sem ele, pessoas.cargo_id
CREATE OR REPLACE FUNCTION public.fn_rh_pessoa_cargo_vigente(p_pessoa uuid, p_data date DEFAULT current_date) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.hr_pessoa_cargo_em(p_pessoa, coalesce(p_data, current_date)), (SELECT p.cargo_id FROM pessoas p WHERE p.id = p_pessoa))
$$;
REVOKE ALL ON FUNCTION public.fn_rh_pessoa_cargo_vigente(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rh_pessoa_cargo_vigente(uuid, date) TO service_role;

-- técnica: não apagada, sem data de saída passada e com o cargo vigente técnico de obra
CREATE OR REPLACE FUNCTION public.fn_rh_pessoa_tecnica(p_org uuid, p_pessoa uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM pessoas p
    JOIN hr_cargos c ON c.id = public.fn_rh_pessoa_cargo_vigente(p.id) AND c.organization_id = p.organization_id
    WHERE p.id = p_pessoa AND p.organization_id = p_org AND p.deleted_at IS NULL
      AND (p.data_saida IS NULL OR p.data_saida >= current_date)
      AND c.tecnico_obra AND c.deleted_at IS NULL)
$$;
REVOKE ALL ON FUNCTION public.fn_rh_pessoa_tecnica(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rh_pessoa_tecnica(uuid, uuid) TO service_role;

-- os ofícios efetivos: os do cargo vigente ('cargo') mais os extras da pessoa ('extra'); um ofício conta uma vez (vale o do cargo)
CREATE OR REPLACE FUNCTION public.fn_rh_oficios_efetivos(p_org uuid, p_pessoa uuid) RETURNS TABLE(skill_id uuid, origem text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH t AS (SELECT public.fn_rh_pessoa_tecnica(p_org, p_pessoa) AS tecnica, public.fn_rh_pessoa_cargo_vigente(p_pessoa) AS cargo)
  SELECT co.skill_id, 'cargo'::text FROM t JOIN hr_cargos_oficios co ON co.cargo_id = t.cargo AND co.organization_id = p_org
  WHERE t.tecnica
  UNION ALL
  SELECT po.skill_id, 'extra'::text FROM t JOIN pessoas_oficios po ON po.pessoa_id = p_pessoa AND po.organization_id = p_org
  WHERE t.tecnica AND NOT EXISTS (SELECT 1 FROM hr_cargos_oficios co WHERE co.cargo_id = t.cargo AND co.skill_id = po.skill_id)
$$;
REVOKE ALL ON FUNCTION public.fn_rh_oficios_efetivos(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rh_oficios_efetivos(uuid, uuid) TO service_role;

-- a conta do salário do perfil no Catálogo: (mensal × meses × (1 + TSU) + seguros do ano) ÷ horas produtivas do ano. 0 ou nulo dá NULL.
CREATE OR REPLACE FUNCTION public.fn_cat_custo_hora_salario(p_org uuid, p_mensal numeric) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p_mensal > 0 AND par.horas_ano > 0
              THEN round((p_mensal * par.meses * (1 + par.tsu / 100) + par.seguros) / par.horas_ano, 2) END
  FROM (SELECT coalesce(max(meses), 14) AS meses, coalesce(max(tsu), 23.75) AS tsu, coalesce(max(seguros_ano), 713) AS seguros,
               coalesce(max(horas_ano), 1345) AS horas_ano
        FROM cat_parametros WHERE organization_id = p_org) par
$$;
REVOKE ALL ON FUNCTION public.fn_cat_custo_hora_salario(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cat_custo_hora_salario(uuid, numeric) TO service_role;

-- o €/h do salário do cargo numa data (hr_cargo_salario_em). À hora: × horas_referencia do cargo (senão p_horas_semana, senão 40)
-- × 52 ÷ 12; anual: ÷ meses. Sem salário, ou 0, dá NULL.
CREATE OR REPLACE FUNCTION public.fn_rh_custo_hora_cargo_em(p_org uuid, p_cargo uuid, p_data date, p_horas_semana numeric DEFAULT NULL) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.fn_cat_custo_hora_salario(p_org,
           CASE s.periodicidade
             WHEN 'mensal' THEN s.salario_base
             WHEN 'hora' THEN s.salario_base * coalesce(nullif(c.horas_referencia, 0), nullif(p_horas_semana, 0), 40) * 52 / 12
             WHEN 'anual' THEN s.salario_base / nullif((SELECT coalesce(max(meses), 14) FROM cat_parametros WHERE organization_id = p_org), 0)
           END)
  FROM hr_cargos c CROSS JOIN LATERAL public.hr_cargo_salario_em(c.id, coalesce(p_data, current_date)) s
  WHERE c.id = p_cargo AND c.organization_id = p_org
$$;
REVOKE ALL ON FUNCTION public.fn_rh_custo_hora_cargo_em(uuid, uuid, date, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rh_custo_hora_cargo_em(uuid, uuid, date, numeric) TO service_role;

-- ------------------------------------------------------------------ 5. o custo/hora da pessoa numa data
CREATE OR REPLACE FUNCTION public.fn_rh_custo_hora_pessoa_em_det(p_org uuid, p_pessoa uuid, p_data date) RETURNS TABLE(custo_hora numeric, origem text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data date := coalesce(p_data, current_date);
  v_meses numeric; v_horas numeric; v_ret record; v_cargo uuid; v_ch numeric;
BEGIN
  SELECT coalesce(max(meses), 14) INTO v_meses FROM cat_parametros WHERE organization_id = p_org;
  -- as horas da semana do vínculo em vigor na data (o ativo primeiro)
  SELECT v.horas_semanais_equivalentes INTO v_horas FROM pessoas_vinculos v
  WHERE v.organization_id = p_org AND v.pessoa_id = p_pessoa AND v.deleted_at IS NULL
    AND v.data_inicio <= v_data AND (v.data_fim IS NULL OR v.data_fim >= v_data)
  ORDER BY (v.estado = 'activo') DESC NULLS LAST, v.data_inicio DESC LIMIT 1;

  -- 1. a retribuição em vigor na data
  SELECT r.valor_base, r.periodicidade INTO v_ret FROM pessoas_retribuicoes r
  WHERE r.organization_id = p_org AND r.pessoa_id = p_pessoa AND r.deleted_at IS NULL
    AND (r.valido_de IS NULL OR r.valido_de <= v_data) AND (r.valido_ate IS NULL OR r.valido_ate >= v_data)
  ORDER BY r.valido_de DESC NULLS LAST, r.created_at DESC LIMIT 1;
  IF FOUND THEN
    v_ch := public.fn_cat_custo_hora_salario(p_org, CASE v_ret.periodicidade
              WHEN 'mensal' THEN v_ret.valor_base
              WHEN 'hora' THEN v_ret.valor_base * coalesce(nullif(v_horas, 0), 40) * 52 / 12
              WHEN 'anual' THEN v_ret.valor_base / nullif(v_meses, 0)
            END);
    IF v_ch IS NOT NULL THEN
      RETURN QUERY SELECT v_ch, 'retribuicao'::text;
      RETURN;
    END IF;
  END IF;

  -- 2. sem retribuição: o salário do cargo na data, só num cargo técnico de obra
  v_cargo := public.fn_rh_pessoa_cargo_vigente(p_pessoa, v_data);
  IF EXISTS (SELECT 1 FROM pessoas p WHERE p.id = p_pessoa AND p.organization_id = p_org)
     AND EXISTS (SELECT 1 FROM hr_cargos c WHERE c.id = v_cargo AND c.organization_id = p_org AND c.tecnico_obra AND c.deleted_at IS NULL) THEN
    v_ch := public.fn_rh_custo_hora_cargo_em(p_org, v_cargo, v_data, v_horas);
    IF v_ch IS NOT NULL THEN
      RETURN QUERY SELECT v_ch, 'cargo'::text;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT NULL::numeric, NULL::text;
END $$;
REVOKE ALL ON FUNCTION public.fn_rh_custo_hora_pessoa_em_det(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rh_custo_hora_pessoa_em_det(uuid, uuid, date) TO service_role;
COMMENT ON FUNCTION public.fn_rh_custo_hora_pessoa_em_det(uuid, uuid, date) IS 'Custo/hora de obra da pessoa numa data e de onde vem: a retribuição em vigor (retribuicao) ou, num cargo técnico, o salário do cargo (cargo). Sem os dois: (NULL, NULL).';

CREATE OR REPLACE FUNCTION public.fn_rh_custo_hora_pessoa_em(p_org uuid, p_pessoa uuid, p_data date) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.custo_hora FROM public.fn_rh_custo_hora_pessoa_em_det(p_org, p_pessoa, p_data) d
$$;
REVOKE ALL ON FUNCTION public.fn_rh_custo_hora_pessoa_em(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rh_custo_hora_pessoa_em(uuid, uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_rh_custo_hora_pessoa(p_org uuid, p_pessoa uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20261231998000: a conta passou para fn_rh_custo_hora_pessoa_em (a retribuição; sem ela, num cargo técnico, o salário do cargo)
  SELECT public.fn_rh_custo_hora_pessoa_em(p_org, p_pessoa, current_date)
$function$;
REVOKE ALL ON FUNCTION public.fn_rh_custo_hora_pessoa(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rh_custo_hora_pessoa(uuid, uuid) TO service_role;
COMMENT ON FUNCTION public.fn_rh_custo_hora_pessoa(uuid, uuid) IS 'Custo/hora de obra da pessoa hoje (fn_rh_custo_hora_pessoa_em). Null sem retribuição nem salário de cargo técnico.';

-- ------------------------------------------------------------------ 6. o cartão da ficha
CREATE OR REPLACE FUNCTION public.rh_ler_oficios_pessoa(p_org uuid, p_pessoa uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ret boolean; v_tec boolean; v_cargo uuid; v_det record;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'hr.pessoas.laborais.view');
  IF NOT EXISTS (SELECT 1 FROM pessoas WHERE id = p_pessoa AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pessoa não encontrada nesta organização.' USING ERRCODE = 'CT003';
  END IF;
  v_ret := public.is_system_admin_user(auth.uid()) OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_org);
  -- 20261231998000: os ofícios herdados do cargo técnico, os extras da pessoa e a origem do custo/hora
  v_tec := public.fn_rh_pessoa_tecnica(p_org, p_pessoa);
  v_cargo := public.fn_rh_pessoa_cargo_vigente(p_pessoa);
  SELECT * INTO v_det FROM public.fn_rh_custo_hora_pessoa_em_det(p_org, p_pessoa, current_date);
  RETURN jsonb_build_object(
    'tecnica', v_tec,
    'cargo', (SELECT jsonb_build_object('id', c.id, 'nome', c.nome) FROM hr_cargos c WHERE c.id = v_cargo AND c.organization_id = p_org),
    'oficios', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'herdado', x.herdado, 'extra', x.extra,
                 'ligado', x.herdado OR x.extra) ORDER BY s.nome)
               FROM ops_skill s
               CROSS JOIN LATERAL (SELECT h.herdado,
                   (NOT h.herdado AND EXISTS (SELECT 1 FROM pessoas_oficios po WHERE po.pessoa_id = p_pessoa AND po.skill_id = s.id)) AS extra
                 FROM (SELECT v_tec AND EXISTS (SELECT 1 FROM hr_cargos_oficios co WHERE co.cargo_id = v_cargo AND co.skill_id = s.id) AS herdado) h) x
               WHERE s.organization_id = p_org AND (s.ativo OR x.herdado OR x.extra)), '[]'),
    'custo_hora', CASE WHEN v_ret THEN v_det.custo_hora END,
    'origem_custo', CASE WHEN v_ret THEN v_det.origem END,
    've_custo', v_ret
  );
END $function$;
REVOKE ALL ON FUNCTION public.rh_ler_oficios_pessoa(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_ler_oficios_pessoa(uuid, uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------ 7. gravar os extras da pessoa
CREATE OR REPLACE FUNCTION public.rh_guardar_oficios_pessoa(p_org uuid, p_pessoa uuid, p_skills uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user uuid; v_skills uuid[] := coalesce(p_skills, '{}'); v_cargo uuid;
BEGIN
  v_user := public.fn_cat_exigir(p_org, 'hr.pessoas.laborais.edit');
  IF NOT EXISTS (SELECT 1 FROM pessoas WHERE id = p_pessoa AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pessoa não encontrada nesta organização.' USING ERRCODE = 'CT003';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_skills) k WHERE NOT EXISTS (SELECT 1 FROM ops_skill s WHERE s.id = k AND s.organization_id = p_org)) THEN
    RAISE EXCEPTION 'Ofício que não é desta organização.' USING ERRCODE = 'CT002';
  END IF;
  -- 20261231998000: só as pessoas técnicas têm ofícios; os herdados do cargo não se gravam na pessoa (ficam só os extras)
  IF NOT public.fn_rh_pessoa_tecnica(p_org, p_pessoa) THEN
    RAISE EXCEPTION 'Só pessoas com cargo técnico de obra têm ofícios.' USING ERRCODE = 'CT002';
  END IF;
  v_cargo := public.fn_rh_pessoa_cargo_vigente(p_pessoa);
  v_skills := ARRAY(SELECT DISTINCT k FROM unnest(v_skills) k
                    WHERE NOT EXISTS (SELECT 1 FROM hr_cargos_oficios co WHERE co.cargo_id = v_cargo AND co.skill_id = k));
  DELETE FROM pessoas_oficios WHERE pessoa_id = p_pessoa AND organization_id = p_org AND NOT (skill_id = ANY (v_skills));
  INSERT INTO pessoas_oficios (organization_id, pessoa_id, skill_id, created_by)
    SELECT DISTINCT p_org, p_pessoa, k, v_user FROM unnest(v_skills) k
  ON CONFLICT (pessoa_id, skill_id) DO NOTHING;
END $function$;
REVOKE ALL ON FUNCTION public.rh_guardar_oficios_pessoa(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_guardar_oficios_pessoa(uuid, uuid, uuid[]) TO authenticated, service_role;


-- ------------------------------------------------------------------ 8. o €/h de um ofício
-- Por ordem: 'rh' a média das pessoas técnicas com o ofício efetivo e custo (fn_rh_custo_hora_pessoa); 'cargo' a média do €/h dos cargos
-- técnicos ativos ligados ao ofício; 'referencia' o salário de referência do ofício pela mesma conta; 'sem'.
-- n: as pessoas (rh) ou os cargos (cargo) que entram na média; 0 nas outras. nomes: na fonte 'rh', as pessoas da média; nas outras, as
-- pessoas técnicas com o ofício mas sem custo. cargos: os cargos técnicos ativos ligados (na fonte 'cargo', só os que têm salário).
CREATE OR REPLACE FUNCTION public.fn_cat_custo_hora_oficio_det(p_org uuid, p_skill uuid)
RETURNS TABLE(custo_hora numeric, fonte text, n integer, nomes text[], cargos text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_med numeric; v_n integer; v_com text[]; v_sem text[];
  v_cmed numeric; v_cn integer; v_cargos text[]; v_cargos_com text[]; v_ref numeric;
BEGIN
  -- as pessoas técnicas com o ofício (o pré-filtro é só um atalho; a regra é a de fn_rh_oficios_efetivos)
  WITH tec AS (
    SELECT p.nome_completo AS nome, public.fn_rh_custo_hora_pessoa(p_org, p.id) AS ch
    FROM pessoas p
    WHERE p.organization_id = p_org AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
      AND (EXISTS (SELECT 1 FROM pessoas_oficios po WHERE po.pessoa_id = p.id AND po.skill_id = p_skill)
           OR EXISTS (SELECT 1 FROM hr_cargos_oficios co WHERE co.skill_id = p_skill
                      AND co.cargo_id IN (p.cargo_id, public.hr_pessoa_cargo_em(p.id, current_date))))
      AND EXISTS (SELECT 1 FROM public.fn_rh_oficios_efetivos(p_org, p.id) e WHERE e.skill_id = p_skill)
  )
  SELECT round(avg(t.ch), 2), count(t.ch)::int,
         coalesce(array_agg(t.nome ORDER BY t.nome) FILTER (WHERE t.ch IS NOT NULL), '{}'),
         coalesce(array_agg(t.nome ORDER BY t.nome) FILTER (WHERE t.ch IS NULL), '{}')
    INTO v_med, v_n, v_com, v_sem
  FROM tec t;

  -- os cargos técnicos ativos ligados ao ofício e o €/h do salário de cada um
  WITH cg AS (
    SELECT c.nome, public.fn_rh_custo_hora_cargo_em(p_org, c.id, current_date) AS ch
    FROM hr_cargos c JOIN hr_cargos_oficios co ON co.cargo_id = c.id AND co.skill_id = p_skill
    WHERE c.organization_id = p_org AND c.tecnico_obra AND c.activo AND c.deleted_at IS NULL
  )
  SELECT round(avg(g.ch), 2), count(g.ch)::int,
         coalesce(array_agg(g.nome ORDER BY g.nome), '{}'),
         coalesce(array_agg(g.nome ORDER BY g.nome) FILTER (WHERE g.ch IS NOT NULL), '{}')
    INTO v_cmed, v_cn, v_cargos, v_cargos_com
  FROM cg g;

  IF v_n > 0 THEN
    RETURN QUERY SELECT v_med, 'rh'::text, v_n, v_com, v_cargos;
    RETURN;
  END IF;
  IF v_cn > 0 THEN
    RETURN QUERY SELECT v_cmed, 'cargo'::text, v_cn, v_sem, v_cargos_com;
    RETURN;
  END IF;
  SELECT public.fn_cat_custo_hora_salario(p_org, s.salario_referencia) INTO v_ref FROM ops_skill s WHERE s.id = p_skill AND s.organization_id = p_org;
  IF v_ref IS NOT NULL THEN
    RETURN QUERY SELECT v_ref, 'referencia'::text, 0, v_sem, v_cargos;
    RETURN;
  END IF;
  RETURN QUERY SELECT NULL::numeric, 'sem'::text, 0, v_sem, v_cargos;
END $$;
REVOKE ALL ON FUNCTION public.fn_cat_custo_hora_oficio_det(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cat_custo_hora_oficio_det(uuid, uuid) TO service_role;
COMMENT ON FUNCTION public.fn_cat_custo_hora_oficio_det(uuid, uuid) IS 'O €/h de um ofício no Catálogo e no orçamento e de onde vem: rh, cargo, referencia ou sem.';

-- ------------------------------------------------------------------ 9. o Catálogo
-- O texto vivo depois da 20261231996000; mudam perfis (o €/h de cada ofício) e tecnicos (só o RH, com os ofícios efetivos).
CREATE OR REPLACE FUNCTION public.cat_ler_catalogo(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb; v_ret boolean;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'services.view');
  -- 20261231998000: o custo/hora de cada técnico só vai a quem vê as retribuições; a média por ofício (perfis) vai sempre
  v_ret := public.is_system_admin_user(auth.uid()) OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_org);
  WITH svc AS (SELECT * FROM services WHERE organization_id = p_org AND no_catalogo AND NOT is_deleted),
       prod AS (SELECT * FROM products WHERE organization_id = p_org AND tipo_catalogo IS NOT NULL AND NOT is_deleted),
       -- as pessoas técnicas (cargo técnico de obra, sem saída passada) e os ofícios efetivos (do cargo e extras)
       rh AS (SELECT p.id, p.nome_completo, array_agg(e.skill_id ORDER BY e.skill_id) AS perfis FROM pessoas p
              CROSS JOIN LATERAL public.fn_rh_oficios_efetivos(p_org, p.id) e
              WHERE p.organization_id = p_org AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
              GROUP BY p.id, p.nome_completo)
  SELECT jsonb_build_object(
    'parametros', (SELECT to_jsonb(x) FROM (SELECT meses, tsu, seguros_ano, horas_ano, horas_mes, meses_desatualizado, margem_minima, margem_alvo
                    FROM cat_parametros WHERE organization_id = p_org) x),
    'margemLinha', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT linha, margem_minima FROM cat_margem_linha WHERE organization_id = p_org) x), '[]'),
    'categorias', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, name, parent_id, sort_order FROM service_categories
                    WHERE organization_id = p_org AND NOT is_deleted) x), '[]'),
    'perfis', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT s.id, s.chave, s.nome, s.salario_referencia, s.ativo,
                    d.custo_hora, d.fonte, d.n, d.nomes, d.cargos
                    FROM ops_skill s CROSS JOIN LATERAL public.fn_cat_custo_hora_oficio_det(p_org, s.id) d WHERE s.organization_id = p_org) x), '[]'),
    'equipamentos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, nome, compra, vida_anos, vida_horas, residual, manutencao_ano, uso_ano_horas, ativo
                    FROM cat_equipamentos WHERE organization_id = p_org AND apagado_em IS NULL) x), '[]'),
    'estrutura', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, nome, categoria, mensal, ativo, ordem FROM cat_estrutura
                    WHERE organization_id = p_org AND apagado_em IS NULL) x), '[]'),
    'servicos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, chave, name, sku, unidade, service_category_id, service_subcategory_id, linhas, medida,
                    modo_preco, margem, justificacao_preco, fases, receita_origem, icone, exige_produto_categoria_id, exige_produto_medida,
                    exige_produto_fator, exige_produto_arredondar, pergunta_manter, entulho_modo, entulho_m3, entulho_kg FROM svc) x), '[]'),
    'precosServico', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT sp.service_id, sp.price, sp.valid_from, sp.nota, sp.vat_rate, sp.created_at
                    FROM service_prices sp JOIN svc ON svc.id = sp.service_id WHERE sp.price_type = 'retail') x), '[]'),
    'passos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT t.servico_id, t.ordem, t.nome, t.minutos_por_unidade, t.minutos_fixos, t.skill_id, t.fase
                    FROM ops_obra_servico_tarefa t JOIN svc ON svc.id = t.servico_id WHERE t.organization_id = p_org) x), '[]'),
    'usosEquip', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT service_id, equipamento_id, horas, ordem FROM cat_servico_equipamentos
                    WHERE organization_id = p_org) x), '[]'),
    'usosCons', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT m.service_id, m.product_id, coalesce(m.quantidade_exata, m.quantity) AS quantity, m.opcional, m.sort_order
                    FROM service_materials m JOIN svc ON svc.id = m.service_id WHERE m.deleted_at IS NULL) x), '[]'),
    'produtos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, name, sku, tipo_catalogo, unidade, catalogo_categoria_id, servico_id, fator_servico,
                    entulho_m3, entulho_kg, short_description, marca_livre, fornecedor_livre FROM prod) x), '[]'),
    'precosProduto', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT pp.product_id, pp.price_type::text AS price_type, coalesce(pp.preco_exato, pp.price) AS price, pp.valid_from
                    FROM product_prices pp JOIN prod ON prod.id = pp.product_id) x), '[]'),
    'fornecedores', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT v.product_id, v.purchase_price, v.preco_data, v.ligacao, su.name AS fornecedor
                    FROM cat_v_produto_fornecedor v LEFT JOIN suppliers su ON su.id = v.supplier_id WHERE v.organization_id = p_org) x), '[]'),
    -- os técnicos vêm só do RH (sai ops_utilizador_perfil); o custo/hora de cada um só com retribuicao.view
    'tecnicos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
                    SELECT rh.id, rh.nome_completo AS nome, CASE WHEN v_ret THEN public.fn_rh_custo_hora_pessoa(p_org, rh.id) END AS custo_hora,
                    rh.perfis FROM rh) x), '[]'),
    've_custo_tecnicos', v_ret
  ) INTO r;
  RETURN r;
END $function$;
REVOKE ALL ON FUNCTION public.cat_ler_catalogo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_catalogo(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------ 10. o custo/hora de cada pessoa (separador Custos, entrega seguinte)
CREATE OR REPLACE FUNCTION public.rh_ler_custo_hora_pessoas(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'hr.pessoas.retribuicao.view');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('pessoa_id', p.id, 'custo_hora', d.custo_hora, 'origem', d.origem,
                     'tecnica', public.fn_rh_pessoa_tecnica(p_org, p.id)) ORDER BY p.nome_completo, p.id)
                   FROM pessoas p CROSS JOIN LATERAL public.fn_rh_custo_hora_pessoa_em_det(p_org, p.id, current_date) d
                   WHERE p.organization_id = p_org AND p.deleted_at IS NULL), '[]');
END $$;
REVOKE ALL ON FUNCTION public.rh_ler_custo_hora_pessoas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_ler_custo_hora_pessoas(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.rh_ler_custo_hora_pessoas(uuid) IS 'RH: o custo/hora de obra de cada pessoa hoje, a origem (retribuicao/cargo) e se é técnica (hr.pessoas.retribuicao.view).';

RESET lock_timeout;
