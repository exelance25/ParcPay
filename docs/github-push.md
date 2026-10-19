# Pushing ParcPay to GitHub (keep the Arc Studio provenance)

The grant requires the experiment to be **built in Arc Studio**. Keep these files — they prove it:
`AGENTS.md`, `.agents/`, `bun.lock`, `scripts/self-deploy.ts`, `scripts/compass-deploy*.ts`,
`src/tracing.ts`, `src/console-capture.ts`, the `<meta name="generator" content="Arc Studio…">` tag and
the "Built with Arc Studio" badge (`src/main.tsx`), plus the original v1 code in `legacy-ui/` and `contracts/legacy/`.

Preferred: open the project in **Arc Studio** and use its GitHub export/publish so the repo is linked to Studio.
If you push manually, from the project folder (Git Bash or PowerShell):

```bash
git init
git add -A
git status            # check: no .env, no node_modules, no *.jsonl, no dist
git commit -m "ParcPay v2: Arc USDC split + scheduled payments (built with Arc Studio)"
git branch -M main
git remote add origin https://github.com/<you>/parcpay.git
git push -u origin main
```

Never use `--force`. Never commit `.env`. `.gitignore` already excludes secrets, builds and Studio logs.
