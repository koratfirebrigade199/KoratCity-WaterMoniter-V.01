// 1. รายชื่อชุมชนกลุ่มเสี่ยงแนวลุ่มน้ำลำตะคอง และสถานีอ้างอิง
const COMMUNITIES = [
    { id: 'C01', name: 'ชุมชนมิตรภาพ ต.ลาดบัวขาว (อ.สีคิ้ว)', stationRef: 'M177', bankElevation: 243.30 },
    { id: 'C02', name: 'ชุมชนบ้านโนนค่า (อ.สูงเนิน)', stationRef: 'M192', bankElevation: 203.90 },
    { id: 'C03', name: 'ชุมชนโคกกรวด (อ.เมือง)', stationRef: 'M191', bankElevation: 195.30 },
    { id: 'C04', name: 'ชุมชนมิตรภาพ-ปรกเกล้า (ต.ในเมือง)', stationRef: 'M164', bankElevation: 177.60 },
    { id: 'C05', name: 'ชุมชนท่าน้ำวัดมงคลษกุณาราม (ต.ในเมือง)', stationRef: 'M164', bankElevation: 177.60 },
    { id: 'C06', name: 'ชุมชนตรอกสำโรงจันทร์ (ต.ในเมือง)', stationRef: 'M164', bankElevation: 177.20 }
];

// 2. ฟังก์ชันวิเคราะห์ความเสี่ยงอัตโนมัติ (Risk Analysis Core)
function evaluateCommunityRisk(community, currentWaterLevel, rain24h) {
    const margin = community.bankElevation - currentWaterLevel; // ระยะห่างจากตลิ่ง (เมตร)
    
    // เงื่อนไข 🔴 วิกฤต (Critical)
    if (margin <= 0) {
        return {
            level: 'CRITICAL',
            label: `🔴 วิกฤต (ล้นตลิ่ง ${Math.abs(margin).toFixed(2)} ม.)`,
            colorClass: 'bg-red-50 border-red-500 text-red-900',
            badgeClass: 'bg-red-600 text-white',
            action: 'อพยพขึ้นที่สูง/จุดพักพิงทันที'
        };
    }
    
    // เงื่อนไข 🟠 เตือนภัย (Warning)
    if (margin <= 0.50 || rain24h >= 90.0) {
        return {
            level: 'WARNING',
            label: `🟠 เตือนภัย (ห่างตลิ่ง ${margin.toFixed(2)} ม.)`,
            colorClass: 'bg-orange-50 border-orange-500 text-orange-900',
            badgeClass: 'bg-orange-500 text-white',
            action: 'เตรียมพร้อมอพยพกลุ่มเปราะบาง'
        };
    }
    
    // เงื่อนไข 🟡 เฝ้าระวัง (Watch)
    if (margin <= 1.50 || rain24h >= 35.0) {
        return {
            level: 'WATCH',
            label: `🟡 เฝ้าระวัง (ห่างตลิ่ง ${margin.toFixed(2)} ม.)`,
            colorClass: 'bg-amber-50 border-amber-500 text-amber-900',
            badgeClass: 'bg-amber-500 text-white',
            action: 'ยกของขึ้นที่สูง เฝ้าระวังใกล้ชิด'
        };
    }

    // เงื่อนไข 🟢 ปกติ (Normal)
    return {
        level: 'NORMAL',
        label: `🟢 ปกติ (ต่ำกว่าตลิ่ง ${margin.toFixed(2)} ม.)`,
        colorClass: 'bg-emerald-50 border-emerald-500 text-emerald-900',
        badgeClass: 'bg-emerald-600 text-white',
        action: 'สถานการณ์ปกติ'
    };
}

// 3. ฟังก์ชัน Render การเตือนภัยลงบน UI
function updateCommunityAlerts(waterLevels, rain24h) {
    const alertGrid = document.getElementById('alert-grid');
    if (!alertGrid) return;
    
    alertGrid.innerHTML = ''; // ล้างข้อมูลเดิม

    COMMUNITIES.forEach(c => {
        const station = waterLevels[c.stationRef];
        const currentWater = station ? station.level : 0;
        
        // ประมวลผลสถานะความเสี่ยง
        const evalResult = evaluateCommunityRisk(c, currentWater, rain24h || 0);

        const card = document.createElement('div');
        card.className = `p-4 rounded-xl border-2 ${evalResult.colorClass} shadow-xs transition hover:shadow-md flex flex-col justify-between gap-3`;
        card.innerHTML = `
            <div class="space-y-1.5">
                <div class="flex justify-between items-start gap-2">
                    <h4 class="font-bold text-sm sm:text-base leading-snug">${c.name}</h4>
                    <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${evalResult.badgeClass} shrink-0">
                        ${evalResult.level}
                    </span>
                </div>
                <p class="text-xs opacity-80">
                    อ้างอิงสถานี: <strong>${c.stationRef}</strong> | ระดับตลิ่ง: <strong>${c.bankElevation}</strong> ม.รทก.
                </p>
            </div>
            
            <div class="pt-2 border-t border-black/10 flex justify-between items-center text-xs">
                <span class="font-bold">${evalResult.label}</span>
                <span class="text-[11px] underline font-medium opacity-90">${evalResult.action}</span>
            </div>
        `;
        alertGrid.appendChild(card);
    });
}
