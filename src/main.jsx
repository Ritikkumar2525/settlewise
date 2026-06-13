import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle,
  CircleDot,
  Download,
  FileText,
  Gauge,
  Grid2X2,
  HelpCircle,
  Landmark,
  Lock,
  LogIn,
  LogOut,
  Menu,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Upload,
  Users,
  WalletCards,
  X
} from "lucide-react";
import { api, getToken, setToken } from "./api.js";
import "./styles.css";

const today = new Date().toISOString().slice(0, 10);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false
    }
  }
});

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api("/api/me")
      .then((data) => setUser(data.user))
      .catch(() => setToken(""))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Login onLogin={setUser} />;
  return (
    <QueryClientProvider client={queryClient}>
      <SettleWise user={user} onLogout={() => { setToken(""); setUser(null); }} />
    </QueryClientProvider>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("aisha@example.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await api("/api/auth/login", { method: "POST", body: { email, password } });
      setToken(data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <strong>SettleWise</strong>
          <span>Shared Expenses</span>
        </div>
        <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary-action" type="submit"><LogIn size={18} /> Sign in</button>
      </form>
    </main>
  );
}

function SettleWise({ user, onLogout }) {
  const queryClient = useQueryClient();
  const [groupId, setGroupId] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [activeTopTab, setActiveTopTab] = useState("groups");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [readNotifications, setReadNotifications] = useState(() => new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const appQuery = useQuery({
    queryKey: ["settlewise", groupId],
    queryFn: async () => {
      const groupData = await api("/api/groups");
      const selected = groupId || groupData.groups[0]?.id;
      if (!selected) return { groups: groupData.groups, group: null, expenses: [], imports: [], payments: [] };
      const [detail, expenseData, importData, paymentData] = await Promise.all([
        api(`/api/groups/${selected}`),
        api(`/api/groups/${selected}/expenses`),
        api(`/api/groups/${selected}/imports`),
        api(`/api/groups/${selected}/payments`)
      ]);
      return {
        groups: groupData.groups,
        group: detail.group,
        expenses: expenseData.expenses,
        imports: importData.imports,
        payments: paymentData.payments
      };
    },
    refetchInterval: 15_000
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm.trim().toLowerCase()), 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const groups = appQuery.data?.groups ?? [];
  const group = appQuery.data?.group ?? null;
  const expenses = appQuery.data?.expenses ?? [];
  const imports = appQuery.data?.imports ?? [];
  const payments = appQuery.data?.payments ?? [];
  const memberships = group?.memberships ?? [];
  const members = useMemo(() => memberships.map((membership) => ({
    id: membership.member_id,
    name: membership.display_name,
    joinedOn: membership.joined_on,
    leftOn: membership.left_on
  })), [memberships]);
  const activity = useMemo(() => buildActivity(group, expenses, imports, payments), [group, expenses, imports, payments]);
  const notifications = useMemo(() => buildNotifications(group, imports, activity), [group, imports, activity]);
  const searchResults = useMemo(() => buildSearchResults(debouncedSearch, groups, group, expenses, members), [debouncedSearch, groups, group, expenses, members]);
  const unreadCount = notifications.filter((item) => !readNotifications.has(item.id)).length;

  useEffect(() => {
    if (!groupId && groups[0]?.id) setGroupId(groups[0].id);
  }, [groups, groupId]);

  async function refresh(nextGroupId = groupId) {
    if (nextGroupId && nextGroupId !== groupId) setGroupId(nextGroupId);
    await queryClient.invalidateQueries({ queryKey: ["settlewise"] });
  }

  function navigate(view) {
    setActiveTopTab("groups");
    setActiveView(view);
    setSidebarOpen(false);
    setNotificationsOpen(false);
  }

  function markAllNotificationsRead() {
    setReadNotifications(new Set(notifications.map((item) => item.id)));
  }

  function toggleNotification(id) {
    setReadNotifications((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <main className="settlewise-shell">
      <button className="mobile-menu-button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={22} /></button>
      {sidebarOpen && <button className="drawer-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={sidebarOpen ? "sw-sidebar open" : "sw-sidebar"}>
        <div className="sw-brand">
          <strong>SettleWise</strong>
          <span>Shared Expenses</span>
        </div>
        <button className="drawer-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={20} /></button>
        <nav className="sw-nav">
          <NavButton icon={Grid2X2} label="Dashboard" active={activeTopTab === "groups" && activeView === "dashboard"} onClick={() => navigate("dashboard")} />
          <NavButton icon={WalletCards} label="Ledger" active={activeTopTab === "groups" && activeView === "ledger"} onClick={() => navigate("ledger")} />
          <NavButton icon={AlertTriangle} label="Anomalies" active={activeTopTab === "groups" && activeView === "anomalies"} onClick={() => navigate("anomalies")} />
          <NavButton icon={Settings} label="Settings" active={activeTopTab === "groups" && activeView === "settings"} onClick={() => navigate("settings")} />
        </nav>
        <div className="sidebar-bottom">
          <button className="add-expense" onClick={() => navigate("create")}><Plus size={24} /> Add Expense</button>
          <button className="side-link"><HelpCircle size={20} /> Help</button>
          <button className="side-link" onClick={onLogout}><LogOut size={20} /> Sign Out</button>
        </div>
      </aside>

      <section className="sw-main">
        <header className="sw-topbar">
          <div className="search-wrap">
            <div className="search-box">
              <Search size={18} />
              <input
                aria-label="Search transactions, groups, and members"
                placeholder="Search transactions..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            {debouncedSearch && (
              <SearchPanel
                query={debouncedSearch}
                results={searchResults}
                onClear={() => setSearchTerm("")}
                onSelect={(result) => {
                  if (result.groupId) refresh(result.groupId);
                  if (result.view) {
                    setActiveTopTab("groups");
                    setActiveView(result.view);
                  }
                  setSearchTerm("");
                  setNotificationsOpen(false);
                }}
              />
            )}
          </div>
          <div className="top-tabs">
            <button className={activeTopTab === "groups" ? "active" : ""} onClick={() => { setNotificationsOpen(false); setActiveTopTab("groups"); }}>My Groups</button>
            <button className={activeTopTab === "activity" ? "active" : ""} onClick={() => { setNotificationsOpen(false); setActiveTopTab("activity"); }}>Recent activity</button>
          </div>
          <div className="profile-zone">
            <button className="notification-button" aria-label="Notifications" onClick={() => setNotificationsOpen((open) => !open)}>
              <Bell size={22} />
              {unreadCount > 0 && <span>{unreadCount}</span>}
            </button>
            {notificationsOpen && (
              <NotificationsDropdown
                notifications={notifications}
                readNotifications={readNotifications}
                onToggle={toggleNotification}
                onMarkAll={markAllNotificationsRead}
              />
            )}
            <div className="profile-copy"><strong>{user.name || "Alex Sterling"}</strong><span>PRO MEMBER</span></div>
            <div className="avatar">{(user.name || "A").slice(0, 1)}</div>
          </div>
        </header>

        <div className="sw-content">
          {appQuery.isError && <div className="notice error">{appQuery.error.message}</div>}
          {appQuery.isLoading && <SkeletonDashboard />}
          {!group && <div className="notice">No group found. Create one from Settings.</div>}
          {group && activeTopTab === "activity" && (
            <RecentActivityView activity={activity} loading={appQuery.isFetching} />
          )}
          {group && activeTopTab === "groups" && activeView === "create" && (
            <CreateExpenseView group={group} members={members} onBack={() => setActiveView("ledger")} onSaved={() => refresh().then(() => setActiveView("ledger"))} />
          )}
          {group && activeTopTab === "groups" && activeView === "dashboard" && <DashboardView group={group} expenses={expenses} payments={payments} onCreate={() => setActiveView("create")} onPaymentRecorded={refresh} />}
          {group && activeTopTab === "groups" && activeView === "ledger" && <LedgerView expenses={expenses} onCreate={() => setActiveView("create")} />}
          {group && activeTopTab === "groups" && activeView === "anomalies" && <AnomaliesView groupId={group.id} imports={imports} onImported={refresh} />}
          {group && activeTopTab === "groups" && activeView === "settings" && <SettingsView group={group} groups={groups} onSelect={refresh} onChanged={refresh} />}
        </div>
      </section>
    </main>
  );
}

function NavButton({ icon: Icon, label, active, onClick }) {
  return <button className={active ? "nav-item active" : "nav-item"} onClick={onClick}><Icon size={22} /> {label}</button>;
}

function DashboardView({ group, expenses, payments, onCreate, onPaymentRecorded }) {
  const balances = group.balances.members;
  return (
    <div className="page-stack">
      <div className="dashboard-hero">
        <div>
          <h1>{group.name}</h1>
          <p>Balances, settlements, and ledger health.</p>
        </div>
        <button className="primary-action" onClick={onCreate}><Plus size={18} /> Add Expense</button>
      </div>
      <div className="metric-grid">
        <Metric title="Members" value={balances.length} tone="blue" />
        <Metric title="Expenses" value={expenses.length} tone="green" />
        <Metric title="Open settlements" value={group.balances.settlements.length} tone="amber" />
      </div>
      <section className="white-panel">
        <h2>One-number summary</h2>
        <div className="balance-grid">
          {balances.map((member) => (
            <div className="balance-tile" key={member.id}>
              <span>{member.display_name}</span>
              <strong className={member.balanceMinor >= 0 ? "good" : "bad"}>{money(member.balanceMinor)}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="white-panel">
        <div className="section-head">
          <div>
            <h2>Settlement plan</h2>
            <p>Record repayments and watch balances update immediately.</p>
          </div>
        </div>
        <div className="settlement-grid">
          <div className="settlement-list">
            {group.balances.settlements.length === 0 ? <p className="muted">Settled up</p> : group.balances.settlements.map((item) => (
              <div className="settlement-line" key={`${item.fromMemberId}-${item.toMemberId}`}>
                <span>{item.from} pays {item.to}</span>
                <strong>{money(item.amountMinor)}</strong>
              </div>
            ))}
          </div>
          <PaymentForm group={group} onSaved={onPaymentRecorded} />
        </div>
        <div className="recent-payments">
          <h3>Recent payments</h3>
          {payments.length === 0 ? <p className="muted">No payments recorded</p> : payments.slice(0, 4).map((payment) => (
            <div className="payment-row" key={payment.id}>
              <span>{payment.payment_date} · {payment.from_name} paid {payment.to_name}</span>
              <strong>{money(payment.base_amount_minor)}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ title, value, tone }) {
  return <div className={`metric-card ${tone}`}><span>{title}</span><strong>{value}</strong></div>;
}

function PaymentForm({ group, onSaved }) {
  const settlements = group.balances.settlements;
  const members = group.memberships;
  const [paymentDate, setPaymentDate] = useState(today);
  const [fromMemberId, setFromMemberId] = useState("");
  const [toMemberId, setToMemberId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const suggested = settlements[0];
    if (suggested) {
      setFromMemberId(String(suggested.fromMemberId));
      setToMemberId(String(suggested.toMemberId));
      setAmount(minorToAmount(suggested.amountMinor));
    } else if (members.length >= 2) {
      setFromMemberId(String(members[0].member_id));
      setToMemberId(String(members[1].member_id));
      setAmount("");
    }
  }, [group.id, settlements.length, members.length]);

  const invalid = !paymentDate || !fromMemberId || !toMemberId || fromMemberId === toMemberId || Number(amount) <= 0;

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (invalid) {
      setError("Choose two different members and enter an amount greater than zero.");
      return;
    }
    try {
      setSaving(true);
      await api(`/api/groups/${group.id}/payments`, {
        method: "POST",
        body: { paymentDate, fromMemberId, toMemberId, amount, currency: "INR", notes }
      });
      setNotes("");
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="payment-form" onSubmit={submit}>
      <h3>Record payment</h3>
      <div className="payment-fields">
        <label>Date<input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label>
        <label>From<select value={fromMemberId} onChange={(event) => setFromMemberId(event.target.value)}>{members.map((member) => <option key={member.member_id} value={member.member_id}>{member.display_name}</option>)}</select></label>
        <label>To<select value={toMemberId} onChange={(event) => setToMemberId(event.target.value)}>{members.map((member) => <option key={member.member_id} value={member.member_id}>{member.display_name}</option>)}</select></label>
        <label>Amount<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label>
        <label className="payment-notes">Notes<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" /></label>
      </div>
      {error && <div className="form-error">{error}</div>}
      <button className="primary-action" disabled={saving} type="submit"><Landmark size={18} /> {saving ? "Recording..." : "Record payment"}</button>
    </form>
  );
}

function LedgerView({ expenses, onCreate }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const filteredExpenses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return expenses
      .filter((expense) => {
        const matchesQuery = !needle || `${expense.description} ${expense.paid_by_name} ${expense.split_type}`.toLowerCase().includes(needle);
        const matchesType = typeFilter === "all" || expense.split_type === typeFilter;
        return matchesQuery && matchesType;
      })
      .sort((a, b) => {
        if (sortOrder === "amount-desc") return b.base_amount_minor - a.base_amount_minor;
        if (sortOrder === "amount-asc") return a.base_amount_minor - b.base_amount_minor;
        return sortOrder === "oldest"
          ? a.expense_date.localeCompare(b.expense_date)
          : b.expense_date.localeCompare(a.expense_date);
      });
  }, [expenses, query, typeFilter, sortOrder]);
  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / pageSize));
  const visibleExpenses = filteredExpenses.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [query, typeFilter, sortOrder]);

  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div><h1>Ledger</h1><p>Expenses imported or created in the app.</p></div>
        <button className="primary-action" onClick={onCreate}><Plus size={18} /> Add Expense</button>
      </div>
      <section className="white-panel">
        <div className="toolbar">
          <div className="toolbar-search"><Search size={16} /><input aria-label="Search ledger" placeholder="Filter ledger..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <select aria-label="Split type filter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All split types</option>
            <option value="equal">Equal</option>
            <option value="exact">Exact</option>
            <option value="percent">Percent</option>
            <option value="shares">Shares</option>
          </select>
          <select aria-label="Sort ledger" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="amount-desc">Highest amount</option>
            <option value="amount-asc">Lowest amount</option>
          </select>
          <button className="secondary-action" onClick={() => exportExpensesCsv(filteredExpenses)}><Download size={16} /> Export CSV</button>
        </div>
        <div className="ledger-list">
          {visibleExpenses.map((expense) => (
            <article className="ledger-row" key={expense.id}>
              <div><strong>{expense.description}</strong><span>{expense.expense_date} · paid by {expense.paid_by_name} · {expense.split_type}</span></div>
              <strong>{money(expense.base_amount_minor)}</strong>
            </article>
          ))}
          {filteredExpenses.length === 0 && <p className="muted">No matching expenses.</p>}
        </div>
        <div className="pagination">
          <button className="secondary-action" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button className="secondary-action" disabled={page === totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      </section>
    </div>
  );
}

function CreateExpenseView({ group, members, onBack, onSaved }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(today);
  const [currency, setCurrency] = useState("USD");
  const [category, setCategory] = useState("Groceries");
  const [receiptName, setReceiptName] = useState("");
  const [splitType, setSplitType] = useState("equal");
  const [payerId, setPayerId] = useState(members[0]?.id || "");
  const [participantIds, setParticipantIds] = useState(members.map((member) => member.id));
  const [splitValues, setSplitValues] = useState({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const eligibleMembers = members.filter((member) => isEligible(member, expenseDate));
  const totalMinor = Math.round(Number(amount || 0) * 100);
  const participantCount = participantIds.length || 1;
  const eachMinor = splitType === "equal" ? Math.round(totalMinor / participantCount) : 0;
  const totalWeight = participantIds.reduce((sum, memberId) => sum + Number(splitValues[memberId] || 0), 0);
  const validationMessage = getExpenseValidation({
    description,
    amount,
    payerId,
    participantIds,
    splitType,
    splitValues
  });

  useEffect(() => {
    setPayerId((current) => eligibleMembers.some((member) => member.id === Number(current)) ? current : eligibleMembers[0]?.id || "");
    setParticipantIds((current) => {
      const eligibleIds = new Set(eligibleMembers.map((member) => member.id));
      const filtered = current.filter((id) => eligibleIds.has(id));
      return filtered.length ? filtered : eligibleMembers.map((member) => member.id);
    });
  }, [group.id, expenseDate, members.length]);

  function toggleParticipant(memberId) {
    setParticipantIds((current) => current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]);
  }

  function displayedShareMinor(memberId) {
    if (!participantIds.includes(memberId)) return 0;
    if (splitType === "equal") return eachMinor;
    if (splitType === "exact") return Math.round(Number(splitValues[memberId] || 0) * 100);
    if (splitType === "shares" && totalWeight > 0) {
      return Math.round((totalMinor * Number(splitValues[memberId] || 0)) / totalWeight);
    }
    if (splitType === "percent") {
      return Math.round((totalMinor * Number(splitValues[memberId] || 0)) / 100);
    }
    return 0;
  }

  async function saveExpense() {
    setSaveError("");
    if (validationMessage) {
      setSaveError(validationMessage);
      return;
    }
    const body = {
      expenseDate,
      description: category ? `${description} (${category})` : description,
      amount,
      currency,
      exchangeRate: currency === "USD" ? 83 : 1,
      paidByMemberId: payerId,
      splitType,
      participantIds,
      splits: participantIds.map((memberId) => ({
        memberId,
        amount: splitValues[memberId],
        value: splitValues[memberId]
      }))
    };
    try {
      setSaving(true);
      await api(`/api/groups/${group.id}/expenses`, { method: "POST", body });
      onSaved();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="create-page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={22} /> Back to Ledger</button>
      <div className="create-heading">
        <h1>Create New Expense</h1>
        <p>Record a shared cost and distribute it across group members.</p>
      </div>
      <div className="expense-builder">
        <aside className="details-column">
          <section className="form-card">
            <div className="card-title"><FileText size={22} /><h2>Core Details</h2></div>
            <label>Description<input placeholder="e.g., Weekly Groceries" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <div className="two-inputs">
              <label>Amount<input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label>
              <label>Date<input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></label>
            </div>
            <div className="two-inputs">
              <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option>Groceries</option>
                <option>Utilities</option>
                <option>Rent</option>
                <option>Travel</option>
                <option>Food</option>
                <option>Other</option>
              </select></label>
              <label className="receipt-upload">Receipt
                <input type="file" accept="image/*,.pdf" onChange={(event) => setReceiptName(event.target.files?.[0]?.name || "")} />
                <span><Upload size={16} /> {receiptName || "Attach receipt"}</span>
              </label>
            </div>
            {receiptName && <p className="receipt-name">Attached: {receiptName}</p>}
            <label>Currency</label>
            <div className="segmented currency-tabs">
              {["USD", "INR"].map((item) => <button key={item} type="button" className={currency === item ? "active" : ""} onClick={() => setCurrency(item)}>{item}</button>)}
            </div>
            {saveError && <div className="form-error">{saveError}</div>}
            {!saveError && validationMessage && <div className="form-hint">{validationMessage}</div>}
          </section>
          <section className="smart-card">
            <div className="spark-icon"><Sparkles size={22} /></div>
            <h3>SettleWise SmartScan</h3>
            <span>PREMIUM FEATURE</span>
            <p>Our engine flags duplicate expenses and unusual spending patterns within <strong>{group.name}</strong>.</p>
            <div className="secured"><i /><i /><i /> 8.2k groups secured this month</div>
          </section>
        </aside>

        <section className="split-panel">
          <header className="split-header">
            <div className="split-title"><Users size={24} /><div><h2>Split Management</h2><p>Assign contributions and debt for this expense.</p></div></div>
            <div className="segmented">
              <button type="button" className={splitType === "equal" ? "active" : ""} onClick={() => setSplitType("equal")}><Gauge size={16} /> Equal</button>
              <button type="button" className={splitType === "exact" ? "active" : ""} onClick={() => setSplitType("exact")}><CircleDot size={16} /> Exact</button>
              <button type="button" className={splitType === "percent" ? "active" : ""} onClick={() => setSplitType("percent")}><PieChart size={16} /> Percent</button>
              <button type="button" className={splitType === "shares" ? "active" : ""} onClick={() => setSplitType("shares")}><PieChart size={16} /> Shares</button>
            </div>
          </header>
          <div className="member-card-grid">
            {members.map((member) => {
              const selected = participantIds.includes(member.id);
              const ineligible = !isEligible(member, expenseDate);
              const isPayer = Number(payerId) === member.id;
              return (
                <article className={selected && !ineligible ? "split-member selected" : "split-member"} key={member.id}>
                  <div className="member-top">
                    <div className="member-avatar">{member.name.slice(0, 1)}</div>
                    <div><strong title={member.name}>{member.name}</strong><span>{isPayer ? "Payer" : "Beneficiary"}</span></div>
                    {ineligible ? <Lock className="lock" size={20} /> : <button className={selected ? "toggle on" : "toggle"} type="button" aria-pressed={selected} aria-label={`${selected ? "Remove" : "Add"} ${member.name}`} onClick={() => toggleParticipant(member.id)}><span /></button>}
                  </div>
                  {ineligible ? (
                    <div className="ineligible">{member.joinedOn > expenseDate ? "Ineligible: Date precedes group membership." : "Ineligible: Date is after this member left."}</div>
                  ) : (
                    <>
                      <button className="payer-link" type="button" onClick={() => setPayerId(member.id)}>{isPayer ? "Paying full amount" : "Make payer"}</button>
                      {splitType !== "equal" && selected && (
                        <input className="split-value" inputMode="decimal" placeholder={splitType === "shares" ? "Shares" : splitType === "percent" ? "%" : currency} value={splitValues[member.id] || ""} onChange={(event) => setSplitValues({ ...splitValues, [member.id]: event.target.value })} />
                      )}
                      <div className="share-row"><span>Calculated share</span><strong>{formatCurrency(displayedShareMinor(member.id), currency)}</strong></div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
          <footer className="split-footer">
            <div><span>Total Expense</span><strong>{formatCurrency(totalMinor, currency)}</strong></div>
            <div className="breakdown"><span>Breakdown</span><strong>{participantIds.length}</strong><p>Participants<br />{splitType} split active</p></div>
            <div className="breakdown"><strong>{formatCurrency(splitType === "equal" ? eachMinor : 0, currency)}</strong><p>{splitType === "equal" ? "ea." : "custom"}<br />Per active member</p></div>
            <button className="cancel-button" onClick={onBack}>Cancel</button>
            <button className="save-button" disabled={saving || Boolean(validationMessage)} onClick={saveExpense}>{saving ? "Saving..." : "Save Expense"}</button>
          </footer>
        </section>
      </div>
    </div>
  );
}

function AnomaliesView({ groupId, imports, onImported }) {
  const [report, setReport] = useState(null);
  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const csvText = await file.text();
    const data = await api(`/api/groups/${groupId}/imports`, { method: "POST", body: { fileName: file.name, csvText } });
    setReport(data.report);
    onImported();
  }
  return (
    <div className="page-stack">
      <div className="page-title-row"><div><h1>Anomalies</h1><p>Import report and review queue.</p></div><label className="upload-button"><Upload size={18} /> Upload CSV<input type="file" accept=".csv,text/csv" onChange={upload} /></label></div>
      <section className="white-panel">
        {(report?.anomalies || []).map((item) => <div className="anomaly-line" key={item.id}><strong>{item.code}</strong><span>{item.message}</span><em>{item.action}</em></div>)}
        {!report && imports.map((item) => <button className="ledger-row" key={item.id} onClick={async () => setReport((await api(`/api/imports/${item.id}`)).report)}><strong>{item.file_name}</strong><span>{item.summary.anomalies || 0} anomalies</span></button>)}
        {!report && imports.length === 0 && <p className="muted">No imports yet.</p>}
      </section>
    </div>
  );
}

function SettingsView({ group, groups, onSelect, onChanged }) {
  const [name, setName] = useState("");
  async function addAssignmentMembers() {
    const people = [["Aisha", "2024-02-01", ""], ["Rohan", "2024-02-01", ""], ["Priya", "2024-02-01", ""], ["Meera", "2024-02-01", "2024-03-31"], ["Dev", "2024-03-01", "2024-03-31"], ["Sam", "2024-04-15", ""]];
    const existing = new Set(group.memberships.map((membership) => membership.display_name.toLowerCase()));
    for (const [displayName, joinedOn, leftOn] of people) {
      if (!existing.has(displayName.toLowerCase())) {
        await api(`/api/groups/${group.id}/memberships`, { method: "POST", body: { displayName, joinedOn, leftOn } });
      }
    }
    onChanged();
  }
  async function createGroup(event) {
    event.preventDefault();
    if (!name.trim()) return;
    const data = await api("/api/groups", { method: "POST", body: { name } });
    setName("");
    onSelect(data.group.id);
  }
  return (
    <div className="page-stack">
      <div className="page-title-row"><div><h1>Settings</h1><p>Groups and membership windows.</p></div><button className="primary-action" onClick={addAssignmentMembers}><Users size={18} /> Add flatmates</button></div>
      <section className="white-panel">
        <form className="create-group-form" onSubmit={createGroup}><input placeholder="New group" value={name} onChange={(event) => setName(event.target.value)} /><button className="primary-action">Create</button></form>
        <div className="group-pills">{groups.map((item) => <button className={item.id === group.id ? "active" : ""} key={item.id} onClick={() => onSelect(item.id)}>{item.name}</button>)}</div>
      </section>
      <section className="white-panel">
        <h2>Members</h2>
        <div className="ledger-list">{group.memberships.map((member) => <div className="ledger-row" key={member.id}><strong>{member.display_name}</strong><span>{member.joined_on} to {member.left_on || "present"}</span></div>)}</div>
      </section>
    </div>
  );
}

function SearchPanel({ query, results, onSelect, onClear }) {
  return (
    <div className="search-panel" role="listbox" aria-label="Search results">
      <div className="panel-head">
        <strong>Search results</strong>
        <button type="button" onClick={onClear}>Clear</button>
      </div>
      {results.length === 0 ? (
        <p className="empty-state">No matches for "{query}".</p>
      ) : results.map((result) => (
        <button className="search-result" type="button" key={result.id} onClick={() => onSelect(result)}>
          <span>{result.type}</span>
          <strong><HighlightedText text={result.title} query={query} /></strong>
          <em>{result.meta}</em>
        </button>
      ))}
    </div>
  );
}

function HighlightedText({ text, query }) {
  const source = String(text || "");
  const index = source.toLowerCase().indexOf(query.toLowerCase());
  if (!query || index < 0) return source;
  return (
    <>
      {source.slice(0, index)}
      <mark>{source.slice(index, index + query.length)}</mark>
      {source.slice(index + query.length)}
    </>
  );
}

function NotificationsDropdown({ notifications, readNotifications, onToggle, onMarkAll }) {
  return (
    <div className="notification-menu" role="dialog" aria-label="Notifications">
      <div className="panel-head">
        <strong>Notifications</strong>
        <button type="button" onClick={onMarkAll}>Mark all read</button>
      </div>
      {notifications.length === 0 ? <p className="empty-state">Nothing new.</p> : notifications.map((notification) => {
        const read = readNotifications.has(notification.id);
        return (
          <button className={read ? "notification-row read" : "notification-row"} key={notification.id} type="button" onClick={() => onToggle(notification.id)}>
            <span className={`status-dot ${notification.tone}`} />
            <div>
              <strong>{notification.title}</strong>
              <em>{notification.detail}</em>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SkeletonDashboard() {
  return (
    <div className="page-stack" aria-label="Loading dashboard">
      <div className="skeleton hero" />
      <div className="metric-grid">
        <div className="skeleton metric" />
        <div className="skeleton metric" />
        <div className="skeleton metric" />
      </div>
      <div className="white-panel skeleton-panel">
        <div className="skeleton line short" />
        <div className="skeleton-grid">
          <div className="skeleton tile" />
          <div className="skeleton tile" />
          <div className="skeleton tile" />
        </div>
      </div>
    </div>
  );
}

function RecentActivityView({ activity, loading }) {
  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div><h1>Recent activity</h1><p>Expenses, settlements, membership changes, and import alerts.</p></div>
        {loading && <span className="loading-pill"><RefreshCw size={16} /> Syncing</span>}
      </div>
      <section className="white-panel">
        {activity.length === 0 ? <p className="muted">No activity yet.</p> : (
          <div className="activity-timeline">
            {activity.map((item) => (
              <article className="activity-row" key={item.id}>
                <div className={`activity-icon ${item.tone}`}><ActivityIcon type={item.type} /></div>
                <div>
                  <span>{item.type}</span>
                  <strong>{item.title}</strong>
                  <em>{item.meta}</em>
                </div>
                {item.amountMinor != null && <strong>{money(item.amountMinor)}</strong>}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ActivityIcon({ type }) {
  if (type === "Settlement Completed") return <CheckCircle size={18} />;
  if (type === "Anomaly Detected") return <AlertTriangle size={18} />;
  if (type.includes("Member")) return <Users size={18} />;
  return <FileText size={18} />;
}

function buildActivity(group, expenses, imports, payments) {
  if (!group) return [];
  const memberActivity = (group.memberships || []).flatMap((member) => {
    const joined = {
      id: `member-joined-${member.id}`,
      type: "Member Joined",
      title: member.display_name,
      meta: member.joined_on,
      sortDate: member.joined_on,
      tone: "good"
    };
    if (!member.left_on) return [joined];
    return [joined, {
      id: `member-left-${member.id}`,
      type: "Member Left",
      title: member.display_name,
      meta: member.left_on,
      sortDate: member.left_on,
      tone: "warn"
    }];
  });
  const expenseActivity = expenses.map((expense) => ({
    id: `expense-${expense.id}`,
    type: "Expense Added",
    title: expense.description,
    meta: `${expense.expense_date} · paid by ${expense.paid_by_name} · ${expense.split_type}`,
    sortDate: expense.created_at || expense.expense_date,
    amountMinor: expense.base_amount_minor,
    tone: "info"
  }));
  const paymentActivity = payments.map((payment) => ({
    id: `payment-${payment.id}`,
    type: "Settlement Completed",
    title: `${payment.from_name} paid ${payment.to_name}`,
    meta: payment.payment_date,
    sortDate: payment.created_at || payment.payment_date,
    amountMinor: payment.base_amount_minor,
    tone: "good"
  }));
  const importActivity = imports.map((item) => ({
    id: `import-${item.id}`,
    type: "Anomaly Detected",
    title: item.file_name,
    meta: `${item.summary?.anomalies || 0} anomalies · ${item.summary?.expensesImported || 0} expenses imported`,
    sortDate: item.created_at,
    tone: item.summary?.anomalies ? "warn" : "good"
  }));
  return [...expenseActivity, ...paymentActivity, ...memberActivity, ...importActivity]
    .sort((a, b) => Number(new Date(b.sortDate || 0)) - Number(new Date(a.sortDate || 0)))
    .slice(0, 24);
}

function buildNotifications(group, imports, activity) {
  if (!group) return [];
  const latestImport = imports[0];
  const notifications = [];
  if (group.balances.settlements.length > 0) {
    notifications.push({
      id: `settlements-${group.id}-${group.balances.settlements.length}`,
      title: `${group.balances.settlements.length} open settlements`,
      detail: "Use the settlement form to record repayments.",
      tone: "warn"
    });
  }
  if (latestImport?.summary?.anomalies) {
    notifications.push({
      id: `import-${latestImport.id}`,
      title: `${latestImport.summary.anomalies} import anomalies`,
      detail: `${latestImport.file_name} needs review.`,
      tone: "bad"
    });
  }
  const latestExpense = activity.find((item) => item.type === "Expense Added");
  if (latestExpense) {
    notifications.push({
      id: `activity-${latestExpense.id}`,
      title: "Latest expense posted",
      detail: `${latestExpense.title} · ${money(latestExpense.amountMinor)}`,
      tone: "info"
    });
  }
  return notifications;
}

function buildSearchResults(term, groups, group, expenses, members) {
  if (!term) return [];
  const matches = [];
  for (const item of groups) {
    if (String(item.name).toLowerCase().includes(term)) {
      matches.push({ id: `group-${item.id}`, type: "Group", title: item.name, meta: `${item.member_count} members`, groupId: item.id, view: "dashboard" });
    }
  }
  for (const member of members) {
    if (member.name.toLowerCase().includes(term)) {
      matches.push({ id: `member-${member.id}`, type: "Member", title: member.name, meta: `${member.joinedOn} to ${member.leftOn || "present"}`, groupId: group?.id, view: "settings" });
    }
  }
  for (const expense of expenses) {
    const haystack = `${expense.description} ${expense.paid_by_name} ${expense.split_type}`.toLowerCase();
    if (haystack.includes(term)) {
      matches.push({ id: `expense-${expense.id}`, type: "Expense", title: expense.description, meta: `${expense.expense_date} · ${expense.paid_by_name} · ${money(expense.base_amount_minor)}`, groupId: group?.id, view: "ledger" });
    }
  }
  return matches.slice(0, 10);
}

function exportExpensesCsv(expenses) {
  const headers = ["Date", "Description", "Paid by", "Split type", "Currency", "Original amount", "INR amount"];
  const rows = expenses.map((expense) => [
    expense.expense_date,
    expense.description,
    expense.paid_by_name,
    expense.split_type,
    expense.currency,
    expense.amount,
    expense.baseAmount
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "settlewise-ledger.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function money(minor) {
  return `INR ${Number(Number(minor || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function minorToAmount(minor) {
  return String(Number(Number(minor || 0) / 100).toFixed(2));
}

function formatCurrency(minor, currency) {
  const symbol = currency === "USD" ? "$" : "₹";
  return `${symbol}${Number(Number(minor || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isEligible(member, date) {
  return member.joinedOn <= date && (!member.leftOn || member.leftOn >= date);
}

function getExpenseValidation({ description, amount, payerId, participantIds, splitType, splitValues }) {
  const numericAmount = Number(amount);
  if (!description.trim()) return "Enter a description.";
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return "Enter a valid amount greater than zero.";
  if (!payerId) return "Choose a payer.";
  if (participantIds.length === 0) return "Select at least one participant.";
  if (splitType === "exact") {
    const exactTotal = participantIds.reduce((sum, memberId) => sum + Number(splitValues[memberId] || 0), 0);
    if (participantIds.some((memberId) => Number(splitValues[memberId] || 0) <= 0)) return "Enter exact amounts for every selected participant.";
    if (Math.abs(exactTotal - numericAmount) > 0.01) return "Exact split amounts must add up to the total.";
  }
  if (splitType === "percent") {
    const percentTotal = participantIds.reduce((sum, memberId) => sum + Number(splitValues[memberId] || 0), 0);
    if (participantIds.some((memberId) => Number(splitValues[memberId] || 0) <= 0)) return "Enter percentages for every selected participant.";
    if (Math.abs(percentTotal - 100) > 0.01) return "Percent split must add up to 100%.";
  }
  if (splitType === "shares" && participantIds.some((memberId) => Number(splitValues[memberId] || 0) <= 0)) {
    return "Enter positive shares for every selected participant.";
  }
  return "";
}

createRoot(document.getElementById("root")).render(<App />);
