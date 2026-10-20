# Etapa 5.2 — Faixas inteligentes no Buzun WorldGen

## Objetivo
Depois de unir as superfícies do asfalto (etapa 5.1), decidir quantas faixas cabem em cada via do Grajaú e posicionar marcações low poly em **metros reais**. As coordenadas OSM, o relevo do Mapzen, os corredores de calçada e a malha de asfalto união ficam **inalterados**.

## Algoritmo
Fonte: `src/road-lanes.js` (funções puras).

- A entrada é a largura disponível da pista (**não** inclui calçada), classe OSM, direção `oneway`, e as tags `lanes`, `lanes:forward` e `lanes:backward`.
- Reservamos aproximadamente **3,0 m por faixa** e 0,30 m de tolerância total. Este é um parâmetro gráfico de planejamento, não uma medição municipal ou norma de trânsito.
- Rua de mão dupla: **uma faixa por direção** inicialmente; se couberem **quatro**, gera duas em cada sentido; se couberem **seis**, três por sentido. Os dados OSM explícitos de total par têm prioridade quando couberem.
- Rua de mão única: uma, duas ou três faixas conforme largura; a posição é alinhada ao eixo OSM.
- Se ambas as tags `lanes:forward` e `lanes:backward` estiverem presentes, podemos representar 2+1, 1+2 etc., respeitando o limite físico.
- Uma tag `lanes=3` sem direções não autoriza inventar qual direção recebe duas faixas: preservamos uma divisão simétrica estimada e registramos `osm-ambiguous` nas estatísticas.
- Se OSM informar mais faixas do que cabem na largura, respeitamos a largura e registramos `width-constrained`.
- As vias residenciais de 7 m e a maior parte das ruas pequenas permanecem com 1+1 sem sinalização fictícia excessiva. Exemplo de largura padrão estimada para a Belmira (`primary=12.6`): 2+2; esses números são inferências, não contagem auditada.
- Rotatórias sinalizadas como `junction=roundabout` passam a ser consideradas `oneway=yes` no importador.

## Pintura das faixas
- Dupla amarela somente em vias largas e relevantes **de mão dupla**; uma linha de centro em casos menores de classe principal/terciária.
- Faixas adicionais no mesmo sentido usam separadores **brancos tracejados** (4,4 m de traço a cada 12 m).
- Duas linhas laterais brancas onde houver largura suficiente e a classe permitir.
- Os tracejados têm fase contínua ao longo da via OSM, mesmo com amostras de 5 m na malha 3D.
- A pintura é suspensa ao redor de pontos compartilhados dos cruzamentos para não atravessar esquinas.
- As marcações seguem a mesma altitude das seções viárias, sem nova fonte de relevo.
- A posição das marcas é relativa à direção do eixo OSM; não constitui descrição jurídica de ultrapassagem, segregação de ônibus ou segurança rodoviária.

## Integrado
- `src/grajau-osm.js` mantém `lanes:forward` e `lanes:backward` nos dados vindos do Overpass (snapshots antigos continuam usando inferência).
- `src/city-road-mesh.js` usa `resolveLanePlan` uma vez por via, gera marcações conforme o trecho e interrompe a pintura junto às interseções.
- `src/city-world.js` mostra `stats.laneStatistics` com distribuição por número de faixas, fontes, mão única, dados ambíguos e limites físicos.
- `tests/road-lanes.test.js` verifica configurações, preservação métrica, segurança das marcações e todas as vias do snapshot do Grajaú.

## O que ainda NÃO foi feito
- Reconstrução topológica de calçadas e guias a partir do contorno final da união do asfalto (**etapa 5.3**).
- Ilhas de tráfego, faixas de pedestres, semáforos e marcações específicas de ônibus / ciclovias.
- Importação em tempo real de regras de conversão/turn lanes e levantamento visual de faixas reais por Street View.
- Transições de largura desenhadas por curvas (faixas começam ou terminam conforme limites do OSM; continuidade numérica não significa transição legal de faixas).
- A sinalização depende de largura estimada onde OSM não especifica `width` e/ou `lanes`. A sinalização real da Belmira precisará ser validada com imagens/levantamento, mesmo que a geometria pareça correta.

## Validação visual
1. Carregar o Buzun no Grajaú. A v0.1.52 deverá aparecer.
2. Na Belmira, conferir duas faixas por sentido nos trechos onde o sistema usa 12,6 m de largura e não há tags de 2 faixas contraditórias.
3. Na rua residencial, conferir ausência de dupla amarela e uma faixa por sentido.
4. Na mão única, conferir ausência de linha amarela central e, se houver espaço, tracejado branco entre faixas.
5. Verificar se marcas não atravessam a área central dos cruzamentos; registrar endereço do trecho onde restar algum defeito.
6. Conferir Console `[Buzun WorldGen] Faixas inteligentes` para o resumo completo.
