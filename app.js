(function () {
  const STORAGE_KEY = "spese-local-state-v1";
  const THEME_KEY = "spese-local-theme";
  const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  const COLORS = ["#0f766e", "#2563eb", "#d97706", "#c2410c", "#7c3aed", "#15803d", "#be123c", "#475569"];
  const currency = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
  const percent = new Intl.NumberFormat("it-IT", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

  let state = loadState();
  let activeView = "overview";
  let activeManagePane = "movements";
  let filters = { year: "latest", month: "latest", category: "", account: "" };
  let chartSelection = null;
  let filtersOpen = false;
  let actionMenuOpen = false;

  const els = {};
  document.addEventListener("DOMContentLoaded", () => {
    init();
  });

  async function init() {
    bindElements();
    bindEvents();
    applySavedTheme();
    await maybeAutoloadFromUrl();
    render();
  }

  function bindElements() {
    [
      "importFile",
      "exportButton",
      "actionToggle",
      "actionMenu",
      "themeToggle",
      "filterToggle",
      "filtersPanel",
      "emptyPanel",
      "periodLabel",
      "yearFilter",
      "monthFilter",
      "categoryFilter",
      "accountFilter",
      "investmentFilter",
      "assetModeFilter",
      "chartDetail",
      "floatingChartTooltip",
      "transactionForm",
      "accountForm",
      "investmentForm",
      "masterDataForm",
      "categoryForm",
      "investmentHistoryList",
      "accountHistoryList",
      "categoryChips",
      "transactionManageList",
      "masterDataList",
      "editSheet",
      "editForm",
      "editTitle",
      "editFields",
      "editCancel"
    ].forEach((id) => {
      els[id] = document.querySelector(`#${id}`);
    });
  }

  function bindEvents() {
    els.importFile.addEventListener("change", handleImport);
    els.exportButton.addEventListener("click", () => {
      actionMenuOpen = false;
      renderActionMenu();
      exportBackup();
    });
    els.actionToggle.addEventListener("click", () => {
      actionMenuOpen = !actionMenuOpen;
      renderActionMenu();
    });
    els.themeToggle.addEventListener("click", toggleTheme);
    els.filterToggle.addEventListener("click", () => {
      filtersOpen = !filtersOpen;
      renderFilterPanel();
    });
    document.querySelectorAll("[data-view-button]").forEach((button) => {
      button.addEventListener("click", () => {
        activeView = button.dataset.viewButton;
        renderViews();
      });
    });
    document.querySelectorAll("[data-manage-button]").forEach((button) => {
      button.addEventListener("click", () => {
        activeManagePane = button.dataset.manageButton;
        renderManagePanes();
      });
    });
    [els.yearFilter, els.monthFilter, els.categoryFilter, els.accountFilter].forEach((select) => {
      select.addEventListener("change", () => {
        filters = {
          year: els.yearFilter.value,
          month: els.monthFilter.value,
          category: els.categoryFilter.value,
          account: els.accountFilter.value
        };
        render();
      });
    });
    [els.investmentFilter, els.assetModeFilter].forEach((select) => {
      select.addEventListener("change", render);
    });
    document.addEventListener("click", (event) => {
      if (!actionMenuOpen) return;
      if (event.target.closest("#actionMenu") || event.target.closest("#actionToggle")) return;
      actionMenuOpen = false;
      renderActionMenu();
    });
    document.addEventListener("pointerdown", handleChartClick);
    document.addEventListener("click", handleDataActionClick);
    document.addEventListener("keydown", handleEditableRowKeydown);
    els.transactionForm.addEventListener("submit", addTransaction);
    els.accountForm.addEventListener("submit", addAccountBalance);
    els.investmentForm.addEventListener("submit", addInvestmentHolding);
    els.masterDataForm.addEventListener("submit", addMasterData);
    els.categoryForm.addEventListener("submit", addCategory);
    els.editForm.addEventListener("submit", saveEditSheet);
    els.editCancel.addEventListener("click", closeEditSheet);
    els.editSheet.addEventListener("click", (event) => {
      if (event.target.matches("[data-edit-close]")) closeEditSheet();
    });
  }

  function emptyState() {
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      transactions: [],
      accountBalances: [],
      investmentHoldings: [],
      monthlyAssets: [],
      monthlySummary: [],
      categories: [],
      accounts: [],
      investments: [],
      anomalies: []
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : emptyState();
    } catch {
      return emptyState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function normalizeState(input) {
    const next = { ...emptyState(), ...input };
    next.transactions = (next.transactions || []).map(normalizeTransaction).filter(Boolean);
    next.accountBalances = (next.accountBalances || []).map(normalizeAccountBalance).filter(Boolean);
    next.investmentHoldings = (next.investmentHoldings || []).map(normalizeInvestmentHolding).filter(Boolean);
    next.monthlyAssets = (next.monthlyAssets || []).map(normalizeMonthlyAsset).filter(Boolean);
    next.categories = uniqueSorted([...(next.categories || []), ...next.transactions.map((row) => row.category)]);
    next.accounts = uniqueSorted([...(next.accounts || []), ...next.accountBalances.map((row) => row.account), ...next.transactions.map((row) => row.account)]);
    next.investments = uniqueSorted([...(next.investments || []), ...next.investmentHoldings.map((row) => row.investment)]);
    return next;
  }

  function normalizeTransaction(row) {
    const amount = parseAmount(row.amount);
    if (amount === null) return null;
    const date = parseDate(row.date) || "";
    const month = date ? Number(date.slice(5, 7)) : numberOrNull(row.month);
    const year = date ? Number(date.slice(0, 4)) : numberOrNull(row.year);
    return {
      transaction_id: row.transaction_id || makeId("tx"),
      date,
      description: String(row.description || "").trim(),
      category: String(row.category || "Senza categoria").trim() || "Senza categoria",
      subcategory: String(row.subcategory || "").trim(),
      amount,
      account: String(row.account || "").trim(),
      payment_method: String(row.payment_method || "").trim(),
      type: row.type === "income" || amount > 0 ? "income" : "expense",
      notes: String(row.notes || "").trim(),
      month,
      year
    };
  }

  function normalizeAccountBalance(row) {
    const amount = parseAmount(row.amount);
    const period = periodFromRow(row);
    const account = String(row.account || "").trim();
    if (amount === null || !account || !period.month || !period.year) return null;
    return {
      snapshot_id: row.snapshot_id || makeId("account"),
      month_start: monthStart(period.year, period.month),
      date: parseDate(row.date) || "",
      month: period.month,
      year: period.year,
      account,
      amount
    };
  }

  function normalizeInvestmentHolding(row) {
    const amount = parseAmount(row.amount);
    const period = periodFromRow(row);
    const investment = String(row.investment || row.investimenti || "").trim();
    if (amount === null || !investment || !period.month || !period.year) return null;
    return {
      snapshot_id: row.snapshot_id || makeId("investment"),
      month_start: monthStart(period.year, period.month),
      date: parseDate(row.date) || "",
      month: period.month,
      year: period.year,
      investment,
      amount,
      performance_pct: parsePercentValue(row.performance_pct),
      performance_eur: parseAmount(row.performance_eur)
    };
  }

  function normalizeMonthlyAsset(row) {
    const period = periodFromRow(row);
    const accountsTotal = parseAmount(row.accounts_total);
    const investmentsTotal = parseAmount(row.investments_total);
    const totalAssets = parseAmount(row.total_assets || row.assets_total);
    if (!period.month || !period.year || accountsTotal === null || investmentsTotal === null || totalAssets === null) return null;
    return {
      snapshot_id: row.snapshot_id || makeId("assets"),
      month_start: monthStart(period.year, period.month),
      date: parseDate(row.date) || "",
      month: period.month,
      year: period.year,
      accounts_total: accountsTotal,
      investments_total: investmentsTotal,
      total_assets: totalAssets
    };
  }

  function render() {
    renderFilterOptions();
    renderFormOptions();
    renderFilterPanel();
    renderViews();

    const period = selectedPeriod();
    const transactions = filteredTransactions(period);
    const accounts = periodRows(state.accountBalances, period).filter((row) => !filters.account || row.account === filters.account);
    const investments = periodRows(state.investmentHoldings, period);
    const asset = periodRows(state.monthlyAssets, period)[0] || null;
    const hasData = state.transactions.length || state.accountBalances.length || state.investmentHoldings.length;

    els.emptyPanel.classList.toggle("hidden", Boolean(hasData));
    els.periodLabel.textContent = period ? `${MONTHS[period.month - 1]} ${period.year}` : "Nessun periodo";

    renderKpis(transactions, period);
    renderAverageDetails(period);
    renderWealth(accounts, investments, asset);
    renderDashboards(transactions, accounts, investments, asset);
    renderYearView();
    renderManageView(period);
    renderTransactions(transactions);
  }

  function renderViews() {
    document.querySelectorAll("[data-view]").forEach((section) => {
      section.classList.toggle("active", section.dataset.view === activeView);
    });
    document.querySelectorAll("[data-view-button]").forEach((button) => {
      button.classList.toggle("active", button.dataset.viewButton === activeView);
    });
    renderManagePanes();
  }

  function renderManagePanes() {
    document.querySelectorAll("[data-manage-pane]").forEach((section) => {
      section.classList.toggle("active", section.dataset.managePane === activeManagePane);
    });
    document.querySelectorAll("[data-manage-button]").forEach((button) => {
      button.classList.toggle("active", button.dataset.manageButton === activeManagePane);
    });
  }

  function renderFilterPanel() {
    const hasActiveFilters = filters.year !== "latest" || filters.month !== "latest" || filters.category !== "" || filters.account !== "";
    els.filtersPanel.classList.toggle("hidden", !filtersOpen);
    els.filterToggle.classList.toggle("active", filtersOpen || hasActiveFilters);
    els.filterToggle.setAttribute("aria-expanded", filtersOpen ? "true" : "false");
  }

  function renderActionMenu() {
    els.actionMenu.classList.toggle("hidden", !actionMenuOpen);
    els.actionToggle.classList.toggle("active", actionMenuOpen);
    els.actionToggle.setAttribute("aria-expanded", actionMenuOpen ? "true" : "false");
  }

  function applySavedTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
  }

  function toggleTheme() {
    const next = document.body.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  }

  function applyTheme(theme) {
    const clean = theme === "dark" ? "dark" : "light";
    document.body.dataset.theme = clean;
    els.themeToggle.setAttribute("aria-label", clean === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro");
    els.themeToggle.setAttribute("title", clean === "dark" ? "Tema chiaro" : "Tema scuro");
  }

  function renderKpis(transactions, period) {
    const expense = sum(transactions.filter(isExpense).map((row) => Math.abs(row.amount)));
    const income = sum(transactions.filter(isIncome).map((row) => Math.abs(row.amount)));
    const balance = income - expense;
    const days = period ? daysInMonth(period.year, period.month) : Math.max(1, uniqueSorted(transactions.map((row) => row.date)).length);
    const daily = expense / Math.max(days, 1);
    const averages = monthlyAverages(period);
    setText("#kpiExpense", formatCurrency(expense));
    setText("#kpiIncome", formatCurrency(income));
    setText("#kpiBalance", formatCurrency(balance));
    document.querySelector("#kpiBalance").className = balance >= 0 ? "positive" : "negative";
    setText("#kpiDailyInline", formatDailyRate(daily));
    setAverageDelta("#kpiExpenseAvg", expense, averages.expense, { lowerIsGood: true });
    setAverageDelta("#kpiIncomeAvg", income, averages.income);
    setAverageDelta("#kpiBalanceAvg", balance, averages.balance);
  }

  function renderAverageDetails(period) {
    if (!period) {
      setText("#avgMonthlyExpense", "n.d.");
      setText("#avgMonthlyIncome", "n.d.");
      setText("#avgSalary14", "n.d.");
      setText("#avgMonthlyExpenseDetail", "nessun anno");
      setText("#avgMonthlyIncomeDetail", "nessun anno");
      setText("#avgSalary14Detail", "14 mensilità");
      return;
    }

    const yearRows = state.transactions.filter((row) => row.year === period.year);
    const filteredYearRows = yearRows.filter(transactionMatchesDimensions);
    const months = uniqueMonths(filteredYearRows);
    const monthCount = Math.max(months.length, 1);
    const monthlyExpense = sum(filteredYearRows.filter(isExpense).map((row) => Math.abs(row.amount))) / monthCount;
    const monthlyIncome = sum(filteredYearRows.filter(isIncome).map((row) => Math.abs(row.amount))) / monthCount;
    const salaryRows = yearRows.filter((row) => isIncome(row) && isSalaryRow(row));
    const salaryBaseRows = salaryRows.length ? salaryRows : yearRows.filter(isIncome);
    const salaryBase = sum(salaryBaseRows.map((row) => Math.abs(row.amount)));

    setText("#avgMonthlyExpense", formatCurrency(monthlyExpense));
    setText("#avgMonthlyIncome", formatCurrency(monthlyIncome));
    setText("#avgSalary14", formatCurrency(salaryBase / 14));
    setText("#avgMonthlyExpenseDetail", `${monthCount} mesi ${period.year}`);
    setText("#avgMonthlyIncomeDetail", `${monthCount} mesi ${period.year}`);
    setText("#avgSalary14Detail", salaryRows.length ? "stipendio / 14" : "entrate / 14");
  }

  function renderWealth(accounts, investments, asset) {
    const period = selectedPeriod();
    const previous = previousPeriod(period);
    const previousAsset = periodRows(state.monthlyAssets, previous)[0] || null;
    const accountTotal = asset ? asset.accounts_total : sum(accounts.map((row) => row.amount));
    const investmentTotal = asset ? asset.investments_total : sum(investments.map((row) => row.amount));
    const total = asset ? asset.total_assets : accountTotal + investmentTotal;
    const previousAccountTotal = previousAsset ? previousAsset.accounts_total : sum(periodRows(state.accountBalances, previous).map((row) => row.amount));
    const previousInvestmentTotal = previousAsset ? previousAsset.investments_total : sum(periodRows(state.investmentHoldings, previous).map((row) => row.amount));
    const previousTotal = previousAsset ? previousAsset.total_assets : previousAccountTotal + previousInvestmentTotal;
    const performanceEur = sum(investments.map((row) => row.performance_eur || 0));
    const investedCost = investmentTotal - performanceEur;
    setText("#assetTotal", formatCurrency(total));
    setText("#accountsTotal", formatCurrency(accountTotal));
    setText("#investmentsTotal", formatCurrency(investmentTotal));
    setText("#investmentsReturn", `${formatCurrency(performanceEur)} · ${investedCost ? formatPercent(performanceEur / investedCost) : "n.d."}`);
    setDelta("#assetDelta", total, previousTotal);
    setDelta("#accountsDelta", accountTotal, previousAccountTotal);
    setDelta("#investmentsDelta", investmentTotal, previousInvestmentTotal);
    setDelta("#investmentsReturnDelta", performanceEur, 0, { absoluteOnly: true });
    renderMiniRows("#accountsList", accounts.slice().sort((a, b) => b.amount - a.amount).map((row) => ({
      label: row.account,
      value: row.amount,
      delta: deltaForValue(row.amount, findPreviousNamedValue(state.accountBalances, previous, "account", row.account))
    })));
    renderMiniRows("#investmentsList", investments.slice().sort((a, b) => b.amount - a.amount).map((row) => ({
      label: row.investment,
      value: row.amount,
      delta: deltaForValue(row.amount, findPreviousNamedValue(state.investmentHoldings, previous, "investment", row.investment))
    })));
    renderLineChart("#assetTrendChart", assetTrendPoints("total"), { color: cssVar("--blue"), currency: true });
  }

  function renderDashboards(transactions, accounts, investments, asset) {
    const assetMode = els.assetModeFilter.value || "total";
    const selectedInvestment = els.investmentFilter.value || "all";
    const period = selectedPeriod();
    const previous = previousPeriod(period);
    const previousAsset = periodRows(state.monthlyAssets, previous)[0] || null;
    const accountsTotal = asset ? asset.accounts_total : sum(accounts.map((row) => row.amount));
    const investmentsTotal = asset ? asset.investments_total : sum(investments.map((row) => row.amount));
    const currentWealthTotal = accountsTotal + investmentsTotal;
    const previousWealthTotal = previousAsset ? previousAsset.accounts_total + previousAsset.investments_total : 0;
    const currentAccountsShare = currentWealthTotal ? accountsTotal / currentWealthTotal : null;
    const currentInvestmentsShare = currentWealthTotal ? investmentsTotal / currentWealthTotal : null;
    const previousAccountsShare = previousWealthTotal ? previousAsset.accounts_total / previousWealthTotal : null;
    const previousInvestmentsShare = previousWealthTotal ? previousAsset.investments_total / previousWealthTotal : null;
    renderLineChart("#dashboardAssetTrend", assetTrendPoints("total"), {
      color: cssVar("--blue"),
      currency: true,
      large: true,
      legend: true,
      seriesLabel: "Totale",
      extraSeries: [
        { label: "Conti", points: assetTrendPoints("accounts"), color: cssVar("--teal"), strokeWidth: assetMode === "accounts" ? 2.7 : 2, opacity: assetMode === "accounts" ? 0.88 : 0.48 },
        { label: "Investimenti", points: assetTrendPoints("investments"), color: cssVar("--amber"), strokeWidth: assetMode === "investments" ? 2.7 : 2, opacity: assetMode === "investments" ? 0.88 : 0.48 }
      ]
    });
    renderDonutChart("#wealthPieChart", [
      { label: "Conti", value: accountsTotal, shareDelta: shareDelta(currentAccountsShare, previousAccountsShare) },
      { label: "Investimenti", value: investmentsTotal, shareDelta: shareDelta(currentInvestmentsShare, previousInvestmentsShare) }
    ]);
    renderCategoryBars("#categoryChart", categoryTotals(transactions).map(withCategoryAverageDelta), 10, { deltaLabel: "med.", lowerIsGood: true, deltaAmountOnly: true, roundedDelta: true });
    renderDonutChart("#categoryPieChart", categoryTotals(transactions).slice(0, 7).map(withCategoryPreviousShareDelta));
    renderGroupedMonthlyChart("#monthlyChart");
    renderDailyChart(transactions, selectedPeriod());
    renderValueBars("#accountsBarChart", accounts.map((row) => ({
      label: row.account,
      value: row.amount,
      kind: "account",
      delta: deltaForValue(row.amount, findPreviousNamedValue(state.accountBalances, previous, "account", row.account))
    })), 10);
    renderValueBars("#investmentsBarChart", investments.map((row) => ({
      label: row.investment,
      value: row.amount,
      kind: "investment",
      delta: deltaForValue(row.amount, findPreviousNamedValue(state.investmentHoldings, previous, "investment", row.investment))
    })), 10);
    renderInvestmentTrend(selectedInvestment);
    renderTransactionRows("#topExpenses", transactions.filter(isExpense).slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 8));
    renderChartDetail();
  }

  function renderYearView() {
    const period = selectedPeriod();
    const year = period ? period.year : latestPeriod()?.year;
    if (!year) {
      setHtml("#yearSummary", emptyMessage());
      setHtml("#yearMonthlyBars", emptyMessage());
      setHtml("#yearCategories", emptyMessage());
      setHtml("#yearAssetTable", emptyMessage());
      return;
    }

    setText("#yearTitle", String(year));
    const tx = state.transactions.filter((row) => row.year === year);
    const expense = sum(tx.filter(isExpense).map((row) => Math.abs(row.amount)));
    const income = sum(tx.filter(isIncome).map((row) => Math.abs(row.amount)));
    const assets = state.monthlyAssets.filter((row) => row.year === year).sort(sortByPeriod);
    const firstAssetRow = assets[0] || null;
    const firstAsset = firstAssetRow?.total_assets || 0;
    const lastAsset = assets[assets.length - 1]?.total_assets || 0;

    const annualBalance = income - expense;
    const assetDelta = lastAsset - firstAsset;
    setHtml("#yearSummary", [
      ["Spese anno", formatCurrency(expense), ""],
      ["Entrate anno", formatCurrency(income), ""],
      ["Bilancio anno", formatCurrency(annualBalance), income ? `${formatPercent(annualBalance / income)} su entrate` : "n.d."],
      ["Patrimonio attuale", formatCurrency(lastAsset), firstAsset ? `${formatPercent(lastAsset / firstAsset - 1)} da inizio anno` : "n.d."],
      ["Variazione patrimonio", formatCurrency(assetDelta), firstAsset ? `${formatPercent(assetDelta / firstAsset)} da ${MONTHS[firstAssetRow.month - 1]} ${firstAssetRow.year}` : "n.d.", assetDelta]
    ].map(([label, value, detail, trend]) => {
      const trendPrefix = trend === undefined ? "" : `${trendArrow(trend)} `;
      const trendColor = trend === undefined ? "neutral" : trendClass(trend);
      return `<article><span>${label}</span><strong>${value}</strong>${detail ? `<small class="${trendColor}">${trendPrefix}${detail}</small>` : ""}</article>`;
    }).join(""));

    const monthRows = MONTHS.map((label, index) => {
      const month = index + 1;
      const rows = tx.filter((row) => row.month === month);
      return {
        label,
        expense: sum(rows.filter(isExpense).map((row) => Math.abs(row.amount))),
        income: sum(rows.filter(isIncome).map((row) => Math.abs(row.amount)))
      };
    });
    renderGroupedBars("#yearMonthlyBars", monthRows);
    const annualCategories = categoryTotals(tx).map((row) => ({ ...row, share: expense ? row.total / expense : null }));
    renderCategoryBars("#yearCategories", annualCategories, 12, { showShare: true });
    setHtml("#yearAssetTable", assets.map((row, index) => {
      const prev = assets[index - 1];
      const delta = deltaForValue(row.total_assets, prev ? prev.total_assets : null);
      return `
      <div class="table-row">
        <span>${MONTHS[row.month - 1]} ${row.year}</span>
        <strong>${formatCurrency(row.total_assets)}</strong>
        <small>Conti ${formatCurrency(row.accounts_total)} · Inv. ${formatCurrency(row.investments_total)}</small>
        <small class="asset-month-delta"><b class="${trendClass(delta.amount)}">${trendArrow(delta.amount)} ${formatDelta(delta)}</b></small>
      </div>
    `;
    }).join("") || emptyMessage());
  }

  function renderFilterOptions() {
    const years = uniqueSorted([...allPeriodRows().map((row) => row.year)].filter(Boolean));
    setOptions(els.yearFilter, [["latest", "Ultimo"], ...years.map((year) => [String(year), String(year)])], filters.year);
    setOptions(els.monthFilter, [["latest", "Ultimo"], ...MONTHS.map((label, index) => [String(index + 1), label])], filters.month);
    setOptions(els.categoryFilter, [["", "Tutte"], ...state.categories.map((name) => [name, name])], filters.category);
    setOptions(els.accountFilter, [["", "Tutti"], ...state.accounts.map((name) => [name, name])], filters.account);
  }

  function renderFormOptions() {
    setOptions(document.querySelector("#transactionCategory"), state.categories.map((name) => [name, name]), state.categories[0] || "");
    setOptions(document.querySelector("#balanceAccount"), state.accounts.map((name) => [name, name]), state.accounts[0] || "");
    setOptions(document.querySelector("#holdingInvestment"), state.investments.map((name) => [name, name]), state.investments[0] || "");
    setOptions(els.investmentFilter, [["all", "Tutti"], ...state.investments.map((name) => [name, name])], els.investmentFilter.value || "all");
    setDefaultMonthInputs();
  }

  function renderManageView(period) {
    const current = period || latestPeriod();
    const latestTransactions = filteredTransactions(current).slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 12);
    const latestInvestments = state.investmentHoldings.slice().sort((a, b) => b.year - a.year || b.month - a.month).slice(0, 8);
    const latestAccounts = state.accountBalances.slice().sort((a, b) => b.year - a.year || b.month - a.month).slice(0, 8);
    renderEditableRows("#transactionManageList", latestTransactions.map((row) => ({
      id: row.transaction_id,
      action: "transaction",
      label: row.description || row.category,
      value: row.amount,
      detail: `${formatDate(row.date)} · ${row.type === "income" ? "Guadagno" : "Spesa"} · ${row.category}`
    })));
    renderEditableRows("#investmentHistoryList", latestInvestments.map((row) => ({
      id: row.snapshot_id,
      action: "investment",
      label: `${row.investment} · ${MONTHS[row.month - 1]} ${row.year}`,
      value: row.amount,
      detail: `Delta ${formatDelta(deltaForValue(row.amount, findPreviousNamedValue(state.investmentHoldings, previousPeriod(row), "investment", row.investment)))}`
    })));
    renderEditableRows("#accountHistoryList", latestAccounts.map((row) => ({
      id: row.snapshot_id,
      action: "account",
      label: `${row.account} · ${MONTHS[row.month - 1]} ${row.year}`,
      value: row.amount,
      detail: `Delta ${formatDelta(deltaForValue(row.amount, findPreviousNamedValue(state.accountBalances, previousPeriod(row), "account", row.account)))}`
    })));
    setHtml("#categoryChips", state.categories.map((name) => editableChip("category", name, name)).join("") || emptyMessage());
    setHtml("#masterDataList", [
      ...state.accounts.map((name) => editableChip("account-name", name, `Conto · ${name}`)),
      ...state.investments.map((name) => editableChip("investment-name", name, `Inv. · ${name}`))
    ].join("") || emptyMessage());
    if (current) {
      document.querySelectorAll('input[name="month_start"]').forEach((input) => {
        if (!input.value) input.value = `${current.year}-${String(current.month).padStart(2, "0")}`;
      });
      const dateInput = document.querySelector('#transactionForm input[name="date"]');
      if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
    }
  }

  function renderEditableRows(selector, rows) {
    setHtml(selector, rows.map((row) => `
      <article class="editable-row" data-row-edit="${escapeHtml(row.action)}" data-id="${escapeHtml(row.id)}" tabindex="0" role="button" aria-label="Modifica ${escapeHtml(row.label)}">
        <div>
          <strong>${escapeHtml(row.label)}</strong>
          <span>${escapeHtml(row.detail)}</span>
        </div>
        <b class="${row.value >= 0 ? "positive" : "negative"}">${formatCurrency(row.value)}</b>
        <nav aria-label="Azioni">
          <button class="icon-action danger" type="button" data-action="delete-${row.action}" data-id="${escapeHtml(row.id)}" aria-label="Elimina ${escapeHtml(row.label)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"></path><path d="M9 7V5h6v2"></path><path d="m8 10 .6 9h6.8l.6-9"></path></svg>
            <span>Elimina</span>
          </button>
        </nav>
      </article>
    `).join("") || emptyMessage());
  }

  function editableChip(action, id, label) {
    return `
      <span>
        ${escapeHtml(label)}
        <button type="button" data-action="edit-${action}" data-id="${escapeHtml(id)}" aria-label="Modifica ${escapeHtml(label)}">Modifica</button>
        <button type="button" data-action="delete-${action}" data-id="${escapeHtml(id)}" aria-label="Elimina ${escapeHtml(label)}">Elimina</button>
      </span>
    `;
  }

  function withCategoryAverageDelta(row) {
    const average = categoryAverageMap(selectedPeriod()).get(row.category) || 0;
    return {
      ...row,
      delta: deltaForValue(row.total, average),
      deltaTrendValue: average ? average - row.total : -row.total
    };
  }

  function withCategoryPreviousShareDelta(row) {
    const period = selectedPeriod();
    const previous = previousPeriod(period);
    const currentRows = filteredTransactions(period).filter(isExpense);
    const previousRows = filteredTransactions(previous).filter(isExpense);
    const currentTotal = sum(currentRows.map((item) => Math.abs(item.amount)));
    const previousTotal = sum(previousRows.map((item) => Math.abs(item.amount)));
    const previousCategoryTotal = sum(previousRows.filter((item) => item.category === row.category).map((item) => Math.abs(item.amount)));
    const currentShare = currentTotal ? row.total / currentTotal : null;
    const previousShare = previousTotal ? previousCategoryTotal / previousTotal : null;
    const delta = shareDelta(currentShare, previousShare);
    return {
      label: row.category,
      value: row.total,
      category: row.category,
      shareDelta: delta,
      shareDeltaTrendValue: delta.hasPrevious ? -delta.amount : 0
    };
  }

  function renderCategoryBars(selector, rows, limit, options = {}) {
    renderValueBars(selector, rows.map((row) => ({
      label: row.category,
      value: row.total,
      kind: "category",
      category: row.category,
      share: row.share,
      delta: row.delta,
      deltaTrendValue: row.deltaTrendValue
    })), limit, options);
  }

  function renderValueBars(selector, rows, limit, options = {}) {
    const filtered = rows.filter((row) => row.value > 0).sort((a, b) => b.value - a.value).slice(0, limit);
    const max = filtered[0]?.value || 1;
    setHtml(selector, filtered.map((row, index) => `
      <div class="bar-row">
        <strong>${escapeHtml(row.label)}</strong>
        <span>${formatCurrency(row.value)}${options.showShare && row.share !== null ? ` · ${formatPercent(row.share)}` : ""}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (row.value / max) * 100)}%;background:${COLORS[index % COLORS.length]}"></div></div>
        ${row.delta ? `<small class="${trendClass(row.deltaTrendValue ?? row.delta.amount)}">${trendArrow(row.delta.amount)} ${formatDelta(row.delta, options)}${options.deltaLabel ? ` ${escapeHtml(options.deltaLabel)}` : ""}</small>` : ""}
      </div>
    `).join("") || emptyMessage());
  }

  function renderDonutChart(selector, rows) {
    const values = rows.filter((row) => row.value > 0);
    if (!values.length) return setHtml(selector, emptyMessage());
    const total = sum(values.map((row) => row.value));
    let offset = 25;
    const circles = values.map((row, index) => {
      const dash = (row.value / total) * 100;
      const circle = `<circle class="donut-segment chart-control" r="15.9" cx="18" cy="18" fill="transparent" stroke="${COLORS[index % COLORS.length]}" stroke-width="6.4" stroke-dasharray="${dash} ${100 - dash}" stroke-dashoffset="${offset}" data-chart-kind="${escapeHtml(row.category ? "category" : "slice")}" data-label="${escapeHtml(row.label)}" data-value="${row.value}" data-category="${escapeHtml(row.category || row.label)}"><title>${escapeHtml(row.label)}: ${formatCurrency(row.value)} · ${formatPercent(row.value / total)}</title></circle>`;
      offset -= dash;
      return circle;
    }).join("");
    setHtml(selector, `
      <div class="donut-card">
        <svg viewBox="-3 -3 42 42">${circles}<circle class="donut-center" r="9.6" cx="18" cy="18"></circle></svg>
        <div class="donut-legend">
          ${values.map((row, index) => {
            const deltaText = row.shareDelta && row.shareDelta.hasPrevious
              ? `<small class="${trendClass(row.shareDeltaTrendValue ?? row.shareDelta.amount)}">${trendArrow(row.shareDelta.amount)} ${formatPercentagePoints(row.shareDelta.amount)}</small>`
              : row.delta && row.delta.hasPrevious && row.delta.pct !== null
                ? `<small class="${trendClass(row.delta.amount)}">${trendArrow(row.delta.amount)} ${formatPercent(row.delta.pct)}</small>`
              : `<small class="neutral">m/m n.d.</small>`;
            return `<div><i style="background:${COLORS[index % COLORS.length]}"></i><span>${escapeHtml(row.label)}</span><strong>${formatPercent(row.value / total)}${deltaText}</strong></div>`;
          }).join("")}
        </div>
      </div>
    `);
  }

  function renderLineChart(selector, points, options = {}) {
    const element = document.querySelector(selector);
    if (!points.length) return setHtml(selector, emptyMessage());
    const width = 420;
    const height = options.large ? 272 : 222;
    const pad = { top: 18, right: 22, bottom: 42, left: 58 };
    const extraSeries = options.extraSeries || [];
    const allValues = [points, ...extraSeries.map((series) => series.points || [])].flat().map((point) => point.value);
    const max = Math.max(...allValues, 1);
    const min = Math.min(...allValues, 0);
    const span = Math.max(max - min, 1);
    const yTicks = [max, min + span / 2, min];
    const coordsFor = (seriesPoints) => seriesPoints.map((point, index) => {
      const x = pad.left + (index * (width - pad.left - pad.right)) / Math.max(seriesPoints.length - 1, 1);
      const y = height - pad.bottom - ((point.value - min) * (height - pad.top - pad.bottom)) / span;
      return { x, y, point };
    });
    const coords = coordsFor(points);
    const line = coords.map((item) => `${item.x},${item.y}`).join(" ");
    const area = `${pad.left},${height - pad.bottom} ${line} ${width - pad.right},${height - pad.bottom}`;
    const seriesMarkup = extraSeries.map((series) => {
      const seriesCoords = coordsFor(series.points || []);
      const seriesLine = seriesCoords.map((item) => `${item.x},${item.y}`).join(" ");
      const color = series.color || COLORS[1];
      return `
        <polyline points="${seriesLine}" fill="none" stroke="${color}" stroke-width="${series.strokeWidth || 2}" stroke-linecap="round" stroke-linejoin="round" opacity="${series.opacity || 0.55}"></polyline>
        ${seriesCoords.map((item) => `
          <circle class="chart-hit chart-control" cx="${item.x}" cy="${item.y}" r="12" fill="transparent" data-chart-kind="point" data-label="${escapeHtml(series.label + " · " + item.point.label)}" data-value="${item.point.value}"></circle>
          <circle class="chart-point chart-control" cx="${item.x}" cy="${item.y}" r="3.2" fill="${color}" opacity="0.75" data-chart-kind="point" data-label="${escapeHtml(series.label + " · " + item.point.label)}" data-value="${item.point.value}"><title>${escapeHtml(series.label)} ${item.point.label}: ${options.currency ? formatCurrency(item.point.value) : item.point.value}</title></circle>
        `).join("")}
      `;
    }).join("");
    const legendMarkup = options.legend ? `
      <div class="chart-legend">
        <span><i style="background:${options.color || COLORS[0]}"></i>${escapeHtml(options.seriesLabel || "Totale")}</span>
        ${extraSeries.map((series) => `<span class="muted"><i style="background:${series.color || COLORS[1]}"></i>${escapeHtml(series.label)}</span>`).join("")}
      </div>
    ` : "";
    element.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img">
        ${yTicks.map((tick) => {
          const y = height - pad.bottom - ((tick - min) * (height - pad.top - pad.bottom)) / span;
          return `
            <line x1="${pad.left}" x2="${width - pad.right}" y1="${y}" y2="${y}" class="grid-line"></line>
            <text class="axis-label axis-label-y" x="${pad.left - 7}" y="${y + 4}" text-anchor="end">${escapeHtml(shortCurrency(tick))}</text>
          `;
        }).join("")}
        <polygon points="${area}" fill="${options.color || COLORS[0]}" opacity="0.12"></polygon>
        ${seriesMarkup}
        <polyline points="${line}" fill="none" stroke="${options.color || COLORS[0]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
        ${coords.map((item) => `
          <circle class="chart-hit chart-control" cx="${item.x}" cy="${item.y}" r="17" fill="transparent" data-chart-kind="point" data-label="${escapeHtml(item.point.label)}" data-value="${item.point.value}"></circle>
          <circle class="chart-point chart-control" cx="${item.x}" cy="${item.y}" r="5" fill="${options.color || COLORS[0]}" data-chart-kind="point" data-label="${escapeHtml(item.point.label)}" data-value="${item.point.value}"><title>${item.point.label}: ${options.currency ? formatCurrency(item.point.value) : item.point.value}</title></circle>
        `).join("")}
        ${coords.map((item, index) => index % Math.ceil(points.length / 6) === 0 || index === coords.length - 1 ? `<text class="axis-label" x="${item.x}" y="${height - 14}" text-anchor="middle">${escapeHtml(item.point.label)}</text>` : "").join("")}
      </svg>
      ${legendMarkup}
    `;
  }

  function renderGroupedMonthlyChart(selector) {
    const rows = lastTwelveMonths().map((period) => {
      const tx = state.transactions.filter((row) => row.year === period.year && row.month === period.month && transactionMatchesDimensions(row));
      return {
        label: `${MONTHS[period.month - 1]} ${String(period.year).slice(-2)}`,
        expense: sum(tx.filter(isExpense).map((row) => Math.abs(row.amount))),
        income: sum(tx.filter(isIncome).map((row) => Math.abs(row.amount)))
      };
    });
    renderGroupedBars(selector, rows);
  }

  function renderGroupedBars(selector, rows) {
    const width = 420;
    const height = 240;
    const pad = { top: 18, right: 20, bottom: 42, left: 54 };
    const max = Math.max(...rows.flatMap((row) => [row.expense, row.income]), 1);
    const slot = (width - pad.left - pad.right) / Math.max(rows.length, 1);
    const bar = Math.max(4, slot / 3);
    setHtml(selector, `
      <svg viewBox="0 0 ${width} ${height}" role="img">
        ${[max, max / 2, 0].map((tick) => {
          const y = height - pad.bottom - (tick / max) * (height - pad.top - pad.bottom);
          return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y}" y2="${y}" class="grid-line"></line><text class="axis-label axis-label-y" x="${pad.left - 7}" y="${y + 4}" text-anchor="end">${escapeHtml(shortCurrency(tick))}</text>`;
        }).join("")}
        ${rows.map((row, index) => {
          const x = pad.left + index * slot + slot / 2 - bar;
          const expenseH = (row.expense / max) * (height - pad.top - pad.bottom);
          const incomeH = (row.income / max) * (height - pad.top - pad.bottom);
          return `
            <rect class="chart-bar chart-control" x="${x}" y="${height - pad.bottom - expenseH}" width="${bar}" height="${expenseH}" rx="3" fill="${cssVar("--rust") || "#dc2626"}" data-chart-kind="month-expense" data-label="${escapeHtml(row.label)}" data-value="${row.expense}"><title>${row.label} spese: ${formatCurrency(row.expense)}</title></rect>
            <rect class="chart-bar chart-control" x="${x + bar + 2}" y="${height - pad.bottom - incomeH}" width="${bar}" height="${incomeH}" rx="3" fill="${cssVar("--teal") || "#0d9488"}" data-chart-kind="month-income" data-label="${escapeHtml(row.label)}" data-value="${row.income}"><title>${row.label} entrate: ${formatCurrency(row.income)}</title></rect>
          `;
        }).join("")}
        ${rows.map((row, index) => index % Math.ceil(rows.length / 6) === 0 || index === rows.length - 1 ? `<text class="axis-label" x="${pad.left + index * slot + slot / 2}" y="${height - 14}" text-anchor="middle">${escapeHtml(row.label)}</text>` : "").join("")}
      </svg>
      <div class="legend"><span><i style="background:${cssVar("--rust")}"></i>Spese</span><span><i style="background:${cssVar("--teal")}"></i>Entrate</span></div>
    `);
  }

  function renderDailyChart(transactions, period) {
    if (!period) return setHtml("#dailyChart", emptyMessage());
    const totals = new Map();
    transactions.filter(isExpense).forEach((row) => {
      if (!row.date) return;
      const day = Number(row.date.slice(8, 10));
      totals.set(day, (totals.get(day) || 0) + Math.abs(row.amount));
    });
    const points = Array.from({ length: daysInMonth(period.year, period.month) }, (_, index) => ({
      label: String(index + 1),
      value: totals.get(index + 1) || 0
    }));
    renderSimpleBars("#dailyChart", points, cssVar("--rust") || "#dc2626");
  }

  function renderSimpleBars(selector, points, color) {
    const width = 420;
    const height = 210;
    const pad = { top: 16, right: 18, bottom: 36, left: 48 };
    const max = Math.max(...points.map((point) => point.value), 1);
    const slot = (width - pad.left - pad.right) / Math.max(points.length, 1);
    const bar = Math.max(3, slot - 2);
    setHtml(selector, `
      <svg viewBox="0 0 ${width} ${height}" role="img">
        ${[max, max / 2, 0].map((tick) => {
          const y = height - pad.bottom - (tick / max) * (height - pad.top - pad.bottom);
          return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y}" y2="${y}" class="grid-line"></line><text class="axis-label axis-label-y" x="${pad.left - 7}" y="${y + 4}" text-anchor="end">${escapeHtml(shortCurrency(tick))}</text>`;
        }).join("")}
        ${points.map((point, index) => {
          const h = (point.value / max) * (height - pad.top - pad.bottom);
          return `<rect class="chart-bar chart-control" x="${pad.left + index * slot}" y="${height - pad.bottom - h}" width="${bar}" height="${h}" rx="3" fill="${color}" data-chart-kind="day" data-label="${escapeHtml(point.label)}" data-value="${point.value}"><title>${point.label}: ${formatCurrency(point.value)}</title></rect>`;
        }).join("")}
        <text class="axis-label" x="${pad.left}" y="${height - 10}">1</text>
        <text class="axis-label" x="${width - pad.right}" y="${height - 10}" text-anchor="end">${points.length}</text>
      </svg>
    `);
  }

  function renderInvestmentTrend(selectedInvestment) {
    const rows = state.investmentHoldings
      .filter((row) => selectedInvestment === "all" || row.investment === selectedInvestment)
      .filter((row) => row.year && row.month)
      .sort(sortByPeriod);
    const grouped = new Map();
    rows.forEach((row) => {
      const key = `${row.year}-${String(row.month).padStart(2, "0")}`;
      grouped.set(key, (grouped.get(key) || 0) + row.amount);
    });
    const points = Array.from(grouped.entries()).map(([key, value]) => {
      const [year, month] = key.split("-").map(Number);
      return { label: `${MONTHS[month - 1]} ${String(year).slice(-2)}`, value };
    });
    renderLineChart("#investmentTrendChart", points, { color: cssVar("--teal"), currency: true, large: true });
  }

  function renderTransactions(transactions) {
    renderTransactionRows("#transactionsList", transactions.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 30));
  }

  function renderTransactionRows(selector, rows) {
    setHtml(selector, rows.map((row) => `
      <article class="transaction-row">
        <div>
          <strong>${escapeHtml(row.description || row.category)}</strong>
          <span>${formatDate(row.date)} · ${escapeHtml(row.category)}${row.account ? " · " + escapeHtml(row.account) : ""}</span>
        </div>
        <b class="${row.amount >= 0 ? "positive" : "negative"}">${formatCurrency(row.amount)}</b>
      </article>
    `).join("") || emptyMessage());
  }

  function renderMiniRows(selector, rows) {
    setHtml(selector, rows.map((row) => {
      const label = Array.isArray(row) ? row[0] : row.label;
      const value = Array.isArray(row) ? row[1] : formatCurrency(row.value);
      const delta = !Array.isArray(row) && row.delta ? `<small class="${trendClass(row.delta.amount)}">${trendArrow(row.delta.amount)} ${formatDelta(row.delta)}</small>` : "";
      return `<div class="mini-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${delta}</div>`;
    }).join("") || emptyMessage());
  }

  function addTransaction(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    let amount = parseAmount(data.amount);
    if (amount === null) return alert("Importo non valido.");
    if (data.type === "expense" && amount > 0) amount = -amount;
    if (data.type === "income" && amount < 0) amount = Math.abs(amount);
    const date = parseDate(data.date);
    if (!date) return alert("Data non valida.");
    state.transactions.push(normalizeTransaction({
      transaction_id: makeId("tx"),
      date,
      description: data.description,
      category: data.category,
      amount,
      account: "",
      type: data.type,
      month: Number(date.slice(5, 7)),
      year: Number(date.slice(0, 4))
    }));
    state = normalizeState(state);
    saveState();
    event.currentTarget.reset();
    render();
  }

  function addAccountBalance(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const [year, month] = String(data.month_start).split("-").map(Number);
    const row = normalizeAccountBalance({ snapshot_id: makeId("account"), month_start: monthStart(year, month), month, year, account: data.account, amount: data.amount });
    if (!row) return alert("Saldo conto non valido.");
    upsertByPeriodName(state.accountBalances, row, "account");
    recalcMonthlyAsset(year, month);
    state = normalizeState(state);
    saveState();
    event.currentTarget.reset();
    render();
  }

  function addInvestmentHolding(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const [year, month] = String(data.month_start).split("-").map(Number);
    const row = normalizeInvestmentHolding({
      snapshot_id: makeId("investment"),
      month_start: monthStart(year, month),
      month,
      year,
      investment: data.investment,
      amount: data.amount,
      performance_pct: data.performance_pct,
      performance_eur: data.performance_eur
    });
    if (!row) return alert("Investimento non valido.");
    upsertByPeriodName(state.investmentHoldings, row, "investment");
    recalcMonthlyAsset(year, month);
    state = normalizeState(state);
    saveState();
    event.currentTarget.reset();
    render();
  }

  function addMasterData(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const name = String(data.name || "").trim();
    const kind = String(data.kind);
    if (!name || !state[kind]) return;
    state[kind] = uniqueSorted([...state[kind], name]);
    saveState();
    event.currentTarget.reset();
    render();
  }

  function addCategory(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const name = String(data.name || "").trim();
    if (!name) return;
    state.categories = uniqueSorted([...state.categories, name]);
    saveState();
    event.currentTarget.reset();
    render();
  }

  function handleChartClick(event) {
    const target = event.target.closest(".chart-control");
    if (!target) return;
    chartSelection = {
      kind: target.dataset.chartKind || "value",
      label: target.dataset.label || "",
      value: parseAmount(target.dataset.value) || 0,
      category: target.dataset.category || ""
    };
    document.querySelectorAll(".chart-control.selected").forEach((item) => item.classList.remove("selected"));
    target.classList.add("selected", "pulse-once");
    window.setTimeout(() => target.classList.remove("pulse-once"), 520);
    showFloatingChartTooltip();
    renderChartDetail();
  }

  function showFloatingChartTooltip() {
    if (!els.floatingChartTooltip || !chartSelection) return;
    els.floatingChartTooltip.innerHTML = `
      <span>${escapeHtml(chartLabel(chartSelection.kind))} · ${escapeHtml(chartSelection.label)}</span>
      <strong>${formatCurrency(chartSelection.value)}</strong>
    `;
    els.floatingChartTooltip.classList.remove("hidden");
    window.clearTimeout(showFloatingChartTooltip.timer);
    showFloatingChartTooltip.timer = window.setTimeout(() => {
      els.floatingChartTooltip.classList.add("hidden");
    }, 3600);
  }

  function handleDataActionClick(event) {
    const button = event.target.closest("[data-action]");
    if (button && !button.classList.contains("chart-control")) {
      const action = button.dataset.action;
      const id = button.dataset.id || "";
      if (!action) return;
      if (action === "edit-transaction") return openEditSheet("transaction", id);
      if (action === "delete-transaction") return deleteById("transactions", "transaction_id", id, "movimento");
      if (action === "edit-account") return openEditSheet("account", id);
      if (action === "delete-account") return deleteSnapshot("accountBalances", id, "saldo conto");
      if (action === "edit-investment") return openEditSheet("investment", id);
      if (action === "delete-investment") return deleteSnapshot("investmentHoldings", id, "investimento");
      if (action === "edit-category") return openEditSheet("category", id);
      if (action === "delete-category") return deleteListValue("categories", id, "categoria");
      if (action === "edit-account-name") return openEditSheet("account-name", id);
      if (action === "delete-account-name") return deleteListValue("accounts", id, "conto");
      if (action === "edit-investment-name") return openEditSheet("investment-name", id);
      if (action === "delete-investment-name") return deleteListValue("investments", id, "investimento");
      return;
    }
    const row = event.target.closest("[data-row-edit]");
    if (row) openEditSheet(row.dataset.rowEdit, row.dataset.id || "");
  }

  function handleEditableRowKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("[data-action]")) return;
    const row = event.target.closest("[data-row-edit]");
    if (!row) return;
    event.preventDefault();
    openEditSheet(row.dataset.rowEdit, row.dataset.id || "");
  }

  function openEditSheet(kind, id) {
    const config = editConfig(kind, id);
    if (!config) return;
    els.editTitle.textContent = config.title;
    els.editFields.innerHTML = `
      <input type="hidden" name="kind" value="${escapeHtml(kind)}" />
      <input type="hidden" name="id" value="${escapeHtml(id)}" />
      ${config.fields.map(renderEditField).join("")}
    `;
    els.editSheet.classList.remove("hidden");
    document.body.classList.add("sheet-open");
    const firstInput = els.editFields.querySelector("input, select");
    if (firstInput) window.setTimeout(() => firstInput.focus({ preventScroll: true }), 80);
  }

  function closeEditSheet() {
    els.editSheet.classList.add("hidden");
    document.body.classList.remove("sheet-open");
    els.editForm.reset();
    els.editFields.innerHTML = "";
  }

  function editConfig(kind, id) {
    if (kind === "transaction") {
      const row = state.transactions.find((item) => item.transaction_id === id);
      if (!row) return null;
      return {
        title: "Movimento",
        fields: [
          { type: "date", name: "date", label: "Data", value: row.date, required: true },
          { type: "select", name: "type", label: "Tipo", value: row.type, options: [["expense", "Spesa"], ["income", "Guadagno"]] },
          { type: "text", name: "amount", label: "Importo", value: String(Math.abs(row.amount)).replace(".", ","), inputmode: "decimal", required: true },
          { type: "select", name: "category", label: "Categoria", value: row.category, options: optionPairs(uniqueSorted([...state.categories, row.category])) },
          { type: "text", name: "description", label: "Descrizione", value: row.description }
        ]
      };
    }
    if (kind === "account") {
      const row = state.accountBalances.find((item) => item.snapshot_id === id);
      if (!row) return null;
      return {
        title: "Saldo conto",
        fields: [
          { type: "month", name: "month_start", label: "Mese", value: `${row.year}-${String(row.month).padStart(2, "0")}`, required: true },
          { type: "select", name: "account", label: "Conto", value: row.account, options: optionPairs(uniqueSorted([...state.accounts, row.account])) },
          { type: "text", name: "amount", label: "Importo", value: String(row.amount).replace(".", ","), inputmode: "decimal", required: true }
        ]
      };
    }
    if (kind === "investment") {
      const row = state.investmentHoldings.find((item) => item.snapshot_id === id);
      if (!row) return null;
      return {
        title: "Investimento o fondo",
        fields: [
          { type: "month", name: "month_start", label: "Mese", value: `${row.year}-${String(row.month).padStart(2, "0")}`, required: true },
          { type: "select", name: "investment", label: "Investimento", value: row.investment, options: optionPairs(uniqueSorted([...state.investments, row.investment])) },
          { type: "text", name: "amount", label: "Valore", value: String(row.amount).replace(".", ","), inputmode: "decimal", required: true },
          { type: "text", name: "performance_pct", label: "Rendimento %", value: row.performance_pct === null ? "" : String(row.performance_pct * 100).replace(".", ","), inputmode: "decimal" },
          { type: "text", name: "performance_eur", label: "Rendimento EUR", value: row.performance_eur === null ? "" : String(row.performance_eur).replace(".", ","), inputmode: "decimal" }
        ]
      };
    }
    if (kind === "category") return nameConfig("Categoria", "name", id);
    if (kind === "account-name") return nameConfig("Conto", "name", id);
    if (kind === "investment-name") return nameConfig("Investimento", "name", id);
    return null;
  }

  function nameConfig(title, name, value) {
    return {
      title,
      fields: [{ type: "text", name, label: "Nome", value, required: true }]
    };
  }

  function renderEditField(field) {
    if (field.type === "select") {
      return `
        <label>${escapeHtml(field.label)}
          <select name="${escapeHtml(field.name)}"${field.required ? " required" : ""}>
            ${field.options.map(([value, label]) => `<option value="${escapeHtml(value)}"${value === field.value ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}
          </select>
        </label>
      `;
    }
    return `
      <label>${escapeHtml(field.label)}
        <input name="${escapeHtml(field.name)}" type="${escapeHtml(field.type)}" value="${escapeHtml(field.value || "")}"${field.inputmode ? ` inputmode="${escapeHtml(field.inputmode)}"` : ""}${field.required ? " required" : ""} />
      </label>
    `;
  }

  function saveEditSheet(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const kind = data.kind;
    const id = data.id;
    if (kind === "transaction") updateTransactionFromSheet(id, data);
    if (kind === "account") updateAccountFromSheet(id, data);
    if (kind === "investment") updateInvestmentFromSheet(id, data);
    if (kind === "category") renameListValue("categories", id, "categoria", data.name);
    if (kind === "account-name") renameListValue("accounts", id, "conto", data.name);
    if (kind === "investment-name") renameListValue("investments", id, "investimento", data.name);
  }

  function updateTransactionFromSheet(id, data) {
    const row = state.transactions.find((item) => item.transaction_id === id);
    if (!row) return;
    const date = parseDate(data.date);
    let amount = parseAmount(data.amount);
    if (!date) return alert("Data non valida.");
    if (amount === null) return alert("Importo non valido.");
    amount = data.type === "expense" ? -Math.abs(amount) : Math.abs(amount);
    const updated = normalizeTransaction({
      ...row,
      date,
      type: data.type,
      amount,
      category: data.category,
      description: data.description,
      account: "",
      month: Number(date.slice(5, 7)),
      year: Number(date.slice(0, 4))
    });
    if (!updated) return alert("Movimento non valido.");
    Object.assign(row, updated);
    finishSheetSave();
  }

  function updateAccountFromSheet(id, data) {
    const row = state.accountBalances.find((item) => item.snapshot_id === id);
    if (!row) return;
    const oldPeriod = { year: row.year, month: row.month };
    const period = parseMonthInput(data.month_start);
    if (!period) return alert("Mese non valido.");
    const updated = normalizeAccountBalance({ ...row, month_start: monthStart(period.year, period.month), month: period.month, year: period.year, account: data.account, amount: data.amount });
    if (!updated) return alert("Saldo conto non valido.");
    Object.assign(row, updated);
    recalcMonthlyAsset(oldPeriod.year, oldPeriod.month);
    recalcMonthlyAsset(period.year, period.month);
    finishSheetSave();
  }

  function updateInvestmentFromSheet(id, data) {
    const row = state.investmentHoldings.find((item) => item.snapshot_id === id);
    if (!row) return;
    const oldPeriod = { year: row.year, month: row.month };
    const period = parseMonthInput(data.month_start);
    if (!period) return alert("Mese non valido.");
    const updated = normalizeInvestmentHolding({
      ...row,
      month_start: monthStart(period.year, period.month),
      month: period.month,
      year: period.year,
      investment: data.investment,
      amount: data.amount,
      performance_pct: data.performance_pct,
      performance_eur: data.performance_eur
    });
    if (!updated) return alert("Investimento non valido.");
    Object.assign(row, updated);
    recalcMonthlyAsset(oldPeriod.year, oldPeriod.month);
    recalcMonthlyAsset(period.year, period.month);
    finishSheetSave();
  }

  function finishSheetSave() {
    state = normalizeState(state);
    saveState();
    closeEditSheet();
    render();
  }

  function deleteById(collection, key, id, label) {
    if (!confirm(`Eliminare ${label}?`)) return;
    state[collection] = state[collection].filter((row) => row[key] !== id);
    state = normalizeState(state);
    saveState();
    render();
  }

  function deleteSnapshot(collection, id, label) {
    const row = state[collection].find((item) => item.snapshot_id === id);
    if (!row || !confirm(`Eliminare ${label}?`)) return;
    state[collection] = state[collection].filter((item) => item.snapshot_id !== id);
    recalcMonthlyAsset(row.year, row.month);
    state = normalizeState(state);
    saveState();
    render();
  }

  function renameListValue(collection, oldName, label, providedName) {
    const nextName = providedName;
    if (nextName === null || !nextName.trim()) return;
    const clean = nextName.trim();
    state[collection] = uniqueSorted(state[collection].map((name) => name === oldName ? clean : name));
    if (collection === "categories") {
      state.transactions.forEach((row) => {
        if (row.category === oldName) row.category = clean;
      });
    }
    if (collection === "accounts") {
      state.accountBalances.forEach((row) => {
        if (row.account === oldName) row.account = clean;
      });
    }
    if (collection === "investments") {
      state.investmentHoldings.forEach((row) => {
        if (row.investment === oldName) row.investment = clean;
      });
    }
    state = normalizeState(state);
    saveState();
    closeEditSheet();
    render();
  }

  function deleteListValue(collection, name, label) {
    if (collection === "categories" && state.transactions.some((row) => row.category === name)) {
      alert("Questa categoria e' usata in alcuni movimenti. Rinominala oppure modifica prima quei movimenti.");
      return;
    }
    if (collection === "accounts" && state.accountBalances.some((row) => row.account === name)) {
      alert("Questo conto e' usato nei saldi storici. Rinominalo oppure modifica prima quei saldi.");
      return;
    }
    if (collection === "investments" && state.investmentHoldings.some((row) => row.investment === name)) {
      alert("Questo investimento e' usato nello storico. Rinominalo oppure modifica prima quelle righe.");
      return;
    }
    if (!confirm(`Eliminare ${label} "${name}" dall'elenco? I dati storici non vengono cancellati.`)) return;
    state[collection] = state[collection].filter((item) => item !== name);
    saveState();
    render();
  }

  function renderChartDetail() {
    if (!els.chartDetail) return;
    if (!chartSelection) {
      els.chartDetail.classList.add("hidden");
      els.chartDetail.innerHTML = "";
      return;
    }
    els.chartDetail.classList.remove("hidden");
    const period = selectedPeriod();
    const category = chartSelection.category || (chartSelection.kind === "category" ? chartSelection.label : "");
    const rows = category
      ? filteredTransactions(period).filter((row) => row.category === category && isExpense(row)).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 6)
      : [];
    els.chartDetail.innerHTML = `
      <span class="eyebrow">${escapeHtml(chartLabel(chartSelection.kind))}</span>
      <strong>${escapeHtml(chartSelection.label)} · ${formatCurrency(chartSelection.value)}</strong>
      ${category ? `<p>${rows.length} movimenti principali nella categoria selezionata.</p>` : ""}
      ${rows.length ? `<div class="mini-drilldown">${rows.map((row) => `
        <div><span>${formatDate(row.date)} · ${escapeHtml(row.description || row.category)}</span><b>${formatCurrency(row.amount)}</b></div>
      `).join("")}</div>` : ""}
    `;
  }

  function handleImport(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    actionMenuOpen = false;
    renderActionMenu();
    if (file.name.toLowerCase().endsWith(".numbers")) {
      alert("Il browser non puo' convertire direttamente .numbers. Usa prima il convertitore locale e importa il JSON generato.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = normalizeState(JSON.parse(String(reader.result || "{}")));
        const replace = !state.transactions.length || confirm("Sostituire i dati locali con quelli importati?");
        if (!replace) return;
        state = imported;
        filters = { year: "latest", month: "latest", category: "", account: "" };
        saveState();
        render();
      } catch (error) {
        alert("JSON non valido: " + (error && error.message ? error.message : "errore sconosciuto"));
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  async function maybeAutoloadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const dataUrl = params.get("data");
    const hasLocalData = state.transactions.length || state.accountBalances.length || state.investmentHoldings.length;
    if (!dataUrl || hasLocalData) return;
    try {
      const response = await fetch(dataUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state = normalizeState(await response.json());
      saveState();
      window.history.replaceState({}, "", window.location.pathname);
    } catch (error) {
      console.warn("Autoload dati non riuscito", error);
    }
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spese-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function recalcMonthlyAsset(year, month) {
    const accountsTotal = sum(state.accountBalances.filter((row) => row.year === year && row.month === month).map((row) => row.amount));
    const investmentsTotal = sum(state.investmentHoldings.filter((row) => row.year === year && row.month === month).map((row) => row.amount));
    const row = { snapshot_id: makeId("assets"), month_start: monthStart(year, month), date: "", month, year, accounts_total: accountsTotal, investments_total: investmentsTotal, total_assets: accountsTotal + investmentsTotal };
    const index = state.monthlyAssets.findIndex((asset) => asset.year === year && asset.month === month);
    if (index >= 0) state.monthlyAssets[index] = row;
    else state.monthlyAssets.push(row);
  }

  function upsertByPeriodName(rows, row, nameKey) {
    const index = rows.findIndex((item) => item.year === row.year && item.month === row.month && item[nameKey] === row[nameKey]);
    if (index >= 0) rows[index] = row;
    else rows.push(row);
  }

  function assetTrendPoints(mode) {
    return state.monthlyAssets.filter((row) => row.year && row.month).sort(sortByPeriod).map((row) => ({
      label: `${MONTHS[row.month - 1]} ${String(row.year).slice(-2)}`,
      value: mode === "accounts" ? row.accounts_total : mode === "investments" ? row.investments_total : row.total_assets
    }));
  }

  function lastTwelveMonths() {
    const latest = latestPeriod();
    if (!latest) return [];
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(latest.year, latest.month - 1 - (11 - index), 1);
      return { year: date.getFullYear(), month: date.getMonth() + 1 };
    });
  }

  function selectedPeriod() {
    const latest = latestPeriod();
    if (!latest) return null;
    return {
      year: filters.year === "latest" ? latest.year : Number(filters.year),
      month: filters.month === "latest" ? latest.month : Number(filters.month)
    };
  }

  function latestPeriod() {
    return allPeriodRows().filter((row) => row.year && row.month).map((row) => ({ year: row.year, month: row.month })).sort((a, b) => b.year - a.year || b.month - a.month)[0] || null;
  }

  function allPeriodRows() {
    return [...state.transactions, ...state.accountBalances, ...state.investmentHoldings, ...state.monthlyAssets];
  }

  function periodRows(rows, period) {
    return period ? rows.filter((row) => row.year === period.year && row.month === period.month) : [];
  }

  function filteredTransactions(period) {
    return state.transactions.filter((row) => {
      if (period && (row.year !== period.year || row.month !== period.month)) return false;
      if (!transactionMatchesDimensions(row)) return false;
      return true;
    });
  }

  function transactionMatchesDimensions(row) {
    if (filters.category && row.category !== filters.category) return false;
    return true;
  }

  function uniqueMonths(rows) {
    return Array.from(new Set(rows.filter((row) => row.year && row.month).map((row) => `${row.year}-${row.month}`)));
  }

  function isSalaryRow(row) {
    const text = [row.description, row.category, row.subcategory, row.notes]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    return /\b(stipendio|salary|retribuzione|busta paga|payroll)\b/u.test(text);
  }

  function comparablePeriods(period) {
    if (!period) return [];
    const months = new Set(
      state.transactions
        .filter((row) => row.year === period.year && row.month)
        .map((row) => row.month)
    );
    if (period.month) months.add(period.month);
    return Array.from(months).sort((a, b) => a - b).map((month) => ({ year: period.year, month }));
  }

  function monthlyAverages(period) {
    const periods = comparablePeriods(period);
    if (!periods.length) return { expense: null, income: null, balance: null, daily: null };
    const totals = periods.map((item) => {
      const rows = filteredTransactions(item);
      const expense = sum(rows.filter(isExpense).map((row) => Math.abs(row.amount)));
      const income = sum(rows.filter(isIncome).map((row) => Math.abs(row.amount)));
      return {
        expense,
        income,
        balance: income - expense,
        daily: expense / Math.max(daysInMonth(item.year, item.month), 1)
      };
    });
    return {
      expense: average(totals.map((row) => row.expense)),
      income: average(totals.map((row) => row.income)),
      balance: average(totals.map((row) => row.balance)),
      daily: average(totals.map((row) => row.daily))
    };
  }

  function categoryAverageMap(period) {
    const periods = comparablePeriods(period);
    if (!periods.length) return new Map();
    const monthKeys = new Set(periods.map((item) => `${item.year}-${item.month}`));
    const totals = new Map();
    state.transactions
      .filter((row) => row.year === period.year && isExpense(row) && transactionMatchesDimensions(row))
      .forEach((row) => {
        const key = `${row.year}-${row.month}`;
        if (!monthKeys.has(key)) return;
        const categoryTotalsByMonth = totals.get(row.category) || new Map();
        categoryTotalsByMonth.set(key, (categoryTotalsByMonth.get(key) || 0) + Math.abs(row.amount));
        totals.set(row.category, categoryTotalsByMonth);
      });
    return new Map(Array.from(totals.entries()).map(([category, monthTotals]) => [
      category,
      sum(periods.map((item) => monthTotals.get(`${item.year}-${item.month}`) || 0)) / periods.length
    ]));
  }

  function previousPeriod(period) {
    if (!period) return null;
    const date = new Date(period.year, period.month - 2, 1);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  }

  function findPreviousNamedValue(rows, period, key, name) {
    if (!period) return null;
    const match = rows.find((row) => row.year === period.year && row.month === period.month && row[key] === name);
    return match ? match.amount : null;
  }

  function deltaForValue(current, previous) {
    if (previous === null || previous === undefined || !Number.isFinite(Number(previous))) {
      return { amount: 0, pct: null, hasPrevious: false };
    }
    const amount = (Number(current) || 0) - (Number(previous) || 0);
    const pct = previous ? amount / Math.abs(previous) : null;
    return { amount, pct, hasPrevious: true };
  }

  function shareDelta(currentShare, previousShare) {
    if (!Number.isFinite(Number(currentShare)) || !Number.isFinite(Number(previousShare))) {
      return { amount: 0, hasPrevious: false };
    }
    return { amount: Number(currentShare) - Number(previousShare), hasPrevious: true };
  }

  function setDelta(selector, current, previous, options = {}) {
    const element = document.querySelector(selector);
    if (!element) return;
    const delta = deltaForValue(current, previous);
    if (!delta.hasPrevious && !options.absoluteOnly) {
      element.textContent = "n.d.";
      element.className = "delta-pill neutral";
      return;
    }
    const display = options.absoluteOnly
      ? `${trendArrow(current)} ${formatCurrency(current)}`
      : `${trendArrow(delta.amount)} ${formatDelta(delta)}`;
    element.textContent = display;
    element.className = `delta-pill ${trendClass(options.absoluteOnly ? current : delta.amount)}`;
  }

  function setAverageDelta(selector, current, averageValue, options = {}) {
    const element = document.querySelector(selector);
    if (!element) return;
    const averageNumber = Number(averageValue);
    if (!Number.isFinite(averageNumber)) {
      element.textContent = "media n.d.";
      element.className = "delta-pill neutral";
      return;
    }
    const delta = deltaForValue(current, averageNumber);
    const trendValue = options.lowerIsGood ? -delta.amount : delta.amount;
    element.textContent = `${trendArrow(delta.amount)} ${formatDelta(delta, { roundedDelta: true })} med.`;
    element.className = `delta-pill ${trendClass(trendValue)}`;
  }

  function formatDelta(delta, options = {}) {
    if (!delta.hasPrevious) return "n.d.";
    if (options.deltaAmountOnly) return options.roundedDelta ? formatRoundedCurrency(delta.amount) : formatCurrency(delta.amount);
    const pctText = delta.pct === null ? "n.d." : formatPercent(delta.pct);
    const amountText = options.roundedDelta ? formatRoundedCurrency(delta.amount) : formatCurrency(delta.amount);
    return `${amountText} · ${pctText}`;
  }

  function formatPercentagePoints(value) {
    const pctText = percent.format(Math.abs(value)).replace("%", "");
    return `${value >= 0 ? "+" : "-"}${pctText} p.p.`;
  }

  function trendClass(value) {
    if (value > 0) return "positive";
    if (value < 0) return "negative";
    return "neutral";
  }

  function trendArrow(value) {
    if (value > 0) return "▲";
    if (value < 0) return "▼";
    return "•";
  }

  function chartLabel(kind) {
    const labels = {
      account: "Conto",
      category: "Categoria",
      day: "Giorno",
      investment: "Investimento",
      "month-expense": "Spese mese",
      "month-income": "Entrate mese",
      point: "Punto timeline",
      slice: "Composizione"
    };
    return labels[kind] || "Grafico";
  }

  function setDefaultMonthInputs() {
    const period = selectedPeriod() || latestPeriod();
    if (!period) return;
    document.querySelectorAll('input[name="month_start"]').forEach((input) => {
      if (!input.value) input.value = `${period.year}-${String(period.month).padStart(2, "0")}`;
    });
  }

  function categoryTotals(transactions) {
    const totals = new Map();
    transactions.filter(isExpense).forEach((row) => {
      totals.set(row.category, (totals.get(row.category) || 0) + Math.abs(row.amount));
    });
    return Array.from(totals.entries()).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
  }

  function periodFromRow(row) {
    const parsed = parseDate(row.month_start) || parseDate(row.date);
    return {
      month: parsed ? Number(parsed.slice(5, 7)) : numberOrNull(row.month),
      year: parsed ? Number(parsed.slice(0, 4)) : numberOrNull(row.year)
    };
  }

  function setOptions(select, options, selected) {
    if (!select) return;
    const current = selected || select.value;
    select.innerHTML = options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
    select.value = options.some(([value]) => value === current) ? current : (options[0] ? options[0][0] : "");
  }

  function parseAmount(input) {
    if (input === null || input === undefined || input === "") return null;
    if (typeof input === "number") return Number.isFinite(input) ? input : null;
    let value = String(input).trim();
    if (!value || value === "-") return null;
    let negative = false;
    if (value.startsWith("(") && value.endsWith(")")) {
      negative = true;
      value = value.slice(1, -1);
    }
    value = value.replace(/€/g, "").replace(/%/g, "").replace(/\s/g, "");
    if (value.startsWith("+")) value = value.slice(1);
    if (value.startsWith("-")) {
      negative = true;
      value = value.slice(1);
    }
    if (value.includes(",") && value.includes(".")) {
      value = value.lastIndexOf(",") > value.lastIndexOf(".") ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
    } else if (value.includes(",")) {
      value = value.replace(/\./g, "").replace(",", ".");
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
  }

  function parsePercentValue(input) {
    if (input === null || input === undefined || input === "") return null;
    const raw = String(input).trim();
    const parsed = parseAmount(raw);
    if (parsed === null) return null;
    return raw.includes("%") ? parsed / 100 : parsed;
  }

  function parseDate(input) {
    if (!input) return null;
    const raw = String(input).trim();
    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    match = raw.match(/^(\d{4})-(\d{2})$/);
    if (match) return `${match[1]}-${match[2]}-01`;
    match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (!match) return null;
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    return `${year}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
  }

  function parseMonthInput(input) {
    const match = String(input || "").trim().match(/^(\d{4})-(\d{1,2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!year || month < 1 || month > 12) return null;
    return { year, month };
  }

  function monthStart(year, month) {
    return `${year}-${String(month).padStart(2, "0")}-01`;
  }

  function numberOrNull(input) {
    const number = Number(input);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function formatCurrency(value) {
    return currency.format(Number(value) || 0);
  }

  function formatRoundedCurrency(value) {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value) || 0).replace(/\s?€/u, "€");
  }

  function formatDailyRate(value) {
    return `${formatCurrency(value).replace(/\s?€/u, "€")}/gg`;
  }

  function shortCurrency(value) {
    const number = Number(value) || 0;
    if (Math.abs(number) >= 1000) return `${Math.round(number / 1000)}k €`;
    return `${Math.round(number)} €`;
  }

  function formatPercent(value) {
    return value === null ? "n.d." : percent.format(value);
  }

  function formatDate(value) {
    if (!value) return "Senza data";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.valueOf()) ? value : dateFormat.format(date);
  }

  function isExpense(row) {
    return row.type === "expense" || row.amount < 0;
  }

  function isIncome(row) {
    return row.type === "income" || row.amount > 0;
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function sortByPeriod(a, b) {
    return a.year - b.year || a.month - b.month;
  }

  function sum(values) {
    return values.reduce((total, value) => total + (Number(value) || 0), 0);
  }

  function average(values) {
    return values.length ? sum(values) / values.length : null;
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "it"));
  }

  function optionPairs(values) {
    return values.map((value) => [value, value]);
  }

  function makeId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }

  function setHtml(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.innerHTML = value;
  }

  function emptyMessage() {
    return `<p class="empty-state">Nessun dato</p>`;
  }

  function cssVar(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim() || getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
})();
