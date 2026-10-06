# Tempos padrão — de onde vêm e como se regeneram

Os tempos padrão das obras de remodelação (casa de banho, cozinha) nasceram
dos manuais operacionais enviados pelo Hugo, compactados em tarefas, com tempos
propostos por nós e **validados pela equipa a 03/10/2026**. Tudo o que a
aplicação usa sai de um só ficheiro de dados.

```
dados.mjs  ──►  gerar-semente.mjs --escrever  ──►  db/obras.sql  (ops_obra_tempos_padrao)
           ──►  gerar-md.mjs                  ──►  docs/tempos-padrao.md  (para ler)
           ──►  gerar-excel.mjs <ficheiro>    ──►  a folha Excel validada
```

| Ficheiro | O que é |
|---|---|
| `dados.mjs` | As 18 tarefas de casa de banho, as 21 de cozinha (fase, ofício, dependências, esperas, pessoas, horas fixas, horas por medida, base da estimativa), os 48 extras com o encaixe e as medidas de referência. O formato está no cabeçalho. |
| `gerar-semente.mjs` | Transforma os dados na carga (pacotes completos, modelos parciais 0–3 e mudança de mobiliário como subconjuntos, extras por tipo de pacote, condições, fatores) e escreve-a em `db/obras.sql`. `--verificar` falha se o SQL não estiver igual. |
| `gerar-md.mjs` | Escreve `docs/tempos-padrao.md`. `--verificar` idem. |
| `gerar-excel.mjs` | A folha com o plano e o Gantt por fórmulas (precisa de `npm i --no-save exceljs`). |

## Mudar um tempo

- **Numa organização, no dia a dia:** Obras → Modelos → o serviço → gravar. A
  aprendizagem corrige-o com o real a cada tarefa validada.
- **O ponto de partida de todas:** mudar `dados.mjs`, depois

  ```
  node tools/planeamento/gerar-semente.mjs --escrever
  node tools/planeamento/gerar-md.mjs
  npm run validar-planeamento
  ```

  correr `db/obras.sql` na produção e, em cada organização, **Carregar tempos
  padrão** (não pisa modelos revistos à mão).

`npm run validar-planeamento` começa por verificar que `db/obras.sql` e
`docs/tempos-padrao.md` estão iguais a `dados.mjs`.

Os serviços encontram-se pelo **nome exato** no catálogo do CRM (os da Mudelar
a 03/10/2026). Um serviço renomeado no CRM deixa de receber o modelo — a carga
lista-o em "não encontrados".
