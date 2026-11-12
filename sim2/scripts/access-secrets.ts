// Turns the supporters' password into the two Fly secrets of online/access.ts and
// stages them on the test-table app (they take effect with the next `fly deploy`).
//
//   cd sim2
//   node --experimental-strip-types scripts/access-secrets.ts            # asks twice, then runs fly
//   node --experimental-strip-types scripts/access-secrets.ts --print    # only shows the fly command
//
// The password is typed without echo and is never written anywhere: only its scrypt
// hash goes to Fly. A fresh cookie secret is made each run, so re-running it (for a
// new password) also signs everyone out.
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DEFAULT_COST, hashPassword } from "../online/access.ts";

const APP = "onmyo-fujin-eee5ac";
const MIN_LEN = 8;

const readHidden = (prompt: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    if (!stdin.isTTY) {
      // piped input: the first line
      let buf = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (c: string) => (buf += c));
      stdin.on("end", () => resolve(buf.split(/\r?\n/)[0] ?? ""));
      stdin.on("error", reject);
      return;
    }
    let text = "";
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(text);
          return;
        }
        if (ch === "\u0003") {
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (text.length > 0) {
            text = text.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else {
          text += ch;
          process.stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });

const main = async (): Promise<void> => {
  const printOnly = process.argv.includes("--print");
  const pw = await readHidden("支援者用のパスワード: ");
  if (pw.trim().length < MIN_LEN) {
    console.error(`パスワードは${MIN_LEN}文字以上にしてください。`);
    process.exit(1);
  }
  if (process.stdin.isTTY) {
    const again = await readHidden("もう一度: ");
    if (again !== pw) {
      console.error("2回の入力が違います。やり直してください。");
      process.exit(1);
    }
  }
  const hash = hashPassword(pw, { cost: DEFAULT_COST });
  const secret = randomBytes(32).toString("base64url");
  const args = ["secrets", "set", "--stage", "-a", APP, `ACCESS_PASSWORD_HASH=${hash}`, `ACCESS_COOKIE_SECRET=${secret}`];
  if (printOnly) {
    console.log(`\n次の1行をそのまま打ってください:\n\nfly ${args.join(" ")}\n`);
    return;
  }
  console.log(`\n${APP} に登録します(次の fly deploy で有効になります)...`);
  const r = spawnSync("fly", args, { stdio: "inherit" });
  if (r.error !== undefined || r.status !== 0) {
    console.error("\nfly が動きませんでした。次の1行を手で打ってください:\n");
    console.error(`fly ${args.join(" ")}\n`);
    process.exit(1);
  }
  console.log("\n登録しました。続けて fly deploy --ha=false を打ってください。");
};

await main();
