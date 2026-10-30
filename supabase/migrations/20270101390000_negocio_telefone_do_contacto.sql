-- 20270101390000 (30/10/2026, visto no browser): o telefone do cliente no negócio. neg_ler_negocios lia só anew_entities.phone; o
-- "Editar os dados do cliente" e o envio ao portal gravam o telefone nos telefones do contacto (anew_entity_phones). Ao recarregar, o
-- negócio ficava sem telefone e o envio do contrato voltava a pedi-lo. Agora: o phone da entidade, ou o telefone principal do contacto.
-- Uma troca no texto vivo (md5 guardado).

SET lock_timeout = '5s';

DO $do$
DECLARE v text; n text;
BEGIN
  v := pg_get_functiondef('public.neg_ler_negocios(uuid)'::regprocedure);
  IF position('20270101390000' IN v) = 0 THEN
    IF md5(v) <> 'b26b3f22283f2e07c1f76073c4917742' THEN
      RAISE EXCEPTION 'A função neg_ler_negocios mudou: rever a migration 20270101390000 contra o texto vivo.';
    END IF;
    n := replace(v, $q$'telefone', coalesce(e.phone, ''),$q$,
      $q$'telefone', coalesce(nullif(btrim(e.phone), ''), (SELECT ep.phone_number FROM anew_entity_phones ep WHERE ep.entity_id = e.id
                     ORDER BY ep.is_primary DESC NULLS LAST, ep.created_at DESC LIMIT 1), ''), -- 20270101390000$q$);
    IF n = v THEN RAISE EXCEPTION 'neg_ler_negocios: o telefone não está onde se esperava.'; END IF;
    EXECUTE n;
  END IF;
  IF position('20270101390000' IN pg_get_functiondef('public.neg_ler_negocios(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '20270101390000: neg_ler_negocios não ficou redefinida.';
  END IF;
END $do$;
