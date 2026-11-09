#!/usr/bin/env python3
"""Controllo dell'APK release prima della pubblicazione (SPEC.md, sezione 2).

Con R8 attivo, una regola sbagliata può togliere o rinominare una classe che serve solo a runtime
(plugin Capacitor, ponte JavaScript, classi native, classi scritte nel manifest): l'app si costruisce
lo stesso ma si rompe sul telefono. Questo script apre l'APK e controlla che ci sia tutto:

  1. librerie native solo per ARM (arm64-v8a, armeabi-v7a), con gli stessi file per entrambe;
  2. file dell'app web (tutti quelli di dist/, identici), configurazione Capacitor e modelli di ML Kit;
  3. ogni plugin Capacitor trovato nei sorgenti: classe con lo stesso nome, annotazione @CapacitorPlugin
     con lo stesso "name" e tutti i metodi @PluginMethod ancora annotati; le classi di capacitor.plugins.json;
  4. le annotazioni lette a runtime e il ponte JavaScript (MessageHandler.postMessage con @JavascriptInterface);
  5. ogni funzione JNI esportata dalle librerie native (Java_...) ha la sua classe e il suo metodo;
  6. i componenti del manifest e le classi create per nome (registrar di ML Kit, inizializzatori AndroidX,
     appComponentFactory) esistono, con il costruttore senza argomenti quando serve.

Con --compare <apk di riferimento> elenca anche le differenze nei pacchetti protetti dalle regole
(solo informazione: tra due versioni il codice può cambiare davvero).

Uso: python3 scripts/check_apk.py <apk> [--dist dist] [--android android] [--compare vecchio.apk]
Esce con codice 1 se trova un problema. Su GitHub Actions scrive anche annotazioni e riepilogo.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import struct
import sys
import zipfile
import zlib
from dataclasses import dataclass, field

EXPECTED_ABIS = {'arm64-v8a', 'armeabi-v7a'}
PLUGIN_ANN = 'com.getcapacitor.annotation.CapacitorPlugin'
METHOD_ANN = 'com.getcapacitor.PluginMethod'
JS_ANN = 'android.webkit.JavascriptInterface'
RUNTIME_ANNOTATIONS = [
    METHOD_ANN,
    PLUGIN_ANN,
    'com.getcapacitor.annotation.Permission',
    'com.getcapacitor.annotation.PermissionCallback',
    'com.getcapacitor.annotation.ActivityCallback',
]
# Pacchetti che proguard-rules.pro tiene interi (stessi nomi, niente tolto).
PROTECTED_PACKAGES = (
    'com.nikcirri.armadio.',
    'com.getcapacitor.',
    'com.capacitorjs.',
    'io.capawesome.',
    'io.ionic.libs.',
    'org.apache.cordova.',
)
VIS_RUNTIME = 1


# ---------------------------------------------------------------------------------------------
# File .dex
# ---------------------------------------------------------------------------------------------

def uleb128(buf: bytes, off: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while True:
        b = buf[off]
        off += 1
        result |= (b & 0x7F) << shift
        if b < 0x80:
            return result, off
        shift += 7


def descriptor_to_name(desc: str) -> str:
    """'Lcom/foo/Bar;' -> 'com.foo.Bar' (gli altri tipi restano come sono)."""
    if desc.startswith('L') and desc.endswith(';'):
        return desc[1:-1].replace('/', '.')
    return desc


@dataclass
class MethodInfo:
    name: str
    no_args: bool
    native: bool
    annotations: set[str] = field(default_factory=set)  # solo quelle visibili a runtime


@dataclass
class ClassInfo:
    name: str
    superclass: str | None
    annotations: dict[str, dict] = field(default_factory=dict)  # tipo -> elementi (solo runtime)
    methods: list[MethodInfo] = field(default_factory=list)
    fields: dict[str, str] = field(default_factory=dict)  # nome -> tipo

    def methods_named(self, name: str) -> list[MethodInfo]:
        return [m for m in self.methods if m.name == name]


class Dex:
    ACC_NATIVE = 0x100

    def __init__(self, data: bytes):
        if data[:4] != b'dex\n':
            raise ValueError('file .dex non valido')
        self.d = data
        (self.str_n, self.str_off, self.type_n, self.type_off, self.proto_n, self.proto_off,
         self.field_n, self.field_off, self.meth_n, self.meth_off, self.cls_n, self.cls_off) = struct.unpack_from('<12I', data, 0x38)
        self._strings: dict[int, str] = {}

    def string(self, i: int) -> str:
        s = self._strings.get(i)
        if s is None:
            off = struct.unpack_from('<I', self.d, self.str_off + 4 * i)[0]
            _, off = uleb128(self.d, off)
            end = self.d.index(b'\0', off)
            # MUTF-8: per nomi di classi e metodi equivale a UTF-8.
            s = self.d[off:end].decode('utf-8', 'replace')
            self._strings[i] = s
        return s

    def type_desc(self, i: int) -> str:
        return self.string(struct.unpack_from('<I', self.d, self.type_off + 4 * i)[0])

    def method_ref(self, i: int) -> tuple[str, str, bool]:
        """(classe, nome, senza argomenti) del metodo con indice i."""
        cls, proto, name = struct.unpack_from('<HHI', self.d, self.meth_off + 8 * i)
        params_off = struct.unpack_from('<I', self.d, self.proto_off + 12 * proto + 8)[0]
        no_args = params_off == 0 or struct.unpack_from('<I', self.d, params_off)[0] == 0
        return descriptor_to_name(self.type_desc(cls)), self.string(name), no_args

    # --- annotazioni ---

    def encoded_value(self, off: int):
        b = self.d[off]
        off += 1
        vt, arg = b & 0x1F, b >> 5
        if vt == 0x1C:  # array
            n, off = uleb128(self.d, off)
            values = []
            for _ in range(n):
                v, off = self.encoded_value(off)
                values.append(v)
            return values, off
        if vt == 0x1D:  # annotazione
            return self.encoded_annotation(off)
        if vt == 0x1E:  # null
            return None, off
        if vt == 0x1F:  # boolean
            return bool(arg), off
        size = arg + 1
        raw = int.from_bytes(self.d[off:off + size], 'little')
        off += size
        if vt == 0x17:  # stringa
            return self.string(raw), off
        if vt == 0x18:  # tipo
            return descriptor_to_name(self.type_desc(raw)), off
        return raw, off

    def encoded_annotation(self, off: int):
        t, off = uleb128(self.d, off)
        n, off = uleb128(self.d, off)
        elements = {}
        for _ in range(n):
            name_idx, off = uleb128(self.d, off)
            value, off = self.encoded_value(off)
            elements[self.string(name_idx)] = value
        return (descriptor_to_name(self.type_desc(t)), elements), off

    def annotation_set(self, off: int) -> dict[str, dict]:
        """Annotazioni visibili a runtime di un annotation_set_item: tipo -> elementi."""
        out: dict[str, dict] = {}
        if not off:
            return out
        n = struct.unpack_from('<I', self.d, off)[0]
        for i in range(n):
            item = struct.unpack_from('<I', self.d, off + 4 + 4 * i)[0]
            visibility = self.d[item]
            (atype, elements), _ = self.encoded_annotation(item + 1)
            if visibility == VIS_RUNTIME:
                out[atype] = elements
        return out

    def classes(self):
        for k in range(self.cls_n):
            cidx, _flags, sup, _ifaces, _src, ann_off, data_off, _sv = struct.unpack_from('<8I', self.d, self.cls_off + 32 * k)
            name = descriptor_to_name(self.type_desc(cidx))
            superclass = None if sup == 0xFFFFFFFF else descriptor_to_name(self.type_desc(sup))
            info = ClassInfo(name, superclass)
            method_anns: dict[int, dict[str, dict]] = {}
            if ann_off:
                class_set, f_n, m_n, _p_n = struct.unpack_from('<4I', self.d, ann_off)
                info.annotations = self.annotation_set(class_set)
                base = ann_off + 16 + 8 * f_n
                for i in range(m_n):
                    midx, set_off = struct.unpack_from('<2I', self.d, base + 8 * i)
                    method_anns[midx] = self.annotation_set(set_off)
            if data_off:
                off = data_off
                sf, off = uleb128(self.d, off)
                inf, off = uleb128(self.d, off)
                dm, off = uleb128(self.d, off)
                vm, off = uleb128(self.d, off)
                fidx = 0
                for k in range(sf + inf):
                    if k == sf:
                        fidx = 0  # gli indici dei campi d'istanza ripartono da zero
                    diff, off = uleb128(self.d, off)
                    _, off = uleb128(self.d, off)
                    fidx += diff
                    _fcls, ftype, fname = struct.unpack_from('<HHI', self.d, self.field_off + 8 * fidx)
                    info.fields[self.string(fname)] = descriptor_to_name(self.type_desc(ftype))
                for count in (dm, vm):
                    idx = 0
                    for _ in range(count):
                        diff, off = uleb128(self.d, off)
                        flags, off = uleb128(self.d, off)
                        _, off = uleb128(self.d, off)
                        idx += diff
                        _, mname, no_args = self.method_ref(idx)
                        info.methods.append(MethodInfo(mname, no_args, bool(flags & self.ACC_NATIVE), set(method_anns.get(idx, {}))))
            yield info


def load_classes(apk: zipfile.ZipFile) -> tuple[dict[str, ClassInfo], int]:
    classes: dict[str, ClassInfo] = {}
    dex_bytes = 0
    for name in sorted(apk.namelist()):
        if re.fullmatch(r'classes\d*\.dex', name):
            data = apk.read(name)
            dex_bytes += len(data)
            for info in Dex(data).classes():
                classes[info.name] = info
    return classes, dex_bytes


# ---------------------------------------------------------------------------------------------
# AndroidManifest.xml compilato (formato binario AXML)
# ---------------------------------------------------------------------------------------------

@dataclass
class XmlElement:
    tag: str
    attrs: dict[str, str]
    parent: 'XmlElement | None'


def parse_axml(data: bytes) -> list[XmlElement]:
    strings: list[str] = []
    elements: list[XmlElement] = []
    stack: list[XmlElement] = []
    off = 8  # intestazione del file
    while off + 8 <= len(data):
        ctype, hsize, csize = struct.unpack_from('<HHI', data, off)
        if csize < 8:
            break
        if ctype == 0x0001:  # string pool
            count, _styles, flags, s_start, _st_start = struct.unpack_from('<5I', data, off + 8)
            utf8 = bool(flags & 0x100)
            offsets = struct.unpack_from(f'<{count}I', data, off + hsize)
            base = off + s_start
            for so in offsets:
                p = base + so
                if utf8:
                    n = data[p]
                    p += 2 if n & 0x80 else 1
                    blen = data[p]
                    if blen & 0x80:
                        blen = ((blen & 0x7F) << 8) | data[p + 1]
                        p += 2
                    else:
                        p += 1
                    strings.append(data[p:p + blen].decode('utf-8', 'replace'))
                else:
                    n = struct.unpack_from('<H', data, p)[0]
                    p += 2
                    if n & 0x8000:
                        n = ((n & 0x7FFF) << 16) | struct.unpack_from('<H', data, p)[0]
                        p += 2
                    strings.append(data[p:p + 2 * n].decode('utf-16-le', 'replace'))
        elif ctype == 0x0102:  # inizio elemento
            ext = off + hsize
            _ns, name_i, a_start, a_size, a_count = struct.unpack_from('<IIHHH', data, ext)
            attrs: dict[str, str] = {}
            for i in range(a_count):
                a = ext + a_start + i * a_size
                _ans, aname, raw, _sz, _res0, dtype, adata = struct.unpack_from('<IIIHBBI', data, a)
                key = strings[aname] if aname < len(strings) else ''
                if raw != 0xFFFFFFFF:
                    value = strings[raw]
                elif dtype == 0x03:
                    value = strings[adata]
                else:
                    value = f'#{adata}'
                attrs[key] = value
            el = XmlElement(strings[name_i], attrs, stack[-1] if stack else None)
            elements.append(el)
            stack.append(el)
        elif ctype == 0x0103:  # fine elemento
            if stack:
                stack.pop()
        off += csize
    return elements


# ---------------------------------------------------------------------------------------------
# Sorgenti dei plugin Capacitor
# ---------------------------------------------------------------------------------------------

@dataclass
class PluginSource:
    file: str
    class_name: str  # nome completo
    plugin_name: str | None  # "name" di @CapacitorPlugin (None se manca)
    is_plugin: bool  # ha @CapacitorPlugin
    methods: list[str]


TOKEN_RE = re.compile(r'"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|\'(?:\\.|[^\'\\\n])+\'|/\*[\s\S]*?\*/|//[^\n]*')


def clean_source(text: str) -> tuple[str, list[str]]:
    """Toglie i commenti e sostituisce le stringhe con segnaposto "__S<n>__" (restituiti a parte)."""
    literals: list[str] = []

    def repl(m: re.Match) -> str:
        tok = m.group(0)
        if tok.startswith('/'):
            return ' '
        if tok.startswith('"'):
            literals.append(tok[3:-3] if tok.startswith('"""') else tok[1:-1])
            return f'"__S{len(literals) - 1}__"'
        return "' '"

    return TOKEN_RE.sub(repl, text), literals


def skip_parens(code: str, i: int) -> int:
    """Se in i (dopo eventuali spazi) c'è una parentesi tonda, restituisce la posizione dopo quella che la chiude."""
    j = i
    while j < len(code) and code[j].isspace():
        j += 1
    if j >= len(code) or code[j] != '(':
        return i
    depth = 0
    while j < len(code):
        if code[j] == '(':
            depth += 1
        elif code[j] == ')':
            depth -= 1
            if depth == 0:
                return j + 1
        j += 1
    return j


CLASS_DECL_RE = re.compile(r'^\s*(?:(?:public|private|protected|internal|abstract|final|open|sealed)\s+)*class\s+(\w+)', re.M)


def parse_plugin_source(path: str) -> PluginSource | None:
    with open(path, encoding='utf-8', errors='replace') as f:
        code, literals = clean_source(f.read())
    has_plugin = re.search(r'@CapacitorPlugin\b', code)
    if not has_plugin and not re.search(r'@PluginMethod\b', code):
        return None
    pkg = re.search(r'^\s*package\s+([\w.]+)', code, re.M)
    if not pkg:
        raise ValueError(f'{path}: dichiarazione package non trovata')
    plugin_name = None
    if has_plugin:
        end = skip_parens(code, has_plugin.end())
        args = code[has_plugin.end():end]
        nm = re.search(r'\bname\s*=\s*"__S(\d+)__"', args)
        plugin_name = literals[int(nm.group(1))] if nm else None
        decl = re.search(r'\bclass\s+(\w+)', code[end:])
    else:
        decl = CLASS_DECL_RE.search(code)
    if not decl:
        raise ValueError(f'{path}: classe non trovata')
    methods = []
    for m in re.finditer(r'@PluginMethod\b', code):
        end = skip_parens(code, m.end())
        fn = re.search(r'\b(?:void|fun)\s+(\w+)\s*\(', code[end:])
        if not fn:
            raise ValueError(f'{path}: metodo dopo @PluginMethod non trovato')
        methods.append(fn.group(1))
    return PluginSource(path, f'{pkg.group(1)}.{decl.group(1)}', plugin_name, bool(has_plugin), methods)


def plugin_source_dirs(android_dir: str) -> list[str]:
    dirs = [os.path.join(android_dir, 'app', 'src', 'main')]
    settings = os.path.join(android_dir, 'capacitor.settings.gradle')
    with open(settings, encoding='utf-8') as f:
        for m in re.finditer(r"projectDir\s*=\s*new\s+File\('([^']+)'\)", f.read()):
            dirs.append(os.path.normpath(os.path.join(android_dir, m.group(1), 'src', 'main')))
    return dirs


def scan_plugin_sources(android_dir: str) -> list[PluginSource]:
    found = []
    for d in plugin_source_dirs(android_dir):
        if not os.path.isdir(d):
            raise ValueError(f'cartella dei sorgenti mancante: {d}')
        for root, _dirs, files in os.walk(d):
            for fn in sorted(files):
                if fn.endswith(('.java', '.kt')):
                    src = parse_plugin_source(os.path.join(root, fn))
                    if src:
                        found.append(src)
    return found


# ---------------------------------------------------------------------------------------------
# Controlli
# ---------------------------------------------------------------------------------------------

class Report:
    def __init__(self):
        self.errors: list[str] = []
        self.infos: list[str] = []

    def error(self, msg: str):
        self.errors.append(msg)

    def info(self, msg: str):
        self.infos.append(msg)


def has_method_with(cls: ClassInfo | None, classes: dict[str, ClassInfo], name: str, annotation: str | None) -> bool:
    """Cerca il metodo nella classe e nelle superclassi presenti nell'APK."""
    seen = set()
    while cls and cls.name not in seen:
        seen.add(cls.name)
        for m in cls.methods_named(name):
            if annotation is None or annotation in m.annotations:
                return True
        cls = classes.get(cls.superclass) if cls.superclass else None
    return False


def check_native_libs(apk: zipfile.ZipFile, rep: Report) -> list[tuple[str, bytes]]:
    by_abi: dict[str, set[str]] = {}
    libs = []
    for name in apk.namelist():
        m = re.fullmatch(r'lib/([^/]+)/([^/]+\.so)', name)
        if m:
            by_abi.setdefault(m.group(1), set()).add(m.group(2))
            libs.append((name, apk.read(name)))
    abis = set(by_abi)
    if abis != EXPECTED_ABIS:
        rep.error(f'architetture native {sorted(abis)}: attese {sorted(EXPECTED_ABIS)}')
    if len({frozenset(v) for v in by_abi.values()}) > 1:
        rep.error('le architetture non hanno le stesse librerie: ' + '; '.join(f'{k}: {sorted(v)}' for k, v in sorted(by_abi.items())))
    rep.info(f'librerie native: {", ".join(sorted(abis))} ({len(next(iter(by_abi.values()), []))} per architettura)')
    return libs


def check_assets(apk: zipfile.ZipFile, dist: str | None, rep: Report):
    names = set(apk.namelist())
    for required in ('assets/public/index.html', 'assets/capacitor.config.json', 'assets/capacitor.plugins.json'):
        if required not in names:
            rep.error(f'manca {required}')
    if not any(n.startswith('assets/models_bundled/') for n in names):
        rep.error('mancano i modelli di ML Kit (assets/models_bundled/) per il riconoscimento del viso')
    if dist:
        count = 0
        for root, _dirs, files in os.walk(dist):
            for fn in files:
                path = os.path.join(root, fn)
                rel = os.path.relpath(path, dist).replace(os.sep, '/')
                entry = f'assets/public/{rel}'
                count += 1
                if entry not in names:
                    rep.error(f'file web mancante nell\'APK: {rel}')
                    continue
                with open(path, 'rb') as f:
                    if zlib.crc32(f.read()) & 0xFFFFFFFF != apk.getinfo(entry).CRC:
                        rep.error(f'file web diverso da dist/: {rel}')
        rep.info(f'file web controllati: {count}')


def check_plugins(apk: zipfile.ZipFile, classes: dict[str, ClassInfo], sources: list[PluginSource], rep: Report):
    errors_before = len(rep.errors)
    for ann in RUNTIME_ANNOTATIONS:
        if ann not in classes:
            rep.error(f'manca la classe dell\'annotazione {ann}')
    plugin_count = 0
    method_count = 0
    for src in sources:
        cls = classes.get(src.class_name)
        where = os.path.basename(src.file)
        if not cls:
            rep.error(f'classe {src.class_name} ({where}) non trovata nell\'APK')
            continue
        if src.is_plugin:
            plugin_count += 1
            ann = cls.annotations.get(PLUGIN_ANN)
            if ann is None:
                rep.error(f'{src.class_name}: annotazione @CapacitorPlugin persa')
            elif (ann.get('name') or None) != src.plugin_name:
                rep.error(f'{src.class_name}: nome del plugin "{ann.get("name")}" invece di "{src.plugin_name}"')
        for m in src.methods:
            method_count += 1
            if not has_method_with(cls, classes, m, METHOD_ANN):
                rep.error(f'{src.class_name}.{m}: metodo @PluginMethod mancante o senza annotazione')
    try:
        listed = json.loads(apk.read('assets/capacitor.plugins.json'))
    except (KeyError, ValueError) as e:
        rep.error(f'capacitor.plugins.json illeggibile: {e}')
        listed = []
    for p in listed:
        cp = p.get('classpath', '')
        if cp not in classes:
            rep.error(f'capacitor.plugins.json: classe {cp} non trovata')
        elif PLUGIN_ANN not in classes[cp].annotations:
            rep.error(f'capacitor.plugins.json: {cp} senza @CapacitorPlugin')
    handler = classes.get('com.getcapacitor.MessageHandler')
    if not handler or not any(JS_ANN in m.annotations for m in handler.methods_named('postMessage')):
        rep.error('ponte JavaScript rotto: MessageHandler.postMessage senza @JavascriptInterface')
    ok = len(rep.errors) == errors_before
    rep.info(f'plugin Capacitor: {plugin_count} con {method_count} metodi' + (', tutti presenti e annotati' if ok else ''))


def jni_targets(blob: bytes) -> set[tuple[str, str]]:
    """Classi e metodi chiamati dalle funzioni JNI esportate (Java_pacchetto_Classe_metodo)."""
    out = set()
    for raw in set(re.findall(rb'Java_[A-Za-z0-9_]+', blob)):
        sym = raw.decode()[5:].split('__')[0]  # senza la firma dei metodi sovraccarichi
        parts = re.split(r'_(?![0-3])', sym)
        if len(parts) < 2:
            continue

        def unescape(s: str) -> str:
            s = re.sub(r'_0([0-9a-f]{4})', lambda m: chr(int(m.group(1), 16)), s)
            return s.replace('_1', '_').replace('_2', ';').replace('_3', '[')

        out.add(('.'.join(unescape(p) for p in parts[:-1]), unescape(parts[-1])))
    return out


def dex_strings(apk: zipfile.ZipFile) -> set[str]:
    out: set[str] = set()
    for name in apk.namelist():
        if re.fullmatch(r'classes\d*\.dex', name):
            dex = Dex(apk.read(name))
            out.update(dex.string(i) for i in range(dex.str_n))
    return out


def check_jni(apk: zipfile.ZipFile, libs: list[tuple[str, bytes]], classes: dict[str, ClassInfo], rep: Report):
    """Collegamento tra codice Java e librerie native.

    Il caso pericoloso è un metodo nativo Java che non trova più la sua funzione nella libreria
    (classe o metodo rinominati da R8): al primo uso l'app si chiude. Se invece R8 ha tolto del tutto
    una classe mai usata, la funzione nativa resta orfana ma nessuno può chiamarla: va bene, purché
    nessuno carichi più quella libreria.
    """
    strings = dex_strings(apk)
    native_names = {(k, m.name) for k, ci in classes.items() for m in ci.methods if m.native}
    method_names = {m for _k, m in native_names}
    abi = 'arm64-v8a' if any(n.startswith('lib/arm64-v8a/') for n, _ in libs) else None
    linked = 0
    symbols: set[tuple[str, str]] = set()
    for name, blob in libs:
        if abi and not name.startswith(f'lib/{abi}/'):
            continue
        lib = re.sub(r'^lib|\.so$', '', os.path.basename(name))
        targets = jni_targets(blob)
        symbols |= targets
        unused = []
        for cls_name, method in sorted(targets):
            cls = classes.get(cls_name)
            if cls:
                if any(m.native for m in cls.methods_named(method)):
                    linked += 1
                else:
                    rep.error(f'{lib}: il metodo nativo {cls_name}.{method} non c\'è più (rinominato?)')
            elif method in method_names:
                rep.error(f'{lib}: la classe {cls_name} sembra rinominata (il metodo nativo {method} esiste altrove)')
            else:
                unused.append(f'{cls_name}.{method}')
        if unused:
            if lib in strings:
                rep.error(f'{lib}: la libreria viene ancora caricata ma mancano le classi di {", ".join(unused)}')
            else:
                rep.info(f'{lib}: codice Java mai usato dall\'app, tolto da R8 (la libreria non viene caricata): {len(unused)} funzioni')
    orphans = sorted(f'{k}.{m}' for k, m in native_names if (k, m) not in symbols)
    if orphans:
        rep.info('metodi nativi senza libreria nell\'APK (forniti da Google Play services o mai usati): ' + ', '.join(orphans))
    rep.info(f'funzioni native collegate: {linked}')


DYNAMITE_PREFIX = 'com.google.android.gms.dynamite.descriptors.'


def check_dynamite(classes: dict[str, ClassInfo], rep: Report):
    """Descrittori dei moduli di Google Play services: DynamiteModule li cerca per nome e ne legge
    MODULE_ID e MODULE_VERSION per scegliere il modello incluso nell'app (es. il viso di ML Kit)."""
    descriptors = sorted(k for k in classes if k.startswith(DYNAMITE_PREFIX))
    for k in descriptors:
        f = classes[k].fields
        if f.get('MODULE_ID') != 'java.lang.String' or f.get('MODULE_VERSION') != 'I':
            rep.error(f'descrittore di modulo Google senza MODULE_ID/MODULE_VERSION: {k}')
    if any(k.startswith('com.google.mlkit.vision.face.') for k in classes) and not any('mlkit.dynamite.face' in k for k in descriptors):
        rep.error('manca il descrittore del modulo viso di ML Kit (...dynamite.face.ModuleDescriptor)')
    rep.info(f'descrittori dei moduli Google: {len(descriptors)}' + (f' ({", ".join(k[len(DYNAMITE_PREFIX):] for k in descriptors)})' if descriptors else ''))


def check_manifest(apk: zipfile.ZipFile, classes: dict[str, ClassInfo], rep: Report):
    elements = parse_axml(apk.read('AndroidManifest.xml'))
    package = next((e.attrs.get('package', '') for e in elements if e.tag == 'manifest'), '')

    def full(name: str) -> str:
        if name.startswith('.'):
            return package + name
        return name if '.' in name else f'{package}.{name}'

    def need(name: str, why: str, ctor: bool):
        cls = classes.get(name)
        if not cls:
            rep.error(f'{why}: classe {name} non trovata')
        elif ctor and not any(m.name == '<init>' and m.no_args for m in cls.methods):
            rep.error(f'{why}: {name} senza costruttore vuoto')

    class_like = re.compile(r'[a-z]\w*(?:\.[a-z]\w*)+\.[A-Z][\w$]*')
    checked = 0
    for e in elements:
        if e.tag in ('activity', 'service', 'receiver', 'provider') and 'name' in e.attrs:
            name = full(e.attrs['name'])
            if e.attrs.get('enabled') == '#0' and name not in classes:
                # Componenti spenti usati solo come segnaposto (es. ModuleDependencies di Google Play).
                rep.info(f'componente spento senza classe (normale): {name}')
                continue
            need(name, f'manifest <{e.tag}>', True)
            checked += 1
        elif e.tag == 'activity-alias' and 'targetActivity' in e.attrs:
            need(full(e.attrs['targetActivity']), 'manifest <activity-alias>', False)
            checked += 1
        elif e.tag == 'application':
            for attr in ('name', 'appComponentFactory', 'backupAgent'):
                if attr in e.attrs:
                    need(full(e.attrs[attr]), f'manifest application {attr}', True)
                    checked += 1
        elif e.tag == 'meta-data':
            name = e.attrs.get('name', '')
            value = e.attrs.get('value', '')
            if name.startswith('com.google.firebase.components:'):
                need(name.split(':', 1)[1], 'registrar di ML Kit/Firebase', True)
                checked += 1
            elif name.startswith('backend:'):
                need(name.split(':', 1)[1], 'backend di datatransport', True)
                checked += 1
            elif value == 'androidx.startup':
                need(name, 'inizializzatore AndroidX', True)
                checked += 1
            elif class_like.fullmatch(value) and value not in classes:
                rep.info(f'meta-data {name}: il valore {value} non è una classe dell\'APK (controlla se viene caricato per nome)')
    rep.info(f'classi del manifest controllate: {checked}')


def compare_with(reference: str, apk: zipfile.ZipFile, classes: dict[str, ClassInfo], rep: Report):
    with zipfile.ZipFile(reference) as ref_apk:
        ref, ref_bytes = load_classes(ref_apk)

    # Classi cercate per nome (Class.forName): il nome è ancora scritto nel codice, la classe c'era
    # nella versione di riferimento e ora non c'è più. Da guardare una per una.
    by_name = sorted(
        x for x in dex_strings(apk)
        if re.fullmatch(r'[a-z]\w*(?:\.\w+)+', x) and x in ref and x not in classes
    )
    rep.info(f'classi nominate nel codice e tolte da R8: {len(by_name)}' + (' — ' + ', '.join(by_name[:30]) if by_name else ''))

    def synthetic(name: str) -> bool:
        # Classi e metodi generati dal compilatore (lambda, accessi interni, ecc.): possono cambiare.
        return any(t in name for t in ('$$', 'ExternalSynthetic', '$r8$', '-$$Nest$', 'Lambda$')) or name.endswith('-IA')

    missing_classes = []
    missing_methods = []
    for name, cls in ref.items():
        if not name.startswith(PROTECTED_PACKAGES) or synthetic(name):
            continue
        new = classes.get(name)
        if not new:
            missing_classes.append(name)
            continue
        names = {m.name for m in new.methods}
        for m in cls.methods:
            # <clinit>: R8 può sostituire gli inizializzatori statici con valori costanti (stesso effetto).
            if m.name not in names and m.name != '<clinit>' and not synthetic(m.name) and not m.name.startswith(('lambda$', 'access$')):
                missing_methods.append(f'{name}.{m.name}')
    for name in sorted(ref):
        if name.startswith(DYNAMITE_PREFIX) and name not in classes:
            rep.error(f'descrittore di modulo Google presente in {os.path.basename(reference)} e sparito: {name}')
    rep.info(f'confronto con {os.path.basename(reference)}: classi protette mancanti {len(missing_classes)}, metodi mancanti {len(set(missing_methods))}')
    for line in (missing_classes + sorted(set(missing_methods)))[:40]:
        rep.info(f'  differenza: {line}')
    return ref_bytes


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('apk')
    ap.add_argument('--dist', help='cartella dist/ da confrontare con i file web dell\'APK')
    ap.add_argument('--android', default='android', help='cartella del progetto Android (per i sorgenti dei plugin)')
    ap.add_argument('--compare', help='APK di riferimento per elencare le differenze nei pacchetti protetti')
    args = ap.parse_args()

    rep = Report()
    with zipfile.ZipFile(args.apk) as apk:
        classes, dex_bytes = load_classes(apk)
        rep.info(f'APK: {os.path.getsize(args.apk) / 1e6:.1f} MB, codice .dex {dex_bytes / 1e6:.1f} MB, classi {len(classes)}')
        libs = check_native_libs(apk, rep)
        check_assets(apk, args.dist, rep)
        sources = scan_plugin_sources(args.android)
        check_plugins(apk, classes, sources, rep)
        check_jni(apk, libs, classes, rep)
        check_manifest(apk, classes, rep)
        check_dynamite(classes, rep)
    if args.compare:
        with zipfile.ZipFile(args.apk) as apk:
            compare_with(args.compare, apk, classes, rep)

    for line in rep.infos:
        print(line)
    for line in rep.errors:
        print(f'ERRORE: {line}')
    in_actions = os.environ.get('GITHUB_ACTIONS') == 'true'
    if in_actions:
        def esc(s: str) -> str:
            return s.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print(f'::notice title=Controllo APK::{esc(chr(10).join(rep.infos))}')
        if rep.errors:
            print(f'::error title=Controllo APK: {len(rep.errors)} problemi::{esc(chr(10).join(rep.errors[:60]))}')
        summary = os.environ.get('GITHUB_STEP_SUMMARY')
        if summary:
            with open(summary, 'a', encoding='utf-8') as f:
                f.write('### Controllo APK\n\n' + ''.join(f'- {x}\n' for x in rep.infos))
                f.write(''.join(f'- ❌ {x}\n' for x in rep.errors) or '- ✅ nessun problema\n')
    if rep.errors:
        print(f'{len(rep.errors)} problemi trovati.')
        return 1
    print('APK a posto.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
