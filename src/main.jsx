import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Check,
  CircleDollarSign,
  Eye,
  FileWarning,
  Landmark,
  LogIn,
  Plus,
  ReceiptText,
  RefreshCw,
  Upload,
  Users,
  WalletCards,
  X
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

  if (loading) return <div className="center">Loading...</div>;
  if (!user) return <Login onLogin={setUser} />;
  return <Dashboard user={user} onLogout={() => { setToken(""); setUser(null); }} />;
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
      <form className="login-panel" onSubmit={submit}>
        <div className="brand-row">
          <WalletCards size={28} />
          <div>
            <h1>Shared Expenses</h1>
            <p>Flatmates ledger</p>
          </div>
        </div>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <div className="error-text">{error}</div>}
        <button className="primary-button" type="submit">
          <LogIn size={16} /> Sign in
        </button>
      </form>
    </main>
  );
}

function Dashboard({ user, onLogout }) {
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState(null);
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [imports, setImports] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [error, setError] = useState("");

  async function refresh(nextGroupId = groupId) {
    setError("");
    const groupData = await api("/api/groups");
    setGroups(groupData.groups);
    const selected = nextGroupId || groupData.groups[0]?.id;
    setGroupId(selected);
    if (!selected) return;
    const [detail, expenseData, paymentData, importData] = await Promise.all([
      api(`/api/groups/${selected}`),
      api(`/api/groups/${selected}/expenses`),
      api(`/api/groups/${selected}/payments`),
      api(`/api/groups/${selected}/imports`)
    ]);
    setGroup(detail.group);
    setExpenses(expenseData.expenses);
    setPayments(paymentData.payments);
    setImports(importData.imports);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

  const members = group?.memberships ?? [];
  const activeMemberOptions = useMemo(() => members.map((membership) => ({
    id: membership.member_id,
    name: membership.display_name,
    joinedOn: membership.joined_on,
    leftOn: membership.left_on
  })), [members]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row compact">
          <WalletCards size={24} />
          <div>
            <h1>Shared Expenses</h1>
            <p>{user.name}</p>
          </div>
        </div>
        <div className="group-list">
          {groups.map((item) => (
            <button
              key={item.id}
              className={item.id === groupId ? "group-button active" : "group-button"}
              onClick={() => refresh(item.id)}
            >
              <Users size={16} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
        <CreateGroup onCreated={(created) => refresh(created.id)} />
        <button className="ghost-button" onClick={onLogout}>
          <X size={16} /> Sign out
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>{group?.name || "Group"}</h2>
            <p>{members.length} memberships</p>
          </div>
          <button className="icon-button" title="Refresh" onClick={() => refresh()}>
            <RefreshCw size={18} />
          </button>
        </header>
        {error && <div className="banner error-text">{error}</div>}
        <nav className="tabs">
          <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>
            <CircleDollarSign size={16} /> Balances
          </button>
          <button className={activeTab === "expenses" ? "active" : ""} onClick={() => setActiveTab("expenses")}>
            <ReceiptText size={16} /> Expenses
          </button>
          <button className={activeTab === "import" ? "active" : ""} onClick={() => setActiveTab("import")}>
            <Upload size={16} /> Import
          </button>
          <button className={activeTab === "members" ? "active" : ""} onClick={() => setActiveTab("members")}>
            <Users size={16} /> Members
          </button>
        </nav>

        {group && activeTab === "overview" && (
          <Overview group={group} payments={payments} members={activeMemberOptions} onSettled={() => refresh()} />
        )}
        {group && activeTab === "expenses" && (
          <Expenses
            groupId={group.id}
            expenses={expenses}
            members={activeMemberOptions}
            onChanged={() => refresh()}
          />
        )}
        {group && activeTab === "import" && (
          <ImportPanel groupId={group.id} imports={imports} onImported={() => refresh()} />
        )}
        {group && activeTab === "members" && (
          <Members groupId={group.id} memberships={members} onChanged={() => refresh()} />
        )}
      </section>
    </main>
  );
}

function CreateGroup({ onCreated }) {
  const [name, setName] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    const data = await api("/api/groups", { method: "POST", body: { name } });
    setName("");
    onCreated(data.group);
  }
  return (
    <form className="inline-form" onSubmit={submit}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New group" />
      <button className="icon-button" title="Create group">
        <Plus size={16} />
      </button>
    </form>
  );
}

function Overview({ group, payments, members, onSettled }) {
  const [selectedMemberId, setSelectedMemberId] = useState(group.balances.members[0]?.id ?? null);
  const selected = group.balances.members.find((member) => member.id === Number(selectedMemberId));

  return (
    <div className="grid two">
      <section className="panel">
        <div className="section-title">
          <h3>One-number summary</h3>
        </div>
        <div className="balance-list">
          {group.balances.members.map((member) => (
            <button
              key={member.id}
              className={member.id === Number(selectedMemberId) ? "balance-row active" : "balance-row"}
              onClick={() => setSelectedMemberId(member.id)}
            >
              <span>{member.display_name}</span>
              <strong className={member.balanceMinor >= 0 ? "positive" : "negative"}>
                {money(member.balanceMinor)}
              </strong>
            </button>
          ))}
        </div>
        <h3>Settlement plan</h3>
        <div className="settlement-list">
          {group.balances.settlements.length === 0 && <p className="muted">Settled up</p>}
          {group.balances.settlements.map((settlement) => (
            <SettlementRow key={`${settlement.fromMemberId}-${settlement.toMemberId}`} groupId={group.id} settlement={settlement} onSettled={onSettled} />
          ))}
        </div>
        <PaymentForm groupId={group.id} members={members} onCreated={onSettled} />
        <h3>Recent payments</h3>
        <div className="history-list">
          {payments.slice(0, 6).map((payment) => (
            <div className="history-row" key={payment.id}>
              <span>{payment.from_name} to {payment.to_name}</span>
              <strong>{money(payment.base_amount_minor)}</strong>
            </div>
          ))}
          {payments.length === 0 && <p className="muted">No payments recorded</p>}
        </div>
      </section>
      <section className="panel">
        <div className="section-title">
          <h3>Trace</h3>
          <select value={selectedMemberId ?? ""} onChange={(event) => setSelectedMemberId(event.target.value)}>
            {group.balances.members.map((member) => (
              <option key={member.id} value={member.id}>{member.display_name}</option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Entry</th>
                <th>Type</th>
                <th className="right">Impact</th>
              </tr>
            </thead>
            <tbody>
              {(selected?.trace ?? []).map((entry, index) => (
                <tr key={`${entry.kind}-${entry.expenseId || entry.paymentId}-${index}`}>
                  <td>{entry.date}</td>
                  <td>{entry.description}</td>
                  <td>{entry.kind.replaceAll("_", " ")}</td>
                  <td className={entry.amountMinor >= 0 ? "right positive" : "right negative"}>
                    {money(entry.amountMinor)}
                  </td>
                </tr>
              ))}
              {(!selected || selected.trace.length === 0) && (
                <tr>
                  <td colSpan="4" className="muted">No ledger entries</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SettlementRow({ groupId, settlement, onSettled }) {
  const [saving, setSaving] = useState(false);
  async function record() {
    setSaving(true);
    await api(`/api/groups/${groupId}/payments`, {
      method: "POST",
      body: {
        paymentDate: today,
        fromMemberId: settlement.fromMemberId,
        toMemberId: settlement.toMemberId,
        amount: settlement.amount,
        currency: "INR",
        notes: "Settlement from balance plan"
      }
    });
    setSaving(false);
    onSettled();
  }
  return (
    <div className="settlement-row">
      <span>{settlement.from} pays {settlement.to}</span>
      <strong>{money(settlement.amountMinor)}</strong>
      <button className="small-button" onClick={record} disabled={saving} title="Record payment">
        <Landmark size={14} /> Record
      </button>
    </div>
  );
}

function PaymentForm({ groupId, members, onCreated }) {
  const [form, setForm] = useState({
    paymentDate: today,
    fromMemberId: members[0]?.id || "",
    toMemberId: members[1]?.id || "",
    amount: "",
    currency: "INR",
    notes: ""
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      fromMemberId: current.fromMemberId || members[0]?.id || "",
      toMemberId: current.toMemberId || members[1]?.id || members[0]?.id || ""
    }));
  }, [members]);

  async function submit(event) {
    event.preventDefault();
    await api(`/api/groups/${groupId}/payments`, { method: "POST", body: form });
    setForm((current) => ({ ...current, amount: "", notes: "" }));
    onCreated();
  }

  return (
    <form className="payment-form" onSubmit={submit}>
      <label>Date<input type="date" value={form.paymentDate} onChange={(event) => setForm({ ...form, paymentDate: event.target.value })} /></label>
      <label>From<select value={form.fromMemberId} onChange={(event) => setForm({ ...form, fromMemberId: event.target.value })}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label>To<select value={form.toMemberId} onChange={(event) => setForm({ ...form, toMemberId: event.target.value })}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label>Amount<input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
      <label>Notes<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      <button className="small-button"><Landmark size={14} /> Record payment</button>
    </form>
  );
}

function Expenses({ groupId, expenses, members, onChanged }) {
  return (
    <div className="stack">
      <ExpenseForm groupId={groupId} members={members} onCreated={onChanged} />
      <section className="panel">
        <div className="section-title">
          <h3>Expense ledger</h3>
        </div>
        <div className="expense-list">
          {expenses.map((expense) => (
            <article key={expense.id} className={expense.status === "void" ? "expense-card void" : "expense-card"}>
              <div>
                <div className="expense-title">{expense.description}</div>
                <div className="muted">{expense.expense_date} · paid by {expense.paid_by_name} · {expense.split_type}</div>
              </div>
              <div className="expense-amount">
                <strong>{expense.currency} {number(expense.amount)}</strong>
                <span>{money(expense.base_amount_minor)}</span>
              </div>
              <details>
                <summary><Eye size={14} /> Splits</summary>
                <div className="split-grid">
                  {expense.splits.map((split) => (
                    <div key={split.id}>
                      <span>{split.display_name}</span>
                      <strong>{money(split.owed_minor)}</strong>
                    </div>
                  ))}
                </div>
              </details>
              <button
                className="small-button"
                onClick={async () => {
                  await api(`/api/expenses/${expense.id}`, { method: "PATCH", body: { status: expense.status === "void" ? "posted" : "void" } });
                  onChanged();
                }}
              >
                {expense.status === "void" ? <Check size={14} /> : <X size={14} />}
                {expense.status === "void" ? "Post" : "Void"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ExpenseForm({ groupId, members, onCreated }) {
  const [form, setForm] = useState({
    expenseDate: today,
    description: "",
    amount: "",
    currency: "INR",
    exchangeRate: "83",
    paidByMemberId: members[0]?.id ?? "",
    splitType: "equal",
    participantIds: members.map((member) => member.id),
    splitValues: {}
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      paidByMemberId: current.paidByMemberId || members[0]?.id || "",
      participantIds: current.participantIds.length ? current.participantIds : members.map((member) => member.id)
    }));
  }, [members]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    const body = {
      ...form,
      participantIds: form.participantIds.map(Number),
      splits: form.participantIds.map((memberId) => ({
        memberId,
        amount: form.splitValues[memberId],
        value: form.splitValues[memberId]
      }))
    };
    await api(`/api/groups/${groupId}/expenses`, { method: "POST", body });
    setForm((current) => ({ ...current, description: "", amount: "", splitValues: {} }));
    onCreated();
  }

  return (
    <section className="panel">
      <div className="section-title">
        <h3>New expense</h3>
      </div>
      <form className="expense-form" onSubmit={submit}>
        <label>Date<input type="date" value={form.expenseDate} onChange={(event) => update("expenseDate", event.target.value)} /></label>
        <label>Description<input value={form.description} onChange={(event) => update("description", event.target.value)} required /></label>
        <label>Amount<input value={form.amount} onChange={(event) => update("amount", event.target.value)} required /></label>
        <label>Currency<select value={form.currency} onChange={(event) => update("currency", event.target.value)}><option>INR</option><option>USD</option></select></label>
        {form.currency === "USD" && <label>FX<input value={form.exchangeRate} onChange={(event) => update("exchangeRate", event.target.value)} /></label>}
        <label>Paid by<select value={form.paidByMemberId} onChange={(event) => update("paidByMemberId", event.target.value)}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <label>Split<select value={form.splitType} onChange={(event) => update("splitType", event.target.value)}><option value="equal">Equal</option><option value="exact">Exact</option><option value="percent">Percent</option><option value="shares">Shares</option></select></label>
        <div className="member-checks">
          {members.map((member) => (
            <label key={member.id} className="check-row">
              <input
                type="checkbox"
                checked={form.participantIds.includes(member.id)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...form.participantIds, member.id]
                    : form.participantIds.filter((id) => id !== member.id);
                  update("participantIds", next);
                }}
              />
              {member.name}
              {form.splitType !== "equal" && form.participantIds.includes(member.id) && (
                <input
                  className="mini-input"
                  value={form.splitValues[member.id] || ""}
                  onChange={(event) => update("splitValues", { ...form.splitValues, [member.id]: event.target.value })}
                  placeholder={form.splitType === "percent" ? "%" : form.splitType === "shares" ? "share" : "INR"}
                />
              )}
            </label>
          ))}
        </div>
        <button className="primary-button"><Plus size={16} /> Add expense</button>
      </form>
    </section>
  );
}

function ImportPanel({ groupId, imports, onImported }) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const csvText = await file.text();
      const data = await api(`/api/groups/${groupId}/imports`, {
        method: "POST",
        body: { fileName: file.name, csvText }
      });
      setReport(data.report);
      onImported();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="section-title">
          <h3>CSV import</h3>
          <label className="file-button">
            <Upload size={16} />
            <input type="file" accept=".csv,text/csv" onChange={upload} disabled={busy} />
            Upload
          </label>
        </div>
        {error && <div className="error-text">{error}</div>}
        {report && <ImportReport report={report} onChanged={(next) => setReport(next)} />}
      </section>
      <section className="panel">
        <h3>Import history</h3>
        <div className="history-list">
          {imports.map((item) => (
            <button key={item.id} className="history-row" onClick={async () => {
              const data = await api(`/api/imports/${item.id}`);
              setReport(data.report);
            }}>
              <FileWarning size={16} />
              <span>{item.file_name}</span>
              <strong>{item.summary.anomalies || 0} anomalies</strong>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ImportReport({ report, onChanged }) {
  async function setResolution(anomalyId, resolutionStatus) {
    await api(`/api/import-anomalies/${anomalyId}`, { method: "PATCH", body: { resolutionStatus } });
    const data = await api(`/api/imports/${report.id}`);
    onChanged(data.report);
  }
  return (
    <div className="report">
      <div className="report-summary">
        <span>Rows {report.summary.rowsSeen}</span>
        <span>Expenses {report.summary.expensesImported}</span>
        <span>Payments {report.summary.paymentsImported}</span>
        <span>Blocked {report.summary.rowsBlocked}</span>
        <span>Skipped {report.summary.rowsSkipped}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Row</th>
              <th>Code</th>
              <th>Message</th>
              <th>Action</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {report.anomalies.map((anomaly) => (
              <tr key={anomaly.id}>
                <td>{anomaly.row_number || "-"}</td>
                <td><span className={`pill ${anomaly.severity}`}>{anomaly.code}</span></td>
                <td>{anomaly.message}<div className="muted">{anomaly.policy}</div></td>
                <td>{anomaly.action}</td>
                <td>
                  <div className="status-actions">
                    <span>{anomaly.resolution_status}</span>
                    {anomaly.resolution_status === "pending_approval" && (
                      <>
                        <button className="icon-button" title="Approve" onClick={() => setResolution(anomaly.id, "approved")}><Check size={14} /></button>
                        <button className="icon-button" title="Reject" onClick={() => setResolution(anomaly.id, "rejected")}><X size={14} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {report.anomalies.length === 0 && (
              <tr><td colSpan="5" className="muted">No anomalies</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Members({ groupId, memberships, onChanged }) {
  const [form, setForm] = useState({ displayName: "", joinedOn: today, leftOn: "" });
  async function add(event) {
    event.preventDefault();
    await api(`/api/groups/${groupId}/memberships`, { method: "POST", body: form });
    setForm({ displayName: "", joinedOn: today, leftOn: "" });
    onChanged();
  }
  return (
    <div className="stack">
      <section className="panel">
        <h3>Add membership</h3>
        <form className="member-form" onSubmit={add}>
          <label>Name<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required /></label>
          <label>Joined<input type="date" value={form.joinedOn} onChange={(event) => setForm({ ...form, joinedOn: event.target.value })} required /></label>
          <label>Left<input type="date" value={form.leftOn} onChange={(event) => setForm({ ...form, leftOn: event.target.value })} /></label>
          <button className="primary-button"><Plus size={16} /> Add</button>
        </form>
      </section>
      <section className="panel">
        <h3>Membership windows</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Joined</th><th>Left</th><th></th></tr></thead>
            <tbody>
              {memberships.map((membership) => (
                <MembershipRow key={membership.id} membership={membership} onChanged={onChanged} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MembershipRow({ membership, onChanged }) {
  const [joinedOn, setJoinedOn] = useState(membership.joined_on);
  const [leftOn, setLeftOn] = useState(membership.left_on || "");
  return (
    <tr>
      <td>{membership.display_name}</td>
      <td><input type="date" value={joinedOn} onChange={(event) => setJoinedOn(event.target.value)} /></td>
      <td><input type="date" value={leftOn} onChange={(event) => setLeftOn(event.target.value)} /></td>
      <td className="right">
        <button className="icon-button" title="Save membership" onClick={async () => {
          await api(`/api/memberships/${membership.id}`, { method: "PATCH", body: { joinedOn, leftOn } });
          onChanged();
        }}>
          <Check size={14} />
        </button>
      </td>
    </tr>
  );
}

function money(minor) {
  return `INR ${number(Number(minor || 0) / 100)}`;
}

function number(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

createRoot(document.getElementById("root")).render(<App />);
