(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const principalInput = $('principalInput');
  const rateInput = $('rateInput');
  const yearsInput = $('yearsInput');
  const monthsInput = $('monthsInput');
  const ageInput = $('ageInput');
  const methodBtns = document.querySelectorAll('[data-method]');
  const resultCard = $('resultCard');
  const resultBody = $('resultBody');

  const extraTypeBtns = document.querySelectorAll('[data-extratype]');
  const extraResultBody = $('extraResultBody');

  const scheduleTable = $('scheduleTable');
  const themeToggle = $('themeToggle');
  const resetExtraBtn = $('resetExtraBtn');
  const clearAllBtn = $('clearAllBtn');
  const principalPreview = $('principalPreview');

  let method = 'annuity';
  let extraType = 'shorten';
  // 年目(1始まり) → 繰り上げ返済額(円) のマップ。表に直接入力された値を保持する。
  const extraByYear = {};

  // ---------- テーマ切り替え ----------
  function applyTheme(theme) {
    if (theme) {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
  const savedTheme = localStorage.getItem('loanCalcTheme');
  if (savedTheme) applyTheme(savedTheme);
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('loanCalcTheme', next);
  });

  // ---------- トグルボタン ----------
  methodBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      methodBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      method = btn.dataset.method;
      recalc();
    });
  });

  extraTypeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      extraTypeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      extraType = btn.dataset.extratype;
      recalc();
    });
  });

  [rateInput, yearsInput, monthsInput, ageInput].forEach((el) => {
    el.addEventListener('input', recalc);
  });

  // 借入額は桁が大きく読み間違えやすいので、入力しながら3桁区切りのカンマを自動で入れる
  function digitsOnly(str) {
    return (str || '').replace(/[^\d]/g, '');
  }
  function formatDigitsWithCommas(digits) {
    if (!digits) return '';
    return parseInt(digits, 10).toLocaleString('ja-JP');
  }
  function updatePrincipalPreview() {
    const digits = digitsOnly(principalInput.value);
    if (!digits) {
      principalPreview.textContent = '';
      return;
    }
    const n = parseInt(digits, 10);
    const man = Math.round(n / 10000);
    principalPreview.textContent = man > 0 ? `= 約${man.toLocaleString('ja-JP')}万円` : '';
  }
  principalInput.addEventListener('input', () => {
    const digits = digitsOnly(principalInput.value);
    principalInput.value = formatDigitsWithCommas(digits);
    updatePrincipalPreview();
    recalc();
  });

  clearAllBtn.addEventListener('click', () => {
    if (!confirm('入力した内容をすべて消して、最初の状態に戻します。よろしいですか?')) return;

    [principalInput, rateInput, yearsInput, monthsInput, ageInput].forEach((el) => { el.value = ''; });
    updatePrincipalPreview();

    method = 'annuity';
    methodBtns.forEach((b) => b.classList.toggle('active', b.dataset.method === 'annuity'));

    extraType = 'shorten';
    extraTypeBtns.forEach((b) => b.classList.toggle('active', b.dataset.extratype === 'shorten'));

    Object.keys(extraByYear).forEach((y) => delete extraByYear[y]);

    recalc();
    principalInput.focus();
  });

  // 表の「繰り上げ」欄: 入力中はカンマ整形だけ行い、確定(change)で再計算する。
  // input中に毎回作り直すと、入力中のマスからフォーカスが外れてしまうため。
  scheduleTable.addEventListener('input', (e) => {
    const target = e.target;
    if (!target.classList.contains('extra-year-input')) return;
    const digits = digitsOnly(target.value);
    target.value = formatDigitsWithCommas(digits);
  });

  scheduleTable.addEventListener('change', (e) => {
    const target = e.target;
    if (!target.classList.contains('extra-year-input')) return;
    const year = parseInt(target.dataset.year, 10);
    const val = parseFloat(digitsOnly(target.value));
    if (val > 0) {
      extraByYear[year] = val;
    } else {
      delete extraByYear[year];
    }
    recalc();
  });

  resetExtraBtn.addEventListener('click', () => {
    Object.keys(extraByYear).forEach((y) => delete extraByYear[y]);
    recalc();
  });

  // ---------- 計算ロジック ----------
  function annuityPayment(balance, monthlyRate, months) {
    if (months <= 0) return balance;
    if (monthlyRate === 0) return balance / months;
    return (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
  }

  // extras: [{month, amount, type}, ...] を月の昇順で渡す
  // schedule: [{month, payment, interest, principalPaid, balance, extra}]
  function buildSchedule(principalYen, annualRatePercent, totalMonths, method, extras) {
    const monthlyRate = annualRatePercent / 100 / 12;
    let balance = principalYen;
    let monthsRemaining = totalMonths;
    let payment = method === 'annuity' ? Math.round(annuityPayment(balance, monthlyRate, monthsRemaining)) : null;
    let principalPortion = method === 'equalPrincipal' ? Math.round(balance / monthsRemaining) : null;

    const schedule = [];
    let extraIdx = 0;

    for (let m = 1; m <= totalMonths; m++) {
      if (balance <= 0) break;

      const interest = Math.round(balance * monthlyRate);
      let principalPaid;
      let pay;

      if (method === 'annuity') {
        principalPaid = payment - interest;
        if (principalPaid > balance || m === totalMonths) principalPaid = balance;
        pay = principalPaid + interest;
      } else {
        principalPaid = principalPortion;
        if (principalPaid > balance || m === totalMonths) principalPaid = balance;
        pay = principalPaid + interest;
      }

      balance -= principalPaid;
      const row = { month: m, payment: pay, interest, principalPaid, balance, extra: 0 };
      schedule.push(row);

      while (extras && extraIdx < extras.length && extras[extraIdx].month === m) {
        const extra = extras[extraIdx];
        extraIdx++;
        if (balance <= 0) continue;

        const extraAmt = Math.min(extra.amount, balance);
        balance -= extraAmt;
        row.extra += extraAmt;
        row.balance = balance;
        monthsRemaining = totalMonths - m;

        if (balance > 0 && monthsRemaining > 0 && extra.type === 'reduce') {
          if (method === 'annuity') {
            payment = Math.round(annuityPayment(balance, monthlyRate, monthsRemaining));
          } else {
            principalPortion = Math.round(balance / monthsRemaining);
          }
        }
        // shorten の場合は payment / principalPortion をそのまま維持
      }
    }

    return schedule;
  }

  function summarize(schedule) {
    const totalPayment = schedule.reduce((s, r) => s + r.payment, 0) + schedule.reduce((s, r) => s + r.extra, 0);
    const totalInterest = schedule.reduce((s, r) => s + r.interest, 0);
    return {
      months: schedule.length,
      totalPayment,
      totalInterest,
      firstPayment: schedule.length ? schedule[0].payment : 0,
      lastPayment: schedule.length ? schedule[schedule.length - 1].payment : 0,
    };
  }

  function yen(n) {
    return Math.round(n).toLocaleString('ja-JP') + '円';
  }

  function ageAtMonth(currentAge, months) {
    return currentAge + Math.floor(months / 12);
  }

  function monthsToYM(months) {
    const y = Math.floor(months / 12);
    const m = months % 12;
    if (y === 0) return `${m}ヶ月`;
    if (m === 0) return `${y}年`;
    return `${y}年${m}ヶ月`;
  }

  function readInputs() {
    const principalYen = parseFloat(digitsOnly(principalInput.value));
    const rate = parseFloat(rateInput.value);
    const years = parseInt(yearsInput.value, 10) || 0;
    const extraMonths = parseInt(monthsInput.value, 10) || 0;
    const totalMonths = years * 12 + extraMonths;

    if (!(principalYen > 0) || isNaN(rate) || rate < 0 || totalMonths <= 0) return null;

    const ageVal = parseInt(ageInput.value, 10);
    const currentAge = ageVal >= 0 ? ageVal : null;

    return {
      principalYen,
      rate,
      totalMonths,
      currentAge,
    };
  }

  function recalc() {
    const inputs = readInputs();
    if (!inputs) {
      resultCard.classList.add('hidden');
      extraResultBody.innerHTML = '';
      scheduleTable.innerHTML = '';
      return;
    }

    resultCard.classList.remove('hidden');

    const normalSchedule = buildSchedule(inputs.principalYen, inputs.rate, inputs.totalMonths, method, null);
    const normalSum = summarize(normalSchedule);

    let resultHtml = '';
    if (method === 'annuity') {
      resultHtml += row('毎月の返済額', yen(normalSum.firstPayment), 'accent');
    } else {
      resultHtml += row('初回の返済額', yen(normalSum.firstPayment), 'accent');
      resultHtml += row('最終回の返済額', yen(normalSum.lastPayment));
    }
    resultHtml += row('返済期間', monthsToYM(normalSum.months));
    if (inputs.currentAge !== null) {
      resultHtml += row('完済時の年齢', `${ageAtMonth(inputs.currentAge, normalSum.months)}歳ごろ`);
    }
    resultHtml += row('総返済額', yen(normalSum.totalPayment));
    resultHtml += row('うち利息の総額', yen(normalSum.totalInterest));
    resultBody.innerHTML = resultHtml;

    // ---------- 繰り上げ返済(表に入力された年から自動で組み立てる) ----------
    const maxYear = Math.ceil(inputs.totalMonths / 12);
    const extras = Object.keys(extraByYear)
      .map((y) => parseInt(y, 10))
      .filter((y) => y >= 1 && y <= maxYear && extraByYear[y] > 0)
      .sort((a, b) => a - b)
      .map((y) => ({
        month: Math.min(y * 12, inputs.totalMonths - 1) || y * 12,
        amount: extraByYear[y],
        type: extraType,
      }))
      .filter((e) => e.month >= 1 && e.month < inputs.totalMonths);

    let activeSchedule = normalSchedule;

    if (extras.length > 0) {
      const extraSchedule = buildSchedule(inputs.principalYen, inputs.rate, inputs.totalMonths, method, extras);
      const extraSum = summarize(extraSchedule);
      activeSchedule = extraSchedule;

      const monthsShortened = normalSum.months - extraSum.months;
      const interestSaved = normalSum.totalInterest - extraSum.totalInterest;

      let html = '<div class="compare-box good">';
      if (extraType === 'shorten') {
        html += row('完済までの期間', `${monthsToYM(normalSum.months)} → ${monthsToYM(extraSum.months)}`);
        html += row('短縮される期間', monthsToYM(monthsShortened), 'good');
        if (inputs.currentAge !== null) {
          html += row('完済時の年齢', `${ageAtMonth(inputs.currentAge, normalSum.months)}歳ごろ → ${ageAtMonth(inputs.currentAge, extraSum.months)}歳ごろ`, 'good');
        }
      } else {
        const lastExtraMonth = extras[extras.length - 1].month;
        const newPayment = extraSchedule.find((r) => r.month > lastExtraMonth)?.payment;
        if (newPayment) html += row('直近の繰り上げ後の毎月の返済額', yen(newPayment), 'good');
      }
      html += row('軽減される利息', yen(interestSaved), 'good');
      html += row('繰り上げ後の総返済額', yen(extraSum.totalPayment));
      html += '</div>';
      extraResultBody.innerHTML = html;
    } else {
      extraResultBody.innerHTML = '';
    }

    renderYearlyTable(activeSchedule, inputs.currentAge, maxYear);
  }

  function row(label, value, cls) {
    return `<div class="result-row"><span class="result-label">${label}</span><span class="result-value ${cls || ''}">${value}</span></div>`;
  }

  function renderYearlyTable(schedule, currentAge, maxYear) {
    if (!schedule.length) {
      scheduleTable.innerHTML = '';
      return;
    }
    const years = [];
    for (let i = 0; i < schedule.length; i += 12) {
      const chunk = schedule.slice(i, i + 12);
      const principalPaid = chunk.reduce((s, r) => s + r.principalPaid, 0);
      const interestPaid = chunk.reduce((s, r) => s + r.interest, 0);
      const extraPaid = chunk.reduce((s, r) => s + r.extra, 0);
      const yearNum = Math.floor(i / 12) + 1;
      years.push({
        year: yearNum,
        age: currentAge !== null ? currentAge + yearNum : null,
        monthlyPayment: chunk[0].payment,
        principalPaid,
        interestPaid,
        extraPaid,
        balance: chunk[chunk.length - 1].balance,
      });
    }

    const ageHeader = currentAge !== null ? '<th>年齢</th>' : '';
    let html = `<thead><tr><th>年</th>${ageHeader}<th>月々の返済額</th><th>元金</th><th>利息</th><th>繰上(円)</th><th>残高</th></tr></thead><tbody>`;
    years.forEach((y) => {
      const ageCell = currentAge !== null ? `<td>${y.age}歳</td>` : '';
      const inputVal = extraByYear[y.year] ? extraByYear[y.year].toLocaleString('ja-JP') : '';
      const extraCell = `<td class="extra-cell"><input type="text" class="extra-year-input" data-year="${y.year}" value="${inputVal}" placeholder="0" inputmode="numeric"></td>`;
      html += `<tr><td>${y.year}</td>${ageCell}<td>${yen(y.monthlyPayment)}</td><td>${yen(y.principalPaid)}</td><td>${yen(y.interestPaid)}</td>${extraCell}<td>${yen(y.balance)}</td></tr>`;
    });
    html += '</tbody>';
    scheduleTable.innerHTML = html;

    // 完済が早まって表から消えた年の入力値は、意味がなくなるので取り除く
    Object.keys(extraByYear).forEach((y) => {
      if (parseInt(y, 10) > years.length) delete extraByYear[y];
    });
  }

  recalc();
})();
