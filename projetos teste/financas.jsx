import { useState, useMemo, useEffect, useRef } from "react";

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const STORAGE_KEY = "painel_financeiro_data";
const initialState = { investments: [], deposits: [], expenses: [] };

function generateId() { return Math.random().toString(36).substr(2, 9); }

const CATEGORIES_INVEST = ["Renda Fixa","Tesouro Direto","Ações","FIIs","Criptomoedas","Poupança","Outros"];
const CATEGORIES_DEPOSIT = ["Salário","Freelance","Bônus","Aluguel Recebido","Transferência","Outros"];
const CATEGORIES_EXPENSE = ["Moradia","Alimentação","Transporte","Saúde","Educação","Lazer","Vestuário","Contas","Outros"];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw);
    return {
      investments: parsed.investments || [],
      deposits: parsed.deposits || [],
      expenses: parsed.expenses || [],
    };
  } catch { return initialState; }
}

function saveToStorage(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

const labelStyle = { display: "block", fontSize: 11, fontWeight: 700, color: "#666", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 };
const inputStyle = { width: "100%", background: "#0f0f13", border: "1px solid #ffffff15", borderRadius: 10, padding: "10px 14px", color: "#e8e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" };

export default function App() {
  const now = new Date();
  const [tab, setTab] = useState("deposits");
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(() => loadFromStorage());
  const [form, setForm] = useState({ desc: "", value: "", category: "", date: now.toISOString().split("T")[0] });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [jsPDFReady, setJsPDFReady] = useState(false);
  const [toast, setToast] = useState(null);
  const [showDataMenu, setShowDataMenu] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const importRef = useRef();

  // Auto-save to localStorage whenever data changes
  useEffect(() => { saveToStorage(data); }, [data]);

  useEffect(() => {
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js")
      .then(() => loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"))
      .then(() => setJsPDFReady(true))
      .catch(() => {});
  }, []);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const fmt = (v) => "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getFiltered = (key) => (data[key] || []).filter(item => {
    const d = new Date(item.date + "T00:00:00");
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const filtered = useMemo(() => getFiltered(tab), [data, tab, month, year]);

  const summary = useMemo(() => {
    const sumOf = (key) => getFiltered(key).reduce((acc, i) => acc + Number(i.value), 0);
    const totalDeposits = sumOf("deposits");
    const totalExpenses = sumOf("expenses");
    const totalInvestments = sumOf("investments");
    const balance = totalDeposits - totalExpenses - totalInvestments;
    return { totalDeposits, totalExpenses, totalInvestments, balance };
  }, [data, month, year]);

  const totalRecords = data.deposits.length + data.expenses.length + data.investments.length;

  const categories = tab === "investments" ? CATEGORIES_INVEST : tab === "deposits" ? CATEGORIES_DEPOSIT : CATEGORIES_EXPENSE;

  function handleSave() {
    if (!form.desc || !form.value || !form.date) return;
    if (editId) {
      setData(prev => ({ ...prev, [tab]: prev[tab].map(i => i.id === editId ? { ...i, ...form, value: Number(form.value) } : i) }));
      setEditId(null);
      showToast("Registro atualizado!");
    } else {
      setData(prev => ({ ...prev, [tab]: [...prev[tab], { id: generateId(), ...form, value: Number(form.value) }] }));
      showToast("Registro adicionado!");
    }
    setForm({ desc: "", value: "", category: "", date: now.toISOString().split("T")[0] });
    setShowForm(false);
  }

  function handleEdit(item) {
    setForm({ desc: item.desc, value: String(item.value), category: item.category, date: item.date });
    setEditId(item.id);
    setShowForm(true);
  }

  function handleDelete(id) {
    setData(prev => ({ ...prev, [tab]: prev[tab].filter(i => i.id !== id) }));
    showToast("Registro removido.", "error");
  }

  function handleCancel() {
    setForm({ desc: "", value: "", category: "", date: now.toISOString().split("T")[0] });
    setEditId(null);
    setShowForm(false);
  }

  // ── Export JSON backup ──
  function handleExportJSON() {
    const payload = { ...data, exportedAt: new Date().toISOString(), version: 1 };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `painel-financeiro-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowDataMenu(false);
    showToast("Backup exportado com sucesso!");
  }

  // ── Import JSON backup ──
  function handleImportJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.deposits && !parsed.expenses && !parsed.investments) throw new Error("Formato inválido");
        setData({
          deposits: parsed.deposits || [],
          expenses: parsed.expenses || [],
          investments: parsed.investments || [],
        });
        setShowDataMenu(false);
        showToast("Dados importados com sucesso!");
      } catch {
        showToast("Arquivo inválido. Use um backup gerado pelo painel.", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ── Clear all data ──
  function handleClearAll() {
    setData(initialState);
    setShowClearConfirm(false);
    setShowDataMenu(false);
    showToast("Todos os dados foram apagados.", "error");
  }

  // ── Export PDF ──
  async function handleExportPDF() {
    if (!jsPDFReady || !window.jspdf) return;
    setExporting(true);
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      function hexRGB(hex) {
        return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
      }

      doc.setFillColor(15, 15, 19);
      doc.rect(0, 0, pageW, 44, "F");
      doc.setFillColor(...hexRGB("#6366f1"));
      doc.rect(0, 0, 4, 44, "F");
      doc.setTextColor(232, 232, 240);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("Relatorio Financeiro Mensal", 12, 17);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(150, 150, 180);
      doc.text(`Periodo: ${MONTHS[month]} / ${year}`, 12, 27);
      doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")} as ${new Date().toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"})}`, 12, 34);

      let y = 54;
      const cards = [
        { label: "Entradas", value: summary.totalDeposits, color: "#22c55e" },
        { label: "Saidas",   value: summary.totalExpenses,    color: "#ef4444" },
        { label: "Investido",value: summary.totalInvestments, color: "#6366f1" },
        { label: summary.balance >= 0 ? "Saldo +" : "Saldo -", value: summary.balance, color: summary.balance >= 0 ? "#22c55e" : "#ef4444" },
      ];
      const cardW = (pageW - 24 - 9) / 4;
      cards.forEach((card, i) => {
        const cx = 12 + i * (cardW + 3);
        doc.setFillColor(26, 26, 46); doc.roundedRect(cx, y, cardW, 22, 2, 2, "F");
        doc.setFillColor(...hexRGB(card.color)); doc.roundedRect(cx, y, cardW, 2, 1, 1, "F");
        doc.setFontSize(6); doc.setTextColor(120, 120, 160); doc.setFont("helvetica", "bold");
        doc.text(card.label.toUpperCase(), cx + 3, y + 8);
        doc.setFontSize(8.5); doc.setTextColor(...hexRGB(card.color));
        doc.text(fmt(Math.abs(card.value)), cx + 3, y + 17);
      });
      y += 32;

      const sections = [
        { key: "deposits",    label: "Entradas",     color: "#22c55e" },
        { key: "expenses",    label: "Saidas",        color: "#ef4444" },
        { key: "investments", label: "Investimentos", color: "#6366f1" },
      ];

      for (const section of sections) {
        const rows = getFiltered(section.key);
        if (y > pageH - 55) { doc.addPage(); y = 20; }
        doc.setFillColor(...hexRGB(section.color));
        doc.rect(12, y, pageW - 24, 8, "F");
        doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont("helvetica", "bold");
        doc.text(`  ${section.label.toUpperCase()}`, 14, y + 5.5);
        const total = rows.reduce((a, r) => a + r.value, 0);
        doc.text(`${rows.length} item(s)   Total: ${fmt(total)}`, pageW - 14, y + 5.5, { align: "right" });
        y += 10;

        if (rows.length === 0) {
          doc.setFontSize(8); doc.setTextColor(120, 120, 140); doc.setFont("helvetica", "italic");
          doc.text("  Nenhum lancamento neste periodo.", 14, y + 5);
          y += 13;
        } else {
          doc.autoTable({
            startY: y,
            head: [["Data", "Descricao", "Categoria", "Valor (R$)"]],
            body: rows.map(r => [new Date(r.date + "T00:00:00").toLocaleDateString("pt-BR"), r.desc, r.category || "-", fmt(r.value)]),
            theme: "grid",
            styles: { fontSize: 8, cellPadding: 3, textColor: [200,200,220], fillColor: [22,22,38], lineColor: [40,40,60], lineWidth: 0.2 },
            headStyles: { fillColor: [26,26,46], textColor: hexRGB(section.color), fontStyle: "bold", fontSize: 8 },
            alternateRowStyles: { fillColor: [18,18,32] },
            columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 32 }, 3: { cellWidth: 34, halign: "right", textColor: hexRGB(section.color), fontStyle: "bold" } },
            margin: { left: 12, right: 12 },
          });
          y = doc.lastAutoTable.finalY + 11;
        }
      }

      if (y > pageH - 42) { doc.addPage(); y = 20; }
      doc.setFillColor(26, 26, 46); doc.roundedRect(12, y, pageW - 24, 30, 2, 2, "F");
      doc.setFillColor(...hexRGB("#f59e0b")); doc.roundedRect(12, y, 3, 30, 1, 1, "F");
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...hexRGB("#f59e0b"));
      doc.text("Analise do Periodo", 18, y + 9);
      doc.setFont("helvetica", "normal"); doc.setTextColor(170, 170, 190); doc.setFontSize(8);
      const analysis = summary.totalDeposits === 0
        ? "Nenhum dado registrado para este periodo."
        : summary.balance >= 0
          ? `Resultado POSITIVO de ${fmt(summary.balance)}. Entradas: ${fmt(summary.totalDeposits)} | Saidas: ${fmt(summary.totalExpenses)} | Investido: ${fmt(summary.totalInvestments)}${summary.totalInvestments > 0 ? ` (${((summary.totalInvestments/summary.totalDeposits)*100).toFixed(1)}% das entradas)` : ""}.`
          : `Resultado NEGATIVO de ${fmt(Math.abs(summary.balance))}. Saidas e investimentos superaram as entradas. Entradas: ${fmt(summary.totalDeposits)} | Saidas: ${fmt(summary.totalExpenses)} | Investido: ${fmt(summary.totalInvestments)}.`;
      doc.text(doc.splitTextToSize(analysis, pageW - 38), 18, y + 18);

      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFillColor(15, 15, 19); doc.rect(0, pageH - 10, pageW, 10, "F");
        doc.setFontSize(7); doc.setTextColor(80, 80, 100); doc.setFont("helvetica", "normal");
        doc.text("Meu Painel Financeiro", 12, pageH - 3.5);
        doc.text(`Pagina ${p} de ${totalPages}`, pageW - 12, pageH - 3.5, { align: "right" });
      }
      doc.save(`relatorio-${MONTHS[month].toLowerCase()}-${year}.pdf`);
    } catch (err) {
      showToast("Erro ao gerar PDF.", "error");
    }
    setExporting(false);
  }

  const tabMeta = {
    deposits:    { label: "Entradas",      icon: "↑", color: "#22c55e", light: "#dcfce7" },
    expenses:    { label: "Saídas",        icon: "↓", color: "#ef4444", light: "#fee2e2" },
    investments: { label: "Investimentos", icon: "◆", color: "#6366f1", light: "#e0e7ff" },
    summary:     { label: "Resumo",        icon: "≡", color: "#f59e0b", light: "#fef3c7" },
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f13", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", color: "#e8e8f0" }}
      onClick={() => { if (showDataMenu) setShowDataMenu(false); }}>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity:0; transform: translateY(-8px); } to { opacity:1; transform: translateY(0); } }
        @keyframes toastIn { from { opacity:0; transform: translateX(40px); } to { opacity:1; transform: translateX(0); } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: toast.type === "error" ? "#2d0a0a" : "#052e16",
          border: `1px solid ${toast.type === "error" ? "#ef4444" : "#22c55e"}55`,
          color: toast.type === "error" ? "#ef4444" : "#22c55e",
          borderRadius: 12, padding: "12px 20px", fontWeight: 700, fontSize: 14,
          boxShadow: "0 8px 32px #00000060",
          animation: "toastIn 0.3s ease",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>{toast.type === "error" ? "✕" : "✓"}</span>
          {toast.msg}
        </div>
      )}

      {/* Clear Confirm Modal */}
      {showClearConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "#000000aa", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#1a1a2e", borderRadius: 18, padding: 32, maxWidth: 380, width: "90%", border: "1px solid #ef444440", animation: "slideIn 0.2s ease" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <h3 style={{ margin: "0 0 10px", textAlign: "center", color: "#ef4444" }}>Apagar todos os dados?</h3>
            <p style={{ color: "#888", fontSize: 14, textAlign: "center", marginBottom: 24, lineHeight: 1.6 }}>
              Esta ação irá remover <strong style={{ color: "#e8e8f0" }}>todos os {totalRecords} registros</strong> permanentemente. Faça um backup antes!
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowClearConfirm(false)}
                style={{ flex: 1, background: "#ffffff12", border: "none", color: "#aaa", borderRadius: 10, padding: "11px", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
                Cancelar
              </button>
              <button onClick={handleClearAll}
                style={{ flex: 1, background: "#ef4444", border: "none", color: "#fff", borderRadius: 10, padding: "11px", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
                Apagar tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)", padding: "28px 32px 0", borderBottom: "1px solid #ffffff12" }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 3, color: "#6366f1", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Gestão Financeira</div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>
                Meu Painel <span style={{ color: "#6366f1" }}>Financeiro</span>
              </h1>
              {/* Storage indicator */}
              <div style={{ marginTop: 4, fontSize: 11, color: "#3f3f5f", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
                {totalRecords === 0 ? "Nenhum dado salvo" : `${totalRecords} registro${totalRecords > 1 ? "s" : ""} salvos localmente`}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Data management menu */}
              <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setShowDataMenu(v => !v)}
                  title="Gerenciar dados (backup/importar/apagar)"
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    background: showDataMenu ? "#1a1a2e" : "#ffffff0d",
                    border: "1px solid #ffffff18", color: "#ccc",
                    borderRadius: 10, padding: "9px 14px",
                    cursor: "pointer", fontWeight: 700, fontSize: 13, transition: "all 0.2s",
                  }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                  </svg>
                  Dados
                </button>

                {showDataMenu && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 100,
                    background: "#1a1a2e", borderRadius: 14, border: "1px solid #ffffff15",
                    boxShadow: "0 16px 48px #00000080", minWidth: 220,
                    animation: "slideIn 0.15s ease", overflow: "hidden",
                  }}>
                    <div style={{ padding: "10px 14px 6px", fontSize: 10, letterSpacing: 1.5, color: "#444", fontWeight: 700, textTransform: "uppercase" }}>Gerenciar dados</div>

                    <button onClick={handleExportJSON}
                      style={{ width: "100%", background: "none", border: "none", color: "#e8e8f0", padding: "11px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid #ffffff08" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#ffffff08"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <span style={{ fontSize: 16 }}>📦</span>
                      <div>
                        <div>Exportar backup (JSON)</div>
                        <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>Baixa todos os dados</div>
                      </div>
                    </button>

                    <button onClick={() => importRef.current?.click()}
                      style={{ width: "100%", background: "none", border: "none", color: "#e8e8f0", padding: "11px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid #ffffff08" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#ffffff08"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <span style={{ fontSize: 16 }}>📂</span>
                      <div>
                        <div>Importar backup (JSON)</div>
                        <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>Carrega dados de outro dispositivo</div>
                      </div>
                    </button>

                    <button onClick={() => { setShowClearConfirm(true); setShowDataMenu(false); }}
                      style={{ width: "100%", background: "none", border: "none", color: "#ef4444", padding: "11px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid #ffffff08" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#ef444412"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <span style={{ fontSize: 16 }}>🗑️</span>
                      <div>
                        <div>Apagar todos os dados</div>
                        <div style={{ fontSize: 11, color: "#7f1d1d", marginTop: 1 }}>Ação irreversível</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              {/* Export PDF */}
              <button onClick={handleExportPDF} disabled={exporting || !jsPDFReady}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  background: exporting ? "#1a1a2e" : "linear-gradient(135deg, #dc2626, #b91c1c)",
                  border: "1px solid #ef444430", color: exporting ? "#666" : "#fff",
                  borderRadius: 10, padding: "9px 16px",
                  cursor: (exporting || !jsPDFReady) ? "not-allowed" : "pointer",
                  fontWeight: 700, fontSize: 13,
                  boxShadow: exporting ? "none" : "0 4px 14px #ef444430",
                  transition: "all 0.2s", opacity: !jsPDFReady ? 0.5 : 1,
                }}>
                {exporting
                  ? <><span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid #333", borderTopColor: "#ef4444", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Gerando...</>
                  : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Exportar PDF</>
                }
              </button>

              {/* Month selector */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); }}
                  style={{ background: "#ffffff10", border: "none", color: "#e8e8f0", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>‹</button>
                <div style={{ textAlign: "center", minWidth: 100 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{MONTHS[month]}</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>{year}</div>
                </div>
                <button onClick={() => { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); }}
                  style={{ background: "#ffffff10", border: "none", color: "#e8e8f0", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>›</button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4 }}>
            {Object.entries(tabMeta).map(([key, meta]) => (
              <button key={key} onClick={() => { setTab(key); setShowForm(false); setEditId(null); }}
                style={{
                  padding: "10px 18px", border: "none", cursor: "pointer", fontWeight: 700,
                  fontSize: 13, borderRadius: "10px 10px 0 0", transition: "all 0.2s",
                  background: tab === key ? "#0f0f13" : "transparent",
                  color: tab === key ? meta.color : "#666",
                  borderBottom: tab === key ? `2px solid ${meta.color}` : "2px solid transparent",
                }}>
                <span style={{ marginRight: 6 }}>{meta.icon}</span>{meta.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* hidden file input for import */}
      <input ref={importRef} type="file" accept=".json" onChange={handleImportJSON} style={{ display: "none" }} />

      {/* Content */}
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "28px 32px" }}>

        {tab !== "summary" && (
          <>
            {!showForm && (
              <button onClick={() => setShowForm(true)}
                style={{
                  background: `linear-gradient(135deg, ${tabMeta[tab].color}, ${tabMeta[tab].color}cc)`,
                  border: "none", color: "#fff", borderRadius: 12, padding: "11px 24px",
                  cursor: "pointer", fontWeight: 700, fontSize: 14, marginBottom: 20,
                  boxShadow: `0 4px 16px ${tabMeta[tab].color}44`,
                }}>
                + Adicionar {tabMeta[tab].label.slice(0, -1)}
              </button>
            )}

            {showForm && (
              <div style={{ background: "#1a1a2e", borderRadius: 16, padding: 24, marginBottom: 24, border: `1px solid ${tabMeta[tab].color}44`, boxShadow: `0 0 32px ${tabMeta[tab].color}18` }}>
                <h3 style={{ margin: "0 0 18px", fontSize: 15, color: tabMeta[tab].color }}>
                  {editId ? "Editar" : "Novo"} registro de {tabMeta[tab].label.toLowerCase()}
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Descrição</label>
                    <input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="Ex: Conta de luz, Salário..." style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Valor (R$)</label>
                    <input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0,00" style={inputStyle} min="0" step="0.01" />
                  </div>
                  <div>
                    <label style={labelStyle}>Data</label>
                    <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Categoria</label>
                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                      <option value="">Selecione...</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <button onClick={handleSave} style={{ background: tabMeta[tab].color, border: "none", color: "#fff", borderRadius: 10, padding: "10px 24px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                    {editId ? "Salvar" : "Adicionar"}
                  </button>
                  <button onClick={handleCancel} style={{ background: "#ffffff12", border: "none", color: "#aaa", borderRadius: 10, padding: "10px 24px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#444", fontSize: 15 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
                Nenhum registro em {MONTHS[month]} de {year}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filtered.map(item => (
                  <div key={item.id} style={{ background: "#1a1a2e", borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #ffffff08" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: tabMeta[tab].light + "22", fontSize: 18, color: tabMeta[tab].color }}>{tabMeta[tab].icon}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{item.desc}</div>
                        <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                          {item.category && <span style={{ color: tabMeta[tab].color, marginRight: 8 }}>{item.category}</span>}
                          {new Date(item.date + "T00:00:00").toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ fontWeight: 800, fontSize: 17, color: tabMeta[tab].color }}>{fmt(item.value)}</span>
                      <button onClick={() => handleEdit(item)} style={{ background: "#ffffff10", border: "none", color: "#aaa", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 14 }}>✏️</button>
                      <button onClick={() => handleDelete(item.id)} style={{ background: "#ef444418", border: "none", color: "#ef4444", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 14 }}>🗑</button>
                    </div>
                  </div>
                ))}
                <div style={{ background: `linear-gradient(135deg, ${tabMeta[tab].color}18, ${tabMeta[tab].color}08)`, borderRadius: 12, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${tabMeta[tab].color}30` }}>
                  <span style={{ fontWeight: 700, color: "#aaa", fontSize: 14 }}>Total do mês</span>
                  <span style={{ fontWeight: 900, fontSize: 20, color: tabMeta[tab].color }}>{fmt(filtered.reduce((a, i) => a + i.value, 0))}</span>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "summary" && (
          <div>
            <h2 style={{ margin: "0 0 24px", fontSize: 20, fontWeight: 800 }}>Resumo de {MONTHS[month]} / {year}</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              {[
                { label: "Total de Entradas", value: summary.totalDeposits, color: "#22c55e" },
                { label: "Total de Saídas",   value: summary.totalExpenses,    color: "#ef4444" },
                { label: "Total Investido",   value: summary.totalInvestments, color: "#6366f1" },
              ].map(c => (
                <div key={c.label} style={{ background: "#1a1a2e", borderRadius: 16, padding: "22px 24px", border: `1px solid ${c.color}30` }}>
                  <div style={{ fontSize: 12, color: "#666", fontWeight: 600, marginBottom: 6 }}>{c.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: c.color }}>{fmt(c.value)}</div>
                </div>
              ))}

              <div style={{
                gridColumn: "1 / -1",
                background: summary.balance >= 0 ? "linear-gradient(135deg, #052e16, #14532d)" : "linear-gradient(135deg, #2d0a0a, #7f1d1d)",
                borderRadius: 16, padding: "28px",
                border: `1px solid ${summary.balance >= 0 ? "#22c55e44" : "#ef444444"}`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#888", marginBottom: 8 }}>
                    {summary.balance >= 0 ? "✅ Saldo Positivo" : "⚠️ Saldo Negativo"}
                  </div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: summary.balance >= 0 ? "#22c55e" : "#ef4444" }}>{fmt(Math.abs(summary.balance))}</div>
                  <div style={{ fontSize: 13, color: "#555", marginTop: 6 }}>Entradas − Saídas − Investimentos</div>
                </div>
                <div style={{ fontSize: 64 }}>{summary.balance >= 0 ? "📈" : "📉"}</div>
              </div>
            </div>

            <div style={{ background: "#1a1a2e", borderRadius: 16, padding: 24, border: "1px solid #ffffff08" }}>
              <h3 style={{ margin: "0 0 20px", fontSize: 14, fontWeight: 700, color: "#888", letterSpacing: 1, textTransform: "uppercase" }}>Distribuição</h3>
              {(() => {
                const total = summary.totalDeposits || 1;
                return [
                  { label: "Saídas", value: summary.totalExpenses, color: "#ef4444" },
                  { label: "Investimentos", value: summary.totalInvestments, color: "#6366f1" },
                  { label: "Saldo livre", value: Math.max(0, summary.balance), color: "#22c55e" },
                ].map(b => (
                  <div key={b.label} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                      <span style={{ color: "#aaa", fontWeight: 600 }}>{b.label}</span>
                      <span style={{ color: b.color, fontWeight: 700 }}>{fmt(b.value)} ({((b.value/total)*100).toFixed(1)}%)</span>
                    </div>
                    <div style={{ height: 8, background: "#ffffff08", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100,(b.value/total)*100)}%`, background: b.color, borderRadius: 99, transition: "width 0.8s ease" }} />
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div style={{ marginTop: 16, background: "#1a1a2e", borderRadius: 14, padding: "18px 22px", border: "1px solid #ffffff08", fontSize: 14, lineHeight: 1.7, color: "#aaa" }}>
              <span style={{ fontWeight: 700, color: "#f59e0b" }}>💡 Análise rápida: </span>
              {summary.totalDeposits === 0
                ? "Nenhum dado registrado para este mês."
                : summary.balance > 0
                  ? `Parabéns! Você terminou ${MONTHS[month]} com saldo positivo de ${fmt(summary.balance)}. ${summary.totalInvestments > 0 ? `Você investiu ${((summary.totalInvestments/summary.totalDeposits)*100).toFixed(1)}% das suas entradas.` : "Considere investir parte do saldo!"}`
                  : `Atenção! Suas saídas e investimentos superaram as entradas em ${fmt(Math.abs(summary.balance))} em ${MONTHS[month]}. Revise seus gastos.`
              }
            </div>

            {/* Info box about storage */}
            <div style={{ marginTop: 14, background: "#1a1a2e", borderRadius: 14, padding: "16px 22px", border: "1px solid #6366f130", fontSize: 13, color: "#888", display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span style={{ fontSize: 20, marginTop: 1 }}>💾</span>
              <div style={{ lineHeight: 1.7 }}>
                <strong style={{ color: "#6366f1" }}>Seus dados são salvos automaticamente</strong> neste navegador.<br/>
                Para usar em outro dispositivo, vá em <strong style={{ color: "#e8e8f0" }}>Dados → Exportar backup (JSON)</strong>, transfira o arquivo e importe no outro aparelho.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
