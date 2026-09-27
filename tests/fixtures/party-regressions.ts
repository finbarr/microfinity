// Open with scripts/preview-party.ts. This runs the real app and socket server;
// the fixture only records painted screens and commands, and can slow assets.
export {};
const panel = document.createElement('details');
panel.style.cssText = 'position:fixed;bottom:45px;right:8px;z-index:1000;background:#111;color:white;max-width:80vw;max-height:50vh;overflow:auto;font:12px monospace;padding:8px';
panel.innerHTML = '<summary>Regression trace</summary><label><input type="checkbox" id="slow-assets"> Slow cartridge loading (1s)</label> <label><input type="checkbox" id="disable-anchor"> Disable native scroll anchoring</label> <button id="clear-trace">Clear trace</button><pre id="regression-trace"></pre>';
document.body.append(panel);
const output = panel.querySelector('pre')!;
const entries: object[] = [];
const record = (entry: object) => {
  entries.push({ms: Math.round(performance.now()), ...entry});
  output.textContent = JSON.stringify(entries, null, 2);
};
panel.querySelector('button')!.onclick = () => {entries.length = 0; output.textContent = '[]';};
panel.querySelector<HTMLInputElement>('#disable-anchor')!.onchange = event => {
  document.documentElement.style.overflowAnchor = (event.target as HTMLInputElement).checked ? 'none' : '';
};
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  if (panel.querySelector('input')!.checked && String(args[0]).startsWith('/api/versions/')) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return originalFetch(...args);
};
const OriginalSocket = window.WebSocket;
let starting = false, failures = 0, sawLoading = false, sawGame = false;
window.WebSocket = class extends OriginalSocket {
  constructor(...args: ConstructorParameters<typeof WebSocket>) {
    super(...args);
    let previous = '';
    this.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.type === 'state') {
        const phase = `${message.matchId}:${message.round}:${message.phase}`;
        if (phase !== previous) record({event: 'state', phase: message.phase, round: message.round});
        previous = phase;
      } else if (message.type === 'error') {failures++; record({event: 'server-error', message: message.message});}
    });
  }
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (typeof data === 'string') {
      const message = JSON.parse(data);
      if (message.type === 'start') {starting = true; failures = 0; sawLoading = false; sawGame = false;}
      if (['start', 'creating', 'loaded', 'playlist'].includes(message.type)) {
        record({event: 'command', type: message.type, ...(message.type === 'creating' ? {active: message.active} : {})});
      }
    }
    super.send(data);
  }
};
let selection: {button: HTMLElement; card: HTMLElement; top: number; pressed: string | null} | null = null;
for (const event of ['pointerdown', 'click', 'focusin'] as const) {
  document.addEventListener(event, e => {
    const element = e.target as HTMLElement;
    if (element.closest('#root')) record({event, control: element.getAttribute('aria-label') ?? element.textContent?.slice(0, 80), scrollY});
    if (event === 'click' && element.matches('button.pick')) {
      const card = element.closest<HTMLElement>('.game-card')!;
      selection = {button: element, card, top: card.getBoundingClientRect().top, pressed: element.getAttribute('aria-pressed')};
    }
  }, true);
}
let lastFrame = '';
const visible = (selector: string) => {
  const el = document.querySelector<HTMLElement>(selector);
  return !!el && !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
};
function frame() {
  const snapshot = {
    launch: visible('.launch-screen'),
    intro: visible('.cartridge-intro'),
    cabinet: visible('.cabinet'),
    preparing: !!document.querySelector('.game-overlay:not(.countdown):not(.result-overlay)'),
    countdown: visible('.countdown'),
    result: visible('.match-results'),
    notice: document.querySelector('.notice')?.textContent ?? '',
    scrollY,
    pickY: document.querySelector('.pick')?.getBoundingClientRect().y,
    focus: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName,
  };
  const serialized = JSON.stringify(snapshot);
  if (serialized !== lastFrame) {record({event: 'frame', ...snapshot}); lastFrame = serialized;}
  if (starting && snapshot.intro) sawLoading = true;
  if (starting && snapshot.cabinet) sawGame = true;
  if (starting && !sawLoading && snapshot.cabinet && !snapshot.intro) {
    failures++;
    record({event: 'FAIL', check: 'Cabinet appeared before the cartridge loading screen'});
  }
  if (starting && sawGame && snapshot.result) {
    record({event: failures === 0 && sawLoading ? 'PASS' : 'FAIL', check: 'Start through loading, countdown, gameplay and results', failures});
    starting = false;
  }
  if (selection && selection.button.getAttribute('aria-pressed') !== selection.pressed) {
    const shift = selection.card.getBoundingClientRect().top - selection.top;
    const focused = document.activeElement === selection.button;
    record({event: Math.abs(shift) < 1 && focused ? 'PASS' : 'FAIL', check: 'Selection keeps the cartridge position and button focus', shift, focused});
    selection = null;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
await import('../../client/main');
