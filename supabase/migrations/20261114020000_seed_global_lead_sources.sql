-- Origens globais em falta para a atribuicao automatica pelo referrer.
--
-- O referrerSource.ts mapeia 16 dominios para nomes de origem, mas so 13
-- linhas existiam em lead_sources -- e nenhuma delas cobria Google organico,
-- TikTok, Bing e companhia. Sem a linha, a lead ficava com o nome certo em
-- texto e source_id nulo, ou seja sem ligacao para relatorios.
--
-- Todas globais (organization_id NULL), como as 13 que ja existiam, portanto
-- visiveis a todas as organizacoes.
--
-- Google Ads, Facebook e Instagram ja existem e nao sao tocados. "Google" e
-- distinto de "Google Ads": um e pesquisa organica, o outro e trafego pago
-- identificado pelo gclid.
--
-- Idempotente: so insere o que nao existir com o mesmo nome em ambito global.
--
-- Rollback:
--   delete from public.lead_sources where organization_id is null and name in
--     ('Google','LinkedIn','YouTube','TikTok','Bing','DuckDuckGo','Yahoo',
--      'Twitter/X','Pinterest','WhatsApp','Telegram');
INSERT INTO public.lead_sources (name, description, is_active, organization_id)
SELECT v.name, v.descricao, true, NULL
FROM (VALUES
  ('Google',      'Pesquisa organica do Google'),
  ('LinkedIn',    'Trafego vindo do LinkedIn'),
  ('YouTube',     'Trafego vindo do YouTube'),
  ('TikTok',      'Trafego vindo do TikTok'),
  ('Bing',        'Pesquisa do Bing'),
  ('DuckDuckGo',  'Pesquisa do DuckDuckGo'),
  ('Yahoo',       'Pesquisa do Yahoo'),
  ('Twitter/X',   'Trafego vindo do Twitter/X'),
  ('Pinterest',   'Trafego vindo do Pinterest'),
  ('WhatsApp',    'Trafego vindo do WhatsApp'),
  ('Telegram',    'Trafego vindo do Telegram')
) AS v(name, descricao)
WHERE NOT EXISTS (
  SELECT 1 FROM public.lead_sources ls
  WHERE ls.organization_id IS NULL
    AND lower(trim(ls.name)) = lower(trim(v.name))
);
