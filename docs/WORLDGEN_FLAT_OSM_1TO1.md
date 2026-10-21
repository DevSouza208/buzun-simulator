# Experimento — Grajaú plano, OSM real 1:1

## Objetivo

Recomeçar o teste da geometria da cidade **sem relevo**. O minimapa
já desenha a rede original do OpenStreetMap, incluindo as 4.777 vias
do snapshot atual. Esta branch desenha no mundo 3D a MESMA geometria
horizontal (X/Z em metros), em vez de usar a altitude aproximada do DEM.

**Não é um novo mapa fictício:** é o mesmo `public/data/grajau-city-roads.json`
consumido pelo minimapa. A largura das vias continua sendo a largura
registrada no OSM, ou a estimativa existente quando não há largura
oficial. Isso não constitui medição topográfica de precisão.

## Alterações isoladas nesta branch

- A versão **da branch** começa em modo plano se a URL não tiver
  `worldgen`; `?worldgen=flat&debug=worldgen` também funciona.
- `?worldgen=sheet` e `?worldgen=stream` continuam disponíveis nesta
  branch para comparar sem relevo.
- O gerador lê exatamente `sourceRoads` do snapshot e **ignora
  alterações locais gravadas pelo editor** enquanto o modo plano
  estiver ativo.
- Não cria vias artificiais para fechar lacunas, usando somente ruas
  presentes no minimapa.
- O relevo SRTM/Terrarium não é baixado no modo plano.
- Solo: um plano de altura global Y=0, dividido em tiles de 420 m
  renderizados com 2 triângulos por tile; não há buracos nem DEM.
- Todas as ruas térreas recebem altura uniforme: base Y=0, asfalto
  visível Y=0,072. Calçadas usam seus níveis normais de meio-fio.
- Pontes e túneis com `layer` recebem separação visual de
  5 metros por nível; não são medições reais da altura da ponte.
- O atlas global de asfalto preserva o mesmo traçado de vias;
  chunks apenas carregam e exibem a geometria próxima.
- Colisão de carro e inclinação usam o modo plano; HUD indica
  `GRAJAÚ PLANO · OSM 1:1`.

## Como testar (esta branch não substitui produção)

```bash
git clone https://github.com/DevSouza208/buzun-simulator.git
cd buzun-simulator
git switch experiment/flat-grajau-osm-1to1-20261021
npm run verify
npm start
```

Abrir `http://localhost:5173/` — nesta branch a planície é o padrão.
Alternativamente: `http://localhost:5173/?worldgen=flat&debug=worldgen`.

**Atenção:** o GitHub Pages `devsouza208.github.io/buzun-simulator/`
publica a branch de produção, não automaticamente esta branch
experimental. Um link público de homologação só pode ser dado
depois de um deploy efetivo da branch.

## Critérios de aceite

1. O número de ruas desenhadas coincide com o snapshot usado no
   minimapa; pontos, curvas e junções permanecem nas mesmas
   coordenadas X/Z e na mesma escala 1:1.
2. Nenhuma rua ganha inclinação decorrente de DEM; chão plano Y=0.
3. Ao passar por bordas 420/880/220 m não aparece degrau ou vão.
4. Pontes/túneis preservam layers separados onde indicado no OSM.
5. FPS e tempo de montagem são comparados ao WorldGen 6.3.
6. Não modificar `main` até o usuário aprovar visualmente.

O propósito é **isolar o erro de geometria/topologia** do erro de
altimetria. Mesmo plano, cruzamentos podem exigir reparo na malha;
é exatamente o que este experimento pretende permitir diagnosticar.
