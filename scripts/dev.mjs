import { spawn } from "node:child_process";

const commands = [
  ["api", "node", ["server/index.js"]],
  ["web", "vite", ["--host", "127.0.0.1"]]
];

const children = commands.map(([name, command, args]) => {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" }
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`);
      shutdown(code);
    }
  });
  return child;
});

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
