-- Permissoes de accept_proposal_atomic (ver 20261115020000).
--
-- Ficheiro separado de proposito: o splitter de statements do Supabase CLI
-- (v2.78.1) nao consegue dividir o ficheiro da funcao e envia-o inteiro num
-- unico Parse, o que rebenta com 42601 assim que o ficheiro tem mais do que um
-- comando. Cada um destes ficheiros tem por isso UM comando so.
--
-- APENAS service_role. `p_acceptance_ip` e um parametro de entrada: se anon
-- pudesse executar esta funcao, um cliente com um link publico valido escolhia
-- o IP que fica gravado como prova da sua propria aceitacao. O unico chamador
-- legitimo e a edge function `accept-proposal`, que deriva o IP dos cabecalhos
-- do pedido e nunca do corpo.
DO $do$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.accept_proposal_atomic(uuid, text, text, text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.accept_proposal_atomic(uuid, text, text, text) TO service_role';
END
$do$
