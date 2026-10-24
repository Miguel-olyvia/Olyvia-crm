-- Bloqueio de uma conta criada pelo registo aberto (laviada37@gmail.com) e da
-- organizacao "medular" que ela criou.
--
-- EFEITO JA APLICADO NO REMOTO A 30/09, a mao. Esta migration existe so para
-- o repositorio nao divergir da base: e idempotente e inofensiva se o bloqueio
-- ja estiver feito. Nao precisa de codigo novo.
--
-- Cada linha e filtrada por id E confirmada por email ou nome. Se a linha nao
-- existir (base reconstruida do zero) nao faz nada e nao da erro. Sem DELETE,
-- sem DDL, nenhuma outra conta ou organizacao.
--
-- COMO REVERTER (manual, noutra migration):
--   auth.users            -> banned_until = null
--   anew_users            -> status = 'active', deleted_at = null
--   anew_memberships      -> status = 'active'
--   anew_organizations    -> status = 'active'

UPDATE auth.users
SET banned_until = '2126-09-06'
WHERE id = 'd68534d3-d013-4a63-a07c-d3b70065f0e5'
  AND lower(email) = 'laviada37@gmail.com';

UPDATE public.anew_users
SET status = 'inactive',
    deleted_at = coalesce(deleted_at, now())
WHERE id = '4c11198f-9a58-4bb2-9803-b22c7208fda9'
  AND lower(email) = 'laviada37@gmail.com';

UPDATE public.anew_memberships
SET status = 'inactive'
WHERE id = '7d2d3943-ef2c-4ea6-8889-c7704f564fce'
  AND user_id = '4c11198f-9a58-4bb2-9803-b22c7208fda9'
  AND organization_id = 'dc29c2fa-7cc3-440e-8b97-23c60af296d1';

UPDATE public.anew_organizations
SET status = 'inactive'
WHERE id = 'dc29c2fa-7cc3-440e-8b97-23c60af296d1'
  AND lower(name) = 'medular';
