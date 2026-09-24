import {Sandbox} from '../runtime/sandbox';
import {HeadlessEnvironment, actionButtons} from '../runtime/headless';
import {emptyButtons, type Buttons, type Edge} from '../sdk/index';

let environment: HeadlessEnvironment | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let held: Record<string, Buttons> = {}, result: any, seat = 'p0', ticks = 0;
let paused = false, seed = 42, players = 1, truncated = false;
let steps: {frames: number; actions: Record<string, number>}[] = [];
const action = (buttons: Buttons) => {
  const x = Number(buttons.right) - Number(buttons.left), y = Number(buttons.down) - Number(buttons.up);
  return actionButtons.findIndex(b => b.right === (x > 0) && b.left === (x < 0) && b.up === (y < 0) && b.down === (y > 0) && b.action === buttons.action);
};
function post() {
  const observation = result.observations[seat];
  const view = {...observation, players: observation.players.map((player: any, i: number) => ({...player, name: `Player ${i + 1}`}))};
  self.postMessage({type: 'frame', view, done: result.terminated, ticks,
    replay: {seed, players, steps, truncated}});
}
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'load') {
      clearInterval(timer); environment?.close();
      seed = data.seed; players = data.players; seat = 'p0'; ticks = 0; steps = []; truncated = false;
      held = Object.fromEntries(Array.from({length: players}, (_, i) => [`p${i}`, emptyButtons()]));
      const vm = await Sandbox.create(data.code, data.runtime);
      environment = new HeadlessEnvironment(vm, {players, mode: 'party-v1', actionRepeat: 1, maxDecisions: 8000});
      result = environment.reset(seed); post();
      timer = setInterval(() => {
        try {
          if (paused || result.terminated) return;
          const actions = Object.fromEntries(Object.entries(held).map(([id, buttons]) => [id, action(buttons)]));
          const previous = steps.at(-1);
          if (previous && previous.frames < 60 && JSON.stringify(previous.actions) === JSON.stringify(actions)) previous.frames++;
          else if (steps.length < 1200) steps.push({frames: 1, actions});
          else truncated = true;
          result = environment!.step(actions); ticks++;
          if (ticks >= 8000) {clearInterval(timer); throw Error('This preview exceeded its round limit');}
          if (ticks % 2 === 0 || result.terminated) post();
        } catch (error) {clearInterval(timer); self.postMessage({type: 'error', message: (error as Error).message});}
      }, 1000 / 60);
    } else if (data.type === 'input') {
      for (const edge of data.edges as Edge[]) held[seat][edge.button] = edge.down;
    } else if (data.type === 'seat') {
      for (const id of Object.keys(held)) held[id] = emptyButtons();
      if (held[data.seat]) {seat = data.seat; post();}
    } else if (data.type === 'pause') {
      paused = data.paused;
      for (const id of Object.keys(held)) held[id] = emptyButtons();
    }
  } catch (error) {self.postMessage({type: 'error', message: (error as Error).message});}
};
