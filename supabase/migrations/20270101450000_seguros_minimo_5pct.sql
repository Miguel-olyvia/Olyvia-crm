-- Custo/hora de obra (reunião de 30/10/2026): os seguros entram com pelo menos 5 % do salário.
--
-- Pedido do Ricardo (docs/21 do repositório de documentação, R4): os seguros de acidentes de trabalho e de responsabilidade
-- civil valem pelo menos 5 % do salário. O risco varia com a função, por isso conta sempre a margem maior.
-- Hoje entram como um valor fixo por técnico e por ano (cat_parametros.seguros_ano, 713 € na nike), que num salário de
-- 1400 € fica abaixo dos 5 % (980 €).
--
-- O que muda: fn_cat_custo_hora_salario (a única conta do salário para €/h, usada pelos perfis, pelos cargos e pelas pessoas
-- do RH) passa a usar o maior entre seguros_ano e 5 % do salário do ano (mensal × meses).
-- Exemplo na nike, 1400 €/mês: de 18,56 €/h para 18,76 €/h.
SET lock_timeout = '5s';

DO $do$
BEGIN
  -- guarda: a função é a da 20261231998000 (md5 lido da base RH a 2/11)
  IF md5(pg_get_functiondef('public.fn_cat_custo_hora_salario(uuid,numeric)'::regprocedure)) <> '6c48c7727f0915b83125d5c9078ad960' THEN
    RAISE EXCEPTION 'Guarda: fn_cat_custo_hora_salario mudou desde a 20261231998000. Rever esta migration antes de a aplicar.';
  END IF;
END $do$;

-- a conta do salário do perfil no Catálogo: (mensal × meses × (1 + TSU) + seguros) ÷ horas produtivas do ano.
-- seguros = o maior entre os seguros do ano (cat_parametros) e 5 % do salário do ano. 0 ou nulo dá NULL.
CREATE OR REPLACE FUNCTION public.fn_cat_custo_hora_salario(p_org uuid, p_mensal numeric) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p_mensal > 0 AND par.horas_ano > 0
              THEN round((p_mensal * par.meses * (1 + par.tsu / 100)
                          + greatest(par.seguros, p_mensal * par.meses * 0.05)) / par.horas_ano, 2) END
  FROM (SELECT coalesce(max(meses), 14) AS meses, coalesce(max(tsu), 23.75) AS tsu, coalesce(max(seguros_ano), 713) AS seguros,
               coalesce(max(horas_ano), 1345) AS horas_ano
        FROM cat_parametros WHERE organization_id = p_org) par
$$;
REVOKE ALL ON FUNCTION public.fn_cat_custo_hora_salario(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cat_custo_hora_salario(uuid, numeric) TO service_role;
COMMENT ON FUNCTION public.fn_cat_custo_hora_salario(uuid, numeric) IS
  '€/h de um salário mensal: (mensal × meses × (1 + TSU) + seguros) ÷ horas produtivas; seguros = o maior entre seguros_ano e 5 % do salário do ano (20270101450000).';
