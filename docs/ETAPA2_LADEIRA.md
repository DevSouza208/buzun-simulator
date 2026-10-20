# Buzun Simulator — Etapa 2: Ladeira real (McDonald's → Habib's)

## Dados medidos e limites

- Traçado das ruas: recorte do OpenStreetMap em `public/data/belmira-corridor.json` (cerca de 1.159 m de rota selecionada).
- Altitudes: grade versionada em `public/data/belmira-elevation.json`, amostrada no serviço OpenTopoData com o dataset SRTM de resolução nominal aproximada de 30 m. A **grade exportada usa espaçamento de 70 m**, logo seu detalhamento efetivo é menor que o do DEM original.
- Altitudes interpoladas nos extremos da rota: cerca de **814 m** no início (McDonald's) e **766 m** no fim (Habib's): descida aproximada de **48 m**. Não é declividade constante e não representa uma medição de engenharia.
- Geometrias 3D são suavizadas/interpoladas; não incluem sarjetas, lombadas, rampas de entrada, viadutos e detalhes centimétricos.

## Como funciona

1. `configureTerrain` carrega a amostra SRTM; `sampleHeight(x,z)` é a única fonte de altura do solo.
2. `createWorld` desenha o terreno com alturas por vértice e divide as faixas de asfalto/calçada em peças curtas; **os quatro cantos de cada peça** consultam a altura do terreno.
3. O carro usa essa mesma altura e inclina na direção do deslocamento.
4. `slopeAlongHeading` estima a declividade sob o carro. `slopeAcceleration` aplica um componente moderado de gravidade durante o movimento. Parado, o veículo conserva uma retenção automática para não escapar sozinho ao jogador soltar os controles.
5. O HUD informa se o carro está numa subida, descida ou trecho praticamente plano, e o acompanhamento até o Habib's continua ativo.

## Validar antes de considerar pronto

- Rodar `npm run verify` (testes automáticos não verificam WebGL nem fluidez).
- Testar no PC e celular a seleção inicial **McDonald's**, dirigindo até o **Habib's**, observando continuidade das vias transversais e altura do asfalto.
- Conferir se não há tiras de estrada afundadas ou flutuantes, principalmente em mudanças bruscas de altitude e cruzamentos.
- Confirmar comportamento da câmera em ladeiras, frenagem/gravidade e desempenho em dispositivos lentos.
- Se algo visual não bater com o lugar real, registrar coordenadas ou capturas: SRTM amostrado **não é um levantamento preciso da rua**.

## Para o futuro Buzun Create

Manter separadas as camadas de **OSM (traçado)**, **altimetria (grade/DEM)** e **fachadas (materiais e modelos)**. Assim o botão Create pode regenerar ruas e terrenos a partir de âncoras geográficas sem perder ajustes manuais de edifícios.
