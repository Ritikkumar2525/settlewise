import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  CircleDot,
  FileText,
  Gauge,
  Grid2X2,
  HelpCircle,
  Landmark,
  Lock,
  LogIn,
  LogOut,
  PieChart,
  Plus,
  Search,
  Settings,
  Sparkles,
  Upload,
  Users,
  WalletCards
} from "lucide-react";
import { api, getToken, setToken } from "./api.js";
import "./styles.css";

const today = new Date().toISOString().slice(0, 10);

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
  return <SettleWise user={user} onLogout={() => { setToken(""); setUser(null); }} />;
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
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState(null);
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [imports, setImports] = useState([]);
  const [activeView, setActiveView] = useState("dashboard");
  const [error, setError] = useState("");

  async function refresh(nextGroupId = groupId) {
    setError("");
    const groupData = await api("/api/groups");
    const selected = nextGroupId || groupId || groupData.groups[0]?.id;
    setGroups(groupData.groups);
    setGroupId(selected);
    if (!selected) return;
    const [detail, expenseData, importData] = await Promise.all([
      api(`/api/groups/${selected}`),
      api(`/api/groups/${selected}/expenses`),
      api(`/api/groups/${selected}/imports`)
    ]);
    setGroup(detail.group);
    setExpenses(expenseData.expenses);
    setImports(importData.imports);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

  const memberships = group?.memberships ?? [];
  const members = useMemo(() => memberships.map((membership) => ({
    id: membership.member_id,
    name: membership.display_name,
    joinedOn: membership.joined_on,
    leftOn: membership.left_on
  })), [memberships]);

  return (
    <main className="settlewise-shell">
      <aside className="sw-sidebar">
        <div className="sw-brand">
          <strong>SettleWise</strong>
          <span>Shared Expenses</span>
        </div>
        <nav className="sw-nav">
          <NavButton icon={Grid2X2} label="Dashboard" active={activeView === "dashboard"} onClick={() => setActiveView("dashboard")} />
          <NavButton icon={WalletCards} label="Ledger" active={activeView === "ledger"} onClick={() => setActiveView("ledger")} />
          <NavButton icon={AlertTriangle} label="Anomalies" active={activeView === "anomalies"} onClick={() => setActiveView("anomalies")} />
          <NavButton icon={Settings} label="Settings" active={activeView === "settings"} onClick={() => setActiveView("settings")} />
        </nav>
        <div className="sidebar-bottom">
          <button className="add-expense" onClick={() => setActiveView("create")}><Plus size={24} /> Add Expense</button>
          <button className="side-link"><HelpCircle size={20} /> Help</button>
          <button className="side-link" onClick={onLogout}><LogOut size={20} /> Sign Out</button>
        </div>
      </aside>

      <section className="sw-main">
        <header className="sw-topbar">
          <div className="search-box"><Search size={18} /><input placeholder="Search transactions..." /></div>
          <div className="top-tabs">
            <button className="active">My Groups</button>
            <button>Recent activity</button>
          </div>
          <div className="profile-zone">
            <Bell size={22} />
            <div className="profile-copy"><strong>{user.name || "Alex Sterling"}</strong><span>PRO MEMBER</span></div>
            <div className="avatar">{(user.name || "A").slice(0, 1)}</div>
          </div>
        </header>

        <div className="sw-content">
          {error && <div className="notice error">{error}</div>}
          {!group && <div className="notice">No group found. Create one from Settings.</div>}
          {group && activeView === "create" && (
            <CreateExpenseView group={group} members={members} onBack={() => setActiveView("ledger")} onSaved={() => refresh().then(() => setActiveView("ledger"))} />
          )}
          {group && activeView === "dashboard" && <DashboardView group={group} expenses={expenses} onCreate={() => setActiveView("create")} />}
          {group && activeView === "ledger" && <LedgerView expenses={expenses} onCreate={() => setActiveView("create")} />}
          {group && activeView === "anomalies" && <AnomaliesView groupId={group.id} imports={imports} onImported={refresh} />}
          {group && activeView === "settings" && <SettingsView group={group} groups={groups} onSelect={refresh} onChanged={refresh} />}
        </div>
      </section>
    </main>
  );
}

function NavButton({ icon: Icon, label, active, onClick }) {
  return <button className={active ? "nav-item active" : "nav-item"} onClick={onClick}><Icon size={22} /> {label}</button>;
}

function DashboardView({ group, expenses, onCreate }) {
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
        <h2>Settlement plan</h2>
        {group.balances.settlements.length === 0 ? <p className="muted">Settled up</p> : group.balances.settlements.map((item) => (
          <div className="settlement-line" key={`${item.fromMemberId}-${item.toMemberId}`}>
            <span>{item.from} pays {item.to}</span>
            <strong>{money(item.amountMinor)}</strong>
          </div>
        ))}
      </section>
    </div>
  );
}

function Metric({ title, value, tone }) {
  return <div className={`metric-card ${tone}`}><span>{title}</span><strong>{value}</strong></div>;
}

function LedgerView({ expenses, onCreate }) {
  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div><h1>Ledger</h1><p>Expenses imported or created in the app.</p></div>
        <button className="primary-action" onClick={onCreate}><Plus size={18} /> Add Expense</button>
      </div>
      <section className="white-panel">
        <div className="ledger-list">
          {expenses.map((expense) => (
            <article className="ledger-row" key={expense.id}>
              <div><strong>{expense.description}</strong><span>{expense.expense_date} · paid by {expense.paid_by_name} · {expense.split_type}</span></div>
              <strong>{money(expense.base_amount_minor)}</strong>
            </article>
          ))}
          {expenses.length === 0 && <p className="muted">No expenses yet.</p>}
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
      description,
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
            <label>Currency</label>
            <div className="segmented currency-tabs">
              {["USD", "INR"].map((item) => <button key={item} className={currency === item ? "active" : ""} onClick={() => setCurrency(item)}>{item}</button>)}
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
              <button className={splitType === "equal" ? "active" : ""} onClick={() => setSplitType("equal")}><Gauge size={16} /> Equal</button>
              <button className={splitType === "exact" ? "active" : ""} onClick={() => setSplitType("exact")}><CircleDot size={16} /> Exact</button>
              <button className={splitType === "shares" ? "active" : ""} onClick={() => setSplitType("shares")}><PieChart size={16} /> Shares</button>
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
                    <div><strong>{member.name}</strong><span>{isPayer ? "Payer" : "Beneficiary"}</span></div>
                    {ineligible ? <Lock className="lock" size={20} /> : <button className={selected ? "toggle on" : "toggle"} onClick={() => toggleParticipant(member.id)}><span /></button>}
                  </div>
                  {ineligible ? (
                    <div className="ineligible">{member.joinedOn > expenseDate ? "Ineligible: Date precedes group membership." : "Ineligible: Date is after this member left."}</div>
                  ) : (
                    <>
                      <button className="payer-link" onClick={() => setPayerId(member.id)}>{isPayer ? "Paying full amount" : "Make payer"}</button>
                      {splitType !== "equal" && selected && (
                        <input className="split-value" placeholder={splitType === "shares" ? "Shares" : currency} value={splitValues[member.id] || ""} onChange={(event) => setSplitValues({ ...splitValues, [member.id]: event.target.value })} />
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

function money(minor) {
  return `INR ${Number(Number(minor || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  if (splitType === "shares" && participantIds.some((memberId) => Number(splitValues[memberId] || 0) <= 0)) {
    return "Enter positive shares for every selected participant.";
  }
  return "";
}

createRoot(document.getElementById("root")).render(<App />);
