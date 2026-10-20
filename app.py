"""Ares Studio - editor de imagens pessoal, compativel com PSD. Roda so nesta maquina."""
import mimetypes
import os
import secrets
import socket
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import webview

BASE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(BASE, "web")
MOTOR = os.path.join(BASE, "motor")  # motor de edição (PhotoCraft compilado para WebAssembly)
TOKEN = secrets.token_urlsafe(24)
PORTA = 47815
ICONE = os.path.join(WEB, "icone.ico")
TITULO = "Ares Studio"
AUMID = "gusthavo.app.ares-studio"
TIPOS_ABRIR = (
    "Imagens (*.psd;*.psb;*.png;*.jpg;*.jpeg;*.webp;*.gif;*.bmp)",
    "Todos os arquivos (*.*)",
)
TIPOS_SALVAR = {
    "psd": ("Photoshop (*.psd)",),
    "png": ("PNG (*.png)",),
    "jpg": ("JPEG (*.jpg)",),
    "webp": ("WebP (*.webp)",),
}
janela = None


class Servidor(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _resposta(self, codigo, corpo=b"", tipo="text/plain; charset=utf-8", guardar=False):
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        # o motor tem nome com hash: fica guardado na janela, que assim reaproveita o código já compilado
        self.send_header("Cache-Control", "public, max-age=31536000, immutable" if guardar else "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def _api(self):
        """Devolve o caminho pedido se a chave da sessao conferir."""
        url = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        if q.get("t", [""])[0] != TOKEN:
            self._resposta(403, b"negado")
            return None
        return q.get("path", [""])[0]

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == "/api/read":
            caminho = self._api()
            if caminho is None:
                return
            try:
                with open(caminho, "rb") as f:
                    self._resposta(200, f.read(), "application/octet-stream")
            except OSError as e:
                self._resposta(404, str(e).encode("utf-8"))
            return
        rel = urllib.parse.unquote(url.path).lstrip("/") or "index.html"
        raiz = WEB
        if rel.startswith("motor/"):
            raiz, rel = MOTOR, rel[len("motor/"):]
        alvo = os.path.normpath(os.path.join(raiz, rel))
        if not alvo.startswith(raiz) or not os.path.isfile(alvo):
            self._resposta(404, b"nao encontrado")
            return
        tipo = mimetypes.guess_type(alvo)[0] or "application/octet-stream"
        if alvo.endswith(".js"):
            tipo = "text/javascript; charset=utf-8"
        elif alvo.endswith(".wasm"):
            tipo = "application/wasm"  # sem isso o navegador não compila enquanto carrega
        with open(alvo, "rb") as f:
            self._resposta(200, f.read(), tipo, guardar=raiz is MOTOR and not alvo.endswith(".html"))

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        if url.path != "/api/write":
            self._resposta(404, b"nao encontrado")
            return
        caminho = self._api()
        if caminho is None:
            return
        try:
            dados = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            tmp = caminho + ".tmp-ares"
            with open(tmp, "wb") as f:
                f.write(dados)
            os.replace(tmp, caminho)
            self._resposta(200, b"ok")
        except OSError as e:
            self._resposta(500, str(e).encode("utf-8"))


class Api:
    def pick_open(self):
        tipo = getattr(webview, "FileDialog", None)
        modo = tipo.OPEN if tipo else webview.OPEN_DIALOG
        r = janela.create_file_dialog(modo, allow_multiple=True, file_types=TIPOS_ABRIR)
        return list(r) if r else []

    def pick_save(self, nome, ext):
        tipo = getattr(webview, "FileDialog", None)
        modo = tipo.SAVE if tipo else webview.SAVE_DIALOG
        r = janela.create_file_dialog(modo, save_filename=nome, file_types=TIPOS_SALVAR.get(ext, ()))
        if not r:
            return None
        caminho = r if isinstance(r, str) else r[0]
        if not caminho.lower().endswith("." + ext):
            caminho += "." + ext
        return caminho

    def set_title(self, titulo):
        janela.set_title(titulo if titulo.endswith(TITULO) else TITULO)


def porta_livre():
    for p in (PORTA, 0):
        try:
            s = socket.socket()
            s.bind(("127.0.0.1", p))
            livre = s.getsockname()[1]
            s.close()
            return livre
        except OSError:
            continue
    return 0


def _hwnd():
    """Janela deste processo. O título muda com o documento aberto, então procura pelo processo."""
    import ctypes
    from ctypes import wintypes
    u32, achada, pid = ctypes.windll.user32, [], os.getpid()

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def ver(h, _):
        dono, texto = wintypes.DWORD(), ctypes.create_unicode_buffer(300)
        u32.GetWindowThreadProcessId(h, ctypes.byref(dono))
        u32.GetWindowTextW(h, texto, 300)
        if dono.value == pid and u32.IsWindowVisible(h) and texto.value.endswith(TITULO):
            achada.append(h)
            return False
        return True

    u32.EnumWindows(ver, 0)
    return achada[0] if achada else None


def _pintar_barra(hwnd):
    """Deixa a barra da janela (minimizar, quadrado e X) na cor do app, sem título por cima.
    Continua sendo a barra do Windows, então redimensionar, encaixar na lateral e maximizar seguem iguais."""
    import ctypes
    por = lambda atributo, valor: ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, atributo, ctypes.byref(ctypes.c_int(valor)), 4)
    fundo = 0x00262626  # 0x00BBGGRR, a mesma cor da barra de menus
    por(20, 1)  # botões claros sobre fundo escuro
    por(35, fundo)  # cor da barra
    por(36, fundo)  # título na cor do fundo: some da barra, continua na barra de tarefas
    por(34, 0x003A3A3A)  # contorno da janela


def _separar_na_barra(hwnd):
    """Dá identidade própria à janela na barra de tarefas: sem isso o Windows junta com
    qualquer outro programa que rode pelo pythonw."""
    import pywintypes
    from win32com.propsys import propsys
    fmt = "{9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}"
    pythonw = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    valores = {
        5: AUMID,  # System.AppUserModel.ID
        2: f'"{pythonw}" "{os.path.abspath(__file__)}"',  # RelaunchCommand
        4: TITULO,  # RelaunchDisplayNameResource
    }
    if os.path.isfile(ICONE):
        valores[3] = ICONE + ",0"  # RelaunchIconResource: o ícone ao fixar na barra de tarefas
    ps = propsys.SHGetPropertyStoreForWindow(hwnd, propsys.IID_IPropertyStore)
    for pid, v in valores.items():  # o ID vai primeiro; se um dos outros falhar, os demais continuam valendo
        try:
            ps.SetValue((pywintypes.IID(fmt), pid), propsys.PROPVARIANTType(v))
        except Exception as e:
            print(f"[barra] propriedade {pid} não gravada:", e, flush=True)
    ps.Commit()


def _ao_abrir():
    """Roda quando a janela aparece: pinta a barra e dá identidade própria na barra de tarefas."""
    hwnd = None
    for _ in range(50):  # espera a janela existir
        hwnd = _hwnd()
        if hwnd:
            break
        time.sleep(0.1)
    for passo in (_pintar_barra, _separar_na_barra):
        try:
            passo(hwnd)
        except Exception as e:
            print("[barra]", passo.__name__, e, flush=True)
    if "--autoteste" in sys.argv:
        _autoteste()


def _autoteste():
    """Confere se o motor subiu dentro da janela de verdade, grava o resultado em dados/autoteste.json e fecha."""
    import json
    js = ("JSON.stringify({pronto: !document.getElementById('photocraft_loading'), ms: window.aresPronto || null,"
          " webgpu: !!navigator.gpu, idiomas: navigator.languages, abriu: window.aresAbriu || null,"
          " idioma: (JSON.parse(localStorage.getItem('photocraft.preferences') || '{}').interface || {}).language || null,"
          " agente: navigator.userAgent})")
    r = None
    for _ in range(60):
        time.sleep(1)
        try:
            r = json.loads(janela.evaluate_js(js))
        except Exception as e:
            r = {"erro": str(e)}
        if r.get("pronto"):
            time.sleep(3)
            r = json.loads(janela.evaluate_js(js))
            break
    with open(os.path.join(BASE, "dados", "autoteste.json"), "w", encoding="utf-8") as f:
        json.dump(r, f, ensure_ascii=False, indent=1)
    janela.confirm_close = False
    janela.destroy()


def _ja_aberto():
    """Uma janela só: se já está aberto, traz para a frente em vez de abrir outro."""
    try:
        import ctypes
        from ctypes import wintypes
        k32, u32 = ctypes.WinDLL("kernel32", use_last_error=True), ctypes.windll.user32
        k32.CreateMutexW(None, False, AUMID)  # o Windows solta o mutex quando o processo fecha
        if ctypes.get_last_error() != 183:  # ERROR_ALREADY_EXISTS
            return False

        @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        def ver(h, _):
            texto, classe = ctypes.create_unicode_buffer(300), ctypes.create_unicode_buffer(100)
            u32.GetWindowTextW(h, texto, 300)
            u32.GetClassNameW(h, classe, 100)
            if u32.IsWindowVisible(h) and texto.value.endswith(TITULO) and classe.value.startswith("WindowsForms"):
                u32.ShowWindow(h, 9)  # SW_RESTORE
                u32.SetForegroundWindow(h)
                return False
            return True

        u32.EnumWindows(ver, 0)
        return True
    except Exception:
        return False


def main():
    global janela
    if _ja_aberto():
        return
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(AUMID)
    except Exception:
        pass
    porta = porta_livre()
    srv = ThreadingHTTPServer(("127.0.0.1", porta), Servidor)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    q = {"t": TOKEN}
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if args and os.path.isfile(args[0]):
        q["open"] = os.path.abspath(args[0])
    # O editor é o motor do PhotoCraft; "--classico" abre o editor antigo, feito à mão em JS.
    classico = "--classico" in sys.argv or not os.path.isfile(os.path.join(MOTOR, "ares.html"))
    pagina = "index.html" if classico else "motor/ares.html"
    url = f"http://127.0.0.1:{porta}/{pagina}?{urllib.parse.urlencode(q)}"
    # Janela em português, com a placa de vídeo mais forte e sem a lista de bloqueio de GPU (WebGPU ligado).
    os.environ.setdefault("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--lang=pt-BR --accept-lang=pt-BR,pt,en --ignore-gpu-blocklist --enable-gpu-rasterization --force_high_performance_gpu")
    webview.settings["ALLOW_DOWNLOADS"] = True  # Salvar e Exportar do motor saem como download, com a janela de "salvar como"
    janela = webview.create_window(
        TITULO, url, js_api=Api(), width=1440, height=900, min_size=(1000, 640),
        background_color="#262626", confirm_close=True,
    )
    webview.start(
        _ao_abrir,
        icon=ICONE if os.path.isfile(ICONE) else None,
        private_mode=False,
        storage_path=os.path.join(BASE, "dados", "webview"),
        localization={"global.quitConfirmation": "Fechar o Ares Studio? O que não foi salvo será perdido."},
    )


if __name__ == "__main__":
    main()
