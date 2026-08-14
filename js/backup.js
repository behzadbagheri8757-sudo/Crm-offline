/* backup.js — export/import JSON, auto-backup, undo restore, excel export
   Phase 0 extract: no logic changes.
*/
// ---------- backup / restore ----------
async function downloadFile(filename, blobParts, mime){
  const blob = (blobParts instanceof Blob) ? blobParts : new Blob([blobParts], {type:mime});
  // iOS Safari often just previews a blob link instead of saving it — the
  // share sheet's "Save to Files" is the reliable path on iPhone.
  try{
    if(navigator.canShare){
      const file = new File([blob], filename, {type:mime});
      if(navigator.canShare({files:[file]})){
        await navigator.share({files:[file], title:filename});
        return;
      }
    }
  }catch(e){
    // user cancelled the share sheet, or share isn't available — fall back below
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}

/** کلید اسنپ‌شات Prospect قبل از Restore (داخل همان baqeriDB، جدا از CRM) */
const PRERESTORE_PROSPECT_KEY = 'preRestoreProspect';

/**
 * دسترسی مستقیم به ProspectScoutDB (بدون وابستگی به لود بودن prospect-db.js)
 * تا Backup از صفحه تنظیمات هم کار کند.
 */
function openProspectScoutDbForBackup(){
  return new Promise((resolve, reject)=>{
    try{
      const req = indexedDB.open('ProspectScoutDB', 1);
      req.onupgradeneeded = (e)=>{
        const db = e.target.result;
        if(!db.objectStoreNames.contains('shops')) db.createObjectStore('shops',{keyPath:'id'});
        if(!db.objectStoreNames.contains('routes')) db.createObjectStore('routes',{keyPath:'id'});
        if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta',{keyPath:'key'});
      };
      req.onsuccess = (e)=> resolve(e.target.result);
      req.onerror = (e)=> reject(e.target.error);
    }catch(e){ reject(e); }
  });
}
function prospectBackupGetAll(db, storeName){
  return new Promise((resolve, reject)=>{
    const r = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    r.onsuccess = ()=> resolve(r.result||[]);
    r.onerror = ()=> reject(r.error);
  });
}
function prospectBackupGet(db, storeName, key){
  return new Promise((resolve, reject)=>{
    const r = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    r.onsuccess = ()=> resolve(r.result||null);
    r.onerror = ()=> reject(r.error);
  });
}
function prospectBackupPut(db, storeName, value){
  return new Promise((resolve, reject)=>{
    const r = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value);
    r.onsuccess = ()=> resolve(value);
    r.onerror = ()=> reject(r.error);
  });
}
function prospectBackupDelete(db, storeName, key){
  return new Promise((resolve, reject)=>{
    const r = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
    r.onsuccess = ()=> resolve(true);
    r.onerror = ()=> reject(r.error);
  });
}

/** خواندن بسته‌ی Prospect برای Backup — در صورت نبود DB یا خطا null */
async function exportProspectScoutBundle(){
  try{
    const db = await openProspectScoutDbForBackup();
    const shops = await prospectBackupGetAll(db, 'shops');
    const routes = await prospectBackupGetAll(db, 'routes');
    const dtRec = await prospectBackupGet(db, 'meta', 'dailyTarget');
    try{ db.close(); }catch(e){}
    return {
      version: 1,
      shops: shops || [],
      routes: routes || [],
      dailyTarget: (dtRec && dtRec.value) ? dtRec.value : null,
    };
  }catch(e){
    console.error('exportProspectScoutBundle failed', e);
    return null;
  }
}

/** جایگزینی کامل داده‌ی Prospect از bundle بکاپ — فقط وقتی bundle معتبر است */
async function restoreProspectScoutBundle(bundle){
  if(!bundle || typeof bundle !== 'object') return false;
  if(!Array.isArray(bundle.shops) && !Array.isArray(bundle.routes) && bundle.dailyTarget == null) return false;
  try{
    const db = await openProspectScoutDbForBackup();
    const oldShops = await prospectBackupGetAll(db, 'shops');
    const oldRoutes = await prospectBackupGetAll(db, 'routes');
    for(const s of (oldShops||[])) await prospectBackupDelete(db, 'shops', s.id);
    for(const r of (oldRoutes||[])) await prospectBackupDelete(db, 'routes', r.id);
    for(const s of (bundle.shops||[])) await prospectBackupPut(db, 'shops', s);
    for(const r of (bundle.routes||[])) await prospectBackupPut(db, 'routes', r);
    if(bundle.dailyTarget != null){
      await prospectBackupPut(db, 'meta', {key:'dailyTarget', value: bundle.dailyTarget});
    }
    try{ db.close(); }catch(e){}
    return true;
  }catch(e){
    console.error('restoreProspectScoutBundle failed', e);
    return false;
  }
}

async function exportBackupJSON(){
  const stamp = todayISO();
  // سازگاری: همان فیلدهای data در ریشه؛ prospectScout اختیاری و اضافه
  const payload = JSON.parse(JSON.stringify(data));
  const prospect = await exportProspectScoutBundle();
  if(prospect) payload.prospectScout = prospect;
  await downloadFile(`baqeri-backup-${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
  showToast('فایل بکاپ آماده شد');
}

function validateBackupShape(parsed){
  if(!parsed || typeof parsed !== 'object') return false;
  const arrays = ['products','customers','invoices','payments','checks','suppliers'];
  return arrays.every(k => parsed[k]===undefined || Array.isArray(parsed[k]));
}

/** اعتبارسنجی بخش اختیاری Prospect در بکاپ — فقط وقتی کلید وجود دارد */
function validateProspectScoutShape(bundle){
  if(bundle == null) return true;
  if(typeof bundle !== 'object') return false;
  if(bundle.shops !== undefined && !Array.isArray(bundle.shops)) return false;
  if(bundle.routes !== undefined && !Array.isArray(bundle.routes)) return false;
  return true;
}

/**
 * تشخیص قالب بکاپ خودکار:
 * - جدید: { format:'baqeri-auto-backup', version, ts, crm, prospectScout? }
 * - قدیمی: خودِ آبجکت CRM (products/customers/…)
 */
function parseAutoBackupPayload(parsed){
  if(parsed && typeof parsed === 'object' && parsed.format === 'baqeri-auto-backup' && parsed.crm && typeof parsed.crm === 'object'){
    return {
      crm: parsed.crm,
      prospectScout: parsed.prospectScout != null ? parsed.prospectScout : null,
      hasProspect: parsed.prospectScout != null,
    };
  }
  return { crm: parsed, prospectScout: null, hasProspect: false };
}

/**
 * بازیابی منطقی CRM (+ اختیاری Prospect) با اسنپ‌شات و rollback سطح اپلیکیشن.
 * returns { ok:boolean }
 * successToast: پیام موفقیت در صورت ok
 */
async function applyLogicalRestore(crmSource, prospectBundle, hasProspectSection, successToast){
  const previousCrmJson = JSON.stringify(data);
  let previousProspect = null;
  try{
    previousProspect = await exportProspectScoutBundle();
  }catch(e){
    console.error('pre-restore prospect export failed', e);
  }

  // اسنپ‌شات برای Undo بعدی
  try{
    await dbPut(PRERESTORE_KEY, previousCrmJson);
  }catch(e){
    console.error(e);
    showToast('ذخیرهٔ نسخهٔ فعلی قبل از بازیابی ممکن نشد (خطای پایگاه داده)');
    return { ok:false };
  }
  try{
    if(previousProspect){
      await dbPut(PRERESTORE_PROSPECT_KEY, JSON.stringify(previousProspect));
    }
  }catch(e){
    console.error('prospect pre-restore snapshot failed', e);
    // ادامه می‌دهیم؛ Undo ممکن است Prospect را نداشته باشد
  }

  const prepared = normalizeData(crmSource);
  const oldData = data;
  data = prepared;
  try{
    await saveData();
  }catch(e){
    console.error('CRM restore save failed', e);
    data = oldData;
    showToast('بازیابی ممکن نشد: خطا در ذخیرهٔ پایگاه داده');
    return { ok:false };
  }

  if(hasProspectSection && prospectBundle){
    const pOk = await restoreProspectScoutBundle(prospectBundle);
    if(!pOk){
      // rollback CRM
      let crmRollbackOk = false;
      try{
        data = normalizeData(JSON.parse(previousCrmJson));
        await saveData();
        crmRollbackOk = true;
      }catch(e){
        console.error('CRM rollback after Prospect failure failed', e);
      }
      // rollback Prospect
      let prospectRollbackOk = true;
      if(previousProspect){
        prospectRollbackOk = await restoreProspectScoutBundle(previousProspect);
      }
      if(!crmRollbackOk || !prospectRollbackOk){
        showToast('بازیابی Prospect ناموفق بود و برگشت کامل ممکن نشد — وضعیت ممکن است ناقص باشد');
      } else {
        showToast('بازیابی ناموفق بود: خطای بازیابی Prospect — وضعیت قبلی برگردانده شد');
      }
      try{ render(); }catch(e){}
      return { ok:false };
    }
  }

  try{ render(); }catch(e){}
  if(successToast) showToast(successToast);
  return { ok:true };
}

async function importBackupJSON(file){
  try{
    const text = await file.text();
    let parsed;
    try{
      parsed = JSON.parse(text);
    }catch(e){
      showToast('فایل بکاپ معتبر نیست یا خراب است');
      return false;
    }
    if(!validateBackupShape(parsed)){
      showToast('این فایل، فایل بکاپ معتبری نیست');
      return false;
    }
    const hasProspect = parsed.prospectScout != null;
    if(hasProspect && !validateProspectScoutShape(parsed.prospectScout)){
      showToast('بخش Prospect در فایل بکاپ نامعتبر است');
      return false;
    }
    const result = await applyLogicalRestore(
      parsed,
      hasProspect ? parsed.prospectScout : null,
      hasProspect,
      'اطلاعات با موفقیت بازیابی شد'
    );
    return !!result.ok;
  }catch(e){
    console.error(e);
    showToast('بازیابی ممکن نشد');
    return false;
  }
}

async function undoLastRestore(){
  try{
    const snap = await dbGet(PRERESTORE_KEY);
    if(!snap || !snap.value){ showToast('نسخه‌ی قبل از بازیابی موجود نیست'); return false; }
    let previousProspect = null;
    try{
      const pSnap = await dbGet(PRERESTORE_PROSPECT_KEY);
      if(pSnap && pSnap.value) previousProspect = JSON.parse(pSnap.value);
    }catch(e){ console.error('read prospect pre-restore failed', e); }

    data = normalizeData(JSON.parse(snap.value));
    try{
      await saveData();
    }catch(e){
      console.error(e);
      showToast('بازگرداندن ممکن نشد: خطا در ذخیرهٔ پایگاه داده');
      return false;
    }

    let prospectOk = true;
    if(previousProspect){
      prospectOk = await restoreProspectScoutBundle(previousProspect);
      if(!prospectOk){
        showToast('CRM برگشت داده شد، ولی بازیابی Prospect ناقص بود');
        try{ render(); }catch(e){}
        return false;
      }
    }
    try{ render(); }catch(e){}
    showToast('به حالت قبل از بازیابی برگشت');
    return true;
  }catch(e){
    console.error(e);
    showToast('بازگرداندن ممکن نشد');
    return false;
  }
}

// ---------- بکاپ خودکار ساده (fire-and-forget، هیچ‌وقت نباید جلوی ذخیره‌ی اصلی را بگیرد) ----------
async function getAutoBackupList(){
  const rec = await dbGet(AUTO_BACKUP_LIST_KEY);
  return (rec && rec.value) ? JSON.parse(rec.value) : [];
}

async function autoBackupTick(){
  const list = await getAutoBackupList();
  const last = list.length ? list[list.length-1].ts : 0;
  if(Date.now() - last < AUTO_BACKUP_INTERVAL_MS) return; // هنوز زوده، لازم نیست نسخه‌ی جدید بگیریم
  const ts = Date.now();
  const key = AUTO_BACKUP_PREFIX + ts;
  // قالب جدید: CRM + Prospect؛ بکاپ‌های قدیمی فقط CRM بودند و همچنان قابل بازیابی‌اند
  let prospect = null;
  try{ prospect = await exportProspectScoutBundle(); }catch(e){ console.error('auto backup prospect export failed', e); }
  const payload = {
    format: 'baqeri-auto-backup',
    version: 1,
    ts,
    crm: data,
    prospectScout: prospect,
  };
  await dbPut(key, JSON.stringify(payload));
  list.push({key, ts});
  while(list.length > AUTO_BACKUP_MAX){
    const old = list.shift();
    try{ await dbDelete(old.key); }catch(e){ /* نبود یا حذف نشد، مهم نیست */ }
  }
  await dbPut(AUTO_BACKUP_LIST_KEY, JSON.stringify(list));
}

async function restoreFromAutoBackup(key){
  if(!confirm('مطمئنی؟ اطلاعات فعلی با این نسخه‌ی بکاپ خودکار جایگزین می‌شه.')) return false;
  try{
    const snap = await dbGet(key);
    if(!snap || !snap.value){ showToast('این نسخه‌ی بکاپ پیدا نشد'); return false; }
    let parsed;
    try{
      parsed = JSON.parse(snap.value);
    }catch(e){
      showToast('این نسخه‌ی بکاپ خراب است');
      return false;
    }
    const parts = parseAutoBackupPayload(parsed);
    if(!validateBackupShape(parts.crm)){
      showToast('این نسخه‌ی بکاپ معتبر نیست');
      return false;
    }
    if(parts.hasProspect && !validateProspectScoutShape(parts.prospectScout)){
      showToast('بخش Prospect در این بکاپ خودکار نامعتبر است');
      return false;
    }
    const result = await applyLogicalRestore(
      parts.crm,
      parts.hasProspect ? parts.prospectScout : null,
      parts.hasProspect,
      'از بکاپ خودکار بازیابی شد'
    );
    return !!result.ok;
  }catch(e){
    console.error(e);
    showToast('بازیابی از بکاپ خودکار ممکن نشد');
    return false;
  }
}

function exportExcel(){
  if(typeof XLSX === 'undefined'){
    showToast('کتابخانه اکسل لود نشد؛ برای این خروجی به اینترنت نیاز است');
    return;
  }
  const wb = XLSX.utils.book_new();

  const custRows = data.customers.map(c=>{
    const t = customerTotals(c.id);
    return {
      'نام فروشگاه': c.name, 'صاحب فروشگاه': c.ownerName||'', 'شماره تماس': c.phone||'',
      'منطقه': c.region||'', 'مسیر': c.route||'',
      'جمع فاکتورها': t.invTotal, 'مانده حساب': t.balance,
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(custRows.length?custRows:[{'نام فروشگاه':''}]), 'مشتریان');

  const invRows = [];
  data.invoices.forEach(i=>{
    const cust = data.customers.find(c=>c.id===i.customerId);
    i.items.forEach(it=>{
      invRows.push({
        'شماره فاکتور': i.number||'', 'تاریخ': i.date, 'مشتری': cust?cust.name:'',
        'کالا': it.name, 'تعداد': it.qty, 'قیمت واحد': it.price, 'جمع': it.qty*it.price - (it.discount||0),
      });
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invRows.length?invRows:[{'شماره فاکتور':''}]), 'فاکتورها');

  const prodRows = data.products.map(p=>({
    'نام کالا': p.name, 'دسته‌بندی': p.category||'', 'قیمت خرید': p.buy,
    'قیمت عمده': p.wholesale, 'قیمت مصرف‌کننده': p.retail, 'موجودی': p.stockQty,
    'ارزش ریالی موجودی': (typeof productInventoryValue==='function' ? productInventoryValue(p.id) : (p.stockQty||0)*(p.buy||0)),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prodRows.length?prodRows:[{'نام کالا':''}]), 'کالاها');

  const supRows = data.suppliers.map(s=>{
    const t = supplierTotals(s.id);
    return { 'تامین‌کننده': s.name, 'جمع خرید': t.purchaseTotal, 'جمع پرداخت': t.payTotal, 'بدهی': t.balance };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(supRows.length?supRows:[{'تامین‌کننده':''}]), 'تامین‌کننده‌ها');

  const wbArray = XLSX.write(wb, {bookType:'xlsx', type:'array'});
  const blob = new Blob([wbArray], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  downloadFile(`baqeri-report-${todayISO()}.xlsx`, blob).then(()=>{
    showToast('فایل اکسل آماده شد');
  });
}

