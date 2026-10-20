# Etapa 5.9 — acabamento de materiais e piso tátil ilustrativo

## O que mudou

A superfície asfaltada unificada da Etapa 5.1 e as calçadas reconstruídas nas Etapas 5.3/5.8 permanecem **geometricamente inalteradas**. A etapa 5.9 melhora a leitura visual do entorno das vias com texturas low poly pequenas e detalhes de solo junto às rampas.

### Três texturas geradas no próprio navegador

`src/street-materials.js` prepara três arrays RGBA de 64 × 64 pixels determinísticos (sem downloads, imagens externas ou arquivos de fonte):

- **Asfalto:** grafite ligeiramente granulado, baixo contraste, sem faixas visuais que confundam a sinalização.
- **Calçada:** concreto bege com juntas de expansão discretas entre placas, sem criar espessura extra nem novas fissuras na geometria.
- **Canteiro:** verde de variação suave, com pequenos pontos, preservando o desenho conservador do OSM.

O mundo 3D cria um `THREE.DataTexture` por tipo e **reutiliza o mesmo material em todos os chunks**. O UV de cada vértice é calculado a partir das coordenadas métricas globais X/Z, portanto a textura não recomeça quando um polígono é partido por uma união de asfalto, esquina ou travessia. As juntas são **apenas aparência**: não alteram física nem colisão.

A paleta mantém a estética low poly. As faixas brancas/amarelas, as guias e a vegetação continuam materiais separados.

### Piso tátil baixo nas rampas realmente existentes

O novo `src/tactile-paving.js` gera um conjunto de pequenas marcações quadradas de tom amarelo-ocre **somente nas zonas de rampas associadas a zebras validadas**. Cada lado normalmente recebe 14 quadradinhos em duas fileiras, com relevo visual de aproximadamente 14 mm em relação ao perfil modelado.

No `src/sidewalk-union.js`, cada quadradinho é **intersectado com o polígono de calçada que restou após subtrair o asfalto e reconstruir a rampa**. Assim não aparece sobre outras vias, fora da calçada, sobre um passeio recortado nem num local sem rampa. Sua elevação usa a mesma `rampTopOffset` da geometria de 5.8 e não muda as alturas do veículo.

`src/city-road-mesh.js` envia os triângulos ao buffer `tactile` do respectivo chunk, **um material compartilhado por chunk**, evitando um Mesh para cada quadradinho. A costura de 5.6 respeita o relevo dos quadradinhos.

### Diagnósticos

O console mostra `[Buzun WorldGen] Materiais e piso tátil:` com informações sobre os três tipos de textura e o número de triângulos/fragmentos táteis aceitos.

### Testes e desempenho

- `tests/street-finishes.test.js`: texturas determinísticas, opacas, UV global, juntas do piso, pavers dentro da rampa, nenhuma marca sem rampa e ausência em vias diferentes.
- `tests/grajau-ramp-integration.test.js`: integra o novo callback de pavers à união real de 250 vias do Grajaú, assegura coordenadas finitas e limita crescimento da geometria.

**Medição CI da amostra com 250 vias:** 185 travessias pintáveis, 370 rampas, **12.620 triângulos táteis, 6.306 fragmentos**, aproximadamente **1,21 s** para composição dos passeios e meios-fios. Antes do detalhe tátil, a mesma amostra levou aproximadamente 1,1 s; comparar com cautela porque os testes são execuções distintas. 161 testes automatizados aprovados.

## Limites

- Materiais são um acabamento **estilizado**; não representam o asfalto ou o desenho de placas exatos do Grajaú.
- Piso tátil é **ilustrativo**, não produto acessível real, nem certificação de conformidade à NBR 9050 ou NBR 16537.
- As juntas da calçada são apenas visuais, geradas em UV de mundo, e podem não acompanhar o ângulo real de cada passeio.
- A textura de 64 px é deliberadamente discreta para evitar repetição exagerada. Não foram adicionadas fotos de satélite, edifícios, texturas de marcas comerciais ou mudanças no relevo.
- A cena 3D completa ainda precisa ser inspecionada no navegador, e a medição com 250 vias não prediz FPS no PC/celular.
- O mapa OSM, o minimapa, o asfalto unificado, as rampas, a física de altura e as marcas de trânsito continuam com suas fontes anteriores.

## Validação visual
1. Abrir **v0.1.59** do Buzun, entrar na direção ou no Buzun Create.
2. Conferir a granulação no asfalto e as juntas discretas de concreto nas calçadas, inclusive nas esquinas, sem listras ou texturas reiniciadas na borda de cada triângulo.
3. Aproximar de uma faixa de pedestres: deverá existir uma região tátil amarelo-ocre na calçada **dos dois lados da zebra**, alinhada à rampa e sem invadir a pista.
4. Afastar a câmera: a repetição dos desenhos não deve criar cintilação excessiva ou grandes quedas de desempenho.
5. No console, conferir `finishStatistics.tactileTriangles` e `finishStatistics.tactileFragments`.

## Próxima etapa sugerida

**WorldGen 5.10 — inspeção visual e orçamento de renderização:** auditoria dos trechos que ainda parecem artificiais, inspeção de interseções com capturas do jogo, perfil de FPS/tempo de geração/memória por setor e LOD seletivo para detalhes minúsculos distantes.
