# WorldGen 5.21 — Costura inteligente entre trechos de vias

Objetivo: reduzir os vãos horizontais entre trechos distintos da mesma rua,
sem transformar proximidade visual em conexão geográfica falsa.

## Regra

- Comparar pontas **terminais** das vias OSM por índice espacial de 10 m.
- Conectar somente quando ambos têm o mesmo nome normalizado,
  o mesmo nível físico (sem misturar viaduto/túnel),
  largura compatível, direção voltada uma para a outra e distância
  entre 0,3 e 8 m.
- Rejeitar desníveis que impliquem inclinação maior que 32% no vão.
- Conservar intacta a base de dados e o grafo do OSM. Marcar a via
  derivada `visualConnector` e a origem `inferred:continuity`.
- Inserir pequenos vértices (até 2 m por segmento) e usar interpolação
  cúbica Hermite de altitude **C1**: as inclinações nas duas pontas
  correspondem à subida/descida da via original.
- Sobrepor ~0,65 m ao interior das duas vias para suprimir frestas de
  rasterização e recortes de triângulos.
- O conector alimenta o compositor regional do asfalto E a máscara
  de terreno, preservando recorte por regiões de 880 m.

## Limitações importantes

Esta é uma recuperação conservadora de **pequenos intervalos ausentes entre
eixos de uma mesma rua**. Não resolve ainda:
- frestas entre polígonos dentro de um cruzamento grande;
- diferenças verticais entre vias sem conexão topológica confirmada;
- detalhes ausentes de calçadas/rebaixamentos ou erro de relevo DEM;
- lacunas maiores que 8 m, que exigem inspeção antes de modelar.

A arquitetura ainda usa composição regional com halo OSM. A criação
de uma única malha global topológica seguida de recorte/renderização
por chunks continua como melhoria estrutural separada.

## Aceitação visual

- Testar McDonald's → Habib's com debug, verificando especialmente
  o cruzamento em declive do print de 20/10/2026.
- Confirmar que a faixa está orientada corretamente;
  se continuar de lado, anexar coordenadas/minimapa.
- Verificar 1) desaparecimento de vãos curtos e 2) ausência de
  falsos viadutos, atalhos ou pistas unidas indevidamente.
- Comparar FPS e tempo inicial com v0.1.72.
- Conferir que um conector curto continua íntegro ao atravessar
  uma fronteira de 880 m ou quando o chunk é reanexado pelo cache.

A existência de testes automatizados não comprova visualmente o
fechamento de todos os buracos do mapa real.
