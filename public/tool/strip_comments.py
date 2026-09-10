import os
import re

def strip_html_comments(text):
    return re.sub(r'<!--[\s\S]*?-->', '', text)

def strip_js_comments(text):
    out = []
    i = 0
    n = len(text)
    in_s = False
    in_d = False
    in_bt = False
    in_sl = False
    in_ml = False
    esc = False
    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ''
        if in_sl:
            if c == '\n':
                in_sl = False
                out.append(c)
            i += 1
            continue
        if in_ml:
            if c == '*' and nxt == '/':
                in_ml = False
                i += 2
            else:
                i += 1
            continue
        if in_s:
            out.append(c)
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == "'":
                in_s = False
            i += 1
            continue
        if in_d:
            out.append(c)
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == '"':
                in_d = False
            i += 1
            continue
        if in_bt:
            out.append(c)
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == '`':
                in_bt = False
            i += 1
            continue
        if c == "'":
            in_s = True
            out.append(c)
            i += 1
            continue
        if c == '"':
            in_d = True
            out.append(c)
            i += 1
            continue
        if c == '`':
            in_bt = True
            out.append(c)
            i += 1
            continue
        if c == '/' and nxt == '/':
            in_sl = True
            i += 2
            continue
        if c == '/' and nxt == '*':
            in_ml = True
            i += 2
            continue
        out.append(c)
        i += 1
    return ''.join(out)

def process_file(path):
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    if path.endswith('.html'):
        new = strip_html_comments(content)
    elif path.endswith('.js'):
        new = strip_js_comments(content)
    else:
        return False
    if new != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new)
        return True
    return False

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    changed = []
    for dirpath, dirnames, filenames in os.walk(root):
        if any(seg in dirpath for seg in ('images', 'data', '.git')):
            continue
        for fn in filenames:
            if fn.endswith(('.html', '.js')):
                fp = os.path.join(dirpath, fn)
                if process_file(fp):
                    changed.append(os.path.relpath(fp, root))
    print('Changed files:')
    for c in changed:
        print(c)

if __name__ == '__main__':
    main()

