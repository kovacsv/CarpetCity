export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

const BINDINGS: Record<string, keyof InputState> = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowDown: 'backward',
  KeyS: 'backward',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

/** Keyboard/touch driving controls and mouse/touch camera gestures. */
export class Input implements InputState {
  forward = false;
  backward = false;
  left = false;
  right = false;

  /** Accumulated mouse movement since the last call to `consumeLook`. */
  private lookX = 0;
  private lookY = 0;
  private zoom = 0;
  private dragging = false;
  private readonly keys = new Set<string>();
  private readonly heldControls = new Map<number, keyof InputState>();
  private readonly lookPointers = new Map<number, { x: number; y: number }>();
  private readonly actions = new Map<string, () => void>();
  lastLookTime = -Infinity;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });

    const touchMedia = window.matchMedia('(any-pointer: coarse)');
    const updateTouchMode = () => document.body.classList.toggle('touch-mode', touchMedia.matches);
    updateTouchMode();
    touchMedia.addEventListener('change', updateTouchMode);
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') document.body.classList.add('touch-mode');
    });

    document.querySelectorAll<HTMLButtonElement>('[data-drive]').forEach((button) => {
      const binding = button.dataset.drive;
      if (!isDrivingControl(binding)) throw new Error(`Unknown touch driving control: ${binding}`);
      button.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        this.heldControls.set(e.pointerId, binding);
        this.syncControls();
      });
      const release = (e: PointerEvent) => {
        this.heldControls.delete(e.pointerId);
        this.syncControls();
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const code = button.dataset.action!;
        const action = this.actions.get(code);
        if (!action) throw new Error(`Unregistered touch action: ${code}`);
        action();
      });
    });

    const touchControls = document.getElementById('touch-controls');
    for (const type of ['contextmenu', 'selectstart'] as const) {
      touchControls?.addEventListener(type, (e) => e.preventDefault());
    }

    element.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      e.preventDefault();
      element.setPointerCapture(e.pointerId);
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    element.addEventListener('pointermove', (e) => {
      const previous = this.lookPointers.get(e.pointerId);
      if (!previous) return;
      const other = [...this.lookPointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const before = Math.hypot(previous.x - other.x, previous.y - other.y);
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        this.zoom += (before - after) / 30;
      } else {
        this.lookX += e.clientX - previous.x;
        this.lookY += e.clientY - previous.y;
      }
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.lastLookTime = performance.now();
    });
    const releaseLook = (e: PointerEvent) => this.lookPointers.delete(e.pointerId);
    element.addEventListener('pointerup', releaseLook);
    element.addEventListener('pointercancel', releaseLook);
    element.addEventListener('lostpointercapture', releaseLook);

    element.addEventListener('mousedown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      this.dragging = true;
      if (document.pointerLockElement !== element) {
        // Pointer lock may be unavailable (e.g. in some iframes); dragging still works then.
        try {
          const result = element.requestPointerLock() as unknown;
          if (result instanceof Promise) result.catch(() => undefined);
        } catch {
          /* ignore */
        }
      }
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === element || this.dragging) {
        this.lookX += e.movementX;
        this.lookY += e.movementY;
        this.lastLookTime = performance.now();
      }
    });
    element.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom += Math.sign(e.deltaY);
    }, { passive: false });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  /** Registers a one-shot action for a key (e.g. KeyR to reset). */
  onAction(code: string, action: () => void): void {
    this.actions.set(code, action);
  }

  consumeLook(): { dx: number; dy: number; zoom: number } {
    const r = { dx: this.lookX, dy: this.lookY, zoom: this.zoom };
    this.lookX = 0;
    this.lookY = 0;
    this.zoom = 0;
    return r;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const binding = BINDINGS[e.code];
    if (binding) {
      if (down) this.keys.add(e.code);
      else this.keys.delete(e.code);
      this.syncControls();
      e.preventDefault();
      return;
    }
    if (down && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const action = this.actions.get(e.code);
      if (action) {
        action();
        e.preventDefault();
      }
    }
  }

  private releaseAll(): void {
    this.keys.clear();
    this.heldControls.clear();
    this.lookPointers.clear();
    this.syncControls();
    this.dragging = false;
    this.lookX = this.lookY = this.zoom = 0;
  }

  private syncControls(): void {
    const active = new Set([...this.keys].map((key) => BINDINGS[key]));
    for (const binding of this.heldControls.values()) active.add(binding);
    for (const binding of ['forward', 'backward', 'left', 'right'] as const) {
      this[binding] = active.has(binding);
    }
    document.querySelectorAll<HTMLButtonElement>('[data-drive]').forEach((button) => {
      const binding = button.dataset.drive;
      button.setAttribute('aria-pressed', String(isDrivingControl(binding) && this[binding]));
    });
  }
}

function isDrivingControl(value: string | undefined): value is keyof InputState {
  return value === 'forward' || value === 'backward' || value === 'left' || value === 'right';
}
