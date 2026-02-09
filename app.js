const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const bgInput = document.getElementById("bgInput");
const emptyHint = document.getElementById("emptyHint");
const modeIdeal = document.getElementById("modeIdeal");
const modeTest = document.getElementById("modeTest");
const routeSelect = document.getElementById("routeSelect");
const strokeSize = document.getElementById("strokeSize");
const tolerance = document.getElementById("tolerance");
const clickDraw = document.getElementById("clickDraw");
const smoothPathToggle = document.getElementById("smoothPath");
const refAdjustMode = document.getElementById("refAdjustMode");
const refOpacity = document.getElementById("refOpacity");
const refScale = document.getElementById("refScale");
const refRotate = document.getElementById("refRotate");
const mapScale = document.getElementById("mapScale");
const refShiftX = document.getElementById("refShiftX");
const refShiftY = document.getElementById("refShiftY");
const refReset = document.getElementById("refReset");
const clearCurrent = document.getElementById("clearCurrent");
const clearIdeal = document.getElementById("clearIdeal");
const toggleIdeal = document.getElementById("toggleIdeal");
const toggleRef = document.getElementById("toggleRef");
const toggleRefSide = document.getElementById("toggleRefSide");
const refSide = document.getElementById("refSide");
const refSideImg = document.getElementById("refSideImg");
const toggleFullscreen = document.getElementById("toggleFullscreen");
const resetFullscreen = document.getElementById("resetFullscreen");
const clearAll = document.getElementById("clearAll");
const result = document.getElementById("result");

const STORE_KEY = "dmv_routes_v1";
const DEFAULT_MAP = "assets/map.png";
const REF_IMAGES = ["assets/1.jpg", "assets/2.jpg", "assets/3.jpg"];

let bgImage = null;
let dpr = window.devicePixelRatio || 1;
let canvasCssSize = { width: 0, height: 0 };

let state = {
  mode: "ideal",
  routeIndex: 0,
  stroke: 6,
  tolerance: 6,
  clickToDraw: true,
  smoothPath: true,
  showIdealInTest: false,
  showRef: true,
  refAdjustMode: false,
  showRefSide: false,
  mapScale: 100,
  refAdjust: [
    { x: 0, y: 0, scale: 1, rotate: 0, opacity: 0.35 },
    { x: 0, y: 0, scale: 1, rotate: 0, opacity: 0.35 },
    { x: 0, y: 0, scale: 1, rotate: 0, opacity: 0.35 },
  ],
  routes: [
    { ideal: [], attempt: [] },
    { ideal: [], attempt: [] },
    { ideal: [], attempt: [] },
  ],
};

let drawing = false;
let currentPath = [];
let draggingRef = false;
let dragStart = { x: 0, y: 0 };
let dragOrigin = { x: 0, y: 0 };
let isFullscreen = false;

let refImages = [null, null, null];
let refReady = [false, false, false];

function loadState() {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    if (Array.isArray(saved.routes)) state.routes = saved.routes;
    if (typeof saved.stroke === "number") state.stroke = saved.stroke;
    if (typeof saved.tolerance === "number") state.tolerance = saved.tolerance;
    if (typeof saved.clickToDraw === "boolean") state.clickToDraw = saved.clickToDraw;
    if (typeof saved.smoothPath === "boolean") state.smoothPath = saved.smoothPath;
    if (typeof saved.showIdealInTest === "boolean") state.showIdealInTest = saved.showIdealInTest;
    if (typeof saved.showRef === "boolean") state.showRef = saved.showRef;
    if (typeof saved.refAdjustMode === "boolean") state.refAdjustMode = saved.refAdjustMode;
    if (typeof saved.showRefSide === "boolean") state.showRefSide = saved.showRefSide;
    if (typeof saved.mapScale === "number") state.mapScale = saved.mapScale;
    if (Array.isArray(saved.refAdjust) && saved.refAdjust.length === 3) state.refAdjust = saved.refAdjust;
  } catch (err) {
    console.warn("Failed to load state", err);
  }
}

function saveState() {
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      routes: state.routes,
      stroke: state.stroke,
      tolerance: state.tolerance,
      clickToDraw: state.clickToDraw,
      smoothPath: state.smoothPath,
      showIdealInTest: state.showIdealInTest,
      showRef: state.showRef,
      refAdjustMode: state.refAdjustMode,
      showRefSide: state.showRefSide,
      mapScale: state.mapScale,
      refAdjust: state.refAdjust,
    })
  );
}

function setMode(mode) {
  if (drawing || currentPath.length > 1) {
    drawing = false;
    finalizePath();
  }
  state.mode = mode;
  modeIdeal.classList.toggle("active", mode === "ideal");
  modeTest.classList.toggle("active", mode === "test");
  if (mode === "ideal") {
    result.textContent = "Ідеальний маршрут";
  } else {
    const route = getRoute();
    if (route.ideal.length > 1 && route.attempt.length > 1) {
      const ideal = denormalizePath(route.ideal);
      const attempt = denormalizePath(route.attempt);
      const { score, pass } = comparePaths(ideal, attempt);
      const pct = Math.round(score * 100);
      result.textContent = pass ? `Збіг: ${pct}%` : `Не співпало: ${pct}%`;
    } else {
      result.textContent = "Намалюй з памʼяті";
    }
  }
  updateToggleButtons();
  render();
}

function updateRoute(index) {
  if (drawing || currentPath.length > 1) {
    drawing = false;
    finalizePath();
  }
  state.routeIndex = index;
  updateRefSide();
  syncRefControls();
  render();
}

function setBackground(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      bgImage = img;
      emptyHint.style.display = "none";
      resizeCanvas();
      render();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function tryLoadDefaultMap() {
  const img = new Image();
  img.onload = () => {
    bgImage = img;
    emptyHint.style.display = "none";
    resizeCanvas();
    render();
  };
  img.onerror = () => {};
  img.src = DEFAULT_MAP;
}

function loadRefImages() {
  REF_IMAGES.forEach((src, idx) => {
    const img = new Image();
    img.onload = () => {
      refImages[idx] = img;
      refReady[idx] = true;
      updateRefSide();
      render();
    };
    img.onerror = () => {};
    img.src = src;
  });
}

function resizeCanvas() {
  if (!bgImage) return;
  const frame = canvas.parentElement.getBoundingClientRect();
  const maxWidth = frame.width;
  const fitScale = Math.min(1, maxWidth / bgImage.naturalWidth);
  const userScale = isFullscreen ? state.mapScale / 100 : 1;
  const cssWidth = Math.round(bgImage.naturalWidth * fitScale * userScale);
  const cssHeight = Math.round(bgImage.naturalHeight * fitScale * userScale);

  canvasCssSize = { width: cssWidth, height: cssHeight };
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateRefShiftLimits();
}

function getRoute() {
  return state.routes[state.routeIndex];
}

function toCanvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;
  return { x, y };
}

function addPoint(point) {
  const last = currentPath[currentPath.length - 1];
  if (last) {
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    if (dx * dx + dy * dy < 6) return;
  }
  currentPath.push(point);
}

function smoothPath(points) {
  if (points.length < 3) return points;
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    result.push({
      x: (prev.x + curr.x + next.x) / 3,
      y: (prev.y + curr.y + next.y) / 3,
    });
  }
  result.push(points[points.length - 1]);
  return result;
}

function normalizePath(path) {
  return path.map((p) => ({
    x: p.x / canvasCssSize.width,
    y: p.y / canvasCssSize.height,
  }));
}

function denormalizePath(path) {
  return path.map((p) => ({
    x: p.x * canvasCssSize.width,
    y: p.y * canvasCssSize.height,
  }));
}

function clearCurrentPath() {
  currentPath = [];
  const route = getRoute();
  if (state.mode === "ideal") {
    route.ideal = [];
    result.textContent = "Ідеальний маршрут очищено";
  } else {
    route.attempt = [];
    result.textContent = "Спроба очищена";
  }
  saveState();
  render();
}

function clearIdealPath() {
  const route = getRoute();
  route.ideal = [];
  saveState();
  render();
}

function clearAllRoutes() {
  state.routes = [
    { ideal: [], attempt: [] },
    { ideal: [], attempt: [] },
    { ideal: [], attempt: [] },
  ];
  saveState();
  render();
}

function pathLength(path) {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    len += Math.hypot(dx, dy);
  }
  return len;
}

function resamplePath(path, count) {
  if (path.length === 0) return [];
  const total = pathLength(path);
  if (total === 0) return Array(count).fill(path[0]);
  const step = total / (count - 1);
  const sampled = [path[0]];
  let dist = 0;
  let i = 1;
  let prev = path[0];
  while (i < path.length) {
    const curr = path[i];
    const segment = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (dist + segment >= step) {
      const ratio = (step - dist) / segment;
      const x = prev.x + (curr.x - prev.x) * ratio;
      const y = prev.y + (curr.y - prev.y) * ratio;
      sampled.push({ x, y });
      prev = { x, y };
      dist = 0;
    } else {
      dist += segment;
      prev = curr;
      i += 1;
    }
  }
  while (sampled.length < count) {
    sampled.push(path[path.length - 1]);
  }
  return sampled;
}

function comparePaths(ideal, attempt) {
  const samples = 200;
  const idealPts = resamplePath(ideal, samples);
  const attemptPts = resamplePath(attempt, samples);
  let totalDist = 0;
  for (let i = 0; i < samples; i++) {
    totalDist += Math.hypot(
      idealPts[i].x - attemptPts[i].x,
      idealPts[i].y - attemptPts[i].y
    );
  }
  const avgDist = totalDist / samples;
  const diag = Math.hypot(canvasCssSize.width, canvasCssSize.height);
  const normalized = avgDist / diag;
  const tol = state.tolerance / 100;
  const score = Math.max(0, 1 - normalized / tol);
  const pass = normalized <= tol;
  return { score, pass, normalized };
}

function renderPath(path, color) {
  if (path.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = state.stroke;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) {
    ctx.lineTo(path[i].x, path[i].y);
  }
  ctx.stroke();
}

function drawArrows(path, color) {
  if (path.length < 2) return;
  const spacing = 36;
  const size = Math.max(6, state.stroke + 2);
  let dist = 0;
  ctx.fillStyle = color;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg === 0) continue;
    const dx = (b.x - a.x) / seg;
    const dy = (b.y - a.y) / seg;
    let t = spacing - dist;
    while (t <= seg) {
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const angle = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, size * 0.6);
      ctx.lineTo(-size, -size * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      t += spacing;
    }
    dist = seg - (t - spacing);
  }
}

function renderPathWithArrows(path, color) {
  renderPath(path, color);
  drawArrows(path, color);
}

function renderRefOverlay() {
  if (!state.showRef || state.mode !== "ideal") return;
  const img = refImages[state.routeIndex];
  if (!img || !refReady[state.routeIndex]) return;
  const adj = state.refAdjust[state.routeIndex];
  ctx.save();
  ctx.globalAlpha = adj.opacity;
  const cx = canvasCssSize.width / 2 + adj.x;
  const cy = canvasCssSize.height / 2 + adj.y;
  ctx.translate(cx, cy);
  ctx.rotate((adj.rotate * Math.PI) / 180);
  ctx.scale(adj.scale, adj.scale);
  ctx.drawImage(img, -canvasCssSize.width / 2, -canvasCssSize.height / 2, canvasCssSize.width, canvasCssSize.height);
  ctx.restore();
}

function render() {
  if (!bgImage) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  ctx.clearRect(0, 0, canvasCssSize.width, canvasCssSize.height);
  ctx.drawImage(bgImage, 0, 0, canvasCssSize.width, canvasCssSize.height);
  renderRefOverlay();

  const route = getRoute();
  const ideal = denormalizePath(route.ideal || []);
  const attempt = denormalizePath(route.attempt || []);

  if (state.mode === "ideal") {
    renderPathWithArrows(ideal, "rgba(55, 197, 255, 0.9)");
  } else if (state.showIdealInTest) {
    renderPathWithArrows(ideal, "rgba(55, 197, 255, 0.6)");
  }
  renderPathWithArrows(attempt, "rgba(255, 179, 71, 0.9)");

  if (currentPath.length > 1) {
    renderPathWithArrows(currentPath, state.mode === "ideal" ? "rgba(55, 197, 255, 0.9)" : "rgba(255, 179, 71, 0.9)");
  }
}

function finalizePath() {
  if (!bgImage) return;
  if (currentPath.length < 2) return;
  if (state.smoothPath) {
    currentPath = smoothPath(currentPath);
  }
  const route = getRoute();
  const normalized = normalizePath(currentPath);
  if (state.mode === "ideal") {
    route.ideal = normalized;
    result.textContent = "Ідеальний маршрут збережено";
  } else {
    route.attempt = normalized;
    if (route.ideal.length < 2) {
      result.textContent = "Спочатку збережи ідеальний маршрут";
    } else {
      const ideal = denormalizePath(route.ideal);
      const attempt = denormalizePath(route.attempt);
      const { score, pass } = comparePaths(ideal, attempt);
      const pct = Math.round(score * 100);
      result.textContent = pass ? `Збіг: ${pct}%` : `Не співпало: ${pct}%`;
    }
  }
  saveState();
  currentPath = [];
  render();
}

function updateToggleButtons() {
  if (state.mode === "ideal") {
    toggleIdeal.disabled = true;
    toggleIdeal.textContent = "Ідеальний показано";
    toggleRef.disabled = false;
    toggleRef.textContent = state.showRef ? "Приховати референс" : "Показати референс";
    toggleRefSide.disabled = false;
    toggleRefSide.textContent = state.showRefSide ? "Сховати поруч" : "Референс поруч";
    return;
  }
  toggleIdeal.disabled = false;
  toggleIdeal.textContent = state.showIdealInTest ? "Приховати ідеальний" : "Показати ідеальний";
  toggleRef.disabled = true;
  toggleRef.textContent = "Референс доступний в ідеальному";
  toggleRefSide.disabled = true;
  toggleRefSide.textContent = "Референс поруч";
}

function syncRefControls() {
  const adj = state.refAdjust[state.routeIndex];
  refOpacity.value = Math.round(adj.opacity * 100);
  refScale.value = Math.round(adj.scale * 100);
  refRotate.value = Math.round(adj.rotate);
  refShiftX.value = Math.round(adj.x);
  refShiftY.value = Math.round(adj.y);
  refAdjustMode.checked = state.refAdjustMode;
  mapScale.value = state.mapScale;
}

function updateRefSide() {
  if (state.showRefSide && refReady[state.routeIndex]) {
    refSide.classList.add("active");
    refSideImg.src = REF_IMAGES[state.routeIndex];
  } else {
    refSide.classList.remove("active");
  }
}

function updateRefShiftLimits() {
  if (!canvasCssSize.width || !canvasCssSize.height) return;
  const maxX = Math.round(canvasCssSize.width * 0.3);
  const maxY = Math.round(canvasCssSize.height * 0.3);
  refShiftX.min = -maxX;
  refShiftX.max = maxX;
  refShiftY.min = -maxY;
  refShiftY.max = maxY;
  const adj = state.refAdjust[state.routeIndex];
  refShiftX.value = Math.round(adj.x);
  refShiftY.value = Math.round(adj.y);
}

canvas.addEventListener("pointerdown", (evt) => {
  if (!bgImage) return;
  evt.preventDefault();
  if (state.mode === "ideal" && state.showRef && state.refAdjustMode) {
    draggingRef = true;
    dragStart = toCanvasPoint(evt);
    const adj = state.refAdjust[state.routeIndex];
    dragOrigin = { x: adj.x, y: adj.y };
    canvas.setPointerCapture(evt.pointerId);
    return;
  }
  if (state.clickToDraw) {
    if (!drawing) {
      drawing = true;
      currentPath = [];
      canvas.setPointerCapture(evt.pointerId);
      addPoint(toCanvasPoint(evt));
    } else {
      drawing = false;
      finalizePath();
      canvas.releasePointerCapture(evt.pointerId);
    }
  } else {
    drawing = true;
    currentPath = [];
    addPoint(toCanvasPoint(evt));
  }
});

canvas.addEventListener("pointermove", (evt) => {
  evt.preventDefault();
  if (draggingRef) {
    const p = toCanvasPoint(evt);
    const dx = p.x - dragStart.x;
    const dy = p.y - dragStart.y;
    const adj = state.refAdjust[state.routeIndex];
    adj.x = dragOrigin.x + dx;
    adj.y = dragOrigin.y + dy;
    refShiftX.value = Math.round(adj.x);
    refShiftY.value = Math.round(adj.y);
    saveState();
    render();
    return;
  }
  if (!drawing) return;
  addPoint(toCanvasPoint(evt));
  render();
});

canvas.addEventListener("pointerup", () => {
  if (draggingRef) {
    draggingRef = false;
    return;
  }
  if (!drawing || state.clickToDraw) return;
  drawing = false;
  finalizePath();
});

canvas.addEventListener("pointerleave", () => {
  if (draggingRef) {
    draggingRef = false;
    return;
  }
  if (!drawing || state.clickToDraw) return;
  drawing = false;
  finalizePath();
});

canvas.addEventListener("touchstart", (evt) => evt.preventDefault(), { passive: false });
canvas.addEventListener("touchmove", (evt) => evt.preventDefault(), { passive: false });
canvas.addEventListener("touchend", (evt) => evt.preventDefault(), { passive: false });

window.addEventListener("resize", () => {
  resizeCanvas();
  render();
});

modeIdeal.addEventListener("click", () => setMode("ideal"));
modeTest.addEventListener("click", () => setMode("test"));
routeSelect.addEventListener("change", (evt) => updateRoute(Number(evt.target.value)));

strokeSize.addEventListener("input", (evt) => {
  state.stroke = Number(evt.target.value);
  saveState();
  render();
});

tolerance.addEventListener("input", (evt) => {
  state.tolerance = Number(evt.target.value);
  saveState();
});

clickDraw.addEventListener("change", (evt) => {
  state.clickToDraw = evt.target.checked;
  saveState();
});

smoothPathToggle.addEventListener("change", (evt) => {
  state.smoothPath = evt.target.checked;
  saveState();
});

refAdjustMode.addEventListener("change", (evt) => {
  state.refAdjustMode = evt.target.checked;
  saveState();
});

refOpacity.addEventListener("input", (evt) => {
  const adj = state.refAdjust[state.routeIndex];
  adj.opacity = Number(evt.target.value) / 100;
  saveState();
  render();
});

refScale.addEventListener("input", (evt) => {
  const adj = state.refAdjust[state.routeIndex];
  adj.scale = Number(evt.target.value) / 100;
  saveState();
  render();
});

refRotate.addEventListener("input", (evt) => {
  const adj = state.refAdjust[state.routeIndex];
  adj.rotate = Number(evt.target.value);
  saveState();
  render();
});

mapScale.addEventListener("input", (evt) => {
  state.mapScale = Number(evt.target.value);
  saveState();
  resizeCanvas();
  render();
});

refShiftX.addEventListener("input", (evt) => {
  const adj = state.refAdjust[state.routeIndex];
  adj.x = Number(evt.target.value);
  saveState();
  render();
});

refShiftY.addEventListener("input", (evt) => {
  const adj = state.refAdjust[state.routeIndex];
  adj.y = Number(evt.target.value);
  saveState();
  render();
});

refReset.addEventListener("click", () => {
  state.refAdjust[state.routeIndex] = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 0.35 };
  saveState();
  syncRefControls();
  render();
});

toggleIdeal.addEventListener("click", () => {
  if (state.mode === "ideal") return;
  state.showIdealInTest = !state.showIdealInTest;
  saveState();
  updateToggleButtons();
  render();
});

toggleRef.addEventListener("click", () => {
  if (state.mode !== "ideal") return;
  state.showRef = !state.showRef;
  saveState();
  updateToggleButtons();
  render();
});

toggleRefSide.addEventListener("click", () => {
  if (state.mode !== "ideal") return;
  state.showRefSide = !state.showRefSide;
  saveState();
  updateToggleButtons();
  updateRefSide();
});

toggleFullscreen.addEventListener("click", () => {
  const wrap = document.querySelector(".canvas-wrap");
  isFullscreen = !isFullscreen;
  wrap.classList.toggle("fullscreen", isFullscreen);
  document.body.classList.toggle("fullscreen", isFullscreen);
  toggleFullscreen.textContent = isFullscreen ? "Вийти з екрану" : "Повний екран";
  resizeCanvas();
  render();
});

resetFullscreen.addEventListener("click", () => {
  const wrap = document.querySelector(".canvas-wrap");
  isFullscreen = false;
  state.mapScale = 100;
  mapScale.value = state.mapScale;
  wrap.classList.remove("fullscreen");
  document.body.classList.remove("fullscreen");
  toggleFullscreen.textContent = "Повний екран";
  saveState();
  resizeCanvas();
  render();
});
bgInput.addEventListener("change", (evt) => {
  setBackground(evt.target.files[0]);
});

clearCurrent.addEventListener("click", clearCurrentPath);
clearIdeal.addEventListener("click", clearIdealPath);
clearAll.addEventListener("click", clearAllRoutes);

loadState();
strokeSize.value = state.stroke;
tolerance.value = state.tolerance;
clickDraw.checked = state.clickToDraw;
smoothPathToggle.checked = state.smoothPath;
syncRefControls();
setMode("ideal");
render();
tryLoadDefaultMap();
loadRefImages();
updateRefSide();
