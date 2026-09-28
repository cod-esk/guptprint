# GuptPrint — Scan. Pay. Print.

**Tumhari file, tumhari privacy. Dukandar bhi nahi dekhega.**

A privacy-first self-print terminal for Indian print shops. A customer scans the shop QR, chooses a PDF, sees the page count and rate, presses **PRINT NOW**, then pays the shop directly at the counter **after** printing. GuptPrint has no online payment gateway, no commission and no customer login.

## Current demo

| URL | What it is |
| --- | --- |
| `/s/demo` | Customer self-print screen for Shree Ganesh Xerox / Sharma Xerox |
| `/owner` | Owner POS terminal — page/spec/amount only, no filename or preview |

Rates in the demo are fixed as agreed:

- B/W single-sided: **₹2/page**
- B/W dono taraf (back-to-back): **₹1.5/page**
- Full color: **₹10/page**
- Copies: 1–20

Customer accepts PDF only (max 50 MB); `pdf-lib` counts pages locally in the browser. Pricing is recalculated by the API, so it cannot be altered by changing UI values.

## Privacy rules already enforced in the demo

- No login, phone number or preview renderer.
- Owner response deliberately excludes filename and file size.
- Only job ID, page count, print options, copies and amount appear in the owner terminal.
- This MVP does **not upload PDF bytes anywhere**. It only creates volatile print metadata, so there is no customer file to inspect in the dashboard.
- Job metadata is purged from in-memory storage after 15 minutes. When real storage is introduced, the source object must have a 15-minute hard expiry plus delete-on-success (target: two minutes after print).

> **Important:** the present `PRINT NOW` flow creates a simulated queued docket. It does not yet send PDF content to a physical printer; that starts with the storage + agent integration described below. This avoids falsely claiming that a PDF was printed when no PDF was uploaded.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000/s/demo](http://localhost:3000/s/demo) and [http://localhost:3000/owner](http://localhost:3000/owner) in separate tabs.

For a phone on the same Wi-Fi:

```bash
npx next dev --hostname 0.0.0.0
```

Use the computer's LAN IP in the phone browser, for example `http://192.168.1.10:3000/s/demo`.

## GitHub → Vercel deployment (no environment variables)

1. Create an empty **private** GitHub repository named `guptprint`.
2. From this project root:
   ```bash
   git init
   git add .
   git commit -m "Build GuptPrint demo terminal"
   git branch -M main
   git remote add origin https://github.com/YOUR-GITHUB-USERNAME/guptprint.git
   git push -u origin main
   ```
3. Go to Vercel → **Add New… → Project** → import `guptprint`.
4. Keep the detected **Next.js** preset. Framework build command is `npm run build`; no environment variables are needed for this demo.
5. Deploy. Use the deployed address in the shop QR, e.g. `https://your-project.vercel.app/s/demo`.

### Vercel MVP limitation

The no-database job store is process memory. Vercel functions are stateless and may run on different instances, so a deployed demo cannot reliably share a queue between every customer and the owner dashboard. It is correct for local walkthroughs and UI validation only. **Do not operate a shop on this memory queue.** The Supabase migration is the required next production step.

## Printer Agent (built, waiting for the cloud storage bridge)

`printer-agent/` is a separate Node.js service intended for the shop PC or Raspberry Pi. It is deliberately separate from Vercel: CUPS needs USB/network access to the physical printer and must run on the shop network.

It is prepared to:

1. poll one secure job at a time;
2. download a short-lived PDF from the configured GuptPrint origin only;
3. call CUPS through `pdf-to-printer` with copies, monochrome/color and duplex options;
4. acknowledge `PRINTED` or `FAILED` to the cloud;
5. erase its local PDF in a `finally` block, including on print failure.

### Shop PC / Raspberry Pi setup

On Debian/Ubuntu/Raspberry Pi OS:

```bash
sudo apt update
sudo apt install -y cups
sudo systemctl enable --now cups
lpstat -p -d                 # note the exact CUPS printer name
```

Then install and configure the agent:

```bash
cd printer-agent
cp config.example.json config.json
# edit config.json: set cloudBaseUrl, shopId and exact printer name
npm install
npm run check
npm start
```

`config.json` is git-ignored and stays on the shop machine. It is used instead of Vercel environment variables. Do not store a customer PDF permanently on that machine.

### Agent cloud API contract

The agent is complete against this intentionally narrow contract, to be implemented alongside Supabase Storage:

```text
GET   /api/agent/jobs?shopId=demo&agentId=sharma-counter-1
      -> { jobs: [{ id, downloadUrl, pages, copies, color, duplex }] }

PATCH /api/agent/jobs/:id
      body -> { shopId, agentId, status: "PRINTED" | "FAILED", error? }
```

`downloadUrl` must be a short-lived signed URL from the **same GuptPrint origin**. The agent rejects non-HTTPS (except local development), non-PDF and off-origin URLs. The endpoint must atomically claim a queued job for an agent, otherwise two polling agents can print the same job.

## Next implementation order

1. **Deploy this UI demo** through GitHub + Vercel using the steps above.
2. **Supabase production bridge:** `shops`, `printers`, `print_jobs`, Storage bucket, signed URLs, RLS/service-side worker, expiry cleanup and agent authentication.
3. Replace the metadata-only POST with a secure PDF upload that stores no customer-accessible preview and deletes its object after print / expiry.
4. Add `/api/agent/*` claim/ack endpoints and run the agent on the shop device.
5. Test with a non-sensitive PDF: single B/W, duplex B/W, color, printer-off failure and 15-minute expiry.

No Razorpay, payment collection, UPI handling or per-print commission belongs in this project. The shop collects cash/UPI directly and marks payment after printing; GuptPrint's business model remains ₹399/month/shop SaaS.
