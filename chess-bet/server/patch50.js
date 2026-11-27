// patch50 (server): счётчик «Осталось мест» = 50 минус число созданных сообществ (пересчитывается само)
const fs = require("fs");
const f = "src/communities.ts";
let s = fs.readFileSync(f, "utf8");
if (s.includes("const made = (db.prepare(\"SELECT COUNT(*) AS n FROM communities\")")) { console.log("patch50: уже применён"); process.exit(0); }
const nl = s.includes("\r\n");
const fix = (t) => (nl ? t.replace(/\n/g, "\r\n") : t);
function once(a, b, label) {
  const A = fix(a), B = fix(b);
  const i = s.indexOf(A);
  if (i < 0 || s.indexOf(A, i + 1) >= 0) { console.error("ANCHOR FAIL: " + label); process.exit(1); }
  s = s.replace(A, () => B);
}
once(`      const mine = viewer ? subInfo(viewer) : null;
      const trialAvailable = !mine;`,
`      const made = (db.prepare("SELECT COUNT(*) AS n FROM communities").get() as { n: number }).n; // места считаем по числу сообществ
      const mine = viewer ? subInfo(viewer) : null;
      const trialAvailable = !mine;`, "count");
once(`founderLeft: Math.max(0, FOUNDER_SLOTS - founders)`, `founderLeft: Math.max(0, FOUNDER_SLOTS - Math.max(founders, made))`, "left");
fs.writeFileSync(f, s);
console.log("patch50 OK");
