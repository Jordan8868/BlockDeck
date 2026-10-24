import os
import sys
import zipfile

src, dest = sys.argv[1], sys.argv[2]
base = os.path.dirname(src)
with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for root, dirs, files in os.walk(src):
        dirs.sort()
        files.sort()
        for name in files:
            path = os.path.join(root, name)
            arc = os.path.relpath(path, base)
            z.write(path, arc)
print(f'zipped {dest} ({os.path.getsize(dest)} bytes)')
