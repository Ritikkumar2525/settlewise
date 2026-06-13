import { fromMinor } from "./money.js";

export function getGroupBalances(db, groupId) {
  const members = db
    .prepare(
      `SELECT m.id, m.display_name, gm.joined_on, gm.left_on
       FROM members m
       JOIN group_memberships gm ON gm.member_id = m.id
       WHERE gm.group_id = ?
       ORDER BY m.display_name`
    )
    .all(groupId);
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const balances = new Map(members.map((member) => [member.id, 0]));
  const trace = new Map(members.map((member) => [member.id, []]));

  const expenses = db
    .prepare(
      `SELECT e.*, m.display_name AS payer_name
       FROM expenses e
       JOIN members m ON m.id = e.paid_by_member_id
       WHERE e.group_id = ? AND e.status = 'posted'
       ORDER BY e.expense_date, e.id`
    )
    .all(groupId);

  for (const expense of expenses) {
    balances.set(expense.paid_by_member_id, (balances.get(expense.paid_by_member_id) ?? 0) + expense.base_amount_minor);
    trace.get(expense.paid_by_member_id)?.push({
      kind: "paid",
      date: expense.expense_date,
      description: expense.description,
      expenseId: expense.id,
      amountMinor: expense.base_amount_minor,
      runningImpactMinor: expense.base_amount_minor
    });

    const splits = db
      .prepare(
        `SELECT s.*, m.display_name
         FROM expense_splits s
         JOIN members m ON m.id = s.member_id
         WHERE s.expense_id = ?
         ORDER BY m.display_name`
      )
      .all(expense.id);
    for (const split of splits) {
      balances.set(split.member_id, (balances.get(split.member_id) ?? 0) - split.owed_minor);
      trace.get(split.member_id)?.push({
        kind: "owed",
        date: expense.expense_date,
        description: expense.description,
        expenseId: expense.id,
        amountMinor: -split.owed_minor,
        runningImpactMinor: -split.owed_minor
      });
    }
  }

  const payments = db
    .prepare(
      `SELECT p.*, from_m.display_name AS from_name, to_m.display_name AS to_name
       FROM payments p
       JOIN members from_m ON from_m.id = p.from_member_id
       JOIN members to_m ON to_m.id = p.to_member_id
       WHERE p.group_id = ?
       ORDER BY p.payment_date, p.id`
    )
    .all(groupId);

  for (const payment of payments) {
    balances.set(payment.from_member_id, (balances.get(payment.from_member_id) ?? 0) + payment.base_amount_minor);
    balances.set(payment.to_member_id, (balances.get(payment.to_member_id) ?? 0) - payment.base_amount_minor);
    trace.get(payment.from_member_id)?.push({
      kind: "payment_sent",
      date: payment.payment_date,
      description: payment.notes || `Payment to ${payment.to_name}`,
      paymentId: payment.id,
      amountMinor: payment.base_amount_minor,
      runningImpactMinor: payment.base_amount_minor
    });
    trace.get(payment.to_member_id)?.push({
      kind: "payment_received",
      date: payment.payment_date,
      description: payment.notes || `Payment from ${payment.from_name}`,
      paymentId: payment.id,
      amountMinor: -payment.base_amount_minor,
      runningImpactMinor: -payment.base_amount_minor
    });
  }

  const summaries = members.map((member) => ({
    ...member,
    balanceMinor: balances.get(member.id) ?? 0,
    balance: fromMinor(balances.get(member.id) ?? 0),
    trace: trace.get(member.id) ?? []
  }));

  return {
    members: summaries,
    settlements: simplifyDebts(summaries, memberMap)
  };
}

export function simplifyDebts(summaries, memberMap) {
  const debtors = summaries
    .filter((member) => member.balanceMinor < 0)
    .map((member) => ({ memberId: member.id, amount: -member.balanceMinor }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = summaries
    .filter((member) => member.balanceMinor > 0)
    .map((member) => ({ memberId: member.id, amount: member.balanceMinor }))
    .sort((a, b) => b.amount - a.amount);
  const settlements = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount > 0) {
      settlements.push({
        fromMemberId: debtor.memberId,
        from: memberMap.get(debtor.memberId)?.display_name,
        toMemberId: creditor.memberId,
        to: memberMap.get(creditor.memberId)?.display_name,
        amountMinor: amount,
        amount: fromMinor(amount)
      });
    }
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }

  return settlements;
}
