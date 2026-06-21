let members = [];
let currentFilter = "all";
let currentMeeting = null;
let editingMeetingId = null;
let contacts = [];

const login = document.querySelector("#login");
const adminApp = document.querySelector("#admin-app");
const roster = document.querySelector("#roster");
const search = document.querySelector("#search");
const dialog = document.querySelector("#meeting-dialog");
const memberFields = document.querySelector("#member-fields");
const defaultEmailSubject = document.querySelector("#meeting-form").elements.emailSubject.value;
const defaultEmailBody = document.querySelector("#meeting-form").elements.emailBody.value;

function fillTimeSelect(select, max, step, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>`;
  for (let value = 0; value <= max; value += step) {
    const padded = String(value).padStart(2, "0");
    select.add(new Option(padded, padded));
  }
}

const meetingForm = document.querySelector("#meeting-form");
["eventHour", "deadlineHour"].forEach((name) => fillTimeSelect(meetingForm.elements[name], 23, 1, "Ώρα"));
["eventMinute", "deadlineMinute"].forEach((name) => fillTimeSelect(meetingForm.elements[name], 55, 5, "Λεπτά"));

async function api(path, options = {}) {
  let result;
  if (path === "/api/admin/dashboard") {
    result = await window.supabaseClient.rpc("admin_dashboard");
  } else if (options.method === "DELETE") {
    result = await window.supabaseClient.rpc("delete_meeting", { p_id: path.split("/").at(-1) });
  } else if (options.method === "POST" || options.method === "PUT") {
    const payload = JSON.parse(options.body || "{}");
    result = await window.supabaseClient.rpc("save_meeting", {
      p_meeting: payload,
      p_members: payload.members || [],
      p_id: options.method === "PUT" ? path.split("/").at(-1) : null
    });
  } else {
    throw new Error("request");
  }
  if (result.error) {
    if (/jwt|authorized|session/i.test(result.error.message)) throw new Error("unauthorized");
    throw new Error(result.error.message || "request");
  }
  return result.data;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function initials(name) { return name.split(" ").map((word) => word[0]).join("").slice(0, 2); }

function meetingTitle(meeting) {
  return meeting?.meetingNumber ? `${meeting.title} υπ' αρ. ${meeting.meetingNumber}` : meeting?.title || "";
}

function emailText(template, member) {
  const eventDate = new Date(currentMeeting.eventAt);
  const values = {
    "{προσφώνηση}": member.title || "",
    "{όνομα}": member.name.trim().split(/\s+/)[0],
    "{τίτλος}": meetingTitle(currentMeeting),
    "{αριθμός}": currentMeeting.meetingNumber || "",
    "{ημερομηνία}": eventDate.toLocaleDateString("el-GR", { dateStyle: "full" }),
    "{ώρα}": eventDate.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" }),
    "{τοποθεσία}": currentMeeting.location,
    "{link}": member.url,
    "{αποστολέας}": currentMeeting.senderEmail || ""
  };
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(key, value), template).replace(/ +([,\n])/g, "$1");
}

function renderRoster() {
  const query = search.value.trim().toLocaleLowerCase("el");
  const filtered = members.filter((member) => {
    const matchesSearch = `${member.name} ${member.email}`.toLocaleLowerCase("el").includes(query);
    const matchesFilter = currentFilter === "all" || member.attendance === currentFilter || (currentFilter === "late" && member.arrival === "late") || (currentFilter === "meal" && member.meal);
    return matchesSearch && matchesFilter;
  });
  roster.innerHTML = filtered.map((member) => {
    const label = member.attendance === "yes" ? "Θα έρθει" : member.attendance === "no" ? "Δεν θα έρθει" : "Εκκρεμεί";
    const arrival = member.arrival === "late" ? `Θα αργήσει${member.arrivalTime ? ` · ${member.arrivalTime}` : ""}` : member.arrival === "ontime" ? "Στην ώρα του/της" : "—";
    const subject = encodeURIComponent(emailText(currentMeeting.emailSubject, member));
    const body = encodeURIComponent(emailText(currentMeeting.emailBody, member));
    return `<article class="person admin-person">
      <div class="person-name"><span class="avatar">${initials(member.name)}</span><span>${member.name}<small>${member.email}</small></span></div>
      <span class="status ${member.attendance}">${label}</span>
      <span class="muted">${arrival}<br>Φαγητό: ${member.meal ? "Ναι" : "Όχι"}</span>
      <div class="member-actions"><a class="secondary email-link" href="mailto:${encodeURIComponent(member.email)}?subject=${subject}&body=${body}">Email πρόσκλησης</a><button class="secondary copy-link" data-url="${member.url}">Αντιγραφή link</button></div>
    </article>`;
  }).join("") || "<p class='muted empty-list'>Δεν βρέθηκαν μέλη.</p>";
}

async function loadDashboard() {
  try {
    const data = await api("/api/admin/dashboard");
    login.classList.add("hidden");
    adminApp.classList.remove("hidden");
    contacts = data.contacts || [];
    renderContactPicker();
    if (!data.meeting) {
      currentMeeting = null;
      members = [];
      document.querySelector("#edit-meeting").classList.add("hidden");
      document.querySelector("#delete-meeting").classList.add("hidden");
      document.querySelector("#empty-state").classList.remove("hidden");
      document.querySelector("#dashboard-content").classList.add("hidden");
      return;
    }
    document.querySelector("#empty-state").classList.add("hidden");
    document.querySelector("#dashboard-content").classList.remove("hidden");
    currentMeeting = data.meeting;
    document.querySelector("#edit-meeting").classList.remove("hidden");
    document.querySelector("#delete-meeting").classList.remove("hidden");
    document.querySelector("#admin-title").textContent = meetingTitle(data.meeting);
    document.querySelector("#admin-meta").textContent = `${new Date(data.meeting.eventAt).toLocaleString("el-GR", { dateStyle: "full", timeStyle: "short" })} · ${data.meeting.location}`;
    document.querySelector("#stat-yes").textContent = data.stats.yes;
    document.querySelector("#stat-no").textContent = data.stats.no;
    document.querySelector("#stat-pending").textContent = data.stats.pending;
    document.querySelector("#stat-meals").textContent = data.stats.meals;
    document.querySelector("#response-count").textContent = `${data.stats.yes + data.stats.no} από ${data.stats.total} μέλη απάντησαν`;
    members = data.members.map((member) => ({ ...member, url: window.publicAppUrl(member.token) }));
    renderRoster();
  } catch (error) {
    if (error.message === "unauthorized") {
      login.classList.remove("hidden");
      adminApp.classList.add("hidden");
    }
  }
}

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = new FormData(event.currentTarget).get("email").trim().toLowerCase();
  const message = document.querySelector("#login-error");
  const redirectTo = new URL("./admin.html", window.location.href).toString();
  const { error } = await window.supabaseClient.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  message.textContent = error ? `Δεν στάλθηκε ο σύνδεσμος: ${error.message}` : "Ο σύνδεσμος σύνδεσης στάλθηκε στο email σου. Άνοιξέ τον από την ίδια συσκευή.";
  message.classList.remove("hidden");
});

document.querySelector("#new-meeting").addEventListener("click", () => {
  editingMeetingId = null;
  const meetingForm = document.querySelector("#meeting-form");
  meetingForm.reset();
  meetingForm.elements.title.value = "Συμβούλιο Ηράκλειτος";
  meetingForm.elements.mealPrice.value = "15";
  meetingForm.elements.emailSubject.value = defaultEmailSubject;
  meetingForm.elements.emailBody.value = defaultEmailBody;
  document.querySelector("#dialog-eyebrow").textContent = "ΝΕΑ ΣΥΝΕΔΡΙΑ";
  document.querySelector("#save-meeting").textContent = "Δημιουργία συνεδρίας";
  resetMemberFields();
  dialog.showModal();
});
document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
document.querySelector("#refresh").addEventListener("click", loadDashboard);

function localDateTimeParts(value) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  const [day, time] = local.toISOString().slice(0, 16).split("T");
  const [hour, minute] = time.split(":");
  return { day, hour, minute };
}

function setDateTimeFields(form, prefix, value) {
  const parts = localDateTimeParts(value);
  const minuteSelect = form.elements[`${prefix}Minute`];
  if (![...minuteSelect.options].some((option) => option.value === parts.minute)) {
    minuteSelect.add(new Option(parts.minute, parts.minute));
  }
  form.elements[`${prefix}Date`].value = parts.day;
  form.elements[`${prefix}Hour`].value = parts.hour;
  minuteSelect.value = parts.minute;
}

document.querySelector("#edit-meeting").addEventListener("click", () => {
  if (!currentMeeting) return;
  editingMeetingId = currentMeeting.id;
  meetingForm.elements.title.value = currentMeeting.title;
  meetingForm.elements.meetingNumber.value = currentMeeting.meetingNumber || "";
  setDateTimeFields(meetingForm, "event", currentMeeting.eventAt);
  setDateTimeFields(meetingForm, "deadline", currentMeeting.deadline);
  meetingForm.elements.location.value = currentMeeting.location;
  meetingForm.elements.mealPrice.value = currentMeeting.mealPrice;
  meetingForm.elements.senderEmail.value = currentMeeting.senderEmail || "";
  meetingForm.elements.notificationEmail.value = currentMeeting.notificationEmail || "";
  meetingForm.elements.emailSubject.value = currentMeeting.emailSubject || defaultEmailSubject;
  meetingForm.elements.emailBody.value = currentMeeting.emailBody || defaultEmailBody;
  memberFields.replaceChildren();
  members.forEach((member) => addMemberRow(member));
  document.querySelector("#dialog-eyebrow").textContent = "ΕΠΕΞΕΡΓΑΣΙΑ ΣΥΝΕΔΡΙΑΣ";
  document.querySelector("#save-meeting").textContent = "Αποθήκευση αλλαγών";
  dialog.showModal();
});

document.querySelector("#delete-meeting").addEventListener("click", async () => {
  if (!currentMeeting) return;
  if (!confirm(`Να διαγραφεί η συνεδρία «${currentMeeting.title}»; Θα διαγραφούν και όλες οι απαντήσεις της.`)) return;
  try {
    await api(`/api/admin/meetings/${currentMeeting.id}`, { method: "DELETE" });
    await loadDashboard();
    showToast("Η συνεδρία διαγράφηκε");
  } catch {
    showToast("Η διαγραφή δεν ολοκληρώθηκε");
  }
});

document.querySelector("#meeting-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  values.eventAt = `${values.eventDate}T${values.eventHour}:${values.eventMinute}`;
  values.deadline = `${values.deadlineDate}T${values.deadlineHour}:${values.deadlineMinute}`;
  ["eventDate", "eventHour", "eventMinute", "deadlineDate", "deadlineHour", "deadlineMinute"].forEach((key) => delete values[key]);
  values.members = [...memberFields.querySelectorAll(".member-field-row")].map((row) => ({
    id: row.dataset.memberId || null,
    title: row.querySelector(".member-title-input").value,
    name: row.querySelector(".member-name-input").value.trim(),
    email: row.querySelector(".member-email-input").value.trim()
  })).filter((member) => member.name || member.email);
  const error = document.querySelector("#meeting-error");
  try {
    const path = editingMeetingId ? `/api/admin/meetings/${editingMeetingId}` : "/api/admin/meetings";
    await api(path, { method: editingMeetingId ? "PUT" : "POST", body: JSON.stringify(values) });
    dialog.close();
    event.currentTarget.reset();
    resetMemberFields();
    await loadDashboard();
    showToast(editingMeetingId ? "Οι αλλαγές αποθηκεύτηκαν" : "Η συνεδρία δημιουργήθηκε");
    editingMeetingId = null;
  } catch (requestError) {
    error.textContent = requestError.message === "request" ? "Δεν δημιουργήθηκε η συνεδρία." : requestError.message;
    error.classList.remove("hidden");
  }
});

roster.addEventListener("click", async (event) => {
  const button = event.target.closest(".copy-link");
  if (!button) return;
  const value = button.dataset.url;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      if (!document.execCommand("copy")) throw new Error();
      input.remove();
    }
    showToast("Το προσωπικό link αντιγράφηκε");
  } catch {
    if (navigator.share) await navigator.share({ title: "Πρόσκληση", url: value });
    else prompt("Αντέγραψε το προσωπικό link:", value);
  }
});

document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  currentFilter = button.dataset.filter;
  renderRoster();
}));
search.addEventListener("input", renderRoster);
function addMemberRow(values = {}) {
  const row = document.querySelector("#member-row-template").content.firstElementChild.cloneNode(true);
  row.querySelector(".member-title-input").value = values.title || "";
  row.querySelector(".member-name-input").value = values.name || "";
  row.querySelector(".member-email-input").value = values.email || "";
  if (values.id) row.dataset.memberId = values.id;
  if (values.contactId) row.dataset.contactId = values.contactId;
  memberFields.append(row);
}

function resetMemberFields() {
  memberFields.replaceChildren();
  addMemberRow();
}

document.querySelector("#add-member").addEventListener("click", () => addMemberRow());
function renderContactPicker() {
  const select = document.querySelector("#saved-contact");
  select.innerHTML = '<option value="">Επιλογή από αποθηκευμένες επαφές</option>' + contacts.map((contact) => `<option value="${contact.id}">${contact.name} · ${contact.email}</option>`).join("");
}

document.querySelector("#use-contact").addEventListener("click", () => {
  const id = Number(document.querySelector("#saved-contact").value);
  const contact = contacts.find((item) => item.id === id);
  if (!contact) return;
  const exists = [...memberFields.querySelectorAll(".member-email-input")].some((input) => input.value.toLowerCase() === contact.email.toLowerCase());
  if (exists) return showToast("Η επαφή υπάρχει ήδη στη συνεδρία");
  const emptyRow = [...memberFields.querySelectorAll(".member-field-row")].find((row) => !row.querySelector(".member-name-input").value && !row.querySelector(".member-email-input").value);
  if (emptyRow) emptyRow.remove();
  addMemberRow(contact);
});
memberFields.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-member");
  if (!button) return;
  if (memberFields.children.length === 1) {
    button.closest(".member-field-row").querySelectorAll("input").forEach((input) => { input.value = ""; });
    return;
  }
  button.closest(".member-field-row").remove();
});

resetMemberFields();

async function initializeAuth() {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (session) await loadDashboard();
}

window.supabaseClient.auth.onAuthStateChange((event, session) => {
  if (session && event === "SIGNED_IN") setTimeout(loadDashboard, 0);
});

initializeAuth();
