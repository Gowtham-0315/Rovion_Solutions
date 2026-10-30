'use strict';

/* ECOGEN AI frontend-only MVP.
   Demo factors are illustrative placeholders, not verified regional emission factors.
   Replace FACTORS with documented, region-appropriate factors before real-world use.
*/
const FACTORS = {
  car: { value: 0.19, unit: 'kg CO₂e / vehicle-km', label: 'Car travel', source: 'Illustrative demo assumption' },
  bike: { value: 0.07, unit: 'kg CO₂e / vehicle-km', label: 'Motorcycle / scooter', source: 'Illustrative demo assumption' },
  bus: { value: 0.08, unit: 'kg CO₂e / passenger-km', label: 'Bus travel', source: 'Illustrative demo assumption' },
  electricity: { value: 0.70, unit: 'kg CO₂e / kWh', label: 'Electricity', source: 'Illustrative demo assumption' },
  lpg: { value: 3.0, unit: 'kg direct CO₂ / kg LPG', label: 'LPG combustion', source: 'Illustrative rounded direct-combustion assumption; not lifecycle emissions' },
  waste: {
    collection: { value: 0.10, unit: 'kg CO₂e / kg mixed waste', label: 'Mixed waste: collection / recycling / composting', source: 'Illustrative rough demo assumption; not a verified treatment factor' },
    landfill: { value: 0.50, unit: 'kg CO₂e / kg mixed waste', label: 'Mixed waste: landfill / mixed disposal', source: 'Illustrative rough demo assumption; composition and landfill conditions vary' },
    burning: { value: 1.00, unit: 'kg CO₂e / kg mixed waste', label: 'Mixed waste: open burning', source: 'Illustrative rough demo assumption; actual emissions depend heavily on composition and combustion conditions' }
  }
};
const $ = id => document.getElementById(id);
let lastReport = null;
let previousFocus = null;
let toastTimeout;
const fmt = n => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

function readNumber(id, label, errors) {
  const raw = $(id).value.trim();
  if (raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    errors.push(`${label} must be a number of 0 or more.`);
    return null;
  }
  return value;
}

function getInputs() {
  const errors = [];
  const values = {
    carKm: readNumber('carKm', 'Car distance', errors),
    bikeKm: readNumber('bikeKm', 'Motorcycle distance', errors),
    busKm: readNumber('busKm', 'Bus distance', errors),
    electricityKwh: readNumber('electricityKwh', 'Electricity use', errors),
    lpgDays: readNumber('lpgDays', 'Cylinder duration', errors),
    lpgCapacity: readNumber('lpgCapacity', 'Cylinder capacity', errors),
    wasteKg: readNumber('wasteKg', 'Waste weight', errors),
    wasteMethod: $('wasteMethod').value,
    periodDays: Number($('period').value),
    demo: $('showDemo').checked
  };
  if (values.lpgDays !== null && values.lpgDays <= 0) errors.push('Cylinder duration must be greater than zero.');
  if (values.lpgCapacity === null || values.lpgCapacity <= 0) errors.push('Enter a valid cylinder capacity greater than zero.');
  return { values, errors };
}

function calculate(inputs) {
  const categories = [];
  const add = (key, activity, factor, note, isDemo = true) => {
    if (activity === null || activity === undefined) return;
    if (!inputs.demo) {
      categories.push({ key, label: factor.label, status: 'unavailable', note: 'No verified emission factor is configured in this frontend-only version.' });
      return;
    }
    const kg = activity * factor.value;
    categories.push({ key, label: factor.label, status: 'estimated', kg, note, factor: factor.value, unit: factor.unit, source: factor.source, isDemo });
  };

  add('car', inputs.carKm === null ? null : inputs.carKm * inputs.periodDays / 7, FACTORS.car, 'Distance scaled from weekly activity to the selected period.');
  add('bike', inputs.bikeKm === null ? null : inputs.bikeKm * inputs.periodDays / 7, FACTORS.bike, 'Distance scaled from weekly activity to the selected period.');
  add('bus', inputs.busKm === null ? null : inputs.busKm * inputs.periodDays / 7, FACTORS.bus, 'Passenger distance scaled from weekly activity to the selected period.');
  add('electricity', inputs.electricityKwh === null ? null : inputs.electricityKwh * inputs.periodDays / 7, FACTORS.electricity, 'Electricity scaled from weekly use to the selected period.');
  if (inputs.lpgDays !== null) {
    const kgLpg = (inputs.lpgCapacity / inputs.lpgDays) * inputs.periodDays;
    add('lpg', kgLpg, FACTORS.lpg, `Estimated LPG use: ${fmt(kgLpg)} kg for ${inputs.periodDays} days. Direct combustion only.`);
  }
  if (inputs.wasteKg !== null) {
    const wasteFactor = FACTORS.waste[inputs.wasteMethod];
    if (!inputs.demo) {
      categories.push({ key: 'waste', label: 'Mixed household waste', status: 'unavailable', note: 'No verified factor for this mixed-waste scenario is configured.' });
    } else if (inputs.wasteMethod === 'unknown') {
      categories.push({ key: 'waste', label: 'Mixed household waste', status: 'unavailable', note: 'Disposal method is uncertain, so a reliable waste estimate cannot be made.' });
    } else {
      const kg = (inputs.wasteKg * inputs.periodDays / 7) * wasteFactor.value;
      categories.push({ key: 'waste', label: 'Mixed household waste', status: 'estimated', kg, note: `${wasteFactor.label}. This is a rough demo estimate; actual results depend on waste composition and local treatment.`, factor: wasteFactor.value, unit: wasteFactor.unit, source: wasteFactor.source, isDemo: true });
    }
  }
  const calculated = categories.filter(c => c.status === 'estimated');
  const total = calculated.length ? calculated.reduce((sum, c) => sum + c.kg, 0) : null;
  const periodDays = inputs.periodDays;
  return {
    categories,
    total,
    dailyAverage: total === null ? null : total / periodDays,
    weeklyAverage: total === null ? null : total / periodDays * 7,
    periodDays,
    counted: calculated.length,
    requested: categories.length,
    demo: inputs.demo,
    inputs: { ...inputs }
  };
}

function renderReport(report) {
  lastReport = report;
  $('resultStatus').textContent = report.demo ? 'DEMO ESTIMATE' : 'VERIFIED FACTORS ONLY';
  $('totalValue').innerHTML = report.total === null ? 'Unavailable <span>kg CO₂e</span>' : `${fmt(report.total)} <span>kg CO₂e</span>`;
  $('dailyAverage').textContent = report.dailyAverage === null ? '—' : fmt(report.dailyAverage);
  $('weeklyAverage').textContent = report.weeklyAverage === null ? '—' : fmt(report.weeklyAverage);
  $('totalCaption').textContent = report.total === null
    ? 'No valid category could be calculated with the current factor settings.'
    : `Estimated emissions across ${report.counted} calculated categor${report.counted === 1 ? 'y' : 'ies'} over ${report.periodDays} days. This is not a complete personal footprint.`;
  renderBars(report);
  renderDetails(report);
  $('openSuggestionsBtn').disabled = report.total === null;
  if (report.total !== null) {
    const top = report.categories.filter(c => c.status === 'estimated').sort((a, b) => b.kg - a.kg)[0];
    $('coachIntro').textContent = top ? `${top.label} is the largest estimated contributor among the activities included in this report. Open your action plan for practical ways to reduce impact.` : 'Add an activity to receive tailored suggestions.';
  } else {
    $('coachIntro').textContent = 'No estimate is available yet. Add an activity and use the labelled demo factors, or configure verified factors.';
  }
}

function renderBars(report) {
  const items = report.categories.filter(c => c.status === 'estimated');
  if (!items.length) {
    $('barChart').innerHTML = '<div class="empty-chart">No calculated categories yet. Add an activity and calculate again.</div>';
    $('chartFootnote').textContent = 'Unavailable categories are not shown as zero.';
    return;
  }
  const max = Math.max(...items.map(c => c.kg), 0.0001);
  $('barChart').innerHTML = items.map(c => {
    const width = Math.max(2, c.kg / max * 100);
    return `<div class="bar-row"><span class="bar-name">${escapeHtml(c.label)}</span><div class="bar-track" role="img" aria-label="${escapeHtml(c.label)}: ${fmt(c.kg)} kg CO2e"><div class="bar-fill" style="width:${width}%"></div></div><span class="bar-value">${fmt(c.kg)} kg</span></div>`;
  }).join('');
  $('chartFootnote').textContent = `Bar lengths compare included categories over the same ${report.periodDays}-day period. ${report.demo ? 'All displayed values use illustrative demo factors.' : 'Only configured verified factors would be shown.'}`;
}

function renderDetails(report) {
  if (!report.categories.length) {
    $('calculationDetails').innerHTML = '<p class="empty-state">No activity was entered.</p>';
    return;
  }
  $('calculationDetails').innerHTML = report.categories.map(c => {
    const value = c.status === 'estimated' ? `${fmt(c.kg)} kg CO₂e` : 'Unavailable';
    const note = c.status === 'estimated' ? `${c.note} Factor: ${c.factor} ${c.unit}. ${c.source}.` : c.note;
    return `<div class="detail-row"><div><strong>${escapeHtml(c.label)}</strong><p>${escapeHtml(note)}</p></div><div class="detail-value">${value}</div></div>`;
  }).join('');
}

function getSuggestions(report) {
  const valid = report.categories.filter(c => c.status === 'estimated');
  if (!valid.length) return [];
  const top = [...valid].sort((a, b) => b.kg - a.kg)[0];
  const suggestions = {
    car: [
      ['Combine nearby trips', 'Plan errands together to avoid repeated journeys. Your result depends on the distance you actually avoid.'],
      ['Consider sharing a ride', 'Where safe and practical, sharing a car journey can reduce emissions per passenger. The benefit depends on occupancy and the alternative travel method.'],
      ['Try an alternative for one short trip', 'Walking, cycling, or public transport may help where accessible. Compare the actual distance and mode before estimating savings.']
    ],
    bike: [
      ['Combine short journeys', 'Group errands together to reduce repeated trips. Any benefit depends on the kilometres actually avoided.'],
      ['Keep the vehicle maintained', 'Correct tyre pressure and routine maintenance can support efficient operation; the effect varies by vehicle and condition.'],
      ['Choose a lower-impact option when practical', 'For some trips, walking, cycling, or public transport may be suitable. Compare the actual trip rather than assuming a fixed saving.']
    ],
    bus: [
      ['Keep using shared transport when practical', 'A bus trip can share vehicle emissions across passengers. The factor used here is only illustrative; actual emissions vary with occupancy and bus type.'],
      ['Combine destinations', 'Avoid extra journeys where possible, while keeping essential travel and accessibility needs in mind.'],
      ['Compare like-for-like journeys', 'When choosing an alternative, compare the same route and passenger distance using suitable factors.']
    ],
    electricity: [
      ['Switch off unused devices', 'Turn off lights and equipment when they are not needed. Your actual reduction depends on the device and time saved.'],
      ['Use efficient lighting and settings', 'LED lighting and efficient appliance settings can reduce electricity use when replacing less efficient use.'],
      ['Check your kWh over time', 'Use your electricity bill to compare similar periods and see whether consumption actually changes.']
    ],
    lpg: [
      ['Use a lid while cooking', 'Covered pots can help food cook efficiently and may reduce fuel use, depending on the meal and cooking method.'],
      ['Match flame to cookware', 'Keep the flame under the base of the vessel and follow the appliance safety instructions.'],
      ['Plan cooking together', 'Preparing several items in one cooking session may reduce repeated heating, depending on your routine.']
    ],
    waste: [
      ['Avoid waste before it is created', 'Plan purchases and meals to reduce unnecessary waste at the source.'],
      ['Use appropriate local collection', 'Use authorised waste collection, recycling, or composting services where available and suitable for the material.'],
      ['Do not openly burn waste', 'Open burning can release harmful air pollutants as well as greenhouse gases. Choose appropriate collection or disposal instead.']
    ]
  };
  const list = suggestions[top.key] || [['Start with one practical change', 'Choose a change that fits your daily routine and track the activity again to compare estimates.']];
  return list.map((item, i) => ({ number: i + 1, title: item[0], description: item[1] }));
}

function openSuggestions() {
  if (!lastReport || lastReport.total === null) return;
  const top = lastReport.categories.filter(c => c.status === 'estimated').sort((a, b) => b.kg - a.kg)[0];
  $('modalDescription').textContent = top
    ? `Your largest estimated contributor is ${top.label} (${fmt(top.kg)} kg CO₂e for this report period). Start with one realistic change; these suggestions do not promise a fixed amount of savings.`
    : 'Here are practical changes to consider.';
  $('suggestionList').innerHTML = getSuggestions(lastReport).map(s => `<article class="suggestion-item"><span class="suggestion-number">0${s.number}</span><div><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.description)}</p></div></article>`).join('');
  previousFocus = document.activeElement;
  $('suggestionModal').hidden = false;
  document.body.classList.add('modal-open');
  $('closeModalBtn').focus();
}

function closeSuggestions() {
  $('suggestionModal').hidden = true;
  document.body.classList.remove('modal-open');
  if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2600);
}

$('footprintForm').addEventListener('submit', event => {
  event.preventDefault();
  const { values, errors } = getInputs();
  if (errors.length) {
    $('formMessage').textContent = errors.join(' ');
    showToast('Please check your inputs.');
    return;
  }
  const hasActivity = ['carKm', 'bikeKm', 'busKm', 'electricityKwh', 'lpgDays', 'wasteKg'].some(k => values[k] !== null);
  if (!hasActivity) {
    $('formMessage').textContent = 'Enter at least one activity before calculating.';
    showToast('Add at least one activity first.');
    return;
  }
  const report = calculate(values);
  renderReport(report);
  $('formMessage').textContent = report.demo
    ? 'Calculated with illustrative demo factors. Replace them with verified local factors before real-world use.'
    : 'No verified factor registry is configured, so numerical estimates are unavailable.';
  $('resultStatus').textContent = report.demo ? 'DEMO ESTIMATE' : 'NO VERIFIED FACTORS';
  $('report').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  showToast(report.total === null ? 'No supported numerical estimate is available.' : 'Your estimate is ready.');
  if (report.total !== null) window.setTimeout(openSuggestions, 350);
});

$('resetBtn').addEventListener('click', () => {
  $('footprintForm').reset();
  $('lpgCapacity').value = '14.2';
  lastReport = null;
  $('resultStatus').textContent = 'WAITING FOR INPUT';
  $('totalValue').innerHTML = '— <span>kg CO₂e</span>';
  $('dailyAverage').textContent = '—';
  $('weeklyAverage').textContent = '—';
  $('totalCaption').textContent = 'Enter at least one activity and calculate to see your result.';
  $('barChart').innerHTML = '<div class="empty-chart">Your category graph will appear here after calculation.</div>';
  $('chartFootnote').textContent = 'Only categories with a calculated estimate appear.';
  $('calculationDetails').innerHTML = '<p class="empty-state">Your calculation details will appear here.</p>';
  $('coachIntro').textContent = 'After you calculate, we’ll suggest practical ways to reduce the biggest estimated contributor.';
  $('openSuggestionsBtn').disabled = true;
  $('formMessage').textContent = 'Your entries stay in this page; no backend is connected yet.';
  showToast('Calculator reset.');
});

$('openSuggestionsBtn').addEventListener('click', openSuggestions);
$('closeModalBtn').addEventListener('click', closeSuggestions);
$('doneModalBtn').addEventListener('click', closeSuggestions);
$('suggestionModal').addEventListener('click', event => { if (event.target === $('suggestionModal')) closeSuggestions(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('suggestionModal').hidden) closeSuggestions(); });
$('menuToggle').addEventListener('click', () => {
  const open = $('navLinks').classList.toggle('open');
  $('menuToggle').setAttribute('aria-expanded', String(open));
  $('menuToggle').textContent = open ? 'Close ×' : 'Menu ☰';
});
document.querySelectorAll('#navLinks a').forEach(a => a.addEventListener('click', () => {
  $('navLinks').classList.remove('open');
  $('menuToggle').setAttribute('aria-expanded', 'false');
  $('menuToggle').textContent = 'Menu ☰';
}));
