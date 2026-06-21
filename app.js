const form = document.querySelector("#attendance-form");
const arrivalFields = document.querySelector("#arrival-fields");
const arrivalTimeWrap = document.querySelector("#arrival-time-wrap");
const success = document.querySelector("#success");
const token = location.pathname.match(/^\/r\/([A-Za-z0-9_-]+)$/)?.[1]
  || new URLSearchParams(location.search).get("token");

function fillTimeSelect(select, max, step, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>`;
  for (let value = 0; value <= max; value += step) {
    const padded = String(value).padStart(2, "0");
    select.add(new Option(padded, padded));
  }
}

fillTimeSelect(form.elements.arrivalHour, 23, 1, "Ώρα");
fillTimeSelect(form.elements.arrivalMinute, 55, 5, "Λεπτά");

function formatDate(value) {
  return new Intl.DateTimeFormat("el-GR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(value));
}

function setChoice(name, value) {
  if (!value) return;
  const input = form.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) {
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

async function loadInvitation() {
  if (!token) return showInvalid();
  try {
    const { data, error } = await window.supabaseClient.rpc("get_invitation", { p_token: token });
    if (error || !data) return showInvalid();
    const eventDate = new Date(data.meeting.eventAt);
    document.querySelector("#meeting-title").textContent = data.meeting.meetingNumber ? `${data.meeting.title} υπ' αρ. ${data.meeting.meetingNumber}` : data.meeting.title;
    document.querySelector("#meeting-date").textContent = formatDate(data.meeting.eventAt);
    document.querySelector("#meeting-time").textContent = eventDate.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
    document.querySelector("#meeting-location").textContent = data.meeting.location || "";
    const firstName = data.member.name.trim().split(/\s+/)[0];
    document.querySelector("#member-name").textContent = [data.member.title, firstName].filter(Boolean).join(" ");
    document.querySelector("#deadline").textContent = `Έως ${new Date(data.meeting.deadline).toLocaleDateString("el-GR")}`;
    document.querySelector("#meal-price").textContent = data.meeting.mealPrice;
    if (data.response) {
      setChoice("attendance", data.response.attendance);
      setChoice("arrival", data.response.arrival);
      setChoice("meal", data.response.meal ? "yes" : "no");
      const [arrivalHour = "", arrivalMinute = ""] = (data.response.arrivalTime || "").split(":");
      if (arrivalMinute && ![...form.elements.arrivalMinute.options].some((option) => option.value === arrivalMinute)) {
        form.elements.arrivalMinute.add(new Option(arrivalMinute, arrivalMinute));
      }
      form.elements.arrivalHour.value = arrivalHour;
      form.elements.arrivalMinute.value = arrivalMinute;
      form.elements.note.value = data.response.note || "";
    }
    document.querySelector("#loading").classList.add("hidden");
    document.querySelector("#response").classList.remove("hidden");
  } catch {
    showInvalid();
  }
}

function showInvalid() {
  document.querySelector("#loading").classList.add("hidden");
  document.querySelector("#invalid").classList.remove("hidden");
}

form.addEventListener("change", (event) => {
  if (event.target.name === "attendance") {
    const isComing = event.target.value === "yes";
    arrivalFields.classList.toggle("hidden", !isComing);
    [...form.elements.arrival].forEach((input) => { input.required = isComing; });
  }
  if (event.target.name === "arrival") {
    const isLate = event.target.value === "late";
    arrivalTimeWrap.classList.toggle("hidden", !isLate);
    form.elements.arrivalHour.required = isLate;
    form.elements.arrivalMinute.required = isLate;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#submit-button");
  const error = document.querySelector("#form-error");
  const data = Object.fromEntries(new FormData(form));
  const arrivalTime = data.arrivalHour && data.arrivalMinute ? `${data.arrivalHour}:${data.arrivalMinute}` : null;
  button.disabled = true;
  button.textContent = "Αποθήκευση…";
  error.classList.add("hidden");
  try {
    const { error: submitError } = await window.supabaseClient.rpc("submit_invitation_response", {
      p_token: token,
      p_attendance: data.attendance,
      p_arrival: data.attendance === "yes" ? data.arrival : null,
      p_arrival_time: data.attendance === "yes" && data.arrival === "late" ? arrivalTime : null,
      p_meal: data.meal === "yes",
      p_note: data.note || ""
    });
    if (submitError) throw submitError;
    form.classList.add("hidden");
    success.classList.remove("hidden");
    success.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    error.textContent = "Δεν αποθηκεύτηκε η απάντηση. Έλεγξε τη σύνδεσή σου και δοκίμασε ξανά.";
    error.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = "Υποβολή απάντησης";
  }
});

document.querySelector("#edit-response").addEventListener("click", () => {
  success.classList.add("hidden");
  form.classList.remove("hidden");
});

loadInvitation();
