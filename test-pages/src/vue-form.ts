import { createApp, h, reactive, vModelSelect, vModelText, withDirectives } from 'vue';

/** A Vue 3 form using v-model, rendered with render functions (no template compiler needed). */
createApp({
  setup() {
    const form = reactive({ fullName: '', email: '', city: '', state: '', pincode: '', university: '' });
    const text = (key: keyof typeof form, label: string, type = 'text') =>
      h('div', { class: 'field' }, [
        h('label', { for: `v-${key}` }, label),
        withDirectives(h('input', { id: `v-${key}`, type, name: key, 'onUpdate:modelValue': (v: string) => (form[key] = v) }), [[vModelText, form[key]]]),
      ]);
    return () =>
      h('form', { onSubmit: (e: Event) => e.preventDefault() }, [
        text('fullName', 'Full Name'),
        text('email', 'Email Address', 'email'),
        text('city', 'City'),
        h('div', { class: 'field' }, [
          h('label', { for: 'v-state' }, 'State'),
          withDirectives(
            h('select', { id: 'v-state', name: 'state', 'onUpdate:modelValue': (v: string) => (form.state = v) }, [
              h('option', { value: '' }, 'Select state'),
              ...['Karnataka', 'Maharashtra', 'Rajasthan'].map((s) => h('option', { value: s }, s)),
            ]),
            [[vModelSelect, form.state]],
          ),
        ]),
        text('pincode', 'PIN Code'),
        text('university', 'University Name'),
        h('h2', 'Vue state'),
        h('pre', { class: 'state', id: 'vue-state' }, JSON.stringify(form, null, 2)),
      ]);
  },
}).mount('#app');
