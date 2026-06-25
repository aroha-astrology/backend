import re

path = 'c:/Users/subir/jyotish-ai/apps/web/src/app/(app)/match/new/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

orig = content

content = re.sub(r'\s+data-theme="vedic"', '', content)
content = re.sub(r'\s+data-theme="[^"]+"', '', content)
content = content.replace(" style={{ backgroundColor: '#F5EFE0' }}", '')
content = content.replace("backgroundColor: '#F5EFE0',", '')
content = content.replace("backgroundColor: '#F5EFE0'", '')
content = re.sub(r'rgba\(212,\s*168,\s*67,', 'rgba(122, 150, 171,', content)
content = content.replace('#d4a843', 'var(--primary)')
content = content.replace('#D4A843', 'var(--primary)')
content = content.replace('#DAA520', 'var(--primary)')
content = content.replace('#b8860b', 'var(--primary-ink)')
content = content.replace('#a07820', 'var(--primary-ink)')
content = content.replace('#c9a227', 'var(--primary)')
content = content.replace("var(--font-playfair)", 'var(--font-display)')
content = content.replace('bg-black/30', 'bg-surface-2')
content = content.replace('bg-white/10', 'bg-surface-2')

if content != orig:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Fixed match/new/page.tsx')
else:
    print('No changes needed')
