"use client";

import { ChangeEvent, use, useMemo, useState } from "react";
import { PDFDocument } from "pdf-lib";

type ReceiptJob = {
  id: string;
  pages: number;
  copies: number;
  color: boolean;
  duplex: boolean;
  amount: number;
  status: "QUEUED" | "PRINTED" | "PAID";
  createdAt: number;
};

const shops: Record<string, { name: string; address: string; isOnline: boolean }> = {
  demo: {
    name: "Shree Ganesh Xerox / Sharma Xerox",
    address: "Shop 4 · University Gate · Counter 1",
    isOnline: true,
  },
};

function rupees(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function TogglePill({ active, label, hint, onClick, disabled = false }: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[78px] border px-4 py-3 text-left transition active:scale-[.98] ${
        active ? "border-[#e8d4a8] bg-[#e8d4a8] text-[#111214]" : "border-white/20 bg-white/[.035] text-[#f7f5f0]"
      } ${disabled ? "line-through" : ""}`}
    >
      <span className="block text-sm font-black uppercase tracking-[.08em]">{label}</span>
      <span className="mt-1 block font-docket text-[11px] opacity-70">{hint}</span>
    </button>
  );
}

export default function PrintStation({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = use(params);
  const shop = shops[shopId] ?? shops.demo;
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [fileError, setFileError] = useState("");
  const [isCounting, setIsCounting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [color, setColor] = useState(false);
  const [duplex, setDuplex] = useState(false);
  const [copies, setCopies] = useState(1);
  const [receipt, setReceipt] = useState<ReceiptJob | null>(null);

  const rate = color ? 10 : duplex ? 1.5 : 2;
  const total = useMemo(() => pages ? Math.ceil(pages * copies * rate) : 0, [pages, copies, rate]);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    setFile(null);
    setPages(null);
    setFileError("");
    if (!picked) return;

    if (picked.type !== "application/pdf" && !picked.name.toLowerCase().endsWith(".pdf")) {
      setFileError("Abhi sirf PDF chalega. JPG/PNG next update mein.");
      return;
    }
    if (picked.size > 50 * 1024 * 1024) {
      setFileError("File 50 MB se chhoti rakho.");
      return;
    }

    try {
      setIsCounting(true);
      const bytes = await picked.arrayBuffer();
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pageCount = pdf.getPageCount();
      if (!pageCount) throw new Error("No pages");
      setFile(picked);
      setPages(pageCount);
    } catch {
      setFileError("PDF read nahi hui. Ek valid, non-password PDF try karo.");
    } finally {
      setIsCounting(false);
    }
  }

  async function printNow() {
    if (!file || !pages || isSending) return;
    setIsSending(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          fileName: file.name,
          fileSize: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
          pages,
          copies,
          color,
          duplex,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Print request failed");
      setReceipt(data.job);
    } catch {
      setFileError("Request nahi ja paayi. Network check karke phir try karo.");
    } finally {
      setIsSending(false);
    }
  }

  if (receipt) {
    return (
      <main className="terminal-grid min-h-screen bg-[#111214] px-4 py-7 text-[#f7f5f0] sm:px-6">
        <div className="mx-auto max-w-md">
          <div className="mb-5 flex items-center justify-between font-docket text-[11px] uppercase tracking-[.16em] text-white/55">
            <span>GuptPrint / Receipt</span><span>Secure job</span>
          </div>
          <section className="bg-[#f7f5f0] p-5 text-[#111214] shadow-2xl sm:p-7">
            <p className="font-docket text-[11px] font-bold uppercase tracking-[.2em]">GuptPrint</p>
            <h1 className="mt-2 text-3xl font-black uppercase leading-none tracking-tight">Print queued.</h1>
            <p className="mt-2 text-sm font-semibold">Aapki file owner ko dikhayi nahi jaayegi.</p>
            <div className="cut-line my-5" />
            <div className="grid grid-cols-2 gap-y-4 font-docket text-sm">
              <div><p className="text-[10px] font-bold uppercase tracking-widest opacity-55">Job ID</p><p className="mt-1 font-bold">{receipt.id}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-widest opacity-55">Pages</p><p className="mt-1 font-bold">{receipt.pages} × {receipt.copies}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-widest opacity-55">Mode</p><p className="mt-1 font-bold">{receipt.color ? "COLOR" : "B/W"}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-widest opacity-55">Format</p><p className="mt-1 font-bold">{receipt.duplex ? "DONO TARAF" : "SINGLE"}</p></div>
            </div>
            <div className="cut-line my-5" />
            <div className="rounded-none border-2 border-[#111214] p-4 text-center">
              <p className="font-docket text-[10px] font-bold uppercase tracking-[.18em]">Pay at counter</p>
              <p className="mt-1 font-docket text-5xl font-black tracking-tighter">{rupees(receipt.amount)}</p>
              <p className="mt-2 text-xs font-bold">Cash / UPI directly dukandar ko.</p>
            </div>
            <div className="mt-5 flex items-start gap-2 border-l-4 border-[#111214] pl-3 text-xs leading-relaxed">
              <span>▣</span><p><b>PRIVACY LOCK:</b> no login, no preview, no phone number. File print ke baad 2 min mein delete hone ke liye marked hai.</p>
            </div>
            <div className="cut-line mt-6" />
            <p className="pt-4 text-center font-docket text-[10px] uppercase tracking-[.13em] opacity-60">Scan. Pay. Print.</p>
          </section>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 w-full border border-white/20 px-4 py-3 text-sm font-black uppercase tracking-[.12em] transition hover:bg-white/[.06] active:scale-[.98]">New print</button>
        </div>
      </main>
    );
  }

  return (
    <main className="terminal-grid min-h-screen bg-[#111214] px-4 py-5 text-[#f7f5f0] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/15 pb-5">
          <div>
            <p className="font-docket text-[10px] font-bold uppercase tracking-[.2em] text-[#e8d4a8]">GuptPrint / Self print</p>
            <h1 className="mt-2 text-xl font-black uppercase tracking-tight sm:text-2xl">{shop.name}</h1>
            <p className="mt-1 font-docket text-[11px] text-white/55">{shop.address}</p>
          </div>
          <span className={`mt-1 border px-2 py-1 font-docket text-[10px] font-bold uppercase tracking-wider ${shop.isOnline ? "border-[#a9d18e] text-[#a9d18e]" : "border-red-300 text-red-300"}`}>{shop.isOnline ? "● online" : "● offline"}</span>
        </header>

        <section className="mt-6">
          <p className="font-docket text-[11px] font-bold uppercase tracking-[.16em] text-white/60">01 / File dalo</p>
          <label className="mt-3 block cursor-pointer border-2 border-dashed border-white/25 bg-white/[.035] p-5 transition hover:border-[#e8d4a8] hover:bg-white/[.06]">
            <input className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onFileChange} />
            <span className="block text-lg font-black uppercase">{isCounting ? "Pages count ho rahe hain..." : file ? "PDF locked & counted" : "Tap karke PDF choose karo"}</span>
            <span className="mt-2 block font-docket text-xs text-white/60">PDF only · max 50 MB · file ka preview kisi ko nahi dikhega</span>
            {pages && <span className="mt-4 inline-block border border-[#e8d4a8] px-3 py-1 font-docket text-sm font-bold text-[#e8d4a8]">{pages} PAGES DETECTED</span>}
          </label>
          {fileError && <p className="mt-2 border-l-2 border-red-300 pl-3 text-sm font-bold text-red-200">{fileError}</p>}
        </section>

        <section className={`mt-7 transition ${pages ? "opacity-100" : "pointer-events-none opacity-35"}`}>
          <p className="font-docket text-[11px] font-bold uppercase tracking-[.16em] text-white/60">02 / Print kaise chahiye?</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <TogglePill active={!color} label="Black & White" hint="₹2 / page single" onClick={() => setColor(false)} />
            <TogglePill active={color} label="Full Color" hint="₹10 / page" onClick={() => { setColor(true); setDuplex(false); }} />
            <TogglePill active={!duplex} label="Single sided" hint="Ek taraf print" onClick={() => setDuplex(false)} />
            <TogglePill active={duplex} label="Dono taraf" hint="₹1.5 / page · B/W only" disabled={color} onClick={() => setDuplex(true)} />
          </div>
          <div className="mt-5 flex items-center justify-between border-y border-white/15 py-4">
            <div><p className="text-sm font-black uppercase tracking-[.08em]">Copies</p><p className="mt-1 font-docket text-[11px] text-white/55">1 se 20 copies</p></div>
            <div className="flex items-center gap-3 font-docket">
              <button type="button" disabled={copies <= 1} onClick={() => setCopies((n) => n - 1)} className="h-10 w-10 border border-white/30 text-xl font-bold active:scale-95">−</button>
              <span className="w-8 text-center text-xl font-bold">{copies}</span>
              <button type="button" disabled={copies >= 20} onClick={() => setCopies((n) => n + 1)} className="h-10 w-10 border border-white/30 text-xl font-bold active:scale-95">+</button>
            </div>
          </div>
        </section>

        <section className={`mt-7 bg-[#f7f5f0] p-4 text-[#111214] transition sm:p-5 ${pages ? "opacity-100" : "opacity-35"}`}>
          <div className="flex items-end justify-between gap-4">
            <div><p className="font-docket text-[10px] font-bold uppercase tracking-[.18em] opacity-60">Total / {pages ?? 0} pages × {copies}</p><p className="mt-1 text-sm font-bold">{color ? "Color" : "B/W"} · {duplex ? "Dono taraf" : "Single sided"}</p></div>
            <p className="font-docket text-4xl font-black tracking-tighter">{rupees(total)}</p>
          </div>
          <button type="button" onClick={printNow} disabled={!pages || isSending || !shop.isOnline} className="mt-4 w-full bg-[#111214] px-4 py-4 text-base font-black uppercase tracking-[.15em] text-[#f7f5f0] transition hover:bg-[#333] active:scale-[.985]">
            {isSending ? "Printer ko bhej rahe hain..." : "Print now →"}
          </button>
          <p className="mt-3 text-center font-docket text-[10px] font-bold uppercase tracking-[.1em] opacity-55">Pehle print. Payment counter par baad mein.</p>
        </section>

        <footer className="mt-7 border-t border-white/10 pt-4 text-center font-docket text-[10px] leading-relaxed text-white/45">TUMHARI FILE, TUMHARI PRIVACY. DUKANDAR BHI NAHI DEKHEGA.</footer>
      </div>
    </main>
  );
}
