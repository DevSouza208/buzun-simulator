# Buzun Simulator — Etapa 4.3: Asfalto em lençol contínuo

## Objetivo visual

O traçado do OpenStreetMap continua sendo o **eixo 1:1**. O Buzun gera uma malha de asfalto contínua por via: ela acompanha o relevo nas subidas e descidas, sem chapas rígidas ou recortes triangulares de terreno sobre a pista.

## Mudanças

- `src/draped-road.js`: subdivisão contínua do eixo viário a cada **até 5 metros**, com alturas interpoladas e suavização local do perfil longitudinal (janela de cerca de 10 m). As coordenadas horizontais e comprimentos não são alterados.
- Trechos compartilhados entre vias usam alturas da mesma fonte DEM nos nós reais de cruzamento. O asfalto, as linhas, o meio-fio e a calçada consultam as alturas do mesmo perfil, sem variar o nível transversalmente com os pixels do DEM.
- Interseções seguem as alturas interpoladas da malha viária em vez de gerar tampas com relevo independente.
- `src/terrain-cutout.js`: dentro das áreas de rua e calçada, o terreno é rebaixado geometricamente e continua excluído pela máscara. A transição até o relevo natural acontece **somente depois da calçada**, em uma faixa aproximada de 6 m.
- Removidas as faixas triangulares de terra desenhadas pelas próprias ruas nas bordas: atravessavam cruzamentos e pareciam manchas de terreno por cima do asfalto.
- `src/city-world.js`: a altura do veículo na pista e na calçada agora usa o perfil real da malha viária renderizada; em terreno natural, mantém o DEM existente.

## Limitações

Uma rua é contínua ao longo de cada polilinha OSM. Cruzamentos ainda são sobreposições de malhas com uma tampa de mesma altitude, **não uma operação topológica de união poligonal exata**. É preciso conferir visualmente esquinas complexas, pontes e trechos onde o OSM não informa largura. O relevo Mapzen é estimado em resolução de terreno, não reproduz lombadas ou greides levantados em campo.

## Como testar

1. `npm run verify`: verifica o perfil métrico, a continuidade nas junções e a projeção de altura na pista.
2. Acessar o Buzun no GitHub Pages, esperar a versão nova ser exibida e dirigir pelo início da Avenida Dona Belmira Marin até a parte da grande descida.
3. Conferir se sumiram as faixas verdes atravessando as pistas, e se não existem degraus entre duas partes da mesma rua.
4. Conferir se o carro acompanha o asfalto sem flutuar ou entrar nele e se as calçadas mantêm altura coerente.
5. Se houver desnível abrupto em alguma esquina, enviar captura e endereço aproximado para análise de perfil e topologia específicos.

Não adicionamos prédios nesta etapa.
