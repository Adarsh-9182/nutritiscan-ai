"""User-operated interactive terminal. No device control or agent-command endpoint."""
import base64
import fcntl
import json
import os
import pty
import selectors
import signal
import struct
import sys
import termios


def emit(value):
    print(json.dumps(value), flush=True)


child, master = pty.fork()
if child == 0:
    os.chdir(sys.argv[1])
    os.execv('/bin/zsh', ['/bin/zsh', '-f'])

os.set_blocking(master, False)
selector = selectors.DefaultSelector()
selector.register(master, selectors.EVENT_READ, 'terminal')
selector.register(sys.stdin, selectors.EVENT_READ, 'input')


def close(*_):
    try:
        os.kill(child, signal.SIGHUP)
    except ProcessLookupError:
        pass
    sys.exit(0)


signal.signal(signal.SIGTERM, close)
signal.signal(signal.SIGHUP, close)
buffer = b''
try:
    while True:
        for key, _ in selector.select():
            if key.data == 'terminal':
                try:
                    data = os.read(master, 16384)
                except BlockingIOError:
                    continue
                except OSError:
                    data = b''
                if not data:
                    emit({'type': 'exit'})
                    close()
                emit({'type': 'data', 'data': base64.b64encode(data).decode()})
            else:
                chunk = os.read(sys.stdin.fileno(), 65536)
                if not chunk:
                    close()
                buffer += chunk
                if len(buffer) > 1000000:
                    close()
                while b'\n' in buffer:
                    line, buffer = buffer.split(b'\n', 1)
                    value = json.loads(line)
                    if value.get('type') == 'input':
                        os.write(master, base64.b64decode(value['data'], validate=True))
                    elif value.get('type') == 'resize':
                        cols, rows = int(value['cols']), int(value['rows'])
                        if 20 <= cols <= 500 and 5 <= rows <= 200:
                            fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
finally:
    os.close(master)
