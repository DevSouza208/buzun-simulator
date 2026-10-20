# Etapa 5.18 — alturas contínuas nas divisas do streaming

## Problema

As regiões do Buzun medem **880 m × 880 m**, com 52 m de contexto de vias OSM ao seu redor antes da composição final. Na v0.1.69 o cálculo de altura de condução consultava exclusivamente o compositor 3D da região contendo a posição atual. Quando ela ainda estava carregando, a física voltava a um chute baseado na linha central OSM + altitude DEM, **mesmo quando a região vizinha já havia processado a mesma rua**. Isso poderia causar um solavanco ao cruzar a divisa.

## Implementação (apenas streaming experimental)

O módulo puro `src/worldgen-boundary-height.js` aplica:

1. Consulta a região que contém a posição do ônibus. Dentro de **9 m** de uma fronteira, considera também os vizinhos cardeais e, nos cantos, o vizinho diagonal.
2. Preserva a ordem autoritativa anterior: asfalto da via, preenchimento de esquina, altura da rampa, calçada e, só quando não existe superfície compatível, a altitude natural do terreno.
3. Se a região proprietária ainda não estiver pronta, usa as amostras já concluídas da vizinha. As geometrias com o halo original OSM possuem seções da rua além da área que elas próprias desenham.
4. Quando as duas regiões estão prontas, suaviza diferenças de altura de até **45 cm** na faixa de 9 m, **somente** quando são a mesma rua identificada pelo OSM, do mesmo layer e da mesma classe de superfície (asfalto com asfalto ou passeio com passeio). Não mistura níveis de ponte, vias distintas, rampa com asfalto nem canto com calçada.
5. O modelo de recorte do terreno pode buscar asfalto de uma vizinha, com limite de distância física à borda da pista.
6. O cache da 5.17 fornece `peek(key)` para ler a superfície de um setor estacionado sem recolocar os meshes na cena nem afetar a ordem LRU.

A suavização atua na **consulta física de altura**, não desloca vértices dos triângulos renderizados. Se a inspeção visual encontrar rachadura 3D, isso exige uma correção geométrica própria; não confundir esse efeito com a continuidade de colisão.

## Próxima região na trajetória

O gerador `roadRegionAhead(x,z,heading)` prevê a interseção do vetor de movimento com a borda da região atual. Quando a próxima região está a até **130 m**, ela é priorizada na fila de geração. Essa priorização não duplica nem remove outros setores; o ônibus ainda recebe carregamento emergencial síncrono se chegar a uma região antes da compilação.

O planejador agora reavalia a direção a cada **60 m** de deslocamento em vez de 200 m. A pré-carga cooperativa e os dois Workers (asfalto e calçadas) continuam ativos nos setores de fundo.

## Indicadores de diagnóstico

Abrir:

https://devsouza208.github.io/buzun-simulator/?worldgen=stream

O HUD agora apresenta:
- **Próxima divisa**: número de solicitações de pré-carregamento priorizadas;
- **Altura na divisa**: número de alturas suavizadas e de consultas recuperadas da vizinha;
- **Carregamentos urgentes**: regiões atuais que chegaram antes da pré-carga.

Dados completos via `window.buzunWorldgenReport().streaming`:
`boundaryHeightBlends`, `boundaryNeighborSamples`,
`boundaryPrefetches`, `boundaryUrgentLoads`,
`borderFallbackHeights`.

## Testes automatizados

O arquivo `tests/worldgen-boundary-height.test.js` valida:
- fronteiras em coordenadas positivas e negativas, vizinhos em canto;
- região proprietária ausente com dados reais da vizinha;
- correção bilateral no mesmo OSM ID (camada e tipo iguais);
- recusa de mistura entre vias diferentes, alturas incompatíveis e bridge layers distintos;
- precedência das rampas e preenchimentos de esquina;
- ausência de leituras distantes da superfície viária;
- predição da próxima célula nos eixos X/Z e na diagonal;
- empréstimo de altura do cache sem reativar o mesh nem modificar a ordem LRU;
- prioridade determinística da fila;
- **via do extrato OSM real do Grajaú** atravessando X=3520 m, com delta de ~0,000041 m entre as amostras antes/depois de uma fronteira, num teste que aplica artificialmente 13 cm de diferença aos dois índices regionais.

**CI:** 231 testes aprovados, zero falhas. O resultado de **0,04 mm** é de teste numérico com altitude sintética sobre geometria OSM real; não é uma medição de levantamento viário ou da GPU.

## Limites e próximos passos

A melhoria não altera o modo tradicional do Buzun. Ainda **não há prova de direção real, FPS, desaparecimento de pedaços de pista ou teste visual de emenda no navegador WebGL** nesta fase. O streaming segue ativado apenas por URL de experimento.

Próxima etapa sugerida: testar navegação por rota entre regiões no navegador, checar altura do veículo em pontos reais de junção e, se houver diferença visual, alinhar diretamente os vértices 3D das bordas entre regiões antes de considerar o streaming como padrão.
