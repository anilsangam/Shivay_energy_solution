(function () {
  const config = window.CalculatorConfig && window.CalculatorConfig.solar;
  if (!config) return;
  const maxValue = config.maxEstimateInput;
  const number = value => value === '' ? NaN : Number(value);
  const valid = value => Number.isFinite(value) && value >= 0 && value <= maxValue;
  const money = value => '₹' + Math.round(value).toLocaleString('en-IN');
  const set = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
  const clearResults = () => ['outKw','outPanels','outGen','outSavings','outAnnualSavings','outGrossCost','outSubsidy','outNetCost','outPayback','outArea','outCo2'].forEach(id => set(id, '—'));

  function estimateSubsidy(kw, propertyType) {
    if (propertyType !== 'residential') return 0;
    const tier = config.subsidy.tiers.find(item => kw <= item.maxKw);
    return Math.min(tier ? tier.amount : config.subsidy.maximum, config.subsidy.maximum);
  }

  function runCalculator(manualUnits = false) {
    const bill = number(document.getElementById('calcBill').value);
    const tariff = number(document.getElementById('calcTariff').value);
    const unitsInput = document.getElementById('calcUnits');
    if (!valid(bill) || !Number.isFinite(tariff) || tariff < 0 || tariff > maxValue || (bill > 0 && tariff === 0)) return clearResults();
    let units = manualUnits ? number(unitsInput.value) : bill / (tariff || 1);
    if (!valid(units)) return clearResults();
    if (!manualUnits) { units = Math.round(units); unitsInput.value = units; }

    const recommendedKw = Math.max(config.minimumSystemKw, Math.ceil((units / config.unitsPerKwPerMonth) * 10) / 10);
    const monthlyGeneration = Math.round(recommendedKw * config.unitsPerKwPerMonth);
    const annualGeneration = monthlyGeneration * 12;
    const monthlySavings = Math.round(monthlyGeneration * tariff);
    const annualSavings = monthlySavings * 12;
    const grossCost = Math.round(recommendedKw * config.costPerKwApprox);
    const subsidy = estimateSubsidy(recommendedKw, document.getElementById('calcProperty').value);
    const netCost = Math.max(grossCost - subsidy, 0);
    const paybackYears = annualSavings > 0 ? (netCost / annualSavings).toFixed(1) : '—';
    const rooftopArea = Math.round(recommendedKw * config.sqFtPerKw);
    const co2Tonnes = (recommendedKw * config.co2SavedPerKwYearKg / 1000).toFixed(1);
    const panels = Math.ceil(recommendedKw * 1000 / config.panelWattage);
    if (![recommendedKw, monthlyGeneration, annualGeneration, monthlySavings, annualSavings, grossCost, subsidy, netCost, rooftopArea, panels].every(Number.isFinite)) return clearResults();

    set('outKw', recommendedKw.toFixed(1)); set('outPanels', panels); set('outGen', monthlyGeneration.toLocaleString('en-IN'));
    set('outSavings', money(monthlySavings)); set('outAnnualSavings', money(annualSavings)); set('outGrossCost', money(grossCost));
    set('outSubsidy', subsidy ? '- ' + money(subsidy) : (document.getElementById('calcProperty').value === 'commercial' ? '₹0 (Commercial)' : '₹0'));
    set('outNetCost', money(netCost)); set('outPayback', '~ ' + paybackYears + ' Years'); set('outArea', rooftopArea); set('outCo2', co2Tonnes);
    const subsidyLabel = document.querySelector('.solar-subsidy-label');
    if (subsidyLabel) subsidyLabel.title = config.subsidy.label;
    const message = 'Namaste Shivay Energy, please provide a formal quotation. Indicative website estimate only; final quotation by Shivay Energy Solutions.\n' +
      '- Recommended solar capacity: ' + recommendedKw.toFixed(1) + ' kW\n' +
      '- Monthly bill: ' + money(bill) + '\n- Estimated system cost: ' + money(grossCost) +
      '\n- Indicative subsidy (eligibility/rules apply): ' + money(subsidy) + '\n- Estimated net investment: ' + money(netCost);
    const quoteButton = document.getElementById('calcQuoteBtn');
    if (quoteButton) quoteButton.href = 'https://wa.me/917000575496?text=' + encodeURIComponent(message);
  }

  window.runCalculator = runCalculator;
  window.syncBillInput = value => { document.getElementById('calcBill').value = value; runCalculator(); };
  window.syncCalculatorDistrict = () => {
    const isMp = document.getElementById('calcState').value === 'Madhya Pradesh';
    document.getElementById('calcMpDistrictField').hidden = !isMp;
    document.getElementById('calcOtherDistrictField').hidden = isMp;
    document.getElementById('calcDistrict').disabled = !isMp;
    document.getElementById('calcOtherDistrict').disabled = isMp;
  };
  document.addEventListener('DOMContentLoaded', () => {
    ['calcBill','calcUnits','calcTariff'].forEach(id => document.getElementById(id).addEventListener('input', () => runCalculator(id === 'calcUnits')));
    document.getElementById('calcProperty').addEventListener('change', () => runCalculator());
    runCalculator();
  });
})();
