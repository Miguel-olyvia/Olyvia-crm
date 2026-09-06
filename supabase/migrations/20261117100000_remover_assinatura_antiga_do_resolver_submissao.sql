-- Reposição imediata. A migração 20261117090000 recriou, com CREATE OR REPLACE,
-- a assinatura de três argumentos de `rpc_resolve_form_submission` — que tinha
-- sido APAGADA de propósito em 20261116120000, quando a função passou a aceitar
-- `p_entity_id` para se poder escolher a segunda candidata de um conflito.
--
-- Com as duas assinaturas vivas ao mesmo tempo, e tendo ambas os argumentos
-- extra com valor por omissão, o PostgREST deixa de conseguir escolher e
-- responde "Could not choose the best candidate function" a QUALQUER chamada.
-- Ou seja: o botão de resolver uma submissão deixou de funcionar para toda a
-- gente, em todas as organizações.
--
-- Esta migração apaga a assinatura antiga e deixa só a de quatro argumentos,
-- que é a que a aplicação chama. Não toca no corpo de nada.

DROP FUNCTION IF EXISTS "public"."rpc_resolve_form_submission"("uuid", "text", "jsonb");
