// Extracts the real parseShare (and its deps) from index.html and tests it.
// Also simulates the ?text= Shortcut path end-to-end via URLSearchParams.
// Run: node test-parse.mjs
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

// Pull the exact source region: from `const MONTHS=` up to (not incl.) `const fmtDay=`.
const start = html.indexOf("const MONTHS=");
const end = html.indexOf("const fmtDay=");
if (start < 0 || end < 0) throw new Error("could not locate parse region in index.html");
const src = html.slice(start, end);

// Eval the real source in a sandbox, exposing parseShare.
// Stub the browser globals the region touches (QP/store/$) so it evaluates.
const stubs = "const location={search:''};" +
  "const document={getElementById:()=>({})};" +
  "const localStorage={getItem:()=>null,setItem:()=>{}};";
const factory = new Function(stubs + src + "\nreturn parseShare;");
const parseShare = factory();

// Simulate the page's incoming-share join over a ?text= URL (Shortcut path).
function incomingFromText(shareText) {
  const url = "https://x/?text=" + encodeURIComponent(shareText);
  const q = new URLSearchParams(new URL(url).search);
  return ["title", "text", "url"].map(k => q.get(k) || "").join("\n").trim();
}

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? "✓ " : "✗ ") + name);
  if (!ok) { console.log("   got : " + JSON.stringify(got)); console.log("   want: " + JSON.stringify(want)); }
  ok ? pass++ : fail++;
}

const yr = new Date().getFullYear();
// Pick a month/day safely in the past so the year-rollover branch never fires.
const d = new Date(); d.setDate(d.getDate() - 5);
const MN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const monthName = MN[d.getMonth()];
const day = d.getDate();
const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

// 1. Canonical format, straight through parseShare.
check("canonical score", parseShare(`www.maptap.gg ${monthName} ${day}\n98🎯 92🏆 95🏅 87🎓 100🎯\nFinal score: 943`).score, 943);
check("canonical rounds", parseShare(`www.maptap.gg ${monthName} ${day}\n98🎯 92🏆 95🏅 87🎓 100🎯\nFinal score: 943`).rounds, [98,92,95,87,100]);
check("canonical date", parseShare(`www.maptap.gg ${monthName} ${day}\n98🎯 92🏆 95🏅 87🎓 100🎯\nFinal score: 943`).date, dayKey);

// 2. Day number (15) must NOT leak into rounds.
check("date day not in rounds", parseShare(`www.maptap.gg ${monthName} ${day}\n10🎯 20🏆 30🏅\nFinal score: 500`).rounds, [10,20,30]);

// 3. Full ?text= decode path (emoji + newlines encoded by Shortcut).
const inc = incomingFromText(`www.maptap.gg ${monthName} ${day}\n98🎯 92🏆 95🏅 87🎓 100🎯\nFinal score: 943`);
check("?text= decode → score", parseShare(inc).score, 943);
check("?text= decode → rounds", parseShare(inc).rounds, [98,92,95,87,100]);

// 4. URL with digits in path must not pollute rounds.
check("url digits ignored", parseShare(`https://maptap.gg/game/12345 ${monthName} ${day}\n11🎯 22🏆\nFinal score: 777`).rounds, [11,22]);

// 5. "Final score" on a different line / different casing / spacing.
check("final score loose", parseShare(`${monthName} ${day}\nsome text\n\nFINAL   SCORE   888`).score, 888);

// 6. Bare number quick-entry.
check("bare number", parseShare("912").score, 912);

// 7. No score present → null.
check("no score → null", parseShare(`${monthName} ${day}\njust chatter`).score, null);

// 8. Rounds without a date still parse via emoji anchoring.
check("rounds via emoji, no date", parseShare(`40🎯 50🏆 60🏅\nFinal score: 150`).rounds, [40,50,60]);

// 9. Emoji variation (different emoji set) still anchors rounds.
check("different emoji set", parseShare(`${monthName} ${day}\n33🟩 44🟦 55⭐\nFinal score: 132`).rounds, [33,44,55]);

// 10. 100 kept, >100 (final) excluded from rounds.
check("100 kept as round", parseShare(`${monthName} ${day}\n100🎯 100🏆\nFinal score: 200`).rounds, [100,100]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
