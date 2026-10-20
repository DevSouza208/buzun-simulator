# Etapa 5.11 — WorldGen progressivo por regiões (modo experimental)

## Como testar

**Modo novo, experimental, com painel de desempenho:**

https://devsouza208.github.io/buzun-simulator/?worldgen=stream

**Modo tradicional estável, preservado como padrão:**

https://devsouza208.github.io/buzun-simulator/

A diferença é intencional: **não vamos substituir o carregamento clássico antes de testar no navegador real**. O Buzun Create continua acessível no modo novo, mas requer inspeção visual de mudança de câmera, atualizações e teletransporte.

## Arquitetura

O motor tradicional montava a geometria 3D das **4.777 vias** de uma só vez, aplicando união de asfalto, geração de calçadas, esquinas, guias e rampas no Grajaú inteiro antes de disponibilizar a cena.

A nova variante `src/city-world-stream.js`:

1. Lê uma única vez as vias OSM já disponíveis, constrói um índice espacial **leve dos eixos originais**, preserva o grafo de tráfego e o minimapa. Esses dados globais são mantidos na memória para navegação e física, mesmo sem todos os polígonos 3D.
2. Seleciona primeiro a **região do ponto inicial**, medindo 880 m × 880 m. Usa `createRegionRoadIndex` para trazer todas as vias cuja caixa delimitadora cruza o núcleo ampliado por **52 m de margem técnica**.
3. Executa as regras existentes de asfalto unido, concordância vertical, calçadas, meio-fios, curvas, travessias, rampas, pintura e materiais com todos os caminhos da margem. **Somente após a união geométrica** recorta cada triângulo no retângulo real do setor; os vértices têm altura interpolada. A união não cria extremidades artificiais na divisão entre setores.
4. Envia ao Three.js **somente os triângulos do setor inicial** e libera a cena inicial.
5. Agenda setores vizinhos em ordem da distância à câmera durante `requestIdleCallback` (ou `setTimeout` de reserva). Cada chamada monta uma região, sem tentar compilar a cidade inteira de uma vez. O pré-carregamento cobre até 1.260 m da posição atual.
6. Ao se deslocar ou teletransportar, planeja novamente as regiões. Libera `BufferGeometry` dos setores abandonados quando estão a mais de 2.350 m ou excedem o orçamento de 16 regiões carregadas. Reutiliza os materiais e texturas compartilhados, evitando liberar uma textura que outra região está usando.
7. Mantém o relevo lazy original (setores de 420 m com máscaras de recorte), as ruas globais para o minimapa e `heightAt` para a física. Quando um setor ainda não está carregado, calcula uma **altitude aproximada** a partir da linha central OSM e do mesmo DEM, prevenindo quedas no vazio; o carregamento de vizinhos deve terminar antes que o carro se aproxime.

O Buzun ainda pode usar o fluxo original através de `createWorld(scene,map,{cityRoads:true})`. A nova rota é `{cityRoads:true,progressive:true}`.

## Métricas no navegador

Ao abrir `?worldgen=stream`, o HUD mostra:
- `Streaming`: número de regiões carregadas e aguardando;
- duração da região inicial (ms);
- região atualmente em construção;
- FPS, draw calls, triângulos renderizados, triângulos viários visíveis e orçamento de geometria ativa.

O console também aceita:

```js
window.buzunWorldgenReport()
```

e mostra em `streaming` os contadores `readyRegions`, `unloadedRegions`, `totalRegionBuildMs`, `maxRegionBuildMs` e `trianglesAllocated`.

## Testes automatizados

`tests/worldgen-region-stream.test.js` valida:
- coordenadas negativas e bordas de setor exatamente em múltiplos de 880 m;
- halo garantindo que **uma rua cruzando duas regiões** pertença ao contexto geométrico de ambas;
- recorte de triângulos sem duplicar área 2D, e **mesmo valor de Y no limite** de dois setores em ladeira;
- exclusão de triângulos vazios e manutenção de buffers não indexados de três vértices;
- planejamento a partir de 4.777 vias reais do Grajaú.

**Benchmark CI do planejador, não de WebGL:** no setor de coordenadas (0,0) foram selecionadas **176 de 4.777 vias**, ~3,7% da malha original, para a primeira geração. A consulta levou menos de 1 ms. A duração real do compositor 3D da região é medida no navegador, não nesse teste.

## Limitações e próximos passos

- **Experimental:** o CI não executa Three.js, WebGL e mapa Mapzen em um navegador real. Embora as invariantes de recorte passem nos testes, devem ser verificadas as transições em T/X, meios-fios complexos, pontes e mudanças rápidas de região.
- Uma região ainda é compilada **sincronamente durante uma tarefa idle**, podendo causar uma pausa de FPS. Uma futura versão deve fragmentar também *dentro* de cada região se a medição real apontar necessidade.
- O primeiro setor é construído em uma chamada síncrona. O objetivo desta etapa é evitar a construção de toda a cidade, não prometer carregamento instantâneo.
- Há margem de seleção repetida: ruas que passam por vários setores são processadas novamente em contextos diferentes, **mas os triângulos visíveis são separados pelo recorte**. O custo total de processamento pode aumentar numa travessia de toda a cidade, apesar de reduzir o carregamento e a geometria alocada simultaneamente.
- O fallback de altitude num setor ainda não compilado é aproximado; recomendamos um raio de pré-carregamento adequado antes de usar esse modo como padrão.
- Os canteiros, zebras e rampas baseiam-se em geometria OSM e não substituem levantamento viário/acessível real.

## Próxima etapa

**5.12 — validar visualmente e consolidar streaming**: conferir no navegador que a cena aparece, detectar eventuais linhas retas na fronteira das regiões, registrar FPS/tempo de cada setor, garantir teletransporte estável e só depois considerar ativar a versão progressiva como padrão.
