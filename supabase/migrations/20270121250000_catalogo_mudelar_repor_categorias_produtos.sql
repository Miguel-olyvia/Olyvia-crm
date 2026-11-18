-- 17/11 (noite): REPOR as categorias de produto da Mudelar que o SQL 3 (20270121200000, «ramo dos produtos») mudou sem querer.
--
-- O que aconteceu: o SQL 3 só gravava products.catalogo_categoria_id (o ramo da árvore dos SERVIÇOS, para o motor). Mas o gatilho
-- trg_cat_produto_tabelas (20270117100000, ponto 4, último ramo) trata uma mudança só do ramo como «uma versão antiga da app mudou o ramo»
-- e põe a categoria de produto a segui-lo: criou 17 categorias de produto com os nomes da árvore dos serviços («Canalização › Louças e
-- torneiras»…) e passou para lá os 29 639 produtos (as sanitas deixaram de estar em «Loiças Sanitárias › Sanitas»). E o gatilho dos
-- modelos (trg_products_modelo_upd) tirou-lhes o modelo, porque a subcategoria mudou.
--
-- O registo de auditoria (entity_audit_log, a mesma transação: created_at 2026-11-17 17:46:12.845941+00) guardou o valor antigo de cada
-- campo. Isto repõe category_id, subcategory_id e model_id como estavam, e catalogo_categoria_id volta a ser o que o gatilho calcula
-- pelos nomes (como na importação). Só mexe nos produtos que ainda estão na subcategoria que o SQL 3 lhes deu (o que alguém mudou
-- depois fica). No fim, as 17 categorias criadas por engano ficam apagadas (deleted_at), se já ninguém as usa.
--
-- O motor passa a saber o ramo de cada categoria de produto na própria app (src/emylia/ramoDosProdutos.ts): o SQL 3 deixou de ser preciso.
do $$
declare
  v_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  v_t constant timestamptz := '2026-11-17 17:46:12.845941+00';
  n_rep int; n_cat int;
begin
  create temp table _rep on commit drop as
  select a.entity_id as id, a.changed_fields as cf
  from public.entity_audit_log a
  where a.table_name = 'products' and a.operation = 'UPDATE' and a.created_at = v_t
    and a.changed_fields ? 'subcategory_id';

  update public.products p set
    category_id = case when r.cf ? 'category_id' then (r.cf->'category_id'->>'old')::uuid else p.category_id end,
    subcategory_id = (r.cf->'subcategory_id'->>'old')::uuid,
    catalogo_categoria_id = null,
    model_id = case
      when r.cf ? 'model_id' and exists (select 1 from public.product_models pm
                                         where pm.id = (r.cf->'model_id'->>'old')::uuid and pm.organization_id = v_org
                                           and pm.subcategory_id = (r.cf->'subcategory_id'->>'old')::uuid and pm.deleted_at is null)
        then (r.cf->'model_id'->>'old')::uuid
      else p.model_id end
  from _rep r
  where p.id = r.id and p.organization_id = v_org
    and p.subcategory_id is not distinct from (r.cf->'subcategory_id'->>'new')::uuid;
  get diagnostics n_rep = row_count;

  update public.product_categories c set deleted_at = now()
  where c.organization_id = v_org and c.created_at = v_t and c.deleted_at is null
    and not exists (select 1 from public.products p where p.organization_id = v_org and (p.category_id = c.id or p.subcategory_id = c.id))
    and not exists (select 1 from public.product_models pm where pm.subcategory_id = c.id and pm.deleted_at is null)
    and not exists (select 1 from public.services s where s.exige_categoria_produto_id = c.id);
  get diagnostics n_cat = row_count;

  raise notice 'Repostos % produtos; % categorias criadas por engano apagadas.', n_rep, n_cat;
end $$;

-- O resultado (só leitura): quantos produtos da Mudelar ainda estão numa das categorias criadas por engano (deve dar 0), e quantos têm modelo.
select
  (select count(*) from public.products p join public.product_categories c on c.id = p.subcategory_id
    where p.organization_id = '3242e925-da26-459a-8258-be04d904e355' and c.created_at = '2026-11-17 17:46:12.845941+00') as ainda_na_categoria_errada,
  (select count(*) from public.products p where p.organization_id = '3242e925-da26-459a-8258-be04d904e355' and p.model_id is not null
    and not coalesce(p.is_deleted, false)) as produtos_com_modelo,
  (select count(*) from public.product_categories c where c.organization_id = '3242e925-da26-459a-8258-be04d904e355'
    and c.created_at = '2026-11-17 17:46:12.845941+00' and c.deleted_at is null) as categorias_erradas_por_apagar;
