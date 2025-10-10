/* script.js — interactive behaviors for the data analyst portfolio
   Features:
   - CSV upload (via PapaParse) or sample data
   - Compute KPIs: total sales, avg order, unique customers
   - Render Chart.js charts: sales by category (bar) and sales over time (line)
   - Show data preview table with simple pagination
   - Small modal for quick project info
*/

(() => {
    // Utility helpers
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));
    const fmtCurrency = (v) => '$' + Number(v).toLocaleString();
    const parseNumber = (v) => {
      if (v === null || v === undefined || v === '') return 0;
      const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
      return isNaN(n) ? 0 : n;
    };
  
    // DOM elements
    const csvFile = $('#csvFile');
    const useSample = $('#useSample');
    const categoryFilter = $('#categoryFilter');
    const dateFrom = $('#dateFrom');
    const dateTo = $('#dateTo');
    const kpiTotal = $('#kpiTotal');
    const kpiAvg = $('#kpiAvg');
    const kpiCust = $('#kpiCust');
    const tableContainer = $('#tableContainer');
    const downloadCsv = $('#downloadCsv');
  
    // Charts
    let chartCategory = null;
    let chartTime = null;
  
    // Data store
    let rawData = []; // array of objects
  
    // Init page
    document.addEventListener('DOMContentLoaded', () => {
      $('#year').textContent = new Date().getFullYear();
      attachHandlers();
      useSampleData(); // load sample by default for instant demo
    });
  
    function attachHandlers() {
      csvFile.addEventListener('change', handleFile);
      useSample.addEventListener('click', (e) => {
        e.preventDefault();
        useSampleData();
      });
      categoryFilter.addEventListener('change', refreshDashboard);
      dateFrom.addEventListener('change', refreshDashboard);
      dateTo.addEventListener('change', refreshDashboard);
      $('#contactForm').addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Thanks! Message sent (demo).');
        e.target.reset();
      });
      $$('.mini-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const demo = e.currentTarget.getAttribute('data-demo');
          openModalDemo(demo);
        });
      });
      $('.modal .close')?.addEventListener('click', closeModal);
      downloadCsv.addEventListener('click', () => {
        downloadCleanCsv(rawData);
      });
    }
  
    function handleFile(e) {
      const f = e.target.files[0];
      if (!f) return;
      Papa.parse(f, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          rawData = standardizeRows(results.data);
          afterDataLoad();
        },
        error: (err) => {
          alert('CSV parse error: ' + err.message);
        }
      });
    }
  
    // Create friendly, consistent rows: ensure date, category, sales, orders, customer_id exist
    function standardizeRows(rows) {
      return rows.map(r => {
        // Try to handle different header names
        const lower = {};
        for (const k of Object.keys(r)) lower[k.trim().toLowerCase()] = r[k];
        return {
          date: normalizeDate(lower.date || lower.timestamp || lower.order_date || ''),
          category: (lower.category || lower.product_category || lower.segment || 'Unknown').trim(),
          sales: parseNumber(lower.sales || lower.revenue || lower.amount || 0),
          orders: parseNumber(lower.orders || lower.qty || 1),
          customer_id: (lower.customer_id || lower.customer || lower.user_id || '').toString()
        };
      }).map(r => ({ ...r, sales: Number(r.sales), orders: Number(r.orders) }));
    }
  
    function normalizeDate(v) {
      if (!v) return null;
      const d = new Date(v);
      if (!isNaN(d)) return d.toISOString().slice(0,10);
      // fallback: try to parse dd/mm/yyyy
      const m = v.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
      if (m) {
        let day = m[1].padStart(2,'0'), mon = m[2].padStart(2,'0'), yr = m[3];
        if (yr.length === 2) yr = '20' + yr;
        return `${yr}-${mon}-${day}`;
      }
      return null;
    }
  
    function afterDataLoad() {
      populateCategoryFilter();
      refreshDashboard();
      downloadCsv.classList.remove('hidden');
    }
  
    function populateCategoryFilter() {
      const cats = Array.from(new Set(rawData.map(r => r.category))).filter(Boolean).sort();
      categoryFilter.innerHTML = '<option value="__all__">All categories</option>' +
        cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    }
  
    function getFilteredData() {
      const cat = categoryFilter.value || '__all__';
      const from = dateFrom.value || null;
      const to = dateTo.value || null;
      return rawData.filter(r => {
        if (cat !== '__all__' && r.category !== cat) return false;
        if (from && r.date && r.date < from) return false;
        if (to && r.date && r.date > to) return false;
        return true;
      });
    }
  
    function refreshDashboard() {
      const data = getFilteredData();
      // KPIs
      const totalSales = data.reduce((s, x) => s + (Number(x.sales) || 0), 0);
      const totalOrders = data.reduce((s, x) => s + (Number(x.orders) || 0), 0) || 1;
      const uniqCust = new Set(data.filter(x => x.customer_id).map(x => x.customer_id)).size || 0;
      kpiTotal.textContent = fmtCurrency(totalSales.toFixed(2));
      kpiAvg.textContent = fmtCurrency((totalSales / totalOrders).toFixed(2));
      kpiCust.textContent = uniqCust;
  
      renderCategoryChart(data);
      renderTimeSeries(data);
      renderTable(data.slice(0, 200)); // preview first 200 rows
    }
  
    /* ========== CHARTS ========== */
  
    function renderCategoryChart(data) {
      const agg = {};
      data.forEach(r => {
        const c = r.category || 'Unknown';
        agg[c] = (agg[c] || 0) + (Number(r.sales) || 0);
      });
      const labels = Object.keys(agg).sort((a,b)=>agg[b]-agg[a]);
      const values = labels.map(l => agg[l]);
  
      const ctx = $('#chartCategory').getContext('2d');
      if (chartCategory) chartCategory.destroy();
      chartCategory = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Sales ($)',
            data: values,
            borderRadius: 8,
            maxBarThickness: 48
          }]
        },
        options: {
          plugins: { legend: { display: false } },
          responsive: true,
          scales: { y: { beginAtZero: true } },
        }
      });
    }
  
    function renderTimeSeries(data) {
      // aggregate by date
      const byDate = {};
      data.forEach(r => {
        const d = r.date || 'unknown';
        byDate[d] = (byDate[d] || 0) + (Number(r.sales) || 0);
      });
      // sort by date (unknowns last)
      const dates = Object.keys(byDate).filter(d => d !== 'null' && d !== 'undefined').sort();
      const values = dates.map(d => byDate[d]);
  
      const ctx = $('#chartTime').getContext('2d');
      if (chartTime) chartTime.destroy();
      chartTime = new Chart(ctx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [{
            label: 'Sales',
            data: values,
            tension: 0.25,
            pointRadius: 3,
          }]
        },
        options: {
          plugins:{legend:{display:false}},
          scales:{x:{ticks:{maxRotation:0}}, y:{beginAtZero:true}}
        }
      });
    }
  
    /* ========== TABLE PREVIEW ========== */
  
    function renderTable(rows) {
      if (!rows || rows.length === 0) {
        tableContainer.innerHTML = '<div class="muted">No rows to show.</div>';
        return;
      }
      const cols = Object.keys(rows[0]);
      // Build simple HTML table
      const html = [];
      html.push('<table class="data-table"><thead><tr>');
      cols.forEach(c => html.push(`<th>${escapeHtml(c)}</th>`));
      html.push('</tr></thead><tbody>');
      rows.forEach(r => {
        html.push('<tr>');
        cols.forEach(c => html.push(`<td>${escapeHtml(String(r[c] ?? ''))}</td>`));
        html.push('</tr>');
      });
      html.push('</tbody></table>');
      tableContainer.innerHTML = html.join('');
    }
  
    /* ========== SAMPLE DATA ========== */
  
    function useSampleData() {
      // small sample set (date, category, sales, orders, customer_id)
      const sample = [
        {date:'2025-01-02', category:'Electronics', sales:1250.50, orders:4, customer_id:'C001'},
        {date:'2025-01-03', category:'Clothing', sales:420.00, orders:2, customer_id:'C002'},
        {date:'2025-01-04', category:'Electronics', sales:980.00, orders:3, customer_id:'C003'},
        {date:'2025-01-05', category:'Home', sales:150.00, orders:1, customer_id:'C004'},
        {date:'2025-01-07', category:'Groceries', sales:240.00, orders:5, customer_id:'C002'},
        {date:'2025-02-02', category:'Electronics', sales:1300.00, orders:6, customer_id:'C005'},
        {date:'2025-02-12', category:'Clothing', sales:610.00, orders:4, customer_id:'C006'},
        {date:'2025-03-01', category:'Sports', sales:220.00, orders:1, customer_id:'C007'},
        {date:'2025-03-15', category:'Home', sales:330.00, orders:2, customer_id:'C004'},
        {date:'2025-03-20', category:'Electronics', sales:980.00, orders:3, customer_id:'C001'}
      ];
      rawData = sample.map(r => ({...r}));
      afterDataLoad();
    }
  
    /* ========== DOWNLOAD / EXPORT ========== */
  
    function downloadCleanCsv(rows) {
      if (!rows || rows.length === 0) {
        alert('No data to download.');
        return;
      }
      // convert to CSV
      const cols = Object.keys(rows[0]);
      const lines = [cols.join(',')];
      rows.forEach(r => {
        lines.push(cols.map(c => {
          const v = r[c] ?? '';
          // escape commas/quotes
          const s = String(v).replace(/"/g, '""');
          return /[,"]/g.test(s) ? `"${s}"` : s;
        }).join(','));
      });
      const blob = new Blob([lines.join('\n')], {type: 'text/csv'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'clean_data.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  
    /* ========== MODAL / PROJECT DEMO ========== */
  
    function openModalDemo(demo) {
      const modal = $('#miniModal');
      const content = $('#modalContent');
      let html = '<h3>Project</h3>';
      if (demo === 'sales') {
        html += `<p><strong>Sales Dashboard</strong> — Interactive demo allows CSV upload, calculates KPIs,
                 and visualises sales by category and over time. Technologies: Python (offline pipeline),
                 JavaScript (Chart.js), PapaParse for CSV parsing.</p>`;
        html += '<ul><li>Features: KPI cards, filters, charts, data preview, CSV export.</li><li>Business impact: quicker insights, better category prioritisation.</li></ul>';
      } else if (demo === 'seg') {
        html += `<p><strong>Customer Segmentation</strong> — RFM approach: Recency, Frequency, Monetary.
                 Clustering performed in Python (scikit-learn). Visualisations and segment descriptions included.</p>`;
      } else if (demo === 'ab') {
        html += `<p><strong>A/B Test Analysis</strong> — Comparison of conversion rates, confidence intervals,
                 and sample size considerations. Includes SQL queries to pull experiment data.</p>`;
      } else {
        html += '<p>Project details coming soon.</p>';
      }
      content.innerHTML = html;
      modal.classList.remove('hidden');
    }
  
    function closeModal() {
      $('#miniModal').classList.add('hidden');
    }
  
    /* ========== SMALL HELPERS ========== */
  
    // escape HTML to avoid injection in this demo context
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }
  
  })();

  document.getElementById("contactForm").addEventListener("submit", function(e) {
    e.preventDefault();
  
    const name = this.name.value;
    const email = this.email.value;
    const message = this.message.value;
  
    require('dotenv').config();

const telegramToken = process.env.TELEGRAM_TOKEN;
const chatId = process.env.CHAT_ID;
    const text = `📩 Yangi xabar!\n\n👤 Ism: ${name}\n📧 Email: ${email}\n💬 Xabar: ${message}`;
  
    fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML"
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.ok) {
        alert("Xabaringiz yuborildi! ✅");
        this.reset();
      } else {
        alert("Xabar yuborishda xatolik ❌");
      }
    })
    .catch(err => {
      console.error(err);
      alert("Server bilan aloqa xatosi ❌");
    });
  });
  