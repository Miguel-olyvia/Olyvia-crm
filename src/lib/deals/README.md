# Necessidades do negócio — diagnóstico para o planeamento da obra

Uma **necessidade** do negócio (`deal_needs`) é uma **área de intervenção**:
uma casa de banho, uma cozinha. A aba *Diagnóstico* do diálogo da necessidade
(`src/components/deals/DealNeedDiagnostic.tsx`) regista o levantamento da
visita. Desde 03/10/2026 tem também a secção **"Para o planeamento da obra"**.

## Porque existe

As Operações planeiam a obra sozinhas a partir do contrato
(`operacao-app/docs/planeamento.md`). Os pacotes ("MO Modelo Remodelação
Completa - Casa de Banho") vendem-se com quantidade 1: sem medidas, todas as
casas de banho levariam o mesmo tempo. Estes campos dão:

- **as medidas** que multiplicam os tempos das tarefas: m² de pavimento, m² de
  parede (perímetro × altura do revestimento), pontos de água e elétricos;
- **as condições** que acrescentam tarefas: gás, toalheiro;
- **os fatores** com que o motor aprende o ritmo real: janela, onde se fazem os
  cortes, distância da entrada, mobília no caminho.

## Os campos

15 colunas `deal_needs.diag_*` (migração `20261208100000_diagnostico_planeamento_obra.sql`).
Todos são **fechados e opcionais**. A reunião de 02/10/2026 pediu poucos campos,
fechados, que não obriguem quem preenche a ir ao pormenor.

| Coluna | Valores |
|---|---|
| `diag_tipo_area` | `casa_banho` · `cozinha` · `outro` |
| `diag_m2_pavimento`, `diag_perimetro_m` | 0,1 – 10000 |
| `diag_pe_direito_m` | 1,5 – 10 |
| `diag_altura_revestimento` | `20cm` · `60cm` · `120cm` · `teto` |
| `diag_pontos_agua` / `diag_pontos_eletricos` / `diag_portas_proteger` | inteiros (0–50 / 0–200 / 0–50) |
| `diag_gas` | `sem` · `manter` · `anular` · `instalar` |
| `diag_local_cortes` | `na_area` · `varanda` · `fora` |
| `diag_distancia_entrada` | `curta` · `media` · `longa` |
| `diag_mobilada` | `pouco` · `medio` · `muito` |
| `diag_toalheiro`, `diag_janela`, `diag_cliente_recusou_fotos` | sim / não |

As regras ficam em dois sítios, que têm de dizer o mesmo:
- os CHECKs da migração;
- `diagnosticoPlaneamento.ts`, com as opções, os rótulos, a validação, a leitura e
  o payload, e os testes em `__tests__/`.

## Gravação

Como os outros `diag_*`, passam no `p_need_data` de `rpc_update_deal_needs` →
`fn_apply_deal_need`. O padrão é `CASE WHEN p_need_data ? 'diag_x'`:
- uma chave ausente preserva o valor;
- uma chave com `null` apaga-o.

`DealNeedsSection.tsx` só manda estas chaves **depois** de as ter lido, e lê-as
à parte das outras. Numa base sem a migração, a leitura falha, a secção não
aparece e o resto do diálogo funciona como antes.

As Operações **só leem** (por `to_jsonb`, tolerante a colunas que faltem), a
partir de `quote_lines.source_deal_need_id`, ao vivo. A cópia congelada do
orçamento (`quote_diagnostic_snapshot`) não leva estes campos: a visita técnica
pode afinar as medidas depois do contrato, e é isso que a obra deve usar.
