/* script.js — interactive behaviors for the data analyst portfolio
   Features:
   - CSV upload (via PapaParse) or sample data
   - Compute KPIs: total sales, avg order, unique customers
   - Render Chart.js charts: sales by category (bar) and sales over time (line)
   - Sho table with simple pagination
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
  
  /* ========== TABLE PREVIEW (First 5 rows only) ========== */
function renderTable(rows) {
  if (!rows || rows.length === 0) {
    tableContainer.innerHTML = '<div class="muted">No rows to show.</div>';
    return;
  }

  // Faqat dastlabki 5 ta qatorni olish
  const previewRows = rows.slice(0, 5);

  const cols = Object.keys(previewRows[0]);
  const html = [];
  html.push('<table class="data-table"><thead><tr>');
  cols.forEach(c => html.push(`<th>${escapeHtml(c)}</th>`));
  html.push('</tr></thead><tbody>');

  previewRows.forEach(r => {
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
      {date:'2025-03-20', category:'Electronics', sales:980.00, orders:3, customer_id:'C001'},
      {date:'2025-03-25', category:'Beauty', sales:180.50, orders:2, customer_id:'C008'},
      {date:'2025-03-28', category:'Toys', sales:95.00, orders:1, customer_id:'C009'},
      {date:'2025-04-02', category:'Books', sales:42.99, orders:1, customer_id:'C010'},
      {date:'2025-04-05', category:'Electronics', sales:2100.00, orders:5, customer_id:'C011'},
      {date:'2025-04-07', category:'Clothing', sales:315.00, orders:3, customer_id:'C012'},
      {date:'2025-04-10', category:'Home', sales:450.00, orders:2, customer_id:'C013'},
      {date:'2025-04-14', category:'Groceries', sales:135.25, orders:4, customer_id:'C014'},
      {date:'2025-04-18', category:'Automotive', sales:780.00, orders:2, customer_id:'C015'},
      {date:'2025-04-21', category:'Sports', sales:295.00, orders:3, customer_id:'C016'},
      {date:'2025-04-25', category:'Beauty', sales:155.60, orders:2, customer_id:'C017'},
      {date:'2025-05-01', category:'Electronics', sales:1800.00, orders:6, customer_id:'C018'},
      {date:'2025-05-03', category:'Home', sales:220.00, orders:1, customer_id:'C019'},
      {date:'2025-05-05', category:'Toys', sales:140.00, orders:2, customer_id:'C020'},
      {date:'2025-05-07', category:'Clothing', sales:310.00, orders:3, customer_id:'C021'},
      {date:'2025-05-10', category:'Groceries', sales:98.50, orders:3, customer_id:'C022'},
      {date:'2025-05-12', category:'Books', sales:62.00, orders:1, customer_id:'C023'},
      {date:'2025-05-15', category:'Beauty', sales:200.00, orders:3, customer_id:'C024'},
      {date:'2025-05-17', category:'Automotive', sales:950.00, orders:2, customer_id:'C025'},
      {date:'2025-05-20', category:'Home', sales:330.00, orders:2, customer_id:'C026'},
      {date:'2025-05-23', category:'Electronics', sales:2700.00, orders:5, customer_id:'C027'},
      {date:'2025-05-25', category:'Clothing', sales:150.00, orders:1, customer_id:'C028'},
      {date:'2025-05-28', category:'Groceries', sales:120.00, orders:4, customer_id:'C029'},
      {date:'2025-06-01', category:'Sports', sales:340.00, orders:3, customer_id:'C030'},
      {date:'2025-06-04', category:'Books', sales:55.00, orders:1, customer_id:'C031'},
      {date:'2025-06-07', category:'Beauty', sales:180.00, orders:2, customer_id:'C032'},
      {date:'2025-06-10', category:'Electronics', sales:3200.00, orders:7, customer_id:'C033'},
      {date:'2025-06-14', category:'Home', sales:410.00, orders:2, customer_id:'C034'},
      {date:'2025-06-17', category:'Automotive', sales:890.00, orders:2, customer_id:'C035'},
      {date:'2025-06-20', category:'Groceries', sales:115.00, orders:3, customer_id:'C036'},
      {date:'2025-06-23', category:'Clothing', sales:275.00, orders:2, customer_id:'C037'},
      {date:'2025-06-26', category:'Toys', sales:130.00, orders:1, customer_id:'C038'},
      {date:'2025-06-29', category:'Sports', sales:250.00, orders:2, customer_id:'C039'},
      {date:'2025-07-02', category:'Books', sales:80.00, orders:1, customer_id:'C040'},
      {date:'2025-07-05', category:'Beauty', sales:210.00, orders:3, customer_id:'C041'},
      {date:'2025-07-08', category:'Home', sales:295.00, orders:2, customer_id:'C042'},
      {date:'2025-07-11', category:'Electronics', sales:1700.00, orders:5, customer_id:'C043'},
      {date:'2025-07-15', category:'Clothing', sales:265.00, orders:3, customer_id:'C044'},
      {date:'2025-07-18', category:'Sports', sales:320.00, orders:2, customer_id:'C045'},
      {date:'2025-07-21', category:'Toys', sales:160.00, orders:1, customer_id:'C046'},
      {date:'2025-07-24', category:'Groceries', sales:140.00, orders:4, customer_id:'C047'},
      {date:'2025-07-27', category:'Home', sales:360.00, orders:2, customer_id:'C048'},
      {date:'2025-07-30', category:'Electronics', sales:2500.00, orders:6, customer_id:'C049'},
      {date:'2025-08-02', category:'Books', sales:75.00, orders:1, customer_id:'C050'},
      {date:'2025-08-05', category:'Beauty', sales:195.00, orders:2, customer_id:'C051'},
      {date:'2025-08-08', category:'Automotive', sales:1020.00, orders:3, customer_id:'C052'},
      {date:'2025-08-12', category:'Home', sales:430.00, orders:2, customer_id:'C053'},
      {date:'2025-08-15', category:'Clothing', sales:345.00, orders:3, customer_id:'C054'},
      {date:'2025-08-18', category:'Groceries', sales:125.00, orders:5, customer_id:'C055'},
      {date:'2025-08-21', category:'Sports', sales:280.00, orders:2, customer_id:'C056'},
      {date:'2025-08-25', category:'Electronics', sales:1950.00, orders:4, customer_id:'C057'},
      {date:'2025-08-28', category:'Beauty', sales:210.00, orders:3, customer_id:'C058'},
      {date:'2025-09-01', category:'Clothing', sales:375.00, orders:2, customer_id:'C059'},
      {date:'2025-09-03', category:'Electronics', sales:2650.00, orders:6, customer_id:'C060'},
      {date:'2025-09-05', category:'Groceries', sales:145.00, orders:4, customer_id:'C061'},
      {date:'2025-09-07', category:'Books', sales:65.00, orders:1, customer_id:'C062'},
      {date:'2025-09-09', category:'Beauty', sales:185.00, orders:2, customer_id:'C063'},
      {date:'2025-09-11', category:'Home', sales:370.00, orders:2, customer_id:'C064'},
      {date:'2025-09-13', category:'Sports', sales:415.00, orders:3, customer_id:'C065'},
      {date:'2025-09-15', category:'Toys', sales:145.00, orders:1, customer_id:'C066'},
      {date:'2025-09-17', category:'Automotive', sales:890.00, orders:2, customer_id:'C067'},
      {date:'2025-09-19', category:'Electronics', sales:3100.00, orders:7, customer_id:'C068'},
      {date:'2025-09-21', category:'Home', sales:450.00, orders:2, customer_id:'C069'},
      {date:'2025-09-23', category:'Books', sales:70.00, orders:1, customer_id:'C070'},
      {date:'2025-09-25', category:'Beauty', sales:230.00, orders:3, customer_id:'C071'},
      {date:'2025-09-27', category:'Clothing', sales:280.00, orders:3, customer_id:'C072'},
      {date:'2025-09-29', category:'Groceries', sales:110.00, orders:3, customer_id:'C073'},
      {date:'2025-09-30', category:'Electronics', sales:1850.00, orders:4, customer_id:'C074'},
      {date:'2025-10-02', category:'Sports', sales:320.00, orders:2, customer_id:'C075'},
      {date:'2025-10-04', category:'Toys', sales:140.00, orders:1, customer_id:'C076'},
      {date:'2025-10-06', category:'Books', sales:88.00, orders:1, customer_id:'C077'},
      {date:'2025-10-08', category:'Automotive', sales:1050.00, orders:3, customer_id:'C078'},
      {date:'2025-10-10', category:'Home', sales:390.00, orders:2, customer_id:'C079'},
      {date:'2025-10-12', category:'Beauty', sales:210.00, orders:2, customer_id:'C080'},
      {date:'2025-10-14', category:'Clothing', sales:315.00, orders:2, customer_id:'C081'},
      {date:'2025-10-16', category:'Groceries', sales:95.00, orders:3, customer_id:'C082'},
      {date:'2025-10-18', category:'Electronics', sales:2400.00, orders:5, customer_id:'C083'},
      {date:'2025-10-20', category:'Sports', sales:355.00, orders:3, customer_id:'C084'},
      {date:'2025-10-22', category:'Home', sales:410.00, orders:2, customer_id:'C085'},
      {date:'2025-10-24', category:'Books', sales:77.00, orders:1, customer_id:'C086'},
      {date:'2025-10-26', category:'Beauty', sales:195.00, orders:2, customer_id:'C087'},
      {date:'2025-10-28', category:'Automotive', sales:1120.00, orders:3, customer_id:'C088'},
      {date:'2025-10-30', category:'Toys', sales:155.00, orders:2, customer_id:'C089'},
      {date:'2025-11-01', category:'Clothing', sales:440.00, orders:3, customer_id:'C090'},
      {date:'2025-11-03', category:'Electronics', sales:2650.00, orders:6, customer_id:'C091'},
      {date:'2025-11-05', category:'Home', sales:385.00, orders:2, customer_id:'C092'},
      {date:'2025-11-07', category:'Groceries', sales:130.00, orders:4, customer_id:'C093'},
      {date:'2025-11-09', category:'Beauty', sales:210.00, orders:3, customer_id:'C094'},
      {date:'2025-11-11', category:'Books', sales:60.00, orders:1, customer_id:'C095'},
      {date:'2025-11-13', category:'Toys', sales:160.00, orders:1, customer_id:'C096'},
      {date:'2025-11-15', category:'Sports', sales:390.00, orders:3, customer_id:'C097'},
      {date:'2025-11-17', category:'Home', sales:330.00, orders:2, customer_id:'C098'},
      {date:'2025-11-19', category:'Clothing', sales:285.00, orders:2, customer_id:'C099'},
      {date:'2025-11-21', category:'Automotive', sales:920.00, orders:2, customer_id:'C100'},
      {date:'2025-11-23', category:'Electronics', sales:3100.00, orders:7, customer_id:'C101'},
      {date:'2025-11-25', category:'Beauty', sales:240.00, orders:3, customer_id:'C102'},
      {date:'2025-11-27', category:'Home', sales:380.00, orders:2, customer_id:'C103'},
      {date:'2025-11-29', category:'Books', sales:65.00, orders:1, customer_id:'C104'},
      {date:'2025-12-01', category:'Toys', sales:190.00, orders:2, customer_id:'C105'},
      {date:'2025-12-03', category:'Electronics', sales:4200.00, orders:8, customer_id:'C106'},
      {date:'2025-12-05', category:'Clothing', sales:310.00, orders:3, customer_id:'C107'},
      {date:'2025-12-07', category:'Groceries', sales:120.00, orders:4, customer_id:'C108'},
      {date:'2025-12-09', category:'Beauty', sales:260.00, orders:3, customer_id:'C109'},
      {date:'2025-12-11', category:'Books', sales:95.00, orders:1, customer_id:'C110'},
      {date:'2025-12-13', category:'Home', sales:490.00, orders:3, customer_id:'C111'},
      {date:'2025-12-15', category:'Sports', sales:460.00, orders:3, customer_id:'C112'},
      {date:'2025-12-17', category:'Automotive', sales:1150.00, orders:3, customer_id:'C113'},
      {date:'2025-12-19', category:'Clothing', sales:355.00, orders:3, customer_id:'C114'},
      {date:'2025-12-21', category:'Electronics', sales:3900.00, orders:6, customer_id:'C115'},
      {date:'2025-12-23', category:'Toys', sales:260.00, orders:2, customer_id:'C116'},
      {date:'2025-12-25', category:'Beauty', sales:310.00, orders:3, customer_id:'C117'},
      {date:'2025-12-27', category:'Home', sales:420.00, orders:2, customer_id:'C118'},
      {date:'2025-12-29', category:'Groceries', sales:150.00, orders:4, customer_id:'C119'},
      {date:'2025-12-31', category:'Electronics', sales:4500.00, orders:9, customer_id:'C120'}
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
  // tableContainer
  /* ========== MODAL / PROJECT DEMO ========== */

  function openModalDemo(demo) {
    const modal = $('#miniModal');
    const content = $('#modalContent');
    let html = '<h3>Project</h3>';
    if (demo === 'sales') {
      html += `<p><strong>Sales Dashboard</strong> — Interactive demo allows CSV upload, calculates KPIs,
               and visualises sales by category and over time. Technologies: Python (offline pipeline),
               JavaScript (Chart.js), PapaParse for CSV parsing.</p>`;
      html += '<ul><li>Features: KPI cards, filters, charts, CSV export.</li><li>Business impact: quicker insights, better category prioritisation.</li></ul>';
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
  console.log("Submit listener added");

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

  // Telegram bot token va chat ID
  const botToken = "8321663158:AAGXp6315KX7iRsyjt6omyyuN4HIX6mUtcQ";
  const chatId = "6628054450";

  // Telegramga jo'natiladigan matn
  const text = `New message from your website:\nName: ${name}\nEmail: ${email}\nMessage: ${message}`;

  fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text })
  })
  .then(res => res.json())
  .then(data => {
    if (data.ok) {
      alert("✅ Your message has been sent to Telegram!");
      this.reset();
    } else {
      alert("❌ Failed to send message.");
    }
  })
  .catch(err => {
    console.error("❌ Error:", err);
    alert("❌ Server connection error.");
  });
});




