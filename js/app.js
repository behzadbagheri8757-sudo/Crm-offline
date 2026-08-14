/* app.js — screens, forms, navigation, init, QA
   Phase 0 extract: no logic changes.
*/
// ---------- Service Worker registration ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(reg => console.log('Service Worker registered successfully:', reg))
    .catch(err => console.error('Service Worker registration failed:', err));
}
// ---------- render ----------
const tabs = [
  {id:'dashboard', label:'داشبورد'},
  {id:'customers', label:'مشتریان'},
  {id:'products', label:'اجناس و انبار'},
  {id:'suppliers', label:'تامین‌کننده‌ها'},
  {id:'reports', label:'گزارش‌ها'},
  {id:'backup', label:'بکاپ'},
];

function renderNav(){
  const nav = document.getElementById('nav');
  nav.innerHTML = tabs.map(t=>`<button data-tab="${t.id}" class="${activeTab===t.id?'active':''}">${t.label}</button>`).join('');
  nav.querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', ()=>{ activeTab=b.dataset.tab; render(); });
  });
}

function render(){
  renderNav();
  const main = document.getElementById('main');
  const fab = document.getElementById('fab');
  fab.style.display='none'; fab.onclick=null;
  if(activeTab==='dashboard'){ renderDashboard(main); }
  if(activeTab==='products'){ renderProducts(main); fab.style.display='block'; fab.onclick=()=>openAddProduct(); }
  if(activeTab==='customers'){ renderCustomers(main); fab.style.display='block'; fab.onclick=()=>openAddCustomer(); }
  if(activeTab==='suppliers'){ renderSuppliers(main); fab.style.display='block'; fab.onclick=()=>openAddSupplier(); }
  if(activeTab==='reports'){ renderReports(main); }
  if(activeTab==='backup'){ renderBackup(main); }
}

function renderDashboard(main){
  const g = globalTotals();
  const due = checksDueSoon();
  const lowStock = lowStockProducts();
  main.innerHTML = `
    <div class="cards">
      <div class="card"><div class="label">فروش امروز</div><div class="value accent-olive">${toman(g.todaySales)} ت</div><div class="sub">${g.todayCount} فاکتور</div></div>
      <div class="card"><div class="label">فروش این ماه</div><div class="value accent-olive">${toman(g.monthSales)} ت</div><div class="sub">${g.monthCount} فاکتور</div></div>
      <div class="card"><div class="label">جمع سود کل</div><div class="value accent-olive">${toman(g.totalProfit)} ت</div></div>
      <div class="card"><div class="label">جمع دریافتی (نقد/کارت/انتقال)</div><div class="value">${toman(g.totalReceived)} ت</div></div>
      <div class="card"><div class="label">چک‌های در جریان</div><div class="value accent-amber">${toman(g.outstandingChecks)} ت</div></div>
      <div class="card"><div class="label">بدهی مشتریان به شما</div><div class="value accent-rust">${toman(g.customerDebt)} ت</div></div>
      <div class="card"><div class="label">بدهی شما به تامین‌کننده‌ها</div><div class="value accent-red">${toman(g.supplierDebt)} ت</div></div>
      <div class="card"><div class="label">ارزش ریالی انبار</div><div class="value">${toman(inventoryValue())} ت</div></div>
    </div>
    <h2 class="section-title">چک‌های نزدیک سررسید</h2>
    ${due.length===0 ? `<div class="empty">فعلاً چکی نزدیک سررسید نیست</div>` : due.map(c=>{
      const cust = data.customers.find(x=>x.id===c.customerId);
      const overdue = new Date(c.dueDate) < new Date();
      return `<div class="ledger-row">
        <span class="name" style="color:${overdue?'var(--red)':'var(--amber)'}">${esc(cust?cust.name:'—')}</span>
        <span class="filler"></span>
        <span class="amount">${toman(c.amount)} ت
          <span class="sub">${overdue?'سررسید گذشته':'سررسید'}: ${faDate(c.dueDate)}</span>
        </span>
      </div>`;
    }).join('')}
    ${lowStock.length? `
      <h2 class="section-title">کالاهای رو به اتمام</h2>
      ${lowStock.map(p=>`
        <div class="ledger-row"><span class="name">${esc(p.name)}</span><span class="filler"></span>
        <span class="amount accent-red">${p.stockQty} باقیمانده <span class="sub">حداقل: ${p.minStock}</span></span></div>
      `).join('')}
    ` : ''}
  `;
}

function renderProducts(main){
  main.innerHTML = `
    <div class="field"><input id="product-search" placeholder="جستجوی کالا یا دسته‌بندی..."></div>
    <div id="product-table-wrap"></div>
  `;
  function draw(filterText){
    const q = (filterText||'').trim().toLowerCase();
    let list = data.products.filter(p=> !q || (p.name||'').toLowerCase().includes(q) || (p.category||'').toLowerCase().includes(q));
    list = list.slice().sort((a,b)=> ((a.active===false)?1:0) - ((b.active===false)?1:0) );
    const wrap = document.getElementById('product-table-wrap');
    if(data.products.length===0){ wrap.innerHTML = `<div class="empty">هنوز جنسی ثبت نشده. با دکمه + یکی اضافه کن.</div>`; return; }
    if(list.length===0){ wrap.innerHTML = `<div class="empty">چیزی پیدا نشد</div>`; return; }
    wrap.innerHTML = list.map(p=>{
      const low = (p.minStock||0)>0 && (p.stockQty||0)<=p.minStock;
      const isOff = p.active===false;
      return `<div class="ledger-row" data-edit-product="${p.id}" style="${isOff?'opacity:.45;':''}">
        <span class="name">${esc(p.name)}${p.category?` <span class="sub" style="display:inline;">(${esc(p.category)})</span>`:''}${isOff?' <span class="badge pending">غیرفعال</span>':''}</span>
        <span class="filler"></span>
        <span class="amount">موجودی: ${p.stockQty||0} ${low?'<span class="badge low">کم</span>':''}
          <span class="sub">ارزش ${toman((typeof productInventoryValue==='function'?productInventoryValue(p.id):0))} ت${(p.stockQty||0)>0?` · بهای میانگین ${toman(Math.round(((typeof productInventoryValue==='function'?productInventoryValue(p.id):0)/(p.stockQty||1))))}`:''}</span>
          <span class="sub">مرجع خرید ${toman(p.buy)} / عمده ${toman(p.wholesale)} / مصرف‌کننده ${toman(p.retail)}</span>
        </span>
      </div>`;
    }).join('');
    wrap.querySelectorAll('[data-edit-product]').forEach(b=>{
      b.addEventListener('click', ()=>openAddProduct(b.dataset.editProduct));
    });
  }
  draw('');
  document.getElementById('product-search').addEventListener('input', e=>draw(e.target.value));
}

function renderCustomers(main){
  main.innerHTML = `
    <div class="field"><input id="customer-search" placeholder="جستجوی مشتری، منطقه یا مسیر..."></div>
    <div class="chip-row">
      <button class="chip ${custFilter==='all'?'active':''}" data-f="all">همه</button>
      <button class="chip ${custFilter==='debtor'?'active':''}" data-f="debtor">بدحساب</button>
      <button class="chip ${custFilter==='active'?'active':''}" data-f="active">فعال</button>
      <button class="chip ${custFilter==='inactive'?'active':''}" data-f="inactive">بدون خرید اخیر</button>
      <button class="chip ${custFilter==='lost'?'active':''}" data-f="lost">از دست رفته</button>
    </div>
    <div class="btn-row" style="margin-bottom:10px;margin-top:-4px;">
      <button class="btn small secondary" id="sort-debt">${custSortByDebt?'✓ ':''}مرتب‌سازی بر اساس بدهی</button>
    </div>
    <div id="customer-list"></div>
  `;
  function draw(filterText){
    const q = (filterText||'').trim().toLowerCase();
    let list = data.customers.filter(c=>{
      if(!q) return true;
      return (c.name||'').toLowerCase().includes(q) || (c.region||'').toLowerCase().includes(q) || (c.route||'').toLowerCase().includes(q);
    });
    if(custFilter==='debtor') list = list.filter(c=>customerTotals(c.id).balance>0);
    if(custFilter==='active') list = list.filter(c=>customerStatus(c.id)==='active');
    if(custFilter==='inactive') list = list.filter(c=>customerStatus(c.id)==='inactive');
    if(custFilter==='lost') list = list.filter(c=>customerStatus(c.id)==='lost');
    list = list.slice().sort((a,b)=>{
      const aOff = (a.active===false)?1:0, bOff = (b.active===false)?1:0;
      if(aOff!==bOff) return aOff-bOff;
      if(custSortByDebt) return customerTotals(b.id).balance-customerTotals(a.id).balance;
      return 0;
    });

    const wrap = document.getElementById('customer-list');
    if(data.customers.length===0){ wrap.innerHTML = `<div class="empty">هنوز مشتری‌ای ثبت نشده. با دکمه + یکی اضافه کن.</div>`; return; }
    if(list.length===0){ wrap.innerHTML = `<div class="empty">چیزی پیدا نشد</div>`; return; }
    wrap.innerHTML = list.map(c=>{
      const t = customerTotals(c.id);
      const color = t.balance > 0 ? 'var(--rust)' : 'var(--olive-dark)';
      const status = customerStatus(c.id);
      const statusLabel = {new:'جدید', active:'فعال', inactive:'بدون خرید اخیر', lost:'از دست رفته'}[status];
      const isOff = c.active===false;
      return `<div class="ledger-row" data-open-customer="${c.id}" style="${isOff?'opacity:.45;':''}">
        <span class="name">${esc(c.name)}${c.region?` <span class="sub" style="display:inline;">(${esc(c.region)}${c.route?' — '+esc(c.route):''})</span>`:''}${isOff?' <span class="badge pending">غیرفعال</span>':''}</span>
        <span class="filler"></span>
        <span class="amount" style="color:${color}">
          ${balanceStatusText(t.balance, toman(Math.abs(t.balance))+' ت')}
          <span class="sub">${statusLabel}${t.checkTotal>0?` — چک: ${toman(t.checkTotal)} ت`:''}</span>
        </span>
      </div>`;
    }).join('');
    wrap.querySelectorAll('[data-open-customer]').forEach(row=>{
      row.addEventListener('click', ()=>openCustomerDetail(row.dataset.openCustomer));
    });
  }
  draw('');
  document.getElementById('customer-search').addEventListener('input', e=>draw(e.target.value));
  main.querySelectorAll('.chip').forEach(ch=>{
    ch.addEventListener('click', ()=>{ custFilter = ch.dataset.f; renderCustomers(main); });
  });
  document.getElementById('sort-debt').addEventListener('click', ()=>{
    custSortByDebt = !custSortByDebt; renderCustomers(main);
  });
}

function renderReports(main){
  const g = globalTotals();
  const tp = topProducts(5);
  const tc = topCustomers(5);
  const debtors = debtorList(10);
  const inactives = inactiveCustomers();
  const low = lowStockProducts();
  main.innerHTML = `
    <div class="cards">
      <div class="card"><div class="label">فروش امروز</div><div class="value accent-olive">${toman(g.todaySales)} ت</div></div>
      <div class="card"><div class="label">فروش این ماه</div><div class="value accent-olive">${toman(g.monthSales)} ت</div></div>
      <div class="card"><div class="label">سود کل</div><div class="value accent-olive">${toman(g.totalProfit)} ت</div></div>
      <div class="card"><div class="label">ارزش انبار</div><div class="value">${toman(inventoryValue())} ت</div></div>
    </div>

    <h2 class="section-title">پرفروش‌ترین کالاها</h2>
    ${tp.length===0?`<div class="empty">هنوز فروشی ثبت نشده</div>`:tp.map(x=>`
      <div class="ledger-row"><span class="name">${esc(x.name)}</span><span class="filler"></span>
      <span class="amount">${x.qty} عدد <span class="sub">${toman(x.revenue)} ت</span></span></div>
    `).join('')}

    <h2 class="section-title">بهترین مشتریان</h2>
    ${tc.length===0?`<div class="empty">هنوز فروشی ثبت نشده</div>`:tc.map(x=>`
      <div class="ledger-row" data-open-customer="${x.c.id}"><span class="name">${esc(x.c.name)}</span><span class="filler"></span>
      <span class="amount">${toman(x.t.invTotal)} ت</span></div>
    `).join('')}

    <h2 class="section-title">مشتریان بدهکار (به ترتیب بدهی)</h2>
    ${debtors.length===0?`<div class="empty">بدهکاری ثبت نشده</div>`:debtors.map(x=>`
      <div class="ledger-row" data-open-customer="${x.c.id}"><span class="name">${esc(x.c.name)}</span><span class="filler"></span>
      <span class="amount accent-rust">${toman(x.t.balance)} ت</span></div>
    `).join('')}

    <h2 class="section-title">مشتریان بدون خرید اخیر / از دست رفته</h2>
    ${inactives.length===0?`<div class="empty">همه‌ی مشتریان اخیراً خرید داشته‌اند</div>`:inactives.map(x=>`
      <div class="ledger-row" data-open-customer="${x.c.id}"><span class="name">${esc(x.c.name)}</span><span class="filler"></span>
      <span class="amount">${isFinite(x.st.daysSinceLast)? x.st.daysSinceLast+' روز پیش' : 'هرگز'}</span></div>
    `).join('')}

    <h2 class="section-title">کالاهای رو به اتمام</h2>
    ${low.length===0?`<div class="empty">موجودی همه‌ی کالاها کافی است</div>`:low.map(p=>`
      <div class="ledger-row"><span class="name">${esc(p.name)}</span><span class="filler"></span>
      <span class="amount accent-red">${p.stockQty} از ${p.minStock}</span></div>
    `).join('')}

    <div class="btn-row"><button class="btn secondary" id="rep-excel">خروجی اکسل کامل</button></div>
  `;
  main.querySelectorAll('[data-open-customer]').forEach(row=>{
    row.addEventListener('click', ()=>openCustomerDetail(row.dataset.openCustomer));
  });
  document.getElementById('rep-excel').addEventListener('click', exportExcel);
}

function renderBackup(main){
  const stats = `${data.customers.length} مشتری، ${data.invoices.length} فاکتور، ${data.products.length} کالا، ${data.suppliers.length} تامین‌کننده`;
  main.innerHTML = `
    <h2 class="section-title">وضعیت فعلی</h2>
    <div class="empty" style="padding:12px 0;">${stats}</div>

    <h2 class="section-title">پشتیبان‌گیری</h2>
    <div class="btn-row">
      <button class="btn" id="export-json">دانلود بکاپ (JSON)</button>
      <button class="btn secondary" id="export-excel">خروجی اکسل (گزارش)</button>
    </div>

    <h2 class="section-title">بازیابی از بکاپ</h2>
    <div class="field">
      <label>فایل بکاپ JSON رو انتخاب کن (از Files یا iCloud)</label>
      <input type="file" id="import-file" accept="application/json">
    </div>
    <div class="confirm-box">
      ⚠️ بازیابی، تمام اطلاعات فعلی رو با فایل بکاپ جایگزین می‌کنه. قبل از تایید یک نسخه از وضعیت فعلی به‌طور خودکار نگه‌داشته می‌شه و می‌تونی برش گردونی، ولی بهتره اگه چیز مهمی ثبت کردی، همین الان یک بکاپ دستی هم بگیری.
    </div>
    <div class="btn-row">
      <button class="btn danger" id="do-import">بازیابی و جایگزینی اطلاعات فعلی</button>
      <button class="btn secondary" id="undo-import">برگشت به قبل از آخرین بازیابی</button>
    </div>

    <h2 class="section-title">بکاپ‌های خودکار (داخل همین دستگاه)</h2>
    <div class="empty" style="padding:0 0 8px;text-align:right;">هر حدود ۱۲ ساعت یک نسخه خودکار گرفته می‌شه و فقط ۵ نسخه‌ی آخر نگه داشته می‌شه. اینا جایگزین بکاپ دستی (بالا) نیستن، فقط یه شبکه‌ی ایمنی اضافه‌ن.</div>
    <div id="auto-backup-list"><div class="empty">در حال بارگذاری…</div></div>
  `;
  document.getElementById('export-json').addEventListener('click', exportBackupJSON);
  document.getElementById('export-excel').addEventListener('click', exportExcel);
  document.getElementById('undo-import').addEventListener('click', undoLastRestore);
  document.getElementById('do-import').addEventListener('click', ()=>{
    const inp = document.getElementById('import-file');
    if(!inp.files || !inp.files[0]){ showToast('اول یه فایل انتخاب کن'); return; }
    if(!confirm('مطمئنی؟ اطلاعات فعلی با فایل بکاپ جایگزین می‌شه.')) return;
    importBackupJSON(inp.files[0]);
  });

  getAutoBackupList().then(list=>{
    const wrap = document.getElementById('auto-backup-list');
    if(!wrap) return; // کاربر قبل از رسیدن جواب، تب رو عوض کرده
    if(!list.length){ wrap.innerHTML = `<div class="empty">هنوز نسخه‌ی خودکاری گرفته نشده</div>`; return; }
    wrap.innerHTML = list.slice().reverse().map(item=>`
      <div class="ledger-row" data-restore-auto="${item.key}">
        <span class="name">${new Date(item.ts).toLocaleString('fa-IR')}</span>
        <span class="filler"></span>
        <span class="amount"><button class="btn small secondary" data-restore-auto-btn="${item.key}">بازیابی</button></span>
      </div>
    `).join('');
    wrap.querySelectorAll('[data-restore-auto-btn]').forEach(btn=>{
      btn.addEventListener('click', ()=>restoreFromAutoBackup(btn.dataset.restoreAutoBtn));
    });
  }).catch(e=>{
    console.error('loading auto backup list failed', e);
    const wrap = document.getElementById('auto-backup-list');
    if(wrap) wrap.innerHTML = `<div class="empty">لیست بکاپ خودکار در دسترس نیست</div>`;
  });
}

function renderSuppliers(main){
  if(data.suppliers.length===0){
    main.innerHTML = `<div class="empty">هنوز تامین‌کننده‌ای ثبت نشده. با دکمه + یکی اضافه کن.</div>`;
    return;
  }
  main.innerHTML = data.suppliers.map(s=>{
    const t = supplierTotals(s.id);
    return `<div class="ledger-row" data-open-supplier="${s.id}">
      <span class="name">${esc(s.name)}</span>
      <span class="filler"></span>
      <span class="amount" style="color:${t.balance>0?'var(--red)':'var(--olive-dark)'}">
        ${t.balance>0?'بدهکارید ':'تسویه '}${toman(Math.abs(t.balance))} ت
      </span>
    </div>`;
  }).join('');
  main.querySelectorAll('[data-open-supplier]').forEach(row=>{
    row.addEventListener('click', ()=>openSupplierDetail(row.dataset.openSupplier));
  });
}

// ---------- print & image export ----------
function invoiceDocHtml(inv, cust, forPrint){
  const itemRows = inv.items.map((it,idx)=>`
    <tr>
      <td>${idx+1}</td>
      <td style="text-align:right;">${esc(it.name)}</td>
      <td>${it.qty}</td>
      <td>${toman(it.price)}</td>
      <td>${it.discount?toman(it.discount):'—'}</td>
      <td>${toman(it.qty*it.price-(it.discount||0))}</td>
    </tr>
  `).join('');
  const subtotal = inv.items.reduce((s,it)=>s+it.qty*it.price-(it.discount||0),0);
  const discount = inv.discount||0;
  const discountAmount = invoiceDiscountAmount(inv);
  const paidAmount = (inv.cashPaid||0)+(inv.cardPaid||0)+(inv.transferPaid||0)+(inv.checkPaid||0);
  const hasPrev = typeof inv.prevBalance==='number' && inv.prevBalance!==0;
  const hasFinal = typeof inv.newBalance==='number' && inv.newBalance!==0;
  const custDisplay = cust
    ? (cust.ownerName ? (esc(cust.name)+' / '+esc(cust.ownerName)) : esc(cust.name||'—'))
    : '—';
  return `
    <div class="inv-doc ${forPrint?'':'screen-preview'}">
      <div class="inv-head">
        <div class="inv-logo"><img src="${appLogoSrc()}" alt="لوگو" width="140" height="77"></div>
        <div class="inv-brand">
          <div class="inv-brand-name">حبوبات و خشکبار باقری</div>
          <div class="inv-doc-title">فاکتور فروش</div>
        </div>
        <div class="inv-meta">
          <div>شماره: <b>${inv.number||'—'}</b></div>
          <div>تاریخ: <b>${faDate(inv.date)}</b></div>
        </div>
      </div>
      <div class="inv-customer">
        <div>مشتری: <b>${custDisplay}</b></div>
        ${cust&&cust.phone?`<div>تماس: ${esc(cust.phone)}</div>`:''}
        ${cust&&cust.address?`<div>آدرس: ${esc(cust.address)}</div>`:''}
      </div>
      <table class="inv-table">
        <thead><tr><th>ردیف</th><th>شرح کالا</th><th>تعداد</th><th>قیمت واحد</th><th>تخفیف</th><th>مبلغ</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table class="inv-totals">
        <tr><td>جمع جزء</td><td>${toman(subtotal)} تومان</td></tr>
        ${discount>0?(inv.discountType==='percent'
          ?`<tr><td>تخفیف (${toman(discount)}٪)</td><td>${toman(discountAmount)} تومان</td></tr>`
          :`<tr><td>تخفیف کلی فاکتور</td><td>${toman(discount)} تومان</td></tr>`):''}
        <tr class="inv-final"><td>مبلغ قابل پرداخت</td><td>${toman(inv.total)} تومان</td></tr>
        ${hasPrev?`<tr><td>مانده حساب قبل از فاکتور</td><td>${toman(Math.abs(inv.prevBalance))} تومان (${balanceStatusWord(inv.prevBalance)})</td></tr>`:''}
        ${paidAmount>0?`<tr><td>پرداختی همراه این فاکتور</td><td>${toman(paidAmount)} تومان</td></tr>`:''}
        ${(hasPrev||hasFinal)?`<tr class="inv-final"><td>مانده حساب بعد از فاکتور</td><td>${toman(Math.abs(inv.newBalance))} تومان (${balanceStatusWord(inv.newBalance)})</td></tr>`:''}
      </table>
      <div style="margin-top:14px;font-size:.82rem;line-height:1.7;text-align:right;">
        <div>بانک صادرات / بهزاد باقری</div>
        <div>شماره کارت: 6037 6981 0400 9928</div>
        <div>شماره شبا: IR 41 0190 0000 0011 9860 2490 05</div>
      </div>
      <div style="margin-top:10px;text-align:center;font-size:.85rem;">سپاس از اعتماد و همراهی شما</div>
      ${forPrint?`
      <div class="inv-signatures">
        <div>امضای فروشنده<div class="inv-sig-line"></div></div>
        <div>امضای خریدار<div class="inv-sig-line"></div></div>
      </div>`:''}
    </div>
  `;
}

/** Directory URL of the current HTML page (handles GitHub Pages project paths) */
function getPageDirUrl(){
  try{
    const u = new URL(window.location.href);
    let path = u.pathname || '/';
    const last = path.split('/').pop() || '';
    if(/\.[a-zA-Z0-9]+$/.test(last)){
      path = path.substring(0, path.lastIndexOf('/') + 1);
    }else if(!path.endsWith('/')){
      path = path + '/';
    }
    return u.origin + path;
  }catch(e){
    return (document.baseURI || window.location.href || '').replace(/[^/]+$/, '') || './';
  }
}

/** Absolute URL for a project-relative asset.
 * Uses document.baseURI (browser-native base-URL resolution) instead of manually
 * rebuilding origin+pathname — avoids edge cases with file:// URLs, GitHub Pages
 * sub-paths, and trailing-slash handling that a hand-rolled resolver can get wrong. */
function resolvedAssetUrl(relPath){
  try{ return new URL(relPath, document.baseURI || window.location.href).href; }
  catch(e){ return relPath; }
}
function appLogoSrc(){
  const p = (typeof APP_LOGO_DATA_URI !== 'undefined' && APP_LOGO_DATA_URI) ? APP_LOGO_DATA_URI : './logo-export.png';
  return resolvedAssetUrl(p);
}
function exportLogoSrc(){
  const p = (typeof EXPORT_LOGO_DATA_URI !== 'undefined' && EXPORT_LOGO_DATA_URI) ? EXPORT_LOGO_DATA_URI : './logo-export.png';
  return resolvedAssetUrl(p);
}

/**
 * Fetch logo once and convert to data: URL so Print/html2canvas never depend on
 * a live network path at capture time (fixes broken-image in real CRM print/export).
 * Cached in-memory for the page session.
 *
 * cache:'reload' is removed to allow Service Worker cache to serve the logo offline.
 */
let __logoDataUrlCache = Object.create(null);
async function logoToDataUrl(kind){
  const abs = kind === 'export' ? exportLogoSrc() : appLogoSrc();
  if(__logoDataUrlCache[abs]) return __logoDataUrlCache[abs];
  try{
    const res = await fetch(abs); // <-- cache:'reload' removed
    if(!res.ok) throw new Error('HTTP '+res.status+' '+res.statusText+' for '+abs);
    const blob = await res.blob();
    if(!blob || !blob.size) throw new Error('empty blob for '+abs);
    const dataUrl = await new Promise((resolve, reject)=>{
      const fr = new FileReader();
      fr.onload = ()=> resolve(fr.result);
      fr.onerror = ()=> reject(fr.error || new Error('FileReader failed'));
      fr.readAsDataURL(blob);
    });
    if(typeof dataUrl !== 'string' || dataUrl.indexOf('data:image') !== 0){
      throw new Error('not an image data URL');
    }
    __logoDataUrlCache[abs] = dataUrl;
    return dataUrl;
  }catch(e){
    console.error('logoToDataUrl failed', abs, e);
    return null;
  }
}

function waitForImg(img, timeoutMs){
  return new Promise(resolve=>{
    if(!img){ resolve({ok:true, reason:'no-img', naturalWidth:0, currentSrc:''}); return; }
    const ms = timeoutMs || 8000;
    let settled = false;
    const finish = (ok, reason)=>{
      if(settled) return;
      settled = true;
      resolve({
        ok: !!ok,
        reason: reason || '',
        naturalWidth: img.naturalWidth || 0,
        naturalHeight: img.naturalHeight || 0,
        currentSrc: img.currentSrc || img.src || ''
      });
    };
    if(img.complete){
      if(img.naturalWidth > 0) finish(true, 'already-complete');
      else finish(false, 'already-broken');
      return;
    }
    img.addEventListener('load', ()=>{
      if(img.naturalWidth > 0) finish(true, 'load');
      else finish(false, 'load-zero');
    }, {once:true});
    img.addEventListener('error', ()=> finish(false, 'error'), {once:true});
    setTimeout(()=>{
      if(img.complete && img.naturalWidth > 0) finish(true, 'timeout-ok');
      else finish(false, 'timeout');
    }, ms);
  });
}

/** Set every .inv-logo img (and all imgs) to embedded data URL, then wait for decode */
async function prepareInvoiceImgs(root, kind, timeoutMs){
  if(!root) return [];
  const dataUrl = await logoToDataUrl(kind || 'print');
  const imgs = Array.from(root.querySelectorAll('img'));
  imgs.forEach(img=>{
    if(dataUrl){
      img.removeAttribute('crossorigin');
      img.src = dataUrl;
    }else{
      // last resort: absolute path
      const raw = img.getAttribute('src') || '';
      if(raw && !/^(https?:|data:|blob:)/i.test(raw)){
        img.src = resolvedAssetUrl(raw);
      }
    }
  });
  const results = [];
  for(const img of imgs){
    results.push(await waitForImg(img, timeoutMs || 8000));
  }
  return results;
}

async function printInvoice(invId){
  const inv = data.invoices.find(x=>x.id===invId);
  if(!inv){ if(typeof showToast==='function') showToast('فاکتور برای چاپ پیدا نشد'); return; }
  const cust = data.customers.find(x=>x.id===inv.customerId);
  const area = document.getElementById('printArea');
  if(!area){ if(typeof showToast==='function') showToast('ناحیه چاپ در صفحه موجود نیست'); return; }
  area.innerHTML = invoiceDocHtml(inv, cust, true);
  const results = await prepareInvoiceImgs(area, 'print', 8000);
  const failed = results.filter(r=>!r.ok);
  if(failed.length){
    console.warn('print logo load failed', failed);
    if(typeof showToast==='function') showToast('لوگو بارگذاری نشد — مسیر logo-export.png را بررسی کنید');
  }
  // one extra frame after decode so layout/print engine sees the bitmap
  await new Promise(r=> requestAnimationFrame(()=> requestAnimationFrame(r)));
  try{ window.print(); }
  catch(e){ console.error(e); if(typeof showToast==='function') showToast('چاپ در این مرورگر پشتیبانی نشد'); }
}

function statementDocHtml(c, forPrint){
  const invs = customerInvoices(c.id).map(i=>({date:i.date, type:'فاکتور #'+(i.number||'—'), amount:i.total, kind:'debit'}));
  const pays = customerPayments(c.id).map(p=>({date:p.date, type:paymentMethodLabel(p.method), amount:p.amount, kind:'credit'}));
  const checks = customerChecks(c.id).map(ch=>({date:ch.dueDate, type:'دریافت چک'+(ch.status==='cleared'?' (وصول شده)':' (در جریان)'), amount:ch.amount, kind:'credit'}));
  const opening = (c.openingBalance||0) !== 0 ? [{date:'0000-01-01', type:'مانده حساب اولیه', amount:Math.abs(c.openingBalance), kind: c.openingBalance>0?'debit':'credit'}] : [];
  const ledger = [...opening, ...invs, ...pays, ...checks].sort((a,b)=>new Date(a.date)-new Date(b.date));

  let running = 0;
  const rowsHtml = ledger.map(l=>{
    running += (l.kind==='debit' ? l.amount : -l.amount);
    return `
      <tr>
        <td>${l.date==='0000-01-01' ? 'ابتدا' : faDate(l.date)}</td>
        <td style="text-align:right;">${esc(l.type)}</td>
        <td>${l.kind==='debit' ? toman(l.amount) : ''}</td>
        <td>${l.kind==='credit' ? toman(l.amount) : ''}</td>
        <td>${toman(running)}</td>
      </tr>
    `;
  }).join('');
  const finalBalance = running;
  return `
    <div class="inv-doc ${forPrint?'':'screen-preview'}">
      <div class="inv-head">
        <div class="inv-logo"><img src="${appLogoSrc()}" alt="لوگو" width="140" height="77"></div>
        <div class="inv-brand">
          <div class="inv-brand-name">حبوبات و خشکبار باقری</div>
          <div class="inv-doc-title">صورتحساب مشتری</div>
        </div>
        <div class="inv-meta"><div>تاریخ صدور: <b>${faDate(todayISO())}</b></div></div>
      </div>
      <div class="inv-customer">
        <div>مشتری: <b>${esc(c.name)}</b></div>
        ${c.phone?`<div>تماس: ${esc(c.phone)}</div>`:''}
        ${c.address?`<div>آدرس: ${esc(c.address)}</div>`:''}
      </div>
      <table class="inv-table">
        <thead><tr><th>تاریخ</th><th>شرح</th><th>بدهکار</th><th>بستانکار</th><th>مانده</th></tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="5" style="text-align:center;">تراکنشی ثبت نشده</td></tr>`}</tbody>
      </table>
      <table class="inv-totals">
        <tr class="inv-final"><td>مانده نهایی (${balanceStatusWord(finalBalance)})</td><td>${toman(Math.abs(finalBalance))} تومان</td></tr>
      </table>
      ${forPrint?`
      <div class="inv-signatures">
        <div>امضای فروشنده<div class="inv-sig-line"></div></div>
        <div>امضای خریدار<div class="inv-sig-line"></div></div>
      </div>`:''}
    </div>
  `;
}

async function printCustomerStatement(cid){
  const c = data.customers.find(x=>x.id===cid);
  if(!c) return;
  const area = document.getElementById('printArea');
  if(!area) return;
  area.innerHTML = statementDocHtml(c, true);
  await prepareInvoiceImgs(area, 'print', 8000);
  await new Promise(r=> requestAnimationFrame(()=> requestAnimationFrame(r)));
  try{ window.print(); }
  catch(e){ console.error(e); }
}

async function exportInvoiceImage(invId){
  const inv = data.invoices.find(x=>x.id===invId);
  if(!inv) return;
  if(typeof html2canvas === 'undefined'){
    showToast('برای خروجی تصویر به اینترنت نیاز است (یک‌بار برای بارگذاری کتابخانه)');
    return;
  }
  const cust = data.customers.find(x=>x.id===inv.customerId);
  const holder = document.createElement('div');
  holder.style.position='fixed'; holder.style.left='-9999px'; holder.style.top='0';
  holder.style.width='420px';
  holder.style.background='#fff';
  holder.innerHTML = invoiceDocHtml(inv, cust, false);
  document.body.appendChild(holder);
  const results = await prepareInvoiceImgs(holder, 'export', 10000);
  const failed = results.filter(r=>!r.ok);
  if(failed.length){
    console.warn('export logo load failed', failed);
  }
  // ensure decode before capture
  await new Promise(r=> requestAnimationFrame(()=> requestAnimationFrame(r)));
  try{
    const canvas = await html2canvas(holder, {
      scale:2,
      backgroundColor:'#ffffff',
      useCORS:true,
      allowTaint:true,
      imageTimeout:10000
    });
    canvas.toBlob(async (blob)=>{
      await downloadFile(`فاکتور-${inv.number||''}.png`, blob, 'image/png');
      showToast('تصویر فاکتور آماده شد — می‌تونی از واتساپ بفرستی');
    }, 'image/png');
  }catch(e){
    console.error(e);
    showToast('ساخت تصویر ممکن نشد');
  }finally{
    holder.remove();
  }
}

// ---------- products / inventory ----------
function openAddProduct(editId){
  const p = editId ? data.products.find(x=>x.id===editId) : null;
  const history = (p && p.priceHistory) ? [...p.priceHistory].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6) : [];
  const stockLog = (p && p.stockLog) ? [...p.stockLog].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8) : [];
  const profitPct = p && p.buy ? Math.round(((p.retail-p.buy)/p.buy)*100) : null;
  openSheet(`
    <h3>${p?'ویرایش جنس':'جنس جدید'}</h3>
    <div class="field"><label>نام جنس</label><input id="f-name" value="${p?esc(p.name):''}"></div>
    <div class="field">
      <label>دسته‌بندی</label>
      <input id="f-cat" list="cat-list" value="${p?esc(p.category||''):''}">
      <datalist id="cat-list">${CATEGORY_SUGGESTIONS.map(c=>`<option value="${c}">`).join('')}</datalist>
    </div>
    <div class="field"><label>وزن بسته (کیلوگرم یا گرم، اختیاری)</label><input id="f-pkgw" type="text" inputmode="decimal" value="${p&&p.packageWeight?p.packageWeight:''}"></div>

    <div class="field"><label>تاریخ این تغییر قیمت</label><input id="f-pdate" type="date" value="${todayISO()}"></div>
    <div class="field" style="display:flex;gap:8px;">
      <div style="flex:1;"><label>قیمت خرید (مرجع/کاتالوگ)</label><input id="f-buy" type="text" inputmode="decimal" value="${p?p.buy:''}"></div>
      <div style="flex:1;"><label>قیمت عمده</label><input id="f-wholesale" type="text" inputmode="decimal" value="${p?p.wholesale:''}"></div>
      <div style="flex:1;"><label>قیمت مصرف‌کننده</label><input id="f-retail" type="text" inputmode="decimal" value="${p?p.retail:''}"></div>
    </div>
    ${profitPct!==null?`<div class="empty" style="padding:0 0 8px;text-align:right;font-size:.8rem;">درصد سود تقریبی (نسبت به قیمت مصرف‌کننده): ${profitPct}٪</div>`:''}

    <h2 class="section-title">موجودی انبار</h2>
    <div class="field" style="display:flex;gap:8px;">
      <div style="flex:1;"><label>موجودی فعلی</label><input id="f-stock" type="text" inputmode="decimal" value="${p?p.stockQty||0:0}"></div>
      <div style="flex:1;"><label>حداقل موجودی هشدار</label><input id="f-minstock" type="text" inputmode="decimal" value="${p?p.minStock||0:0}"></div>
    </div>
    ${p?`<div class="empty" style="padding:4px 0 8px;text-align:right;font-size:.8rem;">ارزش واقعی موجودی (FIFO): <b>${toman((typeof productInventoryValue==='function'?productInventoryValue(p.id):0))} ت</b>${(p.stockQty||0)>0?` · بهای میانگین لایه‌ها: ${toman(Math.round(((typeof productInventoryValue==='function'?productInventoryValue(p.id):0)/(p.stockQty||1))))} ت`:''}<br><span style="opacity:.85;">«قیمت خرید» قیمت مرجع/کاتالوگ است و با ثبت خرید تأمین‌کننده خودکار عوض نمی‌شود.</span></div>`:''}
    ${p?`
    <div class="field" style="display:flex;gap:8px;align-items:end;">
      <div style="flex:1;"><label>تغییر سریع موجودی</label><input id="f-adjust-qty" type="text" inputmode="decimal" placeholder="مثلاً ۱۰"></div>
      <button class="btn small" id="stock-in">+ ورود</button>
      <button class="btn small secondary" id="stock-out">- خروج/اصلاح</button>
    </div>
    `:''}

    <div class="btn-row">
      <button class="btn" id="save-product">ذخیره</button>
      ${p?`<button class="btn secondary" id="toggle-product-active">${p.active===false?'فعال‌سازی':'غیرفعال‌سازی'}</button>`:''}
    </div>
    ${history.length?`
      <h2 class="section-title">تاریخچه قیمت</h2>
      ${history.map(h=>`
        <div class="ledger-row">
          <span class="name">${faDate(h.date)}</span>
          <span class="filler"></span>
          <span class="amount">خرید ${toman(h.buy)} / عمده ${toman(h.wholesale!==undefined?h.wholesale:h.sell)} / مصرف‌کننده ${toman(h.retail!==undefined?h.retail:h.sell)}</span>
        </div>
      `).join('')}
    `:''}
    ${stockLog.length?`
      <h2 class="section-title">تاریخچه موجودی</h2>
      ${stockLog.map(l=>`
        <div class="ledger-row">
          <span class="name">${faDate(l.date)} <span class="sub">${l.note?esc(l.note):''}</span></span>
          <span class="filler"></span>
          <span class="amount" style="color:${l.qty>=0?'var(--olive-dark)':'var(--rust)'}">${l.qty>=0?'+':''}${l.qty}</span>
        </div>
      `).join('')}
    `:''}
  `);

  async function persist(){
    const name = document.getElementById('f-name').value.trim();
    const category = document.getElementById('f-cat').value.trim();
    const packageWeight = numVal(document.getElementById('f-pkgw'));
    const buy = numVal(document.getElementById('f-buy'));
    const wholesale = numVal(document.getElementById('f-wholesale'));
    const retail = numVal(document.getElementById('f-retail'));
    const pdate = document.getElementById('f-pdate').value || todayISO();
    const stockQty = numVal(document.getElementById('f-stock'));
    const minStock = numVal(document.getElementById('f-minstock'));
    if(!name){ showToast('نام جنس رو وارد کن'); return null; }
    if(p){
      p.name=name; p.category=category; p.packageWeight=packageWeight;
      p.buy=buy; p.wholesale=wholesale; p.retail=retail; p.sell=retail;
      p.minStock=minStock;
      p.priceHistory = p.priceHistory||[];
      p.priceHistory.push({date:pdate, buy, wholesale, retail});
      if(stockQty !== p.stockQty){
        manualStockAdjustAbsolute(p.id, stockQty, 'ویرایش دستی موجودی');
      }
      await saveData();
      return p;
    } else {
      const np = {id:uid(), name, category, packageWeight, buy, wholesale, retail, sell:retail,
        stockQty:0, minStock, priceHistory:[{date:pdate, buy, wholesale, retail}], stockLog: [], active:true};
      data.products.push(np);
      if(stockQty>0){
        manualStockIn(np.id, stockQty, 'موجودی اولیه');
      }
      await saveData();
      return np;
    }
  }

  document.getElementById('save-product').addEventListener('click', async ()=>{
    const saved = await persist();
    if(!saved) return;
    closeModal(); render(); showToast('ذخیره شد');
  });
  if(p){
    document.getElementById('toggle-product-active').addEventListener('click', async ()=>{
      p.active = (p.active===false) ? true : false;
      await saveData(); closeModal(); render();
      showToast(p.active===false ? 'جنس غیرفعال شد' : 'جنس فعال شد');
    });
    document.getElementById('stock-in').addEventListener('click', async ()=>{
      const q = numVal(document.getElementById('f-adjust-qty'));
      if(q<=0){ showToast('مقدار رو وارد کن'); return; }
      manualStockIn(p.id, q, 'ورود کالا');
      await saveData(); openAddProduct(p.id); showToast('موجودی اضافه شد');
    });
    document.getElementById('stock-out').addEventListener('click', async ()=>{
      const q = numVal(document.getElementById('f-adjust-qty'));
      if(q<=0){ showToast('مقدار رو وارد کن'); return; }
      if(q > (p.stockQty||0)){
        if(!confirm('موجودی فعلی «'+p.name+'» فقط '+(p.stockQty||0)+' عدد است.\n\nبا این خروج، موجودی منفی می‌شود. مطمئنی می‌خوای ادامه بدی؟')) return;
      }
      manualStockOut(p.id, q, 'خروج/اصلاح دستی');
      await saveData(); openAddProduct(p.id); showToast('موجودی کم شد');
    });
  }
}

// ---------- customers ----------
function openAddCustomer(editId){
  const c = editId ? data.customers.find(x=>x.id===editId) : null;
  openSheet(`
    <h3>${c?'ویرایش مشتری':'مشتری جدید'}</h3>
    <div class="field"><label>نام فروشگاه</label><input id="f-name" value="${c?esc(c.name):''}"></div>
    <div class="field"><label>نام صاحب فروشگاه (اختیاری)</label><input id="f-owner" value="${c?esc(c.ownerName||''):''}"></div>
    <div class="field"><label>شماره تماس (اختیاری)</label><input id="f-phone" value="${c?esc(c.phone||''):''}"></div>
    <div class="field">
      <label>منطقه</label>
      <input id="f-region" list="region-list" value="${c?esc(c.region||''):''}">
      <datalist id="region-list">${REGION_SUGGESTIONS.map(r=>`<option value="${r}">`).join('')}</datalist>
    </div>
    <div class="field">
      <label>مسیر پخش</label>
      <select id="f-route">
        <option value="">— انتخاب نشده —</option>
        ${ROUTES.map(r=>`<option value="${r}" ${c&&c.route===r?'selected':''}>${r}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>آدرس (اختیاری)</label><input id="f-address" value="${c?esc(c.address||''):''}"></div>
    <div class="field"><label>یادداشت (اختیاری)</label><textarea id="f-note">${c?esc(c.note||''):''}</textarea></div>
    <div class="field">
      <label>مانده حساب اولیه (تومان)${c?' — برای اصلاح مانده بعد از شروع کار با برنامه':''}</label>
      <input id="f-opening" type="text" inputmode="decimal" value="${c&&c.openingBalance?c.openingBalance:''}">
      <div class="empty" style="padding:4px 0 0;text-align:right;font-size:.75rem;">بدهی مشتری از قبل از استفاده از این برنامه رو اینجا بزن. اگه خودت بهش بدهکاری (طلبکاره)، عدد رو منفی بزن. این مبلغ توی گزارش فروش/سود حساب نمی‌شه، فقط توی مانده حساب میاد.</div>
    </div>
    <div class="btn-row"><button class="btn" id="save-customer">ذخیره</button></div>
  `);
  document.getElementById('save-customer').addEventListener('click', async ()=>{
    const name = document.getElementById('f-name').value.trim();
    if(!name){ showToast('نام مشتری رو وارد کن'); return; }
    const ownerName = document.getElementById('f-owner').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    const region = document.getElementById('f-region').value.trim();
    const route = document.getElementById('f-route').value;
    const address = document.getElementById('f-address').value.trim();
    const note = document.getElementById('f-note').value.trim();
    const openingBalance = numVal(document.getElementById('f-opening'));
    if(c){ c.ownerName=ownerName; c.name=name; c.phone=phone; c.region=region; c.route=route; c.address=address; c.note=note; c.openingBalance=openingBalance; }
    else{ data.customers.push({id:uid(), name, ownerName, phone, region, route, address, note, openingBalance, visits:[], active:true}); }
    await saveData(); closeModal(); render();
    if(c) openCustomerDetail(c.id);
    showToast('ذخیره شد');
  });
}

function openAddTransaction(cid){
  // وضعیت فرم بین رندرهای مجدد شیت نگه داشته می‌شود (همون الگوی openInvoiceForm)
  let method = 'cash';
  let amountStr = '';
  let dateStr = todayISO();
  let noteStr = '';
  // ردیف‌های کالای برگشتی؛ فقط وقتی نوع تراکنش «برگشت از فروش» است استفاده می‌شود و کاملاً اختیاری است
  let returnRows = [];

  function returnItemsSectionHtml(){
    if(method !== 'return') return '';
    if(data.products.length===0){
      return `<div class="empty" style="padding:8px 0;">جنسی ثبت نشده. اگه این برگشت مربوط به کالای مشخصی نیست، فقط دکمه‌ی «ثبت» رو بزن؛ فقط حساب مشتری اصلاح می‌شه.</div>`;
    }
    return `
      <h2 class="section-title">کالای برگشتی (اختیاری)</h2>
      <div class="empty" style="padding:0 0 8px;text-align:right;">اگه این برگشت واقعاً کالا داره، اینجا اضافه کن تا موجودی انبار هم خودکار زیاد بشه. اگه فقط اصلاح حساب مد نظرته، این بخش رو خالی بذار.</div>
      <div id="return-items-wrap">${returnRows.map((r,idx)=>{
        const available = productReturnAvailableQty(cid, r.productId);
        const over = r.qty > available;
        return `
        <div class="field" style="display:flex;gap:6px;align-items:end;">
          <div style="flex:2;">
            <label>جنس</label>
            <select data-ridx="${idx}" class="ret-product">
              ${data.products.map(p=>`<option value="${p.id}" ${p.id===r.productId?'selected':''}>${esc(p.name)}</option>`).join('')}
            </select>
          </div>
          <div style="flex:1;">
            <label>تعداد</label>
            <input type="text" inputmode="decimal" data-ridx="${idx}" class="ret-qty" value="${r.qty||''}">
          </div>
          <div style="flex:1;">
            <label>قیمت واحد (اختیاری)</label>
            <input type="text" inputmode="decimal" data-ridx="${idx}" class="ret-price" value="${r.price||''}">
          </div>
          <button class="btn small danger" data-ridx="${idx}" id="ret-del-${idx}" style="flex:0;">حذف</button>
        </div>
        <div class="sub" style="margin:-6px 0 10px;${over?'color:var(--rust);':''}">
          قابل برگشت طبق فروش‌های قبلی به این مشتری: ${available} عدد${over?' — ⚠️ تعداد وارد شده بیشتر از این مقدار است':''}
        </div>`;
      }).join('')}</div>
      <button class="btn secondary small" id="add-return-row">+ افزودن کالای برگشتی</button>
    `;
  }

  function renderSheet(){
    openSheet(`
      <h3>ثبت تراکنش جدید</h3>
      <div class="field">
        <label>نوع تراکنش</label>
        <select id="f-method">
          <option value="cash" ${method==='cash'?'selected':''}>دریافت نقدی</option>
          <option value="card" ${method==='card'?'selected':''}>دریافت با کارت</option>
          <option value="transfer" ${method==='transfer'?'selected':''}>انتقال بانکی</option>
          <option value="discount" ${method==='discount'?'selected':''}>تخفیف (کاهش بدهی)</option>
          <option value="return" ${method==='return'?'selected':''}>برگشت از فروش</option>
        </select>
      </div>
      <div class="field"><label>تاریخ</label><input id="f-date" type="date" value="${dateStr}"></div>
      <div class="field"><label>مبلغ (تومان)</label><input id="f-amount" type="text" inputmode="decimal" value="${amountStr}"></div>
      <div class="field"><label>توضیح (اختیاری)</label><input id="f-note" value="${esc(noteStr)}"></div>
      ${returnItemsSectionHtml()}
      <div class="btn-row"><button class="btn" id="save-tx">ثبت</button></div>
    `);

    document.getElementById('f-method').addEventListener('change', e=>{
      method = e.target.value;
      if(method==='return' && data.products.length && returnRows.length===0){
        // یک ردیف خالی برای راحتی، ولی کاملاً اختیاری و قابل حذف
      }
      renderSheet();
    });
    document.getElementById('f-date').addEventListener('input', e=>{ dateStr = e.target.value; });
    document.getElementById('f-amount').addEventListener('input', e=>{ amountStr = e.target.value; });
    document.getElementById('f-note').addEventListener('input', e=>{ noteStr = e.target.value; });

    const addBtn = document.getElementById('add-return-row');
    if(addBtn){
      addBtn.addEventListener('click', ()=>{
        const dp = data.products[0];
        returnRows.push({productId:dp.id, qty:1, price:dp.retail||dp.sell||0});
        renderSheet();
      });
    }
    document.querySelectorAll('.ret-product').forEach(el=>el.addEventListener('change', e=>{
      returnRows[e.target.dataset.ridx].productId = e.target.value;
      renderSheet();
    }));
    document.querySelectorAll('.ret-qty').forEach(el=>el.addEventListener('input', e=>{
      returnRows[e.target.dataset.ridx].qty = parseFloat(faToEnDigits(e.target.value))||0;
    }));
    document.querySelectorAll('.ret-price').forEach(el=>el.addEventListener('input', e=>{
      returnRows[e.target.dataset.ridx].price = parseFloat(faToEnDigits(e.target.value))||0;
    }));
    document.querySelectorAll('[id^="ret-del-"]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        returnRows.splice(parseInt(btn.dataset.ridx,10), 1);
        renderSheet();
      });
    });

    document.getElementById('save-tx').addEventListener('click', async ()=>{
      const amount = parseFloat(faToEnDigits(amountStr))||0;
      const date = dateStr || todayISO();
      const note = (noteStr||'').trim();
      if(amount<=0){ showToast('مبلغ رو وارد کن'); return; }

      let returnItems = [];
      if(method==='return'){
        returnItems = returnRows
          .filter(r=>r.productId && r.qty>0)
          .map(r=>{
            const prod = data.products.find(p=>p.id===r.productId);
            return {productId:r.productId, name:prod?prod.name:'', qty:r.qty, price:r.price||0};
          });
        // هماهنگی مبلغ برگشت با «مقدار × قیمت واحد» کالاهای برگشتی (فقط وقتی قیمت واحدی وارد شده باشد)
        const expectedReturnAmount = returnItems.reduce((s,ri)=>s+(ri.qty*(ri.price||0)),0);
        if(expectedReturnAmount>0 && Math.abs(expectedReturnAmount-amount)>1){
          const proceedAmount = confirm('⚠️ مبلغ واردشده با «مقدار × قیمت واحد» کالاهای برگشتی هم‌خوانی ندارد.\n\nمبلغ واردشده: '+toman(amount)+' تومان\nمبلغ منطقی طبق کالاها: '+toman(expectedReturnAmount)+' تومان\n\nمطمئنی می‌خوای همینطور ثبت کنی؟');
          if(!proceedAmount) return;
        }
        // بررسی برگشت بیشتر از فروش قبلی؛ فقط هشدار می‌دهیم، جلوی ثبت را کاملاً نمی‌بندیم
        const overItems = returnItems.filter(ri=>ri.qty > productReturnAvailableQty(cid, ri.productId));
        if(overItems.length){
          const lines = overItems.map(ri=>{
            const available = productReturnAvailableQty(cid, ri.productId);
            return `«${ri.name}»: برگشت ${ri.qty} عدد، ولی طبق فروش‌های قبلی فقط ${available} عدد قابل برگشت است`;
          }).join('\n');
          const proceed = confirm('⚠️ این برگشت از فروش‌های ثبت‌شده‌ی این مشتری بیشتر است:\n\n'+lines+'\n\nمطمئنی می‌خوای همینطور ثبت کنی؟');
          if(!proceed) return;
        }
      }

      const payment = {id:uid(), customerId:cid, date, amount, method, note, returnItems};
      data.payments.push(payment);
      if(method==='return' && returnItems.length){
        applyReturnStockEffects(returnItems, date, payment);
      }
      await saveData(); openCustomerDetail(cid); render(); showToast('ثبت شد');
    });
  }

  renderSheet();
}

function openAddCheck(cid){
  openSheet(`
    <h3>ثبت چک جدید</h3>
    <div class="field"><label>شماره چک (اختیاری)</label><input id="f-num"></div>
    <div class="field"><label>مبلغ (تومان)</label><input id="f-amount" type="text" inputmode="decimal"></div>
    <div class="field"><label>تاریخ سررسید</label><input id="f-due" type="date" value="${todayISO()}"></div>
    <div class="btn-row"><button class="btn" id="save-check">ثبت</button></div>
  `);
  document.getElementById('save-check').addEventListener('click', async ()=>{
    const amount = numVal(document.getElementById('f-amount'));
    const dueDate = document.getElementById('f-due').value || todayISO();
    const checkNumber = document.getElementById('f-num').value.trim();
    if(amount<=0){ showToast('مبلغ رو وارد کن'); return; }
    data.checks.push({id:uid(), customerId:cid, amount, dueDate, checkNumber, status:'pending'});
    await saveData(); openCustomerDetail(cid); render(); showToast('چک ثبت شد');
  });
}

function openAddVisit(cid){
  openSheet(`
    <h3>ثبت ویزیت مشتری</h3>
    <div class="field"><label>تاریخ</label><input id="f-date" type="date" value="${todayISO()}"></div>
    <div class="field"><label>ساعت</label><input id="f-time" type="time" value="${nowHHMM()}"></div>
    <div class="field">
      <label>نتیجه ویزیت</label>
      <select id="f-result">${VISIT_RESULTS.map(r=>`<option value="${r}">${r}</option>`).join('')}</select>
    </div>
    <div class="btn-row"><button class="btn" id="save-visit">ثبت ویزیت</button></div>
  `);
  document.getElementById('save-visit').addEventListener('click', async ()=>{
    const c = data.customers.find(x=>x.id===cid);
    const date = document.getElementById('f-date').value || todayISO();
    const time = document.getElementById('f-time').value || nowHHMM();
    const result = document.getElementById('f-result').value;
    c.visits = c.visits||[];
    c.visits.push({id:uid(), date, time, result, ordered: result===VISIT_RESULTS[0]});
    await saveData(); openCustomerDetail(cid); render(); showToast('ویزیت ثبت شد');
  });
}

function openCustomerDetail(cid){
  const c = data.customers.find(x=>x.id===cid);
  if(!c) return;
  const t = customerTotals(cid);
  const st = customerStats(cid);
  const invs = customerInvoices(cid).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const pays = customerPayments(cid).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const checks = customerChecks(cid).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
  const visits = (c.visits||[]).slice().sort((a,b)=> new Date(b.date+'T'+(b.time||'00:00')) - new Date(a.date+'T'+(a.time||'00:00')));

  openSheet(`
    <h3>${esc(c.name)}${c.region?` <span class="sub" style="display:inline;">— ${esc(c.region)}${c.route?' / '+esc(c.route):''}</span>`:''}${c.active===false?' <span class="badge pending">غیرفعال</span>':''}</h3>
    ${c.ownerName?`<div class="empty" style="padding:0 0 4px;text-align:right;">صاحب فروشگاه: ${esc(c.ownerName)}</div>`:''}
    ${c.phone?`<div class="empty" style="padding:0 0 4px;text-align:right;">تلفن: ${esc(c.phone)}</div>`:''}
    ${c.note?`<div class="empty" style="padding:0 0 8px;text-align:right;">یادداشت: ${esc(c.note)}</div>`:''}
    ${c.openingBalance?`<div class="empty" style="padding:0 0 8px;text-align:right;">مانده حساب اولیه (قبل از این برنامه): ${toman(Math.abs(c.openingBalance))} ت ${c.openingBalance>0?'بدهکار':'طلبکار'}</div>`:''}
    <div class="cards">
      <div class="card"><div class="label">تعداد فاکتور</div><div class="value">${st.count}</div></div>
      <div class="card"><div class="label">میانگین هر فاکتور</div><div class="value">${toman(st.avgInvoice)} ت</div></div>
      <div class="card"><div class="label">جمع خرید (فاکتورها)</div><div class="value">${toman(t.invTotal)} ت</div></div>
      <div class="card"><div class="label">جمع پرداختی (نقد/کارت/انتقال)</div><div class="value">${toman(t.cashOnlyTotal)} ت</div></div>
      <div class="card"><div class="label">جمع چک‌ها</div><div class="value">${toman(t.checkTotal)} ت</div></div>
      <div class="card"><div class="label">سود این مشتری</div><div class="value accent-olive">${toman(st.profit)} ت</div></div>
      <div class="card"><div class="label">اولین خرید</div><div class="value" style="font-size:1rem;">${st.firstInvoiceDate?faDate(st.firstInvoiceDate):'—'}</div></div>
      <div class="card"><div class="label">آخرین خرید</div><div class="value" style="font-size:1rem;">${st.lastInvoiceDate?faDate(st.lastInvoiceDate):'—'}</div></div>
      <div class="card wide"><div class="label">مانده حساب</div><div class="value" style="color:${t.balance>0?'var(--rust)':'var(--olive-dark)'}">${toman(Math.abs(t.balance))} ت ${balanceStatusWord(t.balance)}</div></div>
    </div>
    <div class="btn-row">
      <button class="btn" id="add-invoice">+ فاکتور جدید</button>
      <button class="btn secondary" id="add-tx">+ ثبت تراکنش</button>
      <button class="btn secondary" id="add-check">+ ثبت چک</button>
      <button class="btn secondary" id="add-visit">+ ثبت ویزیت</button>
      <button class="btn secondary" id="print-statement">چاپ صورتحساب</button>
      <button class="btn secondary" id="edit-customer">ویرایش مشتری</button>
      <button class="btn secondary" id="toggle-customer-active">${c.active===false?'فعال‌سازی مشتری':'غیرفعال‌سازی مشتری'}</button>
    </div>

    <h2 class="section-title">فاکتورها</h2>
    ${invs.length===0?`<div class="empty">فاکتوری ثبت نشده</div>`:invs.map(i=>`
      <div class="ledger-row" data-open-invoice="${i.id}">
        <span class="name">#${i.number||'—'} — ${faDate(i.date)}</span>
        <span class="filler"></span>
        <span class="amount">${toman(i.total)} ت</span>
      </div>
    `).join('')}

    <h2 class="section-title">تراکنش‌ها</h2>
    ${pays.length===0?`<div class="empty">تراکنشی ثبت نشده</div>`:pays.map(p=>`
      <div class="ledger-row"><span class="name">${paymentMethodLabel(p.method)}${p.note?` <span class="sub" style="display:inline;">(${esc(p.note)})</span>`:''}</span><span class="filler"></span><span class="amount">${faDate(p.date)} — ${toman(p.amount)} ت</span></div>
    `).join('')}

    <h2 class="section-title">چک‌ها</h2>
    ${checks.length===0?`<div class="empty">چکی ثبت نشده</div>`:checks.map(c2=>`
      <div class="ledger-row" data-toggle-check="${c2.id}">
        <span class="name">سررسید ${faDate(c2.dueDate)} ${c2.checkNumber?`<span class="sub">شماره: ${esc(c2.checkNumber)}</span>`:''}</span>
        <span class="filler"></span>
        <span class="amount">${toman(c2.amount)} ت <span class="badge ${c2.status==='cleared'?'cleared':'pending'}">${c2.status==='cleared'?'وصول شده':'در جریان'}</span></span>
      </div>
    `).join('')}

    <h2 class="section-title">ویزیت‌ها</h2>
    ${visits.length===0?`<div class="empty">ویزیتی ثبت نشده</div>`:visits.map(v=>`
      <div class="ledger-row"><span class="name">${faDate(v.date)} ${v.time||''}</span><span class="filler"></span>
      <span class="amount" style="font-size:.78rem;">${esc(v.result)}</span></div>
    `).join('')}
  `);

  document.getElementById('add-invoice').addEventListener('click', ()=>openAddInvoice(cid));
  document.getElementById('add-tx').addEventListener('click', ()=>openAddTransaction(cid));
  document.getElementById('add-check').addEventListener('click', ()=>openAddCheck(cid));
  document.getElementById('add-visit').addEventListener('click', ()=>openAddVisit(cid));
  document.getElementById('print-statement').addEventListener('click', ()=>printCustomerStatement(cid));
  document.getElementById('edit-customer').addEventListener('click', ()=>openAddCustomer(cid));
  document.getElementById('toggle-customer-active').addEventListener('click', async ()=>{
    c.active = (c.active===false) ? true : false;
    await saveData(); openCustomerDetail(cid); render();
    showToast(c.active===false ? 'مشتری غیرفعال شد' : 'مشتری فعال شد');
  });
  document.querySelectorAll('[data-open-invoice]').forEach(row=>{
    row.addEventListener('click', ()=>openInvoiceDetail(row.dataset.openInvoice, cid));
  });
  document.querySelectorAll('[data-toggle-check]').forEach(row=>{
    row.addEventListener('click', async ()=>{
      const chk = data.checks.find(x=>x.id===row.dataset.toggleCheck);
      chk.status = chk.status==='cleared' ? 'pending' : 'cleared';
      await saveData(); openCustomerDetail(cid); render();
    });
  });
}

function openInvoiceDetail(invId, cid){
  const inv = data.invoices.find(x=>x.id===invId);
  if(!inv) return;
  const cust = data.customers.find(x=>x.id===cid);
  const hasSnapshot = typeof inv.prevBalance === 'number';
  openSheet(`
    <h3>فاکتور #${inv.number||'—'}</h3>
    <div class="empty" style="padding:0 0 10px;text-align:right;">
      مشتری: ${esc(cust?cust.name:'—')} &nbsp;|&nbsp; تاریخ: ${faDate(inv.date)}
    </div>
    <table>
      <tr><th>ردیف</th><th>کالا</th><th>تعداد</th><th>قیمت واحد</th><th>تخفیف</th><th>جمع</th></tr>
      ${inv.items.map((it,idx)=>`
        <tr>
          <td>${idx+1}</td><td>${esc(it.name)}</td><td>${it.qty}</td>
          <td>${toman(it.price)} ت</td><td>${it.discount?toman(it.discount)+' ت':'—'}</td>
          <td>${toman(it.qty*it.price-(it.discount||0))} ت</td>
        </tr>
      `).join('')}
    </table>
    <div class="ledger-row" style="margin-top:10px;"><span class="name">جمع فاکتور</span><span class="filler"></span><span class="amount">${toman(inv.total)} ت</span></div>
    ${hasSnapshot ? `
      <div class="ledger-row"><span class="name">مانده قبلی مشتری</span><span class="filler"></span><span class="amount">${toman(inv.prevBalance)} ت</span></div>
      <div class="ledger-row"><span class="name">دریافت نقد این فاکتور</span><span class="filler"></span><span class="amount">${toman(inv.cashPaid||0)} ت</span></div>
      <div class="ledger-row"><span class="name">دریافت کارت این فاکتور</span><span class="filler"></span><span class="amount">${toman(inv.cardPaid||0)} ت</span></div>
      <div class="ledger-row"><span class="name">دریافت انتقال این فاکتور</span><span class="filler"></span><span class="amount">${toman(inv.transferPaid||0)} ت</span></div>
      <div class="ledger-row"><span class="name">دریافت چک این فاکتور</span><span class="filler"></span><span class="amount">${toman(inv.checkPaid||0)} ت</span></div>
      <div class="ledger-row"><span class="name" style="color:${inv.newBalance>0?'var(--rust)':'var(--olive-dark)'}">مانده بعد از این فاکتور</span><span class="filler"></span><span class="amount" style="color:${inv.newBalance>0?'var(--rust)':'var(--olive-dark)'}">${toman(Math.abs(inv.newBalance))} ت ${balanceStatusWord(inv.newBalance)}</span></div>
    ` : `<div class="empty" style="font-size:.75rem;">این فاکتور قبل از فعال شدن محاسبهٔ خودکار مانده ثبت شده.</div>`}
    <div class="btn-row">
      <button class="btn" id="print-inv-detail">چاپ فاکتور</button>
      <button class="btn secondary" id="image-inv-detail">خروجی تصویر (واتساپ)</button>
      <button class="btn secondary" id="edit-invoice">ویرایش فاکتور</button>
      <button class="btn danger" id="del-invoice">حذف فاکتور</button>
    </div>
    ${(inv.editHistory && inv.editHistory.length) ? `
      <h2 class="section-title">تاریخچه ویرایش</h2>
      ${inv.editHistory.slice().reverse().map(h=>`
        <div class="ledger-row" style="display:block;">
          <span class="sub" style="display:block;margin-bottom:4px;">${faDate(h.editedAt.slice(0,10))} ${h.editedAt.slice(11,16)}</span>
          <span class="name" style="font-weight:400;">جمع قبل: ${toman(h.before.total)} ت ← جمع بعد: ${toman(h.after.total)} ت</span>
        </div>
      `).join('')}
    ` : ''}
  `);
  document.getElementById('print-inv-detail').addEventListener('click', ()=>printInvoice(inv.id));
  document.getElementById('image-inv-detail').addEventListener('click', ()=>exportInvoiceImage(inv.id));
  document.getElementById('edit-invoice').addEventListener('click', ()=>openEditInvoice(inv.id, cid));
  document.getElementById('del-invoice').addEventListener('click', async ()=>{
    if(!confirm('با حذف این فاکتور، موجودی انبار و حساب مشتری اصلاح خواهد شد. ادامه می‌دهید؟')) return;
    revertInvoiceStockEffects(inv);
    revertInvoicePayments(inv);
    data.invoices = data.invoices.filter(x=>x.id!==invId);
    await saveData(); openCustomerDetail(cid); render(); showToast('فاکتور حذف شد؛ موجودی و حساب مشتری اصلاح شد');
  });
}

function openAddInvoice(cid){
  openInvoiceForm(cid, null);
}

function openEditInvoice(invId, cid){
  const inv = data.invoices.find(x=>x.id===invId);
  if(!inv) return;
  openInvoiceForm(cid, inv);
}

function openInvoiceForm(cid, editInv){
  if(data.products.length===0){
    openSheet(`<h3>اول جنس اضافه کن</h3><div class="empty">برای ${editInv?'ویرایش':'ثبت'} فاکتور، حداقل یک جنس باید تو تب «اجناس و انبار» ثبت شده باشه.</div>`);
    return;
  }
  let rows = editInv
    ? editInv.items.map(it=>({productId:it.productId, qty:it.qty, price:it.price, discount:it.discount||0, buyPrice:it.buyPrice}))
    : [{productId:data.products[0].id, qty:1, price:data.products[0].retail||data.products[0].sell||0, discount:0}];
  const existingCheck = editInv ? data.checks.find(c=>c.invoiceId===editInv.id) : null;
  let cashPaid = editInv ? (editInv.cashPaid||0) : 0;
  let cardPaid = editInv ? (editInv.cardPaid||0) : 0;
  let transferPaid = editInv ? (editInv.transferPaid||0) : 0;
  let checkAmount = editInv ? (editInv.checkPaid||0) : 0;
  let checkDue = existingCheck ? existingCheck.dueDate : todayISO();
  let discount = editInv ? (editInv.discount||0) : 0;
  let discountType = (editInv && editInv.discountType==='percent') ? 'percent' : 'fixed';

  // "مانده قبلی": مانده مشتری بدون احتساب این فاکتور اصلاً — برای فاکتور جدید یعنی مانده فعلی،
  // برای ویرایش یعنی مانده فعلی منهای سهم همین فاکتور (چه از بابت جمع فاکتور و چه از بابت پرداختی‌های همراهش)
  const prevBalance = editInv
    ? (customerTotals(cid).balance - editInv.total + (editInv.cashPaid||0) + (editInv.cardPaid||0) + (editInv.transferPaid||0) + (editInv.checkPaid||0))
    : customerTotals(cid).balance;

  function lastSaleToCustomer(productId){
    const past = data.invoices
      .filter(inv=>inv.customerId===cid && (!editInv || inv.id!==editInv.id))
      .flatMap(inv=>inv.items.filter(it=>it.productId===productId).map(it=>({...it, date:inv.date})))
      .sort((a,b)=>new Date(b.date)-new Date(a.date));
    return past[0] || null;
  }

  function itemsHtml(){
    return rows.map((r,idx)=>{
      const prod = data.products.find(p=>p.id===r.productId);
      const lastSale = lastSaleToCustomer(r.productId);
      const hintParts = [];
      if(prod){
        hintParts.push(`خرید شما: ${toman(prod.buy)} ت / عمده: ${toman(prod.wholesale)} ت / مصرف‌کننده: ${toman(prod.retail)} ت`);
        hintParts.push(`موجودی انبار: ${prod.stockQty||0}`);
      }
      if(lastSale) hintParts.push(`آخرین فروش به این مشتری: ${toman(lastSale.price)} ت (${faDate(lastSale.date)}) — ${lastSale.qty} عدد`);
      return `
      <div class="field" style="display:flex;gap:6px;align-items:end;">
        <div style="flex:2;">
          <label>جنس</label>
          <select data-row="${idx}" class="row-product">
            ${data.products.map(p=>`<option value="${p.id}" ${p.id===r.productId?'selected':''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>
        <div style="flex:1;">
          <label>تعداد</label>
          <input type="text" inputmode="decimal" data-row="${idx}" class="row-qty" value="${r.qty}">
        </div>
        <div style="flex:1;">
          <label>قیمت واحد</label>
          <input type="text" inputmode="decimal" data-row="${idx}" class="row-price" value="${r.price}">
        </div>
        <div style="flex:1;">
          <label>تخفیف</label>
          <input type="text" inputmode="decimal" data-row="${idx}" class="row-discount" value="${r.discount||''}">
        </div>
        ${rows.length>1?`<div style="flex:0 0 auto;">
          <label>&nbsp;</label>
          <button type="button" class="btn danger small row-del" data-row="${idx}" title="حذف این قلم" style="padding:10px 12px;">×</button>
        </div>`:''}
      </div>
      ${hintParts.length?`<div class="sub" style="margin:-6px 0 10px;">${hintParts.join(' — ')}</div>`:''}
    `;
    }).join('');
  }

  function invoiceTotal(){
    const subtotal = rows.reduce((s,r)=>s+(r.qty*r.price-(r.discount||0)),0);
    const discountAmount = discountType==='percent' ? subtotal*(discount||0)/100 : discount;
    return Math.max(0, subtotal - discountAmount);
  }

  function updateSummary(){
    const total = invoiceTotal();
    const subtotal = rows.reduce((s,r)=>s+(r.qty*r.price-(r.discount||0)),0);
    const discountAmount = discountType==='percent' ? subtotal*(discount||0)/100 : discount;
    const paid = cashPaid+cardPaid+transferPaid+checkAmount;
    const newBalance = prevBalance + total - paid;
    document.getElementById('calc-summary').innerHTML = `
      <div class="ledger-row"><span class="name">مانده قبلی مشتری</span><span class="filler"></span><span class="amount">${toman(prevBalance)} ت</span></div>
      <div class="ledger-row"><span class="name">جمع اقلام (با تخفیف هر ردیف)</span><span class="filler"></span><span class="amount">${toman(subtotal)} ت</span></div>
      <div class="ledger-row"><span class="name">تخفیف کلی فاکتور${discountType==='percent'?` (${toman(discount)}٪)`:''}</span><span class="filler"></span><span class="amount">${toman(discountAmount)} ت</span></div>
      <div class="ledger-row"><span class="name">جمع این فاکتور</span><span class="filler"></span><span class="amount">${toman(total)} ت</span></div>
      <div class="ledger-row"><span class="name">جمع دریافتی</span><span class="filler"></span><span class="amount">${toman(paid)} ت</span></div>
      <div class="ledger-row"><span class="name" style="color:${newBalance>0?'var(--rust)':'var(--olive-dark)'}">مانده جدید</span><span class="filler"></span><span class="amount" style="color:${newBalance>0?'var(--rust)':'var(--olive-dark)'}">${toman(Math.abs(newBalance))} ت ${balanceStatusWord(newBalance)}</span></div>
    `;
  }

  function renderSheet(){
    openSheet(`
      <h3>${editInv?('ویرایش فاکتور #'+(editInv.number||'—')):'فاکتور جدید'}</h3>
      ${editInv?`<div class="empty" style="padding:0 0 8px;text-align:right;">با ذخیره‌ی این ویرایش، موجودی انبار و مانده حساب مشتری به‌طور خودکار اصلاح می‌شود.</div>`:''}
      <div class="field"><label>تاریخ</label><input id="f-date" type="date" value="${editInv?editInv.date:todayISO()}"></div>
      <div id="items-wrap">${itemsHtml()}</div>
      <button class="btn secondary small" id="add-row">+ افزودن قلم</button>

      <h2 class="section-title">دریافتی همراه این فاکتور (اختیاری)</h2>
      <div class="field" style="display:flex;gap:8px;">
        <div style="flex:1;"><label>نقد</label><input id="f-cash" type="text" inputmode="decimal" value="${cashPaid||''}"></div>
        <div style="flex:1;"><label>کارت</label><input id="f-card" type="text" inputmode="decimal" value="${cardPaid||''}"></div>
        <div style="flex:1;"><label>انتقال بانکی</label><input id="f-transfer" type="text" inputmode="decimal" value="${transferPaid||''}"></div>
      </div>
      <div class="field"><label>دریافت چک</label><input id="f-check" type="text" inputmode="decimal" value="${checkAmount||''}"></div>
      <div class="field" id="check-due-wrap" style="display:${checkAmount>0?'block':'none'};">
        <label>تاریخ سررسید چک</label><input id="f-check-due" type="date" value="${checkDue}">
      </div>

      <div class="field" style="display:flex;gap:6px;align-items:end;">
        <div style="flex:1;">
          <label>تخفیف کلی فاکتور (${discountType==='percent'?'درصد':'تومان'}، اختیاری)</label>
          <input id="f-discount" type="text" inputmode="decimal" value="${discount||''}">
        </div>
        <div style="flex:1;">
          <label>نوع تخفیف</label>
          <select id="f-discount-type">
            <option value="fixed" ${discountType==='fixed'?'selected':''}>مبلغ</option>
            <option value="percent" ${discountType==='percent'?'selected':''}>درصد</option>
          </select>
        </div>
      </div>

      <h2 class="section-title">محاسبه خودکار</h2>
      <div id="calc-summary"></div>

      <div class="btn-row"><button class="btn" id="save-invoice">${editInv?'ذخیره ویرایش':'ثبت فاکتور'}</button></div>
    `);
    updateSummary();

    document.getElementById('add-row').addEventListener('click', ()=>{
      const dp = data.products[0];
      rows.push({productId:dp.id, qty:1, price:dp.retail||dp.sell||0, discount:0});
      renderSheet();
    });
    document.querySelectorAll('.row-del').forEach(el=>el.addEventListener('click', e=>{
      const i = parseInt(e.currentTarget.dataset.row, 10);
      if(rows.length>1 && i>=0 && i<rows.length){
        rows.splice(i, 1);
        renderSheet();
      }
    }));
    document.querySelectorAll('.row-product').forEach(el=>el.addEventListener('change', e=>{
      const i = e.target.dataset.row;
      rows[i].productId = e.target.value;
      delete rows[i].buyPrice;
      const prod = data.products.find(p=>p.id===e.target.value);
      rows[i].price = prod.retail||prod.sell||0;
      renderSheet();
    }));
    document.querySelectorAll('.row-qty').forEach(el=>el.addEventListener('input', e=>{
      rows[e.target.dataset.row].qty = parseFloat(faToEnDigits(e.target.value))||0;
      updateSummary();
    }));
    document.querySelectorAll('.row-price').forEach(el=>el.addEventListener('input', e=>{
      rows[e.target.dataset.row].price = parseFloat(faToEnDigits(e.target.value))||0;
      updateSummary();
    }));
    document.querySelectorAll('.row-discount').forEach(el=>el.addEventListener('input', e=>{
      rows[e.target.dataset.row].discount = parseFloat(faToEnDigits(e.target.value))||0;
      updateSummary();
    }));
    document.getElementById('f-cash').addEventListener('input', e=>{ cashPaid = parseFloat(faToEnDigits(e.target.value))||0; updateSummary(); });
    document.getElementById('f-card').addEventListener('input', e=>{ cardPaid = parseFloat(faToEnDigits(e.target.value))||0; updateSummary(); });
    document.getElementById('f-transfer').addEventListener('input', e=>{ transferPaid = parseFloat(faToEnDigits(e.target.value))||0; updateSummary(); });
    document.getElementById('f-check').addEventListener('input', e=>{
      checkAmount = parseFloat(faToEnDigits(e.target.value))||0;
      document.getElementById('check-due-wrap').style.display = checkAmount>0 ? 'block':'none';
      updateSummary();
    });
    document.getElementById('f-check-due').addEventListener('change', e=>{ checkDue = e.target.value; });
    document.getElementById('f-discount').addEventListener('input', e=>{
      discount = parseFloat(faToEnDigits(e.target.value))||0;
      updateSummary();
    });
    document.getElementById('f-discount-type').addEventListener('change', e=>{
      discountType = e.target.value;
      renderSheet();
    });

    document.getElementById('save-invoice').addEventListener('click', async (e)=>{
      const btn = e.currentTarget;
      if(btn.disabled) return; // جلوگیری از ثبت دوباره با کلیک سریع/پی‌درپی
      btn.disabled = true;
      const date = document.getElementById('f-date').value || todayISO();

      // اعتبارسنجی مقادیر ردیف‌های فاکتور قبل از ذخیره: تعداد باید بزرگ‌تر از صفر، قیمت/تخفیف نباید منفی باشند
      const invalidRow = rows.find(r=> !(r.qty>0) || r.price<0 || (r.discount||0)<0);
      if(invalidRow){
        alert('مقادیر فاکتور نامعتبر است.\n\nتعداد هر ردیف باید بزرگ‌تر از صفر باشد و قیمت/تخفیف نباید منفی باشند.');
        btn.disabled = false;
        return;
      }
      if(discount<0){
        alert('تخفیف کلی فاکتور نمی‌تواند منفی باشد.');
        btn.disabled = false;
        return;
      }

      const items = rows.map(r=>{
        const prod = data.products.find(p=>p.id===r.productId);
        return { productId:r.productId, name:prod.name, qty:r.qty, price:r.price, buyPrice:(r.buyPrice!==undefined?r.buyPrice:prod.buy), discount:r.discount||0, weight:(prod.packageWeight||0)*r.qty };
      });

      // BLOCK فروش بیش از stock یا بیش از لایه‌های FIFO — قبل از هر mutation
      const creditStock = {};
      const creditFifo = {};
      if(editInv){
        const pids = {};
        (editInv.items||[]).forEach(it=>{ if(it.productId) pids[it.productId]=true; });
        Object.keys(pids).forEach(pid=>{
          creditStock[pid] = (editInv.items||[]).filter(it=>it.productId===pid).reduce((s,it)=>s+(it.qty||0),0);
          creditFifo[pid] = invoiceReleasedFifoQty(editInv, pid);
        });
      }
      const stockCheck = validateSaleAvailability(items, creditStock, creditFifo);
      if(!stockCheck.ok){
        alert(stockCheck.error || 'موجودی کافی نیست یا موجودی FIFO با موجودی کالا ناسازگار است.');
        btn.disabled = false;
        return;
      }

      const total = invoiceTotal();
      const paid = cashPaid+cardPaid+transferPaid+checkAmount;
      const newBalance = prevBalance + total - paid;

      if(editInv){
        if(!confirm('با ویرایش این فاکتور، موجودی انبار و حساب مشتری اصلاح خواهد شد. ادامه می‌دهید؟')){ btn.disabled = false; return; }

        // snapshot قبل از تغییر، برای تاریخچه
        const before = {
          date:editInv.date, items:editInv.items, total:editInv.total, discount:editInv.discount, discountType:editInv.discountType,
          cashPaid:editInv.cashPaid||0, cardPaid:editInv.cardPaid||0, transferPaid:editInv.transferPaid||0, checkPaid:editInv.checkPaid||0,
        };
        const checkMeta = existingCheck ? {checkNumber:existingCheck.checkNumber, status:existingCheck.status} : null;

        // ۱) برگردوندن اثر فاکتور قبلی: موجودی کالاها + حذف پرداخت/چک مرتبط با همین فاکتور
        const oldItemsSnap = editInv.items;
        const oldDateSnap = editInv.date;
        revertInvoiceStockEffects(editInv);
        revertInvoicePayments(editInv);

        // ۲) به‌روزرسانی خود فاکتور با مقادیر جدید (همون id و شماره فاکتور حفظ می‌مونه)
        editInv.date = date; editInv.items = items; editInv.total = total; editInv.discount = discount; editInv.discountType = discountType;
        editInv.prevBalance = prevBalance; editInv.cashPaid = cashPaid; editInv.cardPaid = cardPaid;
        editInv.transferPaid = transferPaid; editInv.checkPaid = checkAmount; editInv.newBalance = newBalance;

        // ۳) اعمال دوباره‌ی موجودی/پرداخت‌ها — اگر BLOCK شد، فاکتور قبلی را برگردان
        try{
          applyInvoiceStockEffects(items, date, editInv, false);
        }catch(e){
          editInv.date = oldDateSnap; editInv.items = oldItemsSnap;
          editInv.total = before.total; editInv.discount = before.discount; editInv.discountType = before.discountType;
          editInv.cashPaid = before.cashPaid; editInv.cardPaid = before.cardPaid;
          editInv.transferPaid = before.transferPaid; editInv.checkPaid = before.checkPaid;
          applyInvoiceStockEffects(oldItemsSnap, oldDateSnap, editInv, false);
          pushInvoicePayments(cid, editInv, before.cashPaid, before.cardPaid, before.transferPaid, before.checkPaid, checkDue, checkMeta);
          alert((e && e.message) || 'موجودی کافی نیست یا موجودی FIFO با موجودی کالا ناسازگار است.');
          btn.disabled = false;
          return;
        }
        pushInvoicePayments(cid, editInv, cashPaid, cardPaid, transferPaid, checkAmount, checkDue, checkMeta);

        // ۴) ثبت این ویرایش در تاریخچه‌ی خود فاکتور
        editInv.editHistory = editInv.editHistory||[];
        editInv.editHistory.push({
          id:uid(), editedAt:new Date().toISOString(),
          before, after:{date, items, total, discount, discountType, cashPaid, cardPaid, transferPaid, checkPaid:checkAmount},
        });

        await saveData(); closeModal(); openInvoiceDetail(editInv.id, cid); render();
        showToast('فاکتور ویرایش شد؛ موجودی و حساب مشتری اصلاح شد');
        return;
      }

      const newInv = {
        id:uid(), number:null, customerId:cid, date, items, total, discount, discountType,
        prevBalance, cashPaid, cardPaid, transferPaid, checkPaid:checkAmount, newBalance,
      };
      try{
        applyInvoiceStockEffects(items, date, newInv, true);
      }catch(e){
        alert((e && e.message) || 'موجودی کافی نیست یا موجودی FIFO با موجودی کالا ناسازگار است.');
        btn.disabled = false;
        return;
      }
      newInv.number = nextInvoiceNumber();
      data.invoices.push(newInv);
      pushInvoicePayments(cid, newInv, cashPaid, cardPaid, transferPaid, checkAmount, checkDue, null);
      await saveData(); render(); showToast('فاکتور ثبت شد');
      openSheet(`
        <h3>فاکتور ثبت و توی حساب مشتری ذخیره شد</h3>
        <div class="empty">حالا می‌خوای همین فاکتور رو چاپ کنی، تصویرش رو بگیری یا فقط ذخیره بمونه؟</div>
        <div class="btn-row">
          <button class="btn" id="print-now">چاپ فاکتور</button>
          <button class="btn secondary" id="image-now">خروجی تصویر (واتساپ)</button>
          <button class="btn secondary" id="skip-print">فقط ذخیره بمونه</button>
        </div>
      `);
      document.getElementById('print-now').addEventListener('click', ()=>{
        closeModal();
        setTimeout(()=>printInvoice(newInv.id), 50);
      });
      document.getElementById('image-now').addEventListener('click', async ()=>{
        await exportInvoiceImage(newInv.id);
        closeModal(); openCustomerDetail(cid);
      });
      document.getElementById('skip-print').addEventListener('click', ()=>{
        closeModal(); openCustomerDetail(cid);
      });
    });
  }
  renderSheet();
}

// ---------- suppliers ----------
function openAddSupplier(){
  openSheet(`
    <h3>تامین‌کننده جدید</h3>
    <div class="field"><label>نام تامین‌کننده</label><input id="f-name"></div>
    <div class="field"><label>شماره تماس (اختیاری)</label><input id="f-phone"></div>
    <div class="field">
      <label>مانده بدهی اولیه به این تامین‌کننده (تومان)</label>
      <input id="f-opening" type="text" inputmode="decimal">
      <div class="empty" style="padding:4px 0 0;text-align:right;font-size:.75rem;">بدهی که از قبل از استفاده از این برنامه داری رو اینجا بزن.</div>
    </div>
    <div class="btn-row"><button class="btn" id="save-supplier">ذخیره</button></div>
  `);
  document.getElementById('save-supplier').addEventListener('click', async ()=>{
    const name = document.getElementById('f-name').value.trim();
    if(!name){ showToast('نام تامین‌کننده رو وارد کن'); return; }
    const phone = document.getElementById('f-phone').value.trim();
    const openingBalance = numVal(document.getElementById('f-opening'));
    data.suppliers.push({id:uid(), name, phone, openingBalance, purchases:[], payments:[]});
    await saveData(); closeModal(); render(); showToast('تامین‌کننده اضافه شد');
  });
}

function openSupplierDetail(sid){
  const s = data.suppliers.find(x=>x.id===sid);
  if(!s) return;
  const t = supplierTotals(sid);
  const purchases = (s.purchases||[]).slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
  const payments = (s.payments||[]).slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
  openSheet(`
    <h3>${esc(s.name)}</h3>
    ${s.phone?`<div class="empty" style="padding:0 0 8px;text-align:right;">تلفن: ${esc(s.phone)}</div>`:''}
    ${s.openingBalance?`<div class="empty" style="padding:0 0 8px;text-align:right;">مانده بدهی اولیه (قبل از این برنامه): ${toman(Math.abs(s.openingBalance))} ت</div>`:''}
    <div class="cards">
      <div class="card"><div class="label">جمع خرید</div><div class="value">${toman(t.purchaseTotal)} ت</div></div>
      <div class="card"><div class="label">مانده بدهی شما</div><div class="value" style="color:${t.balance>0?'var(--red)':'var(--olive-dark)'}">${toman(Math.abs(t.balance))} ت</div></div>
      ${t.returnTotal>0?`<div class="card"><div class="label">جمع برگشتی</div><div class="value">${toman(t.returnTotal)} ت</div></div>`:''}
    </div>
    <div class="btn-row">
      <button class="btn" id="add-purchase">+ خرید جدید</button>
      <button class="btn secondary" id="add-suppay">+ پرداخت</button>
      <button class="btn secondary" id="edit-supplier">ویرایش</button>
      <button class="btn danger" id="del-supplier">حذف تامین‌کننده</button>
    </div>
    <h2 class="section-title">خریدها</h2>
    ${purchases.length===0?`<div class="empty">خریدی ثبت نشده</div>`:purchases.map(p=>{
      const returnedQty = (p.returns||[]).reduce((a,r)=>a+(r.qty||0),0);
      const returnedAmount = (p.returns||[]).reduce((a,r)=>a+(r.amount||0),0);
      const remainingAmount = p.amount - returnedAmount;
      const lines = purchaseLines(p);
      const linesLabel = lines.length ? lines.map(l=>`${esc(l.name)} × ${l.qty}`).join('، ') : '';
      return `
      <div class="ledger-row"><span class="name">${faDate(p.date)} ${p.desc?`<span class="sub">${esc(p.desc)}</span>`:''}${linesLabel?`<span class="sub">${linesLabel}</span>`:''}${returnedAmount>0?`<span class="sub">برگشت‌شده: ${toman(returnedAmount)} ت${p.productId?` (${returnedQty} از ${p.qty})`:''}</span>`:''}</span><span class="filler"></span><span class="amount">${toman(p.amount)} ت${remainingAmount>0?`<br><button class="btn secondary small" data-return-purchase="${p.id}">برگشت</button>`:''}</span></div>
    `;}).join('')}
    <h2 class="section-title">پرداختی‌ها</h2>
    ${payments.length===0?`<div class="empty">پرداختی ثبت نشده</div>`:payments.map((p,pidx)=>{
      const isCheck = p.method==='check';
      const face = isCheck ? (typeof p.faceAmount==='number' ? p.faceAmount : p.amount) : p.amount;
      const st = isCheck ? (p.status||'pending') : '';
      const stLabel = st==='cleared'?'پرداخت‌شده':(st==='bounced'?'برگشتی':'در جریان');
      const stBadge = st==='cleared'?'cleared':(st==='bounced'?'pending':'pending');
      const nameBits = isCheck
        ? `چک${p.checkNumber?` #${esc(p.checkNumber)}`:''}${p.bank?` — ${esc(p.bank)}`:''}${p.dueDate?` <span class="sub">سررسید ${faDate(p.dueDate)}</span>`:''}${p.note?` <span class="sub">(${esc(p.note)})</span>`:''}`
        : `${faDate(p.date)}${p.note?` <span class="sub">(${esc(p.note)})</span>`:''}`;
      return `<div class="ledger-row">
        <span class="name">${isCheck?faDate(p.issueDate||p.date)+' — ':''}${nameBits}</span>
        <span class="filler"></span>
        <span class="amount">${toman(isCheck?face:p.amount)} ت${isCheck?` <span class="badge ${stBadge}">${stLabel}</span>`:''}
          ${isCheck?`<br>
            <button class="btn secondary small" data-sup-check-status="${pidx}">وضعیت</button>
            <button class="btn secondary small" data-sup-check-edit="${pidx}">ویرایش</button>
            <button class="btn danger small" data-sup-pay-del="${pidx}">حذف</button>
          `:`<br><button class="btn danger small" data-sup-pay-del="${pidx}">حذف</button>`}
        </span>
      </div>`;
    }).join('')}
  `);
  document.getElementById('add-purchase').addEventListener('click', ()=>{
    let multiItems = [];
    openSheet(`
      <h3>خرید جدید از ${esc(s.name)}</h3>
      <div class="field"><label>تاریخ</label><input id="f-date" type="date" value="${todayISO()}"></div>
      <div id="single-item-fields">
        <div class="field"><label>مبلغ کل خرید (تومان)</label><input id="f-amount" type="text" inputmode="decimal"></div>
        <div class="field">
          <label>کالای مرتبط (اختیاری — برای افزایش خودکار موجودی)</label>
          <select id="f-product">
            <option value="">— بدون کالای مشخص —</option>
            ${data.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>تعداد کالا (در صورت انتخاب کالا)</label><input id="f-qty" type="text" inputmode="decimal"></div>
      </div>
      <div class="btn-row"><button class="btn secondary small" id="toggle-multi-item" type="button">+ چند قلم کالا در یک خرید</button></div>
      <div id="multi-item-fields" style="display:none;">
        <div id="multi-item-rows"></div>
        <div class="field" style="display:flex;gap:6px;">
          <select id="mi-product" style="flex:2;">
            <option value="">انتخاب کالا</option>
            ${data.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}
          </select>
          <input id="mi-qty" type="text" inputmode="decimal" placeholder="تعداد" style="flex:1;">
          <input id="mi-price" type="text" inputmode="decimal" placeholder="قیمت واحد" style="flex:1;">
        </div>
        <div class="btn-row"><button class="btn secondary small" id="add-item-row" type="button">+ افزودن قلم</button></div>
        <div class="empty" style="padding:4px 0;text-align:right;">جمع کل اقلام (خودکار): <b id="multi-item-total">۰</b> تومان</div>
      </div>
      <div class="field"><label>توضیح (اختیاری)</label><input id="f-desc"></div>
      <div class="btn-row"><button class="btn" id="save-purchase">ثبت</button></div>
    `);
    function renderMultiRows(){
      document.getElementById('multi-item-rows').innerHTML = multiItems.map((it,idx)=>`
        <div class="ledger-row"><span class="name">${esc((data.products.find(x=>x.id===it.productId)||{}).name||'?')} × ${it.qty} @ ${toman(it.unitCost)} ت</span><span class="filler"></span><span class="amount">${toman(it.qty*it.unitCost)} ت<br><button class="btn danger small" data-del-item="${idx}" type="button">حذف</button></span></div>
      `).join('');
      document.getElementById('multi-item-total').textContent = toman(multiItems.reduce((s2,it)=>s2+it.qty*it.unitCost,0));
      document.querySelectorAll('[data-del-item]').forEach(btn=>{
        btn.addEventListener('click', ()=>{ multiItems.splice(+btn.dataset.delItem,1); renderMultiRows(); });
      });
    }
    document.getElementById('toggle-multi-item').addEventListener('click', ()=>{
      const single = document.getElementById('single-item-fields');
      const multi = document.getElementById('multi-item-fields');
      const goingMulti = multi.style.display==='none';
      multi.style.display = goingMulti?'':'none';
      single.style.display = goingMulti?'none':'';
      document.getElementById('toggle-multi-item').textContent = goingMulti?'– برگشت به حالت مبلغ کل / یک کالا':'+ چند قلم کالا در یک خرید';
    });
    document.getElementById('add-item-row').addEventListener('click', ()=>{
      const productId = document.getElementById('mi-product').value;
      const qty = numVal(document.getElementById('mi-qty'));
      const unitCost = numVal(document.getElementById('mi-price'));
      if(!productId){ showToast('کالا رو انتخاب کن'); return; }
      const prodCheck = data.products.find(x=>x.id===productId);
      if(!prodCheck){ showToast('کالای انتخاب‌شده معتبر نیست'); return; }
      if(qty<=0){ showToast('تعداد رو وارد کن'); return; }
      if(unitCost<=0){ showToast('قیمت واحد باید بیشتر از صفر باشد'); return; }
      let itemId = uid();
      while(multiItems.some(it=>it.id===itemId)) itemId = uid();
      multiItems.push({id:itemId, productId, qty, unitCost});
      document.getElementById('mi-product').value='';
      document.getElementById('mi-qty').value='';
      document.getElementById('mi-price').value='';
      renderMultiRows();
    });
    document.getElementById('save-purchase').addEventListener('click', async ()=>{
      const date = document.getElementById('f-date').value || todayISO();
      const desc = document.getElementById('f-desc').value.trim();
      const isMulti = document.getElementById('multi-item-fields').style.display!=='none';
      s.purchases = s.purchases||[];
      if(isMulti){
        if(multiItems.length===0){ showToast('حداقل یک قلم کالا اضافه کن'); return; }
        for(const it of multiItems){
          if(!it.productId || !data.products.find(x=>x.id===it.productId)){ showToast('یکی از کالاها معتبر نیست'); return; }
          if(!(it.qty>0)){ showToast('تعداد همه اقلام باید بیشتر از صفر باشد'); return; }
          if(!(it.unitCost>0)){ showToast('قیمت واحد همه اقلام باید بیشتر از صفر باشد'); return; }
        }
        const amount = multiItems.reduce((s2,it)=>s2+it.qty*it.unitCost,0);
        const usedIds = new Set();
        const items = multiItems.map(it=>{
          let id = it.id || uid();
          while(usedIds.has(id)) id = uid();
          usedIds.add(id);
          return {
            id, productId: it.productId, name:(data.products.find(x=>x.id===it.productId)||{}).name||'',
            qty: it.qty, unitCost: it.unitCost, lineAmount: it.qty*it.unitCost,
          };
        });
        const purchase = {id:uid(), date, amount, desc, productId:'', qty:0, items};
        s.purchases.push(purchase);
        applyPurchaseStockEffects(purchase, s.name);
      } else {
        const amount = numVal(document.getElementById('f-amount'));
        const productId = document.getElementById('f-product').value;
        const qty = numVal(document.getElementById('f-qty'));
        if(amount<=0){ showToast('مبلغ رو وارد کن'); return; }
        if(productId){
          const prod = data.products.find(x=>x.id===productId);
          if(!prod){ showToast('کالای انتخاب‌شده معتبر نیست'); return; }
          if(!(qty>0)){ showToast('تعداد کالا باید بیشتر از صفر باشد'); return; }
          // قیمت واحد ضمنی = مبلغ/تعداد؛ با amount>0 و qty>0 خودبه‌خود >0 است
        }
        const purchase = {id:uid(), date, amount, desc, productId, qty};
        s.purchases.push(purchase);
        applyPurchaseStockEffects(purchase, s.name);
      }
      await saveData(); openSupplierDetail(sid); render(); showToast('خرید ثبت شد');
    });
  });
  document.getElementById('add-suppay').addEventListener('click', ()=>{
    openSheet(`
      <h3>پرداخت به ${esc(s.name)}</h3>
      <div class="field">
        <label>روش پرداخت</label>
        <select id="f-method">
          <option value="cash">نقد / کارت / انتقال</option>
          <option value="check">چک</option>
        </select>
      </div>
      <div class="field"><label>مبلغ (تومان)</label><input id="f-amount" type="text" inputmode="decimal"></div>
      <div class="field"><label>تاریخ پرداخت / صدور</label><input id="f-date" type="date" value="${todayISO()}"></div>
      <div id="check-fields" style="display:none;">
        <div class="field"><label>تاریخ سررسید</label><input id="f-due" type="date" value="${todayISO()}"></div>
        <div class="field"><label>شماره چک</label><input id="f-check-num"></div>
        <div class="field"><label>بانک</label><input id="f-bank"></div>
      </div>
      <div class="field"><label>توضیح (اختیاری)</label><input id="f-note"></div>
      <div class="btn-row"><button class="btn" id="save-suppay">ثبت</button></div>
    `);
    const methodEl = document.getElementById('f-method');
    const checkFields = document.getElementById('check-fields');
    methodEl.addEventListener('change', ()=>{
      checkFields.style.display = methodEl.value==='check' ? '' : 'none';
    });
    document.getElementById('save-suppay').addEventListener('click', async ()=>{
      const amount = numVal(document.getElementById('f-amount'));
      const date = document.getElementById('f-date').value || todayISO();
      const method = methodEl.value;
      const note = (document.getElementById('f-note').value||'').trim();
      if(amount<=0){ showToast('مبلغ رو وارد کن'); return; }
      s.payments = s.payments||[];
      if(method==='check'){
        const dueDate = document.getElementById('f-due').value || date;
        const checkNumber = (document.getElementById('f-check-num').value||'').trim();
        const bank = (document.getElementById('f-bank').value||'').trim();
        // amount در مانده لحاظ می‌شود؛ faceAmount مبلغ اسمی چک است (برای برگشتی)
        s.payments.push({
          id: uid(),
          date,
          amount,
          faceAmount: amount,
          method: 'check',
          checkNumber,
          bank,
          issueDate: date,
          dueDate,
          status: 'pending',
          note,
        });
      } else {
        s.payments.push({id: uid(), date, amount, method: 'cash', note});
      }
      await saveData(); openSupplierDetail(sid); render(); showToast('پرداخت ثبت شد');
    });
  });

  // حذف پرداخت نقدی یا چک — با حذف، مبلغ از جمع پرداخت‌ها خارج و مانده اصلاح می‌شود
  // توجه: pidx مربوط به آرایهٔ مرتب‌شدهٔ payments است؛ ایندکس واقعی با indexOf گرفته می‌شود
  document.querySelectorAll('[data-sup-pay-del]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const pidx = parseInt(btn.dataset.supPayDel, 10);
      const p = payments[pidx];
      if(!p) return;
      const realIdx = (s.payments||[]).indexOf(p);
      if(realIdx<0) return;
      const label = p.method==='check' ? ('چک'+(p.checkNumber?(' #'+p.checkNumber):'')) : 'پرداخت';
      if(!confirm('«'+label+'» به مبلغ '+toman(p.method==='check'?(p.faceAmount||p.amount):p.amount)+' تومان حذف شود؟\nمانده حساب تامین‌کننده اصلاح می‌شود.')) return;
      s.payments.splice(realIdx, 1);
      await saveData(); openSupplierDetail(sid); render(); showToast('حذف شد');
    });
  });

  // چرخش وضعیت چک: در جریان → پرداخت‌شده → برگشتی → در جریان
  // برگشتی: amount=0 تا از مانده کم نشود؛ faceAmount حفظ می‌شود
  document.querySelectorAll('[data-sup-check-status]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const pidx = parseInt(btn.dataset.supCheckStatus, 10);
      const p = payments[pidx];
      if(!p || p.method!=='check') return;
      const order = ['pending','cleared','bounced'];
      const cur = p.status||'pending';
      const next = order[(order.indexOf(cur)+1) % order.length];
      const face = typeof p.faceAmount==='number' ? p.faceAmount : p.amount;
      p.faceAmount = face;
      p.status = next;
      p.amount = (next==='bounced') ? 0 : face;
      await saveData(); openSupplierDetail(sid); render();
      showToast(next==='cleared'?'چک پرداخت‌شده شد':(next==='bounced'?'چک برگشتی شد — از مانده حذف شد':'چک در جریان شد'));
    });
  });

  document.querySelectorAll('[data-sup-check-edit]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const pidx = parseInt(btn.dataset.supCheckEdit, 10);
      const p = payments[pidx];
      if(!p || p.method!=='check') return;
      const face = typeof p.faceAmount==='number' ? p.faceAmount : p.amount;
      openSheet(`
        <h3>ویرایش چک پرداختی</h3>
        <div class="field"><label>مبلغ (تومان)</label><input id="f-amount" type="text" inputmode="decimal" value="${face||''}"></div>
        <div class="field"><label>تاریخ صدور</label><input id="f-date" type="date" value="${p.issueDate||p.date||todayISO()}"></div>
        <div class="field"><label>تاریخ سررسید</label><input id="f-due" type="date" value="${p.dueDate||todayISO()}"></div>
        <div class="field"><label>شماره چک</label><input id="f-check-num" value="${esc(p.checkNumber||'')}"></div>
        <div class="field"><label>بانک</label><input id="f-bank" value="${esc(p.bank||'')}"></div>
        <div class="field"><label>توضیح</label><input id="f-note" value="${esc(p.note||'')}"></div>
        <div class="field">
          <label>وضعیت</label>
          <select id="f-status">
            <option value="pending" ${(p.status||'pending')==='pending'?'selected':''}>در جریان</option>
            <option value="cleared" ${p.status==='cleared'?'selected':''}>پرداخت‌شده</option>
            <option value="bounced" ${p.status==='bounced'?'selected':''}>برگشتی</option>
          </select>
        </div>
        <div class="btn-row"><button class="btn" id="save-sup-check-edit">ذخیره</button></div>
      `);
      document.getElementById('save-sup-check-edit').addEventListener('click', async ()=>{
        const amount = numVal(document.getElementById('f-amount'));
        if(amount<=0){ showToast('مبلغ رو وارد کن'); return; }
        const status = document.getElementById('f-status').value || 'pending';
        p.faceAmount = amount;
        p.amount = (status==='bounced') ? 0 : amount;
        p.status = status;
        p.issueDate = document.getElementById('f-date').value || todayISO();
        p.date = p.issueDate;
        p.dueDate = document.getElementById('f-due').value || p.issueDate;
        p.checkNumber = (document.getElementById('f-check-num').value||'').trim();
        p.bank = (document.getElementById('f-bank').value||'').trim();
        p.note = (document.getElementById('f-note').value||'').trim();
        await saveData(); openSupplierDetail(sid); render(); showToast('چک ویرایش شد');
      });
    });
  });

  document.getElementById('edit-supplier').addEventListener('click', ()=>{
    openSheet(`
      <h3>ویرایش تامین‌کننده</h3>
      <div class="field"><label>نام</label><input id="f-name" value="${esc(s.name)}"></div>
      <div class="field"><label>شماره تماس</label><input id="f-phone" value="${esc(s.phone||'')}"></div>
      <div class="field">
        <label>مانده بدهی اولیه (تومان) — برای اصلاح مانده</label>
        <input id="f-opening" type="text" inputmode="decimal" value="${s.openingBalance?s.openingBalance:''}">
      </div>
      <div class="btn-row"><button class="btn" id="save-sup-edit">ذخیره</button></div>
    `);
    document.getElementById('save-sup-edit').addEventListener('click', async ()=>{
      const name = document.getElementById('f-name').value.trim();
      if(!name){ showToast('نام رو وارد کن'); return; }
      s.name = name; s.phone = document.getElementById('f-phone').value.trim();
      s.openingBalance = numVal(document.getElementById('f-opening'));
      await saveData(); openSupplierDetail(sid); render(); showToast('ذخیره شد');
    });
  });
  document.getElementById('del-supplier').addEventListener('click', async ()=>{
    if(!confirm(`تامین‌کننده «${s.name}» حذف بشه؟`)) return;
    data.suppliers = data.suppliers.filter(x=>x.id!==sid);
    await saveData(); closeModal(); render(); showToast('حذف شد');
  });
  document.querySelectorAll('[data-return-purchase]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const p = (s.purchases||[]).find(x=>x.id===btn.dataset.returnPurchase);
      if(!p) return;
      const isMultiItem = !p.productId && Array.isArray(p.items) && p.items.length>0;
      const returnedQtySoFar = (p.returns||[]).reduce((a,r)=>a+(r.qty||0),0);
      const returnedAmountSoFar = (p.returns||[]).reduce((a,r)=>a+(r.amount||0),0);
      const remainingQty = purchaseReturnRemainingQty(p);
      const remainingAmount = purchaseReturnRemainingAmount(p);
      const unitPrice = (p.productId && p.qty>0) ? (p.amount/p.qty) : 0;
      const retLines = purchaseLines(p);
      const retLinesLabel = (!p.productId && retLines.length) ? ' — ' + retLines.map(l=>`${esc(l.name)} × ${l.qty}`).join('، ') : '';
      if(isMultiItem){
        openSheet(`
          <h3>برگشت خرید از ${esc(s.name)}</h3>
          <div class="empty" style="padding:0 0 8px;text-align:right;">${faDate(p.date)}${retLinesLabel} — مبلغ کل: ${toman(p.amount)} ت${returnedAmountSoFar>0?` — قبلاً برگشت‌شده: ${toman(returnedAmountSoFar)} ت`:''}</div>
          <div class="field"><label>تاریخ برگشت</label><input id="f-ret-date" type="date" value="${todayISO()}"></div>
          <div id="ret-item-rows">
          ${p.items.map(it=>{
            const remLineQty = purchaseLineRemainingQty(p, it.id);
            return `<div class="field">
              <label>${esc(it.name)} (خریداری‌شده: ${it.qty}، حداکثر قابل‌برگشت: ${remLineQty})</label>
              <input class="ret-item-qty" data-item-id="${it.id}" data-product-id="${it.productId}" data-unit-cost="${it.unitCost}" data-max="${remLineQty}" type="text" inputmode="decimal" placeholder="تعداد برگشتی (اختیاری)" ${remLineQty<=0?'disabled':''}>
            </div>`;
          }).join('')}
          </div>
          <div class="empty" style="padding:4px 0;text-align:right;">مبلغ برگشتی (خودکار): <b id="ret-multi-total">۰</b> تومان</div>
          <div class="btn-row"><button class="btn" id="save-return">ثبت برگشت</button></div>
        `);
        function updateMultiRetTotal(){
          let t = 0;
          document.querySelectorAll('.ret-item-qty').forEach(inp=>{
            const q = numVal(inp);
            const uc = parseFloat(inp.dataset.unitCost)||0;
            if(q>0) t += Math.round(q*uc);
          });
          document.getElementById('ret-multi-total').textContent = toman(t);
        }
        document.querySelectorAll('.ret-item-qty').forEach(inp=>{
          inp.addEventListener('input', updateMultiRetTotal);
        });
        document.getElementById('save-return').addEventListener('click', async ()=>{
          const date = document.getElementById('f-ret-date').value || todayISO();
          const lineReturns = [];
          let overStock = null;
          document.querySelectorAll('.ret-item-qty').forEach(inp=>{
            const q = numVal(inp);
            if(q<=0) return;
            const max = parseFloat(inp.dataset.max)||0;
            const prod = data.products.find(x=>x.id===inp.dataset.productId);
            if(prod && q > (prod.stockQty||0)){ overStock = prod; }
            lineReturns.push({itemId: inp.dataset.itemId, productId: inp.dataset.productId, qty:q, unitCost: parseFloat(inp.dataset.unitCost)||0, max});
          });
          if(lineReturns.length===0){ showToast('حداقل مقدار برگشتی یک قلم رو وارد کن'); return; }
          const badLine = lineReturns.find(l=>l.qty>l.max);
          if(badLine){ alert('مقدار برگشتی از باقیمانده‌ی قابل‌برگشت این قلم بیشتره.\n\nباقیمانده قابل‌برگشت: '+badLine.max); return; }
          if(overStock){ alert('موجودی واقعی «'+overStock.name+'» در انبار فقط '+(overStock.stockQty||0)+' عدد است.\n\nمقدار برگشتی نمی