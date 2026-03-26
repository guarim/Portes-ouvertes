#!/usr/bin/env python3
"""
Génère des images PNG de placeholder pour tester le projet
avant d'avoir les vraies images.
Usage : python3 generate_placeholders.py
"""
import os
try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False

IMG_DIR = os.path.join(os.path.dirname(__file__), 'images')
os.makedirs(IMG_DIR, exist_ok=True)

IMAGES = {
    'home.png':    ('1920x1080', '#0a1628', 'Lycée Jules Verne\nPhoto d\'accueil'),
    '1.png':       ('800x500',   '#0d2b5e', 'Électricité'),
    '2.png':       ('800x500',   '#1a3a6e', 'Menuiserie & Agencement'),
    '3.png':       ('800x500',   '#0d2b5e', 'Bâtiment Gros Œuvre'),
    '4.png':       ('800x500',   '#1a3a6e', '3ème Prépa-Métiers'),
    '5.png':       ('800x500',   '#0d2b5e', 'Maintenance Bâtiment'),
    '6.png':       ('800x500',   '#1a3a6e', 'CDI'),
    'f11.png':     ('800x600',   '#0d2b5e', 'Électricité & Environnements Connectés'),
    'f21.png':     ('800x500',   '#0d2b5e', 'CAP Menuisier Installateur'),
    'f22.png':     ('800x500',   '#1a3a6e', 'CAP Menuiserie Alu Verre'),
    'f23.png':     ('800x500',   '#0d2b5e', 'BAC PRO Menuisier Agenceur'),
    'f24.png':     ('800x500',   '#1a3a6e', 'BAC PRO Menuiserie Alu Verre'),
    'f211.png':    ('800x600',   '#0d2b5e', 'CAP Menuisier Installateur'),
    'f221.png':    ('800x600',   '#1a3a6e', 'CAP Menuiserie Alu Verre'),
    'f231.png':    ('800x600',   '#0d2b5e', 'BAC PRO Menuisier Agenceur'),
    'f241.png':    ('800x600',   '#1a3a6e', 'BAC PRO Menuiserie Alu Verre'),
    'f31.png':     ('800x500',   '#0d2b5e', 'CAP Maçon'),
    'f32.png':     ('800x500',   '#1a3a6e', 'CAP Peintre'),
    'f33.png':     ('800x500',   '#0d2b5e', 'BAC PRO Aménagement'),
    'f34.png':     ('800x500',   '#1a3a6e', 'Peintre Façadier'),
    'f311.png':    ('800x600',   '#0d2b5e', 'CAP Maçon'),
    'f321.png':    ('800x600',   '#1a3a6e', 'CAP Peintre'),
    'f331.png':    ('800x600',   '#0d2b5e', 'BAC PRO Aménagement'),
    'f341.png':    ('800x600',   '#1a3a6e', 'Peintre Façadier'),
    'f411.png':    ('800x600',   '#0d2b5e', '3ème Prépa-Métiers'),
    'f511.png':    ('800x600',   '#0d2b5e', 'Maintenance Bâtiment'),
    'f51.png':     ('800x600',   '#1a3a6e', 'CDI'),
}

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2],16) for i in (0,2,4))

if HAS_PILLOW:
    for fname, (size, color, label) in IMAGES.items():
        w, h = map(int, size.split('x'))
        img = Image.new('RGB', (w, h), hex_to_rgb(color))
        draw = ImageDraw.Draw(img)
        # Grille légère
        for x in range(0, w, 80): draw.line([(x,0),(x,h)], fill=(255,255,255,20), width=1)
        for y in range(0, h, 80): draw.line([(0,y),(w,y)], fill=(255,255,255,20), width=1)
        # Texte centré
        lines = label.split('\n')
        y0 = h//2 - len(lines)*20
        for line in lines:
            bbox = draw.textbbox((0,0), line)
            tw = bbox[2]-bbox[0]
            draw.text(((w-tw)//2, y0), line, fill=(200,220,255))
            y0 += 44
        # Bordure
        draw.rectangle([2,2,w-3,h-3], outline=(26,111,196), width=2)
        path = os.path.join(IMG_DIR, fname)
        img.save(path)
        print(f'✅ {fname}')
    print('\nTous les placeholders ont été générés dans images/')
else:
    # Sans Pillow : créer de vrais PNG minimaux en pur Python
    import struct, zlib

    def make_png(w, h, color_hex):
        r,g,b = hex_to_rgb(color_hex)
        raw = b''
        for _ in range(h):
            row = b'\x00' + bytes([r,g,b]*w)
            raw += row
        compressed = zlib.compress(raw)
        def chunk(tag, data):
            c = struct.pack('>I', len(data)) + tag + data
            return c + struct.pack('>I', zlib.crc32(tag+data) & 0xffffffff)
        sig  = b'\x89PNG\r\n\x1a\n'
        ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
        idat = chunk(b'IDAT', compressed)
        iend = chunk(b'IEND', b'')
        return sig + ihdr + idat + iend

    for fname, (size, color, label) in IMAGES.items():
        w, h = map(int, size.split('x'))
        data = make_png(min(w,200), min(h,200), color)
        path = os.path.join(IMG_DIR, fname)
        with open(path, 'wb') as f: f.write(data)
        print(f'✅ {fname} (placeholder basique)')
    print('\nInstallez Pillow (pip install Pillow) pour de meilleurs placeholders')
