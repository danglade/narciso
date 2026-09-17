"""Install Narciso's macOS user service; no credentials in the plist."""
from pathlib import Path
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
runtime = Path.home() / '.local/share/narciso'
app = runtime / 'app'
local = runtime / 'data'
local.mkdir(mode=0o700, parents=True, exist_ok=True)
target = Path.home() / 'Library/LaunchAgents/ai.narciso.gateway.plist'
target.parent.mkdir(parents=True, exist_ok=True)
node = shutil.which('node')
assert node, 'Node is required'
assert (root / '.env').exists(), 'Configure .env before installing the service'
domain = f'gui/{os.getuid()}'
service = f'{domain}/ai.narciso.gateway'
# Build a complete replacement before stopping the current service. Copying
# symlinks into an existing node_modules tree is not safe on Python 3.9.
staged = Path(tempfile.mkdtemp(prefix='app-staged-', dir=runtime))
for name in ('src', 'node_modules'):
    shutil.copytree(root / name, staged / name, symlinks=True)
for name in ('package.json', 'package-lock.json', 'SOUL.md', 'CONTEXT.example.md', '.env'):
    shutil.copy2(root / name, staged / name)
shutil.copy2(root / ('CONTEXT.md' if (root / 'CONTEXT.md').exists() else 'CONTEXT.example.md'), staged / 'CONTEXT.md')
(staged / 'CONTEXT.md').chmod(0o600)
(staged / '.env').chmod(0o600)
config = {
    'Label': 'ai.narciso.gateway',
    'ProgramArguments': [node, f'--env-file={app / ".env"}', str(app / 'src/photon.mjs')],
    'WorkingDirectory': str(app),
    'EnvironmentVariables': {'PATH': f'{Path.home()}/.local/bin:/opt/homebrew/bin:/usr/bin:/bin',
                             'HOME': str(Path.home())},
    'RunAtLoad': True, 'KeepAlive': True, 'ThrottleInterval': 30,
    'StandardOutPath': str(local / 'service.log'),
    'StandardErrorPath': str(local / 'service-error.log'),
    'Umask': 0o077,
}
target.write_bytes(plistlib.dumps(config))
target.chmod(0o600)
subprocess.run(['plutil', '-lint', str(target)], check=True)
if '--take-over-hermes' in sys.argv:
    # Use only when intentionally taking over the existing connection. Preserve all
    # Hermes files and history; disable its automatic restart and unload it.
    subprocess.run(['launchctl', 'disable', f'{domain}/ai.hermes.gateway'], check=True)
    stopped = subprocess.run(['launchctl', 'bootout', f'{domain}/ai.hermes.gateway'], capture_output=True)
    if stopped.returncode and subprocess.run(['launchctl', 'print', f'{domain}/ai.hermes.gateway'], capture_output=True).returncode == 0:
        raise RuntimeError('Hermes is still running; refusing to create two Photon consumers.')
subprocess.run(['launchctl', 'bootout', service], capture_output=True)
previous = runtime / 'app.previous'
if previous.exists():
    shutil.rmtree(previous)
if app.exists():
    app.rename(previous)
staged.rename(app)
subprocess.run(['launchctl', 'enable', service], check=True)
try:
    subprocess.run(['launchctl', 'bootstrap', domain, str(target)], check=True)
except subprocess.CalledProcessError:
    if previous.exists():
        app.rename(runtime / 'app.failed')
        previous.rename(app)
        subprocess.run(['launchctl', 'bootstrap', domain, str(target)], check=True)
    raise
print('Narciso installed as ai.narciso.gateway. Use launchctl print to verify runtime state.')
