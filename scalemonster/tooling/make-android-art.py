"""
Gera o ícone e o splash do ScaleMonster no Android a partir do logo (src/assets/logo.png).

  python ./tooling/make-android-art.py

Mantém o tamanho de cada arquivo que já existe no projeto (mesmas densidades e orientações),
então o Gradle não precisa de outra configuração. Fundo escuro da marca (#0B0A12).
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
LOGO = Image.open(ROOT / "src" / "assets" / "logo.png").convert("RGBA")
RES = ROOT / "android" / "app" / "src" / "main" / "res"
BG = (11, 10, 18, 255)  # #0B0A12, fundo escuro da marca
ADAPTIVE_BG_HEX = "#0B0A12"


def fit(logo: Image.Image, box: int) -> Image.Image:
    """Logo inteiro dentro de um quadrado (sem cortar o escudo)."""
    w, h = logo.size
    k = box / max(w, h)
    return logo.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)


def square_icon(size: int, round_mask: bool) -> Image.Image:
    base = Image.new("RGBA", (size, size), BG)
    art = fit(LOGO, round(size * 0.84))
    base.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    if round_mask:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        base.putalpha(mask)
    return base


def foreground(size: int) -> Image.Image:
    """Camada do ícone adaptativo (108 dp): só a área segura central (66 dp), fundo transparente."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    art = fit(LOGO, round(size * 0.66))
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


def splash(width: int, height: int) -> Image.Image:
    base = Image.new("RGBA", (width, height), BG)
    art = fit(LOGO, round(min(width, height) * 0.5))
    base.alpha_composite(art, ((width - art.width) // 2, (height - art.height) // 2))
    return base


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGBA").save(path, optimize=True)
    print("ok", path.relative_to(ROOT), img.size)


def main() -> None:
    # Ícones (legado e redondo) e camada adaptativa, por densidade.
    for d in RES.glob("mipmap-*"):
        ref = d / "ic_launcher.png"
        if not ref.exists():
            continue
        size = Image.open(ref).size[0]
        save(square_icon(size, False), d / "ic_launcher.png")
        save(square_icon(size, True), d / "ic_launcher_round.png")
        fg = d / "ic_launcher_foreground.png"
        if fg.exists():
            save(foreground(Image.open(fg).size[0]), fg)

    # Splash: cada arquivo existente, na própria resolução.
    for p in sorted(RES.glob("drawable*/splash.png")):
        w, h = Image.open(p).size
        save(splash(w, h), p)

    # Cor do fundo do ícone adaptativo.
    bg_xml = RES / "values" / "ic_launcher_background.xml"
    text = bg_xml.read_text(encoding="utf-8")
    bg_xml.write_text(text.replace("#FFFFFF", ADAPTIVE_BG_HEX), encoding="utf-8")
    print("ok", bg_xml.relative_to(ROOT), ADAPTIVE_BG_HEX)


if __name__ == "__main__":
    main()
