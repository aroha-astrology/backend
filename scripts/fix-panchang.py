import re, glob

files = glob.glob('c:/Users/subir/jyotish-ai/apps/web/src/app/**/PurchasePlan*.tsx', recursive=True)
files += glob.glob('c:/Users/subir/jyotish-ai/apps/web/src/app/(app)/panchang/**/*.tsx', recursive=True)

fixed = []
for path in files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    orig = content
    content = re.sub(r'rgba\(212,\s*168,\s*67,', 'rgba(122, 150, 171,', content)
    content = content.replace('#d4a843', 'var(--primary)')
    content = content.replace('#D4A843', 'var(--primary)')
    content = content.replace('#DAA520', 'var(--primary)')
    if content != orig:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        fixed.append(path.split('/')[-1])

print('Fixed:', fixed)
