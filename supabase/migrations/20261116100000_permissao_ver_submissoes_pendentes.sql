-- Cria a permissão que falta para a página de submissões pendentes.
--
-- A rota /leads/pending-submissions é guardada por
-- `platform.pending_submissions.view`, mas essa permissão NUNCA existiu em
-- `anew_permissions` -- confirmado por leitura ao remoto. Resultado: a página
-- responde "Access Denied" a toda a gente, sem excepção. Nem um administrador
-- de sistema entra, porque `hasPermission` (src/contexts/PermissionsContext.tsx)
-- não tem atalho para esse caso, fechado de propósito.
--
-- Ou seja: a fila de revisão existe, os dados chegam-lhe (a política de leitura
-- foi corrigida em 20261116090000), e a porta está trancada sem chave.
--
-- Esta migration cria APENAS a chave -- a entrada no catálogo. Não a dá a
-- ninguém: enquanto nenhuma linha de `anew_role_permissions` a referir, a
-- página continua fechada exactamente como está hoje. A atribuição é decisão
-- de quem gere o produto e faz-se por dados, não por migration, porque depende
-- de que papéis existem em cada organização.
--
-- Os atributos seguem os das outras permissões 'platform.*' já existentes
-- (platform.dashboard.view, platform.users.view, ...): categoria 'platform',
-- scope 'global', sem suporte de âmbito ORG/TEAM/OWNED -- é uma permissão de
-- entrar ou não entrar. O que cada pessoa vê LÁ DENTRO já é decidido pela
-- política de leitura de form_submissions, essa sim por âmbito.
--
-- Idempotente e não destrutiva: só acrescenta uma linha de catálogo.

INSERT INTO "public"."anew_permissions"
  ("code", "name", "description", "category", "scope", "supports_scope", "display_order", "is_dangerous")
VALUES (
  'platform.pending_submissions.view',
  'Ver submissões pendentes',
  'Abrir a fila de submissões de formulários por rever. As submissões visíveis dentro da página continuam limitadas ao âmbito do utilizador (as suas leads e clientes, os da equipa, ou os da organização).',
  'platform',
  'global',
  false,
  0,
  false
)
ON CONFLICT ("code") DO NOTHING;
