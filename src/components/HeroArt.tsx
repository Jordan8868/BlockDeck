import React from 'react'

function IsoCube({
  x,
  y,
  s,
  h = 0,
  top = '#c8ff62',
  left = '#3d9e6a',
  right = '#2a7554',
  opacity = 1
}: {
  x: number
  y: number
  s: number
  h?: number
  top?: string
  left?: string
  right?: string
  opacity?: number | string
}): React.JSX.Element {
  return (
    <g opacity={opacity}>
      <path
        d={`M${x} ${y - s / 2} L${x + s} ${y} L${x} ${y + s / 2} L${x - s} ${y} Z`}
        fill={top}
      />
      <path
        d={`M${x - s} ${y} L${x} ${y + s / 2} L${x} ${y + s / 2 + h} L${x - s} ${y + h} Z`}
        fill={left}
      />
      <path
        d={`M${x + s} ${y} L${x} ${y + s / 2} L${x} ${y + s / 2 + h} L${x + s} ${y + h} Z`}
        fill={right}
      />
    </g>
  )
}

export function HeroArt(): React.JSX.Element {
  return (
    <div className="hero-art" aria-hidden>
      <svg viewBox="0 0 620 500" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="ha-sky" cx="0" cy="0" r="1" gradientTransform="translate(430 130) rotate(122) scale(300 250)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7AF7C1" stopOpacity=".28" />
            <stop offset="1" stopColor="#7AF7C1" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ha-sun" cx="0" cy="0" r="1" gradientTransform="translate(469 102) rotate(90) scale(88)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F8FFD2" />
            <stop offset=".45" stopColor="#D6FF8B" />
            <stop offset="1" stopColor="#A6E75B" stopOpacity=".1" />
          </radialGradient>
          <linearGradient id="ha-top" x1="131" y1="245" x2="466" y2="395" gradientUnits="userSpaceOnUse">
            <stop stopColor="#C9FF83" />
            <stop offset=".55" stopColor="#94EE8C" />
            <stop offset="1" stopColor="#5BCB83" />
          </linearGradient>
          <linearGradient id="ha-left" x1="300" y1="410" x2="112" y2="420" gradientUnits="userSpaceOnUse">
            <stop stopColor="#3E9970" />
            <stop offset="1" stopColor="#23624E" />
          </linearGradient>
          <linearGradient id="ha-right" x1="304" y1="410" x2="492" y2="420" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2B7D60" />
            <stop offset="1" stopColor="#174A3D" />
          </linearGradient>
          <linearGradient id="ha-water" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#A0F4FF" />
            <stop offset="1" stopColor="#46C7F7" stopOpacity=".15" />
          </linearGradient>
          <linearGradient id="ha-portal" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#D4B0FF" />
            <stop offset=".6" stopColor="#8A5CFF" />
            <stop offset="1" stopColor="#4A2A9E" />
          </linearGradient>
          <linearGradient id="ha-leaf" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#DCFF9A" />
            <stop offset="1" stopColor="#55B76C" />
          </linearGradient>
          <linearGradient id="ha-trunk" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#A47B53" />
            <stop offset="1" stopColor="#5E402B" />
          </linearGradient>
          <filter id="ha-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="ha-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id="ha-blur">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        <rect width="620" height="500" fill="url(#ha-sky)" />
        <circle cx="469" cy="102" r="96" fill="url(#ha-sun)" opacity=".55" filter="url(#ha-glow)" />
        <circle cx="469" cy="102" r="47" fill="url(#ha-sun)" />
        <circle cx="469" cy="102" r="57" stroke="#E9FFC2" strokeOpacity=".25" strokeDasharray="2 7" />

        <g opacity=".33" fill="#CFF8E6">
          <rect x="72" y="102" width="4" height="4" />
          <rect x="124" y="66" width="3" height="3" />
          <rect x="192" y="104" width="2.5" height="2.5" />
          <rect x="382" y="64" width="3" height="3" />
          <rect x="535" y="188" width="4" height="4" />
          <rect x="83" y="196" width="2" height="2" />
          <rect x="524" y="86" width="2.5" height="2.5" />
          <rect x="245" y="60" width="3" height="3" />
        </g>

        <g className="cloud cloud-a" opacity=".5" fill="#E8FFF4">
          <rect x="85" y="142" width="42" height="8" rx="4" />
          <rect x="103" y="132" width="34" height="8" rx="4" />
          <rect x="121" y="152" width="24" height="7" rx="3.5" />
        </g>
        <g className="cloud cloud-b" opacity=".32" fill="#CFF4FF">
          <rect x="420" y="215" width="56" height="7" rx="3.5" />
          <rect x="440" y="205" width="38" height="7" rx="3.5" />
          <rect x="475" y="225" width="28" height="6" rx="3" />
        </g>

        <g opacity=".22" stroke="#9FF2D0" strokeWidth=".6">
          <path d="M28 420H590" />
          <path d="M55 450H562" />
          <path d="M95 480H520" />
          <path d="M155 510H460" />
          <path d="M300 395V490" />
          <path d="M190 420L300 475L410 420" />
        </g>

        <g className="island-float">
          <ellipse cx="300" cy="476" rx="148" ry="17" fill="#061513" opacity=".55" filter="url(#ha-glow)" />
          <path d="M300 223L490 318L300 413L110 318L300 223Z" fill="url(#ha-top)" />
          <path d="M110 318L300 413V478L110 383V318Z" fill="url(#ha-left)" />
          <path d="M490 318L300 413V478L490 383V318Z" fill="url(#ha-right)" />
          <path opacity=".3" d="M110 337L300 432V445L110 350V337Z" fill="#0B3A2F" />
          <path opacity=".22" d="M490 337L300 432V445L490 350V337Z" fill="#0B3A2F" />
          <path opacity=".26" d="M173 347L300 411V424L173 360V347Z" fill="#A4F4A7" />
          <path opacity=".14" d="M300 411L363 379V392L300 424V411Z" fill="#A4F4A7" />
          <path d="M300 413L338 432L300 451L262 432L300 413Z" fill="#1B5B48" opacity=".65" />

          <path d="M214 302L268 329L214 356L160 329L214 302Z" fill="#5ED8F2" opacity=".85" />
          <path d="M214 312L254 332L214 352L174 332L214 312Z" fill="#9AEEFF" opacity=".55" />
          <path d="M160 329L214 356V376L160 349V329Z" fill="#287E91" />
          <path d="M214 356L268 329V349L214 376V356Z" fill="#1C6479" />
          <path d="M247 359L258 364V420L247 415V359Z" fill="url(#ha-water)" opacity=".8" className="waterfall" />
          <path d="M247 359L258 364V377L247 372V359Z" fill="#DFFEFF" opacity=".65" />

          <IsoCube x={374} y={284} s={28} h={44} top="url(#ha-top)" left="#3B8D62" right="#2A6E50" />
          <IsoCube x={374} y={253} s={25} h={30} top="url(#ha-top)" left="#3B8D62" right="#2A6E50" />
          <path d="M365 253H383V291H365Z" fill="url(#ha-trunk)" />
          <IsoCube x={374} y={236} s={34} top="url(#ha-leaf)" left="#3D9C5C" right="#2F7E4C" />
          <IsoCube x={352} y={250} s={22} top="url(#ha-leaf)" left="#3D9C5C" right="#2F7E4C" />
          <IsoCube x={396} y={250} s={22} top="url(#ha-leaf)" left="#3D9C5C" right="#2F7E4C" />
          <IsoCube x={374} y={221} s={21} top="#E6FFAD" left="#4BB06B" right="#388B56" />

          <g className="portal">
            <ellipse cx="326" cy="328" rx="34" ry="17" fill="#8C68FF" opacity=".24" filter="url(#ha-glow)" />
            <path d="M306 336V302C306 288 317 279 330 279C343 279 354 288 354 302V336" stroke="#2B1B52" strokeWidth="10" strokeLinecap="square" />
            <path d="M306 336V302C306 288 317 279 330 279C343 279 354 288 354 302V336" stroke="#6B4FC9" strokeWidth="4" strokeLinecap="square" opacity=".8" />
            <path d="M312 334V304C312 294 320 287 330 287C340 287 348 294 348 304V334Z" fill="url(#ha-portal)" opacity=".9" />
            <path d="M319 331V306C319 300 324 296 330 296C336 296 341 300 341 306V331Z" fill="#E9DBFF" opacity=".35" />
            <path d="M306 336H354" stroke="#38236B" strokeWidth="8" />
            <g fill="#8F6CFF">
              <rect x="300" y="296" width="3" height="3" />
              <rect x="357" y="312" width="2.5" height="2.5" />
              <rect x="352" y="276" width="2" height="2" />
            </g>
          </g>

          <IsoCube x={267} y={243} s={15} h={8} top="#D8FF9A" left="#4B9F68" right="#367C51" opacity=".9" />
          <IsoCube x={294} y={268} s={11} h={6} top="#D8FF9A" left="#4B9F68" right="#367C51" opacity=".65" />
          <IsoCube x={432} y={318} s={14} h={8} top="#B6F783" left="#3C8D5C" right="#2C6B49" />
          <IsoCube x={453} y={330} s={9} h={5} top="#B6F783" left="#3C8D5C" right="#2C6B49" opacity=".8" />
        </g>

        <g className="float-block float-1">
          <g transform="rotate(-8 110 190)">
            <IsoCube x={108} y={184} s={26} h={20} top="#D6FF97" left="#4AA36C" right="#347B54" />
          </g>
        </g>
        <g className="float-block float-2">
          <IsoCube x={496} y={248} s={18} h={14} top="#9EEBFF" left="#3C9BAF" right="#2A7187" opacity=".9" />
        </g>
        <g className="float-block float-3">
          <IsoCube x={456} y={176} s={11} h={8} top="#E7D8FF" left="#8D6AD8" right="#674BB1" opacity=".85" />
        </g>
        <g className="float-block float-4">
          <IsoCube x={156} y={272} s={8} h={5} top="#FFE6A6" left="#C09748" right="#8D6C31" opacity=".8" />
        </g>
        <g className="float-block float-5">
          <IsoCube x={82} y={320} s={7} h={4} top="#C9FF83" left="#4E9D68" right="#3A7751" opacity=".55" />
        </g>

        <g className="spark spark-a" fill="#D8FF9A">
          <rect x="521" y="302" width="3" height="3" />
        </g>
        <g className="spark spark-b" fill="#A4F8FF">
          <rect x="90" y="240" width="2.5" height="2.5" />
        </g>
      </svg>
      <div className="hero-art-tag">
        <span className="hero-art-tag-dot" />
        <span>WORLD READY</span>
      </div>
      <div className="hero-art-coord">X 128 · Z -64 · OVERWORLD</div>
    </div>
  )
}
