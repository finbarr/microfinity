import {actionButtons} from '../runtime/headless';
import {BUTTONS, emptyButtons, type Button, type Buttons, type Edge} from '../sdk/index';

/** Keep fast press/release pairs visible to the frame-based preview and replay. */
export class PreviewInput {
  private held: Record<string, Buttons>;
  private pending: Record<string, Edge[]>;

  constructor(seats: string[]) {
    this.held = Object.fromEntries(seats.map(seat => [seat, emptyButtons()]));
    this.pending = Object.fromEntries(seats.map(seat => [seat, []]));
  }

  enqueue(seat: string, edges: Edge[]) {
    const queue = this.pending[seat];
    if (!queue || queue.length + edges.length > 128 || edges.some(edge => !BUTTONS.includes(edge.button) || typeof edge.down !== 'boolean')) {
      throw Error('Invalid preview input');
    }
    queue.push(...edges);
  }

  releaseAll() {
    for (const seat of Object.keys(this.held)) {
      this.held[seat] = emptyButtons();
      this.pending[seat] = [];
    }
  }

  frame() {
    return Object.fromEntries(Object.entries(this.held).map(([seat, buttons]) => {
      const seen = new Set<Button>(), queue = this.pending[seat];
      // Preserve order, but defer a second transition of a button to the next
      // frame so a complete tap cannot collapse into an unchanged held state.
      while (queue.length && !seen.has(queue[0].button)) {
        const edge = queue.shift()!;
        seen.add(edge.button);
        buttons[edge.button] = edge.down;
      }
      const x = Number(buttons.right) - Number(buttons.left), y = Number(buttons.down) - Number(buttons.up);
      const action = actionButtons.findIndex(b => b.right === (x > 0) && b.left === (x < 0) && b.up === (y < 0) && b.down === (y > 0) && b.action === buttons.action);
      return [seat, action];
    }));
  }
}
