import re, os, glob

# Directories to process
pages = glob.glob('c:/Users/subir/jyotish-ai/apps/web/src/app/**/page.tsx', recursive=True)

# Already done pages - skip them
done_patterns = [
    'dashboard/page.tsx',
    'vastu/page.tsx',
    'gemstone/page.tsx',
    'credits/page.tsx',
    'profile/page.tsx',
    'couple/page.tsx',
    'kundli/[id]/page.tsx',
    'reports/premium/page.tsx',
    'chat/page.tsx',
    'life-journey/page.tsx',
    '(auth)/login/page.tsx',
    '(auth)/signup/page.tsx',
    '(auth)/onboarding/page.tsx',
    'match/new/page.tsx',  # will handle separately
]

def is_done(path):
    p = path.replace('\\', '/')
    for d in done_patterns:
        if d in p:
            return True
    return False

fixed = []
for path in pages:
    p = path.replace('\\', '/')
    if is_done(p):
        continue

    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    orig = content

    # 1. Remove data-theme attributes
    content = re.sub(r'\s+data-theme="vedic"', '', content)
    content = re.sub(r'\s+data-theme="[^"]+"', '', content)

    # 2. Replace standalone style={{ backgroundColor: '#F5EFE0' }}
    content = content.replace(" style={{ backgroundColor: '#F5EFE0' }}", '')
    content = content.replace(" style={{backgroundColor: '#F5EFE0'}}", '')

    # 3. Replace backgroundColor: '#F5EFE0' inside style objects
    content = content.replace("backgroundColor: '#F5EFE0',", '')
    content = content.replace("backgroundColor: '#F5EFE0'", '')

    # 4. Replace gold color values with primary
    content = re.sub(r'rgba\(212,\s*168,\s*67,', 'rgba(122, 150, 171,', content)
    content = content.replace('#d4a843', 'var(--primary)')
    content = content.replace('#D4A843', 'var(--primary)')
    content = content.replace('#DAA520', 'var(--primary)')
    content = content.replace('#b8860b', 'var(--primary-ink)')
    content = content.replace('#c9a227', 'var(--primary)')
    content = content.replace('#a07820', 'var(--primary-ink)')

    # 5. Replace Playfair font references with display font
    content = content.replace("var(--font-playfair)", 'var(--font-display)')

    # 6. Fix progress bar tracks that look odd on linen
    content = content.replace('bg-black/30', 'bg-surface-2')
    content = content.replace('bg-white/10', 'bg-surface-2')

    if content != orig:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        short = p.split('/app/')[-1] if '/app/' in p else p.split('/auth/')[-1] if '/auth/' in p else p
        fixed.append(short)

print(f'Fixed {len(fixed)} files:')
for f in sorted(fixed):
    print(f'  {f}')
