const KEY = "calorie-app-v1";
const MEALS = [
  { id: "breakfast", title: "Завтрак", hint: "утро" },
  { id: "lunch", title: "Обед", hint: "день" },
  { id: "dinner", title: "Ужин", hint: "вечер" },
  { id: "snack", title: "Перекус", hint: "снек" }
];

const defaultProfile = {
  name: "Я",
  sex: "female",
  age: 28,
  height: 168,
  weight: 62,
  activity: "low",
  aim: "keep",
  goals: { kcal: 2243, p: 99, f: 75, c: 293, water: 8 }
};

const state = {
  view: "today",
  date: todayKey(),
  profile: load().profile,
  days: load().days,
  customFoods: load().customFoods,
  hiddenFoods: load().hiddenFoods || [],
  foodEdits: load().foodEdits || {},
  foodCat: "Все",
  pendingMeal: "breakfast"
};

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw?.profile && raw?.days) {
      raw.profile.activity = activityLevel(raw.profile.activity);
      raw.customFoods = raw.customFoods || [];
      raw.hiddenFoods = raw.hiddenFoods || [];
      raw.foodEdits = raw.foodEdits || {};
      return raw;
    }
  } catch {}
  return { profile: structuredClone(defaultProfile), days: {}, customFoods: [] };
}

function save() {
  localStorage.setItem(KEY, JSON.stringify({
    profile: state.profile,
    days: state.days,
    customFoods: state.customFoods,
    hiddenFoods: state.hiddenFoods,
    foodEdits: state.foodEdits
  }));
}

function dayDistance(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const start = Date.UTC(ay, am - 1, ad);
  const end = Date.UTC(by, bm - 1, bd);
  return Math.round(Math.abs(start - end) / 86400000);
}

function cheatStatus(date = state.date) {
  const on = Boolean(state.days[date]?.cheat);
  let next = "";
  let later = false;
  for (const [key, log] of Object.entries(state.days)) {
    if (!log?.cheat || key === date || dayDistance(key, date) >= 7) continue;
    if (key > date) later = true;
    const candidate = shiftDateKey(key, 7);
    if (!next || candidate > next) next = candidate;
  }
  return { on, locked: !on && Boolean(next), next, later };
}

function shiftDateKey(key, delta) {
  const d = new Date(key + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return todayKey(d);
}

function day(date = state.date) {
  if (!state.days[date]) {
    state.days[date] = { water: 0, burned: 0, meals: { breakfast: [], lunch: [], dinner: [], snack: [] } };
  }
  return state.days[date];
}

function allFoods() {
  const hidden = new Set(state.hiddenFoods);
  const base = FOODS.filter((food) => !hidden.has(food.id)).map((food) =>
    state.foodEdits[food.id] ? { ...food, ...state.foodEdits[food.id], id: food.id } : food
  );
  return [...base, ...state.customFoods.filter((food) => !hidden.has(food.id))];
}

function esc(value) {
  const map = { "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "#39" };
  return String(value).replace(/[&<>"']/g, (char) => `&${map[char]};`);
}

function findFood(id) {
  return allFoods().find((f) => f.id === id);
}

function gramsOf(entry) {
  return Number(entry.grams) || 0;
}

function macrosOf(entry) {
  const food = findFood(entry.foodId) || entry.snapshot;
  if (!food) return { kcal: 0, p: 0, f: 0, c: 0 };
  const k = gramsOf(entry) / 100;
  return {
    kcal: food.kcal * k,
    p: food.p * k,
    f: food.f * k,
    c: food.c * k
  };
}

function dayTotals(date = state.date) {
  const d = day(date);
  const totals = { kcal: 0, p: 0, f: 0, c: 0, count: 0 };
  for (const meal of MEALS) {
    for (const entry of d.meals[meal.id]) {
      const m = macrosOf(entry);
      totals.kcal += m.kcal;
      totals.p += m.p;
      totals.f += m.f;
      totals.c += m.c;
      totals.count += 1;
    }
  }
  return totals;
}

function mealTotals(mealId) {
  return day().meals[mealId].reduce((acc, e) => {
    const m = macrosOf(e);
    acc.kcal += m.kcal;
    acc.p += m.p;
    acc.f += m.f;
    acc.c += m.c;
    return acc;
  }, { kcal: 0, p: 0, f: 0, c: 0 });
}

function fmt(n, digits = 0) {
  return Number(n).toLocaleString("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function shiftDate(delta) {
  const d = new Date(state.date + "T12:00:00");
  d.setDate(d.getDate() + delta);
  state.date = todayKey(d);
  renderToday();
}

function dateLabel() {
  const d = new Date(state.date + "T12:00:00");
  if (state.date === todayKey()) return "Сегодня";
  if (state.date === todayKey(new Date(Date.now() - 86400000))) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

function setRing(eaten, goal) {
  const circle = document.getElementById("cal-ring");
  const leftEl = document.getElementById("cal-left");
  const label = document.getElementById("cal-left-label");
  const max = 339;
  const ratio = goal ? Math.min(eaten / goal, 1.15) : 0;
  circle.style.strokeDashoffset = String(max - Math.min(ratio, 1) * max);
  const left = Math.round(goal - eaten);
  if (left >= 0) {
    leftEl.textContent = fmt(left);
    label.textContent = "осталось";
    circle.style.stroke = "#8fde7a";
  } else {
    leftEl.textContent = fmt(Math.abs(left));
    label.textContent = "сверх нормы";
    circle.style.stroke = "#ff8a6a";
  }
}

function setBar(id, value, goal) {
  const pct = goal ? Math.min((value / goal) * 100, 100) : 0;
  document.getElementById(id).style.width = pct + "%";
}

function renderToday() {
  const totals = dayTotals();
  const g = state.profile.goals;
  const burned = day().burned || 0;
  const cheat = cheatStatus();
  document.getElementById("greeting").textContent = greeting() + ", " + (state.profile.name || "друг");
  document.getElementById("page-title").textContent = "Калории";
  document.getElementById("date-label").textContent = dateLabel();
  document.getElementById("avatar-letter").textContent = (state.profile.name || "Я").slice(0, 1).toUpperCase();
  document.getElementById("cal-goal").textContent = fmt(g.kcal);
  document.getElementById("cal-eaten").textContent = fmt(totals.kcal);
  document.getElementById("cal-burned").textContent = fmt(burned);
  setRing(cheat.on ? 0 : totals.kcal - burned, g.kcal);
  if (cheat.on) {
    document.getElementById("cal-left-label").textContent = "не в счёт";
    document.getElementById("cal-ring").style.stroke = "#f0c36a";
  }
  document.getElementById("p-text").textContent = `${fmt(totals.p)} / ${fmt(g.p)} г`;
  document.getElementById("f-text").textContent = `${fmt(totals.f)} / ${fmt(g.f)} г`;
  document.getElementById("c-text").textContent = `${fmt(totals.c)} / ${fmt(g.c)} г`;
  setBar("p-bar", totals.p, g.p);
  setBar("f-bar", totals.f, g.f);
  setBar("c-bar", totals.c, g.c);
  const dock = document.getElementById("cheat-dock");
  dock.classList.toggle("on", cheat.on);
  dock.disabled = cheat.locked;
  dock.setAttribute("aria-checked", cheat.on ? "true" : "false");
  document.getElementById("cheat-hint").textContent = cheat.on
    ? "Калории этого дня не учитываются"
    : cheat.locked
      ? cheat.later
        ? "В соседние дни чит-мил уже включён"
        : "Следующий чит-мил — " + new Date(cheat.next + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
      : "Калории за этот день не пойдут в норму";
  renderWater();
  renderMeals();
}

function renderWater() {
  const goal = state.profile.goals.water;
  const now = day().water;
  document.getElementById("water-now").textContent = now;
  document.getElementById("water-goal").textContent = goal;
  document.getElementById("glasses").innerHTML = Array.from({ length: goal }, (_, i) =>
    `<button class="glass ${i < now ? "on" : ""}" data-n="${i + 1}" type="button" aria-label="Стакан ${i + 1}"></button>`
  ).join("");
}

function renderMeals() {
  document.getElementById("meals").innerHTML = MEALS.map((meal) => {
    const items = day().meals[meal.id];
    const t = mealTotals(meal.id);
    const list = items.map((entry, idx) => {
      const food = findFood(entry.foodId) || entry.snapshot || { name: "Продукт" };
      const m = macrosOf(entry);
      return `<div class="entry">
        <div><b>${food.name}</b><small>${fmt(entry.grams)} г · Б ${fmt(m.p, 1)} Ж ${fmt(m.f, 1)} У ${fmt(m.c, 1)}</small></div>
        <div>${fmt(m.kcal)} ккал</div>
        <button class="x" data-remove="${meal.id}:${idx}" type="button">×</button>
      </div>`;
    }).join("");
    return `<article class="meal card">
      <div class="meal-head">
        <h3>${meal.title}</h3>
        <span class="meal-kcal">${fmt(t.kcal)} ккал</span>
      </div>
      ${list}
      <button class="meal-add" data-add="${meal.id}" type="button">+ Добавить в ${meal.title.toLowerCase()}</button>
    </article>`;
  }).join("");
}

function renderFoods() {
  const q = (document.getElementById("food-search").value || "").trim().toLowerCase();
  const cats = ["Все", ...Array.from(new Set(allFoods().map((f) => f.cat)))];
  document.getElementById("food-cats").innerHTML = cats.map((c) =>
    `<button class="chip ${state.foodCat === c ? "on" : ""}" data-cat="${c}" type="button">${c}</button>`
  ).join("");
  const list = allFoods().filter((f) => {
    const catOk = state.foodCat === "Все" || f.cat === state.foodCat;
    const qOk = !q || f.name.toLowerCase().includes(q);
    return catOk && qOk;
  });
  document.getElementById("food-list").innerHTML = `
    <button class="meal-add custom-add" id="add-custom" type="button">+ Свой продукт</button>
    <div class="food-list">
      ${list.map((f) => `<div class="food-item">
        <button class="food-main" data-food="${esc(f.id)}" type="button">
          <div><b>${esc(f.name)}</b><small>${esc(f.cat)} · на 100 г</small></div>
          <div class="kcal">${f.kcal} ккал</div>
        </button>
        <button class="food-act" data-edit="${esc(f.id)}" type="button" aria-label="Изменить">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.2 15.8l.45-2.15 6.35-6.35 1.7 1.7-6.35 6.35-2.15.45z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M13.7 8.15l1.7 1.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </button>
      </div>`).join("") || `<p class="food-empty">Ничего не найдено</p>`}
    </div>
  `;
}

function last7() {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(todayKey(d));
  }
  return dates;
}

function renderStats() {
  const dates = last7();
  const goal = state.profile.goals.kcal;
  const max = Math.max(goal, ...dates.map((d) => (state.days[d]?.cheat ? 0 : dayTotals(d).kcal)), 1);
  const names = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  document.getElementById("week-bars").innerHTML = dates.map((d) => {
    const t = dayTotals(d);
    const cheat = Boolean(state.days[d]?.cheat);
    const kcal = cheat ? 0 : t.kcal;
    const h = Math.max(8, (kcal / max) * 120);
    const label = names[new Date(d + "T12:00:00").getDay()];
    const color = cheat ? "#f0c36a" : t.kcal > goal ? "#ff8a6a" : "#8fde7a";
    return `<div class="wbar"><i style="height:${h}px;background:${kcal ? color : cheat ? "#f0c36a" : "#2c5342"}"></i><span>${label}</span></div>`;
  }).join("");

  const week = dates.reduce((acc, d) => {
    if (state.days[d]?.cheat) return acc;
    const t = dayTotals(d);
    acc.kcal += t.kcal;
    acc.p += t.p;
    acc.days += t.count ? 1 : 0;
    return acc;
  }, { kcal: 0, p: 0, days: 0 });

  document.getElementById("stats-grid").innerHTML = `
    <div class="stat"><span>Среднее за активные дни</span><b>${week.days ? fmt(week.kcal / week.days) : 0} ккал</b></div>
    <div class="stat"><span>Белка за неделю</span><b>${fmt(week.p)} г</b></div>
    <div class="stat"><span>Цель на день</span><b>${fmt(goal)} ккал</b></div>
    <div class="stat"><span>Записей сегодня</span><b>${dayTotals().count}</b></div>
  `;
}

function renderProfile() {
  const p = state.profile;
  document.getElementById("p-name").value = p.name;
  document.getElementById("p-sex").value = p.sex;
  document.getElementById("p-age").value = p.age;
  document.getElementById("p-height").value = p.height;
  document.getElementById("p-weight").value = p.weight;
  document.getElementById("p-activity").value = activityLevel(p.activity);
  document.getElementById("p-aim").value = p.aim;
  document.getElementById("g-cal").value = p.goals.kcal;
  document.getElementById("g-p").value = p.goals.p;
  document.getElementById("g-f").value = p.goals.f;
  document.getElementById("g-c").value = p.goals.c;
  document.getElementById("g-water").value = p.goals.water;
  document.getElementById("tdee-hint").textContent = `Текущая цель: ${fmt(p.goals.kcal)} ккал`;
}

function readProfileForm() {
  state.profile.name = document.getElementById("p-name").value.trim() || "Я";
  state.profile.sex = document.getElementById("p-sex").value;
  state.profile.age = Number(document.getElementById("p-age").value);
  state.profile.height = Number(document.getElementById("p-height").value);
  state.profile.weight = Number(document.getElementById("p-weight").value);
  state.profile.activity = activityLevel(document.getElementById("p-activity").value);
  state.profile.aim = document.getElementById("p-aim").value;
}

function activityLevel(value) {
  if (value === "inactive" || value === "low" || value === "active" || value === "very") return value;
  const factor = Number(value);
  if (!Number.isFinite(factor) || factor <= 1.3) return "inactive";
  if (factor <= 1.45) return "low";
  if (factor <= 1.65) return "active";
  return "very";
}

function maintenanceKcal(sex, age, height, weight, level) {
  const adult = {
    male: {
      inactive: [753.07, -10.83, 6.5, 14.1],
      low: [581.47, -10.83, 8.3, 14.94],
      active: [1004.82, -10.83, 6.52, 15.91],
      very: [-517.88, -10.83, 15.61, 19.11]
    },
    female: {
      inactive: [584.9, -7.01, 5.72, 11.71],
      low: [575.77, -7.01, 6.6, 12.14],
      active: [710.25, -7.01, 6.54, 12.34],
      very: [511.83, -7.01, 9.07, 12.56]
    }
  };
  const youth = {
    male: {
      inactive: [-447.51, 3.68, 13.01, 13.15, 20],
      low: [19.12, 3.68, 8.62, 20.28, 20],
      active: [-388.19, 3.68, 12.66, 20.46, 20],
      very: [-671.75, 3.68, 15.38, 23.25, 20]
    },
    female: {
      inactive: [55.59, -22.25, 8.43, 17.07, 20],
      low: [-297.54, -22.25, 12.77, 14.73, 20],
      active: [-189.55, -22.25, 11.74, 18.34, 20],
      very: [-709.59, -22.25, 18.22, 14.25, 20]
    }
  };
  if (age >= 19) {
    const [base, ageK, heightK, weightK] = adult[sex][level];
    return base + ageK * age + heightK * height + weightK * weight;
  }
  const [base, ageK, heightK, weightK, growth] = youth[sex][level];
  return base + ageK * age + heightK * height + weightK * weight + growth;
}

function calcTdee() {
  readProfileForm();
  const { sex, age, height, weight, activity, aim } = state.profile;
  const level = activityLevel(activity);
  const safeAge = Math.min(90, Math.max(12, Number(age) || 0));
  const safeHeight = Math.min(230, Math.max(120, Number(height) || 0));
  const safeWeight = Math.min(250, Math.max(30, Number(weight) || 0));
  const maintenance = maintenanceKcal(sex === "male" ? "male" : "female", safeAge, safeHeight, safeWeight, level);
  const bmr = 10 * safeWeight + 6.25 * safeHeight - 5 * safeAge + (sex === "male" ? 5 : -161);
  let target = maintenance;
  if (aim === "lose") {
    const cut = Math.min(500, maintenance * (safeAge < 18 ? 0.1 : 0.2));
    const floor = safeAge < 18 ? 1600 : sex === "male" ? 1500 : 1200;
    target = Math.min(maintenance, Math.max(floor, maintenance - cut));
  } else if (aim === "gain") {
    target = maintenance + Math.min(400, Math.max(250, maintenance * 0.1));
  }
  const refKg = Math.min(safeWeight, 25 * (safeHeight / 100) ** 2);
  const perKg = aim === "gain" ? 1.8 : aim === "lose" && safeAge >= 18 ? 2 : 1.6;
  let protein = Math.round(refKg * perKg);
  const fatMin = Math.round(safeWeight * 0.8);
  let fat = Math.round((target * (aim === "lose" ? 0.25 : 0.3)) / 9);
  const fatMax = Math.floor((target - protein * 4 - 400) / 9);
  fat = fatMax >= fatMin ? Math.min(Math.max(fat, fatMin), fatMax) : fatMin;
  let remain = target - protein * 4 - fat * 9;
  if (remain < 0) {
    protein = Math.max(Math.round(refKg * 1.2), Math.floor((target - fat * 9) / 4));
    remain = target - protein * 4 - fat * 9;
  }
  const carbs = Math.max(0, Math.round(remain / 4));
  const kcal = protein * 4 + fat * 9 + carbs * 4;
  state.profile.activity = level;
  state.profile.goals = { ...state.profile.goals, kcal, p: protein, f: fat, c: carbs };
  document.getElementById("g-cal").value = kcal;
  document.getElementById("g-p").value = protein;
  document.getElementById("g-f").value = fat;
  document.getElementById("g-c").value = carbs;
  document.getElementById("tdee-hint").textContent =
    `Обмен ${fmt(Math.round(bmr))} · расход ${fmt(Math.round(maintenance))} · цель ${fmt(kcal)} ккал. Белки ${fmt(protein)} г, жиры ${fmt(fat)} г, углеводы ${fmt(carbs)} г`;
  save();
  renderToday();
}

function showView(view) {
  state.view = view;
  ["today", "foods", "stats", "profile"].forEach((v) => {
    document.getElementById("view-" + v).classList.toggle("hidden", v !== view);
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  const titles = { today: "Калории", foods: "Продукты", stats: "Статистика", profile: "Профиль" };
  document.getElementById("page-title").textContent = titles[view];
  if (view === "foods") renderFoods();
  if (view === "stats") renderStats();
  if (view === "profile") renderProfile();
}

function openSheet(html) {
  document.getElementById("sheet-body").innerHTML = html;
  document.getElementById("sheet").classList.remove("hidden");
}

function closeSheet() {
  document.getElementById("sheet").classList.add("hidden");
}

function openAddFood(food, mealId = state.pendingMeal) {
  const defaultG = food.unitG || 100;
  openSheet(`
    <h2>${food.name}</h2>
    <p class="muted">На 100 г: ${food.kcal} ккал · Б ${food.p} · Ж ${food.f} · У ${food.c}</p>
    <label class="muted" style="display:block;margin-top:12px">Приём пищи
      <select id="add-meal">${MEALS.map((m) => `<option value="${m.id}" ${m.id === mealId ? "selected" : ""}>${m.title}</option>`).join("")}</select>
    </label>
    <div class="qty">
      <button class="qty-btn" id="g-minus" type="button">−</button>
      <input id="add-grams" type="number" min="1" max="2000" value="${defaultG}" />
      <button class="qty-btn" id="g-plus" type="button">+</button>
    </div>
    <p class="hint" id="add-preview"></p>
    <button class="btn primary" id="confirm-add" type="button">Добавить</button>
  `);
  const grams = () => Number(document.getElementById("add-grams").value) || 0;
  const preview = () => {
    const k = grams() / 100;
    document.getElementById("add-preview").textContent =
      `${fmt(food.kcal * k)} ккал · Б ${fmt(food.p * k, 1)} Ж ${fmt(food.f * k, 1)} У ${fmt(food.c * k, 1)}`;
  };
  preview();
  document.getElementById("add-grams").addEventListener("input", preview);
  document.getElementById("g-minus").onclick = () => {
    document.getElementById("add-grams").value = Math.max(1, grams() - 10);
    preview();
  };
  document.getElementById("g-plus").onclick = () => {
    document.getElementById("add-grams").value = grams() + 10;
    preview();
  };
  document.getElementById("confirm-add").onclick = () => {
    const meal = document.getElementById("add-meal").value;
    day().meals[meal].push({
      foodId: food.id,
      grams: grams(),
      snapshot: { name: food.name, kcal: food.kcal, p: food.p, f: food.f, c: food.c }
    });
    save();
    closeSheet();
    showView("today");
    renderToday();
  };
}

function openFoodForm(food) {
  const editing = Boolean(food);
  openSheet(`
    <h2>${editing ? "Изменить продукт" : "Свой продукт"}</h2>
    <label class="muted" style="display:block;margin:8px 0">Название
      <input id="cf-name" type="text" value="${esc(food?.name || "")}" placeholder="Макароны по флотски 🍝" />
    </label>
    <label class="muted" style="display:block;margin:8px 0">Калории на 100 г
      <input id="cf-kcal" type="number" min="0" step="0.1" value="${food?.kcal ?? ""}" />
    </label>
    <div class="two">
      <label class="muted">Белки, г
        <input id="cf-p" type="number" min="0" step="0.1" value="${food?.p ?? ""}" />
      </label>
      <label class="muted">Жиры, г
        <input id="cf-f" type="number" min="0" step="0.1" value="${food?.f ?? ""}" />
      </label>
    </div>
    <label class="muted" style="display:block;margin:8px 0">Углеводы, г
      <input id="cf-c" type="number" min="0" step="0.1" value="${food?.c ?? ""}" />
    </label>
    <button class="btn primary" id="save-custom" type="button">${editing ? "Сохранить" : "Сохранить и добавить"}</button>
    ${editing ? `<button class="btn danger" id="delete-food" type="button">Удалить из списка</button>` : ""}
  `);
  document.getElementById("save-custom").onclick = () => {
    const fields = {
      name: document.getElementById("cf-name").value.trim() || "Свой продукт",
      kcal: Number(document.getElementById("cf-kcal").value) || 0,
      p: Number(document.getElementById("cf-p").value) || 0,
      f: Number(document.getElementById("cf-f").value) || 0,
      c: Number(document.getElementById("cf-c").value) || 0
    };
    if (editing) {
      const custom = state.customFoods.find((item) => item.id === food.id);
      if (custom) Object.assign(custom, fields);
      else state.foodEdits[food.id] = { ...food, ...fields, id: food.id };
      save();
      closeSheet();
      renderFoods();
      return;
    }
    const created = { id: "custom-" + Date.now(), cat: "Мои", ...fields };
    state.customFoods.push(created);
    save();
    openAddFood(created, state.pendingMeal);
  };
  const deleteFood = document.getElementById("delete-food");
  if (deleteFood) {
    deleteFood.onclick = () => {
      if (!confirm(`Удалить «${food.name}» из списка?`)) return;
      const customIndex = state.customFoods.findIndex((item) => item.id === food.id);
      if (customIndex >= 0) state.customFoods.splice(customIndex, 1);
      else {
        state.hiddenFoods.push(food.id);
        delete state.foodEdits[food.id];
      }
      save();
      closeSheet();
      renderFoods();
    };
  }
}

function openBurned() {
  openSheet(`
    <h2>Сожжённые калории</h2>
    <p class="muted">Тренировка, шаги, активность за день</p>
    <input id="burn-val" type="number" min="0" max="3000" value="${day().burned || 0}" />
    <button class="btn primary" id="save-burn" type="button">Сохранить</button>
  `);
  document.getElementById("save-burn").onclick = () => {
    day().burned = Number(document.getElementById("burn-val").value) || 0;
    save();
    closeSheet();
    renderToday();
  };
}

document.body.addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (tab) showView(tab.dataset.view);

  if (e.target.id === "prev-day") shiftDate(-1);
  if (e.target.id === "next-day") shiftDate(1);
  if (e.target.id === "date-label") {
    state.date = todayKey();
    renderToday();
  }
  if (e.target.id === "btn-profile") showView("profile");
  if (e.target.id === "add-water") {
    day().water = Math.min(state.profile.goals.water, day().water + 1);
    save();
    renderWater();
  }
  const glass = e.target.closest(".glass");
  if (glass) {
    day().water = Number(glass.dataset.n);
    save();
    renderWater();
  }
  const add = e.target.closest("[data-add]");
  if (add) {
    state.pendingMeal = add.dataset.add;
    showView("foods");
    renderFoods();
  }
  const remove = e.target.closest("[data-remove]");
  if (remove) {
    const [meal, idx] = remove.dataset.remove.split(":");
    day().meals[meal].splice(Number(idx), 1);
    save();
    renderToday();
  }
  const cat = e.target.closest("[data-cat]");
  if (cat) {
    state.foodCat = cat.dataset.cat;
    renderFoods();
  }
  const editBtn = e.target.closest("[data-edit]");
  if (editBtn) {
    openFoodForm(findFood(editBtn.dataset.edit));
    return;
  }
  const foodBtn = e.target.closest("[data-food]");
  if (foodBtn) openAddFood(findFood(foodBtn.dataset.food), state.pendingMeal);
  if (e.target.id === "add-custom") openFoodForm(null);
  if (e.target.id === "sheet-close") closeSheet();
  if (e.target.id === "calc-goal") calcTdee();
  if (e.target.id === "save-goals") {
    readProfileForm();
    state.profile.goals = {
      kcal: Number(document.getElementById("g-cal").value),
      p: Number(document.getElementById("g-p").value),
      f: Number(document.getElementById("g-f").value),
      c: Number(document.getElementById("g-c").value),
      water: Number(document.getElementById("g-water").value)
    };
    save();
    document.getElementById("tdee-hint").textContent = "Цели сохранены";
    renderToday();
  }
  if (e.target.id === "reset-day") {
    delete state.days[state.date];
    save();
    renderToday();
  }
  if (e.target.id === "reset-all") {
    if (confirm("Удалить все данные приложения?")) {
      localStorage.removeItem(KEY);
      state.profile = structuredClone(defaultProfile);
      state.days = {};
      state.customFoods = [];
      state.hiddenFoods = [];
      state.foodEdits = {};
      renderToday();
      renderProfile();
    }
  }
});

document.getElementById("cheat-dock").addEventListener("click", () => {
  const status = cheatStatus();
  if (status.locked) return;
  day().cheat = !status.on;
  save();
  renderToday();
});

document.getElementById("food-search").addEventListener("input", renderFoods);
document.getElementById("cal-burned").parentElement.addEventListener("click", openBurned);

showView("today");
renderToday();

const installBtn = document.getElementById("btn-install");
let deferredPrompt = null;
const standalone =
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

if (installBtn && !standalone) installBtn.classList.remove("hidden");

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  installBtn?.classList.remove("hidden");
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  installBtn?.classList.add("hidden");
});

installBtn?.addEventListener("click", async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add("hidden");
    return;
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  openSheet(ios ? `
    <h2>На экран «Домой»</h2>
    <p>В Safari нажмите «Поделиться», затем «На экран Домой».</p>
  ` : `
    <h2>Установить</h2>
    <p>Откройте меню браузера (⋮) и выберите «Установить приложение» или «Добавить на главный экран».</p>
    <p class="muted">Страница должна быть открыта по адресу сайта, не из скачанного файла. Если пункт серый — обновите страницу ещё раз.</p>
  `);
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
