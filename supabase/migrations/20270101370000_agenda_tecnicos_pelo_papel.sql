-- 20270101370000 (30/10/2026): a agenda dos técnicos (rh_agenda_tecnicos: as tarefas da obra e as ausências aprovadas) abre a quem tem um
-- papel do Negócio pelo RH (20270101340000), como o resto do /negocios. Sem isto, o técnico, o Gestor de obra e os outros papéis sem
-- pessoas.view no perfil da Olyvia abriam a página com "A agenda do RH não carregou".
-- Uma troca no texto vivo (md5 guardado).

SET lock_timeout = '5s';

DO $do$
DECLARE v text; n text;
BEGIN
  v := pg_get_functiondef('public.rh_agenda_tecnicos(uuid,date,date)'::regprocedure);
  IF position('20270101370000' IN v) = 0 THEN
    IF md5(v) <> '185c660beed160edc35342ce9cf42f3d' THEN
      RAISE EXCEPTION 'A função rh_agenda_tecnicos mudou: rever a migration 20270101370000 contra o texto vivo.';
    END IF;
    n := replace(v, $q$OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.laborais.view', p_org)) THEN$q$,
                    $q$OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.laborais.view', p_org)
      OR public.fn_neg_papel_permite(p_org, 'pessoas.view')) THEN -- 20270101370000: ou um papel do Negócio pelo RH$q$);
    IF n = v THEN RAISE EXCEPTION 'rh_agenda_tecnicos: a verificação não está onde se esperava.'; END IF;
    EXECUTE n;
  END IF;
  IF position('20270101370000' IN pg_get_functiondef('public.rh_agenda_tecnicos(uuid,date,date)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '20270101370000: rh_agenda_tecnicos não ficou redefinida.';
  END IF;
END $do$;
