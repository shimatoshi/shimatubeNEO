import sys, os, traceback

base = os.environ.get('SHIMATUBE_BASE', os.path.dirname(os.path.abspath(__file__)))
log_path = os.path.join(base, 'python_out.txt')
LOG = open(log_path, 'w')

try:
    print('boot.py starting...', file=LOG, flush=True)
    os.chdir(base)
    sys.path.insert(0, base)

    print('importing server modules...', file=LOG, flush=True)
    import socketserver
    from utils.db import init_db
    from handlers.handler import CustomHandler

    PORT = int(os.environ.get('SHIMATUBE_PORT', '8080'))

    class ThreadingHTTPServer(socketserver.ThreadingTCPServer):
        allow_reuse_address = True

    init_db()
    print(f'Starting server on port {PORT}...', file=LOG, flush=True)
    LOG.flush()

    with ThreadingHTTPServer(("127.0.0.1", PORT), CustomHandler) as httpd:
        httpd.serve_forever()

except SystemExit as e:
    print(f'SystemExit: {e}', file=LOG, flush=True)
    traceback.print_exc(file=LOG)
except Exception as e:
    print(f'Exception: {e}', file=LOG, flush=True)
    traceback.print_exc(file=LOG)
finally:
    LOG.close()
