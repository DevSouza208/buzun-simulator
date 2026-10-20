# Etapa 5.13 — renderização por câmera e pré-carregamento orientado ao movimento

## Motivação
A primeira otimização (5.12) reduziu os draw calls no navegador remoto de **242 (v0.1.63)** para **68 (v0.1.64)** e o tamanho estimado dos buffers de **57,96 para 42,42 MiB**. Porém, o número de triângulos no frame subiu de **344.212 para 400.774** e o FPS remoto permaneceu em cerca de **2,4–2,5**. Como o navegador remoto não reproduz necessariamente o PC do usuário, esses valores são um diagnóstico, não uma previsão de performance local.

### 1. Evitar desenhar ruas fora da câmera
O componente `meshFrom` usava `frustumCulled=false` em todos os meshes viários, inclusive no streaming. O preset `streaming` agora configura `cameraFrustumCulling:true`; a geometria calcula `boundingSphere` e permite ao Three.js descartar malhas inteiramente fora do frustum da câmera.

Isso usa uma esfera conservadora em cada região de 880 m, de modo que qualquer parte visível de uma região mantém o mesh. **Não substitui o LOD radial**; a câmera pode descartar regiões atrás do jogador mesmo que elas estejam perto radialmente.

O perfil `complete` continua com `cameraFrustumCulling:false`, preservando exatamente o caminho de renderização validado anteriormente.

### 2. Raio visual de streaming ajustado
No streaming, o raio geral de visibilidade viária passa de **850 m para 670 m**, mantendo asfalto e calçadas próximos do ônibus e mantendo a histerese de 18 m contra piscadas ao atingir o limiar.

O modo tradicional permanece em **850 m**. O relevo e a física de piso continuam de acordo com seus próprios índices; apenas desenhar ou não um mesh distante muda.

Como os grupos têm 880 m, a distância é medida **à borda mais próxima de todo o polígono regional**, não ao centro da região. Isso evita desaparecer uma rua junto ao ônibus por estar na ponta distante do mesh.

### 3. Direção do movimento determina prioridade de regiões
`prioritizeDriveRegions` parte da mesma lista de regiões no raio de 1.260 m existente na versão anterior, mas garante que a região do ônibus venha primeiro e que, entre regiões distantes semelhantes, as localizadas **à frente da trajetória** sejam compiladas antes das atrás.

A direção inicial vem do eixo da rota OSM e é atualizada a cada deslocamento mensurável ao longo do jogo. Regiões traseiras e laterais NÃO são removidas da lista; só a ordem muda. Sem movimento, a prioridade por distância é mantida.

Se o ônibus for teletransportado ou alcançar uma fronteira antes do idle callback carregar a região atual, o motor constrói **o setor exato da posição atual** de maneira prioritária e registra o incidente em `stats.streaming.urgentRegionLoads`. Esse fallback pode causar pausa única no frame; preserva o chão 3D no local de destino.

### 4. Testes
`tests/worldgen-driving-culling.test.js` cobre o perfil antigo versus streaming, prioridades de movimento nos dois sentidos, manutenção do conjunto de regiões, caminhadas nas fronteiras de 880 m e uma amostra de **2.028 deslocamentos** extraídos de ruas OSM reais. A última execução CI fechou com **194 testes aprovados, zero falhas**.

## Como testar
- Streaming: https://devsouza208.github.io/buzun-simulator/?worldgen=stream
- Tradicional: https://devsouza208.github.io/buzun-simulator/

No streaming, aguarde o painel estabilizar e compare com a referência **v0.1.64: 11 regiões, 68 draw calls, 400.774 triângulos/frame, 42,42 MiB estimados, 2,4–2,5 FPS remoto**. Em seguida clique **COMEÇAR A DIRIGIR**, vire o ônibus e atravesse o limite de regiões; observe se as ruas aparecem, se o minimapa segue funcionando e se existem pausas excessivas quando a região atual ainda não está na memória.

### Limites
- O frustum de um mesh de 880 m é aproximado por uma esfera grande: sua eficiência varia bastante com a posição e orientação da câmera.
- O FPS é influenciado por CPU, GPU, navegador, janela e HUD; **não garantir ganho de FPS sem medir**.
- O fallback de carregamento síncrono emergencial pode travar um frame, e a etapa não elimina a compilação síncrona de cada nova região.
- Asfalto, calçadas, cruzamentos, inclinação do DEM, física e topologia OSM não foram simplificados nem deslocados nesta etapa.
- Não ativar streaming como padrão sem teste contínuo de direção e comparação dos piores cruzamentos.

## Próxima etapa
**5.14**: a partir dos resultados de câmera e direção, priorizar o maior gargalo restante: se o volume de triângulos continuar alto, introduzir subagrupamento criterioso apenas de calçadas; se o processamento travar durante deslocamento, particionar a composição regional em tarefas progressivas.
