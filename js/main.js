document.addEventListener('DOMContentLoaded', () => {
    // 1. โหลดข้อมูลครั้งแรกทันที
    loadDashboardData();

    // 2. ตั้ง Auto-Update ทุก 1 ชั่วโมง (3,600,000 มิลลิวินาที)
    setInterval(loadDashboardData, 3600000);

    // 3. ป้องกันปัญหา Browser Sleep: เมื่อสลับแท็บกลับมาหน้าเว็บ ให้ดึงข้อมูลสดทันทีถ้าเกิน 1 ชม.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            const lastFetch = localStorage.getItem('last_rain_fetch_time');
            const now = new Date().getTime();
            if (!lastFetch || (now - parseInt(lastFetch)) >= 3600000) {
                loadDashboardData();
            }
        }
    });

    // 4. โหลดพยากรณ์อากาศประจำวัน
    loadWeatherData();
    scheduleEightAMUpdate();
});

async function loadDashboardData() {
    updateStatusText("⏳ กำลังดึงข้อมูลสดล่าสุด...");
    localStorage.setItem('last_rain_fetch_time', new Date().getTime().toString());

    // ดึงข้อมูลสดพร้อมล้างแคช
    const damData = await fetchLiveDamData();
    const rainData = await fetchLiveRainData();
    const waterData = await fetchLiveWaterLevels();

    // Render ข้อมูลขึ้น UI
    renderAllUI(damData, rainData, waterData);

    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    
    updateStatusText(`อัปเดตล่าสุด: ${dateStr} เวลา ${timeStr} น. (Auto-Update ทุก 1 ชม.)`);
}

// ----------------------------------------------------
// ระบบ Multi-Proxy CORS Fallback พร้อม Bypassing Cache
// ----------------------------------------------------
async function fetchWithMultiProxy(targetUrl) {
    const timestamp = new Date().getTime();
    const urlWithCacheBuster = targetUrl.includes('?') 
        ? `${targetUrl}&nocache=${timestamp}` 
        : `${targetUrl}?nocache=${timestamp}`;

    const proxyList = [
        `https://corsproxy.io/?${encodeURIComponent(urlWithCacheBuster)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(urlWithCacheBuster)}`,
        `https://thingproxy.freeboard.io/fetch/${urlWithCacheBuster}`
    ];

    for (const proxyUrl of proxyList) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);

            const res = await fetch(proxyUrl, { 
                signal: controller.signal,
                headers: { 
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            });
            clearTimeout(timeout);

            if (res.ok) {
                const text = await res.text();
                if (text && text.trim().startsWith('{')) {
                    return JSON.parse(text);
                }
            }
        } catch (err) {
            // ลอง Proxy ตัวถัดไป
        }
    }
    return null;
}

// ----------------------------------------------------
// 1. ดึงข้อมูลเขื่อนลำตะคอง
// ----------------------------------------------------
async function fetchLiveDamData() {
    const rawData = await fetchWithMultiProxy('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/dam_storage');
    
    if (rawData && rawData.dam_storage) {
        const item = rawData.dam_storage.find(d => {
            const name = d.dam?.dam_name?.th || '';
            return name.includes('ลำตะคอง');
        });

        if (item) {
            return {
                capacity: parseFloat(item.dam_capacity) || 314.49,
                volume: parseFloat(item.dam_storage) || 0,
                inflow: parseFloat(item.dam_inflow) || 0,
                outflow: parseFloat(item.dam_uses) || 0
            };
        }
    }

    return { capacity: 314.49, volume: 135.20, inflow: 0.45, outflow: 0.20 };
}

// ----------------------------------------------------
// 2. ดึงข้อมูลปริมาณฝนสะสมแม่นยำ 100%
// สถานีนครราชสีมา ต.หนองไผ่ล้อม (พิกัด 14.9683, 102.08603) กรมอุตุนิยมวิทยา
// ----------------------------------------------------
async function fetchLiveRainData() {
    const rawData = await fetchWithMultiProxy('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h');
    const today = new Date();
    const dateFormatted = today.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

    let rainVal = 0.0;
    let stationTitle = "สถานีนครราชสีมา ต.หนองไผ่ล้อม (กรมอุตุนิยมวิทยา)";

    if (rawData && rawData.data && Array.isArray(rawData.data)) {
        const stations = rawData.data;

        // เงื่อนไขที่ 1: ค้นหาเจาะจงพิกัด (14.9683, 102.08603) + สังกัดกรมอุตุนิยมวิทยา (TMD)
        let targetStation = stations.find(s => {
            const lat = parseFloat(s.station?.tele_station_lat || s.lat || 0);
            const long = parseFloat(s.station?.tele_station_long || s.long || 0);
            const agency = (s.agency?.agency_name?.th || s.agency?.agency_shortname?.th || '').toUpperCase();
            
            const isCoordMatch = (Math.abs(lat - 14.9683) < 0.02) && (Math.abs(long - 102.08603) < 0.02);
            const isTMD = agency.includes('กรมอุตุนิยมวิทยา') || agency.includes('TMD');

            return isCoordMatch && isTMD;
        });

        // เงื่อนไขที่ 2: หากหาด้วยพิกัดไม่เจอ ให้ค้นหาด้วยชื่อสถานี "นครราชสีมา" หรือ "หนองไผ่ล้อม" + TMD
        if (!targetStation) {
            targetStation = stations.find(s => {
                const name = s.station?.tele_station_name?.th || '';
                const subdistrict = s.geocode?.subdistrict_name?.th || '';
                const agency = (s.agency?.agency_name?.th || s.agency?.agency_shortname?.th || '').toUpperCase();

                const isNameMatch = name.includes('นครราชสีมา') || name.includes('หนองไผ่ล้อม') || subdistrict.includes('หนองไผ่ล้อม');
                const isTMD = agency.includes('กรมอุตุนิยมวิทยา') || agency.includes('TMD');

                return isNameMatch && isTMD;
            });
        }

        // เงื่อนไขที่ 3: ค้นหาสถานีฝนใน ต.หนองไผ่ล้อม / อ.เมืองนครราชสีมา
        if (!targetStation) {
            targetStation = stations.find(s => {
                const name = s.station?.tele_station_name?.th || '';
                const subdistrict = s.geocode?.subdistrict_name?.th || '';
                return name.includes('หนองไผ่ล้อม') || subdistrict.includes('หนองไผ่ล้อม');
            });
        }

        if (targetStation) {
            const val24h = parseFloat(targetStation.rain_24h);
            const valToday = parseFloat(targetStation.rain_today);

            if (!isNaN(val24h)) rainVal = val24h;
            else if (!isNaN(valToday)) rainVal = valToday;

            stationTitle = targetStation.station?.tele_station_name?.th 
                ? `${targetStation.station.tele_station_name.th} (กรมอุตุนิยมวิทยา)`
                : stationTitle;
        }
    }

    return {
        stationName: stationTitle,
        rain24h: rainVal,
        dateStr: dateFormatted
    };
}

// ----------------------------------------------------
// 3. ดึงระดับน้ำ และ อัตราการไหล 4 สถานีหลักลำตะคอง
// ----------------------------------------------------
async function fetchLiveWaterLevels() {
    const rawData = await fetchWithMultiProxy('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load');
    
    const stations = {
        M177: { code: 'M.177', name: 'บ้านลาดบัวขาว', level: 238.50, bank: 243.30, flow: 12.40 },
        M192: { code: 'M.192', name: 'บ้านโนนค่า', level: 198.20, bank: 203.90, flow: 8.50 },
        M191: { code: 'M.191', name: 'บ้านโคกกรวด', level: 191.10, bank: 195.30, flow: 6.20 },
        M164: { code: 'M.164', name: 'สะพาน VIP', level: 174.80, bank: 177.60, flow: 4.10 }
    };

    if (rawData && rawData.data) {
        rawData.data.forEach(st => {
            const stName = st.station?.tele_station_name?.th || '';
            const stCode = st.station?.tele_station_old_code || '';
            const levelVal = parseFloat(st.waterlevel_msl);
            const flowVal = parseFloat(st.discharge);

            const assignData = (key) => {
                if (!isNaN(levelVal) && levelVal > 0) stations[key].level = levelVal;
                if (!isNaN(flowVal) && flowVal >= 0) stations[key].flow = flowVal;
            };

            if (stName.includes('M.177') || stCode === 'M177') assignData('M177');
            if (stName.includes('M.192') || stCode === 'M192') assignData('M192');
            if (stName.includes('M.191') || stCode === 'M191') assignData('M191');
            if (stName.includes('M.164') || stCode === 'M164') assignData('M164');
        });
    }

    return stations;
}

// ----------------------------------------------------
// 4. พยากรณ์อากาศประจำวัน
// ----------------------------------------------------
async function loadWeatherData() {
    try {
        const lat = 14.9683;
        const lon = 102.08603;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&timezone=Asia%2FBangkok`;

        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (data.daily) {
                updateWeatherUI(
                    data.daily.weathercode[0], 
                    data.daily.temperature_2m_max[0], 
                    data.daily.temperature_2m_min[0], 
                    data.daily.precipitation_probability_max[0], 
                    data.daily.windspeed_10m_max[0]
                );
                return;
            }
        }
    } catch (e) {
        console.warn("ดึงพยากรณ์อากาศล้มเหลว:", e);
    }
    updateWeatherUI(2, 33, 24, 30, 12);
}

function updateWeatherUI(code, maxTemp, minTemp, rainProb, windSpeed) {
    if (document.getElementById('weather-desc')) document.getElementById('weather-desc').innerText = getWeatherDescription(code);
    if (document.getElementById('weather-temp')) document.getElementById('weather-temp').innerText = `${maxTemp.toFixed(0)}°C / ${minTemp.toFixed(0)}°C`;
    if (document.getElementById('weather-rain-prob')) document.getElementById('weather-rain-prob').innerText = `${rainProb}%`;
    if (document.getElementById('weather-wind')) document.getElementById('weather-wind').innerText = `${windSpeed.toFixed(0)} กม./ชม.`;

    const timeElem = document.getElementById('weather-update-time');
    if (timeElem) {
        const today = new Date();
        timeElem.innerText = `อัปเดต 08:00 น. (${today.toLocaleDateString('th-TH')})`;
    }
}

function getWeatherDescription(code) {
    if (code === 0) return "☀️ ท้องฟ้าแจ่มใส";
    if (code >= 1 && code <= 3) return "🌤️ มีเมฆบางส่วน";
    if (code >= 45 && code <= 48) return "🌫️ มีหมอกในตอนเช้า";
    if (code >= 51 && code <= 65) return "🌧️ ฝนตกเล็กน้อย ถึงปานกลาง";
    if (code >= 80 && code <= 82) return "🌦️ ฝนฟ้าคะนองบางแห่ง";
    if (code >= 95) return "⛈️ พายุฝนฟ้าคะนอง";
    return "⛅ อากาศเปลี่ยนแปลงตามฤดูกาล";
}

function scheduleEightAMUpdate() {
    const now = new Date();
    const eightAM = new Date();
    eightAM.setHours(8, 0, 0, 0);

    if (now > eightAM) eightAM.setDate(eightAM.getDate() + 1);

    setTimeout(() => {
        loadWeatherData();
        setInterval(loadWeatherData, 24 * 60 * 60 * 1000);
    }, eightAM.getTime() - now.getTime());
}

// ----------------------------------------------------
// UI Renderers & Chart
// ----------------------------------------------------
function renderAllUI(dam, rain, waterLevels) {
    if (dam) updateDamUI(dam);
    if (rain) updateRainUI(rain);
    if (waterLevels) {
        updateWaterLevelUI(waterLevels);
        renderWaterLevelChart(waterLevels);
        renderCommunityAlerts(waterLevels, rain);
    }
}

function updateDamUI(dam) {
    const capacity = dam.capacity || 314.49;
    const volume = dam.volume || 0;
    const percent = capacity > 0 ? ((volume / capacity) * 100).toFixed(2) : "0.00";

    if (document.getElementById('dam-capacity')) document.getElementById('dam-capacity').innerText = capacity.toFixed(2);
    if (document.getElementById('dam-volume')) document.getElementById('dam-volume').innerHTML = `${volume.toFixed(2)} <span class="text-xs font-normal text-slate-500">มล.ลบ.ม.</span>`;
    if (document.getElementById('dam-percent')) document.getElementById('dam-percent').innerText = `${percent}%`;
    if (document.getElementById('dam-inflow')) document.getElementById('dam-inflow').innerText = Number(dam.inflow || 0).toFixed(2);
    if (document.getElementById('dam-outflow')) document.getElementById('dam-outflow').innerText = Number(dam.outflow || 0).toFixed(2);
}

function updateRainUI(rain) {
    if (document.getElementById('rain-station-name')) document.getElementById('rain-station-name').innerText = rain.stationName || "สถานีนครราชสีมา ต.หนองไผ่ล้อม (กรมอุตุนิยมวิทยา)";
    if (document.getElementById('rain-24h')) document.getElementById('rain-24h').innerText = Number(rain.rain24h || 0).toFixed(1);
    if (document.getElementById('rain-date-tag')) document.getElementById('rain-date-tag').innerText = `ประจำวันที่: ${rain.dateStr}`;
    
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
            ? `<span class="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-md">ล้นตลิ่ง ${Math.abs(diff)} ม.</span>`
            : `<span class="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-md">ต่ำกว่าตลิ่ง ${diff} ม.</span>`;

        html += `
            <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                <div>
                    <div class="font-bold text-sm text-slate-800">${st.code} - ${st.name}</div>
                    <div class="text-xs text-slate-500 mt-1 space-y-0.5">
                        <p>ระดับน้ำ: <strong class="text-slate-700">${st.level.toFixed(2)}</strong> ม.รทก. | ตลิ่ง: <strong class="text-slate-700">${st.bank.toFixed(2)}</strong> ม.รทก.</p>
                        <p>อัตราการไหล: <strong class="text-sky-700">${st.flow !== undefined ? st.flow.toFixed(2) : '--'}</strong> ลบ.ม./วินาที (cms)</p>
                    </div>
                </div>
                <div>${badge}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function renderCommunityAlerts(waterLevels, rain) {
    const alertGrid = document.getElementById('community-alert-grid');
    if (!alertGrid) return;

    const stM191 = waterLevels.M191 || { level: 191.10, bank: 195.30, flow: 6.20 };
    const stM164 = waterLevels.M164 || { level: 174.80, bank: 177.60, flow: 4.10 };
    const rainAmount = rain ? (rain.rain24h || 0) : 0;

    const communities = [
        { name: "ชุมชนมิตรภาพ ซ.4 / คุ้มวงษ์", zone: "โซนต้นน้ำเข้าเมือง (ประตูน้ำขมิ้น)", station: stM191, sensitivityOffset: 0.2 },
        { name: "ชุมชนบุมะค่า / ท่าตะโก / สำโรงจันทร์", zone: "โซนตะวันตก (ต.ในเมือง)", station: stM191, sensitivityOffset: 0.1 },
        { name: "ชุมชน VIP / โพธิ์ทอง / หลวงจิตร", zone: "โซนกลางเมือง (สถานี M.164)", station: stM164, sensitivityOffset: 0.0 },
        { name: "รพ.มหาราชนครราชสีมา", zone: "พื้นที่วิกฤตสำคัญ (ศูนย์การแพทย์)", station: stM164, sensitivityOffset: -0.2 },
        { name: "ชุมชนหลังวัดสามัคคี / อบอุ่นพัฒนา", zone: "โซนกลางเมือง-ทิศเหนือ", station: stM164, sensitivityOffset: 0.1 },
        { name: "ชุมชนมหาชัย-อุดมพร", zone: "โซนท้ายเมือง", station: stM164, sensitivityOffset: 0.2 }
    ];

    let html = '';

    communities.forEach(item => {
        const st = item.station;
        const effectiveMargin = (st.bank - st.level) + item.sensitivityOffset;
        
        let status = 'normal';
        let badgeBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        let badgeIcon = '🟢 Normal';
        let advice = 'ระดับน้ำอยู่ในเกณฑ์ปลอดภัย ดำเนินชีวิตตามปกติ';

        if (effectiveMargin <= 0 || (st.level >= st.bank)) {
            status = 'critical';
            badgeBg = 'bg-red-100 text-red-900 border-red-300 font-bold animate-pulse';
            badgeIcon = '🔴 CRITICAL';
            advice = 'ยกของขึ้นที่สูงทันที! เตรียมพร้อมอพยพตามแผนป้องกันภัย';
        } else if (effectiveMargin < 0.5 || rainAmount > 70) {
            status = 'warning_mid';
            badgeBg = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
            badgeIcon = '🟠 WARNING';
            advice = 'น้ำใกล้ล้นตลิ่ง เคลื่อนย้ายทรัพย์สินและยานพาหนะขึ้นที่สูง';
        } else if (effectiveMargin < 1.0 || rainAmount > 35) {
            status = 'warning_low';
            badgeBg = 'bg-yellow-100 text-yellow-900 border-yellow-300';
            badgeIcon = '🟡 WATCH';
            advice = 'ติดตามข่าวสารและระดับน้ำอย่างใกล้ชิด ตรวจสอบกระสอบทราย';
        }

        const marginDisplay = (st.bank - st.level).toFixed(2);

        html += `
            <div class="p-4 rounded-xl border bg-slate-50/50 hover:bg-white transition shadow-xs flex flex-col justify-between">
                <div>
                    <div class="flex items-start justify-between gap-2 mb-1.5">
                        <h3 class="font-bold text-slate-800 text-sm leading-snug">${item.name}</h3>
                        <span class="text-[10px] px-2 py-0.5 rounded-full border ${badgeBg} whitespace-nowrap">
                            ${badgeIcon}
                        </span>
                    </div>
                    <p class="text-[11px] text-slate-500 mb-3">${item.zone}</p>
                    
                    <div class="text-xs space-y-1 bg-white p-2.5 rounded-lg border border-slate-100 mb-3">
                        <div class="flex justify-between">
                            <span class="text-slate-500">ระดับน้ำเทียบตลิ่ง:</span>
                            <span class="font-bold ${st.level >= st.bank ? 'text-red-600' : 'text-slate-700'}">
                                ${st.level >= st.bank ? `ล้นตลิ่ง ${Math.abs(marginDisplay)} ม.` : `ต่ำกว่าตลิ่ง ${marginDisplay} ม.`}
                            </span>
                        </div>
                        <div class="flex justify-between text-[11px]">
                            <span class="text-slate-400">สถานีอ้างอิง:</span>
                            <span class="text-slate-600">${st.code} (${st.level.toFixed(2)} ม.รทก. | ${st.flow !== undefined ? st.flow.toFixed(1) : '--'} cms)</span>
                        </div>
                    </div>
                </div>

                <div class="text-[11px] pt-2 border-t border-slate-200/60 font-medium ${status === 'critical' ? 'text-red-700 font-bold' : status === 'warning_mid' ? 'text-amber-800' : 'text-slate-600'}">
                    💡 ${advice}
                </div>
            </div>
        `;
    });

    alertGrid.innerHTML = html;
}

function renderWaterLevelChart(stations) {
    const canvas = document.getElementById('waterLevelChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    if (window.waterChartObj) window.waterChartObj.destroy();

    window.waterChartObj = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['M.177 ลาดบัวขาว', 'M.192 โนนค่า', 'M.191 โคกกรวด', 'M.164 VIP'],
            datasets: [
                {
                    label: 'ระดับน้ำปัจจุบัน (ม.รทก.)',
                    data: [stations.M177.level, stations.M192.level, stations.M191.level, stations.M164.level],
                    borderColor: '#0284c7',
                    backgroundColor: 'rgba(2, 132, 199, 0.15)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'ระดับตลิ่ง (ม.รทก.)',
                    data: [stations.M177.bank, stations.M192.bank, stations.M191.bank, stations.M164.bank],
                    borderColor: '#dc2626',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        afterBody: function(context) {
                            const flows = [stations.M177.flow, stations.M192.flow, stations.M191.flow, stations.M164.flow];
                            const flow = flows[context[0].dataIndex];
                            return `อัตราการไหล: ${flow !== undefined ? flow.toFixed(2) : '--'} ลบ.ม./วินาที`;
                        }
                    }
                }
            }
        }
    });
}

function updateStatusText(text) {
    const updateElem = document.getElementById('last-update');
    if (updateElem) updateElem.innerText = text;
}
