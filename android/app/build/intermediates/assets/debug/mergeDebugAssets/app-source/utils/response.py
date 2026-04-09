import json

class JsonResponseMixin:
    def send_json(self, data):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        b = json.dumps(data).encode('utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)
