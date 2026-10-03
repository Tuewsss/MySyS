# Gera o ícone do DSS: build/icon.png (1024 px) e build/icon.ico (16 a 256 px).
# Uso: python scripts/gerar-icone.py   (precisa do Pillow: pip install pillow)
#
# Desenho: um SSD (placa azul com chips) e uma "faísca" de limpeza, sobre um
# quadrado escuro arredondado, nas cores do app.
from pathlib import Path
from PIL import Image, ImageDraw

S = 1024  # desenhamos grande e reduzimos: as bordas ficam suaves
BG = (11, 15, 23)  # #0b0f17, fundo do app
SKY = (14, 165, 233)  # sky-500, cor de destaque do app
SKY_DARK = (3, 105, 161)  # sky-700
CHIP = (11, 15, 23)
SPARK = (250, 204, 21)  # amarelo da faísca

img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Fundo: quadrado arredondado.
d.rounded_rectangle((32, 32, S - 32, S - 32), radius=220, fill=BG)

# Placa do SSD (levemente para baixo e à esquerda, para caber a faísca).
x0, y0, x1, y1 = 170, 330, 790, 800
d.rounded_rectangle((x0, y0, x1, y1), radius=60, fill=SKY)
# Faixa mais escura embaixo (conector).
d.rounded_rectangle((x0, y1 - 110, x1, y1), radius=60, fill=SKY_DARK)
d.rectangle((x0, y1 - 110, x1, y1 - 60), fill=SKY_DARK)
# Contatos do conector.
for i in range(8):
    cx = x0 + 70 + i * 63
    d.rounded_rectangle((cx, y1 - 80, cx + 34, y1 - 30), radius=8, fill=SKY)
# Chips de memória.
for i in range(3):
    cx = x0 + 60 + i * 180
    d.rounded_rectangle((cx, y0 + 70, cx + 140, y0 + 250), radius=22, fill=CHIP)


def spark(cx: int, cy: int, r: int, color):
    """Estrela de 4 pontas (a faísca de "limpo")."""
    k = r * 0.22  # quanto a cintura da estrela é fina
    d.polygon(
        [
            (cx, cy - r), (cx + k, cy - k), (cx + r, cy), (cx + k, cy + k),
            (cx, cy + r), (cx - k, cy + k), (cx - r, cy), (cx - k, cy - k),
        ],
        fill=color,
    )


# Contorno escuro em volta da faísca grande, para ela se destacar da placa.
spark(780, 300, 215, BG)
spark(780, 300, 180, SPARK)
spark(560, 170, 70, SPARK)

out = Path(__file__).resolve().parent.parent / 'build'
out.mkdir(exist_ok=True)
img.save(out / 'icon.png')
# O .ico guarda várias resoluções; o Windows escolhe a melhor para cada lugar.
img.save(out / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('Ícone gerado em', out)
