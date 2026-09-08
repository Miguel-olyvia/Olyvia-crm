-- deals: a politica de INSERT so exigia pertenca a organizacao, sem verificar a
-- permissao deals.create. Um utilizador com clients.view mas SEM deals.create
-- conseguia criar deals por insert directo -- em concreto pelo botao "Novo
-- Pedido" em massa na pagina de Clientes, que nem tinha PermissionGate. Como a
-- RLS tambem nao travava, era escalonamento entre modulos (achado a3 do raio-X,
-- confirmado ao vivo).
--
-- Fecha-se no ponto que conta -- a RLS -- exigindo tambem
-- has_anew_permission('deals.create'). A criacao legitima de deals na app passa
-- por rpc_create_deal (SECURITY DEFINER, que ignora a RLS), por isso NAO e
-- afectada; so os inserts directos (bulk "Novo Pedido" e ClientDetailsDialog)
-- passam a exigir a permissao, que e o comportamento correcto.
--
-- Espelha o padrao ja usado em deal_stages e pipeline_links, que ja verificam
-- has_anew_permission. Forward-only, so aperta a WITH CHECK do INSERT.

ALTER POLICY "Users can create deals in their org" ON public.deals
  WITH CHECK (
    organization_id IN (SELECT public.get_user_crm_org_ids(auth.uid()))
    AND public.has_anew_permission(auth.uid(), 'deals.create')
  );
