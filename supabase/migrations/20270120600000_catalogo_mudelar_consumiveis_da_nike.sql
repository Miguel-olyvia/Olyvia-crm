-- 17/11 (Rúben: «migra também da Nike os consumíveis que estão na Nike para a Mudelar, para os mesmos serviços; também os
-- equipamentos»). Os equipamentos já estão na Mudelar (1 001 ligações a serviços da Mudelar, com equipamentos da Mudelar: nada a
-- fazer). Os consumíveis não: a Nike tem 148 (com preço de compra, unidade e fornecedor) e 1 151 linhas de receita em 367 serviços;
-- a Mudelar tem 0. Aqui copiam-se para a Mudelar, ligados aos MESMOS serviços (pela chave: c12, s-mobp0001, …):
--  1. as unidades que faltam (cx, kg, kit, l, m, m², rolo, saco, t, tubo);
--  2. os fornecedores dos consumíveis que a Mudelar ainda não tem (pelo nome: Weber, Würth, Sanitop, Robbialac…);
--  3. os consumíveis (produtos tipo_catalogo 'consumivel'), com product_organizations, os preços e o fornecedor de cada artigo;
--  4. as receitas: service_materials (quantidade, opcional, referência por m²) para o serviço da Mudelar com a mesma chave.
-- Tudo numa transação. O que já existe na Mudelar (consumível com o mesmo SKU, fornecedor ou unidade com o mesmo nome) fica:
-- pode correr-se outra vez.

begin;

create temp table _orgs on commit drop as
select '3242e925-da26-459a-8258-be04d904e355'::uuid mudelar, 'b6ffce4f-f630-4933-833a-008649757a33'::uuid nike;

-- 1. unidades
insert into uom (code, description, conversion_factor, is_active, organization_id, root_organization_id)
select u.code, u.description, u.conversion_factor, u.is_active, o.mudelar,
       (select v.root_organization_id from uom v where v.organization_id = o.mudelar and v.root_organization_id is not null limit 1)
from (
  select distinct on (u.code) u.* from uom u
  where u.id in (select p.uom_id from products p, _orgs o where p.organization_id = o.nike and p.tipo_catalogo = 'consumivel'
                 union select i.uom_id from item_suppliers i join products p on p.id = i.product_id, _orgs o where p.organization_id = o.nike and p.tipo_catalogo = 'consumivel'
                 union select sm.uom_id from service_materials sm, _orgs o where sm.organization_id = o.nike)
  order by u.code
) u, _orgs o
where not exists (select 1 from uom v where v.organization_id = o.mudelar and v.code = u.code);

-- 2. fornecedores
insert into suppliers (organization_id, name, created_by)
select o.mudelar, s.name, s.created_by
from (
  select distinct on (lower(s.name)) s.* from suppliers s
  where s.id in (select p.supplier_id from products p, _orgs o where p.organization_id = o.nike and p.tipo_catalogo = 'consumivel'
                 union select i.supplier_id from item_suppliers i join products p on p.id = i.product_id, _orgs o where p.organization_id = o.nike and p.tipo_catalogo = 'consumivel')
  order by lower(s.name)
) s, _orgs o
where not exists (select 1 from suppliers t where t.organization_id = o.mudelar and lower(t.name) = lower(s.name));

-- de-para: unidades, fornecedores e consumíveis (Nike → Mudelar)
create temp table _uom on commit drop as
select u.id antigo, (select v.id from uom v, _orgs o where v.organization_id = o.mudelar and v.code = u.code limit 1) novo
from uom u, _orgs o where u.organization_id = o.nike;

create temp table _forn on commit drop as
select s.id antigo, (select t.id from suppliers t, _orgs o where t.organization_id = o.mudelar and lower(t.name) = lower(s.name) limit 1) novo
from suppliers s, _orgs o where s.organization_id = o.nike;

create temp table _cons on commit drop as
select p.id antigo, gen_random_uuid() novo
from products p, _orgs o
where p.organization_id = o.nike and p.tipo_catalogo = 'consumivel' and not coalesce(p.is_deleted, false)
  and not exists (select 1 from products q where q.organization_id = o.mudelar and q.sku = p.sku);

-- 3. os consumíveis
insert into products (id, sku, name, description, status, is_active, created_by, short_description, long_description,
  is_sellable, is_purchasable, has_variants, organization_id, supplier_id, uom_id, product_kind, manages_stock, image_urls,
  tipo_catalogo, unidade, fator_servico, entulho_m3, entulho_kg, marca_livre, fornecedor_livre)
select c.novo, p.sku, p.name, p.description, p.status, p.is_active, p.created_by, p.short_description, p.long_description,
  p.is_sellable, p.is_purchasable, p.has_variants, o.mudelar, f.novo, u.novo, p.product_kind, p.manages_stock, p.image_urls,
  p.tipo_catalogo, p.unidade, p.fator_servico, p.entulho_m3, p.entulho_kg, p.marca_livre, p.fornecedor_livre
from _cons c join products p on p.id = c.antigo
left join _forn f on f.antigo = p.supplier_id
left join _uom u on u.antigo = p.uom_id, _orgs o;

insert into product_organizations (product_id, organization_id, created_by)
select c.novo, o.mudelar, p.created_by from _cons c join products p on p.id = c.antigo, _orgs o;

insert into product_prices (product_id, currency, price, price_promo, valid_from, valid_to, created_by, price_type, vat_rate, preco_exato)
select c.novo, pp.currency, pp.price, pp.price_promo, pp.valid_from, pp.valid_to, pp.created_by, pp.price_type, pp.vat_rate, pp.preco_exato
from product_prices pp join _cons c on c.antigo = pp.product_id;

insert into item_suppliers (organization_id, item_type, product_id, supplier_id, supplier_sku, purchase_price, currency, lead_time_days,
  moq, uom_id, is_preferred, is_active, notes, created_by, preco_data)
select o.mudelar, i.item_type, c.novo, f.novo, i.supplier_sku, i.purchase_price, i.currency, i.lead_time_days,
  i.moq, u.novo, i.is_preferred, i.is_active, i.notes, i.created_by, i.preco_data
from item_suppliers i join _cons c on c.antigo = i.product_id
join _forn f on f.antigo = i.supplier_id and f.novo is not null
left join _uom u on u.antigo = i.uom_id, _orgs o
where i.deleted_at is null;

-- 4. as receitas: o mesmo serviço na Mudelar (pela chave)
insert into service_materials (organization_id, service_id, product_id, quantity, uom_id, notes, sort_order, created_by,
  reference_area_m2, reference_quantity, opcional, quantidade_exata)
select o.mudelar, t.id, c.novo, sm.quantity, u.novo, sm.notes, sm.sort_order, sm.created_by,
  sm.reference_area_m2, sm.reference_quantity, sm.opcional, sm.quantidade_exata
from service_materials sm
join services s on s.id = sm.service_id
join _orgs o on s.organization_id = o.nike
join services t on t.organization_id = o.mudelar and t.chave = s.chave
join _cons c on c.antigo = sm.product_id
left join _uom u on u.antigo = sm.uom_id
where sm.deleted_at is null;

commit;

-- Conferir (deve dar 148 consumíveis e ~1 150 linhas de receita na Mudelar):
-- select (select count(*) from products where organization_id = '3242e925-da26-459a-8258-be04d904e355' and tipo_catalogo = 'consumivel') consumiveis,
--        (select count(*) from service_materials where organization_id = '3242e925-da26-459a-8258-be04d904e355' and deleted_at is null) receitas;
