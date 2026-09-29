/**
 * Maps opaque field ids ("f12") to live DOM elements without mutating the page
 * (no data attributes are added). Ids are stable for an element across scans, so a
 * fill instruction computed from one scan still finds its element later.
 */
export class ElementRegistry {
  private ids = new WeakMap<Element, string>();
  private refs = new Map<string, WeakRef<Element>>();
  /** Structural signature per id, used to re-find an element that a framework re-rendered. */
  private signatures = new Map<string, string>();
  private counter = 0;

  idFor(el: Element, signature = ''): string {
    let id = this.ids.get(el);
    if (!id) {
      id = `f${++this.counter}`;
      this.ids.set(el, id);
    }
    if (!this.refs.has(id)) this.refs.set(id, new WeakRef(el));
    if (signature) this.signatures.set(id, signature);
    return id;
  }

  get(id: string): Element | null {
    const el = this.refs.get(id)?.deref();
    return el && el.isConnected ? el : null;
  }

  signatureOf(id: string): string | undefined {
    return this.signatures.get(id);
  }

  /** Drops references to elements that were garbage-collected or removed from the page. */
  prune(): void {
    for (const [id, ref] of this.refs) {
      const el = ref.deref();
      if (!el || !el.isConnected) {
        this.refs.delete(id);
        this.signatures.delete(id);
      }
    }
  }
}
