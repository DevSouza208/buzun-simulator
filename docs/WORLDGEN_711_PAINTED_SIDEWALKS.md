# WorldGen 7.1.1 — Calçadas pintadas na mesma folha

## Evidência
O print recebido depois do antisserrilhamento 7.1 mostrava um
triângulo BEGE gigante no asfalto e bordas "denteadas" com sombras
escuras. Isso não era apenas aliasing raster: eram polígonos 3D das
calçadas reconstituídas por região sobrepondo a superfície plana.

## Correção aplicada somente na branch experimental

1. O índice global OSM agora inclui a largura de **toda a calçada**,
   não apenas o meio-asfalto, ao decidir quais vias pertencem a um tile.
2. Cada textura de chão (420m) recebe três passadas do **mesmo OSM**:
   - área externa de calçada;
   - linha estreita de borda do meio-fio;
   - asfalto de TODAS as ruas, **por último**. Nenhuma calçada da rua B
     consegue cobrir o asfalto da rua A num cruzamento.
3. Suprimimos as malhas de calçadas/guia térreas do antigo compositor
   quando a pintura unificada está ativa, removendo o gerador das
   pontas triangulares gigantes. Calçadas de pontes/túneis ainda podem
   usar geometria elevada na camada apropriada.
4. As zebras e faixas de pista seguem como objetos finos 3D;
   continuam sujeitos a verificação de alinhamento.
5. Se uma região não gerar geometria 3D de marcação, a rua pintada
   continua sendo uma via válida: o começo do jogo não aborta.
6. O antisserrilhamento SSAA 2x da 7.1 foi preservado, com o mesmo
   tamanho final 768px útil por tile.

## Limitações

A calçada pintada tem agora a mesma cota plana do asfalto — esta
versão **prioriza retirar sobreposições e testar a conectividade**,
não preserva ainda o degrau físico de 14cm do meio-fio no modo plano.
A próxima fase poderá incorporar guia curta 3D restrita à fronteira
dessa máscara, sem recorrer aos polígonos de calçada antiga.

A aparência do cruzamento deve ser conferida também no mesmo ângulo
de câmera. FPS e a geração inicial são métricas de aceitação.
Ainda não reintroduzir o DEM/relevo: a 7.0 e 7.1 continuam intactas.

## URLs para comparação

- Experimento 7.1.1: `?worldgen=flat&debug=worldgen`
- 7.1.1 com menos custo de raster: `?worldgen=flat&quality=fast&debug=worldgen`
- 7.0/7.1 anteriores permanecem disponíveis nas respectivas branches
  sem alterar a `main`.
