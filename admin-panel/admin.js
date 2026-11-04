const tokenKey = "synapse-admin-token";
const loginView = document.querySelector("#login-view");
const dashboard = document.querySelector("#dashboard");
const loginMessage = document.querySelector("#login-message");
const dashboardMessage = document.querySelector("#dashboard-message");
const logoutButton = document.querySelector("#logout");

const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
const date = (value) => value ? new Date(value).toLocaleDateString() : "-";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

async function api(path, options = {}) {
  const token = sessionStorage.getItem(tokenKey);
  const response = await fetch(`/api/v1/admin${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
  return payload;
}

function showLogin(message = "") {
  dashboard.classList.add("hidden");
  loginView.classList.remove("hidden");
  logoutButton.classList.add("hidden");
  loginMessage.textContent = message;
}

function showDashboard() {
  loginView.classList.add("hidden");
  dashboard.classList.remove("hidden");
  logoutButton.classList.remove("hidden");
}

function renderStats(data) {
  const stats = [
    ["Gyms", data.gyms], ["Active subscriptions", data.activeGyms], ["Trial gyms", data.trialGyms],
    ["Pending gyms", data.pendingGyms], ["Expired gyms", data.expiredGyms], ["Suspended gyms", data.suspendedGyms],
    ["Deleted gyms", data.deletedGyms], ["Total users", data.users], ["Active members", data.members],
    ["Synapse revenue", money(data.synapseRevenue)], ["Gym collections", money(data.gymCollections)],
    ["Pending / overdue invoices", data.openInvoices], ["Failed gym payments", data.failedPayments],
    ["Processed refunds", money(data.processedRefunds)],
  ];
  document.querySelector("#stats").innerHTML = stats.map(([label, value]) => `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
}

async function loadDashboard() {
  dashboardMessage.textContent = "Loading…";
  try {
    const [overview, gyms, plans, billing] = await Promise.all([
      api("/overview"), api("/gyms"), api("/plans"), api("/billing"),
    ]);
    renderStats(overview);
    const paidInvoices = billing.invoices.filter((invoice) => invoice.status === "PAID").slice(0, 20);
    document.querySelector("#recent-invoices").innerHTML = paidInvoices.map((invoice) => `<tr><td>${escapeHtml(invoice.subscription.gym.name)}</td><td>${escapeHtml(invoice.subscription.plan.name)}</td><td>${money(invoice.amount)}</td><td>${escapeHtml(invoice.status)}</td><td>${date(invoice.paidDate || invoice.createdAt)}</td></tr>`).join("") || '<tr><td colspan="5">No subscription invoices yet.</td></tr>';

    document.querySelector("#gyms-table").innerHTML = gyms.map((gym) => {
      const current = gym.currentSubscription;
      const owner = gym.owner.email || gym.owner.username;
      const state = gym.isDeleted ? "DELETED" : gym.isSuspended ? "SUSPENDED" : gym.subscriptionStatus;
      const actions = gym.isDeleted ? "-" : `<button class="${gym.isSuspended ? "secondary" : "danger"}" data-gym-status="${escapeHtml(gym.id)}" data-suspended="${!gym.isSuspended}">${gym.isSuspended ? "Restore" : "Suspend"}</button>${current?.status === "TRIALING" ? `<button class="secondary" data-trial="${escapeHtml(gym.id)}">Extend trial</button>` : ""}`;
      return `<tr><td>${escapeHtml(gym.name)}<small>${escapeHtml(owner)} · joined ${date(gym.createdAt)}</small></td><td>${gym.memberCount}</td><td>${escapeHtml(current?.plan?.name || "-")}</td><td>${escapeHtml(state)}<small>period ends ${date(current?.currentPeriodEnd)}</small></td><td>${money(gym.subscriptionRevenue)}</td><td>${money(gym.gymCollections)}</td><td>${actions}</td></tr>`;
    }).join("") || '<tr><td colspan="7">No gyms found.</td></tr>';

    document.querySelector("#plans-table").innerHTML = plans.map((plan) => `<tr><td>${escapeHtml(plan.name)}</td><td>${money(plan.price)}</td><td>${escapeHtml(plan.billingCycle)}</td><td>${escapeHtml(plan.razorpayId)}</td><td>${plan.isActive ? "Active" : "Inactive"}</td><td><button class="secondary" data-plan="${escapeHtml(plan.id)}" data-active="${!plan.isActive}">${plan.isActive ? "Deactivate" : "Activate"}</button></td></tr>`).join("") || '<tr><td colspan="6">No plans found.</td></tr>';

    document.querySelector("#invoices-table").innerHTML = billing.invoices.map((invoice) => {
      const gymName = invoice.subscription.gym.name;
      const reference = invoice.gatewayPaymentId || invoice.gatewayInvoiceId || "-";
      const refund = invoice.status === "PAID" && reference !== "-" && !invoice.refundRequest
        ? `<button class="danger" data-refund="${escapeHtml(invoice.id)}">Request full refund</button>`
        : escapeHtml(invoice.refundRequest?.status || "-");
      return `<tr><td>${escapeHtml(gymName)}</td><td>${escapeHtml(invoice.subscription.plan.name)}</td><td>${money(invoice.amount)}</td><td>${escapeHtml(invoice.status)}</td><td>${escapeHtml(reference)}</td><td>${refund}</td></tr>`;
    }).join("") || '<tr><td colspan="6">No subscription invoices.</td></tr>';

    document.querySelector("#subscriptions-table").innerHTML = billing.pendingSubscriptions.map((sub) => `<tr><td>${escapeHtml(sub.gym.name)}</td><td>${escapeHtml(sub.plan.name)}</td><td>${escapeHtml(sub.status)}</td><td>${escapeHtml(sub.renue_status)}</td><td>${date(sub.currentPeriodEnd)}</td></tr>`).join("") || '<tr><td colspan="5">No pending subscriptions.</td></tr>';
    document.querySelector("#member-payments-table").innerHTML = billing.memberPayments.map((payment) => `<tr><td>${escapeHtml(payment.gym.name)}</td><td>${escapeHtml(payment.member?.name || "-")}</td><td>${money(payment.amount)}</td><td>${escapeHtml(payment.status)}</td><td>${date(payment.dueDate)}</td></tr>`).join("") || '<tr><td colspan="5">No pending or failed gym payments.</td></tr>';
    document.querySelector("#refunds-table").innerHTML = billing.refunds.map((refund) => `<tr><td>${escapeHtml(refund.invoice.subscription.gym.name)}</td><td>${money(refund.amount)}</td><td>${escapeHtml(refund.reason)}</td><td>${escapeHtml(refund.status)}${refund.errorMessage ? `<small>${escapeHtml(refund.errorMessage)}</small>` : ""}</td><td>${escapeHtml(refund.gatewayRefundId || "-")}</td><td>${date(refund.updatedAt)}</td></tr>`).join("") || '<tr><td colspan="6">No refund requests.</td></tr>';
    dashboardMessage.textContent = "Updated just now";
  } catch (error) {
    if (/401|403|not enabled|forbidden/i.test(error.message)) {
      sessionStorage.removeItem(tokenKey);
      showLogin(error.message);
    } else {
      dashboardMessage.textContent = error.message;
    }
  }
}

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "Signing in…";
  const form = new FormData(event.currentTarget);
  try {
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || "Sign in failed");
    sessionStorage.setItem(tokenKey, payload.data.tokens.authToken);
    showDashboard();
    await loadDashboard();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem(tokenKey);
  showLogin();
});
document.querySelector("#refresh").addEventListener("click", loadDashboard);

document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".tab, .view").forEach((element) => element.classList.remove("active"));
  button.classList.add("active");
  document.querySelector(`#view-${button.dataset.tab}`).classList.add("active");
}));

document.querySelector("#plan-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api("/plans", { method: "POST", body: JSON.stringify({
      name: form.get("name"), price: Number(form.get("price")), billingCycle: form.get("billingCycle"), interval: Number(form.get("interval")),
    }) });
    event.currentTarget.reset();
    await loadDashboard();
  } catch (error) { dashboardMessage.textContent = error.message; }
});

dashboard.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  try {
    if (button.dataset.gymStatus) {
      const suspended = button.dataset.suspended === "true";
      if (!confirm(`${suspended ? "Suspend" : "Restore access for"} this gym?`)) return;
      await api(`/gyms/${encodeURIComponent(button.dataset.gymStatus)}/status`, { method: "PATCH", body: JSON.stringify({ suspended }) });
    } else if (button.dataset.trial) {
      const days = Number(prompt("Add how many trial days?", "7"));
      if (!Number.isInteger(days) || days < 1 || days > 365) return;
      await api(`/gyms/${encodeURIComponent(button.dataset.trial)}/extend-trial`, { method: "POST", body: JSON.stringify({ days }) });
    } else if (button.dataset.plan) {
      await api(`/plans/${encodeURIComponent(button.dataset.plan)}`, { method: "PATCH", body: JSON.stringify({ isActive: button.dataset.active === "true" }) });
    } else if (button.dataset.refund) {
      const reason = prompt("Reason for full refund:");
      if (!reason) return;
      if (!confirm("Initiate a full Razorpay refund for this subscription invoice?")) return;
      await api("/refunds", { method: "POST", body: JSON.stringify({ invoiceId: button.dataset.refund, reason }) });
    } else return;
    await loadDashboard();
  } catch (error) { dashboardMessage.textContent = error.message; }
});

if (sessionStorage.getItem(tokenKey)) {
  showDashboard();
  loadDashboard();
}