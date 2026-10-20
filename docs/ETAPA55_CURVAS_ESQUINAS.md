# Etapa 5.5 — curvas horizontais reais no encontro das vias

## Problema anterior
Após as etapas 5.1–5.4, o asfalto, a calçada e o meio-fio passaram a derivar da mesma superfície, mas o perímetro 2D da interseção ainda apresentava cantos de 90° ou diagonais abruptas. Um arredondamento apenas decorativo no meio-fio reabriria buracos no asfalto e criaria calçadas sobrepostas.

## Algoritmo

O novo `src/junction-fillets.js` atua em nós OSM **realmente compartilhados** por duas ou mais vias, separados por camada física `layer/bridge/tunnel`.

1. Obtém os braços de pista que partem do nó, direções das primeiras geometrias OSM e meia largura de cada pista.
2. Ordena os braços pelo ângulo polar e considera pares adjacentes; ignora colinearidades, intervalos quase paralelos, trechos curtos e ângulos incompatíveis.
3. Resolve geometricamente a interseção das duas **bordas da faixa de rolamento** voltadas para o espaço da esquina.
4. Define um raio conservador, limitado por: largura local estimada das calçadas, comprimento dos braços OSM, ângulo da esquina, mínimo de 0,65 m e máximo de 4 m.
5. Calcula os pontos tangentes nos dois braços e discretiza o arco circular em pequenos triângulos, formando **somente uma extensão aditiva do asfalto**, sem mover a centerline.
6. Os triângulos da curva entram no **mesmo** `unionAsphaltPatches` usado pelo resto das ruas, com prioridade menor que as pistas reais. Uma união posterior remove toda área encoberta pelo asfalto existente.
7. A mesma lista de triângulos alimenta `composeRoadsideMeshes`: a calçada é subtraída da nova área de asfalto, e os segmentos de guia surgem apenas no contorno 2D restante. Não existem ilhas ou curb caps sintéticos desconectados.
8. A altitude do arco deriva do plano local do entroncamento (Etapa 5.4). `createFilletSurfaceIndex` dá ao carro a altura asfaltada dentro da curva, e não a altura elevada da calçada. Fillets de pontes não são tratados como estrada térrea.

## Implementação
- `src/junction-fillets.js`: geração de preenchimentos com arcos tangentes, diagnósticos e índice de superfície.
- `src/asphalt-union.js`: suporte a polígonos triangulares adicionais de prioridade de preenchimento.
- `src/sidewalk-union.js`: subtrai os mesmos polígonos de fillet das calçadas.
- `src/city-road-mesh.js`: injeta os preenchimentos antes de criar asfalto e meio-fio.
- `src/city-world.js`: usa a nova altura ao dirigir pela curva; expõe `stats.cornerStatistics`.
- `tests/junction-fillets.test.js`: cruzamentos T, conservação de altura, união geométrica, calçadas e níveis de ponte/túnel.
- `tests/grajau-fillet-union-real.test.js`: integração de 250 vias reais do Grajaú.

## Testes e desempenho (CI)
- Snapshot completo: 4.777 vias, 6.050 nós compartilhados; ~10 mil esquinas consideradas elegíveis; outras foram puladas por geometria/alcance insuficiente.
- Recorte de 250 vias: 504 curvas, 22.589 triângulos de asfalto e 62.272 triângulos de passeio no modelo de teste; união + passeios + meio-fio em aproximadamente 1,3 segundo **na máquina do GitHub Actions**. Esse tempo **não** é benchmark de um celular.
- A quantidade de esquinas efetivamente visíveis pode ser menor, pois o recorte por prioridade elimina partes cobertas pelo próprio asfalto.

## Restrições e futuros refinamentos
- Raios são heurísticos **visuais**, não representam medições legais de raio de conversão ou geometria geodésica de engenharia.
- Algumas interseções muito estreitas, curvas agudas, ruas com vértices OSM próximos ou sobreposições complexas permanecem com a esquina antiga, deliberadamente.
- Asfalto, guias e calçadas compartilham footprint; mas o conjunto de triângulos ainda não tem conectividade topológica `watertight` nem soldagem única de vértices, e microfissuras são possíveis em curvas de OSM com amostragem miter.
- Calçada e guia ganham a curvatura pelo recorte do polígono, sem alterar sinalização de conversão ou prioridade real de tráfego.
- Só testes de direção/câmera no jogo podem validar ausência de defeitos visuais nas esquinas principais; testes de geometria não bastam para isso.

## Validação visual
1. Abrir Buzun, confirmar **v0.1.55** e carregar a área McDonald's → Habib's, Av. Dona Belmira Marin.
2. No Buzun Create, aproximar a vista superior de T/X e olhar para curvas nos cantos asfaltados sem calçada atravessada.
3. Dirigir entrando numa lateral para verificar ausência de salto na altitude da superfície.
4. No Console procurar `[Buzun WorldGen] Curvas de esquina:` com `cornersRounded`, `skippedGeometry` e `skippedShort`.
5. Registrar localização/captura de qualquer esquina com artefatos para adaptar o critério do arco, sem mexer no OSM nem no minimapa.

## Próxima etapa sugerida
Auditoria visual orientada pelo usuário nos cruzamentos do corredor e aperfeiçoamento de casos especiais: entradas estreitas, canteiros/divisórias, encontros com curvas OSM e travessias de pedestres.
