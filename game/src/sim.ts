// Reloj de simulación y tareas cancelables (BASE-03).
// - El reloj avanza solo con pasos fijos efectivamente ejecutados: pausa, modal y segundo plano lo congelan.
// - Etapas de actividad, diálogos, celebraciones, revelación y final se programan aquí, nunca con setTimeout de pared.
// - Cada actividad/preview crea un Token; cancelarlo invalida sus callbacks tardíos (también promesas ya resueltas que
//   comprueban `token.alive` al despertar). Las operaciones de red/decodificación siguen en tiempo real, pero al
//   volver comprueban su token antes de tocar el estado del juego.

export class Token {
  private _alive = true;
  private hooks: (() => void)[] = [];
  constructor(public label = '') {}
  get alive() { return this._alive; }
  /** Idempotente: la segunda cancelación no repite limpiezas. */
  cancel() {
    if (!this._alive) return;
    this._alive = false;
    const h = this.hooks; this.hooks = [];
    for (const f of h) { try { f(); } catch (e) { console.warn('cleanup', this.label, e); } }
  }
  /** Limpieza que se ejecuta una sola vez al cancelar (listeners, captura de pointer, cámara, tabla, ducking…). */
  onCancel(f: () => void) { if (this._alive) this.hooks.push(f); else f(); }
}

interface Task { at: number; fn: () => void; token: Token | null; id: number }

export class SimClock {
  /** Segundos de simulación transcurridos (solo pasos fijos ejecutados). */
  now = 0;
  private tasks: Task[] = [];
  private seq = 0;

  /** Ejecuta `fn` tras `sec` segundos de simulación, salvo que su token se haya cancelado. */
  after(sec: number, fn: () => void, token: Token | null = null) {
    const t: Task = { at: this.now + Math.max(0, sec), fn, token, id: ++this.seq };
    this.tasks.push(t);
    return t.id;
  }
  /** Promesa que se resuelve tras `sec` de simulación; con token cancelado no se resuelve nunca (no hay callback tardío). */
  wait(sec: number, token: Token | null = null) { return new Promise<void>((res) => this.after(sec, res, token)); }
  clear(id: number) { this.tasks = this.tasks.filter((t) => t.id !== id); }

  advance(dt: number) {
    this.now += dt;
    if (!this.tasks.length) return;
    const due = this.tasks.filter((t) => t.at <= this.now + 1e-9).sort((a, b) => a.at - b.at || a.id - b.id);
    if (!due.length) return;
    this.tasks = this.tasks.filter((t) => t.at > this.now + 1e-9);
    for (const t of due) if (!t.token || t.token.alive) { try { t.fn(); } catch (e) { console.error('tarea de simulación', e); } }
  }
  get pending() { return this.tasks.filter((t) => !t.token || t.token.alive).length; }
}
