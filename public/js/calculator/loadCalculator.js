
const config = window.CalculatorConfig;
const loadAppliances = config.load.appliances;
const applianceCounts = Object.fromEntries(loadAppliances.map(item => [item.id, 0]));
const presetCounts = config.load.presets;
let activeApplianceCategory = 'all';
let activeLoadFilter = 'all';

function renderAppliances() {
    const grid = document.getElementById('applianceGrid');
    if (!grid) return;
    const items = loadAppliances.filter(item =>
        (activeApplianceCategory === 'all' || item.category === activeApplianceCategory) &&
        (activeLoadFilter === 'all' || item.type === activeLoadFilter)
    );
    grid.innerHTML = items.map(item => `
        <article class="appliance-card ${applianceCounts[item.id] ? 'has-load' : ''}">
            <i class="${item.icon.trim()} appliance-icon" aria-hidden="true"></i>
            <h3>${item.name}</h3>
            <div class="appliance-spec-row"><span class="appliance-watts">${item.watts} W</span><strong class="appliance-subtotal">${applianceCounts[item.id] ? `${(item.watts * applianceCounts[item.id]).toLocaleString('en-IN')} W` : ''}</strong></div>
            <div class="appliance-card-footer">
            <div class="quantity-control" aria-label="${item.name} quantity">
                <button type="button" data-quantity-change="-1" data-appliance="${item.id}" aria-label="Remove one ${item.name}">−</button>
                <strong>${applianceCounts[item.id]}</strong>
                <button type="button" data-quantity-change="1" data-appliance="${item.id}" aria-label="Add one ${item.name}">+</button>
            </div></div>
        </article>`).join('');
    updateLoadEstimate();
}

function updateLoadEstimate() {
    const watts = loadAppliances.reduce((sum, item) => sum + item.watts * applianceCounts[item.id], 0);
    document.getElementById('totalRunningLoad').textContent = watts.toLocaleString('en-IN');
    ['lights', 'home', 'kitchen', 'heavy', 'accessories'].forEach(category => {
        const categoryLoad = loadAppliances.filter(item => item.category === category).reduce((sum, item) => sum + item.watts * applianceCounts[item.id], 0);
        document.querySelector(`[data-category-total="${category}"]`).textContent = `${categoryLoad.toLocaleString('en-IN')} W`;
    });
    const hours = Number(document.getElementById('backupHours').value);
    document.getElementById('backupHoursValue').textContent = hours;
    const solution = document.getElementById('loadSolution');
    if (!solution.hidden) updateLoadSuggestions(watts, hours);
}

function updateLoadSuggestions(watts, hours) {
    const config = window.CalculatorConfig.load;
    const dailyEnergyKwh = (watts * hours) / 1000;
    const inverterKva = watts ? Math.max(config.inverter.minimumKva, Math.ceil((watts * config.inverter.safetyMargin) / (1000 * config.inverter.kvaStep)) * config.inverter.kvaStep) : 0;
    const batteryUnits = watts ? Math.max(1, Math.ceil(dailyEnergyKwh / config.battery.usableEnergyKwh)) : 0;
    const solarKw = dailyEnergyKwh ? Math.ceil((dailyEnergyKwh / (window.CalculatorConfig.solar.peakSunHours * window.CalculatorConfig.solar.solarSystemEfficiency)) * 10) / 10 : 0;
    document.getElementById('suggestedInverter').textContent = watts ? `${inverterKva.toFixed(1)} kVA · 48V hybrid/off-grid` : 'Add appliances';
    document.getElementById('suggestedBatteries').textContent = watts ? `${batteryUnits} × ${config.battery.nominalVoltage}V ${config.battery.capacityAh}Ah battery unit${batteryUnits > 1 ? 's' : ''}` : '—';
    document.getElementById('suggestedBatteryEnergy').textContent = watts ? `Approx. ${(batteryUnits * config.battery.usableEnergyKwh).toFixed(1)} kWh usable storage` : 'Sized for selected backup time';
    document.getElementById('suggestedSolarKw').textContent = watts ? `${solarKw.toFixed(1)} kWp grid-connected array` : 'Add appliances';
    document.getElementById('suggestedSolarEnergy').textContent = dailyEnergyKwh.toFixed(1);

    const totalAppliances = loadAppliances.reduce((sum, item) => sum + applianceCounts[item.id], 0);
    const selected = loadAppliances.filter(item => applianceCounts[item.id] > 0)
        .map(item => `${item.name} x ${applianceCounts[item.id]} (${item.watts * applianceCounts[item.id]} W)`);
    const details = document.getElementById('loadRecommendationDetails');
    if (details) {
        details.textContent = watts
            ? `${totalAppliances} appliances selected | ${watts.toLocaleString('en-IN')} W connected load | ${dailyEnergyKwh.toFixed(1)} kWh/day at ${hours} backup hours`
            : 'Choose appliances to calculate a system recommendation.';
    }

    const quoteButton = document.getElementById('loadWhatsAppQuote');
    if (quoteButton) {
        const applianceList = selected.length ? selected.map(item => `- ${item}`).join('\n') : '- No appliances selected';
        const message = [
            'Namaste Shivay Energy Solutions, please prepare a customized quotation for my backup load.',
            '',
            'Selected appliances:', applianceList, '',
            `Total appliances: ${totalAppliances}`,
            `Total running load: ${watts.toLocaleString('en-IN')} W`,
            `Requested backup: ${hours} hours/day`,
            `Estimated daily energy: ${dailyEnergyKwh.toFixed(1)} kWh`,
            `Suggested inverter: ${watts ? `${inverterKva.toFixed(1)} kVA` : 'Please assess'}`,
            `Suggested battery bank: ${watts ? `${batteryUnits} x ${config.battery.nominalVoltage}V ${config.battery.capacityAh}Ah (${(batteryUnits * config.battery.usableEnergyKwh).toFixed(1)} kWh usable)` : 'Please assess'}`,
            `Suggested solar PV: ${watts ? `${solarKw.toFixed(1)} kWp` : 'Please assess'}`,
            '',
            'These are indicative sizing estimates. Please confirm the final system and send me a quotation.'
        ].join('\n');
        quoteButton.href = `https://wa.me/917000575496?text=${encodeURIComponent(message)}`;
    }
}

function updateCalculatorOutline() {
    const shell = document.getElementById('connectedCalculator');
    const svg = shell?.querySelector('.calculator-connected-outline');
    const path = document.getElementById('calculatorOutlinePath');
    const activeTab = shell?.querySelector('.calculator-picker.active');
    const tabStrip = shell?.querySelector('.calculator-picker-section');
    if (!shell || !svg || !path || !activeTab || !tabStrip || shell.clientWidth === 0 || shell.clientHeight === 0) return;

    const bounds = shell.getBoundingClientRect();
    const tabBounds = activeTab.getBoundingClientRect();
    const stripBounds = tabStrip.getBoundingClientRect();
    const width = shell.clientWidth;
    const height = shell.clientHeight;
    const panelY = stripBounds.bottom - bounds.top;
    const activeIsSolar = activeTab.dataset.calculatorTarget === 'solar-calculator';
    const tabLeft = activeIsSolar ? 0 : width / 2;
    const tabRight = activeIsSolar ? width / 2 : width;
    const tabTop = tabBounds.top - bounds.top;
    const tabRadius = Math.min(24, (tabRight - tabLeft) / 4, panelY / 2);
    const panelRadius = Math.min(26, width / 8, (height - panelY) / 3);
    const joinCurve = Math.min(38, Math.max(24, panelY * 0.4));
    const n = value => Number(value.toFixed(2));

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    const pathParts = activeIsSolar ? [
        `M ${n(tabLeft)} ${n(tabTop + tabRadius)}`,
        `Q ${n(tabLeft)} ${n(tabTop)} ${n(tabLeft + tabRadius)} ${n(tabTop)}`,
        `H ${n(tabRight - tabRadius)}`,
        `Q ${n(tabRight)} ${n(tabTop)} ${n(tabRight)} ${n(tabTop + tabRadius)}`,
        `V ${n(panelY - joinCurve)}`,
        `C ${n(tabRight)} ${n(panelY - joinCurve * 0.25)}, ${n(tabRight + joinCurve * 0.25)} ${n(panelY)}, ${n(tabRight + joinCurve)} ${n(panelY)}`,
        `H ${n(width - panelRadius)}`,
        `Q ${n(width)} ${n(panelY)} ${n(width)} ${n(panelY + panelRadius)}`,
        `V ${n(height - panelRadius)}`,
        `Q ${n(width)} ${n(height)} ${n(width - panelRadius)} ${n(height)}`,
        `H ${n(panelRadius)}`,
        `Q 0 ${n(height)} 0 ${n(height - panelRadius)}`,
        `V ${n(tabTop + tabRadius)}`,
        'Z'
    ] : [
        `M ${n(tabRight)} ${n(tabTop + tabRadius)}`,
        `Q ${n(tabRight)} ${n(tabTop)} ${n(tabRight - tabRadius)} ${n(tabTop)}`,
        `H ${n(tabLeft + tabRadius)}`,
        `Q ${n(tabLeft)} ${n(tabTop)} ${n(tabLeft)} ${n(tabTop + tabRadius)}`,
        `V ${n(panelY - joinCurve)}`,
        `C ${n(tabLeft)} ${n(panelY - joinCurve * 0.25)}, ${n(tabLeft - joinCurve * 0.25)} ${n(panelY)}, ${n(tabLeft - joinCurve)} ${n(panelY)}`,
        `H ${n(panelRadius)}`,
        `Q 0 ${n(panelY)} 0 ${n(panelY + panelRadius)}`,
        `V ${n(height - panelRadius)}`,
        `Q 0 ${n(height)} ${n(panelRadius)} ${n(height)}`,
        `H ${n(width - panelRadius)}`,
        `Q ${n(width)} ${n(height)} ${n(width)} ${n(height - panelRadius)}`,
        `V ${n(tabTop + tabRadius)}`,
        'Z'
    ];
    path.setAttribute('d', pathParts.join(' '));
}

function selectCalculator(target, updateUrl = true) {
    document.querySelectorAll('[data-calculator-target]').forEach(button => {
        const selected = button.dataset.calculatorTarget === target;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('.calculator-workspace').forEach(section => {
        section.hidden = section.id !== target;
    });
    const selectedSection = document.getElementById(target);
    selectedSection.classList.remove('calculator-reveal');
    void selectedSection.offsetWidth;
    selectedSection.classList.add('calculator-reveal');
    requestAnimationFrame(updateCalculatorOutline);
    if (updateUrl) {
        history.replaceState(null, '', `#${target}`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const connectedCalculator = document.getElementById('connectedCalculator');
    if (connectedCalculator) {
        if ('ResizeObserver' in window) {
            const outlineObserver = new ResizeObserver(updateCalculatorOutline);
            outlineObserver.observe(connectedCalculator);
            connectedCalculator.querySelectorAll('.calculator-picker').forEach(tab => outlineObserver.observe(tab));
        }
        window.addEventListener('resize', updateCalculatorOutline, { passive: true });
        if (document.fonts?.ready) document.fonts.ready.then(updateCalculatorOutline);
    }
    renderAppliances();
    document.querySelectorAll('[data-calculator-target]').forEach(button => button.addEventListener('click', () => selectCalculator(button.dataset.calculatorTarget)));
    document.querySelectorAll('[data-appliance-category]').forEach(button => button.addEventListener('click', () => {
        activeApplianceCategory = button.dataset.applianceCategory;
        document.querySelectorAll('[data-appliance-category]').forEach(tab => tab.classList.toggle('selected', tab === button));
        renderAppliances();
    }));
    document.querySelectorAll('[data-load-filter]').forEach(button => button.addEventListener('click', () => {
        activeLoadFilter = button.dataset.loadFilter;
        document.querySelectorAll('[data-load-filter]').forEach(tab => tab.classList.toggle('selected', tab === button));
        renderAppliances();
    }));
    document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
        Object.keys(applianceCounts).forEach(id => applianceCounts[id] = 0);
        if (button.dataset.preset !== 'custom') Object.assign(applianceCounts, presetCounts[button.dataset.preset]);
        document.querySelectorAll('[data-preset]').forEach(preset => preset.classList.toggle('selected', preset === button));
        renderAppliances();
    }));
    document.getElementById('applianceGrid').addEventListener('click', event => {
        const button = event.target.closest('[data-quantity-change]');
        if (!button) return;
        const id = button.dataset.appliance;
        applianceCounts[id] = Math.max(0, applianceCounts[id] + Number(button.dataset.quantityChange));
        document.querySelector('[data-preset="custom"]').classList.add('selected');
        document.querySelectorAll('[data-preset]:not([data-preset="custom"])').forEach(preset => preset.classList.remove('selected'));
        renderAppliances();
    });
    document.getElementById('backupHours').addEventListener('input', updateLoadEstimate);
    document.getElementById('findLoadSolution').addEventListener('click', () => {
        document.getElementById('loadSolution').hidden = false;
        updateLoadEstimate();
    });
    document.getElementById('editLoadDetails').addEventListener('click', () => {
        document.getElementById('loadSolution').hidden = true;
        document.getElementById('applianceGrid').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const initialCalculator = location.hash === '#load-calculator' ? 'load-calculator' : 'solar-calculator';
    selectCalculator(initialCalculator, false);
});
