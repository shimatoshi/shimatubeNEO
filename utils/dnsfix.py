"""Fallback DNS resolver for Termux/Android environments."""
import socket
import subprocess

_orig_getaddrinfo = socket.getaddrinfo
_cache = {}


def _dig(host):
    if host in _cache:
        return _cache[host]
    for resolver in ("1.1.1.1", "8.8.8.8"):
        try:
            out = subprocess.check_output(
                ["dig", "+short", "+time=3", "+tries=2", "@" + resolver, host, "A"],
                timeout=8, text=True)
            ips = [line.strip() for line in out.splitlines()
                   if line.strip() and line[0].isdigit() and not line.endswith(".")]
            if ips:
                _cache[host] = ips
                return ips
        except Exception:
            continue
    return []


def _patched_getaddrinfo(host, port, *args, **kwargs):
    try:
        return _orig_getaddrinfo(host, port, *args, **kwargs)
    except socket.gaierror:
        pass
    ips = _dig(host) if host else []
    if not ips:
        raise socket.gaierror("DNS fallback failed for %r" % host)
    sock_type = kwargs.get("type") or (args[1] if len(args) > 1 else 0) or socket.SOCK_STREAM
    p = port or 0
    if isinstance(p, str):
        p = socket.getservbyname(p) if not p.isdigit() else int(p)
    return [(socket.AF_INET, sock_type, 6, "", (ip, int(p))) for ip in ips]


socket.getaddrinfo = _patched_getaddrinfo
