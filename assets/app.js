(() => {
  const API = "/api";
  const currentPage = location.pathname.split("/").pop() || "index.html";
  const publicPages = new Set(["sign-in.html", "access-request.html", "404.html"]);
  let currentUser = null;
  let backendAvailable = false;
  let toastTimer;

  const sidebar = document.querySelector(".sidebar");
  const overlay = document.querySelector(".overlay");
  const toast = document.querySelector(".toast");

  const openMenu = () => { sidebar?.classList.add("open"); overlay?.classList.add("show"); };
  const closeMenu = () => { sidebar?.classList.remove("open"); overlay?.classList.remove("show"); };
  document.querySelector("#menuBtn")?.addEventListener("click", openMenu);
  document.querySelectorAll("[data-close-menu], .overlay").forEach(element => element.addEventListener("click", closeMenu));

  function showToast(message, kind = "") {
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${kind}`.trim();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
  }

  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API}${path}`, {
        credentials: "include",
        ...options,
        headers: {
          ...(options.body ? { "content-type": "application/json" } : {}),
          ...(options.headers || {})
        }
      });
    } catch {
      throw new Error("BACKEND_OFFLINE");
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) throw new Error("BACKEND_OFFLINE");
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload.message || "The request failed.");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function setBackendStatus(mode, message) {
    const notice = document.querySelector("#backendStatus");
    const title = document.querySelector("#backendStatusTitle");
    const text = document.querySelector("#backendStatusText");
    if (!notice || !title || !text) return;
    notice.classList.remove("backend-status-live", "backend-status-offline");
    if (mode === "live") {
      notice.classList.add("backend-status-live");
      title.textContent = "Secure backend connected:";
    } else {
      notice.classList.add("backend-status-offline");
      title.textContent = "Backend not connected:";
    }
    text.textContent = ` ${message}`;
  }

  async function initializeSession() {
    try {
      const payload = await api("/auth/me");
      backendAvailable = true;
      currentUser = payload.user;
      setBackendStatus("live", "Cloudflare authentication and D1 are online.");
      applyUser(currentUser);
      installSignOut();
      return true;
    } catch (error) {
      if (error.status === 401) {
        backendAvailable = true;
        setBackendStatus("live", "Cloudflare is online. Sign in to load protected data.");
        if (!publicPages.has(currentPage)) {
          location.replace(`sign-in.html?next=${encodeURIComponent(currentPage)}`);
        }
        return false;
      }
      setBackendStatus("offline", "The static interface is online, but the Cloudflare Worker has not been deployed yet.");
      return false;
    }
  }

  function applyUser(user) {
    document.querySelectorAll(".profile strong").forEach(element => {
      element.textContent = `${user.rank} ${user.fullName}`;
    });
    document.querySelectorAll(".profile small").forEach(element => {
      element.textContent = user.role === "OWNER" ? "System Owner" : "Senior Member";
    });
    document.querySelectorAll(".avatar").forEach(element => {
      element.textContent = initials(user.fullName);
    });
    document.querySelectorAll(".badge.preview").forEach(element => {
      element.textContent = "● Live";
      element.classList.remove("preview");
    });
  }

  function installSignOut() {
    const footer = document.querySelector(".sidebar-footer");
    if (!footer || footer.querySelector(".signout-link")) return;
    const link = document.createElement("button");
    link.type = "button";
    link.className = "top-action signout-link";
    link.textContent = "Sign out";
    link.addEventListener("click", async () => {
      try { await api("/auth/logout", { method: "POST", body: "{}" }); } catch {}
      location.replace("sign-in.html");
    });
    footer.append(document.createElement("br"), link);
  }

  function initials(name) {
    return String(name || "").split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  }

  function initializeKeyboardAndPreviewActions() {
    const search = document.querySelector("#globalSearch");
    document.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        search?.focus();
      }
      if (event.key === "Escape") { closeMenu(); search?.blur(); }
    });
    search?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        showToast(`Search: ${search.value || "Enter a search term"}`);
      }
    });
    document.querySelectorAll("[data-toast]").forEach(element => {
      element.addEventListener("click", () => showToast(element.dataset.toast || "Action selected."));
    });
    document.querySelectorAll("[data-confirm]").forEach(element => {
      element.addEventListener("click", () => {
        if (confirm(element.dataset.confirm)) showToast("Confirmed.");
      });
    });
  }

  function initializeSignIn() {
    const form = document.querySelector("#signInForm");
    if (!form) return;
    const message = document.querySelector("#authMessage");
    const params = new URLSearchParams(location.search);
    if (params.get("error") === "expired" && message) {
      message.textContent = "That sign-in link is invalid, expired, or already used. Request a new one.";
      message.className = "auth-message error";
    }
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const email = form.querySelector('input[type="email"]').value.trim();
      button.disabled = true;
      if (message) {
        message.textContent = "Requesting a secure sign-in link…";
        message.className = "auth-message";
      }
      try {
        const result = await api("/auth/request-link", {
          method: "POST",
          body: JSON.stringify({ email })
        });
        if (message) {
          message.textContent = result.message;
          message.className = "auth-message success";
        }
      } catch (error) {
        if (message) {
          message.textContent = error.message === "BACKEND_OFFLINE"
            ? "The Cloudflare backend is not deployed yet."
            : error.message;
          message.className = "auth-message error";
        }
      } finally {
        button.disabled = false;
      }
    });
  }

  function initializeAccessRequest() {
    const form = document.querySelector("#accessForm");
    if (!form) return;
    const message = document.querySelector("#accessMessage");
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const data = new FormData(form);
      try {
        const result = await api("/access-requests", {
          method: "POST",
          body: JSON.stringify({
            fullName: data.get("name"),
            email: data.get("email"),
            capid: data.get("capid"),
            requestedArea: data.get("area"),
            reason: data.get("reason")
          })
        });
        if (message) {
          message.textContent = result.message;
          message.className = "auth-message field full success";
        }
        form.reset();
      } catch (error) {
        if (message) {
          message.textContent = error.message === "BACKEND_OFFLINE" ? "The Cloudflare backend is not deployed yet." : error.message;
          message.className = "auth-message field full error";
        }
      }
    });
  }

  async function initializeDashboard() {
    if (!document.querySelector("#metricOverdue") || !currentUser) return;
    try {
      const dashboard = await api("/dashboard");
      renderDashboard(dashboard);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function renderDashboard(dashboard) {
    const metrics = dashboard.metrics;
    setText("#metricOverdue", metrics.overdue);
    setText("#metricDueWeek", metrics.dueThisWeek);
    setText("#metricAwaiting", metrics.awaitingApproval);
    setText("#metricOpen", metrics.openTasks);
    setText("#metricReadiness", `${metrics.readinessScore}%`);

    const priorityRows = document.querySelector("#priorityRows");
    if (priorityRows) {
      priorityRows.innerHTML = dashboard.priorityTasks.map(task => `
        <tr>
          <td><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.description || `${formatLabel(task.priority)} priority`)}</small></td>
          <td><span class="tag blue-tag">${escapeHtml(task.functional_area_name)}</span></td>
          <td>${task.due_on ? escapeHtml(task.due_on) : "No due date"}<small>${dueText(task)}</small></td>
          <td><span class="status ${statusClass(task.status)}">${formatLabel(task.status)}</span></td>
          <td>${escapeHtml(task.owner_name || "Unassigned")}</td>
        </tr>
      `).join("") || `<tr><td colspan="5">No active tasks.</td></tr>`;
    }

    const areaGrid = document.querySelector("#areaGrid");
    if (areaGrid) {
      areaGrid.innerHTML = dashboard.areas.map(area => `
        <article>
          <span class="area-icon ${area.score >= 85 ? "green-bg" : area.score >= 70 ? "amber-bg" : "red-bg"}">▣</span>
          <div>
            <strong>${escapeHtml(area.name)}</strong>
            <small>${area.openTasks} open task${area.openTasks === 1 ? "" : "s"}</small>
            <span class="mini-progress ${area.score < 85 ? "warning-progress" : ""}"><i style="width:${area.score}%"></i></span>
          </div>
          <b>${area.score}%</b>
        </article>
      `).join("");
    }
  }

  async function initializeTasks() {
    const form = document.querySelector("#taskForm");
    if (!form || !currentUser) return;
    await refreshTasks();
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const data = new FormData(form);
      try {
        await api("/tasks", {
          method: "POST",
          body: JSON.stringify({
            title: data.get("title"),
            description: data.get("description"),
            functionalArea: data.get("functionalArea"),
            dueOn: data.get("dueOn") || null,
            priority: data.get("priority"),
            readinessWeight: Number(data.get("readinessWeight") || 2),
            requiresApproval: data.get("requiresApproval") === "on"
          })
        });
        form.reset();
        form.querySelector('[name="requiresApproval"]').checked = true;
        form.querySelector('[name="readinessWeight"]').value = "2";
        showToast("Task created.");
        await refreshTasks();
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  }

  async function refreshTasks() {
    const payload = await api("/tasks");
    const columns = {
      OPEN: document.querySelector('[data-col="open"]'),
      IN_PROGRESS: document.querySelector('[data-col="progress"]'),
      BLOCKED: document.querySelector('[data-col="progress"]'),
      AWAITING_APPROVAL: document.querySelector('[data-col="approval"]'),
      COMPLETED: document.querySelector('[data-col="done"]')
    };
    Object.values(columns).forEach(column => { if (column) column.innerHTML = ""; });

    for (const task of payload.tasks) {
      const column = columns[task.status];
      if (!column) continue;
      const card = document.createElement("article");
      card.className = "task-live-card";
      card.innerHTML = `
        <h4>${escapeHtml(task.title)}</h4>
        <p>${escapeHtml(task.description || "No description")}</p>
        <div class="task-live-meta">
          <span>${escapeHtml(task.functional_area_name)}</span>
          <span>${formatLabel(task.priority)}</span>
          <span>${task.due_on ? `Due ${escapeHtml(task.due_on)}` : "No due date"}</span>
          <span>${escapeHtml(task.owner_name || "Unassigned")}</span>
        </div>
        <div class="task-live-actions"></div>
      `;
      const actions = card.querySelector(".task-live-actions");
      for (const action of actionsFor(task)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `btn ${action.kind || ""}`.trim();
        button.textContent = action.label;
        button.addEventListener("click", async () => {
          try {
            await api(`/tasks/${encodeURIComponent(task.id)}/action`, {
              method: "POST",
              body: JSON.stringify({ action: action.value })
            });
            showToast(`Task ${action.label.toLowerCase()}.`);
            await refreshTasks();
          } catch (error) {
            showToast(error.message, "error");
          }
        });
        actions.append(button);
      }
      column.append(card);
    }
  }

  function actionsFor(task) {
    if (task.status === "OPEN") return [
      { label: "Start", value: "start", kind: "primary" },
      { label: "Submit", value: "submit" },
      { label: "Block", value: "block" }
    ];
    if (task.status === "IN_PROGRESS") return [
      { label: "Submit", value: "submit", kind: "primary" },
      { label: "Block", value: "block" }
    ];
    if (task.status === "BLOCKED") return [
      { label: "Resume", value: "start", kind: "primary" },
      { label: "Submit", value: "submit" }
    ];
    if (task.status === "AWAITING_APPROVAL" && currentUser?.role === "OWNER") return [
      { label: "Approve", value: "approve", kind: "primary" },
      { label: "Reject", value: "reject" }
    ];
    if (task.status === "COMPLETED" && currentUser?.role === "OWNER") return [
      { label: "Reopen", value: "reopen" }
    ];
    return [];
  }

  async function initializeUsers() {
    const approvedBody = document.querySelector("#approvedUserRows");
    if (!approvedBody || !currentUser || currentUser.role !== "OWNER") return;
    try {
      const [usersPayload, requestsPayload] = await Promise.all([
        api("/users"),
        api("/access-requests")
      ]);
      renderUsers(usersPayload.users, requestsPayload.requests);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function renderUsers(users, requests) {
    setText("#userSummaryPending", requests.length);
    setText("#userSummaryApproved", users.filter(user => user.status === "ACTIVE").length);
    setText("#userSummaryOwners", users.filter(user => user.role === "OWNER").length);
    setText("#userSummarySuspended", users.filter(user => user.status === "SUSPENDED").length);

    const pending = document.querySelector("#pendingAccessRows");
    if (pending) {
      pending.innerHTML = requests.map(request => `
        <tr>
          <td>${escapeHtml(request.full_name)}</td>
          <td>${escapeHtml(request.email)}</td>
          <td>${escapeHtml(request.capid)}</td>
          <td>${escapeHtml(request.requested_area || "General")}</td>
          <td>
            <button class="btn primary" data-access-action="approve" data-id="${request.id}">Approve</button>
            <button class="btn danger" data-access-action="reject" data-id="${request.id}">Reject</button>
          </td>
        </tr>
      `).join("") || `<tr><td colspan="5">No pending access requests.</td></tr>`;
      pending.querySelectorAll("[data-access-action]").forEach(button => {
        button.addEventListener("click", async () => {
          await api(`/access-requests/${encodeURIComponent(button.dataset.id)}/action`, {
            method: "POST",
            body: JSON.stringify({ action: button.dataset.accessAction })
          });
          await initializeUsers();
        });
      });
    }

    const approved = document.querySelector("#approvedUserRows");
    if (approved) {
      approved.innerHTML = users.map(user => `
        <tr>
          <td><strong>${escapeHtml(`${user.rank} ${user.full_name}`)}</strong><small>CAPID ${escapeHtml(user.capid)}</small></td>
          <td>
            <input class="input live-user-email" type="email" value="${escapeAttribute(user.email || "")}" placeholder="Add approved email" data-user-email="${user.id}">
          </td>
          <td>
            <select class="select live-select" data-user-role="${user.id}">
              <option value="MEMBER" ${user.role === "MEMBER" ? "selected" : ""}>Member</option>
              <option value="OWNER" ${user.role === "OWNER" ? "selected" : ""}>System Owner</option>
            </select>
          </td>
          <td>
            <select class="select live-select" data-user-status="${user.id}">
              <option value="PENDING_EMAIL" ${user.status === "PENDING_EMAIL" ? "selected" : ""}>Pending email</option>
              <option value="ACTIVE" ${user.status === "ACTIVE" ? "selected" : ""}>Active</option>
              <option value="SUSPENDED" ${user.status === "SUSPENDED" ? "selected" : ""}>Suspended</option>
            </select>
          </td>
          <td>${user.last_login_at ? escapeHtml(user.last_login_at.slice(0, 10)) : "Never"}</td>
          <td><button class="btn" data-save-user="${user.id}">Save</button></td>
        </tr>
      `).join("");

      approved.querySelectorAll("[data-save-user]").forEach(button => {
        button.addEventListener("click", async () => {
          const id = button.dataset.saveUser;
          const email = approved.querySelector(`[data-user-email="${id}"]`).value.trim();
          const role = approved.querySelector(`[data-user-role="${id}"]`).value;
          const status = approved.querySelector(`[data-user-status="${id}"]`).value;
          try {
            await api(`/users/${encodeURIComponent(id)}`, {
              method: "PATCH",
              body: JSON.stringify({ email: email || null, role, status })
            });
            showToast("User account updated.");
            await initializeUsers();
          } catch (error) {
            showToast(error.message, "error");
          }
        });
      });
    }
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = String(value);
  }

  function formatLabel(value) {
    return String(value || "").toLowerCase().split("_").map(part => part ? part[0].toUpperCase() + part.slice(1) : "").join(" ");
  }

  function statusClass(status) {
    if (status === "COMPLETED") return "good";
    if (status === "AWAITING_APPROVAL") return "warning";
    if (status === "BLOCKED") return "bad";
    if (status === "IN_PROGRESS") return "open";
    return "neutral";
  }

  function dueText(task) {
    if (!task.due_on) return "";
    const today = new Date().toISOString().slice(0, 10);
    if (task.due_on < today && ["OPEN", "IN_PROGRESS", "BLOCKED"].includes(task.status)) return "Overdue";
    return "";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[character]);
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  initializeKeyboardAndPreviewActions();
  initializeSignIn();
  initializeAccessRequest();

  initializeSession().then(authenticated => {
    if (!authenticated) return;
    initializeDashboard();
    initializeTasks();
    initializeUsers();
  });
})();
