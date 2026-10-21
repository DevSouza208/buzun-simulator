# WorldGen — Experimento VETORIAL (7.2-vetores)

## Diagnóstico

O OSM já fornecia linhas vetoriais em metros e o mapa plano da 7.1.1
estava correto horizontalmente. O que causava os "dentinhos" perto da
Rua Tenente-Coronel Herman José Rocha não era falta de vértices na fonte:
o mapa era rasterizado em apenas **768px para cada 420m de terreno**,
posteriormente reduzido/mipmapado, criando degraus na borda.

Este ramo usa malha vetorial 3D achatada, diretamente da geometria OSM:
**não há Canvas, bitmap ou textura 768px para a pista**. A GPU rasteriza
os polígonos na resolução real da tela, utilizando o MSAA já existente
no renderizador do simulador.

## Como funciona

1. `createFlatVectorRoadPlan(map.roads)`: índice único das vias OSM do
   Grajaú, escala X/Z = 1 metro por unidade, pulando outras camadas
   (`bridge/tunnel` separados).
2. Cada segmento vetorial vira duas faces de largura física constante.
   Nas pontas e nas curvas de mais de ~3°, são adicionados encontros
   circulares (arcos com subdivisão dependente do raio em metros).
3. Cada triângulo vetorial é recortado **só após ser calculado em
   coordenadas globais**, por um tile visível de 420m. Bordas de tiles
   usam as mesmas coordenadas de corte e, portanto, não dependem do
   alinhamento de pixels.
4. Existem três camadas com materiais compartilhados, não imagens:
   - `sidewalk` (faixa externa);
   - `curb` (bordo estreito);
   - `asphalt` (pista, desenhada acima das outras duas).
   O chão natural continua uma folha totalmente plana de dois
   triângulos por tile.
5. As vias térreas NÃO são reenviadas ao antigo gerador de polígonos 3D
   de calçada; a flag herdada da 7.1.1 mantém essa fonte desligada.
   Pontes e túneis permanecem em suas camadas 3D.
6. A geometria de cada tile é descartada ao sair do raio visível.
   Os três materiais são compartilhados e descartados ao fechar
   o mundo, evitando uma textura por tile.

## Comparação

- **Vetorial:** `?worldgen=flat&roads=vector&debug=worldgen`
- **Raster anterior:** `?worldgen=flat&debug=worldgen`
- **Raster rápido:** `?worldgen=flat&quality=fast&debug=worldgen`
- **Asfalto 3D antigo:** `?worldgen=flat&roads=geometry&debug=worldgen`

URLs acima se aplicam APENAS à branch `experiment/worldgen-72-vector-pavement-20261021`.
A `main` continua sem alteração.

## O que essa solução resolve e o que ela NÃO promete

**Resolve em arquitetura:** a resolução dos contornos deixa de depender
do bitmap 768px; a pintura em 3 camadas respeita as larguras do OSM e
não remonta as antigas calçadas trianguladas.

**Não garante eliminar ilhas entre ruas:** ilhas de solo que existem
entre braços afastados de uma bifurcação no OSM permanecerão.
Se o mapa estiver com lacunas de topologia OSM, devem ser corrigidas
por grafo/união física, não pelo antialiasing.

**Custo a medir:** o número de triângulos será MAIOR que os dois
triângulos do bitmap. Em contrapartida, deixa de alocar texturas
768px por tile. O orçamento alvo é manter FPS perto de 60 no mesmo
PC, mas somente benchmark real confirma viabilidade.

## Critérios de aceite

- Percurso McDonald's → Habib's e mais duas ruas secundárias.
- Contorno sem "dentes" de pixels na câmera próxima e na distante.
- Tile 420m atravessado sem fraturas.
- Nenhuma sobreposição de calçadas 3D térreas; zebra permanece visível.
- Sem FPS sustentado abaixo do tolerável no PC de referência.
- Sem redução ou deformação da escala métrica.
- Somente após aprovação visual voltar a considerar o relevo DEM.

O código e testes verificam geometria e índices, mas **não substituem
uma inspeção no navegador**.
