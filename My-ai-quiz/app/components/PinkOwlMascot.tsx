'use client';

export type OwlMood = 'idle' | 'wave' | 'study';

interface PinkOwlMascotProps {
  mood?: OwlMood;
  className?: string;
  size?: number | string;
}

export function PinkOwlMascot({
  mood = 'idle',
  className = '',
  size = 200,
}: PinkOwlMascotProps) {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      <style jsx>{`
        /* --- Base Animations --- */
        .owl-whole {
          transform-origin: 150px 290px;
          animation: idleBob 3.6s ease-in-out infinite;
        }

        @keyframes idleBob {
          0%, 100% { transform: translateY(0) scale(1, 1); }
          50% { transform: translateY(-7px) scale(1.02, 0.98); }
        }

        /* พู่หมวกแกว่งไหว */
        .cap-tassel {
          transform-origin: 218px 46px;
          animation: tasselSwing 3.6s ease-in-out infinite;
        }

        @keyframes tasselSwing {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(9deg); }
        }

        /* กระพริบตาธรรมชาติ (เฉพาะโหมดปกติ) */
        .action-idle #leftEyeGroup,
        .action-idle #rightEyePupil {
          animation: naturalBlink 4.2s infinite;
          transform-origin: 150px 172px;
        }

        @keyframes naturalBlink {
          0%, 93%, 97%, 100% { transform: scaleY(1); }
          95% { transform: scaleY(0.1); }
        }

        /* --- Elements Default Visibility --- */
        #rightEyeWink { display: none; }
        #readingBook { display: none; opacity: 0; }

        /* ========================================================
           1. ACTION: โบกมือทักทาย (Wave & Wink) - FIXED
           ======================================================== */
        .action-wave .owl-whole {
          animation: waveTilt 1.8s ease-in-out infinite alternate;
        }
        @keyframes waveTilt {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(-3deg); }
        }

        /* ซ่อนลูกตาขวา แล้วเปิดเส้นตายิ้ม (Wink) ไม่หลุดเบ้าแว่น */
        .action-wave #rightEyePupil { display: none; }
        .action-wave #rightEyeWink { display: inline; }

        /* ปีกขวายกขึ้นมาโบกสะบัด */
        .action-wave #rightWingDefault { display: none; }
        .action-wave #rightWingWave {
          display: inline !important;
          transform-origin: 228px 185px;
          animation: wingWaveMotion 0.45s ease-in-out infinite alternate;
        }
        @keyframes wingWaveMotion {
          0% { transform: rotate(-8deg) translateY(-3px); }
          100% { transform: rotate(24deg) translateY(4px); }
        }

        /* ========================================================
           2. ACTION: อ่านหนังสือ (Study & Reading) - FIXED
           ======================================================== */
        .action-study .owl-whole {
          animation: readNod 2.4s ease-in-out infinite;
        }
        @keyframes readNod {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(3px) rotate(1.5deg); }
        }

        /* ลูกตาทั้งสองข้างเลื่อนต่ำลงมามองหนังสือ */
        .action-study #leftEyeGroup,
        .action-study #rightEyePupil {
          transform: translateY(6px);
          transition: transform 0.3s ease;
        }

        /* ซ่อนปีกข้างปกติ แล้วเปิดปีกโอบหนังสือ + ตัวหนังสือ */
        .action-study #leftWingDefault,
        .action-study #rightWingDefault { display: none; }
        .action-study #readingBook {
          display: inline;
          opacity: 1;
          animation: bookSway 2.4s ease-in-out infinite;
          transform-origin: 150px 240px;
        }
        @keyframes bookSway {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(2px); }
        }
      `}</style>

      <div
        className={`relative ${mood ? `action-${mood}` : 'action-idle'}`}
        style={{ width: size, height: typeof size === 'number' ? size * 1.13 : size }}
      >
        <svg
          className="w-full h-full overflow-visible"
          viewBox="0 0 300 340"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Body Gradient */}
            <radialGradient id="bodyGrad" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="65%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#e11d48" />
            </radialGradient>
            {/* Shadow Filter */}
            <filter id="softShadow" x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy="7" stdDeviation="5" floodColor="#881337" floodOpacity="0.18" />
            </filter>
            {/* Cap Gradients */}
            <linearGradient id="capTopGradFixed" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#334155"/>
              <stop offset="50%" stopColor="#1E293B"/>
              <stop offset="100%" stopColor="#0F172A"/>
            </linearGradient>
            <linearGradient id="tasselGoldGradFixed" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE047"/>
              <stop offset="60%" stopColor="#F59E0B"/>
              <stop offset="100%" stopColor="#B45309"/>
            </linearGradient>
          </defs>

          {/* เงาพื้นใต้เท้า */}
          <ellipse cx="150" cy="318" rx="80" ry="12" fill="#f43f5e" opacity="0.16" />

          <g className="owl-whole">
            {/* เท้าสีส้ม 2 ข้าง */}
            <ellipse cx="118" cy="304" rx="20" ry="12" fill="#ea580c"/>
            <ellipse cx="118" cy="302" rx="18" ry="9" fill="#f97316"/>
            <ellipse cx="182" cy="304" rx="20" ry="12" fill="#ea580c"/>
            <ellipse cx="182" cy="302" rx="18" ry="9" fill="#f97316"/>

            {/* ปีกซ้ายปกติ */}
            <path id="leftWingDefault" d="M 68 185 C 45 190 35 235 55 260 C 65 272 78 265 80 250 Z" fill="#e11d48"/>

            {/* ปีกขวาปกติ */}
            <path id="rightWingDefault" d="M 232 185 C 255 190 265 235 245 260 C 235 272 222 265 220 250 Z" fill="#e11d48"/>

            {/* ลำตัว Duo Body */}
            <path
              d="M 85 90 C 70 70 65 48 78 45 C 92 42 110 65 150 65 C 190 65 208 42 222 45 C 235 48 230 70 215 90 C 248 125 252 230 230 280 C 210 310 90 310 70 280 C 48 230 52 125 85 90 Z" 
              fill="url(#bodyGrad)"
              filter="url(#softShadow)"
            />

            {/* ท้องสีชมพูอ่อน */}
            <path d="M 85 170 C 85 125 215 125 215 170 C 218 245 195 292 150 292 C 105 292 82 245 85 170 Z" fill="#ffe4e6"/>
            
            {/* แก้มชมพู */}
            <ellipse cx="114" cy="204" rx="13" ry="7" fill="#fda4af" opacity="0.6"/>
            <ellipse cx="186" cy="204" rx="13" ry="7" fill="#fda4af" opacity="0.6"/>

            {/* ลายเกล็ดขน 3 จุดที่หน้าท้อง */}
            <path d="M 136 248 Q 150 256 164 248" stroke="#f43f5e" strokeWidth="4" strokeLinecap="round" fill="none"/>
            <path d="M 125 266 Q 138 274 150 266" stroke="#f43f5e" strokeWidth="4" strokeLinecap="round" fill="none"/>
            <path d="M 150 266 Q 162 274 175 266" stroke="#f43f5e" strokeWidth="4" strokeLinecap="round" fill="none"/>

            {/* ตาขาวทั้งสองข้าง */}
            <circle cx="112" cy="172" r="33" fill="#ffffff"/>
            <circle cx="188" cy="172" r="33" fill="#ffffff"/>

            {/* ตาซ้าย (ปกติ) */}
            <g id="leftEyeGroup">
              <circle cx="115" cy="172" r="21" fill="#1e1b4b"/>
              <circle cx="110" cy="166" r="8" fill="#ffffff"/>
              <circle cx="121" cy="177" r="3.5" fill="#ffffff"/>
            </g>

            {/* ตาขวา (ปกติ) */}
            <g id="rightEyePupil">
              <circle cx="185" cy="172" r="21" fill="#1e1b4b"/>
              <circle cx="180" cy="166" r="8" fill="#ffffff"/>
              <circle cx="191" cy="177" r="3.5" fill="#ffffff"/>
            </g>

            {/* ตาขวาสำหรับ Wink (แก้บั๊ก: เส้นโค้งมนพอดีในกรอบแว่น) */}
            <path id="rightEyeWink" d="M 172 173 Q 188 186 204 173" stroke="#1e1b4b" strokeWidth="6" strokeLinecap="round" fill="none"/>

            {/* กรอบแว่นตา (อยู่เลเยอร์บนตาเสมอ) */}
            <line x1="145" y1="172" x2="155" y2="172" stroke="#1f2937" strokeWidth="6.5" strokeLinecap="round"/>
            <line x1="72" y1="172" x2="80" y2="172" stroke="#1f2937" strokeWidth="6" strokeLinecap="round"/>
            <line x1="220" y1="172" x2="228" y2="172" stroke="#1f2937" strokeWidth="6" strokeLinecap="round"/>
            <circle cx="112" cy="172" r="36" stroke="#1f2937" strokeWidth="6.5" fill="none"/>
            <circle cx="188" cy="172" r="36" stroke="#1f2937" strokeWidth="6.5" fill="none"/>

            {/* จงอยปากสีส้ม */}
            <path d="M 138 170 Q 150 167 162 170 C 164 184 156 206 150 206 C 144 206 136 184 138 170 Z" fill="#ea580c"/>
            <path d="M 140 171 Q 150 169 160 171 C 162 182 155 202 150 202 C 145 202 138 182 140 171 Z" fill="#fb923c"/>

            {/* ปีกขวาสำหรับโบกทักทาย (แก้บั๊ก: ยกชูขึ้นมาด้านข้าง) */}
            <g id="rightWingWave" style={{ display: 'none' }}>
              <path d="M 230 185 C 265 160 280 185 270 215 C 260 230 235 220 225 200 Z" fill="#e11d48"/>
            </g>

            {/* กลุ่มหนังสือ + ปีกกอดหนังสือ (แก้บั๊ก: ปีกประคองหนังสือสมจริง) */}
            <g id="readingBook">
              {/* ปีกซ้ายจับหนังสือ */}
              <path d="M 72 205 C 80 235 110 248 126 244 C 122 232 98 212 85 202 Z" fill="#e11d48"/>
              {/* ปีกขวาจับหนังสือ */}
              <path d="M 228 205 C 220 235 190 248 174 244 C 178 232 202 212 215 202 Z" fill="#e11d48"/>
              {/* สันปกหนังสือ */}
              <path d="M 104 236 L 150 245 L 196 236 L 196 270 L 150 280 L 104 270 Z" fill="#1e3a8a"/>
              {/* หน้ากระดาษซ้าย */}
              <path d="M 106 234 Q 128 238 148 244 L 148 276 Q 128 271 106 266 Z" fill="#f8fafc"/>
              <line x1="114" y1="244" x2="140" y2="249" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="114" y1="254" x2="138" y2="259" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round"/>
              {/* หน้ากระดาษขวา */}
              <path d="M 194 234 Q 172 238 152 244 L 152 276 Q 172 271 194 266 Z" fill="#f1f5f9"/>
              <line x1="186" y1="244" x2="160" y2="249" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="186" y1="254" x2="162" y2="259" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round"/>
              {/* ปลายดินสอ */}
              <path d="M 178 226 L 188 238 L 194 232 L 184 220 Z" fill="#f97316"/>
              <path d="M 174 223 L 178 226 L 184 220 Z" fill="#fde047"/>
            </g>

            {/* หมวกรับปริญญา 3D */}
            <g id="gradCap">
              <ellipse cx="186" cy="67" rx="38" ry="11" fill="#881337" opacity="0.3" transform="rotate(-6 186 67)"/>
              <path d="M 154 62 C 160 80 208 72 214 54 Z" fill="#111827"/>
              <path d="M 124 48 L 180 70 L 240 53 L 240 58 L 180 75 L 124 53 Z" fill="#0F172A"/>
              <path
                d="M 180 26 C 196 30 226 40 238 51 C 240 53 239 55 235 56 L 182 72 C 178 73 174 73 170 71 L 124 52 C 120 50 121 47 125 45 L 172 27 C 175 26 178 26 180 26 Z"
                fill="url(#capTopGradFixed)"
                stroke="#1E293B"
                strokeWidth="1.8"
              />
              <ellipse cx="180" cy="50" rx="4.5" ry="3" fill="#F59E0B" stroke="#B45309" strokeWidth="1.2"/>
              <g className="cap-tassel">
                <path d="M 180 50 C 196 53 214 60 216 68 C 218 73 215 82 214 92" fill="none" stroke="url(#tasselGoldGradFixed)" strokeWidth="3" strokeLinecap="round"/>
                <circle cx="214" cy="92" r="3.2" fill="#D97706"/>
                <path d="M 212 94 C 209 98 207 106 209 116 C 210 118 218 118 219 116 C 221 106 219 98 216 94 Z" fill="url(#tasselGoldGradFixed)" stroke="#B45309" strokeWidth="1"/>
              </g>
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
