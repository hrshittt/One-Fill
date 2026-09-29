// Populates the long option lists the way server-rendered portals do.
const day = document.querySelector('[name$="ddlDobDay"]');
for (let d = 1; d <= 31; d++) day.add(new Option(String(d).padStart(2, '0'), String(d)));
const year = document.querySelector('[name$="ddlDobYear"]');
for (let y = 2012; y >= 1970; y--) year.add(new Option(String(y), String(y)));
const state = document.getElementById('state');
state.add(new Option('--Select State--', '0'));
for (const s of ['Andhra Pradesh', 'Bihar', 'Delhi', 'Gujarat', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal']) {
  state.add(new Option(s.toUpperCase(), s.slice(0, 2).toUpperCase()));
}
