/**
 * อัลกอริทึมประมวลผลความเสี่ยงน้ำท่วมแยกตามชุมชนกลุ่มเสี่ยง (ข้อ 5)
 * เกณฑ์: 
 * - เขียว (ปกติ)   : ระดับน้ำต่ำกว่าตลิ่ง > 0.50 ม. และ ฝนสะสม < 50 มม.
 * - เหลือง (เฝ้าระวัง): ระดับน้ำใกล้เคียงตลิ่ง (ห่าง <= 0.50 ม.) หรือ ฝนสะสม 50-90 มม.
 * - แดง (วิกฤต)   : ระดับน้ำเท่ากับ/ล้นตลิ่ง (>= ตลิ่ง) หรือ ฝนสะสม > 90 มม.
 */

const COMMUNITIES = [
    { name: "ชุมชนมิตรภาพ ซ.4 / คุ้มวงษ์", stationRef: "M191", bankElevation: 178.50 },
    { name: "ชุมชนบุมะค่า / สำโรงจันทร์ / ท่าตะโก", stationRef: "M191", bankElevation: 178.00 },
    { name: "ชุมชน VIP", stationRef: "M164", bankElevation: 174.20 },
    { name: "ชุมชนเกษตรสามัคคี", stationRef: "M164", bankElevation: 173.80 },
    { name: "ชุมชนหลังวัดสามัคคี, อบอุ่นพัฒนา", stationRef: "M164", bankElevation: 173.50 },
    { name: "ชุมชนวัดศาลาลอย / ท้าวสุระ / มหาชัย", stationRef: "M164", bankElevation: 173.10 }
];

function evaluateCommunityRisk(community, currentWaterLevel, rain24h) {
    const diff = community.bankElevation - currentWaterLevel; // ความสูงตลิ่ง - ระดับน้ำปัจจุบัน
    
    if (diff <= 0 || rain24h >= 90) {
        return { status: "RED", label: "วิกฤต (เสี่ยงล้นตลิ่ง/น้ำท่วม)", colorClass: "bg-red-100 text-red-800 border-red-300", icon: "🚨" };
    } else if (diff <= 0.50 || rain24h >= 50) {
        return { status: "YELLOW", label: "เฝ้าระวังระดับน้ำสูง", colorClass: "bg-amber-100 text-amber-800 border-amber-300", icon: "⚠️" };
    } else {
        return { status: "GREEN", label: "สถานการณ์ปกติ", colorClass: "bg-emerald-100 text-emerald-800 border-emerald-300", icon: "✅" };
    }
}
