-- 17/11 (teste A-Z na Mudelar, «Simular função»: o Org Admin não podia registar a fatura nem via as Operações). O servidor não dá passe
-- livre ao Org Admin (fn_cat_pode: só o administrador de sistema, as permissões da função e o Papel no Negócio): o que ele faz nos Negócios
-- vem das permissões da função. Aqui a função Org Admin (code 'org_admin', a global e as das organizações) fica com TODAS as permissões dos
-- Negócios (negocios.*: fases, orçamento, contrato, fatura, pagamento, obra, Operações). Não tira nada a ninguém. Pode correr-se outra vez.
do $$
declare n int;
begin
  insert into public.anew_role_permissions (role_id, permission_code, created_by)
  select r.id, p.code, null::uuid
  from public.anew_roles r
  join public.anew_permissions p on p.code like 'negocios.%'
  where r.code = 'org_admin' and r.deleted_at is null
  on conflict (role_id, permission_code) do nothing;
  get diagnostics n = row_count;
  raise notice 'Org Admin: % permissões dos Negócios juntadas.', n;
end $$;

-- O resultado (só leitura): por cada função Org Admin, quantas permissões dos Negócios tem e se tem as da fatura e das Operações.
select r.name, coalesce(o.name, 'global') as organizacao,
       count(*) filter (where rp.permission_code like 'negocios.%') as permissoes_negocios,
       bool_or(rp.permission_code = 'negocios.registar_fatura') as fatura,
       bool_or(rp.permission_code = 'negocios.obra.planear') as operacoes
from public.anew_roles r
left join public.anew_organizations o on o.id = r.organization_id
left join public.anew_role_permissions rp on rp.role_id = r.id
where r.code = 'org_admin' and r.deleted_at is null
group by r.name, o.name;
