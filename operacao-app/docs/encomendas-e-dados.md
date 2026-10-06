# Distância ao armazém, encomendas na data certa e dados em falta

> Feito a 06/10/2026 no ramo `feat/ops-dados-encomendas`. SQL em
> [`db/dados-encomendas.sql`](../db/dados-encomendas.sql) (corre **depois** do
> `obras.sql`, idempotente). Validação: `npm run validar-dados-encomendas`.

## 1. Distância real ao armazém

**Sem serviço externo.** O CRM já tem a tabela `postal_codes` com coordenadas
(863 códigos a 06/10/2026). A morada procura-se:

1. pelo código postal completo (CP7), se existir na tabela;
2. senão, pela média do CP4 (cobre ~85 % das moradas do CRM);
3. senão, pela média do CP2 (~99 %).

O armazém é o mais próximo dos `warehouses` ativos **da organização** (a
Mudelar tem "Lisboa", 1675-195 Odivelas). Distância de estrada = linha reta ×
1,3; tempo = 30 km/h até 10 km, 50 km/h acima, + 5 min. É para logística, não
para GPS.

Onde se vê:

- **CRM, orçamento** → "Sugestão a partir da ficha do local": a linha
  *Deslocações* passa a usar os km reais ida e volta (em vez dos 30 fixos) e
  mostra "Armazém Lisboa · 30 km · ~49 min".
- **Operações, ficha da obra** → bloco "Ficha do local": a mesma linha, e "A
  preparar" com os km reais.

O código postal da obra vem da **morada de obra do orçamento** e, sem ela, do
que estiver escrito na morada da obra (`NNNN-NNN`).

*Se um dia for preciso mais precisão* (rua e porta), troca-se `ops_geo_cp` por
uma chamada a um geocodificador (Nominatim/OSM numa edge function, com cache
numa tabela) — o resto não muda.

Funções: `ops_geo_cp`, `ops_geo_km`, `ops_distancia_armazem`,
`ops_obra_codigo_postal`, `rpc_ops_distancia_armazem(org, cp)` (CRM: quem é da
organização) e `rpc_ops_obra_distancia(obra)` (quem vê a obra).

## 2. Encomendas na data certa

Para cada material **em falta** numa tarefa por fazer (os `materiais_crm`
ligados no passo "Serviços do contrato" da Nova obra — o mesmo critério do
prazo dos materiais):

```
encomendar até = início planeado − prazo do fornecedor − 2 dias de margem
```

O prazo é o do fornecedor preferido (`item_suppliers.lead_time_days`), senão o
SLA do fornecedor. Se já houver encomenda em aberto com o produto, diz quando
chega.

| Estado | Quando |
|---|---|
| Em atraso | a data-limite passou e não há encomenda |
| Chega tarde | há encomenda, mas chega depois do início |
| Esta semana | encomendar nos próximos 7 dias |
| Sem prazo | não se sabe o prazo do fornecedor |
| Mais tarde | há tempo |
| Encomendado | há encomenda que chega a tempo, ou a data foi dada à mão |

Onde se vê:

- **Operações → A encomendar** (menu, para supervisor/gestor): o painel geral,
  por defeito só o urgente.
- **Ficha da obra** → bloco "A encomendar" (os urgentes; "Ver todos").
- **Sino do CRM**: um aviso por obra ao supervisor e aos gestores quando há
  material em atraso, a chegar tarde, ou a encomendar nos próximos 3 dias.
  Resolve-se sozinho. Corre todos os dias às 07:00 UTC (`pg_cron`,
  `ops-obras-encomendas`). Nunca avisa clientes (é a mesma
  `ops_obra_notificar`).

⚠ A 06/10/2026 **nenhuma tarefa tem materiais ligados** (0/216) e **nenhum
fornecedor tem prazo** (0/286). Até isso mudar, a lista fica vazia — o que se
vê é o aviso "sem prazo" nos fornecedores (CRM) e nos dados em falta.

## 3. Dados em falta que pioram o plano

Nada fica obrigatório. Diz-se, no sítio certo, o que falta e o que se perde:

**Nas Operações**, na ficha da obra, o bloco "Dados em falta que pioram o
plano" (`rpc_ops_obra_dados_em_falta`), com o link para onde se preenche:

- obra sem orçamento; orçamento sem morada de obra; ficha do local por
  preencher ou incompleta (acesso, estacionamento, elevador, casa habitada,
  pavimento);
- morada sem código postal, ou código postal/armazém desconhecido (distância
  estimada);
- áreas sem medidas da visita (m² de pavimento) → Pedido de Proposta;
- materiais sem prazo do fornecedor → Produtos → Fornecedores;
- ofícios das tarefas sem ninguém na equipa → Definições;
- tarefas desta semana sem ninguém; obra sem supervisor.

**No CRM**, avisos discretos (âmbar, "não é obrigatório"):

- orçamento → morada de entrega: "Falta na ficha: estacionamento, elevador…"
  (`src/lib/addresses/fichaEmFalta.ts`);
- negócio → necessidades: etiqueta "sem medidas" nas áreas sem m²
  (`semMedidasDaVisita`, em `src/lib/deals/diagnosticoPlaneamento.ts`);
- produto → fornecedores: "falta" no prazo e "N fornecedores sem prazo de
  entrega".

## Aplicar

1. `db/obras.sql` (se ainda não estiver na versão de 06/10).
2. `db/dados-encomendas.sql`.
3. Publicar o código (CRM + Operações). Antes do SQL, os ecrãs não mostram
   nada destes blocos (as leituras devolvem vazio quando a função não existe).

Para ver já os avisos das encomendas, sem esperar pelas 07:00:

```sql
SELECT public.ops_obra_avisar_encomendas('<org>');
```
