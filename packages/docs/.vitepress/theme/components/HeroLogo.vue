<template>
  <svg
    class="image-src ls-hero-logo"
    viewBox="0 0 64 64"
    fill="none"
    role="img"
    aria-label="layerscope"
  >
    <defs>
      <linearGradient
        id="ls-hero-top"
        x1="6"
        y1="6"
        x2="58"
        y2="34"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#00DC82" />
        <stop
          offset="1"
          stop-color="#22D3EE"
        />
      </linearGradient>
    </defs>
    <g class="ls-hero-layer ls-hero-layer-1">
      <path
        d="M6 44 32 58 58 44"
        stroke="#00DC82"
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity=".35"
      />
    </g>
    <g class="ls-hero-layer ls-hero-layer-2">
      <path
        d="M6 32 32 46 58 32"
        stroke="#00DC82"
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity=".6"
      />
    </g>
    <g class="ls-hero-layer ls-hero-layer-3">
      <path
        d="M32 6 58 20 32 34 6 20Z"
        fill="url(#ls-hero-top)"
      />
      <circle
        class="ls-hero-dot"
        cx="32"
        cy="20"
        r="5"
        fill="#fff"
        opacity=".9"
      />
    </g>
  </svg>
</template>
