"""Minimal read-only HTTPS server for the static demo deployment."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
import ssl


SITE_ROOT = "/opt/pirate-battle/site"
PORT = 5173
CREDENTIALS = os.environ["CREDENTIALS_DIRECTORY"]


class SiteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SITE_ROOT, **kwargs)


server = ThreadingHTTPServer(("0.0.0.0", PORT), SiteHandler)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(
    certfile=os.path.join(CREDENTIALS, "fullchain.pem"),
    keyfile=os.path.join(CREDENTIALS, "privkey.pem"),
)
server.socket = context.wrap_socket(server.socket, server_side=True)
server.serve_forever()
