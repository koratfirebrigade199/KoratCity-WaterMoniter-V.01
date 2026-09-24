document.addEventListener('DOMContentLoaded', () => {
    loadLiveThaiWaterData();
    setInterval(loadLiveThaiWaterData, 300000); // โหลดใหม่ทุก 5 นาที
});

async function loadLiveThaiWaterData() {
    updateStatusText("กำลังดึงข้อมูลสดจาก ThaiWater Korat...");

    // 1. ดึงข้อมูลเขื่อนลำตะคอง
    const damData = await fetchDamData();
    
    // 2. ดึงข้อมูลฝน ต.หนองไผ่ล้อม
    const rainData = await fetchRainData();
    
    // 3. ดึงข้อมูลระดับน้ำลำน้ำลำตะคอง (M.177, M.192, M.191, M.164)
    const wlData = await fetchWaterLevelData();

    // Render ข้อมูลขึ้น UI
    if (damData) updateDamUI(damData);
    if (rainData) updateRainUI(rainData);
    if (wlData) updateWaterLevelUI(wlData);

    // แสดงเวลาอัปเดตล่าสุด
    const updateElem = document.getElementById('last-update');
    if (updateElem) {
        const now = new Date();
        updateElem.innerText = `อัปเดตข้อมูลสด: ${now.toLocaleDateString('th-TH')} ${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
    }
}

// ----------------------------------------------------
// 1. ดึงข้อมูลเขื่อนลำตะคอง (nakhonratchasima.thaiwater.net/dam)
// ----------------------------------------------------
async function fetchDamData() {
    const targetUrl = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/dam_storage';
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&_=${new Date().getTime()}`;

    try {
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error("Proxy error");
        const json = await res.json();
        const data = JSON.parse(json.contents);
        
        const dams = data.dam_storage || [];
        const lamTakhong = dams.find(d => {
            const name = d.dam?.dam_name?.th || '';
            return name.includes('ลำตะคอง');
        });

        if (lamTakhong) {
            return {
                capacity: parseFloat(lamTakhong.dam_capacity) || 314.49,
                volume: parseFloat(lamTakhong.dam_storage) || 0,
                inflow: parseFloat(lamTakhong.dam_inflow) || 0,
                outflow: parseFloat(lamTakhong.dam_uses) || 0
            };
        }
    } catch (e) {
        console.warn("ไม่สามารถดึงข้อมูลเขื่อนสดได้ ใช้ข้อมูลสำรอง:", e);
    }
    return null;
}

// ----------------------------------------------------
// 2. ดึงข้อมูลฝน หนองไผ่ล้อม (nakhonratchasima.thaiwater.net/rainfall)
// ----------------------------------------------------
async function fetchRainData() {
    const targetUrl = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h';
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&_=${new Date().getTime()}`;

    try {
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error("Proxy error");
        const json = await res.json();
        const data = JSON.parse(json.contents);
        
        const stations = data.data || [];
        // ค้นหาสถานีฝน ต.หนองไผ่ล้อม อ.เมืองนครราชสีมา
        const targetStation = stations.find(s => {
            const name = s.station?.tele_station_name?.th || '';
            const subdistrict = s.geocode?.subdistrict_name?.th || '';
            return name.includes('หนองไผ่ล้อม') || subdistrict.includes('หนองไผ่ล้อม');
        });

        if (targetStation) {
            return {
                stationName: targetStation.station?.tele_station_name?.th || "ต.หนองไผ่ล้อม",
                rain24h: parseFloat(targetStation.rain_24h) || 0
            };
        }
    } catch (e) {
        console.warn("ไม่สามารถดึงข้อมูลฝนสดได้:", e);
    }
    return null;
}

// ----------------------------------------------------
// 3. ดึงข้อมูลระดับน้ำลำน้ำ (nakhonratchasima.thaiwater.net/wl)
// ----------------------------------------------------
async function fetchWaterLevelData() {
    const targetUrl = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load';
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&_=${new Date().getTime()}`;

    try {
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error("Proxy error");
        const json = await res.json();
        const data = JSON.parse(json.contents);
        
        const stations = data.waterlevel_data || [];
        
        const mapStation = (code, defaultBank) => {
            const st = stations.find(s => (s.station?.tele_station_old_code || '').includes(code));
            if (st) {
                return {
                    code: code,
                    name: st.station?.tele_station_name?.th || code,
                    level: parseFloat(st.waterlevel_m) || 0,
                    bank: parseFloat(st.bank_height) || defaultBank
                };
            }
            return null;
        };

        return {
            M177: mapStation('M.177', 243.30),
            M192: mapStation('M.192', 203.90),
            M191: mapStation('M.191', 195.30),
            M164: mapStation('M.164', 177.60)
        };
    } catch (e) {
        console.warn("ไม่สามารถดึงข้อมูลระดับน้ำสดได้:", e);
    }
    return null;
}

// ----------------------------------------------------
// UI Render Functions
// ----------------------------------------------------
function updateDamUI(dam) {
    const capacity = dam.capacity || 314.49;
    const volume = dam.volume || 0;
    const percent = ((volume / capacity) * 100).toFixed(2);

    if (document.getElementById('dam-capacity')) document.getElementById('dam-capacity').innerText = capacity.toFixed(2);
    if (document.getElementById('dam-volume')) document.getElementById('dam-volume').innerHTML = `${volume.toFixed(2)} <span class="text-xs font-normal text-slate-500">ล้าน ลบ.ม.</span>`;
    if (document.getElementById('dam-percent')) document.getElementById('dam-percent').innerText = `${percent}%`;
    if (document.getElementById('dam-inflow')) document.getElementById('dam-inflow').innerHTML = `${dam.inflow.toFixed(2)} <span class="text-xs font-normal text-slate-500">ล้าน ลบ.ม./วัน</span>`;
    if (document.getElementById('dam-outflow')) document.getElementById('dam-outflow').innerHTML = `${dam.outflow.toFixed(2)} <span class="text-xs font-normal text-slate-500">ล้าน ลบ.ม./วัน</span>`;
}

function updateRainUI(rain) {
    if (document.getElementById('rain-station-name')) document.getElementById('rain-station-name').innerText = rain.stationName;
    if (document.getElementById('rain-24h')) document.getElementById('rain-24h').innerHTML = `${rain.rain24h.toFixed(1)} <span class="text-xs font-normal">มม.</span>`;
    
    let statusText = "ไม่มีฝนตก";
    if (rain.rain24h > 90) statusText = "🌧️ ฝนตกหนักมาก";
    else if (rain.rain24h > 35) statusText = "🌦️ ฝนตกปานกลาง";
    else if (rain.rain24h > 0.1) statusText = "🌤️ ฝนตกเล็กน้อย";
    if (document.getElementById('rain-status')) document.getElementById('rain-status').innerText = statusText;
}

function updateWaterLevelUI(stations) {
    const container = document.getElementById('water-level-details');
    if (!container) return;

    let html = '';
    Object.keys(stations).forEach(k => {
        const st = stations[k];
        if (!st) return;

        const diff = (st.bank - st.level).toFixed(2);
        const isOverflow = st.level >= st.bank;
        const badge = isOverflow 
            ? `<span class="bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded">ล้นตลิ่ง ${Math.abs(diff)} ม.</span>`
            : `<span class="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded">ต่ำกว่าตลิ่ง ${diff} ม.</span>`;

        html += `
            <div class="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                <div>
                    <div class="font-bold text-sm text-slate-800">${st.code} - ${st.name}</div>
                    <div class="text-xs text-slate-500">ระดับน้ำ: <strong>${st.level.toFixed(2)}</strong> ม.รทก. | ระดับตลิ่ง: <strong>${st.bank.toFixed(2)}</strong> ม.รทก.</div>
                </div>
                <div>${badge}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function updateStatusText(text) {
    const updateElem = document.getElementById('last-update');
    if (updateElem) updateElem.innerText = text;
}
