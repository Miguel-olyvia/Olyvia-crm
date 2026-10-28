# Desenho: número e fase do negócio criado pelo Pipeline (rascunho 20261231995000)

Não aplicado. Só se aplica com ordem do utilizador: testes contra o remoto da RH primeiro, `db push --linked` depois.

## O que a base mostrou (RH, só leitura, 28/10)

- O número já é dado sozinho pelo gatilho `trg_negocios_numero` (migration 20261231940000): máximo da organização + 1, a começar em 1001, com cadeado por organização. `neg_criar_negocio` faz INSERT em `negocios` e passa por ele.
- Os 3 negócios sem número são da nike, vivos, criados a 26/10 entre 12:58 e 13:00, antes de o gatilho existir. Os 2 criados a 28/10 têm 1001 e 1002. Ou seja: hoje o Pipeline já cria com número; o que falta é a fase (nasce NULL) e numerar os 3 antigos.
- Unicidade: `negocios_org_numero_key` UNIQUE (organization_id, numero) WHERE numero IS NOT NULL.
- Interruptor do fluxo por organização: a linha em `negocio_workflow_config` (o que `fn_neg_exigir_config` exige). 1 organização tem-no.

## O que muda

1. `fn_negocios_numero` passa a SECURITY DEFINER com search_path fixo. Hoje corre com a RLS de quem insere: quem só vê os seus negócios calcula o máximo sobre esses e choca com o índice único. Mesmo cálculo, mesmo cadeado.
2. `fn_neg_fase_derivada(negócio, organização)`: a regra de `neg_resumo_quadro` em fase: contrato, proposta, orçamento ou levantamento vivo 3; visita não cancelada 2; chamada 1; senão 0.
3. `neg_criar_negocio`: mesma assinatura (11 argumentos), CREATE OR REPLACE sobre a versão em vigor (20261228200000, igual ao catálogo). Nasce com fase 0; depois das ligações grava a fase derivada.
4. Preenchimento único: negócios vivos sem número das organizações com o fluxo ligado; número pelo mesmo cálculo e cadeado, por ordem de criação; fase só onde é NULL. **Afeta 3 (medido)**, todos da nike, todos ficam na fase 3 (têm levantamento) e com 1003, 1004 e 1005.
5. Guarda: zero por numerar, zero números repetidos, índice presente, uma só `neg_criar_negocio` com 11 argumentos, INVOKER e search_path fixo, sem EXECUTE para anon, gatilho ativo e DEFINER.

## Desvios ao pedido, e porquê

- `neg_criar_negocio` fica SECURITY INVOKER, não DEFINER: a versão em vigor é INVOKER e a guarda de 20261228200000 exige-o (`'neg_criar_negocio', false, 11, 'authenticated'`); a autorização é a RLS `negocios_insert`. Passá-la a DEFINER saltava essa RLS.
- Contrato e proposta contam como fase 3 (Negócio), não 4: a regra do quadro não distingue o Financeiro. Para os 3 negócios de hoje é indiferente (nenhum tem contrato nem proposta).
- «Levantamento guardado» segue o quadro: levantamento não apagado, sem olhar a `estado`.

## Por provar

- O choque de número para um utilizador de âmbito restrito (ponto 1) é dedução da RLS, não reproduzido.
- Nada foi corrido: a função, o preenchimento e a guarda só se provam a correr.
- A gravação da fase depende de quem cria ter `pessoas.edit` no âmbito do negócio (é o que já exige ligar registos); sem ligações fica 0.
