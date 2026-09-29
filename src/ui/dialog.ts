import { h, type Child } from './dom';

interface DialogOptions {
  title: string;
  body?: Child;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Renders a text input and resolves with its value. */
  input?: { label: string; value?: string; type?: 'text' | 'password'; placeholder?: string; required?: boolean; mustEqual?: string };
}

/** Modal dialog built on <dialog>. Resolves with true / the input value, or null when cancelled. */
export function openDialog(options: DialogOptions): Promise<string | true | null> {
  return new Promise((resolve) => {
    const input = options.input
      ? h('input', {
          class: 'input',
          type: options.input.type ?? 'text',
          value: options.input.value ?? '',
          placeholder: options.input.placeholder ?? '',
          attrs: { 'aria-label': options.input.label, autocomplete: 'off', spellcheck: 'false' },
        })
      : null;

    const confirm = h('button', { class: ['btn', options.danger ? 'btn-danger' : 'btn-primary'], type: 'submit' }, options.confirmLabel ?? 'Confirm');
    const updateState = () => {
      if (!input || !options.input) return;
      const v = input.value.trim();
      confirm.disabled = (options.input.required ?? false) && (!v || (options.input.mustEqual !== undefined && v !== options.input.mustEqual));
    };
    input?.addEventListener('input', updateState);
    updateState();

    const form = h(
      'form',
      { class: 'dialog-body', attrs: { method: 'dialog' } },
      h('h2', { class: 'dialog-title' }, options.title),
      options.body ? h('div', { class: 'dialog-text' }, options.body) : null,
      input ? h('label', { class: 'dialog-field' }, h('span', null, options.input!.label), input) : null,
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', on: { click: () => close(null) } }, options.cancelLabel ?? 'Cancel'),
        confirm,
      ),
    );
    const dialog = h('dialog', { class: 'dialog' }, form);

    let settled = false;
    const close = (value: string | true | null) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (confirm.disabled) return;
      close(input ? input.value : true);
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(null);
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close(null);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    (input ?? confirm).focus();
  });
}
