export function DashboardGraphBackground() {
  return (
    <div aria-hidden="true" className="kendall-graph-background">
      <svg className="kendall-graph-background__map" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <g className="kendall-graph-background__links">
          <path d="M80 160 C220 90 320 190 450 130 S720 90 870 180 1120 270 1340 170" />
          <path d="M120 430 C260 330 390 500 530 395 S760 300 930 420 1160 540 1320 440" />
          <path d="M170 720 C330 610 455 765 610 690 S860 560 1040 675 1210 760 1380 650" />
          <path d="M260 120 C330 265 290 390 430 520 S630 655 690 820" />
          <path d="M650 80 C600 240 760 330 730 485 S840 685 790 840" />
          <path d="M1050 90 C970 235 1125 355 1080 505 S1180 680 1120 850" />
          <path d="M90 255 L320 315 L520 245 L760 300 L990 230 L1300 305" />
          <path d="M150 565 L345 515 L590 590 L820 520 L1070 595 L1345 545" />
        </g>
        <g className="kendall-graph-background__nodes">
          {[
            [80, 160],
            [450, 130],
            [870, 180],
            [1340, 170],
            [120, 430],
            [530, 395],
            [930, 420],
            [1320, 440],
            [170, 720],
            [610, 690],
            [1040, 675],
            [1380, 650],
            [320, 315],
            [760, 300],
            [1070, 595],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.6" />
          ))}
        </g>
        <g className="kendall-graph-background__pulses">
          <circle r="3.2">
            <animateMotion dur="28s" repeatCount="indefinite" path="M80 160 C220 90 320 190 450 130 S720 90 870 180 1120 270 1340 170" />
          </circle>
          <circle r="2.8">
            <animateMotion dur="34s" begin="-9s" repeatCount="indefinite" path="M120 430 C260 330 390 500 530 395 S760 300 930 420 1160 540 1320 440" />
          </circle>
          <circle r="2.8">
            <animateMotion dur="38s" begin="-18s" repeatCount="indefinite" path="M150 565 L345 515 L590 590 L820 520 L1070 595 L1345 545" />
          </circle>
        </g>
      </svg>
    </div>
  );
}
