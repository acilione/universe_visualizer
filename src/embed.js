// The atlas keeps its viewport-sized layout and dark sky in embedded mode.
const embedded = window.parent !== window && new URLSearchParams(location.search).get('embed') === '1';
let parentOrigin;
if (embedded && document.referrer) {
  const referrer = new URL(document.referrer);
  if (referrer.origin === location.origin ||
      ['localhost', '127.0.0.1', '[::1]'].includes(referrer.hostname)) {
    parentOrigin = referrer.origin;
  }
}
function announce(type) {
  if (parentOrigin) window.parent.postMessage({
    channel: 'acilione-physics-v1',
    simulation: 'universe_visualizer',
    type,
  }, parentOrigin);
}
export const announceReady = () => announce('ready');
export const announceFailure = () => announce('error');
