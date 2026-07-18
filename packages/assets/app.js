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


  const calendarState = {
    viewDate: startOfMonth(new Date()),
    selectedDate: localDateKey(new Date()),
    events: [],
    filter: "ALL",
    storageKey: "soh_calendar_events_v1"
  };

  async function initializeCalendar() {
    const grid = document.querySelector("#calendarGrid");
    if (!grid) return;

    bindCalendarControls();
    ensureLocalCalendarSeed();
    await refreshCalendar();
  }

  function bindCalendarControls() {
    document.querySelector("#calendarPrevious")?.addEventListener("click", async () => {
      calendarState.viewDate = new Date(calendarState.viewDate.getFullYear(), calendarState.viewDate.getMonth() - 1, 1);
      await refreshCalendar();
    });

    document.querySelector("#calendarNext")?.addEventListener("click", async () => {
      calendarState.viewDate = new Date(calendarState.viewDate.getFullYear(), calendarState.viewDate.getMonth() + 1, 1);
      await refreshCalendar();
    });

    document.querySelector("#calendarToday")?.addEventListener("click", async () => {
      const today = new Date();
      calendarState.viewDate = startOfMonth(today);
      calendarState.selectedDate = localDateKey(today);
      await refreshCalendar();
    });

    document.querySelector("#calendarTypeFilter")?.addEventListener("change", event => {
      calendarState.filter = event.target.value;
      renderCalendar();
    });

    document.querySelector("#newCalendarEvent")?.addEventListener("click", () => openCalendarDialog({
      eventDate: calendarState.selectedDate || localDateKey(new Date())
    }));

    document.querySelector("#addSelectedDateEvent")?.addEventListener("click", () => openCalendarDialog({
      eventDate: calendarState.selectedDate || localDateKey(new Date())
    }));

    document.querySelector("#calendarPrint")?.addEventListener("click", () => window.print());

    document.querySelector("#calendarDialogClose")?.addEventListener("click", closeCalendarDialog);
    document.querySelector("#calendarCancelEvent")?.addEventListener("click", closeCalendarDialog);
    document.querySelector("#calendarDeleteEvent")?.addEventListener("click", deleteCalendarEventFromDialog);
    document.querySelector("#calendarAllDay")?.addEventListener("change", syncCalendarTimeFields);
    document.querySelector("#calendarEventForm")?.addEventListener("submit", saveCalendarEventFromDialog);

    const dialog = document.querySelector("#calendarEventDialog");
    dialog?.addEventListener("click", event => {
      if (event.target === dialog) closeCalendarDialog();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && document.querySelector("#calendarEventDialog")?.open) {
        closeCalendarDialog();
      }
    });
  }

  async function refreshCalendar() {
    const range = calendarVisibleRange(calendarState.viewDate);
    const title = document.querySelector("#calendarMonthTitle");
    if (title) {
      title.textContent = calendarState.viewDate.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric"
      });
    }

    try {
      if (backendAvailable && currentUser) {
        const payload = await api(`/calendar/events?start=${range.start}&end=${range.end}`);
        calendarState.events = payload.events.map(normalizeCalendarEvent);
      } else {
        calendarState.events = loadLocalCalendarEvents()
          .filter(event => event.eventDate >= range.start && event.eventDate <= range.end);
      }
    } catch (error) {
      calendarState.events = loadLocalCalendarEvents()
        .filter(event => event.eventDate >= range.start && event.eventDate <= range.end);
      showToast("Calendar is using local preview storage until the backend is available.", "warning");
    }

    renderCalendar();
  }

  function renderCalendar() {
    const grid = document.querySelector("#calendarGrid");
    if (!grid) return;

    const range = calendarVisibleRange(calendarState.viewDate);
    const start = parseLocalDate(range.start);
    const todayKey = localDateKey(new Date());
    const events = filteredCalendarEvents();
    const grouped = groupCalendarEvents(events);

    grid.innerHTML = "";
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const key = localDateKey(date);
      const cellEvents = grouped.get(key) || [];
      const outside = date.getMonth() !== calendarState.viewDate.getMonth();
      const isToday = key === todayKey;
      const selected = key === calendarState.selectedDate;

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = [
        "calendar-day",
        outside ? "calendar-day-outside" : "",
        isToday ? "calendar-day-today" : "",
        selected ? "calendar-day-selected" : ""
      ].filter(Boolean).join(" ");
      cell.dataset.date = key;
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `${formatLongDate(key)}, ${cellEvents.length} event${cellEvents.length === 1 ? "" : "s"}`);

      const visibleEvents = cellEvents.slice(0, 3);
      cell.innerHTML = `
        <span class="calendar-day-number">${date.getDate()}</span>
        <span class="calendar-event-stack">
          ${visibleEvents.map(event => calendarChipMarkup(event)).join("")}
          ${cellEvents.length > 3 ? `<span class="calendar-more-events">+${cellEvents.length - 3} more</span>` : ""}
        </span>
      `;

      cell.addEventListener("click", event => {
        const chip = event.target.closest("[data-calendar-event]");
        if (chip) {
          event.preventDefault();
          event.stopPropagation();
          const calendarEvent = calendarState.events.find(item => item.id === chip.dataset.calendarEvent);
          if (calendarEvent) openCalendarDialog(calendarEvent);
          return;
        }

        calendarState.selectedDate = key;
        if (outside) calendarState.viewDate = startOfMonth(date);
        renderCalendar();
      });

      cell.addEventListener("dblclick", event => {
        if (!event.target.closest("[data-calendar-event]")) openCalendarDialog({ eventDate: key });
      });

      grid.append(cell);
    }

    renderSelectedCalendarDate();
    renderUpcomingCalendarEvents();
  }

  function calendarChipMarkup(event) {
    const time = event.allDay ? "" : event.startTime ? `${formatTime(event.startTime)} ` : "";
    return `
      <span
        class="calendar-event-chip calendar-type-${event.eventType.toLowerCase()} ${event.status === "CANCELLED" ? "calendar-event-cancelled" : ""}"
        data-calendar-event="${escapeAttribute(event.id)}"
        title="${escapeAttribute(`${time}${event.title}`)}"
      >
        <i></i><span>${escapeHtml(time)}${escapeHtml(event.title)}</span>
      </span>
    `;
  }

  function renderSelectedCalendarDate() {
    const title = document.querySelector("#selectedDateTitle");
    const summary = document.querySelector("#selectedDateSummary");
    const list = document.querySelector("#selectedDateEvents");
    if (!title || !summary || !list) return;

    const selected = calendarState.selectedDate || localDateKey(new Date());
    const events = filteredCalendarEvents()
      .filter(event => event.eventDate === selected)
      .sort(compareCalendarEvents);

    title.textContent = formatLongDate(selected);
    summary.textContent = events.length
      ? `${events.length} scheduled item${events.length === 1 ? "" : "s"}`
      : "No events scheduled. Click the plus button to add one.";

    list.innerHTML = events.map(event => `
      <button class="calendar-day-event-card" type="button" data-selected-event="${escapeAttribute(event.id)}">
        <span class="calendar-day-event-accent calendar-type-${event.eventType.toLowerCase()}"></span>
        <span class="calendar-day-event-copy">
          <strong>${escapeHtml(event.title)}</strong>
          <small>${escapeHtml(calendarEventTimeLabel(event))}</small>
          ${event.location ? `<small>⌖ ${escapeHtml(event.location)}</small>` : ""}
        </span>
        <span class="status ${calendarPreparationClass(event.preparation)}">${escapeHtml(formatLabel(event.preparation))}</span>
      </button>
    `).join("") || `<div class="calendar-empty-day"><span>□</span><p>Nothing is scheduled for this date.</p></div>`;

    list.querySelectorAll("[data-selected-event]").forEach(button => {
      button.addEventListener("click", () => {
        const event = calendarState.events.find(item => item.id === button.dataset.selectedEvent);
        if (event) openCalendarDialog(event);
      });
    });
  }

  function renderUpcomingCalendarEvents() {
    const rows = document.querySelector("#calendarUpcomingRows");
    if (!rows) return;

    const today = localDateKey(new Date());
    const upcoming = filteredCalendarEvents()
      .filter(event => event.eventDate >= today && event.status !== "CANCELLED")
      .sort(compareCalendarEvents)
      .slice(0, 12);

    rows.innerHTML = upcoming.map(event => `
      <tr data-upcoming-event="${escapeAttribute(event.id)}">
        <td>${escapeHtml(formatCompactDate(event.eventDate))}</td>
        <td><button class="calendar-table-event" type="button" data-open-event="${escapeAttribute(event.id)}">${escapeHtml(event.title)}</button></td>
        <td><span class="calendar-type-label calendar-type-${event.eventType.toLowerCase()}">${escapeHtml(formatLabel(event.eventType))}</span></td>
        <td>${escapeHtml(calendarEventTimeLabel(event))}</td>
        <td>${escapeHtml(event.ownerName || event.createdByName || "Squadron staff")}</td>
        <td><span class="status ${calendarPreparationClass(event.preparation)}">${escapeHtml(formatLabel(event.preparation))}</span></td>
      </tr>
    `).join("") || `<tr><td colspan="6">No upcoming calendar events in this view.</td></tr>`;

    rows.querySelectorAll("[data-open-event]").forEach(button => {
      button.addEventListener("click", () => {
        const event = calendarState.events.find(item => item.id === button.dataset.openEvent);
        if (event) openCalendarDialog(event);
      });
    });
  }

  function openCalendarDialog(event = {}) {
    const dialog = document.querySelector("#calendarEventDialog");
    const form = document.querySelector("#calendarEventForm");
    if (!dialog || !form) return;

    form.reset();
    form.elements.id.value = event.id || "";
    form.elements.title.value = event.title || "";
    form.elements.eventType.value = event.eventType || "MEETING";
    form.elements.eventDate.value = event.eventDate || calendarState.selectedDate || localDateKey(new Date());
    form.elements.allDay.checked = Boolean(event.allDay);
    form.elements.startTime.value = event.startTime || "";
    form.elements.endTime.value = event.endTime || "";
    form.elements.location.value = event.location || "";
    form.elements.preparation.value = event.preparation || "NONE";
    form.elements.status.value = event.status || "SCHEDULED";
    form.elements.linkUrl.value = event.linkUrl || "";
    form.elements.description.value = event.description || "";

    setText("#calendarDialogEyebrow", event.id ? formatLabel(event.eventType) : "New calendar item");
    setText("#calendarDialogTitle", event.id ? "Edit event" : "Add event");

    const deleteButton = document.querySelector("#calendarDeleteEvent");
    deleteButton?.classList.toggle("live-hidden", !event.id);

    syncCalendarTimeFields();
    dialog.showModal();
    setTimeout(() => form.elements.title.focus(), 0);
  }

  function closeCalendarDialog() {
    document.querySelector("#calendarEventDialog")?.close();
  }

  function syncCalendarTimeFields() {
    const form = document.querySelector("#calendarEventForm");
    if (!form) return;
    const allDay = form.elements.allDay.checked;
    form.elements.startTime.disabled = allDay;
    form.elements.endTime.disabled = allDay;
    if (allDay) {
      form.elements.startTime.value = "";
      form.elements.endTime.value = "";
    }
  }

  async function saveCalendarEventFromDialog(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = document.querySelector("#calendarSaveEvent");
    const id = form.elements.id.value;
    const payload = {
      title: form.elements.title.value.trim(),
      description: form.elements.description.value.trim() || null,
      eventType: form.elements.eventType.value,
      eventDate: form.elements.eventDate.value,
      startTime: form.elements.allDay.checked ? null : form.elements.startTime.value || null,
      endTime: form.elements.allDay.checked ? null : form.elements.endTime.value || null,
      allDay: form.elements.allDay.checked,
      location: form.elements.location.value.trim() || null,
      preparation: form.elements.preparation.value,
      status: form.elements.status.value,
      linkUrl: form.elements.linkUrl.value.trim() || null
    };

    if (!payload.title || !payload.eventDate) {
      showToast("Event title and date are required.", "error");
      return;
    }

    submit.disabled = true;
    try {
      if (backendAvailable && currentUser) {
        if (id) {
          await api(`/calendar/events/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          });
        } else {
          await api("/calendar/events", {
            method: "POST",
            body: JSON.stringify(payload)
          });
        }
      } else {
        saveLocalCalendarEvent({
          id: id || `local-${crypto.randomUUID?.() || Date.now()}`,
          ...payload,
          ownerName: currentUser?.fullName || "Local preview",
          createdByName: currentUser?.fullName || "Local preview"
        });
      }

      calendarState.selectedDate = payload.eventDate;
      calendarState.viewDate = startOfMonth(parseLocalDate(payload.eventDate));
      closeCalendarDialog();
      showToast(id ? "Calendar event updated." : "Calendar event created.");
      await refreshCalendar();
    } catch (error) {
      showToast(error.message === "BACKEND_OFFLINE" ? "The backend is unavailable. Try again shortly." : error.message, "error");
    } finally {
      submit.disabled = false;
    }
  }

  async function deleteCalendarEventFromDialog() {
    const form = document.querySelector("#calendarEventForm");
    const id = form?.elements.id.value;
    if (!id) return;
    if (!confirm("Delete this calendar event? This cannot be undone.")) return;

    try {
      if (backendAvailable && currentUser && !id.startsWith("local-")) {
        await api(`/calendar/events/${encodeURIComponent(id)}`, { method: "DELETE" });
      } else {
        deleteLocalCalendarEvent(id);
      }
      closeCalendarDialog();
      showToast("Calendar event deleted.");
      await refreshCalendar();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function filteredCalendarEvents() {
    if (calendarState.filter === "ALL") return [...calendarState.events];
    return calendarState.events.filter(event => event.eventType === calendarState.filter);
  }

  function normalizeCalendarEvent(event) {
    return {
      id: event.id,
      title: event.title,
      description: event.description || null,
      eventType: event.event_type || event.eventType || "OTHER",
      eventDate: event.event_date || event.eventDate,
      startTime: event.start_time ?? event.startTime ?? null,
      endTime: event.end_time ?? event.endTime ?? null,
      allDay: Boolean(event.all_day ?? event.allDay),
      location: event.location || null,
      ownerUserId: event.owner_user_id || event.ownerUserId || null,
      ownerName: event.owner_name || event.ownerName || null,
      createdByName: event.created_by_name || event.createdByName || null,
      status: event.status || "SCHEDULED",
      preparation: event.preparation || "NONE",
      linkUrl: event.link_url || event.linkUrl || null
    };
  }

  function groupCalendarEvents(events) {
    const map = new Map();
    for (const event of [...events].sort(compareCalendarEvents)) {
      if (!map.has(event.eventDate)) map.set(event.eventDate, []);
      map.get(event.eventDate).push(event);
    }
    return map;
  }

  function compareCalendarEvents(left, right) {
    return left.eventDate.localeCompare(right.eventDate)
      || Number(right.allDay) - Number(left.allDay)
      || String(left.startTime || "").localeCompare(String(right.startTime || ""))
      || left.title.localeCompare(right.title);
  }

  function calendarVisibleRange(viewDate) {
    const monthStart = startOfMonth(viewDate);
    const first = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 - monthStart.getDay());
    const last = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 41);
    return { start: localDateKey(first), end: localDateKey(last) };
  }

  function startOfMonth(value) {
    return new Date(value.getFullYear(), value.getMonth(), 1);
  }

  function parseLocalDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function localDateKey(value) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatLongDate(value) {
    return parseLocalDate(value).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  }

  function formatCompactDate(value) {
    return parseLocalDate(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });
  }

  function formatTime(value) {
    if (!value) return "";
    const [hour, minute] = value.split(":").map(Number);
    return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function calendarEventTimeLabel(event) {
    if (event.allDay) return "All day";
    if (event.startTime && event.endTime) return `${formatTime(event.startTime)}–${formatTime(event.endTime)}`;
    if (event.startTime) return formatTime(event.startTime);
    return "Time not set";
  }

  function calendarPreparationClass(preparation) {
    if (preparation === "READY") return "good";
    if (preparation === "NEEDS_ACTION") return "bad";
    if (preparation === "IN_PROGRESS") return "warning";
    return "neutral";
  }

  function loadLocalCalendarEvents() {
    try {
      return JSON.parse(localStorage.getItem(calendarState.storageKey) || "[]").map(normalizeCalendarEvent);
    } catch {
      return [];
    }
  }

  function saveLocalCalendarEvent(event) {
    const events = loadLocalCalendarEvents();
    const normalized = normalizeCalendarEvent(event);
    const index = events.findIndex(item => item.id === normalized.id);
    if (index >= 0) events[index] = normalized;
    else events.push(normalized);
    localStorage.setItem(calendarState.storageKey, JSON.stringify(events));
  }

  function deleteLocalCalendarEvent(id) {
    const events = loadLocalCalendarEvents().filter(event => event.id !== id);
    localStorage.setItem(calendarState.storageKey, JSON.stringify(events));
  }

  function ensureLocalCalendarSeed() {
    if (localStorage.getItem(calendarState.storageKey)) return;

    const today = new Date();
    const date = offset => localDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));
    const events = [
      {
        id: "local-staff-meeting",
        title: "Senior Staff Meeting",
        description: "Monthly staff coordination, open actions, and upcoming squadron requirements.",
        eventType: "MEETING",
        eventDate: date(3),
        startTime: "18:30",
        endTime: "20:30",
        allDay: false,
        location: "Anderson County Clerk's Office",
        preparation: "IN_PROGRESS",
        status: "SCHEDULED",
        ownerName: "Command Staff"
      },
      {
        id: "local-safety-report",
        title: "Monthly safety report due",
        description: "Submit the monthly safety report and attach completion evidence.",
        eventType: "DEADLINE",
        eventDate: date(4),
        startTime: null,
        endTime: null,
        allDay: true,
        location: null,
        preparation: "NEEDS_ACTION",
        status: "SCHEDULED",
        ownerName: "Safety Officer"
      },
      {
        id: "local-ae-activity",
        title: "Flight instruments lab",
        description: "Hands-on aerospace education activity.",
        eventType: "ACTIVITY",
        eventDate: date(10),
        startTime: "18:30",
        endTime: "20:00",
        allDay: false,
        location: "Squadron meeting location",
        preparation: "READY",
        status: "SCHEDULED",
        ownerName: "AE Officer"
      },
      {
        id: "local-inspection",
        title: "Quarterly records inspection",
        description: "Review staff files and required documentation.",
        eventType: "INSPECTION",
        eventDate: date(18),
        startTime: "19:00",
        endTime: "20:00",
        allDay: false,
        location: "Online",
        preparation: "IN_PROGRESS",
        status: "SCHEDULED",
        ownerName: "Administration"
      }
    ];
    localStorage.setItem(calendarState.storageKey, JSON.stringify(events));
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
    initializeCalendar();
    if (!authenticated) return;
    initializeDashboard();
    initializeTasks();
    initializeUsers();
  });
})();
